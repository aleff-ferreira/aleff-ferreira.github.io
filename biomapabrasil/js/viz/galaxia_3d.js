// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Motor WebGL da vista 3D do espaço químico (`#/galaxia`): nuvem de pontos (gl.POINTS) para as moléculas e
// linhas (gl.LINES) para as arestas de similaridade TMAP, com eixo vertical configurável (Fsp³, cLogP, massa ou
// nenhum), câmera orbital (órbita, deslocamento, zoom, teclado) e seleção de pontos calculada na CPU.
import { tr } from '../util.js';
import { movimentoPausado } from '../constelacao.js';

// Utilitários de matriz 4x4 em ordem column-major pura (sem bibliotecas externas)
function mat4Identity(out) {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

function mat4Perspective(out, fovRad, aspect, near, far) {
  out.fill(0);
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1.0 / (near - far);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = (2.0 * far * near) * nf;
  return out;
}

function mat4LookAt(out, eye, center, up) {
  const eyex = eye[0], eyey = eye[1], eyez = eye[2];
  const cx = center[0], cy = center[1], cz = center[2];
  const upx = up[0], upy = up[1], upz = up[2];

  let z0 = eyex - cx, z1 = eyey - cy, z2 = eyez - cz;
  let len = Math.hypot(z0, z1, z2);
  if (len === 0) { z2 = 1; len = 1; }
  z0 /= len; z1 /= len; z2 /= len;

  let x0 = upy * z2 - upz * z1;
  let x1 = upz * z0 - upx * z2;
  let x2 = upx * z1 - upy * z0;
  len = Math.hypot(x0, x1, x2);
  if (len === 0) { x0 = 1; len = 1; }
  x0 /= len; x1 /= len; x2 /= len;

  let y0 = z1 * x2 - z2 * x1;
  let y1 = z2 * x0 - z0 * x2;
  let y2 = z0 * x1 - z1 * x0;

  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  out[15] = 1;
  return out;
}

function mat4Multiply(out, a, b) {
  const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  const b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
  const b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11];
  const b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];

  for (let i = 0; i < 4; i++) {
    const ai0 = a[i], ai1 = a[i + 4], ai2 = a[i + 8], ai3 = a[i + 12];
    out[i] = ai0 * b0 + ai1 * b1 + ai2 * b2 + ai3 * b3;
    out[i + 4] = ai0 * b4 + ai1 * b5 + ai2 * b6 + ai3 * b7;
    out[i + 8] = ai0 * b8 + ai1 * b9 + ai2 * b10 + ai3 * b11;
    out[i + 12] = ai0 * b12 + ai1 * b13 + ai2 * b14 + ai3 * b15;
  }
  return out;
}

// Dispersão determinística do modo sem variável no eixo vertical
function hashInt(n) {
  let h = ((n * 2654435761) ^ (n >>> 13)) >>> 0;
  h = (h * 2246822519) >>> 0;
  return (h & 0xffff) / 65535.0; // [0..1]
}

function temaClaro() {
  return document.documentElement.dataset.tema === 'claro';
}

// --- SHADERS WEBGL 2 (GLSL 300 es) ---
const VS_PONTOS_300 = `#version 300 es
layout(location = 0) in vec2 aBaseXZ;
layout(location = 1) in vec4 aZModes;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec2 aAttrs; // x = visivel (1.0/0.0), y = destaque (1.0/0.0)

uniform mat4 uMVP;
uniform vec4 uZWeights;
uniform float uPixelRatio;
uniform float uPointSizeBase;

out vec3 vColor;
out float vVisible;
out float vHighlight;
out float vDist;

void main() {
  vVisible = aAttrs.x;
  vHighlight = aAttrs.y;
  vColor = aColor;

  if (vVisible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  float yElev = dot(aZModes, uZWeights);
  vec4 worldPos = vec4(aBaseXZ.x, yElev, aBaseXZ.y, 1.0);
  vec4 clipPos = uMVP * worldPos;
  gl_Position = clipPos;

  float dist = max(clipPos.w, 0.1);
  vDist = dist;

  float base = uPointSizeBase * (vHighlight > 0.5 ? 1.65 : 1.0);
  float sz = (base * 980.0) / dist;
  gl_PointSize = clamp(sz * uPixelRatio, 2.5 * uPixelRatio, 34.0 * uPixelRatio);
}`;

const FS_PONTOS_300 = `#version 300 es
precision highp float;

in vec3 vColor;
in float vVisible;
in float vHighlight;
in float vDist;

uniform float uDark;

out vec4 fragColor;

void main() {
  if (vVisible < 0.5) discard;

  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist2 = dot(coord, coord);
  if (dist2 > 0.25) discard;

  float d = sqrt(dist2) * 2.0;
  float edgeAlpha = 1.0 - smoothstep(0.72, 1.0, d);

  vec3 rgb = vColor;
  float alpha = edgeAlpha;

  if (vHighlight > 0.5) {
    float halo = max(0.0, 1.0 - d);
    rgb = mix(rgb, vec3(1.0, 0.96, 0.76), halo * 0.48);
    alpha = mix(alpha, 1.0, 0.35);
  } else {
    float shade = 1.0 - d * 0.26;
    rgb *= shade;
  }

  float depthFade = clamp(1.0 - (vDist - 2.0) * 0.065, 0.42, 1.0);
  alpha *= depthFade;

  fragColor = vec4(rgb, alpha * (uDark > 0.5 ? 0.96 : 0.88));
}`;

