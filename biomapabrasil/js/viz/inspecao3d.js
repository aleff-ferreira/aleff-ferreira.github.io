// Coordenadas em Å. Os identificadores são índices no mesmo grafo em todos os confôrmeros de um ensemble.
import { fmtFixo, tr } from '../util.js';

export function lerConformero(raw, indice) {
  const sdf = raw.conformeros[indice].sdf;
  const linhas = sdf.split('\n');
  const n = Number(linhas[3].slice(0, 3));
  if (!n || n !== raw.atomos.length || Number(linhas[3].slice(3, 6)) !== raw.ligacoes.length) throw Error('SDF incompatível');
  const centroide = [0, 0, 0];
  const atomos = raw.atomos.map(([s, q, aro, cip, isotope, g], idx) => {
    const linha = linhas[4 + idx];
    const xyz = [0, 10, 20].map((i) => Number.parseFloat(linha.slice(i, i + 10)));
    if (linha.slice(31, 34).trim() !== s || !xyz.every(Number.isFinite)) throw Error('Coordenadas SDF inválidas');
    xyz.forEach((v, i) => { centroide[i] += v / n; });
    return { idx, s, q, aro, cip, isotope, g, ox: xyz[0], oy: xyz[1], oz: xyz[2], bf: 0 };
  });
  for (const at of atomos) {
    at.x = at.ox - centroide[0]; at.y = at.oy - centroide[1]; at.z = at.oz - centroide[2];
  }
  const adj = atomos.map(() => []);
  const ligacoes = raw.ligacoes.map(([a, b, ko, aro, ez, ring], bi) => {
    adj[a].push({ v: b, bi }); adj[b].push({ v: a, bi });
    return { idx: bi, a, b, ko, aro, ez, ring };
  });
  for (const at of atomos) {
    const vizinhos = adj[at.idx].map(({ v }) => atomos[v]);
    at.polarH = at.s === 'H' && vizinhos.some((v) => ['O', 'N', 'S'].includes(v.s));
    at.hbd = ['O', 'N', 'S'].includes(at.s) && vizinhos.some((v) => v.s === 'H');
    at.hba = ['O', 'N', 'F'].includes(at.s) && at.q <= 0;
  }
  return { raw, indice, sdf, centroide, atomos, adj, ligacoes, temAtomos: true, temCadeia: false, ssBonds: [] };
}

const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
export function medida(pts) {
  if (pts.length < 2 || pts.length > 4) return null;
  const b1 = sub(pts[0], pts[1]);
  if (pts.length === 2) return Math.hypot(...b1);
  const b2 = sub(pts[2], pts[1]);
  const norma = Math.hypot(...b2);
  if (Math.hypot(...b1) * norma < 1e-10) return null;
  if (pts.length === 3) return Math.atan2(Math.hypot(...cross(b1, b2)), dot(b1, b2)) * 180 / Math.PI;
  const b3 = sub(pts[3], pts[2]);
  const n1 = cross(b2, b1), n2 = cross(b2, b3);
  if (Math.hypot(...n1) * Math.hypot(...n2) < 1e-10) return null;
  return Math.atan2(dot(cross(n1, n2), b2) / norma, dot(n1, n2)) * 180 / Math.PI;
}

export const rotuloAtomo = (m, i) => `${m.atomos[i].isotope || ''}${m.atomos[i].s}${i + 1}`;
export function rotuloItem(m, chave) {
  const [tipo, id] = chave.split(':');
  if (tipo === 'at') return rotuloAtomo(m, +id);
  const b = m.ligacoes[+id];
  return `${rotuloAtomo(m, b.a)}–${rotuloAtomo(m, b.b)}`;
}

export function detalhesItem(m, chave) {
  const [tipo, id] = chave.split(':');
  const valor = (v) => v == null ? tr('Sem registro') : v ? tr('Sim') : tr('Não');
  const pontos = m.atomos;
  if (tipo === 'bd') {
    const b = m.ligacoes[id];
    return [
      [tr('Ordem de ligação'), b.aro ? tr('Aromática') : b.ko],
      [tr('Aromaticidade'), valor(b.aro)], [tr('Estereoquímica'), b.ez || tr('Sem atribuição')],
      [tr('Comprimento calculado'), `${fmtFixo(medida([pontos[b.a], pontos[b.b]]), 3)} Å`],
    ];
  }
  const a = pontos[id], viz = m.adj[id];
  const linhas = [
    [tr('Carga formal'), a.q == null ? tr('Sem registro') : `${a.q > 0 ? '+' : ''}${a.q} e`],
    [tr('Carga parcial calculada'), a.g == null ? tr('Sem registro') : `${fmtFixo(a.g, m.raw.b64z ? 2 : 4)} e · Gasteiger`],
    [tr('Aromaticidade'), valor(a.aro)], ['CIP', a.cip || tr('Sem atribuição')],
    ['x · y · z', `${[a.ox,a.oy,a.oz].map((v) => fmtFixo(v, 4)).join(' · ')} Å`],
  ];
  for (let i = 0; i < viz.length; i++) {
    const j = viz[i].v;
    linhas.push([rotuloItem(m, 'bd:' + viz[i].bi), `${fmtFixo(medida([a, pontos[j]]), 3)} Å`]);
    for (let k = i + 1; k < viz.length; k++) {
      const v = viz[k].v, ang = medida([pontos[j], a, pontos[v]]);
      if (ang != null) linhas.push([[j, +id, v].map((x) => rotuloAtomo(m, x)).join('–'), `${fmtFixo(ang, 2)}°`]);
    }
  }
  return linhas;
}

// Um quarteto reproduzível para cada ligação simples entre dois átomos pesados internos.
export function torcoes(m) {
  const grupos = [];
  for (const { a, b, ko, aro } of m.ligacoes) {
    if (ko !== 1 || aro) continue;
    const viz = (i, excluido) => m.adj[i].map(({ v }) => v).find((v) => v !== excluido && m.atomos[v].s !== 'H');
    const i = viz(a, b), j = viz(b, a);
    if (i != null && j != null && i !== j) grupos.push([i, a, b, j]);
  }
  return grupos;
}
