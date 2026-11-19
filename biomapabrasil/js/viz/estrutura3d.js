// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Visualizador 3D de estruturas (WebGL2, superfície de potencial eletrostático, medidas e exportação SDF):
//   * estruturas experimentais (`experimental`, wwPDB e COD): coordenadas depositadas e arquivo SDF (V2000/V3000);
//   * modelos preditos (`predicao_computacional`, AlphaFold DB e ESMFold): fita Cα com pLDDT por resíduo e pontes dissulfeto;
//   * confôrmeros calculados (`conformero_calculado`, RDKit, método registrado por fonte): geometria rotulada como calculada e arquivo SDF.
import { esc, fmtDec, fmtFixo, fmtData, icone, anunciar, tr, trDado, trPartes } from '../util.js';
import { desenharSprites, prepararSprites } from './material_canvas.js';
import { lerConformero, medida, detalhesItem, rotuloAtomo, rotuloItem, torcoes } from './inspecao3d.js';
import * as dados from '../dados.js';
import { movimentoPausado } from '../constelacao.js';
import { garantirEstilosObservatorio } from './estilos_obs.js';

const ELEMENTOS = [
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
];

const CIP_DECODE = { 0: '', 1: 'R', 2: 'S', 3: 'r', 4: 's', 5: '?' };

// Paleta CPK [R, G, B em 0..1, raio bola-bastão Å, raio de van der Waals Å, massa u]
const TABELA_EL = {
  H: [[0.90, 0.92, 0.90], 0.28, 1.20, 1.008],
  B: [[0.98, 0.68, 0.72], 0.36, 1.92, 10.81],
  C: [[0.31, 0.35, 0.38], 0.46, 1.70, 12.011],
  N: [[0.20, 0.42, 0.87], 0.42, 1.55, 14.007],
  O: [[0.86, 0.17, 0.20], 0.42, 1.52, 15.999],
  F: [[0.62, 0.92, 0.24], 0.33, 1.47, 18.998],
  Na: [[0.66, 0.45, 0.96], 0.46, 2.27, 22.99],
  Mg: [[0.32, 0.88, 0.36], 0.44, 1.73, 24.305],
  Si: [[0.92, 0.76, 0.56], 0.42, 2.10, 28.085],
  P: [[0.98, 0.58, 0.22], 0.42, 1.80, 30.974],
  S: [[0.98, 0.79, 0.18], 0.42, 1.80, 32.06],
  Cl: [[0.18, 0.82, 0.42], 0.40, 1.75, 35.45],
  K: [[0.58, 0.38, 0.88], 0.48, 2.75, 39.098],
  Ca: [[0.28, 0.85, 0.52], 0.46, 2.31, 40.078],
  Fe: [[0.88, 0.44, 0.22], 0.44, 2.04, 55.845],
  Co: [[0.94, 0.56, 0.64], 0.44, 2.00, 58.933],
  Cu: [[0.82, 0.52, 0.26], 0.44, 1.40, 63.546],
  Zn: [[0.52, 0.58, 0.78], 0.44, 1.39, 65.38],
  Se: [[1.00, 0.64, 0.12], 0.43, 1.90, 78.971],
  Br: [[0.72, 0.28, 0.16], 0.43, 1.85, 79.904],
  I: [[0.64, 0.30, 0.88], 0.46, 1.98, 126.90],
};
const EL_PADRAO = [[0.66, 0.55, 0.96], 0.40, 1.80, 20.0];
const C_TEMA_CLARO = [0.19, 0.24, 0.30];

function infoEl(simb, claro = false) {
  const base = TABELA_EL[simb] || EL_PADRAO;
  if (simb === 'C' && claro) return [C_TEMA_CLARO, base[1], base[2], base[3]];
  if (simb === 'H' && claro) return [[0.74, 0.79, 0.85], base[1], base[2], base[3]];
  return base;
}

