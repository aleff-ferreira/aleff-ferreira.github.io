// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Acesso aos pacotes de dados estáticos, com cache em memória. Cada pacote é buscado uma vez só.
import { definirRotulos } from './util.js';

const memoria = new Map();

/** Busca um JSON relativo à raiz do site. Falhas não ficam em cache, para permitir nova tentativa. */
export function json(caminho) {
  if (memoria.has(caminho)) return memoria.get(caminho);
  const p = fetch(caminho).then((r) => {
    if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
    return r.json();
  });
  memoria.set(caminho, p);
  p.catch(() => memoria.delete(caminho));
  return p;
}

/** Converte o formato colunar ({colunas, linhas} ou esquema 2 {colunas, dados, ufs}) em lista de objetos. */
function objetos(pacote) {
  const { colunas, linhas, dados: cols, ufs, ufs_formato: ufsFmt } = pacote;
  if (cols && !linhas) {
    const n = (cols[colunas[0]] || []).length;
    const bitmask = ufsFmt === 'bitmask_27' && Array.isArray(ufs) && Array.isArray(cols.uf_mask);
    const ufChaves = !bitmask && ufs && !Array.isArray(ufs) ? Object.keys(ufs) : null;
    const saida = new Array(n);
    for (let r = 0; r < n; r++) {
      const o = {};
      for (const c of colunas) o[c] = cols[c][r];
      if (Array.isArray(pacote.dicionario_classes) && typeof o.classe === 'number') {
        o.classe = o.classe >= 0 ? (pacote.dicionario_classes[o.classe] || '') : '';
      }
      if ('popular' in o && !('populares' in o)) {
        o.populares = o.popular ? [o.popular] : [];
        delete o.popular;
      }
      if (bitmask) {
        const mu = {};
        const m = cols.uf_mask[r] || 0;
        for (let b = 0; b < ufs.length; b++) {
          if (m & (1 << b)) mu[ufs[b]] = 1;
        }
        o.uf = mu;
      } else if (ufChaves) {
        const mu = {};
        for (const u of ufChaves) {
          const v = ufs[u][r];
          if (v > 0) mu[u] = v;
        }
        o.uf = mu;
      }
      saida[r] = o;
    }
    return saida;
  }
  return linhas.map((l) => Object.fromEntries(colunas.map((c, i) => [c, l[i]])));
}

