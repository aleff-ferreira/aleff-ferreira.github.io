// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Motor WebGL de relevo científico (PBR + HBAO + batimetria + paralaxe 3D) sincronizado ao mapa SVG.
// Usa o modelo digital de elevação real (Mapzen/AWS Terrarium z=6 → dem_brasil.webp) e cai graciosamente para o SVG se WebGL faltar.
import { conexaoLenta, mapaParaGeo, fmtCoord } from '../util.js';
import { movimentoPausado } from '../constelacao.js';

export { mapaParaGeo, fmtCoord };

const DEM_X0 = -118.0;
const DEM_Y0 = -148.0;
const DEM_SPAN = 1286.0;

function temaEscuro() {
  const t = document.documentElement.dataset.tema;
  return t === 'escuro' || (t !== 'claro' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

const VERT_300 = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_CORPO = `
uniform sampler2D uDemTex;
uniform sampler2D uGeoMask;
uniform sampler2D uChoroTex;

uniform vec2 uCanvas;      // largura, altura CSS do palco
uniform vec4 uVB;          // viewBox atual: x, y, w, h
uniform vec2 uMapWH;       // 1000.0, 1050.1
uniform vec2 uMouse;       // coord do mapa sob o cursor (-9999 se fora)
uniform float uTime;       // segundos
uniform float uDark;       // 1.0 escuro, 0.0 claro
uniform float uTilt;       // 0.0 plano .. 1.0 Relevo 3D
uniform float uSunAz;      // azimute solar em radianos
uniform float uDemReady;   // 1.0 quando dem_brasil.webp carregou
uniform float uShowAL;     // 1.0 destacar Amazônia Legal
uniform float uShowRios;   // 1.0 mostrar hidrografia especular
uniform float uLacunas;    // 1.0 modo lacunas

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * noise2(p);
    p = rot * p * 2.04 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

float decodificarElev(float b) {
  if (b < 0.340) {
    float t = clamp(1.0 - b / 0.340, 0.0, 1.0);
    return -6500.0 * t * t;
  }
  float t = clamp((b - 0.340) / 0.660, 0.0, 1.0);
  return 5800.0 * pow(t, 2.222222);
}

float isolinha(float val, float passo, float largura) {
  float f = abs(fract(val / passo + 0.5) - 0.5);
  float df = fwidth(val / passo);
  return 1.0 - smoothstep(df * 0.45, df * (0.45 + largura), f);
}

void renderizarCena(out vec4 fragColor) {
  // Coordenada CSS exata sincronizada com preserveAspectRatio="xMidYMid meet" do SVG
  float px = vUV.x * uCanvas.x;
  float py = (1.0 - vUV.y) * uCanvas.y;
  float s = min(uCanvas.x / uVB.z, uCanvas.y / uVB.w);
  vec2 off = 0.5 * (uCanvas - uVB.zw * s);
  vec2 mapPos = vec2(uVB.x + (px - off.x) / s, uVB.y + (py - off.y) / s);
  float zoom = uMapWH.x / max(1.0, uVB.z);

  // UV no atlas continental dem_brasil.webp [-118..1168, -148..1138]
  vec2 demUV = (mapPos - vec2(-118.0, -148.0)) / 1286.0;

  // Paralaxe 3D de relevo quando inclinado (ancorada no nível do mar B=0.340 para manter costas exatas)
  if (uTilt > 0.005 && uDemReady > 0.5) {
    vec2 rayStep = vec2(0.0, 0.0115 * uTilt) / 6.0;
    vec2 curUV = demUV;
    for (int i = 0; i < 6; i++) {
      float bSample = SAMPLE2D(uDemTex, clamp(curUV, 0.001, 0.999)).b;
      float hNorm = max(0.0, (bSample - 0.340) / 0.660);
      float targetH = float(i + 1) / 6.0;
      if (hNorm > targetH * 0.55) {
        demUV -= rayStep * hNorm;
      }
      curUV -= rayStep;
    }
  }

  vec4 dem = SAMPLE2D(uDemTex, clamp(demUV, 0.002, 0.998));
  // Transição suave para oceano abissal procedural fora dos limites do atlas [-118..1168, -148..1138] (elimina faixas de borda em telas largas)
  float dentroX = smoothstep(0.004, 0.058, demUV.x) * smoothstep(0.996, 0.942, demUV.x);
  float dentroY = smoothstep(0.004, 0.058, demUV.y) * smoothstep(0.996, 0.942, demUV.y);
  float dentroDEM = dentroX * dentroY;

  vec2 brUV = mapPos / uMapWH;
  float emQuadro = step(0.0, brUV.x) * step(brUV.x, 1.0) * step(0.0, brUV.y) * step(brUV.y, 1.0);
  vec4 geoM = emQuadro > 0.5 ? SAMPLE2D(uGeoMask, brUV) : vec4(0.0);
  vec4 choroM = emQuadro > 0.5 ? SAMPLE2D(uChoroTex, brUV) : vec4(0.0);

  float brasil = geoM.r * emQuadro;
  float alMask = geoM.g * emQuadro;
  float rioMask = geoM.b * emQuadro * uShowRios;
  float choro = choroM.r;
  float selMask = choroM.g;
  float hovMask = choroM.b;

  // Normal 3D e altitude física em metros (com relevo abissal procedural contínuo além do quadro do atlas)
  vec2 nMarProc = vec2(noise2(mapPos * 0.014) - 0.5, noise2(mapPos * 0.014 + vec2(23.4, 11.7)) - 0.5) * 0.16;
  vec2 nxy = uDemReady > 0.5 ? mix(nMarProc, dem.rg * 2.0 - 1.0, dentroDEM) : nMarProc;
  float exagero = mix(0.68, 0.44, clamp((zoom - 1.0) / 8.0, 0.0, 1.0)) * mix(1.0, 0.70, uTilt);
  vec3 N = normalize(vec3(nxy.x, -nxy.y, exagero)); // Y para cima no espaço de luz 3D
  float elevAbissal = -4350.0 + (fbm(mapPos * 0.0075) - 0.5) * 950.0;
  float elev = uDemReady > 0.5 ? mix(elevAbissal, decodificarElev(dem.b), dentroDEM) : (brasil > 0.5 ? 180.0 : elevAbissal);
  float ao = uDemReady > 0.5 ? mix(0.80, clamp((dem.a - 0.52) / 0.48, 0.06, 1.0), dentroDEM) : 0.78;

  // Vetores de iluminação cinematográfica (sol rasante + preenchimento atmosférico + tocha do cursor)
  float sunEl = mix(0.46, 0.36, uTilt);
  vec3 Lsun = normalize(vec3(cos(uSunAz) * cos(sunEl), -sin(uSunAz) * cos(sunEl), sin(sunEl)));
  vec3 Lfill = normalize(vec3(-Lsun.x * 0.7, -Lsun.y * 0.7, 0.78));
  vec3 V = normalize(vec3(0.0, -0.32 * uTilt, 1.0));

  float diff = max(dot(N, Lsun), 0.0);
  float fill = max(dot(N, Lfill), 0.0);
  float slope = clamp(1.0 - N.z, 0.0, 1.0);
  float rim = pow(slope, 1.85) * max(dot(normalize(vec3(N.xy, 0.001)), - normalize(vec3(Lsun.xy, 0.001))), 0.0);

  // Luz interativa sob o cursor no terreno 3D
  float torch = 0.0;
  if (uMouse.x > -2000.0) {
    vec3 dCursor = vec3(uMouse.x - mapPos.x, -(uMouse.y - mapPos.y), 95.0 / sqrt(max(zoom, 1.0)));
    float dist2 = dot(dCursor, dCursor);
    vec3 Lcur = normalize(dCursor);
    float att = 1.0 / (1.0 + dist2 / (18000.0 / max(zoom, 0.8)));
    torch = max(dot(N, Lcur), 0.0) * att;
  }

  float mar = smoothstep(8.0, -14.0, elev) * (1.0 - brasil * 0.96);

  // ─── 1. BATIMETRIA OCEÂNICA (Atlântico Sul & Pacífico) ───
  float prof = clamp(-elev / 5400.0, 0.0, 1.0);
  float plat = exp(-max(-elev, 0.0) / 230.0); // plataforma continental rasa (< 250 m)

  vec3 marEscuro = mix(vec3(0.045, 0.145, 0.190), vec3(0.014, 0.032, 0.048), pow(prof, 0.62));
  marEscuro += vec3(0.030, 0.140, 0.165) * plat * 0.65;
  vec3 marClaro = mix(vec3(0.745, 0.842, 0.858), vec3(0.615, 0.730, 0.768), pow(prof, 0.68));
  marClaro += vec3(0.055, 0.075, 0.065) * plat * 0.55;
  vec3 corMar = mix(marClaro, marEscuro, uDark);

  // Relevo submarino sutil (dorsais, cânions amazônicos e talude continental)
  float sombraMar = (diff * 0.42 + fill * 0.25 + 0.52) * mix(0.68, 1.06, ao);
  corMar *= mix(0.92, 1.08, sombraMar - 0.5);

  // Isóbatas científicas (-200 m quebra da plataforma, -1000 m, -2500 m, -4000 m)
  float iso200 = smoothstep(42.0, 0.0, abs(elev + 200.0) / max(1.0, fwidth(elev) * 0.9));
  float isoMil = isolinha(-elev, 1250.0, 1.1) * smoothstep(260.0, 650.0, -elev);
  vec3 corIso = mix(vec3(0.18, 0.40, 0.46), vec3(0.14, 0.46, 0.56), uDark);
  corMar = mix(corMar, corIso, clamp(iso200 * 0.34 + isoMil * 0.18, 0.0, 0.45));

  // Brilho especular oceânico + espuma costeira sutil
  vec3 Hsun = normalize(Lsun + V);
  float specMar = pow(max(dot(N, Hsun), 0.0), 36.0);
  float ond = noise2(mapPos * 0.08 + vec2(uTime * 0.09, -uTime * 0.05));
  corMar += mix(vec3(0.12, 0.14, 0.12), vec3(0.06, 0.20, 0.24), uDark) * specMar * (0.45 + 0.35 * ond);

  // ─── 2. CONTEXTO SUL-AMERICANO (Andes, Escudo das Guianas, Gran Chaco) ───
  float hKm = clamp(max(elev, 0.0) / 4800.0, 0.0, 1.0);
  vec3 extEscuro = mix(vec3(0.036, 0.062, 0.054), vec3(0.145, 0.165, 0.168), pow(hKm, 0.62));
  // Picos andinos acima de 3.700 m com rocha fria e neve sutil
  extEscuro = mix(extEscuro, vec3(0.32, 0.36, 0.39), smoothstep(3400.0, 5100.0, elev) * 0.65);

  vec3 extClaro = mix(vec3(0.885, 0.862, 0.812), vec3(0.755, 0.720, 0.658), pow(hKm, 0.62));
  extClaro = mix(extClaro, vec3(0.92, 0.92, 0.91), smoothstep(3600.0, 5200.0, elev) * 0.55);

  float luzExt = (diff * 0.88 + fill * 0.26 + 0.18) * mix(0.34, 1.12, ao);
  vec3 corExt = mix(extClaro * mix(0.74, 1.12, luzExt), extEscuro * (luzExt * 1.28 + 0.12), uDark);
  corExt += mix(vec3(0.08, 0.06, 0.03), vec3(0.04, 0.12, 0.10), uDark) * rim * 0.55;

  // ─── 3. TERRITÓRIO BRASILEIRO: DOSSIÊ TOPOGRÁFICO PBR + RADIÂNCIA COROPLÉTICA ───
  float hBr = clamp(max(elev, 0.0) / 1850.0, 0.0, 1.0);

  // Paleta de dossel esmeralda profundo (sem estourar os tons altos, preservando contraste com rios ciano e siglas)
  vec3 brZeroD = mix(vec3(0.042, 0.095, 0.074), vec3(0.095, 0.145, 0.114), pow(hBr, 0.65));
  vec3 brBaixoD = vec3(0.056, 0.185, 0.132);
  vec3 brMedioD = vec3(0.088, 0.315, 0.218);
  vec3 brAltoD  = vec3(0.128, 0.475, 0.326);
  vec3 brPicoD  = vec3(0.188, 0.655, 0.448);

  vec3 choroEscuro = choro <= 0.01
    ? brZeroD
    : choro < 0.35
      ? mix(brBaixoD, brMedioD, choro / 0.35)
      : choro < 0.72
        ? mix(brMedioD, brAltoD, (choro - 0.35) / 0.37)
        : mix(brAltoD, brPicoD, (choro - 0.72) / 0.28);

  // Matiz mineral quente nas chapadas, tepuis e serras cristalinas (> 650 m)
  vec3 rochaD = vec3(0.285, 0.225, 0.145);
  choroEscuro = mix(choroEscuro, mix(choroEscuro, rochaD, 0.42), smoothstep(520.0, 1620.0, elev) * (0.45 + 0.55 * slope));

  vec3 brZeroL = mix(vec3(0.875, 0.858, 0.806), vec3(0.815, 0.780, 0.708), pow(hBr, 0.65));
  vec3 brBaixoL = vec3(0.755, 0.865, 0.792);
  vec3 brMedioL = vec3(0.455, 0.715, 0.565);
  vec3 brAltoL  = vec3(0.185, 0.515, 0.358);
  vec3 brPicoL  = vec3(0.075, 0.325, 0.215);

  vec3 choroClaro = choro <= 0.01
    ? brZeroL
    : choro < 0.35
      ? mix(brBaixoL, brMedioL, choro / 0.35)
      : choro < 0.72
        ? mix(brMedioL, brAltoL, (choro - 0.35) / 0.37)
        : mix(brAltoL, brPicoL, (choro - 0.72) / 0.28);
  choroClaro = mix(choroClaro, vec3(0.68, 0.58, 0.44), smoothstep(650.0, 1750.0, elev) * 0.28);

  // No modo Lacunas, atenuar a saturação verde para que a grade âmbar 0,5° seja protagonista sobre o relevo 3D
  if (uLacunas > 0.5) {
    choroEscuro = mix(vec3(0.068, 0.112, 0.096), vec3(0.165, 0.205, 0.175), pow(hBr, 0.6));
    choroClaro = mix(vec3(0.885, 0.862, 0.812), vec3(0.760, 0.725, 0.655), pow(hBr, 0.6));
  }

  // Escultura PBR da copa e das serras: difusa solar + céu hemisférico * HBAO + contraluz + tocha
  float sombraBrD = (diff * 1.12 + fill * 0.28 + 0.22) * mix(0.28, 1.18, ao);
  float sombraBrL = mix(0.62, 1.16, (diff * 0.88 + fill * 0.24 + 0.20) * mix(0.46, 1.14, ao));

  vec3 corBrEscuro = choroEscuro * sombraBrD;
  // Subsurface scattering de jade-ouro nas encostas iluminadas de raspão (curva fílmica sem clipe branco)
  corBrEscuro += vec3(0.28, 0.82, 0.56) * choro * pow(diff, 2.4) * 0.26;
  corBrEscuro += vec3(0.98, 0.76, 0.26) * rim * (0.22 + 0.26 * hBr);
  corBrEscuro += vec3(0.20, 0.85, 0.62) * torch * 0.24 + vec3(0.98, 0.75, 0.22) * torch * slope * 0.30;
  corBrEscuro = (corBrEscuro * 1.12) / (vec3(1.0) + corBrEscuro * 0.24);

  vec3 corBrClaro = choroClaro * sombraBrL;
  corBrClaro += vec3(0.24, 0.18, 0.08) * rim * 0.16;
  corBrClaro += vec3(0.16, 0.42, 0.28) * torch * 0.12;

  vec3 corBr = mix(corBrClaro, corBrEscuro, uDark);

  // Recorte suave fora da Amazônia Legal quando a camada Amazônia Legal está ligada
  if (uShowAL > 0.5) {
    float foraAL = 1.0 - smoothstep(0.15, 0.85, alMask);
    vec3 neutroBr = mix(vec3(dot(corBr, vec3(0.32, 0.50, 0.18))) * 0.94, corBr, 0.52);
    corBr = mix(corBr, neutroBr * mix(0.96, 0.72, uDark), foraAL * 0.68);
    // Halo de fronteira da Amazônia Legal
    float bordaAL = smoothstep(0.02, 0.26, alMask) * smoothstep(0.98, 0.68, alMask);
    corBr += mix(vec3(-0.04, 0.06, 0.02), vec3(0.06, 0.28, 0.18), uDark) * bordaAL * 0.75;
  }

  // Realce dourado-esmeralda no estado sob foco ou selecionado
  float realceUF = clamp(hovMask * 0.65 + selMask * 0.95, 0.0, 1.15);
  if (realceUF > 0.005) {
    vec3 luzUF = mix(vec3(0.14, 0.10, 0.01), vec3(0.22, 0.24, 0.08) + corBr * 0.34, uDark);
    corBr += luzUF * realceUF * (0.55 + 0.65 * diff);
  }

  // Curvas de nível hipsométricas de alta precisão ao aproximar (500 m e 250 m)
  if (zoom > 1.55) {
    float opIso = smoothstep(1.55, 3.4, zoom);
    float c500 = isolinha(max(elev, 0.0), 500.0, 1.05) * step(40.0, elev);
    float c200 = zoom > 3.2 ? isolinha(max(elev, 0.0), 200.0, 0.95) * step(30.0, elev) * smoothstep(3.2, 5.5, zoom) : 0.0;
    vec3 corCurva = mix(vec3(0.18, 0.14, 0.08), vec3(0.75, 0.92, 0.82), uDark);
    corBr = mix(corBr, corCurva, clamp(c500 * 0.18 + c200 * 0.10, 0.0, 0.26) * opIso);
  }

  // ─── 4. HIDROGRAFIA ESPECULAR E NEBLINA DE VÁRZEA AMAZÔNICA ───
  if (rioMask > 0.01) {
    float specRio = pow(max(dot(N, Hsun), 0.0), 26.0);
    vec3 aguaRioD = vec3(0.08, 0.66, 0.78) + vec3(0.52, 0.95, 0.98) * specRio * 0.85 + vec3(0.98, 0.80, 0.35) * torch * 0.35;
    vec3 aguaRioL = vec3(0.05, 0.38, 0.46) + vec3(0.35, 0.62, 0.68) * specRio * 0.45;
    corBr = mix(corBr, mix(aguaRioL, aguaRioD, uDark), clamp(rioMask * 0.82, 0.0, 0.88));
  }

  // Neblina atmosférica de várzea nos baixios úmidos da Amazônia (< 155 m)
  float baciaUmida = smoothstep(175.0, 18.0, elev) * step(-2.0, elev) * smoothstep(0.1, 0.8, alMask);
  if (baciaUmida > 0.01) {
    vec2 uvNeb = mapPos * 0.012 + vec2(-uTime * 0.014, uTime * 0.004);
    float neb = fbm(uvNeb) * fbm(uvNeb * 2.1 - vec2(uTime * 0.009, 0.0));
    float dissipaCursor = uMouse.x > -2000.0 ? smoothstep(25.0, 140.0, length(uMouse - mapPos)) : 1.0;
    float intensidadeNeb = smoothstep(0.16, 0.56, neb) * baciaUmida * dissipaCursor * (1.0 - 0.35 * ao);
    vec3 corNeb = mix(vec3(0.95, 0.96, 0.94), vec3(0.42, 0.86, 0.76), uDark);
    corBr = mix(corBr, corNeb, intensidadeNeb * mix(0.14, 0.24, uDark));
  }

  // Combina Oceano + Continente Sul-Americano + Brasil
  vec3 terra = mix(corExt, corBr, smoothstep(0.05, 0.92, brasil));
  vec3 cor = mix(terra, corMar, mar);

  // Halo costeiro sutil onde o continente encontra o Atlântico
  float costa = smoothstep(26.0, 0.0, abs(elev)) * (1.0 - smoothstep(0.0, 0.4, rioMask));
  cor += mix(vec3(-0.03, -0.02, -0.01), vec3(0.04, 0.16, 0.18), uDark) * costa * 0.42;

  // ─── 5. GRATÍCULA DE MERCATOR VERDADEIRA (10° × 10° + EQUADOR 0°) ───
  float lon = mapPos.x / 25.51189364 - 73.9904;
  float mDeg = 5.2766672 - mapPos.y / 25.51189364;
  float lat = (2.0 * atan(exp(radians(mDeg))) - 1.57079632679) * 57.295779513;

  float gLon = isolinha(lon, 10.0, 0.85);
  float gLat = isolinha(lat, 10.0, 0.85);
  float equador = smoothstep(1.35, 0.25, abs(lat) / max(1e-4, fwidth(lat)));
  vec3 corGrade = mix(vec3(0.06, 0.16, 0.12), vec3(0.45, 0.82, 0.68), uDark);
  cor = mix(cor, corGrade, max(gLon, gLat) * mix(0.075, 0.065, uDark));
  cor = mix(cor, mix(vec3(0.08, 0.36, 0.24), vec3(0.25, 0.90, 0.66), uDark), equador * mix(0.18, 0.22, uDark));

  // Vinheta atmosférica sutil de observatório nas bordas da câmera
  vec2 dv = vUV - 0.5;
  float vinheta = 1.0 - dot(dv, dv) * mix(0.22, 0.48, uDark);
  cor *= clamp(vinheta, 0.72, 1.0);

  fragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
}`;

const FRAG_300 = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
#define SAMPLE2D texture
${FRAG_CORPO}
void main() { renderizarCena(outColor); }`;

const VERT_100 = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_100 = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUV;
#define SAMPLE2D texture2D
${FRAG_CORPO}
void main() { renderizarCena(gl_FragColor); }`;

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function criarPrograma(gl, isGL2) {
  const vs = compilar(gl, gl.VERTEX_SHADER, isGL2 ? VERT_300 : VERT_100);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, isGL2 ? FRAG_300 : FRAG_100);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  return p;
}

function criarTexturaLinear(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // 1x1 inicial neutro para evitar avisos antes da textura real subir
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 87, 220]));
  return tex;
}

