// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Utilitários: escape de HTML, formatação numérica por idioma, vocabulário do contrato de dados,
// tradução da interface e anúncios para leitores de tela.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para uso em HTML. Todo dado externo (título de artigo, nome de autor) passa por aqui. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

class Bruto { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Marca um trecho de HTML já seguro (gerado por este código) para não ser escapado de novo. */
export const bruto = (s) => new Bruto(s);

/** Template literal que escapa cada valor interpolado, salvo se vier de `bruto()` ou de outro `html`. */
export function html(partes, ...valores) {
  let saida = partes[0];
  valores.forEach((v, i) => {
    let t;
    if (v instanceof Bruto) t = v.s;
    else if (Array.isArray(v)) t = v.map((x) => (x instanceof Bruto ? x.s : esc(x))).join('');
    else t = esc(v);
    saida += t + partes[i + 1];
  });
  return new Bruto(saida);
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Minúsculas e sem acentos: forma de comparação para busca. */
export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ═══════════════════════════ idioma da interface ═══════════════════════════
// A chave de cada tradução é o próprio texto em pt-BR (nucleo/semente/i18n/en.json). Texto fixo do HTML é
// trocado por `traduzirDOM`; texto montado em JavaScript com números ou nomes passa por `tr`.
let _lang = 'pt', _dictEn = null, _dictPt = null;
const _origTxt = new WeakMap(), _origAtr = new WeakMap();
export const idiomaAtual = () => _lang;

/** Traduz um texto fixo. `vars` preenche os marcadores `{nome}` depois da tradução. */
export function tr(pt, vars) {
  const s = (_lang === 'en' && _dictEn && _dictEn[pt]) || pt;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}
/** Forma singular ou plural conforme `n`, com `{n}` já formatado. */
export const trn = (n, um, varios, vars) => tr(n === 1 ? um : varios, { n: fmtInt(n), ...vars });

// Texto que chega nos dados (manifesto, pacotes, visualizações) vem em pt-BR. Em inglês, `trDado` procura o texto
// inteiro no dicionário e, se não acha, os padrões: as chaves com marcadores `{nome}`, que `tr` preenche na ida,
// aqui casam na volta com os enunciados que o exportador gera por modelo fixo. O que cada marcador captura passa
// pelo dicionário (texto fixo dentro do enunciado) e entra no modelo em inglês.
let _padroes = null;
const FIXO_MINIMO = 12;   // letras fixas que um padrão precisa ter para não casar por acaso com um dado qualquer
function compilarPadroes() {
  _padroes = [];
  for (const [pt, en] of Object.entries(_dictEn)) {
    const partes = pt.split(/\{(\w+)\}/);          // texto fixo nas posições pares, nomes de marcador nas ímpares
    const fixos = partes.filter((_, i) => i % 2 === 0);
    if (partes.length < 3 || fixos.join('').replace(/\s/g, '').length < FIXO_MINIMO) continue;
    const vistos = new Set();
    const fonte = partes.map((p, i) => {
      if (i % 2 === 0) return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (vistos.has(p)) return `\\k<${p}>`;
      vistos.add(p);
      return `(?<${p}>.+?)`;
    }).join('');
    try {
      _padroes.push({ re: new RegExp(`^${fonte}$`, 's'), en, ancora: fixos.reduce((a, b) => (b.length > a.length ? b : a)), peso: fixos.join('').length });
    } catch { /* marcador que não serve de nome de grupo: a chave vale só como texto inteiro */ }
  }
  _padroes.sort((a, b) => b.peso - a.peso);       // o padrão com mais texto fixo é o mais específico e vem primeiro
}
/** Traduz um texto dos dados: rótulo ou aviso fixo, ou enunciado gerado por modelo. Sem tradução, devolve o original. */
export function trDado(s) {
  if (_lang !== 'en' || !_dictEn || typeof s !== 'string' || !s) return s;
  const t = s.replace(/\s+/g, ' ').trim();
  if (_dictEn[t]) return _dictEn[t];
  if (!_padroes) compilarPadroes();
  for (const p of _padroes) {
    if (!t.includes(p.ancora)) continue;
    const m = p.re.exec(t);
    if (m) return p.en.replace(/\{(\w+)\}/g, (marcador, k) => (m.groups[k] == null ? marcador : _dictEn[m.groups[k]] || m.groups[k]));
  }
  return s;
}
/**
 * Nome de fonte ou nota dos dados com as partes separadas por travessão (sigla e nome por extenso): cada parte
 * é traduzida e as partes saem unidas por vírgula.
 */
export const trPartes = (s) => (typeof s === 'string' ? s.split(/\s+\u2014\s+/).map(trDado).join(', ') : s);

/** Códigos de forma de vida e habitat do Catálogo Taxonômico da Fauna do Brasil, por extenso. */
const TERMO_CTFB = {
  VIDA_LIVRE_INDIVIDUAL: 'vida livre individual', COLONIAL: 'colonial', EUSSOCIAL: 'eussocial', ECTOPARASITO: 'ectoparasito', PREDADOR: 'predador',
  TERRESTRE: 'terrestre', ARBOREO: 'arbóreo', AGUA_DOCE: 'água doce', MARINHO: 'marinho', CAVERNICOLA: 'cavernícola',
};
/**
 * Lista de vocabulário dos catálogos («Árvore · Terrícola · (Floresta de Várzea)»), termo a termo: códigos por
 * extenso em pt-BR e, em inglês, cada termo pelo dicionário.
 */
export function trTermos(s) {
  if (typeof s !== 'string') return s;
  const dic = _lang === 'en' && _dictEn ? _dictEn : TERMO_CTFB;
  return s.replace(/[^·;,()]+/g, (trecho) => { const t = trecho.trim(); return t && dic[t] ? trecho.replace(t, dic[t]) : trecho; }).replace(/;(?=\S)/g, '; ');
}

export async function alternarIdioma(carregarEn) {
  const prox = _lang === 'pt' ? 'en' : 'pt';
  if (prox === 'en' && !_dictEn) {
    _dictEn = await carregarEn();
    _dictPt = {};
    for (const [k, v] of Object.entries(_dictEn)) if (!(v in _dictPt)) _dictPt[v] = k;
  }
  _lang = prox;
  document.documentElement.lang = prox === 'en' ? 'en' : 'pt-BR';
  try { localStorage.setItem('bmb-lang', prox); } catch { /* ignorado */ }
  return prox;
}

const compacto = (s) => s.replace(/\s+/g, ' ').trim();
/** Troca o miolo do texto e conserva o espaço que o separa dos elementos vizinhos. */
const comBordas = (original, miolo) => (/^\s/.test(original) ? ' ' : '') + miolo + (/\s$/.test(original) ? ' ' : '');

/**
 * Traduz o texto fixo de `raiz`. Em inglês, troca cada texto ou atributo que é chave do dicionário. Em português
 * só age com `restaurar` (na troca de idioma), para devolver ao pt-BR o que estava em inglês.
 */
export function traduzirDOM(raiz = document, restaurar = false) {
  if (!_dictEn || (_lang !== 'en' && !restaurar)) return;
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const s = n.nodeValue, rec = _origTxt.get(n);
    if (_lang !== 'en' && rec && rec.en === s) { n.nodeValue = rec.pt; continue; }
    if (rec && rec.en === s) continue;
    const dic = _lang === 'en' ? _dictEn : _dictPt;
    const t = s && compacto(s);
    // nome próprio vindo dos dados (nome popular, molécula) fica como está, mesmo que coincida com uma chave
    if (!t || !dic?.[t] || n.parentElement?.closest('[translate="no"]')) continue;
    const novo = comBordas(s, dic[t]);
    if (_lang === 'en') _origTxt.set(n, { pt: s, en: novo });
    n.nodeValue = novo;
  }
  raiz.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach((el) => {
    let m = _origAtr.get(el);
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const rec = m?.[a];
      if (_lang === 'en') {
        if (rec && rec.en === v) continue;
        if (_dictEn[v]) { m = m || {}; m[a] = { pt: v, en: _dictEn[v] }; _origAtr.set(el, m); el.setAttribute(a, _dictEn[v]); }
      } else if (rec && rec.en === v) {
        el.setAttribute(a, rec.pt);
      } else if (_dictPt?.[v]) {
        el.setAttribute(a, _dictPt[v]);
      }
    }
  });
}