function rgbCss(rgb, alpha = 1) {
  const r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

function corPLDDTRgb(v) {
  if (v >= 90) return [0.00, 0.33, 0.84];
  if (v >= 70) return [0.40, 0.80, 0.95];
  if (v >= 50) return [1.00, 0.86, 0.08];
  return [1.00, 0.49, 0.27];
}

function corBFactorRgb(v, bMin, bMax) {
  const t = Math.max(0, Math.min(1, (v - bMin) / Math.max(1, bMax - bMin)));
  return [
    (34 + t * 215) / 255,
    (211 - Math.abs(t - 0.45) * 140) / 255,
    (238 - t * 195) / 255,
  ];
}

// Divergente eletrostático: negativo δ⁻ (rubi nucleofílico) → neutro marfim → positivo δ⁺ (safira eletrofílico)
function corEletrostaticaRgb(pot, claro = false) {
  const u = Math.max(-1, Math.min(1, pot * 2.75));
  const neutro = claro ? [0.91, 0.90, 0.87] : [0.86, 0.90, 0.92];
  if (u < 0) {
    const a = -u;
    const neg = [0.94, 0.22, 0.28];
    return [neutro[0] + (neg[0] - neutro[0]) * a, neutro[1] + (neg[1] - neutro[1]) * a, neutro[2] + (neg[2] - neutro[2]) * a];
  }
  const pos = [0.16, 0.48, 0.98];
  return [neutro[0] + (pos[0] - neutro[0]) * u, neutro[1] + (pos[1] - neutro[1]) * u, neutro[2] + (pos[2] - neutro[2]) * u];
}

// Farmacóforo químico: HBD (azul-safira), HBA (coral), Ambos (magenta), Carga+ (índigo), Carga- (vermelho), Aromático (âmbar), Hidrofóbico (esmeralda)
function corFarmacoforoRgb(at, claro = false) {
  if (at.s === 'H') return claro ? [0.76, 0.80, 0.85] : [0.85, 0.90, 0.94];
  if (at.q > 0) return [0.24, 0.44, 0.98];
  if (at.q < 0) return [0.95, 0.24, 0.30];
  if (at.hbd && at.hba) return [0.84, 0.36, 0.92];
  if (at.hbd) return [0.20, 0.68, 0.98];
  if (at.hba) return [0.97, 0.44, 0.34];
  if (at.aro) return [0.96, 0.74, 0.18];
  if (at.s === 'C' || at.s === 'S' || at.s === 'Cl' || at.s === 'Br' || at.s === 'I') {
    return claro ? [0.16, 0.56, 0.42] : [0.22, 0.82, 0.58];
  }
  return [0.64, 0.72, 0.80];
}

function temaClaro() {
  const raiz = document.documentElement;
  return raiz.dataset.tema === 'claro' && !raiz.hasAttribute('data-cena-molecular');
}

function traduzirMetodo3D(met) {
  if (!met) return '';
  return String(met)
    .replace('energia MMFF94s', tr('energia MMFF94s'))
    .replace('estereoisômero representativo', tr('estereoisômero representativo'))
    .replace('resíduos X modelados como Ala', tr('resíduos X modelados como Ala'));
}

// ═══════════════════════ Descompressor RFC-1951 (DEFLATE bruto) + Codec BM32 ═══════════════════════
function inflateRawJS(src) {
  let bitPos = 0;
  const lerBits = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = bitPos >> 3;
      if (byteIdx >= src.length) throw new Error('Fim prematuro no stream DEFLATE');
      v |= ((src[byteIdx] >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return v;
  };
  const construirArvore = (comprimentos) => {
    const maxBits = Math.max(1, ...comprimentos);
    const blCount = new Int32Array(maxBits + 1);
    for (const c of comprimentos) if (c > 0) blCount[c]++;
    const nextCode = new Int32Array(maxBits + 1);
    let code = 0;
    for (let bits = 1; bits <= maxBits; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const mapa = new Map();
    for (let sym = 0; sym < comprimentos.length; sym++) {
      const len = comprimentos[sym];
      if (len > 0) {
        mapa.set((len << 16) | nextCode[len], sym);
        nextCode[len]++;
      }
    }
    return { mapa, maxBits };
  };
  const decodSimb = ({ mapa, maxBits }) => {
    let cur = 0;
    for (let len = 1; len <= maxBits; len++) {
      cur = (cur << 1) | lerBits(1);
      const chave = (len << 16) | cur;
      if (mapa.has(chave)) return mapa.get(chave);
    }
    throw new Error('Símbolo Huffman inválido');
  };

  const FIX_LIT = new Uint8Array(288);
  for (let i = 0; i <= 143; i++) FIX_LIT[i] = 8;
  for (let i = 144; i <= 255; i++) FIX_LIT[i] = 9;
  for (let i = 256; i <= 279; i++) FIX_LIT[i] = 7;
  for (let i = 280; i <= 287; i++) FIX_LIT[i] = 8;
  const FIX_DIST = new Uint8Array(32).fill(5);
  const ARV_LIT_FIXA = construirArvore(FIX_LIT);
  const ARV_DIST_FIXA = construirArvore(FIX_DIST);

  const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDEM = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  const out = [];
  let bfinal = 0;
  while (!bfinal) {
    bfinal = lerBits(1);
    const btype = lerBits(2);
    if (btype === 0) {
      bitPos = (bitPos + 7) & ~7;
      const bytePos = bitPos >> 3;
      const len = src[bytePos] | (src[bytePos + 1] << 8);
      bitPos += 32;
      const ini = bitPos >> 3;
      for (let i = 0; i < len; i++) out.push(src[ini + i]);
      bitPos += len * 8;
    } else if (btype === 1 || btype === 2) {
      let arvLit = ARV_LIT_FIXA, arvDist = ARV_DIST_FIXA;
      if (btype === 2) {
        const hlit = lerBits(5) + 257;
        const hdist = lerBits(5) + 1;
        const hclen = lerBits(4) + 4;
        const clLens = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clLens[CL_ORDEM[i]] = lerBits(3);
        const arvCl = construirArvore(clLens);
        const todosLens = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < hlit + hdist) {
          const s = decodSimb(arvCl);
          if (s < 16) todosLens[idx++] = s;
          else if (s === 16) {
            const rep = lerBits(2) + 3, ant = todosLens[idx - 1] || 0;
            for (let k = 0; k < rep; k++) todosLens[idx++] = ant;
          } else if (s === 17) idx += lerBits(3) + 3;
          else idx += lerBits(7) + 11;
        }
        arvLit = construirArvore(todosLens.subarray(0, hlit));
        arvDist = construirArvore(todosLens.subarray(hlit));
      }
      while (true) {
        const sym = decodSimb(arvLit);
        if (sym === 256) break;
        if (sym < 256) out.push(sym);
        else {
          const li = sym - 257;
          const comp = LEN_BASE[li] + lerBits(LEN_EXTRA[li]);
          const di = decodSimb(arvDist);
          const dist = DIST_BASE[di] + lerBits(DIST_EXTRA[di]);
          let posCopia = out.length - dist;
          for (let k = 0; k < comp; k++) out.push(out[posCopia++]);
        }
      }
    } else {
      throw new Error('Bloco DEFLATE reservado');
    }
  }
  return new Uint8Array(out);
}

async function descomprimirB64Deflate(b64z) {
  const binStr = atob(b64z);
  const comp = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) comp[i] = binStr.charCodeAt(i);
  if (comp.length < 32768) {
    return inflateRawJS(comp);
  }
  if (typeof DecompressionStream === 'function' && typeof Blob === 'function') {
    try {
      const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch { /* fallback puro JS abaixo */ }
  }
  return inflateRawJS(comp);
}

export async function decodificarBM32Z(b64z) {
  const raw = await descomprimirB64Deflate(b64z);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw[0] !== 0x42 || raw[1] !== 0x4d || raw[2] !== 0x33 || raw[3] !== 0x32) {
    throw new Error('Assinatura binária BM32 inválida');
  }
  const flags = dv.getUint8(4);
  const nAt = dv.getUint32(6, true);
  const nBd = dv.getUint32(10, true);
  const cx = dv.getFloat32(14, true);
  const cy = dv.getFloat32(18, true);
  const cz = dv.getFloat32(22, true);
  const scale = dv.getFloat32(26, true);
  const usarF32 = (flags & 0x01) !== 0;
  const usarIdx16 = (flags & 0x02) !== 0;
  const chiralFlag = (flags & 0x04) !== 0 ? 1 : 0;

  let pos = 30;
  const atomos = new Array(nAt);
  for (let i = 0; i < nAt; i++) {
    const zNum = dv.getUint8(pos);
    const fchg = dv.getInt8(pos + 1);
    const cflags = dv.getUint8(pos + 2);
    const gq = dv.getInt8(pos + 3);
    const bf = dv.getUint8(pos + 4);
    pos += 5;
    let dx, dy, dz;
    if (usarF32) {
      dx = dv.getFloat32(pos, true);
      dy = dv.getFloat32(pos + 4, true);
      dz = dv.getFloat32(pos + 8, true);
      pos += 12;
    } else {
      dx = dv.getInt16(pos, true) * scale;
      dy = dv.getInt16(pos + 2, true) * scale;
      dz = dv.getInt16(pos + 4, true) * scale;
      pos += 6;
    }
    atomos[i] = {
      idx: i,
      zNum,
      s: ELEMENTOS[zNum] || 'C',
      x: dx, y: dy, z: dz,
      ox: cx + dx, oy: cy + dy, oz: cz + dz,
      q: fchg,
      g: gq === 0 ? null : gq / 100.0,
      cip: CIP_DECODE[cflags & 0x07] || '',
      aro: (cflags & 0x08) !== 0,
      hbd: (cflags & 0x10) !== 0,
      hba: (cflags & 0x20) !== 0,
      bf: bf * 0.5,
      polarH: false,
    };
  }

  const ligacoes = new Array(nBd);
  const adj = Array.from({ length: nAt }, () => []);
  for (let bi = 0; bi < nBd; bi++) {
    let a1, a2, bbits;
    if (usarIdx16) {
      a1 = dv.getUint16(pos, true);
      a2 = dv.getUint16(pos + 2, true);
      bbits = dv.getUint8(pos + 4);
      pos += 5;
    } else {
      a1 = dv.getUint8(pos);
      a2 = dv.getUint8(pos + 1);
      bbits = dv.getUint8(pos + 2);
      pos += 3;
    }
    const ezC = (bbits >> 4) & 0x03;
    const ko = (bbits & 0x07) || 1;
    const aro = (bbits & 0x08) !== 0;
    const ring = (bbits & 0x40) !== 0;
    ligacoes[bi] = {
      idx: bi, a: a1, b: a2, ko, aro,
      ez: ezC === 1 ? 'E' : (ezC === 2 ? 'Z' : ''),
      ring,
    };
    if (a1 < nAt && a2 < nAt) {
      adj[a1].push({ v: a2, bi });
      adj[a2].push({ v: a1, bi });
      if (atomos[a1].s === 'H' && (atomos[a2].s === 'O' || atomos[a2].s === 'N' || atomos[a2].s === 'S')) atomos[a1].polarH = true;
      if (atomos[a2].s === 'H' && (atomos[a1].s === 'O' || atomos[a1].s === 'N' || atomos[a1].s === 'S')) atomos[a2].polarH = true;
    }
  }

  return { chiralFlag, centroide: [cx, cy, cz], atomos, ligacoes, adj };
}

export async function normalizarModelo3D(raw, indice = 0) {
  if (raw.fmt === 'ensemble-sdf-v1') return lerConformero(raw, indice);
  let tabAtomos = null;
  if (raw.b64z) {
    tabAtomos = await decodificarBM32Z(raw.b64z);
  } else if (Array.isArray(raw.a) && Array.isArray(raw.b)) {
    const mapaQ = new Map((raw.quirais || []).map(([i, c]) => [i, c]));
    const atomos = raw.a.map((a, idx) => ({
      idx, zNum: ELEMENTOS.indexOf(a[0]) > 0 ? ELEMENTOS.indexOf(a[0]) : 6,
      s: a[0], x: a[1], y: a[2], z: a[3], ox: a[1], oy: a[2], oz: a[3],
      q: a[4] ?? null, g: null, cip: mapaQ.get(idx) || '', aro: false,
      hbd: a[0] === 'O' || a[0] === 'N', hba: a[0] === 'O' || a[0] === 'N', bf: 0, polarH: false,
    }));
    const adj = Array.from({ length: atomos.length }, () => []);
    const ligacoes = raw.b.map(([a1, a2, ord], bi) => {
      adj[a1]?.push({ v: a2, bi });
      adj[a2]?.push({ v: a1, bi });
      if (atomos[a1]?.s === 'H' && (atomos[a2]?.s === 'O' || atomos[a2]?.s === 'N' || atomos[a2]?.s === 'S')) atomos[a1].polarH = true;
      if (atomos[a2]?.s === 'H' && (atomos[a1]?.s === 'O' || atomos[a1]?.s === 'N' || atomos[a1]?.s === 'S')) atomos[a2].polarH = true;
      if (ord === 4) { atomos[a1].aro = true; atomos[a2].aro = true; }
      return { idx: bi, a: a1, b: a2, ko: ord === 4 ? 1 : (ord || 1), aro: ord === 4, ez: '', ring: ord === 4 };
    });
    tabAtomos = { chiralFlag: mapaQ.size ? 1 : 0, centroide: [0, 0, 0], atomos, ligacoes, adj };
  }
  return {
    raw,
    temAtomos: !!tabAtomos && tabAtomos.atomos.length > 0,
    temCadeia: Array.isArray(raw.ca) && raw.ca.length >= 4,
    ...(tabAtomos || { chiralFlag: 0, centroide: [0, 0, 0], atomos: [], ligacoes: [], adj: [] }),
    ca: raw.ca || null,
    ssBonds: raw.ss_bonds || [],
  };
}

// ═══════════════════════ Exportador BIOVIA MDL SDF 3D (V2000 / V3000) ═══════════════════════
export function gerarSDF3DCliente(modelo, info = {}, molMeta = {}) {
  if (modelo?.sdf) return modelo.sdf;
  if (!modelo?.temAtomos) throw new Error('Modelo sem tabela atômica para SDF 3D');
  const { atomos, ligacoes, chiralFlag } = modelo;
  const r = modelo.raw || {};
  const titulo = String(molMeta.nome || r.nome || info.acesso || 'BioMapaBrasil_3D').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  const nat = String(info.natureza || r.nat || 'conformero_calculado');
  const fonte = String(info.fonte || r.fonte || 'rdkit_local');
  const cod = String(info.acesso || r.cod || '');
  const met = String(info.metodo || r.met || r.metodo || '');
  const comentario = `BioMapaBrasil 3D | ${nat} | ${fonte} ${cod} | ${met}`.slice(0, 80);

  const nAt = atomos.length;
  const nBd = ligacoes.length;
  const linhas = [titulo, '  BioMapaB11142612003D 1   1.00000     0.00000     0', comentario];

  const padI = (n, w = 3) => String(Math.trunc(n)).padStart(w, ' ');
  const padF = (v) => Number(v).toFixed(4).padStart(10, ' ');

  if (nAt <= 999 && nBd <= 999) {
    linhas.push(`${padI(nAt)}${padI(nBd)}  0  0${padI(chiralFlag ? 1 : 0)}  0  0  0  0  0999 V2000`);
    const cargas = [];
    for (let i = 0; i < nAt; i++) {
      const at = atomos[i];
      if (at.q) cargas.push([i + 1, at.q]);
      linhas.push(`${padF(at.ox)}${padF(at.oy)}${padF(at.oz)} ${at.s.padEnd(3, ' ')} 0  0  0  0  0  0  0  0  0  0  0  0`);
    }
    for (let bi = 0; bi < nBd; bi++) {
      const bd = ligacoes[bi];
      const ko = r.a && bd.aro ? 4 : (bd.ko >= 1 && bd.ko <= 3 ? bd.ko : 1);
      linhas.push(`${padI(bd.a + 1)}${padI(bd.b + 1)}${padI(ko)}  0  0  0  0`);
    }
    for (let c = 0; c < cargas.length; c += 8) {
      const fatia = cargas.slice(c, c + 8);
      linhas.push(`M  CHG${padI(fatia.length)}${fatia.map(([idx, q]) => ` ${padI(idx)} ${padI(q)}`).join('')}`);
    }
    const rads = Array.isArray(r.rad) ? r.rad : [];
    for (let c = 0; c < rads.length; c += 8) {
      const fatia = rads.slice(c, c + 8);
      linhas.push(`M  RAD${padI(fatia.length)}${fatia.map(([idx, rv]) => ` ${padI(Number(idx) + 1)} ${padI(rv)}`).join('')}`);
    }
    linhas.push('M  END');
  } else {
    linhas.push('  0  0  0  0  0  0            999 V3000');
    linhas.push('M  V30 BEGIN CTAB');
    linhas.push(`M  V30 COUNTS ${nAt} ${nBd} 0 0 ${chiralFlag ? 1 : 0}`);
    linhas.push('M  V30 BEGIN ATOM');
    for (let i = 0; i < nAt; i++) {
      const at = atomos[i];
      const chg = at.q ? ` CHG=${at.q}` : '';
      linhas.push(`M  V30 ${i + 1} ${at.s} ${at.ox.toFixed(4)} ${at.oy.toFixed(4)} ${at.oz.toFixed(4)} 0${chg}`);
    }
    linhas.push('M  V30 END ATOM');
    linhas.push('M  V30 BEGIN BOND');
    for (let bi = 0; bi < nBd; bi++) {
      const bd = ligacoes[bi];
      const ko = r.a && bd.aro ? 4 : (bd.ko >= 1 && bd.ko <= 3 ? bd.ko : 1);
      linhas.push(`M  V30 ${bi + 1} ${ko} ${bd.a + 1} ${bd.b + 1}`);
    }
    linhas.push('M  V30 END BOND');
    linhas.push('M  V30 END CTAB');
    linhas.push('M  END');
  }

  const licPadrao = {
    rcsb_pdb: 'CC0 1.0 (wwPDB Public Domain)',
    cod: 'CC0 1.0 (Crystallography Open Database)',
    alphafold: 'CC BY 4.0 (AlphaFold DB)',
    esm_atlas: 'CC BY 4.0 (ESM Metagenomic Atlas)',
    rdkit_local: 'CC0 1.0 (RDKit deterministic conformer)',
  }[fonte] || 'CC BY 4.0';

  const props = [
    ['BMB_MOLECULA_ID', molMeta.id ?? r.id],
    ['NAME', titulo],
    ['INCHIKEY', molMeta.inchikey || r.ik],
    ['FORMULA', molMeta.formula || r.form],
    ['NATUREZA_EPISTEMICA', nat],
    ['SOURCE_DATABASE', fonte],
    ['SOURCE_ACCESSION', cod],
    ['EXPERIMENTAL_METHOD', met],
    ['RESOLUTION_ANGSTROM', info.resolucao ?? r.res_ang],
    ['ENERGY_KCAL_MOL', info.energia_kcal_mol ?? r.e_kcal],
    ['LICENSE', licPadrao],
  ];
  for (const [k, v] of props) {
    if (v != null && String(v).trim() !== '') {
      linhas.push(`>  <${k}>`, String(v).trim(), '');
    }
  }
  linhas.push('$$$$', '');
  return linhas.join('\n');
}

// ═══════════════════════ Percepção Químico-Estrutural 3D em Tempo Real ═══════════════════════
function detectarAneisPi(modelo) {
  if (!modelo.temAtomos || modelo.atomos.length > 500) return [];
  const { atomos, ligacoes, adj } = modelo;
  const vistos = new Set();
  const aneis = [];
  for (let ini = 0; ini < atomos.length; ini++) {
    if (!atomos[ini].aro) continue;
    const buscar = (atual, caminho) => {
      if (caminho.length > 6) return;
      for (const { v, bi } of adj[atual]) {
        if (!ligacoes[bi].aro && !ligacoes[bi].ring) continue;
        if (v === ini && caminho.length >= 5) {
          const chave = [...caminho].sort((a, b) => a - b).join(',');
          if (!vistos.has(chave)) {
            vistos.add(chave);
            let cx = 0, cy = 0, cz = 0;
            for (const id of caminho) { cx += atomos[id].x; cy += atomos[id].y; cz += atomos[id].z; }
            cx /= caminho.length; cy /= caminho.length; cz /= caminho.length;
            const p0 = atomos[caminho[0]], p1 = atomos[caminho[1]], p2 = atomos[caminho[2]];
            const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
            const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            let raioMedio = 0;
            for (const id of caminho) raioMedio += Math.hypot(atomos[id].x - cx, atomos[id].y - cy, atomos[id].z - cz);
            aneis.push({ ids: [...caminho], c: [cx, cy, cz], n: [nx, ny, nz], r: (raioMedio / caminho.length) * 0.64 });
          }
          continue;
        }
        if (v > ini && !caminho.includes(v) && atomos[v].aro) {
          caminho.push(v);
          buscar(v, caminho);
          caminho.pop();
        }
      }
    };
    buscar(ini, [ini]);
  }
  return aneis;
}

function detectarPontesH(modelo) {
  if (!modelo.temAtomos || modelo.atomos.length > 650) return [];
  const { atomos, adj } = modelo;
  const vizinhos12 = new Set();
  for (let i = 0; i < atomos.length; i++) {
    for (const { v } of adj[i]) {
      vizinhos12.add(i < v ? `${i}:${v}` : `${v}:${i}`);
      for (const { v: v2 } of adj[v]) {
        if (v2 !== i) vizinhos12.add(i < v2 ? `${i}:${v2}` : `${v2}:${i}`);
      }
    }
  }
  const aceitadores = atomos.filter((a) => (a.s === 'O' || a.s === 'N' || a.s === 'F') && a.q <= 0);
  const pontes = [];
  for (const d of atomos) {
    if (d.s !== 'O' && d.s !== 'N' && d.s !== 'S') continue;
    const hs = adj[d.idx].map((x) => atomos[x.v]).filter((a) => a.s === 'H');
    for (const h of hs) {
      for (const ac of aceitadores) {
        if (ac.idx === d.idx) continue;
        const par = d.idx < ac.idx ? `${d.idx}:${ac.idx}` : `${ac.idx}:${d.idx}`;
        if (vizinhos12.has(par)) continue;
        const dxHA = ac.x - h.x, dyHA = ac.y - h.y, dzHA = ac.z - h.z;
        const distHA = Math.hypot(dxHA, dyHA, dzHA);
        if (distHA < 1.50 || distHA > 2.62) continue;
        const ux = d.x - h.x, uy = d.y - h.y, uz = d.z - h.z;
        const ul = Math.hypot(ux, uy, uz) || 1;
        const cosAng = (ux * dxHA + uy * dyHA + uz * dzHA) / (ul * distHA);
        if (cosAng <= -0.42) { // ângulo D-H...A >= ~115°
          pontes.push({ hIdx: h.idx, dIdx: d.idx, aIdx: ac.idx, dist: distHA });
        }
      }
    }
  }
  return pontes;
}

function calcularDescritoresEOrientacao(modelo) {
  const pts = modelo.temAtomos
    ? modelo.atomos.filter((a) => a.s !== 'H' || modelo.atomos.length <= 4).map((a) => [a.x, a.y, a.z, infoEl(a.s)[3]])
    : (modelo.ca || []).map((c) => [c[2], c[3], c[4], 110.0]);
  if (pts.length < 2) {
    return { rg: 0, npr1: 1, npr2: 1, forma: 'globular', rxIdeal: 0.32, ryIdeal: -0.48 };
  }
  let mTot = 0, mx = 0, my = 0, mz = 0;
  for (const [x, y, z, m] of pts) { mTot += m; mx += x * m; my += y * m; mz += z * m; }
  mx /= mTot; my /= mTot; mz /= mTot;

  let rgSq = 0;
  let ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
  let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
  for (const [ox, oy, oz, m] of pts) {
    const x = ox - mx, y = oy - my, z = oz - mz;
    const r2 = x * x + y * y + z * z;
    rgSq += m * r2;
    ixx += m * (y * y + z * z); iyy += m * (x * x + z * z); izz += m * (x * x + y * y);
    ixy -= m * x * y; ixz -= m * x * z; iyz -= m * y * z;
    cxx += m * x * x; cyy += m * y * y; czz += m * z * z;
    cxy += m * x * y; cxz += m * x * z; cyz += m * y * z;
  }
  const rg = Math.sqrt(rgSq / mTot);

  // Diagonalização simétrica 3x3 de Jacobi
  const jacobi3 = (a00, a11, a22, a01, a02, a12) => {
    const A = [[a00, a01, a02], [a01, a11, a12], [a02, a12, a22]];
    const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let it = 0; it < 18; it++) {
      let p = 0, q = 1;
      if (Math.abs(A[0][2]) > Math.abs(A[p][q])) { p = 0; q = 2; }
      if (Math.abs(A[1][2]) > Math.abs(A[p][q])) { p = 1; q = 2; }
      if (Math.abs(A[p][q]) < 1e-9) break;
      const tau = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      const app = A[p][p] - t * A[p][q], aqq = A[q][q] + t * A[p][q];
      A[p][p] = app; A[q][q] = aqq; A[p][q] = 0; A[q][p] = 0;
      for (let r = 0; r < 3; r++) {
        if (r !== p && r !== q) {
          const arp = c * A[r][p] - s * A[r][q];
          const arq = s * A[r][p] + c * A[r][q];
          A[r][p] = arp; A[p][r] = arp;
          A[r][q] = arq; A[q][r] = arq;
        }
        const vrp = c * V[r][p] - s * V[r][q];
        const vrq = s * V[r][p] + c * V[r][q];
        V[r][p] = vrp; V[r][q] = vrq;
      }
    }
    const ord = [0, 1, 2].sort((i, j) => A[i][i] - A[j][j]);
    return { vals: ord.map((i) => A[i][i]), vecs: ord.map((i) => [V[0][i], V[1][i], V[2][i]]) };
  };

  const pmis = jacobi3(ixx, iyy, izz, ixy, ixz, iyz).vals;
  const i3 = Math.max(pmis[2], 1e-4);
  const npr1 = Math.max(0, Math.min(1, pmis[0] / i3));
  const npr2 = Math.max(0, Math.min(1, pmis[1] / i3));
  let forma = 'globular';
  if (npr1 < 0.28 && npr2 > 0.72) forma = 'alongada';
  else if (npr1 + npr2 < 1.16) forma = 'discoide';

  // Menor autovetor de covariância = normal ao plano médio da molécula → alinhar com +Z da câmera!
  const cov = jacobi3(cxx, cyy, czz, cxy, cxz, cyz);
  const nVec = cov.vecs[0];
  let ryIdeal = Math.atan2(nVec[0], nVec[2]);
  const z1 = -nVec[0] * Math.sin(ryIdeal) + nVec[2] * Math.cos(ryIdeal);
  let rxIdeal = Math.atan2(nVec[1], z1);
  // Aplica leve inclinação artística de 14° para revelar relevo estereoquímico 3D
  rxIdeal = Math.max(-1.2, Math.min(1.2, rxIdeal + 0.22));
  ryIdeal -= 0.18;

  return { rg, npr1, npr2, forma, rxIdeal, ryIdeal };
}

// ═══════════════════════ Superfície Molecular Gaussiana + Potencial Eletrostático (Marching Tetrahedra) ═══════════════════════
const TETRAEDROS_KUHN = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
const ARESTAS_TET = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const TRI_TET = [
  [],
  [[0, 2, 1]],
  [[0, 3, 4]],
  [[1, 2, 4], [1, 4, 3]],
  [[1, 5, 3]],
  [[0, 2, 5], [0, 5, 3]],
  [[0, 1, 5], [0, 5, 4]],
  [[2, 5, 4]],
  [[2, 4, 5]],
  [[0, 4, 5], [0, 5, 1]],
  [[0, 3, 5], [0, 5, 2]],
  [[1, 3, 5]],
  [[1, 3, 4], [1, 4, 2]],
  [[0, 4, 3]],
  [[0, 1, 2]],
  [],
];