/** Cria o motor WebGL do relevo científico dentro de .mapa-palco, sincronizado ao viewBox do SVG. */
export function criarTerrenoGL(palco, { W, H, ufs }) {
  const noop = {
    ativo: false,
    setVB() {},
    setCoropletico() {},
    setEstadoFoco() {},
    setCamada() {},
    setInclinado() {},
    setCursor() {},
    girarSol() { return 0; },
    elevacaoEm() { return null; },
    elevacaoMetricaEm() { return null; },
    redesenhar() {},
  };
  if (typeof document === 'undefined' || !palco) return noop;

  const canvas = document.createElement('canvas');
  canvas.className = 'mapa-gl';
  canvas.setAttribute('aria-hidden', 'true');

  let gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  let isGL2 = !!gl;
  if (!gl) {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return noop;
  }

  const prog = criarPrograma(gl, isGL2);
  if (!prog) return noop;
  palco.prepend(canvas);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const locPos = gl.getAttribLocation(prog, 'aPos');

  const U = Object.fromEntries([
    'uDemTex', 'uGeoMask', 'uChoroTex', 'uCanvas', 'uVB', 'uMapWH', 'uMouse',
    'uTime', 'uDark', 'uTilt', 'uSunAz', 'uDemReady', 'uShowAL', 'uShowRios', 'uLacunas',
  ].map((n) => [n, gl.getUniformLocation(prog, n)]));

  const texDem = criarTexturaLinear(gl);
  const texGeo = criarTexturaLinear(gl);
  const texChoro = criarTexturaLinear(gl);

  // Pré-compila Path2D das 27 UFs para máscara territorial e coroplética instantânea (< 0,4 ms)
  const pathsUF = typeof Path2D !== 'undefined'
    ? ufs.map((u) => ({ s: u.s, al: u.al, path: new Path2D(u.d) }))
    : [];

  // 1) Máscara estática territorial + Amazônia Legal + Rios (1024 × 1075)
  const geoCanvas = document.createElement('canvas');
  geoCanvas.width = 1024;
  geoCanvas.height = Math.round(1024 * (H / W));
  const gCtx = geoCanvas.getContext('2d');
  let riosDados = null;

  function subirTexturaCanvas(tex, cnv) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
  }

  function atualizarGeoMask() {
    if (!gCtx || !pathsUF.length) return;
    const sx = geoCanvas.width / W;
    const sy = geoCanvas.height / H;
    gCtx.setTransform(1, 0, 0, 1, 0, 0);
    gCtx.fillStyle = 'rgb(0,0,0)';
    gCtx.fillRect(0, 0, geoCanvas.width, geoCanvas.height);
    gCtx.setTransform(sx, 0, 0, sy, 0, 0);
    gCtx.lineJoin = 'round';
    gCtx.lineCap = 'round';

    // Canal R = Brasil (255), Canal G = Amazônia Legal (255 total, 165 parcial)
    for (const u of pathsUF) {
      const g = u.al === 2 ? 255 : u.al === 1 ? 165 : 0;
      const cor = `rgb(255,${g},0)`;
      gCtx.fillStyle = cor;
      gCtx.strokeStyle = cor;
      gCtx.lineWidth = 1.1;
      gCtx.stroke(u.path);
      gCtx.fill(u.path);
    }

    // Canal B = Hidrografia especular (somar via globalCompositeOperation = 'lighter')
    if (riosDados?.rios?.length) {
      gCtx.save();
      gCtx.globalCompositeOperation = 'lighter';
      for (const r of riosDados.rios) {
        const larg = r.ordem <= 1 ? 3.2 : r.ordem <= 4 ? 2.1 : r.ordem <= 6 ? 1.4 : 0.95;
        gCtx.beginPath();
        for (const t of r.t) {
          for (let i = 0; i < t.length; i++) {
            if (i === 0) gCtx.moveTo(t[i][0], t[i][1]);
            else gCtx.lineTo(t[i][0], t[i][1]);
          }
        }
        gCtx.strokeStyle = 'rgb(0,0,95)';
        gCtx.lineWidth = larg * 2.4;
        gCtx.stroke();
        gCtx.strokeStyle = 'rgb(0,0,185)';
        gCtx.lineWidth = larg;
        gCtx.stroke();
      }
      gCtx.restore();
    }
    subirTexturaCanvas(texGeo, geoCanvas);
  }

  // 2) Textura dinâmica de radiância coroplética + seleção + hover (512 × 538)
  const choroCanvas = document.createElement('canvas');
  choroCanvas.width = 512;
  choroCanvas.height = Math.round(512 * (H / W));
  const cCtx = choroCanvas.getContext('2d');
  let niveisUF = {};
  let ufSel = null;
  let ufHov = null;

  function atualizarChoroTex() {
    if (!cCtx || !pathsUF.length) return;
    const sx = choroCanvas.width / W;
    const sy = choroCanvas.height / H;
    cCtx.setTransform(1, 0, 0, 1, 0, 0);
    cCtx.fillStyle = 'rgb(0,0,0)';
    cCtx.fillRect(0, 0, choroCanvas.width, choroCanvas.height);
    cCtx.setTransform(sx, 0, 0, sy, 0, 0);
    cCtx.lineJoin = 'round';
    cCtx.lineWidth = 1.4;
    for (const u of pathsUF) {
      const r = Math.round(Math.min(1, Math.max(0, niveisUF[u.s] || 0)) * 255);
      const g = u.s === ufSel ? 255 : 0;
      const b = u.s === ufHov ? 255 : 0;
      const cor = `rgb(${r},${g},${b})`;
      cCtx.fillStyle = cor;
      cCtx.strokeStyle = cor;
      cCtx.stroke(u.path);
      cCtx.fill(u.path);
    }
    subirTexturaCanvas(texChoro, choroCanvas);
  }

  // 3) Carregamento sem pré-multiplicação de alfa do DEM científico (dem_brasil.webp) + amostrador de altitude em RAM
  let demReady = 0;
  let demB = null;
  let demW = 0, demH = 0;

  async function carregarDEM() {
    if (conexaoLenta()) return;
    try {
      const resp = await fetch('dados/geo/dem_brasil.webp');
      if (!resp.ok) return;
      const blob = await resp.blob();
      let fonteImg;
      if (typeof createImageBitmap === 'function') {
        fonteImg = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      } else {
        fonteImg = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = URL.createObjectURL(blob);
        });
      }
      demW = fonteImg.width;
      demH = fonteImg.height;
      gl.bindTexture(gl.TEXTURE_2D, texDem);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonteImg);

      // Extrai canal B para telemetria altimétrica/batimétrica exata em metros sob o ponteiro
      const tmp = document.createElement('canvas');
      tmp.width = demW;
      tmp.height = demH;
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      if (tctx) {
        tctx.drawImage(fonteImg, 0, 0);
        const rgba = tctx.getImageData(0, 0, demW, demH).data;
        demB = new Uint8Array(demW * demH);
        for (let i = 0, j = 2; i < demB.length; i++, j += 4) demB[i] = rgba[j];
      }
      if (fonteImg.close) fonteImg.close();
      demReady = 1;
      pedirQuadro();
    } catch { /* fallback gracioso sem interromper o mapa */ }
  }

  /** Retorna a elevação/profundidade física em metros (ex.: +142 ou -2140) na coordenada do mapa. */
  function elevacaoEm(mx, my) {
    if (!demB || !demW || !demH) return null;
    const u = (mx - DEM_X0) / DEM_SPAN;
    const v = (my - DEM_Y0) / DEM_SPAN;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    const ix = Math.min(demW - 1, Math.max(0, Math.floor(u * demW)));
    const iy = Math.min(demH - 1, Math.max(0, Math.floor(v * demH)));
    const b = demB[iy * demW + ix] / 255;
    if (b < 0.340) {
      const t = Math.max(0, Math.min(1, 1 - b / 0.340));
      return Math.round(-6500 * t * t);
    }
    const t = Math.max(0, Math.min(1, (b - 0.340) / 0.660));
    return Math.round(5800 * Math.pow(t, 1 / 0.45));
  }

  // Grade altimétrica sem perdas (1 m de resolução, Mapzen/AWS Terrarium z=6), carregada sob demanda ao passar o cursor
  let altM = null, altW = 0, altH = 0, altTentado = false;
  async function carregarAltimetriaMetrica() {
    if (altTentado || conexaoLenta()) return;
    altTentado = true;
    try {
      const resp = await fetch('dados/geo/altimetria_m.webp');
      if (!resp.ok) return;
      const blob = await resp.blob();
      const bmp = typeof createImageBitmap === 'function'
        ? await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
        : await new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = URL.createObjectURL(blob);
          });
      altW = bmp.width; altH = bmp.height;
      const tmp = document.createElement('canvas');
      tmp.width = altW; tmp.height = altH;
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      if (tctx) {
        tctx.drawImage(bmp, 0, 0);
        const rgba = tctx.getImageData(0, 0, altW, altH).data;
        altM = new Int16Array(altW * altH);
        for (let i = 0, j = 0; i < altM.length; i++, j += 4) {
          altM[i] = (rgba[j] * 256 + rgba[j + 1]) - 11000;
        }
      }
      if (bmp.close) bmp.close();
    } catch { /* fallback silencioso para elevacaoEm */ }
  }

  /** Elevação métrica calibrada (1 m sem perdas) em `altimetria_m.webp`, com fallback imediato para `elevacaoEm`. */
  function elevacaoMetricaEm(mx, my) {
    if (!altTentado) carregarAltimetriaMetrica();
    if (altM && altW && altH) {
      const u = (mx - DEM_X0) / DEM_SPAN;
      const v = (my - DEM_Y0) / DEM_SPAN;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        const ix = Math.min(altW - 1, Math.max(0, Math.floor(u * altW)));
        const iy = Math.min(altH - 1, Math.max(0, Math.floor(v * altH)));
        return altM[iy * altW + ix];
      }
    }
    return elevacaoEm(mx, my);
  }

  // Estado dinâmico dos uniforms
  let vb = { x: 0, y: 0, w: W, h: H };
  let mouse = { x: -9999, y: -9999 };
  let inclinadoAlvo = 0;
  let inclinadoAtual = 0;
  const AZIMUTES = [-2.28, -0.72, 0.85, 2.35]; // Noroeste clássico, Nordeste alvorada, Sudeste zenital, Sudoeste crepúsculo andino
  let idxSol = 0;
  let sunAzAlvo = AZIMUTES[0];
  let sunAzAtual = AZIMUTES[0];
  let showAL = 0;
  let showRios = 0;
  let showLacunas = 0;
  let cssW = 1, cssH = 1;
  let raf = 0;
  let tIni = performance.now();

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, palco.clientWidth || Math.round(palco.getBoundingClientRect().width) || 1);
    cssH = Math.max(1, palco.clientHeight || Math.round(palco.getBoundingClientRect().height) || 1);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
  }

  function desenhar(agora) {
    raf = 0;
    if (!canvas.isConnected) return;
    if (document.hidden || palco.closest('[hidden]')) return;

    redimensionar();
    const pausado = movimentoPausado();
    const dt = pausado ? 1 : 0.14;
    inclinadoAtual += (inclinadoAlvo - inclinadoAtual) * dt;
    if (Math.abs(inclinadoAlvo - inclinadoAtual) < 0.002) inclinadoAtual = inclinadoAlvo;

    let dAz = sunAzAlvo - sunAzAtual;
    if (dAz > Math.PI) dAz -= Math.PI * 2;
    if (dAz < -Math.PI) dAz += Math.PI * 2;
    sunAzAtual += dAz * dt;
    if (Math.abs(dAz) < 0.002) sunAzAtual = sunAzAlvo;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texDem);
    gl.uniform1i(U.uDemTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texGeo);
    gl.uniform1i(U.uGeoMask, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texChoro);
    gl.uniform1i(U.uChoroTex, 2);

    gl.uniform2f(U.uCanvas, cssW, cssH);
    gl.uniform4f(U.uVB, vb.x, vb.y, vb.w, vb.h);
    gl.uniform2f(U.uMapWH, W, H);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uTime, pausado ? 0 : (agora - tIni) * 0.001);
    gl.uniform1f(U.uDark, temaEscuro() ? 1 : 0);
    gl.uniform1f(U.uTilt, inclinadoAtual);
    gl.uniform1f(U.uSunAz, sunAzAtual);
    gl.uniform1f(U.uDemReady, demReady);
    gl.uniform1f(U.uShowAL, showAL);
    gl.uniform1f(U.uShowRios, showRios);
    gl.uniform1f(U.uLacunas, showLacunas);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const animandoTransicao = Math.abs(inclinadoAlvo - inclinadoAtual) > 0.002 || Math.abs(dAz) > 0.002;
    if (!pausado || animandoTransicao) {
      raf = requestAnimationFrame(desenhar);
    }
  }

  function pedirQuadro() {
    if (!raf && canvas.isConnected) raf = requestAnimationFrame(desenhar);
  }

  atualizarGeoMask();
  atualizarChoroTex();
  carregarDEM();
  pedirQuadro();

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(pedirQuadro) : null;
  ro?.observe(palco);
  window.addEventListener('bmb:tema', pedirQuadro);
  window.addEventListener('bmb:movimento', pedirQuadro);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pedirQuadro(); });

  return {
    ativo: true,
    setVB(novoVB) {
      vb = novoVB;
      pedirQuadro();
    },
    setCoropletico(niveis) {
      niveisUF = niveis || {};
      atualizarChoroTex();
      pedirQuadro();
    },
    setEstadoFoco({ selecionada, foco }) {
      let mudou = false;
      if (selecionada !== undefined && selecionada !== ufSel) { ufSel = selecionada; mudou = true; }
      if (foco !== undefined && foco !== ufHov) { ufHov = foco; mudou = true; }
      if (mudou) { atualizarChoroTex(); pedirQuadro(); }
    },
    setCamada(nome, on, dadosExtras) {
      if (nome === 'al') showAL = on ? 1 : 0;
      if (nome === 'lacunas') showLacunas = on ? 1 : 0;
      if (nome === 'rios') {
        showRios = on ? 1 : 0;
        if (dadosExtras && !riosDados) {
          riosDados = dadosExtras;
          atualizarGeoMask();
        }
      }
      pedirQuadro();
    },
    setInclinado(on) {
      inclinadoAlvo = on ? 1 : 0;
      pedirQuadro();
    },
    setCursor(mx, my) {
      mouse = mx == null ? { x: -9999, y: -9999 } : { x: mx, y: my };
      pedirQuadro();
    },
    girarSol() {
      idxSol = (idxSol + 1) % AZIMUTES.length;
      sunAzAlvo = AZIMUTES[idxSol];
      pedirQuadro();
      return idxSol;
    },
    elevacaoEm,
    elevacaoMetricaEm,
    redesenhar: pedirQuadro,
  };
}