// ═══════════════════════════ números e datas ═══════════════════════════
const SEM_VALOR = '–';
const _nf = new Map();
function formatador(opcoes) {
  const chave = _lang + JSON.stringify(opcoes);
  let f = _nf.get(chave);
  if (!f) { f = new Intl.NumberFormat(_lang === 'en' ? 'en-US' : 'pt-BR', opcoes); _nf.set(chave, f); }
  return f;
}
export const fmtInt = (n) => (n == null ? SEM_VALOR : formatador({ maximumFractionDigits: 0 }).format(n));
export const fmtDec = (n, casas = 2) => (n == null ? SEM_VALOR : formatador({ maximumFractionDigits: casas }).format(n));
/** Casas decimais fixas: massas e outras grandezas em que o zero à direita é informação. */
export const fmtFixo = (n, casas) => (n == null ? SEM_VALOR : formatador({ minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n));
/** Algarismos significativos: concentrações que variam de pM a mM na mesma coluna. */
export const fmtSig = (n, algarismos = 4) => (n == null ? SEM_VALOR : formatador({ maximumSignificantDigits: algarismos }).format(n));
export const fmtPct = (x, casas = 0) => (x == null ? SEM_VALOR : formatador({ style: 'percent', maximumFractionDigits: casas }).format(x));
export const fmtData = (iso) => {
  if (!iso) return SEM_VALOR;
  const dia = iso.slice(0, 10);
  if (_lang === 'en') return dia;
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
};

export const reduzMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const conexaoLenta = () => {
  const c = navigator.connection;
  return !!c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''));
};