function construirSuperficieMEP(modelo, ocultarH = false) {
  if (!modelo.temAtomos) return null;
  const fonteAt = ocultarH ? modelo.atomos.filter((a) => a.s !== 'H') : modelo.atomos;
  if (!fonteAt.length || fonteAt.length > 520) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const dadosAt = fonteAt.map((a) => {
    const rVdw = infoEl(a.s)[2] * 0.94;
    minX = Math.min(minX, a.x - rVdw - 1.35); maxX = Math.max(maxX, a.x + rVdw + 1.35);
    minY = Math.min(minY, a.y - rVdw - 1.35); maxY = Math.max(maxY, a.y + rVdw + 1.35);
    minZ = Math.min(minZ, a.z - rVdw - 1.35); maxZ = Math.max(maxZ, a.z + rVdw + 1.35);
    return { x: a.x, y: a.y, z: a.z, r2: rVdw * rVdw, q: (a.g || 0) + (a.q || 0) * 0.55 };
  });

  const extMax = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 3.0);
  const N = fonteAt.length > 140 ? 24 : 28;
  const passo = extMax / (N - 1);
  const nx = Math.max(10, Math.min(32, Math.ceil((maxX - minX) / passo) + 1));
  const ny = Math.max(10, Math.min(32, Math.ceil((maxY - minY) / passo) + 1));
  const nz = Math.max(10, Math.min(32, Math.ceil((maxZ - minZ) / passo) + 1));
  const dx = (maxX - minX) / (nx - 1);
  const dy = (maxY - minY) / (ny - 1);
  const dz = (maxZ - minZ) / (nz - 1);

  const nTot = nx * ny * nz;
  const campo = new Float32Array(nTot);
  const alfa = 0.72;
  const iso = 0.42;

  for (const at of dadosAt) {
    const rCorte = Math.sqrt(at.r2 + 4.2);
    const ix0 = Math.max(0, Math.floor((at.x - rCorte - minX) / dx));
    const ix1 = Math.min(nx - 1, Math.ceil((at.x + rCorte - minX) / dx));
    const iy0 = Math.max(0, Math.floor((at.y - rCorte - minY) / dy));
    const iy1 = Math.min(ny - 1, Math.ceil((at.y + rCorte - minY) / dy));
    const iz0 = Math.max(0, Math.floor((at.z - rCorte - minZ) / dz));
    const iz1 = Math.min(nz - 1, Math.ceil((at.z + rCorte - minZ) / dz));
    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = minZ + iz * dz - at.z, pz2 = pz * pz;
      for (let iy = iy0; iy <= iy1; iy++) {
        const py = minY + iy * dy - at.y, pyz2 = py * py + pz2;
        const baseIdx = (iz * ny + iy) * nx;
        for (let ix = ix0; ix <= ix1; ix++) {
          const px = minX + ix * dx - at.x;
          const d2 = px * px + pyz2;
          if (d2 <= rCorte * rCorte) {
            campo[baseIdx + ix] += Math.exp(-alfa * (d2 - at.r2));
          }
        }
      }
    }
  }

  // Avalia gradiente analítico suave + potencial eletrostático coulômbico em cada vértice da superfície
  const avaliarPonto = (px, py, pz) => {
    let gx = 0, gy = 0, gz = 0, pot = 0;
    for (let i = 0; i < modelo.atomos.length; i++) {
      const a = modelo.atomos[i];
      const rx = px - a.x, ry = py - a.y, rz = pz - a.z;
      const d2 = rx * rx + ry * ry + rz * rz;
      const q = (a.g || 0) + (a.q || 0) * 0.55;
      if (q !== 0) pot += q / Math.sqrt(d2 + 0.65);
    }
    for (let i = 0; i < dadosAt.length; i++) {
      const at = dadosAt[i];
      const rx = px - at.x, ry = py - at.y, rz = pz - at.z;
      const d2 = rx * rx + ry * ry + rz * rz;
      if (d2 < 14.0) {
        const w = Math.exp(-alfa * (d2 - at.r2));
        gx += w * rx; gy += w * ry; gz += w * rz;
      }
    }
    const gl = Math.hypot(gx, gy, gz) || 1;
    return [gx / gl, gy / gl, gz / gl, pot];
  };

  const posArr = [];
  const normArr = [];
  const potArr = [];
  const offs = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const vPos = new Array(8);
  const vVal = new Float32Array(8);
  const ePts = new Array(6);

  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        let maskCubo = 0;
        for (let k = 0; k < 8; k++) {
          const ox = ix + offs[k][0], oy = iy + offs[k][1], oz = iz + offs[k][2];
          const val = campo[(oz * ny + oy) * nx + ox];
          vVal[k] = val;
          if (val >= iso) maskCubo |= (1 << k);
          vPos[k] = [minX + ox * dx, minY + oy * dy, minZ + oz * dz];
        }
        if (maskCubo === 0 || maskCubo === 255) continue;

        for (const tet of TETRAEDROS_KUHN) {
          let mTet = 0;
          for (let ti = 0; ti < 4; ti++) if (vVal[tet[ti]] >= iso) mTet |= (1 << ti);
          const tris = TRI_TET[mTet];
          if (!tris.length) continue;

          for (let ei = 0; ei < 6; ei++) {
            const ia = tet[ARESTAS_TET[ei][0]], ib = tet[ARESTAS_TET[ei][1]];
            const va = vVal[ia], vb = vVal[ib];
            if ((va >= iso) !== (vb >= iso)) {
              const t = Math.max(0, Math.min(1, (iso - va) / ((vb - va) || 1e-6)));
              const pa = vPos[ia], pb = vPos[ib];
              ePts[ei] = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
            }
          }
          for (const [e0, e1, e2] of tris) {
            for (const p of [ePts[e0], ePts[e1], ePts[e2]]) {
              const [nxv, nyv, nzv, pot] = avaliarPonto(p[0], p[1], p[2]);
              posArr.push(p[0], p[1], p[2]);
              normArr.push(nxv, nyv, nzv);
              potArr.push(pot);
            }
          }
        }
      }
    }
  }
  if (!posArr.length) return null;
  return {
    nVerts: posArr.length / 3,
    pos: new Float32Array(posArr),
    norm: new Float32Array(normArr),
    pot: new Float32Array(potArr),
  };
}

// ═══════════════════════ Motor WebGL2 de Impostores Ray-Casted + Superfície ═══════════════════════
const VS_ESFERA = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 i_pos;
layout(location = 2) in float i_radius;
layout(location = 3) in vec4 i_color;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_ortho;
out vec3 v_center;
out vec3 v_rayPt;
out float v_radius;
out vec4 v_color;
void main() {
  vec3 c = (u_view * vec4(i_pos, 1.0)).xyz;
  v_center = c;
  v_radius = i_radius;
  v_color = i_color;
  float z = c.z + i_radius;
  vec2 xy = u_ortho > .5 ? c.xy : c.xy * z / c.z;
  vec3 q = vec3(xy + a_quad * i_radius * 1.32, z);
  v_rayPt = q;
  gl_Position = u_proj * vec4(q, 1.0);
}`;

const MATERIAL = `
const float PI = 3.14159265;
vec3 luz(vec3 n, vec3 v, vec3 l, vec3 base, float rough, vec3 rad) {
  vec3 h = normalize(v + l);
  float nv = max(dot(n,v), 0.001), nl = max(dot(n,l), 0.0);
  float nh = max(dot(n,h), 0.0), vh = max(dot(v,h), 0.0);
  float a2 = pow(rough, 4.0);
  float d = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float g = nv / (nv * (1.0-k) + k) * nl / (nl * (1.0-k) + k);
  vec3 f = vec3(0.045) + vec3(0.955) * pow(1.0-vh, 5.0);
  return ((1.0-f) * base / PI + d * g * f / max(0.001, 4.0 * nv * nl)) * rad * nl;
}
vec3 material(vec3 n, vec3 v, vec3 cor, float rough) {
  vec3 base = pow(cor, vec3(2.2));
  vec3 rgb = base * mix(vec3(.11,.16,.17), vec3(.44,.52,.54), n.y * .5 + .5);
  rgb += luz(n,v,normalize(vec3(-.48,.76,.65)),base,rough,vec3(3.8,3.63,3.42));
  rgb += luz(n,v,normalize(vec3(.88,.25,-.36)),base,rough,vec3(1.35,2.4,2.55));
  rgb += luz(n,v,normalize(vec3(.2,-.55,.72)),base,.58,vec3(.52,.64,.68));
  vec3 r = reflect(-v,n);
  float strip = smoothstep(.67,.98, dot(r,normalize(vec3(-.62,.68,.32))));
  rgb += vec3(.17,.20,.21) * strip;
  return pow(rgb / (vec3(.82) + rgb * .40), vec3(1.0/2.2));
}`;

const FS_ESFERA = `#version 300 es
precision highp float;
${MATERIAL}
in vec3 v_center;
in vec3 v_rayPt;
in float v_radius;
in vec4 v_color;
uniform mat4 u_proj;
uniform float u_ortho;
uniform float u_fogNear;
uniform float u_fogFar;
uniform vec3 u_fogColor;
out vec4 fragColor;
void main() {
  vec3 ro, rd;
  if (u_ortho > 0.5) {
    ro = vec3(v_rayPt.xy, 0.0);
    rd = vec3(0.0, 0.0, -1.0);
  } else {
    ro = vec3(0.0);
    rd = normalize(v_rayPt);
  }
  vec3 oc = ro - v_center;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - v_radius * v_radius;
  float disc = b * b - c;
  if (disc < 0.0) discard;
  float t = -b - sqrt(disc);
  if (t < 0.0) t = -b + sqrt(disc);
  if (t < 0.0) discard;
  vec3 hit = ro + t * rd;
  vec3 N = normalize(hit - v_center);
  vec3 V = -rd;

  vec4 clip = u_proj * vec4(hit, 1.0);
  gl_FragDepth = 0.5 * (clip.z / clip.w) + 0.5;

  vec3 col = material(N, V, v_color.rgb, 0.34);
  if (v_color.a > 1.5) col = mix(col, vec3(.66,1.0,.83), .25 * pow(1.0-max(dot(N,V),0.0), 2.0));
  float distCam = -hit.z;
  float fog = clamp((distCam - u_fogNear) / max(0.5, u_fogFar - u_fogNear), 0.0, 0.52);
  col = mix(col, u_fogColor, fog * 0.15);
  fragColor = vec4(col, 1.0);
}`;

const VS_CAPSULA = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 i_pA;
layout(location = 2) in vec3 i_pB;
layout(location = 3) in float i_radius;
layout(location = 4) in vec3 i_colA;
layout(location = 5) in vec3 i_colB;
uniform mat4 u_view;
uniform mat4 u_proj;
out vec3 v_A;
out vec3 v_B;
out vec3 v_rayPt;
out float v_radius;
out vec3 v_colA;
out vec3 v_colB;
void main() {
  vec3 A = (u_view * vec4(i_pA, 1.0)).xyz;
  vec3 B = (u_view * vec4(i_pB, 1.0)).xyz;
  v_A = A; v_B = B;
  v_radius = i_radius;
  v_colA = i_colA; v_colB = i_colB;

  vec4 ca = u_proj * vec4(A,1.0), cb = u_proj * vec4(B,1.0);
  vec2 a = ca.xy / ca.w, b = cb.xy / cb.w;
  vec2 radius = vec2(u_proj[0][0],u_proj[1][1]) * i_radius * 1.28 / max(.01,min(ca.w,cb.w)-i_radius);
  vec2 ndc = mix(min(a,b)-radius, max(a,b)+radius, a_quad*.5+.5);
  float z = max(A.z,B.z)+i_radius;
  vec4 center = u_proj * vec4(0.,0.,z,1.);
  vec3 q = vec3(ndc * center.w / vec2(u_proj[0][0],u_proj[1][1]), z);
  v_rayPt = q;
  gl_Position = vec4(ndc*center.w,center.z,center.w);
}`;

const FS_CAPSULA = `#version 300 es
precision highp float;
${MATERIAL}
in vec3 v_A;
in vec3 v_B;
in vec3 v_rayPt;
in float v_radius;
in vec3 v_colA;
in vec3 v_colB;
uniform mat4 u_proj;
uniform float u_ortho;
uniform float u_fogNear;
uniform float u_fogFar;
uniform vec3 u_fogColor;
out vec4 fragColor;

float rayCapsula(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r, out vec3 outN, out float outH) {
  vec3 ba = pb - pa;
  vec3 oa = ro - pa;
  float baba = dot(ba, ba);
  float bard = dot(ba, rd);
  float baoa = dot(ba, oa);
  float rdoa = dot(rd, oa);
  float oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - r * r * baba;
  float h = b * b - a * c;
  if (h >= 0.0 && a > 1e-6) {
    float t = (-b - sqrt(h)) / a;
    float y = baoa + t * bard;
    if (y > 0.0 && y < baba && t > 0.0) {
      outH = y / baba;
      vec3 hit = ro + t * rd;
      outN = normalize((hit - (pa + ba * outH)) / r);
      return t;
    }
    vec3 oc = (y <= 0.0) ? oa : ro - pb;
    b = dot(rd, oc);
    c = dot(oc, oc) - r * r;
    h = b * b - c;
    if (h >= 0.0) {
      float tc = -b - sqrt(h);
      if (tc > 0.0) {
        outH = (y <= 0.0) ? 0.0 : 1.0;
        vec3 centroCap = (y <= 0.0) ? pa : pb;
        outN = normalize((ro + tc * rd - centroCap) / r);
        return tc;
      }
    }
  }
  return -1.0;
}

void main() {
  vec3 ro, rd;
  if (u_ortho > 0.5) {
    ro = vec3(v_rayPt.xy, 0.0);
    rd = vec3(0.0, 0.0, -1.0);
  } else {
    ro = vec3(0.0);
    rd = normalize(v_rayPt);
  }
  vec3 N;
  float hFrac;
  float t = rayCapsula(ro, rd, v_A, v_B, v_radius, N, hFrac);
  if (t < 0.0) discard;
  vec3 hit = ro + t * rd;
  vec3 V = -rd;

  vec4 clip = u_proj * vec4(hit, 1.0);
  gl_FragDepth = 0.5 * (clip.z / clip.w) + 0.5;

  vec3 base = mix(v_colA, v_colB, smoothstep(0.44, 0.56, hFrac));
  vec3 col = material(N, V, base, 0.43);
  float distCam = -hit.z;
  float fog = clamp((distCam - u_fogNear) / max(0.5, u_fogFar - u_fogNear), 0.0, 0.52);
  col = mix(col, u_fogColor, fog * 0.15);
  fragColor = vec4(col, 1.0);
}`;