const VS_LINHAS_300 = `#version 300 es
layout(location = 0) in vec2 aBaseXZ;
layout(location = 1) in vec4 aZModes;
layout(location = 2) in vec2 aLineMeta; // x = similaridade [0..1], y = visivel [0..1]

uniform mat4 uMVP;
uniform vec4 uZWeights;

out float vSimilarity;
out float vVisible;
out float vDist;

void main() {
  vSimilarity = aLineMeta.x;
  vVisible = aLineMeta.y;

  if (vVisible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float yElev = dot(aZModes, uZWeights);
  vec4 worldPos = vec4(aBaseXZ.x, yElev, aBaseXZ.y, 1.0);
  vec4 clipPos = uMVP * worldPos;
  gl_Position = clipPos;
  vDist = max(clipPos.w, 0.1);
}`;

const FS_LINHAS_300 = `#version 300 es
precision highp float;

in float vSimilarity;
in float vVisible;
in float vDist;

uniform float uDark;

out vec4 fragColor;

void main() {
  if (vVisible < 0.5) discard;

  vec3 rgb = uDark > 0.5 ? vec3(0.18, 0.83, 0.75) : vec3(0.05, 0.42, 0.32);
  float alphaBase = (uDark > 0.5 ? 0.22 : 0.25) * clamp(vSimilarity * 1.25, 0.3, 1.0);
  float depthFade = clamp(1.0 - (vDist - 2.0) * 0.09, 0.18, 1.0);

  fragColor = vec4(rgb, alphaBase * depthFade);
}`;

// --- SHADERS WEBGL 1 FALLBACK (GLSL 100) ---
const VS_PONTOS_100 = `
attribute vec2 aBaseXZ;
attribute vec4 aZModes;
attribute vec3 aColor;
attribute vec2 aAttrs;

uniform mat4 uMVP;
uniform vec4 uZWeights;
uniform float uPixelRatio;
uniform float uPointSizeBase;

varying vec3 vColor;
varying float vVisible;
varying float vHighlight;
varying float vDist;

void main() {
  vVisible = aAttrs.x;
  vHighlight = aAttrs.y;
  vColor = aColor;

  if (vVisible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  float yElev = dot(aZModes, uZWeights);
  vec4 worldPos = vec4(aBaseXZ.x, yElev, aBaseXZ.y, 1.0);
  vec4 clipPos = uMVP * worldPos;
  gl_Position = clipPos;

  float dist = max(clipPos.w, 0.1);
  vDist = dist;

  float base = uPointSizeBase * (vHighlight > 0.5 ? 1.65 : 1.0);
  float sz = (base * 980.0) / dist;
  gl_PointSize = clamp(sz * uPixelRatio, 2.5 * uPixelRatio, 34.0 * uPixelRatio);
}`;

const FS_PONTOS_100 = `
precision highp float;

varying vec3 vColor;
varying float vVisible;
varying float vHighlight;
varying float vDist;

uniform float uDark;

void main() {
  if (vVisible < 0.5) discard;

  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist2 = dot(coord, coord);
  if (dist2 > 0.25) discard;

  float d = sqrt(dist2) * 2.0;
  float edgeAlpha = 1.0 - smoothstep(0.72, 1.0, d);

  vec3 rgb = vColor;
  float alpha = edgeAlpha;

  if (vHighlight > 0.5) {
    float halo = max(0.0, 1.0 - d);
    rgb = mix(rgb, vec3(1.0, 0.96, 0.76), halo * 0.48);
    alpha = mix(alpha, 1.0, 0.35);
  } else {
    float shade = 1.0 - d * 0.26;
    rgb *= shade;
  }

  float depthFade = clamp(1.0 - (vDist - 2.0) * 0.065, 0.42, 1.0);
  alpha *= depthFade;

  gl_FragColor = vec4(rgb, alpha * (uDark > 0.5 ? 0.96 : 0.88));
}`;

const VS_LINHAS_100 = `
attribute vec2 aBaseXZ;
attribute vec4 aZModes;
attribute vec2 aLineMeta;

uniform mat4 uMVP;
uniform vec4 uZWeights;

varying float vSimilarity;
varying float vVisible;
varying float vDist;

void main() {
  vSimilarity = aLineMeta.x;
  vVisible = aLineMeta.y;

  if (vVisible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float yElev = dot(aZModes, uZWeights);
  vec4 worldPos = vec4(aBaseXZ.x, yElev, aBaseXZ.y, 1.0);
  vec4 clipPos = uMVP * worldPos;
  gl_Position = clipPos;
  vDist = max(clipPos.w, 0.1);
}`;