let regiaoViva;
/** Anuncia uma mensagem a leitores de tela (região aria-live educada). */
export function anunciar(msg) {
  regiaoViva = regiaoViva || document.getElementById('vivo');
  if (!regiaoViva) return;
  regiaoViva.textContent = '';
  setTimeout(() => { regiaoViva.textContent = msg; }, 60);
}

export function debounce(fn, ms = 120) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Ícone do sprite (index.html). Decorativo por padrão; passe `rotulo` para dar nome acessível. */
export function icone(nome, rotulo) {
  const a11y = rotulo ? `role="img" aria-label="${esc(rotulo)}"` : 'aria-hidden="true" focusable="false"';
  return bruto(`<svg class="ic" ${a11y}><use href="#i-${nome}"/></svg>`);
}

// ═══════════════════════════ rótulos fixos ═══════════════════════════
export const GRUPOS = {
  P: { chave: 'planta', rotulo: 'Planta', plural: 'Plantas', icone: 'planta' },
  A: { chave: 'animal_peconhento', rotulo: 'Animal com toxinas', plural: 'Animais com toxinas', icone: 'animal' },
  F: { chave: 'fungo', rotulo: 'Fungo', plural: 'Fungos', icone: 'fungo' },
  O: { chave: 'outro', rotulo: 'Outro', plural: 'Outros', icone: 'planta' },
};
export const GRUPO_POR_CHAVE = Object.fromEntries(Object.values(GRUPOS).map((g) => [g.chave, g]));
// Predomínio amazônico: fração dos registros brasileiros do GBIF que cai na Amazônia Legal. Mede a
// distribuição dos registros da espécie; não diz onde o material de um estudo foi coletado.
export const PREDOMINIO = {
  p: { rotulo: 'Metade ou mais dos registros brasileiros na Amazônia Legal', curto: 'Predomínio amazônico', classe: 'ok' },
  n: { rotulo: 'Menos da metade dos registros brasileiros na Amazônia Legal', curto: 'Sem predomínio amazônico', classe: 'marg' },
  i: { rotulo: 'Predomínio amazônico dependente da base de cálculo', curto: 'Predomínio indeterminado', classe: 'ind' },
};
export const TIPOS_MOLECULA = { s: 'Pequena molécula', p: 'Peptídeo', t: 'Proteína' };
export const TIPO_MOL_POR_NOME = { pequena_molecula: 'Pequena molécula', peptideo: 'Peptídeo', proteina: 'Proteína' };
export const ehInchiKey = (s) => /^[A-Za-z]{14}-[A-Za-z]{10}(?:-[A-Za-z])?$/.test(String(s || '').trim());
export const nomeMolecula = (nome, id) => ((ehInchiKey(nome) || /^(?:CID|SCHEMBL|CHEMBL)\s*[-:]?\s*\d+$/i.test(String(nome || '').trim())) ? `${tr('Molécula')} BMB ${String(id).padStart(5, '0')}` : (nome || ''));