const VS_MALHA = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_norm;
layout(location = 2) in vec3 a_col;
uniform mat4 u_view;
uniform mat4 u_proj;
out vec3 v_posEye;
out vec3 v_normEye;
out vec3 v_col;
void main() {
  vec4 pe = u_view * vec4(a_pos, 1.0);
  v_posEye = pe.xyz;
  v_normEye = mat3(u_view) * a_norm;
  v_col = a_col;
  gl_Position = u_proj * pe;
}`;

const FS_MALHA = `#version 300 es
precision highp float;
in vec3 v_posEye;
in vec3 v_normEye;
in vec3 v_col;
uniform float u_alpha;
uniform float u_ortho;
uniform float u_fogNear;
uniform float u_fogFar;
uniform vec3 u_fogColor;
out vec4 fragColor;
void main() {
  vec3 N = normalize(v_normEye);
  if (!gl_FrontFacing) N = -N;
  vec3 V = u_ortho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-v_posEye);
  vec3 L1 = normalize(vec3(0.50, 0.72, 0.48));
  float diff = max(dot(N, L1), 0.0);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 34.0) * 0.42;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  vec3 col = v_col * (0.36 + diff * 0.66) + vec3(1.0) * spec + vec3(0.45, 0.92, 0.85) * fres * 0.28;
  float distCam = -v_posEye.z;
  float fog = clamp((distCam - u_fogNear) / max(0.5, u_fogFar - u_fogNear), 0.0, 0.45);
  col = mix(col, u_fogColor, fog * 0.15);
  float a = u_alpha < 0.99 ? clamp(u_alpha * (0.55 + 0.85 * fres), 0.16, 0.88) : 1.0;
  fragColor = vec4(col, a);
}`;

function compilarProg(gl, vsSrc, fsSrc) {
  const comp = (tipo, src) => {
    const sh = gl.createShader(tipo);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(info || 'Erro GLSL');
    }
    return sh;
  };
  const vs = comp(gl.VERTEX_SHADER, vsSrc);
  const fs = comp(gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'Erro link GLSL');
  }
  return p;
}

function criarMotorGL2(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: true, depth: true, preserveDrawingBuffer: false });
  } catch { gl = null; }
  if (!gl) return null;

  try {
    const progEsf = compilarProg(gl, VS_ESFERA, FS_ESFERA);
    const progCap = compilarProg(gl, VS_CAPSULA, FS_CAPSULA);
    const progMalha = compilarProg(gl, VS_MALHA, FS_MALHA);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    // VAO Esferas (stride = 8 floats: pos3, radius1, color4)
    const vaoEsf = gl.createVertexArray();
    const bufEsf = gl.createBuffer();
    gl.bindVertexArray(vaoEsf);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufEsf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(3, 1);

    // VAO Cápsulas (stride = 13 floats: pA3, pB3, radius1, colA3, colB3)
    const vaoCap = gl.createVertexArray();
    const bufCap = gl.createBuffer();
    gl.bindVertexArray(vaoCap);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufCap);
    const strideCap = 52;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, strideCap, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, strideCap, 12); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, strideCap, 24); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, strideCap, 28); gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, strideCap, 40); gl.vertexAttribDivisor(5, 1);

    // VAO Superfície Molecular (stride = 9 floats: pos3, norm3, col3)
    const vaoMalha = gl.createVertexArray();
    const bufMalha = gl.createBuffer();
    gl.bindVertexArray(vaoMalha);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufMalha);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
    gl.bindVertexArray(null);

    const locs = (p, nomes) => Object.fromEntries(nomes.map((n) => [n, gl.getUniformLocation(p, n)]));
    return {
      gl,
      progEsf, uEsf: locs(progEsf, ['u_view', 'u_proj', 'u_ortho', 'u_fogNear', 'u_fogFar', 'u_fogColor']), vaoEsf, bufEsf, nEsf: 0,
      progCap, uCap: locs(progCap, ['u_view', 'u_proj', 'u_ortho', 'u_fogNear', 'u_fogFar', 'u_fogColor']), vaoCap, bufCap, nCap: 0,
      progMalha, uMalha: locs(progMalha, ['u_view', 'u_proj', 'u_alpha', 'u_ortho', 'u_fogNear', 'u_fogFar', 'u_fogColor']), vaoMalha, bufMalha, nMalha: 0,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════ Geometria Analítica e Matrizes ═══════════════════════
function rotacionarPt(x, y, z, rx, ry) {
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

function matView(rx, ry, panX, panY, camDist) {
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  // Column-major: R_x(rx) * R_y(ry) seguido de translação (panX, panY, -camDist)
  return new Float32Array([
    cy, sx * sy, -cx * sy, 0,
    0, cx, sx, 0,
    sy, -sx * cy, cx * cy, 0,
    panX, panY, -camDist, 1,
  ]);
}

function matPerspectiva(fovRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function matOrtografica(halfH, aspect, near, far) {
  const halfW = halfH * aspect;
  const nf = 1.0 / (near - far);
  return new Float32Array([
    1 / halfW, 0, 0, 0,
    0, 1 / halfH, 0, 0,
    0, 0, 2 * nf, 0,
    0, 0, (far + near) * nf, 1,
  ]);
}

function interpCatmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((k) => 0.5 * (
    (2 * p1[k]) + (-p0[k] + p2[k]) * t +
    (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
    (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
  ));
}

function calcularMedidaGeometrica(pts) {
  const valor = medida(pts);
  if (valor == null) return null;
  const n = pts.length;
  return { tipo: tr(['', '', 'Distância', 'Ângulo', 'Diedro'][n]), valor: fmtFixo(valor, n === 2 ? 3 : 2) + (n === 2 ? ' Å' : '°') };
}

// ═══════════════════════ Componente Interativo Principal ═══════════════════════
export async function montarVisualizador3D(container, opcoes3d, packConsultas = [], molMeta = {}) {
  garantirEstilosObservatorio();
  if (!container || !opcoes3d?.length) return;

  let idxAtual = 0;
  let modelo = null;
  let aneisPi = [];
  let pontesH = [];
  let desc3d = { rg: 0, npr1: 1, npr2: 1, forma: 'globular', rxIdeal: 0.32, ryIdeal: -0.48 };
  let malhaCache = new Map();

  let rx = 0.32, ry = -0.48, zoom = 1.0, panX = 0, panY = 0;
  let rBase = 5.0;
  let girando = false, abertura = null, ultimoQuadro = 0, pesoFrame = 16.7, quadrosLentos = 0;
  let enquadramento = null, reconstituir = 0, ultimaInteracao = 0;
  let simplificar = false, sprites = null, instancias = null;
  let ativo = true, visivel = true, qualidade = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
  let versaoCarga = 0, indiceConf = 0, modelos = [], itemAtual = '', pontosLigacao = [];
  const fixados = new Map();
  const vida = new AbortController();
  let orto = false;
  let expandido = false;
  let modoRepr = 'bolas';        // 'bolas' | 'superficie' | 'vdw' | 'bastoes' | 'fita'
  let modoCor = 'cpk';           // 'cpk' | 'mep' | 'farmaco' | 'bfactor'
  let modoH = 'todos';           // 'todos' | 'polares' | 'nenhum'
  let verAneis = false;
  let verPontesH = false;
  let verQuiral = false;
  let modoRegua = false;
  let selecionados = [];
  let hoverItem = null;
  let projecoesTela = [];
  let cenaSuja = true;
  let raf = 0;
  let arrastando = null;

  const selHtml = opcoes3d.length > 1
    ? `<label class="so-leitor" for="sel-3d-${molMeta.id || 0}">${tr('Estrutura 3D')}</label><select id="sel-3d-${molMeta.id || 0}" data-sel-3d style="padding:.22rem .48rem;border-radius:7px;border:1px solid var(--linha2);background:var(--surface);color:var(--ink);font-size:.74rem">${opcoes3d.map((e, i) => {
        const rot = `${tr(e.natureza === 'experimental' ? 'Experimental' : e.natureza === 'predicao_computacional' ? 'Predita' : 'Confôrmero calculado')} · ${esc(e.acesso)}`;
        return `<option value="${i}">${rot}</option>`;
      }).join('')}</select>`
    : '';

  container.innerHTML = `
    <div class="lab3d-bloco" data-lab3d-raiz>
      <div class="mol-campo">
        <div class="lab3d-palco" data-lab3d-palco>
          <canvas class="lab3d-sombra" aria-hidden="true"></canvas>
          <canvas class="lab3d-gl" aria-hidden="true"></canvas>
          <canvas class="lab3d-hud" tabindex="0" aria-label="${tr('Estrutura 3D. Setas giram, + e − aproximam, colchetes percorrem átomos e ligações, Enter fixa.')}"></canvas>
          <div class="lab3d-calibre-barra" data-calibre-barra hidden></div>
          <div class="lab3d-inspetor" data-inspetor hidden></div>
        </div>
        <div class="mol-elementos" data-elementos></div>
        <div class="mol-camera" role="group" aria-label="${tr('Câmera')}">
          <span class="mol-escala" title="${tr('Escala no plano central da molécula')}"><i data-escala></i>1 Å</span>
          ${[['menos','menos','Afastar'],['mais','mais','Aproximar'],['reset','alvo','Alinhar'],['expandir','expandir','Ampliar o visualizador']].map(([ac,icon,label]) =>
            `<button type="button" data-3d="${ac}" title="${tr(label)}" aria-label="${tr(label)}">${icone(icon)}</button>`).join('')}
        </div>
      </div>
      <div class="mol-instrumentos">
        <div class="mol-comandos">
          <div>${selHtml}<label data-conf-label hidden>${tr('Confôrmero')} <select data-conf></select></label>
            <span data-lab3d-badge class="badge ind">${tr('Carregando…')}</span></div>
          <div><button type="button" class="lab3d-chip" data-3d="regua" aria-pressed="false">${icone('regua')}${tr('Medir')}</button>
          <button type="button" class="lab3d-btn-sdf" data-3d-sdf hidden>${icone('baixar')}<span data-sdf-rotulo>${tr('Baixar SDF')}</span></button>
          <button type="button" class="lab3d-chip" data-xyz hidden>${tr('Baixar XYZ')}</button></div>
        </div>
        <p data-render-status role="status" hidden></p>
        <div data-inspecao hidden>
          <div class="mol-inspecao-topo"><label>${tr('Inspecionar')} <select data-item></select></label>
            <button type="button" class="lab3d-chip" data-fixar>${tr('Fixar detalhe')}</button>
            <button type="button" class="lab3d-chip" data-ponto hidden>${tr('Adicionar à régua')}</button></div>
          <div data-propriedades aria-live="polite"></div><div data-fixados></div>
          <details data-comparacao hidden><summary>${tr('Comparar torções')}</summary>
            <label>${tr('Átomos da torção')} <select data-torcao></select></label><div data-angulos></div>
          </details>
        </div>
        <details class="mol-ajustes"><summary>${tr('Representação e fontes')}</summary>
          <div class="lab3d-grupo">
            <button type="button" class="lab3d-chip" data-3d="girar" aria-pressed="false">${tr('Girar')}</button>
            <button type="button" class="lab3d-chip" data-3d="orto" aria-pressed="false">${tr('Perspectiva')}</button>
            <button type="button" class="lab3d-chip" data-3d="foto">${icone('camera')}${tr('Salvar imagem PNG')}</button>
          </div>
      <div class="lab3d-subbarra" aria-label="${tr('Representação e cores')}">
        <div class="lab3d-grupo" role="group" aria-label="${tr('Representação')}" data-grupo-repr>
          <span class="lab3d-rotulo">${tr('Representação')}</span>
          <button type="button" class="lab3d-chip" data-repr="bolas" aria-pressed="true">${tr('Bolas e bastões')}</button>
          <button type="button" class="lab3d-chip" data-repr="superficie" aria-pressed="false">${tr('Superfície (MEP)')}</button>
          <button type="button" class="lab3d-chip" data-repr="vdw" aria-pressed="false">${tr('Van der Waals')}</button>
          <button type="button" class="lab3d-chip" data-repr="bastoes" aria-pressed="false">${tr('Bastões')}</button>
          <button type="button" class="lab3d-chip" data-repr="fita" aria-pressed="false" hidden>${tr('Fita')}</button>
        </div>
        <div class="lab3d-grupo" role="group" aria-label="${tr('Cor')}" data-grupo-cor>
          <span class="lab3d-rotulo">${tr('Cor')}</span>
          <button type="button" class="lab3d-chip" data-cor="cpk" aria-pressed="true">CPK</button>
          <button type="button" class="lab3d-chip" data-cor="mep" aria-pressed="false">${tr('Potencial eletrostático')}</button>
          <button type="button" class="lab3d-chip" data-cor="farmaco" aria-pressed="false">${tr('Farmacóforo')}</button>
          <button type="button" class="lab3d-chip" data-cor="bfactor" aria-pressed="false" hidden>${tr('pLDDT ou fator B')}</button>
        </div>
        <div class="lab3d-grupo" role="group" aria-label="${tr('Camadas e medidas')}">
          <button type="button" class="lab3d-chip" data-camada="aneis" aria-pressed="false" title="${tr('Sistemas aromáticos')}">${tr('Anéis aromáticos')}</button>
          <button type="button" class="lab3d-chip" data-camada="pontesh" aria-pressed="false" title="${tr('Ligações de hidrogênio intramoleculares')}">${tr('Ligações de H')}</button>
          <button type="button" class="lab3d-chip" data-camada="quiral" aria-pressed="false" title="${tr('Descritores CIP (R)/(S) e (E)/(Z)')}">${tr('Estereodescritores')}</button>
          <button type="button" class="lab3d-chip" data-3d="hidrogenios" title="${tr('Hidrogênios exibidos')}">${tr('Todos os H')}</button>

        </div>
      </div>

      <div class="lab3d-telemetria" data-telemetria></div>
      <div class="lab3d-rodape" data-rodape></div></details></div>
    </div>`;

  const raizBloco = container.querySelector('[data-lab3d-raiz]');
  const palco = container.querySelector('[data-lab3d-palco]');
  const cvGl = container.querySelector('canvas.lab3d-gl');
  const cvHud = container.querySelector('canvas.lab3d-hud');
  let motorGL = criarMotorGL2(cvGl);
  const perfilInicial = () => {
    if (!motorGL) return;
    const gl = motorGL.gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
    simplificar = !!ext && /swiftshader|llvmpipe|software/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  };
  perfilInicial();
  const ctxHud = cvHud.getContext('2d', { willReadFrequently: simplificar });
  let sombraEm = -Infinity;
  const cvSombra = container.querySelector('.lab3d-sombra');
  const sombra = cvSombra.getContext('2d');
  const penumbra = document.createElement('canvas');
  penumbra.width = penumbra.height = 64;
  const pincel = penumbra.getContext('2d');
  const degradado = pincel.createRadialGradient(32, 32, 0, 32, 32, 32);
  degradado.addColorStop(0, 'rgba(2,10,12,.21)');
  degradado.addColorStop(.46, 'rgba(1,9,11,.088)');
  degradado.addColorStop(1, 'rgba(0,7,9,0)');
  pincel.fillStyle = degradado; pincel.fillRect(0, 0, 64, 64);
  if (!motorGL) cvGl.hidden = true;

  const badge = container.querySelector('[data-lab3d-badge]');
  const btnSdf = container.querySelector('[data-3d-sdf]');
  const rotuloSdf = container.querySelector('[data-sdf-rotulo]');
  const btnFita = container.querySelector('[data-repr="fita"]');
  const btnBfac = container.querySelector('[data-cor="bfactor"]');
  const barraCalibre = container.querySelector('[data-calibre-barra]');
  const inspetor = container.querySelector('[data-inspetor]');
  const telemetria = container.querySelector('[data-telemetria]');
  const rodape = container.querySelector('[data-rodape]');

  const q = (sel) => container.querySelector(sel);
  const fonteAtual = () => {
    const info = opcoes3d[idxAtual];
    return info.natureza === 'experimental' ? tr('Coordenadas medidas') + ' · ' + info.fonte + ' ' + info.acesso
      : tr('Coordenadas calculadas') + ' · ' + traduzirMetodo3D(info.metodo || info.fonte) + (modelo?.raw.rdkit ? ' · RDKit ' + modelo.raw.rdkit : '');
  };
  function avisarModoSimples() {
    const status = q('[data-render-status]');
    status.hidden = false;
    status.textContent = tr('WebGL indisponível. Projeção simplificada das coordenadas 3D.');
  }
  if (!motorGL) avisarModoSimples();

  function atomoVisivel(at) {
    if (at.s !== 'H') return true;
    if (modoH === 'todos') return true;
    if (modoH === 'polares') return at.polarH;
    return false;
  }

  function corAtomoRgb(at, claro, bMin = 0, bMax = 100, ehPredicao = false) {
    if (modoCor === 'mep') return corEletrostaticaRgb((at.g || 0) + (at.q || 0) * 0.55, claro);
    if (modoCor === 'farmaco') return corFarmacoforoRgb(at, claro);
    if (modoCor === 'bfactor') return ehPredicao ? corPLDDTRgb(at.bf || 75) : corBFactorRgb(at.bf || 20, bMin, bMax);
    return infoEl(at.s)[0];
  }

  function atualizarBuffersGL() {
    if (!modelo) return;
    const gl = motorGL?.gl;
    const claro = temaClaro();
    const info = opcoes3d[idxAtual] || {};
    const ehPred = info.natureza === 'predicao_computacional';

    const esferas = []; // 8 floats/instância
    const capsulas = []; // 13 floats/instância
    const setSel = new Set(selecionados.map((s) => s.chave));

    const pushEsf = (x, y, z, r, rgb, sel = false) => {
      esferas.push(x, y, z, r, rgb[0], rgb[1], rgb[2], sel ? 2.0 : 1.0);
    };
    const pushCap = (ax, ay, az, bx, by, bz, r, rgbA, rgbB) => {
      capsulas.push(ax, ay, az, bx, by, bz, r, rgbA[0], rgbA[1], rgbA[2], rgbB[0], rgbB[1], rgbB[2]);
    };

    if (modoRepr === 'fita' && modelo.temCadeia) {
      const ca = modelo.ca;
      const bs = ca.map((c) => c[5]);
      const bMin = Math.min(...bs), bMax = Math.max(...bs);
      const corRes = (c, idx) => {
        if (modoCor === 'cpk') {
          const t = idx / Math.max(1, ca.length - 1);
          return [0.16 + 0.72 * t, 0.84 - 0.30 * Math.abs(t - 0.5), 0.74 - 0.52 * t];
        }
        return ehPred ? corPLDDTRgb(c[5]) : corBFactorRgb(c[5], bMin, bMax);
      };
      const passos = ca.length > 340 ? 3 : 4;
      for (let i = 0; i < ca.length - 1; i++) {
        const p0 = ca[Math.max(0, i - 1)].slice(2, 5);
        const p1 = ca[i].slice(2, 5);
        const p2 = ca[i + 1].slice(2, 5);
        const p3 = ca[Math.min(ca.length - 1, i + 2)].slice(2, 5);
        const cA = corRes(ca[i], i), cB = corRes(ca[i + 1], i + 1);
        const ss = ca[i][6] || 'C';
        const rTubo = ss === 'H' ? 0.44 : (ss === 'E' ? 0.36 : 0.21);
        let ant = p1;
        for (let s = 1; s <= passos; s++) {
          const t = s / passos;
          const cur = interpCatmull(p0, p1, p2, p3, t);
          const cm = [cA[0] + (cB[0] - cA[0]) * t, cA[1] + (cB[1] - cA[1]) * t, cA[2] + (cB[2] - cA[2]) * t];
          pushCap(ant[0], ant[1], ant[2], cur[0], cur[1], cur[2], rTubo, cm, cm);
          ant = cur;
        }
        if (setSel.has(`ca:${i}`)) pushEsf(p1[0], p1[1], p1[2], rTubo * 1.45, cA, true);
      }
      const ult = ca[ca.length - 1];
      if (setSel.has(`ca:${ca.length - 1}`)) pushEsf(ult[2], ult[3], ult[4], 0.55, corRes(ult, ca.length - 1), true);

      // Pontes dissulfeto Cys–Cys (contas douradas)
      const ouro = claro ? [0.75, 0.45, 0.06] : [0.98, 0.80, 0.14];
      for (const [i, j] of modelo.ssBonds) {
        if (!ca[i] || !ca[j]) continue;
        const ax = ca[i][2], ay = ca[i][3], az = ca[i][4];
        const bx = ca[j][2], by = ca[j][3], bz = ca[j][4];
        for (let k = 0; k < 5; k++) {
          const t0 = k / 5 + 0.03, t1 = (k + 0.62) / 5;
          pushCap(
            ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0,
            ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1,
            0.15, ouro, ouro,
          );
        }
      }
      if (motorGL) motorGL.nMalha = 0;
    } else if (modelo.temAtomos) {
      const { atomos, ligacoes } = modelo;
      const bfs = atomos.map((a) => a.bf || 0);
      const bMin = Math.min(...bfs), bMax = Math.max(...bfs);
      const coresAt = atomos.map((a) => corAtomoRgb(a, claro, bMin, bMax, ehPred));
      const ehVdw = modoRepr === 'vdw';
      const ehBastao = modoRepr === 'bastoes';

      for (let i = 0; i < atomos.length; i++) {
        const at = atomos[i];
        if (!atomoVisivel(at)) continue;
        const [, rBall, rVdw] = infoEl(at.s, claro);
        const r = ehVdw ? rVdw * 0.92 : (ehBastao ? 0.21 : rBall * 0.96);
        const sel = setSel.has(`at:${i}`) || (hoverItem?.chave === `at:${i}`);
        pushEsf(at.x, at.y, at.z, sel ? r * 1.14 : r, coresAt[i], sel);
      }

      if (!ehVdw) {
        for (const bd of ligacoes) {
          const a1 = atomos[bd.a], a2 = atomos[bd.b];
          if (!a1 || !a2 || !atomoVisivel(a1) || !atomoVisivel(a2)) continue;
          const inspecionada = hoverItem?.chave === 'bd:' + bd.idx;
          const c1 = inspecionada ? [.63,.85,.69] : coresAt[bd.a], c2 = inspecionada ? [.63,.85,.69] : coresAt[bd.b];
          const dx = a2.x - a1.x, dy = a2.y - a1.y, dz = a2.z - a1.z;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const ux = dx / dl, uy = dy / dl, uz = dz / dl;

          // Vetor perpendicular no plano do anel (ou arbitrário estável)
          let refX = 0, refY = 0, refZ = 1;
          if (Math.abs(uz) > 0.88) { refX = 0; refY = 1; refZ = 0; }
          let px = uy * refZ - uz * refY, py = uz * refX - ux * refZ, pz = ux * refY - uy * refX;
          const pl = Math.hypot(px, py, pz) || 1;
          px /= pl; py /= pl; pz /= pl;

          const rLig = ehBastao ? 0.20 : 0.119;
          if (bd.aro && !ehBastao) {
            const off = 0.115;
            pushCap(a1.x + px * off, a1.y + py * off, a1.z + pz * off, a2.x + px * off, a2.y + py * off, a2.z + pz * off, 0.078, c1, c2);
            for (let k = 0; k < 3; k++) {
              const t0 = (k + 0.12) / 3, t1 = (k + 0.68) / 3;
              pushCap(
                a1.x - px * off + dx * t0, a1.y - py * off + dy * t0, a1.z - pz * off + dz * t0,
                a1.x - px * off + dx * t1, a1.y - py * off + dy * t1, a1.z - pz * off + dz * t1,
                0.064, c1, c2,
              );
            }
          } else if (bd.ko === 2 && !ehBastao) {
            const off = 0.125;
            pushCap(a1.x + px * off, a1.y + py * off, a1.z + pz * off, a2.x + px * off, a2.y + py * off, a2.z + pz * off, 0.075, c1, c2);
            pushCap(a1.x - px * off, a1.y - py * off, a1.z - pz * off, a2.x - px * off, a2.y - py * off, a2.z - pz * off, 0.075, c1, c2);
          } else if (bd.ko === 3 && !ehBastao) {
            const off = 0.155;
            for (const s of [-1, 0, 1]) {
              pushCap(a1.x + px * off * s, a1.y + py * off * s, a1.z + pz * off * s, a2.x + px * off * s, a2.y + py * off * s, a2.z + pz * off * s, 0.064, c1, c2);
            }
          } else {
            pushCap(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, rLig, c1, c2);
          }
        }
      }

      // Orbitais π aromáticos (anéis conjugados)
      if (verAneis && aneisPi.length && !ehVdw) {
        const corPi = claro ? [0.08, 0.56, 0.42] : [0.32, 0.94, 0.78];
        for (const anel of aneisPi) {
          const [cx, cy, cz] = anel.c;
          const [nx, ny, nz] = anel.n;
          let rx0 = 0, ry0 = 0, rz0 = 1;
          if (Math.abs(nz) > 0.88) { rx0 = 1; rz0 = 0; }
          let u0x = ny * rz0 - nz * ry0, u0y = nz * rx0 - nx * rz0, u0z = nx * ry0 - ny * rx0;
          const ul = Math.hypot(u0x, u0y, u0z) || 1;
          u0x /= ul; u0y /= ul; u0z /= ul;
          const v0x = ny * u0z - nz * u0y, v0y = nz * u0x - nx * u0z, v0z = nx * u0y - ny * u0x;
          const NSEG = 12;
          for (let s = 0; s < NSEG; s++) {
            const a0 = (s / NSEG) * Math.PI * 2;
            const a1s = ((s + 0.62) / NSEG) * Math.PI * 2;
            pushCap(
              cx + anel.r * (Math.cos(a0) * u0x + Math.sin(a0) * v0x),
              cy + anel.r * (Math.cos(a0) * u0y + Math.sin(a0) * v0y),
              cz + anel.r * (Math.cos(a0) * u0z + Math.sin(a0) * v0z),
              cx + anel.r * (Math.cos(a1s) * u0x + Math.sin(a1s) * v0x),
              cy + anel.r * (Math.cos(a1s) * u0y + Math.sin(a1s) * v0y),
              cz + anel.r * (Math.cos(a1s) * u0z + Math.sin(a1s) * v0z),
              0.042, corPi, corPi,
            );
          }
        }
      }

      // Pontes de hidrogênio intramoleculares D–H···A
      if (verPontesH && pontesH.length) {
        const corHB = claro ? [0.06, 0.52, 0.78] : [0.22, 0.86, 0.98];
        for (const hb of pontesH) {
          const ini = atomoVisivel(atomos[hb.hIdx]) ? atomos[hb.hIdx] : atomos[hb.dIdx];
          const fim = atomos[hb.aIdx];
          for (let k = 0; k < 4; k++) {
            const t = (k + 0.5) / 4;
            pushEsf(ini.x + (fim.x - ini.x) * t, ini.y + (fim.y - ini.y) * t, ini.z + (fim.z - ini.z) * t, 0.072, corHB, false);
          }
        }
      }

      // Superfície Molecular Translúcida MEP
      if (modoRepr === 'superficie' && motorGL) {
        const chaveM = `${idxAtual}:${modoH === 'nenhum' ? 'noH' : 'H'}`;
        if (!malhaCache.has(chaveM)) {
          malhaCache.set(chaveM, construirSuperficieMEP(modelo, modoH === 'nenhum'));
        }
        const malha = malhaCache.get(chaveM);
        if (malha && malha.nVerts > 0) {
          const inter = new Float32Array(malha.nVerts * 9);
          for (let v = 0; v < malha.nVerts; v++) {
            const c = modoCor === 'farmaco'
              ? (malha.pot[v] < -0.06 ? [0.96, 0.42, 0.34] : malha.pot[v] > 0.06 ? [0.22, 0.68, 0.98] : [0.22, 0.82, 0.58])
              : corEletrostaticaRgb(malha.pot[v], claro);
            const o = v * 9, p3 = v * 3;
            inter[o] = malha.pos[p3]; inter[o + 1] = malha.pos[p3 + 1]; inter[o + 2] = malha.pos[p3 + 2];
            inter[o + 3] = malha.norm[p3]; inter[o + 4] = malha.norm[p3 + 1]; inter[o + 5] = malha.norm[p3 + 2];
            inter[o + 6] = c[0]; inter[o + 7] = c[1]; inter[o + 8] = c[2];
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, motorGL.bufMalha);
          gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
          motorGL.nMalha = malha.nVerts;
        } else {
          if (motorGL) motorGL.nMalha = 0;
        }
      } else {
        if (motorGL) motorGL.nMalha = 0;
      }
    }

    instancias = [esferas, capsulas]; sprites = null; cenaSuja = false;
    if (!motorGL) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, motorGL.bufEsf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(esferas), gl.DYNAMIC_DRAW);
    motorGL.nEsf = esferas.length / 8;

    gl.bindBuffer(gl.ARRAY_BUFFER, motorGL.bufCap);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(capsulas), gl.DYNAMIC_DRAW);
    motorGL.nCap = capsulas.length / 13;
    cenaSuja = false;
  }

  function atualizarCalibreUI() {
    if (!modoRegua && !selecionados.length) {
      barraCalibre.hidden = true;
      return;
    }
    barraCalibre.hidden = false;
    const med = calcularMedidaGeometrica(selecionados);
    const rotPts = selecionados.map((s) => s.rotulo).join(' → ');
    barraCalibre.innerHTML = med
      ? `<strong>${med.tipo}: ${med.valor}</strong> <span class="mono" style="opacity:.85">(${esc(rotPts)})</span> <button type="button" class="lab3d-chip" data-limpar-regua style="padding:.1rem .38rem">${tr('Limpar')}</button>`
      : `<span>${tr('Selecione 2 átomos (distância, Å), 3 (ângulo, °) ou 4 (diedro, °).')}${rotPts ? ` <span class="mono">${esc(rotPts)}</span>` : ''}</span>${selecionados.length ? ` <button type="button" class="lab3d-chip" data-limpar-regua style="padding:.1rem .38rem">${tr('Limpar')}</button>` : ''}`;
  }

  function desenhar(agora = performance.now()) {
    raf = 0;
    if (!cvHud.isConnected || !modelo || !ativo || !visivel || document.hidden || !palco.clientWidth) return;
    const dt = agora - ultimoQuadro;
    ultimoQuadro = agora;
    if (dt > 0 && dt < 250 && (arrastando || abertura || girando)) {
      pesoFrame = pesoFrame * .85 + dt * .15;
      quadrosLentos = pesoFrame > 24 ? quadrosLentos + 1 : 0;
      if (quadrosLentos >= 10 && qualidade > .75) {
        simplificar = true; qualidade = Math.max(.7, qualidade * .76);
        quadrosLentos = 0;
      }
    }
    if (movimentoPausado()) { abertura = null; girando = false; }
    if (abertura) {
      const t = Math.min(1, (agora - abertura.inicio) / 1050);
      const resto = (1 - t) ** 3;
      ry = desc3d.ryIdeal - .30 * resto; rx = desc3d.rxIdeal + .09 * resto; zoom = 1 - .09 * resto;
      if (t === 1) abertura = null;
    }
    const interagindo = !!(arrastando || girando || abertura || agora - ultimaInteracao < 180);
    const usarSprites = modelo.temAtomos && (!motorGL || (simplificar && interagindo)) && modoRepr !== 'superficie';
    const dpr = interagindo ? Math.min(qualidade, usarSprites ? 1.5 : 2) : Math.min(devicePixelRatio || 1, 2);
    if (motorGL && usarSprites && interagindo && !arrastando && !girando && !abertura) {
      clearTimeout(reconstituir);
      reconstituir = setTimeout(() => pedirQuadro(), 200);
    }
    const w = Math.max(220, palco.clientWidth || 340);
    const h = Math.max(220, palco.clientHeight || 365);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);

    if (cvHud.width !== pw || cvHud.height !== ph) {
      cvHud.width = pw; cvHud.height = ph;
    }
    if (motorGL && (cvGl.width !== pw || cvGl.height !== ph)) {
      cvGl.width = pw; cvGl.height = ph;
    }

    const claro = temaClaro();
    const fov = 0.62; // ~35.5°
    const aspect = w / h;
    if (!enquadramento || enquadramento.aspect !== aspect) {
      let altura = rBase / Math.min(1, aspect);
      if (modelo.temAtomos) {
        let limite = 0;
        for (const at of modelo.atomos) {
          const [x,y,z] = rotacionarPt(at.x,at.y,at.z,desc3d.rxIdeal,desc3d.ryIdeal);
          const raio = infoEl(at.s)[1] + .16;
          limite = Math.max(limite, Math.max((Math.abs(x)+raio)/aspect, Math.abs(y)+raio) + z * Math.tan(fov*.5));
        }
        altura = Math.max(1.8, limite * 1.17, altura * .60);
      }
      enquadramento = { aspect, altura };
    }
    const halfH = enquadramento.altura / zoom;
    const camDist = halfH / Math.tan(fov * .5);
    const near = Math.max(0.25, camDist - rBase * 2.8);
    const far = camDist + rBase * 3.2;

    if (cenaSuja) atualizarBuffersGL();
    cvGl.hidden = !motorGL || usarSprites;
    palco.dataset.motor = usarSprites ? 'atlas' : motorGL ? 'webgl2' : 'canvas';
    if (motorGL && !usarSprites) {
      const { gl } = motorGL;
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      const mV = matView(rx, ry, panX, panY, camDist);
      const mP = orto ? matOrtografica(halfH, aspect, near, far) : matPerspectiva(fov, aspect, near, far);
      const fogCol = claro ? [0.90, 0.87, 0.81] : [0.03, 0.07, 0.06];
      const fogNear = camDist - rBase * 0.25;
      const fogFar = camDist + rBase * 2.35;

      const setComuns = (u) => {
        gl.uniformMatrix4fv(u.u_view, false, mV);
        gl.uniformMatrix4fv(u.u_proj, false, mP);
        gl.uniform1f(u.u_ortho, orto ? 1.0 : 0.0);
        gl.uniform1f(u.u_fogNear, fogNear);
        gl.uniform1f(u.u_fogFar, fogFar);
        gl.uniform3fv(u.u_fogColor, fogCol);
      };

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      if (motorGL.nEsf > 0) {
        gl.useProgram(motorGL.progEsf);
        setComuns(motorGL.uEsf);
        gl.bindVertexArray(motorGL.vaoEsf);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, motorGL.nEsf);
      }
      if (motorGL.nCap > 0) {
        gl.useProgram(motorGL.progCap);
        setComuns(motorGL.uCap);
        gl.bindVertexArray(motorGL.vaoCap);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, motorGL.nCap);
      }
      if (motorGL.nMalha > 0) {
        gl.useProgram(motorGL.progMalha);
        setComuns(motorGL.uMalha);
        gl.uniform1f(motorGL.uMalha.u_alpha, 0.56);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.enable(gl.CULL_FACE);
        gl.bindVertexArray(motorGL.vaoMalha);
        gl.cullFace(gl.FRONT);
        gl.drawArrays(gl.TRIANGLES, 0, motorGL.nMalha);
        gl.cullFace(gl.BACK);
        gl.drawArrays(gl.TRIANGLES, 0, motorGL.nMalha);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
    }

    // ── Camada 2D HUD (Rótulos estereoquímicos, régua metrológica, sombra de pedestal + fallback 2D se sem WebGL2) ──
    ctxHud.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxHud.clearRect(0, 0, w, h);

    const fProj = 1.0 / Math.tan(fov * 0.5);
    const projTela = (x, y, z) => {
      const [xr, yr, zr] = rotacionarPt(x, y, z, rx, ry);
      const xe = xr + panX, ye = yr + panY, ze = zr - camDist;
      if (orto) {
        return { sx: w * 0.5 + (xe / (halfH * aspect)) * (w * 0.5), sy: h * 0.5 - (ye / halfH) * (h * 0.5), z: zr, escPx: (h * 0.5) / halfH };
      }
      const invZ = 1.0 / Math.max(0.4, -ze);
      return {
        sx: w * 0.5 + (xe * fProj / aspect) * invZ * (w * 0.5),
        sy: h * 0.5 - (ye * fProj) * invZ * (h * 0.5),
        z: zr,
        escPx: (h * 0.5) * fProj * invZ,
      };
    };

    const pxAngstrom = (h * .5) / halfH;
    q('[data-escala]').style.width = pxAngstrom + 'px';
    // Penumbra por átomo num plano fixo. A rotação muda a projeção da sombra, nunca as coordenadas.
    const sw = Math.max(1, Math.round(w / 3)), sh = Math.max(1, Math.round(h / 3));
    if (cvSombra.width !== sw || cvSombra.height !== sh) { cvSombra.width = sw; cvSombra.height = sh; }
    if (!usarSprites || !interagindo || agora - sombraEm >= 115) {
      sombraEm = agora;
      sombra.clearRect(0, 0, sw, sh);
      for (const at of modelo.atomos) {
        if (at.s === 'H') continue;
        const [x, y, z] = rotacionarPt(at.x, at.y, at.z, rx, ry);
        const largura = (2.15 + (y / rBase + 1) * .85) * pxAngstrom / 3;
        const sx = sw / 2 + (x + panX + .16 * y) * pxAngstrom / 3;
        const sy = sh * .88 + (z * .16 - panY) * pxAngstrom / 3;
        sombra.drawImage(penumbra, sx - largura, sy - largura * .26, largura * 2, largura * .52);
      }
    }
    pontosLigacao = [];
    projecoesTela = [];
    if (modoRepr === 'fita' && modelo.temCadeia) {
      const ca = modelo.ca;
      if (!motorGL) {
        const bs = ca.map((c) => c[5]);
        const bMin = Math.min(...bs), bMax = Math.max(...bs);
        const ehPred = opcoes3d[idxAtual]?.natureza === 'predicao_computacional';
        const segs = [];
        for (let i = 0; i < ca.length - 1; i++) {
          const pa = projTela(ca[i][2], ca[i][3], ca[i][4]);
          const pb = projTela(ca[i + 1][2], ca[i + 1][3], ca[i + 1][4]);
          segs.push({ z: (pa.z + pb.z) * 0.5, pa, pb, cor: rgbCss(ehPred ? corPLDDTRgb(ca[i][5]) : corBFactorRgb(ca[i][5], bMin, bMax)) });
        }
        segs.sort((a, b) => a.z - b.z);
        for (const sg of segs) {
          ctxHud.strokeStyle = sg.cor;
          ctxHud.lineWidth = 3.2;
          ctxHud.lineCap = 'round';
          ctxHud.beginPath(); ctxHud.moveTo(sg.pa.sx, sg.pa.sy); ctxHud.lineTo(sg.pb.sx, sg.pb.sy); ctxHud.stroke();
        }
      }
      ca.forEach((c, idx) => {
        const p = projTela(c[2], c[3], c[4]);
        projecoesTela.push({
          chave: `ca:${idx}`, sx: p.sx, sy: p.sy, z: p.z, rPx: Math.max(7, 0.5 * p.escPx),
          x: c[2], y: c[3], z3: c[4],
          rotulo: `${c[1]}${c[0]}`,
          detalhe: `${c[1]} ${c[0]} · ${tr(c[6] === 'H' ? 'α-hélice' : c[6] === 'E' ? 'fita β' : 'alça')} · ${opcoes3d[idxAtual]?.natureza === 'predicao_computacional' ? `pLDDT ${fmtDec(c[5], 1)}` : `B ${fmtDec(c[5], 1)} Å²`}`,
        });
      });
      const pN = projTela(ca[0][2], ca[0][3], ca[0][4]);
      const pC = projTela(ca[ca.length - 1][2], ca[ca.length - 1][3], ca[ca.length - 1][4]);
      ctxHud.font = '700 10.5px ui-monospace, monospace';
      ctxHud.fillStyle = claro ? '#065f46' : '#6ee7b7';
      ctxHud.fillText(tr('N-terminal'), pN.sx + 6, pN.sy - 5);
      ctxHud.fillStyle = claro ? '#991b1b' : '#fca5a5';
      ctxHud.fillText(tr('C-terminal'), pC.sx + 6, pC.sy - 5);
    } else if (modelo.temAtomos) {
      const { atomos, ligacoes } = modelo;
      const bfs = atomos.map((a) => a.bf || 0);
      const bMin = Math.min(...bfs), bMax = Math.max(...bfs);
      const ehPred = opcoes3d[idxAtual]?.natureza === 'predicao_computacional';

      if (usarSprites && instancias) {
        sprites ||= prepararSprites(...instancias);
        desenharSprites(ctxHud, sprites, projTela);
      }

      for (let i = 0; i < atomos.length; i++) {
        const at = atomos[i];
        if (!atomoVisivel(at)) continue;
        const p = projTela(at.x, at.y, at.z);
        const [, rB, rV] = infoEl(at.s, claro);
        const rMundo = modoRepr === 'vdw' ? rV * 0.92 : rB;
        const rPx = Math.max(6, rMundo * p.escPx);
        projecoesTela.push({
          chave: `at:${i}`, sx: p.sx, sy: p.sy, z: p.z, rPx,
          x: at.x, y: at.y, z3: at.z,
          rotulo: `${at.s}${i + 1}`,
        });

        if (verQuiral && at.cip && at.cip !== '?') {
          const txt = `(${at.cip})`;
          ctxHud.font = '700 10px ui-monospace, monospace';
          const tw = ctxHud.measureText(txt).width + 8;
          const bx = p.sx - tw * 0.5, by = p.sy - Math.min(22, rPx * 0.85) - 14;
          ctxHud.fillStyle = claro ? 'rgba(254,243,199,0.92)' : 'rgba(20,38,32,0.88)';
          ctxHud.strokeStyle = claro ? '#b45309' : '#fbbf24';
          ctxHud.lineWidth = 1;
          ctxHud.beginPath(); ctxHud.roundRect(bx, by, tw, 14, 4); ctxHud.fill(); ctxHud.stroke();
          ctxHud.fillStyle = claro ? '#92400e' : '#fde047';
          ctxHud.textAlign = 'center';
          ctxHud.fillText(txt, p.sx, by + 10.2);
          ctxHud.textAlign = 'start';
        }
      }

      if (modoRepr !== 'vdw') {
        modelo.ligacoes.forEach((bd, bi) => {
          const a = atomos[bd.a], b = atomos[bd.b];
          if (!atomoVisivel(a) || !atomoVisivel(b)) return;
          pontosLigacao.push({ chave: 'bd:' + bi, a: projTela(a.x,a.y,a.z), b: projTela(b.x,b.y,b.z) });
        });
      }
      // Rótulos E/Z nas ligações duplas estereogênicas
      if (verQuiral) {
        for (const bd of ligacoes) {
          if (!bd.ez) continue;
          const a1 = atomos[bd.a], a2 = atomos[bd.b];
          const pm = projTela((a1.x + a2.x) * 0.5, (a1.y + a2.y) * 0.5, (a1.z + a2.z) * 0.5);
          ctxHud.font = '700 9.5px ui-monospace, monospace';
          ctxHud.fillStyle = claro ? '#0f766e' : '#5eead4';
          ctxHud.fillText(`(${bd.ez})`, pm.sx + 4, pm.sy - 4);
        }
      }

      // Distâncias das pontes de hidrogênio quando ativas
      if (verPontesH && pontesH.length <= 12) {
        ctxHud.font = '600 9.5px ui-monospace, monospace';
        ctxHud.fillStyle = claro ? '#0369a1' : '#7dd3fc';
        for (const hb of pontesH) {
          const ini = atomoVisivel(atomos[hb.hIdx]) ? atomos[hb.hIdx] : atomos[hb.dIdx];
          const fim = atomos[hb.aIdx];
          const pm = projTela((ini.x + fim.x) * 0.5, (ini.y + fim.y) * 0.5, (ini.z + fim.z) * 0.5);
          ctxHud.fillText(`${fmtDec(hb.dist, 2)} Å`, pm.sx + 4, pm.sy - 3);
        }
      }
    }

    // Calibre metrológico 2D/3D (linhas + marcadores numerados)
    if (selecionados.length) {
      const ptsSel = selecionados.map((s) => projTela(s.x, s.y, s.z));
      if (ptsSel.length >= 2) {
        ctxHud.save();
        ctxHud.strokeStyle = claro ? '#047857' : '#34d399';
        ctxHud.lineWidth = 2;
        ctxHud.setLineDash([5, 3]);
        ctxHud.beginPath();
        ptsSel.forEach((p, idx) => { if (idx === 0) ctxHud.moveTo(p.sx, p.sy); else ctxHud.lineTo(p.sx, p.sy); });
        ctxHud.stroke();
        ctxHud.restore();
      }
      ptsSel.forEach((p, idx) => {
        ctxHud.strokeStyle = claro ? '#047857' : '#6ee7b7';
        ctxHud.lineWidth = 2;
        ctxHud.beginPath(); ctxHud.arc(p.sx, p.sy, 8, 0, Math.PI * 2); ctxHud.stroke();
        ctxHud.font = '700 10px ui-monospace, monospace';
        ctxHud.fillStyle = claro ? '#064e3b' : '#ecfdf5';
        ctxHud.fillText(String(idx + 1), p.sx + 10, p.sy - 6);
      });
    }

    if ((abertura || girando) && !movimentoPausado() && !arrastando) {
      if (girando) ry += Math.min(dt, 40) * .00012;
      raf = requestAnimationFrame(desenhar);
    }
  }

  function pedirQuadro(sujarCena = false) {
    if (sujarCena) cenaSuja = true;
    if (!raf && ativo && visivel && !document.hidden && cvHud.isConnected) raf = requestAnimationFrame(desenhar);
  }

  function calcularRaioCena(mod) {
    let rMax = 2.4;
    if (mod.temAtomos) {
      for (const a of mod.atomos) rMax = Math.max(rMax, Math.hypot(a.x, a.y, a.z) + 1.35);
    }
    if (mod.temCadeia) {
      for (const c of mod.ca) rMax = Math.max(rMax, Math.hypot(c[2], c[3], c[4]) + 1.8);
    }
    return rMax;
  }

  function atualizarTelemetriaERodape(info) {
    const c = info.consulta != null ? packConsultas[info.consulta] : null;
    const txtFonte = esc(c ? tr('Fonte: {fonte}, consulta de {data}, licença {l}.', { fonte: trPartes(c.fonte_nome), data: fmtData(c.data), l: trDado(c.licenca) }) : tr('Fonte: {fonte}.', { fonte: info.fonte }));
    const item = (rotulo, valor, dica) => `<span${dica ? ` title="${esc(tr(dica))}"` : ''}>${esc(tr(rotulo))}: <b>${valor}</b></span>`;

    const itensTel = [];
    if (modelo.temAtomos) {
      const nPesados = modelo.atomos.filter((a) => a.s !== 'H').length;
      const nQuirais = modelo.atomos.filter((a) => a.cip && a.cip !== '?').length;
      itensTel.push(item('Átomos', modelo.atomos.length));
      itensTel.push(item('Átomos pesados', nPesados));
      itensTel.push(item('Ligações', modelo.ligacoes.length));
      if (nQuirais) itensTel.push(item('Estereocentros', nQuirais));
      if (aneisPi.length) itensTel.push(item('Anéis aromáticos', aneisPi.length));
      if (pontesH.length) itensTel.push(item('Ligações de H', pontesH.length));
    }
    if (modelo.temCadeia) {
      itensTel.push(item('Resíduos', modelo.ca.length));
      if (modelo.ssBonds.length) itensTel.push(item('Pontes dissulfeto', modelo.ssBonds.length));
    }
    if (desc3d.rg > 0) {
      itensTel.push(item('Raio de giro', `${fmtDec(desc3d.rg, 2)} Å`, 'Raio de giro ponderado pela massa'));
      itensTel.push(`<span title="${esc(tr('Razões normalizadas dos momentos principais de inércia (NPR1; NPR2)'))}">${esc(tr('Forma'))}: <b>${esc(tr(desc3d.forma))}</b> (${fmtDec(desc3d.npr1, 2)}; ${fmtDec(desc3d.npr2, 2)})</span>`);
    }
    telemetria.innerHTML = itensTel.join('');

    const legenda = (titulo, itens) => `<div class="lab3d-legenda-plddt"><strong>${esc(tr(titulo))}:</strong>${itens.map(([cor, texto, borda]) =>
      `<span><i style="background:${cor}${borda ? ';border:1px solid var(--linha2)' : ''}"></i>${esc(tr(texto))}</span>`).join('')}</div>`;
    let legendaCor = '';
    if (modoCor === 'mep' || modoRepr === 'superficie') {
      legendaCor = legenda('Potencial eletrostático', [['#ef3847', 'δ⁻ (rico em elétrons)'], ['#dde5e9', 'neutro', true], ['#297afa', 'δ⁺ (pobre em elétrons)']]);
    } else if (modoCor === 'farmaco') {
      legendaCor = legenda('Farmacóforo', [['#33aef9', 'doador de ligação de H'], ['#f77057', 'aceptor de ligação de H'], ['#d65ceb', 'doador e aceptor'], ['#f5bd2e', 'aromático'], ['#38d194', 'hidrofóbico']]);
    } else if (info.natureza === 'predicao_computacional') {
      legendaCor = legenda('pLDDT', [['#0053d6', '> 90'], ['#65cbf3', '70–90'], ['#ffdb13', '50–70'], ['#ff7d45', '< 50']]);
    } else if (modoCor === 'bfactor') {
      legendaCor = legenda('Fator B', [['#0053d6', 'baixo'], ['#65cbf3', 'moderado'], ['#ffdb13', 'alto'], ['#ff7d45', 'muito alto']]);
    }

    let texto;
    if (info.natureza === 'experimental') {
      const origemCurta = info.fonte === 'cod' ? 'COD' : 'wwPDB';
      badge.className = 'badge ok';
      badge.textContent = `${tr('Experimental')} · ${origemCurta} ${info.acesso}${info.resolucao ? ` (${fmtDec(info.resolucao)} Å)` : ''}`;
      texto = tr('Estrutura experimental ({metodo}).', { metodo: info.metodo || origemCurta })
        + (info.resolucao ? ` ${tr('Resolução: {r} Å.', { r: fmtDec(info.resolucao) })}` : '');
    } else if (info.natureza === 'predicao_computacional') {
      const plddt = info.plddt ?? modelo.raw?.plddt;
      badge.className = 'badge alerta';
      badge.textContent = `${tr('Predita')} · ${info.acesso}${plddt ? ` (pLDDT ${fmtDec(plddt)})` : ''}`;
      texto = tr('Modelo predito por computador ({metodo}), não determinado por experimento.', { metodo: traduzirMetodo3D(info.metodo || info.fonte) });
    } else {
      const confs = modelo.raw?.conformeros;
      const eKcal = confs?.[indiceConf]?.energia ?? info.energia_kcal_mol ?? modelo.raw?.e_kcal;
      let boltz = null;
      if (Array.isArray(confs) && confs.length >= 2 && confs.every((c) => Number.isFinite(c?.energia))) {
        const eMin = Math.min(...confs.map((c) => c.energia));
        const dE = confs.map((c) => c.energia - eMin);
        const exps = dE.map((d) => Math.exp(-d / 0.59248));
        const Z = exps.reduce((a, b) => a + b, 0) || 1;
        boltz = { dE: dE[indiceConf], w: (exps[indiceConf] / Z) * 100 };
      }
      badge.className = 'badge ind';
      badge.textContent = tr('Confôrmero calculado');
      texto = tr('Confôrmero calculado ({metodo}), não determinado por experimento.', { metodo: traduzirMetodo3D(info.metodo || modelo.raw?.met || 'RDKit ETKDGv3') })
        + (eKcal != null ? ` ${tr('Energia: {e} kcal/mol.', { e: fmtDec(eKcal) })}` : '')
        + (boltz ? ` ${tr('ΔE = {de} kcal/mol · peso de Boltzmann a 298,15 K (vácuo MMFF94s): {w}%.', { de: fmtDec(boltz.dE, 2), w: fmtDec(boltz.w, 1) })}` : '');
    }
    const limites = modelo.raw.fmt === 'ensemble-sdf-v1' ? tr('Energia de ponto único MMFF94s. A ordem só compara as poses desta molécula. Solvente e ambiente de ligação ausentes.') : '';
    rodape.innerHTML = `${legendaCor}<div>${esc(texto)} ${txtFonte} ${esc(limites)}</div>`;
    if (modelo.raw.referencias) {
      const p = document.createElement('p');
      p.textContent = 'RDKit ' + modelo.raw.rdkit + ' · seed ' + modelo.raw.seed + ' · ';
      for (const doi of modelo.raw.referencias) {
        const a = document.createElement('a');
        a.href = 'https://doi.org/' + encodeURI(doi);
        a.textContent = doi.includes('5b00654') ? 'ETKDG' : doi.includes('0c00025') ? 'ETKDGv3' : 'MMFF94';
        p.append(a, ' ');
      }
      rodape.append(p);
    }
  }

  function sincronizarBotoesBarra() {
    container.querySelectorAll('[data-repr]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.repr === modoRepr));
    });
    container.querySelectorAll('[data-cor]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.cor === modoCor));
    });
    container.querySelector('[data-camada="aneis"]')?.setAttribute('aria-pressed', String(verAneis));
    container.querySelector('[data-camada="pontesh"]')?.setAttribute('aria-pressed', String(verPontesH));
    container.querySelector('[data-camada="quiral"]')?.setAttribute('aria-pressed', String(verQuiral));
    const bH = container.querySelector('[data-3d="hidrogenios"]');
    if (bH) bH.textContent = tr(modoH === 'todos' ? 'Todos os H' : (modoH === 'polares' ? 'H polares' : 'Sem H'));
  }

  function limitesDoModelo() {
    const info = opcoes3d[idxAtual];
    if (info.fonte === 'cod') return tr('Átomos pesados medidos por cristalografia. Hidrogênios adicionados por RDKit. Medidas envolvendo H incluem posições inferidas.');
    if (info.natureza === 'experimental') return tr('Coordenadas do modelo depositado. A resolução pertence à entrada experimental. A origem de cada hidrogênio pode variar.');
    if (modelo.raw.a) return tr('Arquivo legado. Cargas e atribuições ausentes aparecem sem registro. A estereoquímica anotada no modelo pode ser inferida da geometria.');
    if (modelo.raw.repr_estereo) return tr('Estereoisômero 3D representativo calculado para a conectividade registrada; centros sem configuração definida na fonte permanecem sem atribuição.');
    return tr('Modelo de uma molécula isolada. Esta pose não determina sua conformação em solução.');
  }
  function listaPropriedades(chave) {
    const linhas = detalhesItem(modelo, chave);
    const dl = (items) => `<dl class="mol-valores">${items.map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    return dl(linhas.slice(0, 5)) + (linhas.length > 5 ? `<details class="mol-vizinhos"><summary>${tr('Distâncias e ângulos locais')}</summary>${dl(linhas.slice(5))}</details>` : '');
  }
  function inspecionar(chave, tooltip = false) {
    if (!modelo?.temAtomos || !chave || chave.startsWith('ca:')) return;
    itemAtual = chave;
    q('[data-item]').value = chave;
    const titulo = rotuloItem(modelo, chave);
    const conf = tr('Confôrmero') + ' ' + (indiceConf + 1);
    q('[data-propriedades]').innerHTML = listaPropriedades(chave) +
      `<p class="mol-nota">${esc(fonteAtual())} · ${esc(conf)}. ${esc(tr('Cargas formais, aromaticidade e estereoquímica derivam do grafo. Distâncias e ângulos são calculados nas coordenadas exibidas.'))} ${esc(limitesDoModelo())}</p>`;
    inspetor.hidden = !tooltip;
    if (tooltip) {
      const props = detalhesItem(modelo, chave).slice(0, 4);
      inspetor.innerHTML = `<strong>${esc(titulo)}</strong><span>${props.map(([k, v]) => esc(k) + ' ' + esc(v)).join(' · ')}</span>`;
    }
    hoverItem = { chave };
    pedirQuadro(true);
  }
  function atualizarFixados() {
    q('[data-fixados]').innerHTML = [...fixados].map(([k, v]) =>
      `<details class="mol-fixado" open><summary>${esc(v.titulo)}</summary>${v.html}<button type="button" class="lab3d-chip" data-soltar="${esc(k)}">${tr('Desafixar')}</button></details>`).join('');
  }
  function fixar() {
    if (!itemAtual || !modelo?.temAtomos) return;
    const chave = `${idxAtual}/${indiceConf}/${itemAtual}`;
    fixados.set(chave, { titulo: `${rotuloItem(modelo, itemAtual)} · ${tr('Confôrmero')} ${indiceConf + 1} · ${opcoes3d[idxAtual].acesso}`,
      html: q('[data-propriedades]').innerHTML });
    atualizarFixados();
  }
  function configurarItens() {
    const painel = q('[data-inspecao]');
    painel.hidden = !modelo.temAtomos;
    if (painel.hidden) return;
    const opcoes = (tipo, itens) => itens.map((_, i) => {
      const chave = tipo + ':' + i;
      return `<option value="${chave}">${esc(rotuloItem(modelo, chave))}</option>`;
    }).join('');
    q('[data-item]').innerHTML = `<optgroup label="${tr('Átomos')}">${opcoes('at', modelo.atomos)}</optgroup>
      <optgroup label="${tr('Ligações')}">${opcoes('bd', modelo.ligacoes)}</optgroup>`;
    inspecionar(itemAtual || 'at:0');
    const sel = q('[data-torcao]');
    const grupos = torcoes(modelo);
    sel.replaceChildren(...grupos.map((g) => new Option(g.map((i) => rotuloAtomo(modelo,i)).join('–'), g.join(','))));
    q('[data-comparacao]').hidden = modelos.length < 2 || !grupos.length;
    atualizarTorcoes();
  }
  function atualizarTorcoes() {
    const sel = q('[data-torcao]');
    if (!sel.value || modelos.length < 2) return;
    const ids = sel.value.split(',').map(Number);
    const valores = modelos.map((m) => medida(ids.map((i) => m.atomos[i])));
    const grau = (v) => v == null ? '—' : fmtFixo(v, 2) + '°';
    q('[data-angulos]').innerHTML = `<table><thead><tr><th>${tr('Confôrmero')}</th><th>${tr('Diedro')}</th><th>Δ · ${tr('Confôrmero')} 1</th></tr></thead>
      <tbody>${valores.map((v,i) => `<tr><th scope="row">${i+1}</th><td>${grau(v)}</td><td>${grau(v == null || valores[0] == null ? null : (v - valores[0] + 540) % 360 - 180)}</td></tr>`).join('')}</tbody></table>
      <p class="mol-nota">${esc(tr('Ângulos calculados para os mesmos quatro átomos, na ordem indicada.'))} ${esc(fonteAtual())}.</p>`;
  }
  function pontoDaRegua(i) {
    const at = modelo.atomos[i];
    const chave = 'at:' + i, n = selecionados.findIndex((p) => p.chave === chave);
    if (n >= 0) selecionados.splice(n, 1);
    else {
      if (selecionados.length === 4) selecionados.shift();
      selecionados.push({ chave, rotulo: rotuloAtomo(modelo, i), x: at.x, y: at.y, z: at.z });
    }
    if (selecionados.length === 4 && modelos.length > 1) {
      const ids = selecionados.map((p) => +p.chave.slice(3));
      const sel = q('[data-torcao]'), value = ids.join(',');
      if (![...sel.options].some(o => o.value === value)) sel.add(new Option(selecionados.map(p => p.rotulo).join('–'), value));
      sel.value = value;
      q('[data-comparacao]').hidden = false;
      atualizarTorcoes();
    }
    atualizarCalibreUI(); pedirQuadro(true);
  }
  function configurarLegenda() {
    q('[data-elementos]').replaceChildren();
    if (!modelo.temAtomos || modoCor !== 'cpk') return;
    for (const sim of new Set(modelo.atomos.map(a => a.s))) {
      const el = document.createElement('span'), ponto = document.createElement('i');
      ponto.style.background = rgbCss(infoEl(sim)[0]);
      el.append(ponto, sim); q('[data-elementos]').append(el);
    }
  }
  function trocarConformero(i) {
    if (!modelos[i]) return;
    indiceConf = i;
    modelo = modelos[i]; enquadramento = null;
    aneisPi = detectarAneisPi(modelo);
    pontesH = detectarPontesH(modelo);
    malhaCache.clear();
    selecionados = selecionados.map(p => {
      const at = modelo.atomos[Number(p.chave.slice(3))];
      return { ...p, x: at.x, y: at.y, z: at.z };
    });
    atualizarCalibreUI();
    inspecionar(itemAtual);
    atualizarTelemetriaERodape(opcoes3d[idxAtual]);
    configurarLegenda();
    pedirQuadro(true);
  }

  async function carregarIndice(i) {
    const carga = ++versaoCarga;
    idxAtual = i; indiceConf = 0; itemAtual = ''; modelo = null; modelos = []; abertura = null;
    const info = opcoes3d[i];
    btnSdf.hidden = true; q('[data-xyz]').hidden = true; q('[data-inspecao]').hidden = true; q('[data-conf-label]').hidden = true;
    cvGl.style.visibility = cvHud.style.visibility = cvSombra.style.visibility = 'hidden';
    malhaCache.clear();
    badge.className = 'badge ind';
    badge.textContent = tr('Carregando…');
    selecionados = [];
    hoverItem = null;
    atualizarCalibreUI();

    try {
      const bruto = await dados.estrutura3d(info.arquivo, info.sha256);
      if (bruto.fmt === 'ensemble-sdf-v1' && (bruto.ik !== molMeta.inchikey || bruto.id !== molMeta.id)) throw Error('Identidade divergente');
      const lista = await Promise.all((bruto.conformeros || [null]).map((_, n) => normalizarModelo3D(bruto, n)));
      if (carga !== versaoCarga || !container.isConnected) return;
      if (info.grafo_validado) {
        const g = info.grafo_validado;
        const m = lista[0];
        if (g.atomos.length !== m.atomos.length || g.ligacoes.length !== m.ligacoes.length) throw Error('Grafo incompatível');
        m.atomos.forEach((at, n) => { [at.q, at.aro, at.cip] = g.atomos[n]; });
        m.ligacoes.forEach((bd, n) => { [bd.aro, bd.ez, bd.ring] = g.ligacoes[n]; });
      }
      modelos = lista;
      modelo = modelos[0]; enquadramento = null;
      if (!modelo || !(modelo.temAtomos || modelo.temCadeia)) throw Error('Sem coordenadas');
      cvGl.style.visibility = cvHud.style.visibility = cvSombra.style.visibility = '';
      if (motorGL) q('[data-render-status]').hidden = true; else avisarModoSimples();
      q('[data-xyz]').hidden = !modelo.temAtomos;
      q('[data-conf-label]').hidden = modelos.length < 2;
      const confsB = bruto.conformeros;
      let boltzB = null;
      if (Array.isArray(confsB) && confsB.length >= 2 && confsB.every((c) => Number.isFinite(c?.energia))) {
        const eMin = Math.min(...confsB.map((c) => c.energia));
        const dE = confsB.map((c) => c.energia - eMin);
        const exps = dE.map((d) => Math.exp(-d / 0.59248));
        const Z = exps.reduce((a, b) => a + b, 0) || 1;
        boltzB = { dE, w: exps.map((x) => x / Z) };
      }
      q('[data-conf]').replaceChildren(...modelos.map((_, j) => new Option(
        boltzB
          ? `${j + 1}/${modelos.length} · ΔE ${fmtDec(boltzB.dE[j], 2)} kcal/mol (${Math.round(boltzB.w[j] * 100)}%)`
          : `${j + 1} / ${modelos.length}`,
        j,
      )));
      aneisPi = detectarAneisPi(modelo);
      pontesH = detectarPontesH(modelo);
      desc3d = calcularDescritoresEOrientacao(modelo);
      rBase = Math.max(...modelos.map(calcularRaioCena));
      rx = desc3d.rxIdeal;
      ry = desc3d.ryIdeal;
      zoom = 1.0; panX = 0; panY = 0;
      abertura = movimentoPausado() ? null : { inicio: performance.now() };
      const origem = container.closest('[data-est-bloco]')?.querySelector('[data-cena-origem]');
      if (origem) origem.textContent = tr(info.natureza === 'experimental' ? 'Estrutura experimental' : info.natureza === 'predicao_computacional' ? 'Modelo predito' : 'Confôrmero calculado');

      // Configura modos disponíveis conforme o tipo estrutural (atômico vs cadeia proteica)
      btnFita.hidden = !modelo.temCadeia;
      container.querySelectorAll('[data-repr="bolas"],[data-repr="superficie"],[data-repr="vdw"],[data-repr="bastoes"]').forEach((b) => {
        b.hidden = !modelo.temAtomos || (!motorGL && b.dataset.repr === 'superficie');
      });
      const temBfac = modelo.temCadeia || modelo.atomos.some((a) => a.bf > 0);
      btnBfac.hidden = !temBfac;
      container.querySelectorAll('[data-cor="mep"],[data-cor="farmaco"]').forEach((b) => {
        b.hidden = !modelo.temAtomos;
      });

      if (modelo.temCadeia && !modelo.temAtomos) {
        modoRepr = 'fita';
        modoCor = 'bfactor';
      } else if (modelo.temCadeia && modelo.temAtomos && info.natureza === 'experimental') {
        modoRepr = 'fita';
        modoCor = 'bfactor';
      } else {
        if (modoRepr === 'fita') modoRepr = 'bolas';
        if (modoCor === 'bfactor' && !temBfac) modoCor = 'cpk';
      }

      // Botão do arquivo SDF: destaque quando a estrutura é experimental
      if (modelo.temAtomos || info.tem_sdf_3d) {
        btnSdf.hidden = false;
        const ehExp = info.natureza === 'experimental';
        btnSdf.classList.toggle('exp', ehExp);
        rotuloSdf.textContent = tr(ehExp ? 'Baixar SDF experimental' : 'Baixar SDF');
        btnSdf.title = tr(ehExp ? 'Arquivo SDF com coordenadas experimentais ({acesso})' : 'Arquivo SDF ({acesso})', { acesso: info.acesso });
      } else {
        btnSdf.hidden = true;
      }

      configurarItens();
      configurarLegenda();
      sincronizarBotoesBarra();
      atualizarTelemetriaERodape(info);
      container.dataset.pronto = '1';
      pedirQuadro(true);
    } catch (e) {
      if (carga !== versaoCarga || !container.isConnected) return;
      modelo = null; modelos = [];
      delete container.dataset.pronto;
      q('[data-render-status]').hidden = false;
      q('[data-render-status]').textContent = tr('Estrutura 3D indisponível');
      if (opcoes3d.length === 1) container.dispatchEvent(new Event('bmb:falha3d', { bubbles: true }));
      badge.className = 'badge fora';
      console.error(e);
      badge.textContent = tr('Estrutura 3D indisponível');
      rodape.textContent = tr('Não foi possível carregar a estrutura 3D. Tente novamente.');
    }
  }

  function localizarItemTela(clientX, clientY) {
    const rect = cvHud.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let melhor = null, frente = -Infinity;
    for (const p of projecoesTela) {
      const d = Math.hypot(p.sx - x, p.sy - y);
      if (d <= Math.max(5, p.rPx) && p.z > frente) { melhor = p; frente = p.z; }
    }
    for (const seg of pontosLigacao) {
      const { a,b } = seg;
      const dx = b.sx - a.sx, dy = b.sy - a.sy;
      const t = Math.max(0, Math.min(1, ((x - a.sx)*dx + (y - a.sy)*dy) / (dx*dx + dy*dy || 1)));
      const z = a.z + t*(b.z - a.z);
      if (Math.hypot(x - a.sx - t*dx, y - a.sy - t*dy) <= Math.max(4, .13*a.escPx) && z > frente + .18) {
        melhor = seg; frente = z;
      }
    }
    return melhor;
  }

  // ── Interações de ponteiro, toque, roda e teclado ──
  const toques = new Map();
  let pinca = null;
  const separar = () => { const [a,b] = [...toques.values()]; return Math.hypot(a[0]-b[0], a[1]-b[1]); };
  cvHud.addEventListener('pointerdown', (e) => {
    abertura = null;
    toques.set(e.pointerId, [e.clientX, e.clientY]);
    if (toques.size === 2) pinca = { distancia: Math.max(1,separar()), zoom };
    arrastando = { x: e.clientX, y: e.clientY, rx, ry, panX, panY, moveu: false, shift: e.shiftKey || e.button === 1 || e.button === 2 };
    girando = false;
    container.querySelector('[data-3d="girar"]')?.setAttribute('aria-pressed', 'false');
    try { cvHud.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
  });

  cvHud.addEventListener('pointermove', (e) => {
    if (toques.has(e.pointerId)) toques.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinca && toques.size >= 2) {
      zoom = Math.max(.42, Math.min(4.2, pinca.zoom * separar() / pinca.distancia)); pedirQuadro(); return;
    }
    if (arrastando) {
      const dx = e.clientX - arrastando.x, dy = e.clientY - arrastando.y;
      if (Math.hypot(dx, dy) > 4) arrastando.moveu = true;
      if (arrastando.shift) {
        const fator = (rBase * 2.0) / (Math.max(220, palco.clientHeight) * zoom);
        panX = arrastando.panX + dx * fator;
        panY = arrastando.panY - dy * fator;
      } else {
        ry = arrastando.ry + dx * 0.0105;
        rx = Math.max(-1.52, Math.min(1.52, arrastando.rx + dy * 0.0105));
      }
      pedirQuadro(false);
      return;
    }
    const achado = localizarItemTela(e.clientX, e.clientY);
    if ((achado?.chave || null) !== (hoverItem?.chave || null)) {
      hoverItem = achado;
      if (achado && modelo?.temAtomos && !achado.chave.startsWith('ca:')) {
        inspecionar(achado.chave, true);
      } else if (achado) {
        inspetor.hidden = false;
        inspetor.textContent = achado.detalhe;
      } else {
        inspetor.hidden = true;
      }
      pedirQuadro(true);
    }
  });

  cvHud.addEventListener('pointerleave', () => {
    if (hoverItem) {
      hoverItem = null;
      inspetor.hidden = true;
      pedirQuadro(true);
    }
  });

  const fimArrasto = (e) => {
    toques.delete(e.pointerId);
    if (pinca) { arrastando = null; if (toques.size < 2) pinca = null; return; }
    if (arrastando && !arrastando.moveu && e.type === 'pointerup') {
      const achado = localizarItemTela(e.clientX, e.clientY);
      if (achado && modelo?.temAtomos && !achado.chave.startsWith('ca:')) {
        inspecionar(achado.chave, true);
        if (modoRegua && achado.chave.startsWith('at:')) pontoDaRegua(+achado.chave.slice(3));
      } else if (achado && (modoRegua || selecionados.length > 0)) {
        const idxEx = selecionados.findIndex((s) => s.chave === achado.chave);
        if (idxEx >= 0) selecionados.splice(idxEx, 1);
        else {
          if (selecionados.length >= 4) selecionados.shift();
          selecionados.push({ chave: achado.chave, rotulo: achado.rotulo, x: achado.x, y: achado.y, z: achado.z3 });
        }
        atualizarCalibreUI();
        pedirQuadro(true);
      }
    }
    arrastando = null;
    ultimaInteracao = performance.now();
    clearTimeout(reconstituir);
    if (motorGL) reconstituir = setTimeout(() => pedirQuadro(),220);
  };
  cvHud.addEventListener('pointerup', fimArrasto);
  cvHud.addEventListener('pointercancel', fimArrasto);
  cvHud.addEventListener('dblclick', () => {
    rx = desc3d.rxIdeal; ry = desc3d.ryIdeal; zoom = 1.0; panX = 0; panY = 0;
    pedirQuadro(false);
  });

  cvHud.addEventListener('wheel', (e) => {
    e.preventDefault(); abertura = null; ultimaInteracao = performance.now();
    zoom = Math.max(0.42, Math.min(4.2, zoom * Math.exp(-e.deltaY * 0.0014)));
    pedirQuadro(false);
  }, { passive: false });

  cvHud.addEventListener('keydown', (e) => {
    abertura = null; ultimaInteracao = performance.now();
    if (modelo?.temAtomos && ['[',']','Enter'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Enter') {
        if (modoRegua && itemAtual.startsWith('at:')) pontoDaRegua(+itemAtual.slice(3));
        else fixar();
      } else {
        const sel = q('[data-item]');
        const n = (sel.selectedIndex + sel.length + (e.key === ']' ? 1 : -1)) % sel.length;
        inspecionar(sel.options[n].value, true);
      }
      return;
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); ry -= 0.13; pedirQuadro(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ry += 0.13; pedirQuadro(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rx = Math.max(-1.52, rx - 0.13); pedirQuadro(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); rx = Math.min(1.52, rx + 0.13); pedirQuadro(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom = Math.min(4.2, zoom * 1.18); pedirQuadro(); }
    else if (e.key === '-') { e.preventDefault(); zoom = Math.max(0.42, zoom / 1.18); pedirQuadro(); }
    else if (e.key === '0') { e.preventDefault(); rx = desc3d.rxIdeal; ry = desc3d.ryIdeal; zoom = 1.0; panX = 0; panY = 0; pedirQuadro(); }
    else if (e.key === 'Escape' && expandido) {
      expandido = false;
      raizBloco.classList.remove('lab3d-expandido');
      container.querySelector('[data-3d="expandir"]')?.setAttribute('aria-pressed', 'false');
      pedirQuadro(false);
    }
  });

  raizBloco.addEventListener('click', (e) => {
    if (e.target.closest('[data-limpar-regua]')) {
      selecionados = [];
      atualizarCalibreUI();
      pedirQuadro(true);
      return;
    }
    if (e.target.closest('[data-fixar]')) { fixar(); return; }
    if (e.target.closest('[data-ponto]') && itemAtual.startsWith('at:')) { pontoDaRegua(+itemAtual.slice(3)); return; }
    const soltar = e.target.closest('[data-soltar]');
    if (soltar) { fixados.delete(soltar.dataset.soltar); atualizarFixados(); return; }
    const xyz = e.target.closest('[data-xyz]');
    const bSdf = e.target.closest('[data-3d-sdf]') || xyz;
    if (bSdf && modelo) {
      const info = opcoes3d[idxAtual] || {};
      try {
        const sdfTxt = xyz ? [modelo.atomos.length, `${info.acesso} | ${fonteAtual()} | Å | ${indiceConf+1}`,
          ...modelo.atomos.map(a => [a.s,a.ox,a.oy,a.oz].join(' ')), ''].join('\n') : gerarSDF3DCliente(modelo, info, molMeta);
        const slug = String(molMeta.nome || info.acesso || `mol_${molMeta.id || 0}`)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'estrutura_3d';
        const sufixo = info.natureza === 'experimental' ? 'experimental_3D' : '3D';
        const blob = new Blob([sdfTxt], { type: xyz ? 'chemical/x-xyz' : 'chemical/x-mdl-sdfile;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}_${sufixo}_${indiceConf + 1}.${xyz ? 'xyz' : 'sdf'}` });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        anunciar(tr('Coordenadas baixadas.'));
      } catch {
        anunciar(tr('Falha ao exportar as coordenadas exibidas.'));
      }
      return;
    }

    const bRepr = e.target.closest('[data-repr]');
    if (bRepr) {
      modoRepr = bRepr.dataset.repr;
      if (modoRepr === 'superficie' && modoCor === 'cpk') modoCor = 'mep';
      sincronizarBotoesBarra();
      atualizarTelemetriaERodape(opcoes3d[idxAtual] || {});
      pedirQuadro(true);
      return;
    }
    const bCor = e.target.closest('[data-cor]');
    if (bCor) {
      modoCor = bCor.dataset.cor; configurarLegenda();
      sincronizarBotoesBarra();
      atualizarTelemetriaERodape(opcoes3d[idxAtual] || {});
      pedirQuadro(true);
      return;
    }
    const bCam = e.target.closest('[data-camada]');
    if (bCam) {
      const k = bCam.dataset.camada;
      if (k === 'aneis') verAneis = !verAneis;
      else if (k === 'pontesh') verPontesH = !verPontesH;
      else if (k === 'quiral') verQuiral = !verQuiral;
      sincronizarBotoesBarra();
      pedirQuadro(true);
      return;
    }

    const bAc = e.target.closest('[data-3d]');
    if (!bAc) return;
    const ac = bAc.getAttribute('data-3d');
    abertura = null;
    if (ac === 'mais' || ac === 'menos') {
      zoom = Math.max(.42, Math.min(4.2, zoom * (ac === 'mais' ? 1.18 : 1/1.18))); pedirQuadro();
    } else if (ac === 'girar') {
      girando = !movimentoPausado() && !girando;
      bAc.setAttribute('aria-pressed', String(girando));
      pedirQuadro(false);
    } else if (ac === 'orto') {
      orto = !orto;
      bAc.setAttribute('aria-pressed', String(orto));
      bAc.textContent = tr(orto ? 'Ortográfica' : 'Perspectiva');
      pedirQuadro(false);
    } else if (ac === 'reset') {
      rx = desc3d.rxIdeal; ry = desc3d.ryIdeal; zoom = 1.0; panX = 0; panY = 0;
      pedirQuadro(false);
    } else if (ac === 'hidrogenios') {
      modoH = modoH === 'todos' ? 'polares' : (modoH === 'polares' ? 'nenhum' : 'todos');
      sincronizarBotoesBarra();
      pedirQuadro(true);
    } else if (ac === 'regua') {
      modoRegua = !modoRegua; q('[data-ponto]').hidden = !modoRegua;
      bAc.setAttribute('aria-pressed', String(modoRegua));
      palco.classList.toggle('modo-regua', modoRegua);
      if (!modoRegua) selecionados = [];
      atualizarCalibreUI();
      pedirQuadro(true);
    } else if (ac === 'expandir') {
      expandido = !expandido;
      raizBloco.classList.toggle('lab3d-expandido', expandido);
      bAc.setAttribute('aria-pressed', String(expandido));
      setTimeout(() => pedirQuadro(false), 30);
    } else if (ac === 'foto') {
      desenhar();
      const cvOut = Object.assign(document.createElement('canvas'), { width: cvHud.width, height: cvHud.height });
      const cOut = cvOut.getContext('2d');
      cOut.fillStyle = temaClaro() ? '#efe9dc' : '#06100d';
      cOut.fillRect(0, 0, cvOut.width, cvOut.height);
      if (cvSombra.width && cvSombra.height) cOut.drawImage(cvSombra, 0, 0, cvOut.width, cvOut.height);
      if (motorGL && cvGl.width && cvGl.height) cOut.drawImage(cvGl, 0, 0, cvOut.width, cvOut.height);
      cOut.drawImage(cvHud, 0, 0);
      const a = Object.assign(document.createElement('a'), {
        href: cvOut.toDataURL('image/png'),
        download: `biomapabrasil_3d_${molMeta.id || 'mol'}.png`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      anunciar(tr('Imagem PNG salva.'));
    }
  });

  container.querySelector('[data-sel-3d]')?.addEventListener('change', (e) => carregarIndice(Number(e.target.value)));
  q('[data-conf]').addEventListener('change', e => trocarConformero(Number(e.target.value)));
  q('[data-item]').addEventListener('change', e => inspecionar(e.target.value, true));
  q('[data-torcao]').addEventListener('change', atualizarTorcoes);
  const opts = { signal: vida.signal };
  window.addEventListener('bmb:tema', () => pedirQuadro(true), opts);
  const atualizarMovimento = () => {
    if (movimentoPausado()) {
      abertura = null; girando = false;
      q('[data-3d="girar"]').setAttribute('aria-pressed','false');
    }
    pedirQuadro();
  };
  window.addEventListener('bmb:movimento', atualizarMovimento, opts);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', atualizarMovimento, opts);
  document.addEventListener('visibilitychange', () => pedirQuadro(), opts);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && expandido) {
      e.preventDefault();
      expandido = false;
      raizBloco.classList.remove('lab3d-expandido');
      const btnExp = container.querySelector('[data-3d="expandir"]');
      btnExp?.setAttribute('aria-pressed', 'false');
      btnExp?.focus();
      pedirQuadro(false);
    }
  }, opts);
  cvGl.addEventListener('webglcontextlost', e => {
    e.preventDefault(); clearTimeout(reconstituir); ultimaInteracao = -Infinity;
    motorGL = null; cvGl.hidden = true;
    if (modoRepr === 'superficie') modoRepr = 'bolas';
    q('[data-repr="superficie"]').hidden = true;
    sincronizarBotoesBarra(); avisarModoSimples(); pedirQuadro(true);
  }, opts);
  cvGl.addEventListener('webglcontextrestored', () => {
    motorGL = criarMotorGL2(cvGl); perfilInicial(); cvGl.hidden = !motorGL;
    q('[data-repr="superficie"]').hidden = !motorGL || !modelo?.temAtomos;
    q('[data-render-status]').hidden = !!motorGL; pedirQuadro(true);
  }, opts);
  const tamanhos = new ResizeObserver(() => pedirQuadro());
  tamanhos.observe(palco);
  const aparicao = new IntersectionObserver(([entry]) => { visivel = entry.isIntersecting; if (visivel) pedirQuadro(); });
  aparicao.observe(palco);
  const remover = new MutationObserver(() => {
    if (container.isConnected) return;
    ativo = false; versaoCarga++; cancelAnimationFrame(raf); clearTimeout(reconstituir);
    tamanhos.disconnect(); aparicao.disconnect(); remover.disconnect(); vida.abort();
    motorGL?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
  remover.observe(document.body, { subtree: true, childList: true });
  await carregarIndice(0);
}