let _versaoMidia = '';
export const versaoMidia = () => _versaoMidia;
export const manifesto = () => json('dados/manifesto.json').then((m) => {
  _versaoMidia = m?.integridade?.conjunto?.slice(0, 6) || '';
  definirRotulos(m?.rotulos);
  return m;
});
export const territorios = () => json('dados/territorios.json');
export const taxon = (gbif) => json(`dados/taxa/${gbif}.json`);
export async function molecula(id) {
  const b = (Number(id) & 0xff).toString(16).padStart(2, '0');
  try {
    const lote = await json(`dados/moleculas_lotes/${b}.json`);
    if (lote && lote[String(id)]) return lote[String(id)];
  } catch { /* fallback individual */ }
  return json(`dados/moleculas/${id}.json`);
}
export async function svgEstrutura(ref) {
  if (!ref) return '';
  const limpo = String(ref).replace(/^dados\//, '');
  const idxHash = limpo.indexOf('#');
  if (idxHash > 0) {
    const arq = limpo.slice(0, idxHash);
    const chave = limpo.slice(idxHash + 1);
    const lote = await json(`dados/${arq}`);
    return lote?.[chave] || '';
  }
  const r = await fetch(`dados/${limpo}`);
  return r.ok ? r.text() : '';
}
export async function svgDataUri(ref) {
  const s = (await svgEstrutura(ref)).trimStart();
  return s.startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.replaceAll('currentColor', '#0b1f18'))}` : '';
}
export const geoUFs = () => json('dados/geo/ufs.json');
export const geoRios = () => json('dados/geo/rios.json');
export const geoBacias = () => json('dados/geo/bacias.json');
export const geoLacunas = () => json('dados/geo/lacunas.json');
export const indiceInchikeys = () => json('dados/inchikeys_indice.json');
export const indiceSinonimos = () => json('dados/sinonimos_indice.json');
export const i18nEn = () => json('dados/i18n/en.json');
export const viz = (nome) => json(`dados/viz/${nome}.json`);
async function digest3d(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
}
export async function estrutura3d(ref, sha256) {
  if (!ref) throw new Error('caminho 3D vazio');
  const limpo = String(ref).replace(/^dados\//, '');
  const idxHash = limpo.indexOf('#');
  if (limpo.startsWith('estruturas3d_ensembles/') && idxHash > 0) {
    if (!memoria.has(limpo)) {
      const p = (async () => {
        const [ini, tam, assinatura] = limpo.slice(idxHash + 1).split(':');
        const inicio = Number(ini), tamanho = Number(tam);
        if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(tamanho) || inicio < 0 || tamanho < 1) throw Error('Intervalo inválido');
        const url = 'dados/' + limpo.slice(0, idxHash) + '?m=' + assinatura + '-' + inicio;
        const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${inicio+tamanho-1}` } });
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const lote = await r.arrayBuffer();
        const membro = r.status === 206 ? lote : lote.slice(inicio, inicio+tamanho);
        if (membro.byteLength !== tamanho) throw Error('Membro incompleto');
        const stream = new Blob([membro]).stream().pipeThrough(new DecompressionStream('gzip'));
        const corpo = await new Response(stream).arrayBuffer();
        if (globalThis.crypto?.subtle) {
          const hash = await digest3d(corpo);
          if (sha256 ? hash !== sha256 : !hash.startsWith(assinatura)) throw Error('SHA-256 divergente');
        }
        return JSON.parse(new TextDecoder().decode(corpo));
      })();
      memoria.set(limpo, p);
      p.catch(() => memoria.delete(limpo));
    }
    return memoria.get(limpo);
  }
  if (idxHash > 0) {
    const arq = limpo.slice(0, idxHash);
    const chave = limpo.slice(idxHash + 1);
    const lote = await json(`dados/${arq}`);
    if (lote && chave in lote) return lote[chave];
    throw new Error(`${arq}: chave ${chave} ausente`);
  }
  if (sha256?.length === 64 && globalThis.crypto?.subtle) {
    const caminho = `dados/${limpo}`, chave = caminho + '#' + sha256;
    if (!memoria.has(chave)) {
      const p = fetch(caminho).then(async (res) => {
        if (!res.ok) throw Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (await digest3d(bytes) !== sha256) throw Error('SHA-256 divergente');
        return JSON.parse(new TextDecoder().decode(bytes));
      });
      memoria.set(chave, p);
      p.catch(() => memoria.delete(chave));
    }
    return memoria.get(chave);
  }
  return json(`dados/${limpo}`);
}
export const paginaTaxonExtra = (caminho) => json(caminho);

function _empacotarIndice(p) {
  const lista = objetos(p);
  return { lista, porId: new Map(lista.map((t) => [t.id, t])), porGbif: new Map(lista.map((t) => [t.gbif, t])), legenda: p.legenda, parcial: !!p.parcial };
}

let _indiceMapa;
/** Índice enxuto de primeira tela (mapa, contagens e painel inicial <= 170 KB gzip). */
export async function indiceMapa() {
  if (_indice) return _indice;
  if (!_indiceMapa) {
    _indiceMapa = json('dados/indice_mapa.json').then(_empacotarIndice).catch(() => indice());
  }
  return _indiceMapa;
}

let _indice;
/** Índice completo de táxons (com família, verificadas e n_br) para tabela e busca avançada. */
export async function indice() {
  if (!_indice) {
    _indice = json('dados/indice.json').then(_empacotarIndice);
    _indice.catch(() => { _indice = null; });
  }
  return _indice;
}

let _mols, _molsIk;
/** Índice de moléculas, carregado sob demanda (é o maior arquivo de topo). */
export async function indiceMoleculas() {
  if (!_mols) {
    _mols = json('dados/moleculas_indice.json').then((p) => {
      const lista = objetos(p);
      return { lista, porId: new Map(lista.map((m) => [m.id, m])), legenda: p.legenda };
    });
    _mols.catch(() => { _mols = null; });
  }
  return _mols;
}
export async function indiceMoleculasComIk() {
  if (!_molsIk) {
    _molsIk = Promise.all([indiceMoleculas(), indiceInchikeys().catch(() => null)]).then(([ix, iks]) => {
      const arr = iks?.iks;
      const fms = iks?.formulas;
      if (Array.isArray(arr) || Array.isArray(fms)) {
        ix.lista.forEach((m, i) => {
          const v = arr?.[i];
          if (v && !m.inchikey) {
            m.inchikey = v.replace('~', '-UHFFFAOYSA-N');
            m.conectividade = m.inchikey.slice(0, 14);
          }
          if (fms?.[i] && !m.formula) m.formula = fms[i];
        });
      }
      return ix;
    });
    _molsIk.catch(() => { _molsIk = null; });
  }
  return _molsIk;
}