export const DIMENSOES = {
  identidade_biologica: 'Identidade biológica',
  procedencia: 'Procedência do material',
  identidade_quimica: 'Identidade química',
  qualidade_experimental: 'Qualidade experimental',
  rastreabilidade: 'Rastreabilidade',
  reutilizacao: 'Reutilização (licença)',
  sensibilidade: 'Sensibilidade (ética)',
};
export const ESTADO_DIM = {
  atende: { rotulo: 'atende', sim: '●' },
  parcial: { rotulo: 'parcial', sim: '◐' },
  ausente: { rotulo: 'ausente', sim: '○' },
  nao_avaliado: { rotulo: 'não avaliado', sim: '·' },
  nao_se_aplica: { rotulo: 'não se aplica', sim: '–' },
};

// ═══════════════════════════ vocabulário do contrato de dados ═══════════════════════════
// Os rótulos chegam em `manifesto.rotulos`. As tabelas abaixo repetem a redação do contrato
// (docs/dev/CONTRATO_DE_DADOS.md) e valem enquanto o manifesto não carregou ou quando falta uma chave.
const ROTULOS_PADRAO = {
  evidencia: {
    curador: 'Conferido por curador',
    artigo_trecho: 'Trecho localizado no artigo',
    artigo_cita_organismo: 'Artigo cita o organismo',
    base_curada: 'Transcrito de base curada',
  },
  procedencia: {
    curador_artigo_amazonia: 'Coleta na Amazônia conferida no artigo por curador',
    curador_artigo_fora_da_amazonia: 'Coleta fora da Amazônia conferida no artigo por curador',
    base_declara_amazonia_legal: 'Coleta na Amazônia Legal declarada pela base de origem',
    base_declara_brasil_fora_da_amazonia_legal: 'Coleta no Brasil fora da Amazônia Legal, declarada pela base de origem',
    base_declara_pais_pan_amazonico: 'País de coleta declarado pela base de origem, sem unidade da federação',
    base_declara_exterior: 'Coleta fora dos países amazônicos, declarada pela base de origem',
    nao_declarada: 'Local de coleta não declarado pela base de origem',
  },
  procedencia_artigo: {
    amazonia_legal: 'O artigo declara coleta na Amazônia Legal',
    pais_pan_amazonico: 'O artigo declara coleta em país amazônico, sem situá-la na Amazônia',
    brasil_fora_da_amazonia_legal: 'O artigo declara coleta no Brasil fora da Amazônia Legal',
    exterior: 'O artigo declara coleta fora dos países amazônicos',
    ambiente_marinho: 'O artigo declara material de origem marinha',
  },
  distribuicao_br: {
    endemica_do_brasil_restrita_ao_dominio_amazonia: 'Endêmica do Brasil, restrita ao domínio Amazônia',
    endemica_do_brasil_com_ocorrencia_na_amazonia: 'Endêmica do Brasil, com ocorrência na Amazônia',
    registros_brasileiros_concentrados_na_amazonia_legal: 'Registros brasileiros concentrados na Amazônia Legal',
    registros_brasileiros_dispersos: 'Registros brasileiros em várias regiões',
    introduzida_ou_naturalizada: 'Introduzida ou naturalizada no Brasil',
    fora_do_recorte: 'Fora do recorte amazônico',
    indeterminada: 'Distribuição não classificada',
  },
  natureza_alvo: {
    proteina_unica: null,
    complexo_proteico: 'complexo proteico',
    familia_proteica: 'família de proteínas',
    linhagem_celular: 'linhagem celular',
    organismo: 'organismo inteiro',
    tecido: 'tecido',
    fracao_subcelular: 'fração subcelular',
    acido_nucleico: 'ácido nucleico',
    admet: 'ensaio ADMET',
    nao_molecular: 'sistema sem alvo molecular definido',
    indeterminado: 'alvo de natureza não classificada',
  },
};
let _rotulos = {};
export function definirRotulos(r) { _rotulos = r || {}; }
/** Rótulo de um código do vocabulário (`dic` = evidencia, procedencia, procedencia_artigo, distribuicao_br, natureza_alvo). */
export function rotulo(dic, codigo) {
  if (codigo == null || codigo === '') return '';
  const doManifesto = _rotulos[dic], padrao = ROTULOS_PADRAO[dic];
  const v = doManifesto && codigo in doManifesto ? doManifesto[codigo] : padrao && codigo in padrao ? padrao[codigo] : String(codigo).replace(/_/g, ' ');
  return v ? tr(v) : '';
}