const FS_LINHAS_100 = `
precision highp float;

varying float vSimilarity;
varying float vVisible;
varying float vDist;

uniform float uDark;

void main() {
  if (vVisible < 0.5) discard;

  vec3 rgb = uDark > 0.5 ? vec3(0.18, 0.83, 0.75) : vec3(0.05, 0.42, 0.32);
  float alphaBase = (uDark > 0.5 ? 0.22 : 0.25) * clamp(vSimilarity * 1.25, 0.3, 1.0);
  float depthFade = clamp(1.0 - (vDist - 2.0) * 0.09, 0.18, 1.0);

  gl_FragColor = vec4(rgb, alphaBase * depthFade);
}`;

function compilarShader(gl, tipo, fonte) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('shader WebGL:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function criarPrograma(gl, vsFonte, fsFonte) {
  const vs = compilarShader(gl, gl.VERTEX_SHADER, vsFonte);
  const fs = compilarShader(gl, gl.FRAGMENT_SHADER, fsFonte);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('programa WebGL:', gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

/**
 * Cria o motor WebGL da vista 3D do espaço químico.
 * @param {HTMLElement} container Contêiner DOM hospedeiro (#gx-wrap)
 * @param {Object} opcoes Configurações e dados do espaço químico
 */
export function criarGalaxia3D(container, opcoes = {}) {
  const {
    nos = [],
    arestas = [],
    ix = {},
    onHover = null,
    onUnhover = null,
    onClick = null,
    inicialZ = 'fsp3',
  } = opcoes;

  const nNos = nos.length;
  const nArestas = arestas.length;

  const canvas = document.createElement('canvas');
  canvas.id = 'gx-cv-3d';
  canvas.className = 'gx-cv-3d';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    tr('Espaço químico em 3D. Arrastar gira; Shift e arrastar deslocam; a roda do mouse aproxima; a tecla 0 recentra; um clique em um ponto abre a molécula.')
  );
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const refDica = container.querySelector('#gx-dica');
  if (refDica) container.insertBefore(canvas, refDica);
  else container.appendChild(canvas);

  let gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
  });
  let isGL2 = Boolean(gl);
  if (!gl) {
    gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
    });
  }

  // Fallback caso WebGL esteja desabilitado
  if (!gl) {
    canvas.remove();
    return {
      ativo: false,
      atualizarMascara() {},
      atualizarCores() {},
      definirEixoZ() {},
      obterModoZ() { return inicialZ; },
      alternarFilamentos() {},
      resetarCamera() {},
      aproximar() {},
      focarMolecula() {},
      redimensionar() {},
      pedirQuadro() {},
      destruir() {},
      obterCanvas() { return null; },
    };
  }

  // Compilação dos programas de shaders
  const progPontos = criarPrograma(gl, isGL2 ? VS_PONTOS_300 : VS_PONTOS_100, isGL2 ? FS_PONTOS_300 : FS_PONTOS_100);
  const progLinhas = criarPrograma(gl, isGL2 ? VS_LINHAS_300 : VS_LINHAS_100, isGL2 ? FS_LINHAS_300 : FS_LINHAS_100);

  if (!progPontos || !progLinhas) {
    canvas.remove();
    return null;
  }

  // Localizações de atributos e uniformes para pontos
  const locPt = {
    aBaseXZ: gl.getAttribLocation(progPontos, 'aBaseXZ'),
    aZModes: gl.getAttribLocation(progPontos, 'aZModes'),
    aColor: gl.getAttribLocation(progPontos, 'aColor'),
    aAttrs: gl.getAttribLocation(progPontos, 'aAttrs'),
    uMVP: gl.getUniformLocation(progPontos, 'uMVP'),
    uZWeights: gl.getUniformLocation(progPontos, 'uZWeights'),
    uPixelRatio: gl.getUniformLocation(progPontos, 'uPixelRatio'),
    uPointSizeBase: gl.getUniformLocation(progPontos, 'uPointSizeBase'),
    uDark: gl.getUniformLocation(progPontos, 'uDark'),
  };

  // Localizações de atributos e uniformes para linhas
  const locLn = {
    aBaseXZ: gl.getAttribLocation(progLinhas, 'aBaseXZ'),
    aZModes: gl.getAttribLocation(progLinhas, 'aZModes'),
    aLineMeta: gl.getAttribLocation(progLinhas, 'aLineMeta'),
    uMVP: gl.getUniformLocation(progLinhas, 'uMVP'),
    uZWeights: gl.getUniformLocation(progLinhas, 'uZWeights'),
    uDark: gl.getUniformLocation(progLinhas, 'uDark'),
  };

  // Geometria dos nós (uma molécula por ponto)
  const baseXZ = new Float32Array(nNos * 2);
  const zModes = new Float32Array(nNos * 4);
  const ptColors = new Float32Array(nNos * 3);
  const ptAttrs = new Float32Array(nNos * 2); // [visivel, destaque]
  const maskVisivel = new Uint8Array(nNos);
  maskVisivel.fill(1);

  // Buffers para raycasting CPU
  const screenCoords = new Float32Array(nNos * 2);
  const screenDepth = new Float32Array(nNos);

  for (let i = 0; i < nNos; i++) {
    const m = nos[i];
    const rawX = m[ix.x] || 0;
    const rawY = m[ix.y] || 0;
    // Posição horizontal no plano XZ
    const x = rawX * 1.65;
    const z = -rawY * 1.65;
    baseXZ[i * 2] = x;
    baseXZ[i * 2 + 1] = z;

    // Modo 0: Fsp³ (0.0 .. 1.0)
    const fsp3 = typeof m[ix.fsp3] === 'number' ? m[ix.fsp3] : 0.5;
    const z0 = (fsp3 - 0.5) * 1.35;

    // Modo 1: cLogP (-3 .. +9) -> Lipofilicidade
    const clogp = typeof m[ix.clogp] === 'number' ? m[ix.clogp] : 3.0;
    const clogpNorm = (Math.max(-3.0, Math.min(9.0, clogp)) - 3.0) / 6.0;
    const z1 = clogpNorm * 0.95;

    // Modo 2: MW (150 .. 950 Da) -> Massa Molecular
    const mw = typeof m[ix.mw] === 'number' ? m[ix.mw] : 450.0;
    const mwNorm = (Math.max(150.0, Math.min(950.0, mw)) - 550.0) / 400.0;
    const z2 = mwNorm * 0.95;

    // Modo 3: sem variável (domo decorativo)
    const distPlano = Math.hypot(x, z);
    const id = m[ix.id] || i;
    const bulge = 0.88 * Math.exp(-(distPlano * distPlano) / 0.26);
    const disp = (hashInt(id) - 0.5) * 0.26;
    const z3 = bulge + disp - 0.16;

    zModes[i * 4] = z0;
    zModes[i * 4 + 1] = z1;
    zModes[i * 4 + 2] = z2;
    zModes[i * 4 + 3] = z3;

    // Cores iniciais padrão verde esmeralda
    ptColors[i * 3] = 0.20;
    ptColors[i * 3 + 1] = 0.83;
    ptColors[i * 3 + 2] = 0.60;

    // Destaque de potência ou aprovação clínica (halo dourado)
    const pch = m[ix.max_pch];
    const fase = m[ix.fase] || 0;
    const destaque = (pch != null && pch >= 7.5) || fase >= 4;

    ptAttrs[i * 2] = 1.0; // visivel
    ptAttrs[i * 2 + 1] = destaque ? 1.0 : 0.0;
  }

  // Criação dos VBOs de pontos
  const bufPtBaseXZ = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPtBaseXZ);
  gl.bufferData(gl.ARRAY_BUFFER, baseXZ, gl.STATIC_DRAW);

  const bufPtZModes = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPtZModes);
  gl.bufferData(gl.ARRAY_BUFFER, zModes, gl.STATIC_DRAW);

  const bufPtColor = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPtColor);
  gl.bufferData(gl.ARRAY_BUFFER, ptColors, gl.DYNAMIC_DRAW);

  const bufPtAttrs = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPtAttrs);
  gl.bufferData(gl.ARRAY_BUFFER, ptAttrs, gl.DYNAMIC_DRAW);

  // Geometria das arestas TMAP (dois vértices por aresta)
  const nLineVerts = nArestas * 2;
  const lineBaseXZ = new Float32Array(nLineVerts * 2);
  const lineZModes = new Float32Array(nLineVerts * 4);
  const lineMeta = new Float32Array(nLineVerts * 2); // [similaridade, visivel]

  for (let e = 0; e < nArestas; e++) {
    const [src, tgt, sim] = arestas[e];
    const s = typeof sim === 'number' ? sim : 0.5;

    // Vértice 0 (origem)
    lineBaseXZ[e * 4] = baseXZ[src * 2];
    lineBaseXZ[e * 4 + 1] = baseXZ[src * 2 + 1];
    lineZModes[e * 8] = zModes[src * 4];
    lineZModes[e * 8 + 1] = zModes[src * 4 + 1];
    lineZModes[e * 8 + 2] = zModes[src * 4 + 2];
    lineZModes[e * 8 + 3] = zModes[src * 4 + 3];
    lineMeta[e * 4] = s;
    lineMeta[e * 4 + 1] = 1.0;

    // Vértice 1 (destino)
    lineBaseXZ[e * 4 + 2] = baseXZ[tgt * 2];
    lineBaseXZ[e * 4 + 3] = baseXZ[tgt * 2 + 1];
    lineZModes[e * 8 + 4] = zModes[tgt * 4];
    lineZModes[e * 8 + 5] = zModes[tgt * 4 + 1];
    lineZModes[e * 8 + 6] = zModes[tgt * 4 + 2];
    lineZModes[e * 8 + 7] = zModes[tgt * 4 + 3];
    lineMeta[e * 4 + 2] = s;
    lineMeta[e * 4 + 3] = 1.0;
  }

  const bufLnBaseXZ = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufLnBaseXZ);
  gl.bufferData(gl.ARRAY_BUFFER, lineBaseXZ, gl.STATIC_DRAW);

  const bufLnZModes = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufLnZModes);
  gl.bufferData(gl.ARRAY_BUFFER, lineZModes, gl.STATIC_DRAW);

  const bufLnMeta = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufLnMeta);
  gl.bufferData(gl.ARRAY_BUFFER, lineMeta, gl.DYNAMIC_DRAW);

  // Estado dinâmico da câmera esférica
  let rAtual = 3.45, rAlvo = 3.45;
  let thetaAtual = 0.52, thetaAlvo = 0.52;
  let phiAtual = 0.56, phiAlvo = 0.56;
  const targetAtual = [0, 0, 0];
  const targetAlvo = [0, 0, 0];

  // Pesos dos 4 modos de elevação Z [fsp3, clogp, mw, domo]
  const pesosZAlvo = [1, 0, 0, 0];
  const pesosZAtual = [1, 0, 0, 0];
  let modoZAtivo = 'fsp3';

  function aplicarModoZ(modo) {
    modoZAtivo = modo;
    if (modo === 'clogp') pesosZAlvo.splice(0, 4, 0, 1, 0, 0);
    else if (modo === 'mw') pesosZAlvo.splice(0, 4, 0, 0, 1, 0);
    else if (modo === 'domo') pesosZAlvo.splice(0, 4, 0, 0, 0, 1);
    else pesosZAlvo.splice(0, 4, 1, 0, 0, 0); // fsp3 padrão
  }
  aplicarModoZ(inicialZ);

  let mostrarFilamentos = true;
  let focoIdx = -1;
  let raf = 0;
  let cssW = 1, cssH = 1;

  // Matrizes e vetores de transformação reutilizáveis (Zero GC Allocations)
  const matProj = new Float32Array(16);
  const matView = new Float32Array(16);
  const matMVP = new Float32Array(16);
  const vecEye = new Float32Array(3);
  const vecUp = new Float32Array([0, 1, 0]);

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(200, container.clientWidth || 640);
    cssH = Math.max(200, container.clientHeight || 480);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
  }

  function recalcularProjecaoTela() {
    const hw = cssW * 0.5;
    const hh = cssH * 0.5;
    const m = matMVP;
    const w0 = pesosZAtual[0], w1 = pesosZAtual[1], w2 = pesosZAtual[2], w3 = pesosZAtual[3];

    for (let i = 0; i < nNos; i++) {
      if (!maskVisivel[i]) {
        screenCoords[i * 2] = -9999;
        screenCoords[i * 2 + 1] = -9999;
        continue;
      }
      const x = baseXZ[i * 2];
      const z = baseXZ[i * 2 + 1];
      const y = zModes[i * 4] * w0 + zModes[i * 4 + 1] * w1 + zModes[i * 4 + 2] * w2 + zModes[i * 4 + 3] * w3;

      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0.05) {
        screenCoords[i * 2] = -9999;
        screenCoords[i * 2 + 1] = -9999;
        continue;
      }
      const invW = 1.0 / cw;
      const ndcX = (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW;
      const ndcY = (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW;

      screenCoords[i * 2] = hw + ndcX * hw;
      screenCoords[i * 2 + 1] = hh - ndcY * hh;
      screenDepth[i] = cw;
    }
  }

  function desenhar() {
    raf = 0;
    if (!canvas.isConnected || document.hidden || container.closest('[hidden]') || canvas.style.display === 'none') return;

    redimensionar();
    const pausado = movimentoPausado();
    const dt = pausado ? 1.0 : 0.14;

    // Rotação lenta quando não há interação e o movimento não está pausado
    if (!arrasto && focoIdx < 0 && !pausado) {
      thetaAlvo += 0.0007;
    }

    // Amortecimento de inércia da câmera orbital
    rAtual += (rAlvo - rAtual) * dt;
    thetaAtual += (thetaAlvo - thetaAtual) * dt;
    phiAtual += (phiAlvo - phiAtual) * dt;
    targetAtual[0] += (targetAlvo[0] - targetAtual[0]) * dt;
    targetAtual[1] += (targetAlvo[1] - targetAtual[1]) * dt;
    targetAtual[2] += (targetAlvo[2] - targetAtual[2]) * dt;

    // Interpolação suave dos pesos de elevação Z
    let morphandoZ = false;
    for (let k = 0; k < 4; k++) {
      const diff = pesosZAlvo[k] - pesosZAtual[k];
      if (Math.abs(diff) > 0.001) {
        pesosZAtual[k] += diff * (pausado ? 1.0 : 0.12);
        morphandoZ = true;
      } else {
        pesosZAtual[k] = pesosZAlvo[k];
      }
    }

    // Cálculo das coordenadas esféricas da posição dos olhos (Zero GC Allocations)
    const cosPhi = Math.cos(phiAtual);
    vecEye[0] = targetAtual[0] + rAtual * cosPhi * Math.sin(thetaAtual);
    vecEye[1] = targetAtual[1] + rAtual * Math.sin(phiAtual);
    vecEye[2] = targetAtual[2] + rAtual * cosPhi * Math.cos(thetaAtual);

    const aspect = Math.max(0.1, canvas.width / canvas.height);
    mat4Perspective(matProj, 45 * (Math.PI / 180), aspect, 0.1, 80.0);
    mat4LookAt(matView, vecEye, targetAtual, vecUp);
    mat4Multiply(matMVP, matProj, matView);

    // Atualiza projeção em coordenadas de tela para hover imediato
    recalcularProjecaoTela();

    // Renderização WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    const claro = temaClaro();
    if (claro) gl.clearColor(0.957, 0.941, 0.902, 1.0); // #f4f0e6
    else gl.clearColor(0.0196, 0.047, 0.035, 1.0);      // #050c09

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 1. Desenho dos Filamentos TMAP (gl.LINES)
    if (mostrarFilamentos && nArestas > 0) {
      gl.depthMask(false);
      gl.useProgram(progLinhas);

      gl.uniformMatrix4fv(locLn.uMVP, false, matMVP);
      gl.uniform4fv(locLn.uZWeights, pesosZAtual);
      gl.uniform1f(locLn.uDark, claro ? 0.0 : 1.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufLnBaseXZ);
      gl.enableVertexAttribArray(locLn.aBaseXZ);
      gl.vertexAttribPointer(locLn.aBaseXZ, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufLnZModes);
      gl.enableVertexAttribArray(locLn.aZModes);
      gl.vertexAttribPointer(locLn.aZModes, 4, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufLnMeta);
      gl.enableVertexAttribArray(locLn.aLineMeta);
      gl.vertexAttribPointer(locLn.aLineMeta, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.LINES, 0, nLineVerts);
    }

    // 2. Desenho da Nuvem de Partículas (gl.POINTS)
    gl.depthMask(false);
    gl.useProgram(progPontos);

    gl.uniformMatrix4fv(locPt.uMVP, false, matMVP);
    gl.uniform4fv(locPt.uZWeights, pesosZAtual);
    gl.uniform1f(locPt.uPixelRatio, dpr);
    gl.uniform1f(locPt.uPointSizeBase, 0.0135);
    gl.uniform1f(locPt.uDark, claro ? 0.0 : 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPtBaseXZ);
    gl.enableVertexAttribArray(locPt.aBaseXZ);
    gl.vertexAttribPointer(locPt.aBaseXZ, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPtZModes);
    gl.enableVertexAttribArray(locPt.aZModes);
    gl.vertexAttribPointer(locPt.aZModes, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPtColor);
    gl.enableVertexAttribArray(locPt.aColor);
    gl.vertexAttribPointer(locPt.aColor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPtAttrs);
    gl.enableVertexAttribArray(locPt.aAttrs);
    gl.vertexAttribPointer(locPt.aAttrs, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, nNos);

    const animandoCamera =
      Math.abs(rAlvo - rAtual) > 0.002 ||
      Math.abs(thetaAlvo - thetaAtual) > 0.002 ||
      Math.abs(phiAlvo - phiAtual) > 0.002;

    if (!pausado || animandoCamera || morphandoZ) {
      raf = requestAnimationFrame(desenhar);
    }
  }

  function pedirQuadro() {
    if (!raf && canvas.isConnected && canvas.style.display !== 'none' && !container.closest('[hidden]')) {
      raf = requestAnimationFrame(desenhar);
    }
  }

  // Raycasting screen-space CPU instantâneo
  function acharPonto3D(px, py) {
    let melhor = -1;
    let dMin = 16 * 16;
    let melhorZ = Infinity;

    for (let i = 0; i < nNos; i++) {
      if (!maskVisivel[i]) continue;
      const sx = screenCoords[i * 2];
      const sy = screenCoords[i * 2 + 1];
      if (sx < -24 || sx > cssW + 24 || sy < -24 || sy > cssH + 24) continue;

      const dx = sx - px;
      const dy = sy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 <= dMin) {
        const z = screenDepth[i];
        if (d2 < dMin * 0.65 || z < melhorZ) {
          dMin = d2;
          melhorZ = z;
          melhor = i;
        }
      }
    }
    return melhor;
  }

  // Interatividade de ponteiro (mouse / touch)
  let arrasto = null;
  const ponteirosAtivos = new Map();

  function atualizarPontoFoco(px, py, clientX, clientY) {
    const idx = acharPonto3D(px, py);
    if (idx !== focoIdx) {
      focoIdx = idx;
      if (idx >= 0 && onHover) {
        onHover(nos[idx], {
          x: screenCoords[idx * 2],
          y: screenCoords[idx * 2 + 1],
          clientX,
          clientY,
          idx,
        });
      } else if (onUnhover) {
        onUnhover();
      }
      pedirQuadro();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    ponteirosAtivos.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const ehDireito = e.button === 2;
    const ehPan = ehDireito || e.shiftKey || ponteirosAtivos.size >= 2;

    arrasto = {
      tipo: ehPan ? 'pan' : 'orbita',
      startX: e.clientX,
      startY: e.clientY,
      theta0: thetaAlvo,
      phi0: phiAlvo,
      target0: targetAlvo.slice(),
      moveu: false,
      distPinch0: 0,
      r0: rAlvo,
    };

    if (ponteirosAtivos.size === 2) {
      const pts = Array.from(ponteirosAtivos.values());
      arrasto.tipo = 'pinch';
      arrasto.distPinch0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      arrasto.r0 = rAlvo;
    }

    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (ponteirosAtivos.has(e.pointerId)) {
      ponteirosAtivos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (arrasto) {
      const dxTotal = e.clientX - arrasto.startX;
      const dyTotal = e.clientY - arrasto.startY;
      if (Math.hypot(dxTotal, dyTotal) > 4) arrasto.moveu = true;

      if (arrasto.moveu) {
        if (onUnhover) onUnhover();
        focoIdx = -1;

        if (arrasto.tipo === 'pinch' && ponteirosAtivos.size >= 2) {
          const pts = Array.from(ponteirosAtivos.values());
          const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (arrasto.distPinch0 > 10 && curDist > 10) {
            const fator = arrasto.distPinch0 / curDist;
            rAlvo = Math.max(0.75, Math.min(14.0, arrasto.r0 * fator));
            pedirQuadro();
          }
          return;
        }

        if (arrasto.tipo === 'pan') {
          // Vetores de tela em coordenadas mundiais
          const sinT = Math.sin(thetaAtual), cosT = Math.cos(thetaAtual);
          const sinP = Math.sin(phiAtual), cosP = Math.cos(phiAtual);

          const rX = -cosT;
          const rZ = sinT;

          const uX = -sinT * sinP;
          const uY = cosP;
          const uZ = -cosT * sinP;

          const vel = rAtual * 0.0016;
          targetAlvo[0] = arrasto.target0[0] + (-dxTotal * rX + dyTotal * uX) * vel;
          targetAlvo[1] = arrasto.target0[1] + dyTotal * uY * vel;
          targetAlvo[2] = arrasto.target0[2] + (-dxTotal * rZ + dyTotal * uZ) * vel;
          pedirQuadro();
          return;
        }

        // Modo Órbita
        thetaAlvo = arrasto.theta0 - dxTotal * 0.0055;
        phiAlvo = Math.max(-1.42, Math.min(1.42, arrasto.phi0 + dyTotal * 0.0055));
        pedirQuadro();
        return;
      }
    }

    atualizarPontoFoco(px, py, e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (arrasto && !arrasto.moveu) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const clicado = acharPonto3D(px, py);
      const idxFinal = clicado >= 0 ? clicado : focoIdx;
      if (idxFinal >= 0) {
        if (onClick) onClick(nos[idxFinal]);
        else location.hash = `#/molecula/${nos[idxFinal][ix.id]}`;
      }
    }
    ponteirosAtivos.delete(e.pointerId);
    if (ponteirosAtivos.size === 0) arrasto = null;
  });

  canvas.addEventListener('pointercancel', (e) => {
    ponteirosAtivos.delete(e.pointerId);
    if (ponteirosAtivos.size === 0) arrasto = null;
  });

  canvas.addEventListener('pointerleave', () => {
    arrasto = null;
    ponteirosAtivos.clear();
    if (focoIdx >= 0) {
      focoIdx = -1;
      if (onUnhover) onUnhover();
      pedirQuadro();
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const fator = Math.exp(e.deltaY * 0.0013);
    rAlvo = Math.max(0.75, Math.min(14.0, rAlvo * fator));
    pedirQuadro();
  }, { passive: false });

  canvas.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      rAlvo = Math.max(0.75, rAlvo / 1.25);
      pedirQuadro();
    } else if (e.key === '-') {
      e.preventDefault();
      rAlvo = Math.min(14.0, rAlvo * 1.25);
      pedirQuadro();
    } else if (e.key === '0') {
      e.preventDefault();
      rAlvo = 3.45; thetaAlvo = 0.52; phiAlvo = 0.56;
      targetAlvo[0] = 0; targetAlvo[1] = 0; targetAlvo[2] = 0;
      pedirQuadro();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      thetaAlvo -= 0.09;
      pedirQuadro();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      thetaAlvo += 0.09;
      pedirQuadro();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      phiAlvo = Math.min(1.42, phiAlvo + 0.09);
      pedirQuadro();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      phiAlvo = Math.max(-1.42, phiAlvo - 0.09);
      pedirQuadro();
    }
  });

  // Atualização em tempo real de filtros (máscara de visibilidade GPU)
  function atualizarMascara(novaMascara) {
    let visCont = 0;
    for (let i = 0; i < nNos; i++) {
      const v = novaMascara[i] ? 1.0 : 0.0;
      maskVisivel[i] = novaMascara[i] ? 1 : 0;
      ptAttrs[i * 2] = v;
      if (novaMascara[i]) visCont++;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPtAttrs);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ptAttrs);

    // Atualiza visibilidade dos filamentos conectados
    for (let e = 0; e < nArestas; e++) {
      const [src, tgt] = arestas[e];
      const lv = (maskVisivel[src] && maskVisivel[tgt]) ? 1.0 : 0.0;
      lineMeta[e * 4 + 1] = lv;
      lineMeta[e * 4 + 3] = lv;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLnMeta);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineMeta);

    pedirQuadro();
    return visCont;
  }

  // Atualização de cores dinâmicas das lentes cromáticas
  function atualizarCores(coresArray) {
    if (!coresArray || coresArray.length < nNos * 3) return;
    ptColors.set(coresArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPtColor);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ptColors);
    pedirQuadro();
  }

  // Alterna exibição de filamentos TMAP
  function alternarFilamentos(visivel) {
    mostrarFilamentos = typeof visivel === 'boolean' ? visivel : !mostrarFilamentos;
    pedirQuadro();
    return mostrarFilamentos;
  }

  // Reseta câmera para perspectiva canônica
  function resetarCamera() {
    rAlvo = 3.45; thetaAlvo = 0.52; phiAlvo = 0.56;
    targetAlvo[0] = 0; targetAlvo[1] = 0; targetAlvo[2] = 0;
    pedirQuadro();
  }

  // Zoom suave por fator multiplicativo
  function aproximar(fator) {
    rAlvo = Math.max(0.75, Math.min(14.0, rAlvo * fator));
    pedirQuadro();
  }

  // Centraliza e foca a câmera em uma molécula específica
  function focarMolecula(molOuIdx) {
    let idx = -1;
    if (typeof molOuIdx === 'number') idx = molOuIdx;
    else if (molOuIdx && typeof molOuIdx[ix.id] === 'number') {
      const id = molOuIdx[ix.id];
      idx = nos.findIndex((m) => m[ix.id] === id);
    }
    if (idx < 0 || idx >= nNos) return;

    const x = baseXZ[idx * 2];
    const z = baseXZ[idx * 2 + 1];
    const w0 = pesosZAtual[0], w1 = pesosZAtual[1], w2 = pesosZAtual[2], w3 = pesosZAtual[3];
    const y = zModes[idx * 4] * w0 + zModes[idx * 4 + 1] * w1 + zModes[idx * 4 + 2] * w2 + zModes[idx * 4 + 3] * w3;

    targetAlvo[0] = x;
    targetAlvo[1] = y;
    targetAlvo[2] = z;
    rAlvo = Math.max(1.15, Math.min(rAlvo, 2.2));
    focoIdx = idx;
    pedirQuadro();
  }

  // Tratamento de perda e recuperação de contexto WebGL
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  canvas.addEventListener('webglcontextrestored', () => {
    pedirQuadro();
  });

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    redimensionar();
    pedirQuadro();
  }) : null;
  ro?.observe(container);

  window.addEventListener('bmb:tema', pedirQuadro);
  window.addEventListener('bmb:movimento', pedirQuadro);

  const onVisChange = () => {
    if (!document.hidden && canvas.isConnected) pedirQuadro();
  };
  document.addEventListener('visibilitychange', onVisChange);

  // Inicia loop de renderização
  redimensionar();
  pedirQuadro();

  // Limpeza completa de recursos ao desmontar
  function destruir() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    ro?.disconnect();
    window.removeEventListener('bmb:tema', pedirQuadro);
    window.removeEventListener('bmb:movimento', pedirQuadro);
    document.removeEventListener('visibilitychange', onVisChange);

    gl.deleteBuffer(bufPtBaseXZ);
    gl.deleteBuffer(bufPtZModes);
    gl.deleteBuffer(bufPtColor);
    gl.deleteBuffer(bufPtAttrs);

    gl.deleteBuffer(bufLnBaseXZ);
    gl.deleteBuffer(bufLnZModes);
    gl.deleteBuffer(bufLnMeta);

    gl.deleteProgram(progPontos);
    gl.deleteProgram(progLinhas);

    canvas.remove();
  }

  return {
    ativo: true,
    atualizarMascara,
    atualizarCores,
    definirEixoZ(modo) {
      aplicarModoZ(modo);
      pedirQuadro();
    },
    obterModoZ() {
      return modoZAtivo;
    },
    alternarFilamentos,
    resetarCamera,
    aproximar,
    focarMolecula,
    redimensionar() {
      redimensionar();
      pedirQuadro();
    },
    solicitarRedesenho: pedirQuadro,
    retomarAnimacao: pedirQuadro,
    pedirQuadro,
    destruir,
    obterCanvas() {
      return canvas;
    },
  };
}