/** Níveis de evidência, do mais forte ao mais fraco. Só `curador` é verificação em fonte primária. */
export const EVIDENCIA = {
  curador: { icone: 'check', classe: 'verif', significado: 'Um curador leu a passagem na publicação e a confirmou.' },
  artigo_trecho: { icone: 'lupa', classe: 'ind', significado: 'Uma frase do resumo ou do texto aberto cita o organismo e o composto, com verbo de isolamento.' },
  artigo_cita_organismo: { icone: 'livro', classe: 'ind', significado: 'Título, resumo ou texto aberto citam o organismo.' },
  base_curada: { icone: 'dados', classe: 'ind', significado: 'LOTUS, NuBBE-DB, NPAtlas, UniProt ou ChEMBL registram a associação. O texto da obra não foi lido.' },
};
/** Endemismo no Brasil segundo os catálogos nacionais (`endemica`, `nao_endemica`, `indeterminado`). */
export const ehEndemica = (v) => /^end[eê]mic/i.test(String(v ?? '').trim());
const ENDEMISMO = { endemica: 'Endêmica do Brasil', nao_endemica: 'Não endêmica', indeterminado: 'Endemismo indeterminado' };
export const rotuloEndemismo = (v) => (v ? tr(ENDEMISMO[v] || String(v).replace(/_/g, ' ')) : '');
/** Categoria de ameaça em sigla (LC, NT, VU, EN, CR), venha em sigla ou por extenso, como no vocabulário do GBIF. */
const SIGLA_AMEACA = {
  LEAST_CONCERN: 'LC', NEAR_THREATENED: 'NT', VULNERABLE: 'VU', ENDANGERED: 'EN', CRITICALLY_ENDANGERED: 'CR',
  DATA_DEFICIENT: 'DD', NOT_EVALUATED: 'NE', EXTINCT_IN_THE_WILD: 'EW', EXTINCT: 'EX',
};
export const siglaAmeaca = (v) => (v ? SIGLA_AMEACA[v] || v : null);
export const ehAmeacada = (v) => ['VU', 'EN', 'CR'].includes(siglaAmeaca(v));
/** Predomínio amazônico nos pacotes (nome por extenso) e nos índices (letra). */
export const semPredominio = (v) => v === 'n' || v === 'nao_predominante';
export const comPredominio = (v) => v === 'p' || v === 'predominante';

/** Procedências em que alguém declara coleta na Amazônia: o curador, ao ler o artigo, ou a base de origem. */
export const COLETA_AMAZONICA_DECLARADA = new Set(['curador_artigo_amazonia', 'base_declara_amazonia_legal']);
/** Tipos de ensaio do ChEMBL (`ensaio_tipo`, códigos unidos por «+»). */
export const TIPO_ENSAIO = { B: 'ensaio de ligação', F: 'ensaio funcional', A: 'ensaio ADME', T: 'ensaio de toxicidade', P: 'ensaio físico-químico', U: 'ensaio não classificado' };

/**
 * Título de obra para exibição. As fontes bibliográficas gravam itálico, subscrito e sobrescrito como marcas, às
 * vezes já escapadas: as marcas pareadas dessa lista valem, o resto do título segue como texto. Nome científico
 * ou expressão latina em itálico que os metadados trazem colado à palavra vizinha ganha o espaço que falta.
 */
export function tituloObra(titulo) {
  let s = esc(String(titulo ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  for (const m of ['i', 'sub', 'sup', 'b']) s = s.replace(new RegExp(`&lt;${m}&gt;(.*?)&lt;/${m}&gt;`, 'gs'), `<${m}>$1</${m}>`);
  const nome = (c) => /^[A-Z(]|\s/.test(c);      // «Piper aduncum», «in vitro»; não um descritor como «trans»
  s = s.replace(/&lt;\/?[a-z][a-z0-9:]*\s*\/?&gt;/gi, '')
    .replace(/([A-Za-zÀ-ÿ]{2})<i>([^<]{4,})<\/i>/g, (tudo, antes, c) => (nome(c) ? `${antes} <i>${c}</i>` : tudo))
    .replace(/<i>([^<]{4,})<\/i>(?=[A-Za-zÀ-ÿ]{2}|\()/g, (tudo, c) => (nome(c) ? `${tudo} ` : tudo));
  return bruto(s);
}

export function urlDoi(doi) { return doi ? `https://doi.org/${encodeURI(doi)}` : null; }
export function urlPmid(pmid) { return pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/` : null; }

// Projeção de Mercator esférica (nucleo/bmb/projecao.py): converte o espaço do mapa em latitude e longitude
const _LONMIN = -73.9904, _LONMAX = -34.7930, _LATMAX = 5.2718;
const _K_PROJ = 1000.0 / (_LONMAX - _LONMIN);
const _M0_DEG = (Math.log(Math.tan(Math.PI / 4 + (_LATMAX * Math.PI) / 360)) * 180) / Math.PI;

export function mapaParaGeo(mx, my) {
  const lon = mx / _K_PROJ + _LONMIN;
  const mRad = ((_M0_DEG - my / _K_PROJ) * Math.PI) / 180;
  const lat = ((2 * Math.atan(Math.exp(mRad)) - Math.PI / 2) * 180) / Math.PI;
  return { lat, lon };
}

export function fmtCoord(graus, pos, neg) {
  const s = graus >= 0 ? pos : neg;
  const tot = Math.round(Math.abs(graus) * 60);
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}°${String(tot % 60).padStart(2, '0')}′${s}`;
}

/** Baixa o recorte em tela como CSV (UTF-8 com BOM, compatível com planilhas). */
export function baixarCSV(nomeArquivo, colunas, linhas) {
  const celula = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [colunas, ...linhas].map((l) => l.map(celula).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
