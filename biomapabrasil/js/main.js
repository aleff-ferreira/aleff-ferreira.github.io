// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Inicialização, roteador por hash (links compartilháveis) e a trilha território → espécie → molécula → ação.
import { $, $$, esc, icone, anunciar, fmtData, fmtInt, GRUPOS, reduzMovimento, conexaoLenta, alternarIdioma, traduzirDOM, idiomaAtual, tr, trn, semPredominio, nomeMolecula } from './util.js';
import * as dados from './dados.js';
import { criarMapa } from './mapa.js';
import { criarBusca } from './busca.js';
import { montarConstelacao, animarContadores, movimentoPausado } from './constelacao.js';
import * as perfis from './perfis.js';

let _modPaginas, _modDetMol;
const carregarPaginas = () => (_modPaginas ||= import('./viz/paginas.js'));
const carregarDetMol = () => (_modDetMol ||= import('./viz/detalhe_mol.js'));

const el = {
  mapa: $('#mapa'), corpo: $('#painel-corpo'), trilha: $('#trilha'), vistaMapa: $('#vista-mapa'), vistaPagina: $('#vista-pagina'),
  menu: $$('.menu a'), principal: $('#principal'), progresso: $('#progresso-rota'), telemetria: $('#topo-telemetria span'),
};
const estado = {
  manifesto: null, indice: null, ufs: [], mapa: null,
  uf: null,            // sigla do estado escolhido (persiste enquanto se navega por espécie e molécula)
  taxonItem: null, molItem: null, resumoAcao: null,
  filtroGrupos: new Set(['P', 'A', 'F', 'O']),
  filtros: { coleta: false, curador: false },   // coleta amazônica declarada; conferido por curador
  metrica: 'amazonicas',   // 'amazonicas' | 'todas' | 'registros': o que o mapa mede na visão geral
  mapaDeTaxon: false,      // o mapa mostra os registros de um táxon, não a medida da visão geral
  navegacoes: 0, token: 0, primeira: true,
};

// ═══════════════════════════ tema e movimento ═══════════════════════════
function temaEscuroEfetivo() {
  const t = document.documentElement.dataset.tema;
  return t === 'escuro' || (t !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
}
function atualizarBotaoTema() {
  const escuro = temaEscuroEfetivo();
  const b = $('#tema');
  if (!b) return;
  b.setAttribute('aria-pressed', String(escuro));
  b.setAttribute('aria-label', tr(escuro ? 'Tema escuro ativo. Mudar para o tema claro' : 'Tema claro ativo. Mudar para o tema escuro'));
  $('#tema-ic')?.setAttribute('href', escuro ? '#i-sol' : '#i-lua');
}
function iniciarTema() {
  try {
    const salvo = localStorage.getItem('bmb-tema');
    document.documentElement.dataset.tema = salvo || 'escuro';
  } catch {
    document.documentElement.dataset.tema = 'escuro';
  }
  atualizarBotaoTema();
  $('#tema')?.addEventListener('click', () => {
    const novo = temaEscuroEfetivo() ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem('bmb-tema', novo); } catch { /* ignorado */ }
    atualizarBotaoTema();
    window.dispatchEvent(new CustomEvent('bmb:tema'));
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    atualizarBotaoTema();
    window.dispatchEvent(new CustomEvent('bmb:tema'));
  });
}

function atualizarBotaoMovimento() {
  const pausado = document.documentElement.dataset.movimento === 'pausado';
  const btn = $('#movimento');
  btn?.setAttribute('aria-pressed', String(pausado));
  btn?.setAttribute('aria-label', tr(pausado ? 'Animações pausadas. Ativar animações' : 'Pausar animações'));
}
function iniciarMovimento() {
  const btn = $('#movimento');
  if (!btn) return;
  const aplicar = (pausado) => {
    if (pausado) document.documentElement.dataset.movimento = 'pausado';
    else delete document.documentElement.dataset.movimento;
    atualizarBotaoMovimento();
    window.dispatchEvent(new CustomEvent('bmb:movimento'));
  };
  let pausadoInicial = reduzMovimento();
  try {
    const salvo = localStorage.getItem('bmb-movimento');
    if (salvo === 'pausado') pausadoInicial = true;
    else if (salvo === 'ativo') pausadoInicial = false;
  } catch { /* ignorado */ }
  aplicar(pausadoInicial);

  btn.addEventListener('click', () => {
    const novo = document.documentElement.dataset.movimento !== 'pausado';
    try { localStorage.setItem('bmb-movimento', novo ? 'pausado' : 'ativo'); } catch { /* ignorado */ }
    aplicar(novo);
    anunciar(tr(novo ? 'Animações pausadas.' : 'Animações ativadas.'));
  });
}

let timerRota;
function pulsarBarraRota() {
  if (!el.progresso || movimentoPausado()) return;
  clearTimeout(timerRota);
  el.progresso.classList.add('ativa');
  timerRota = setTimeout(() => el.progresso.classList.remove('ativa'), 520);
}

// ═══════════════════════════ trilha ═══════════════════════════
function renderTrilha(atual) {
  const uf = estado.uf ? estado.ufs.find((u) => u.s === estado.uf) : null;
  const t = estado.taxonItem, m = estado.molItem;
  const g = t ? GRUPOS[t.grupo] : null;
  const hrefMol = m ? (t ? `#/especie/${t.gbif}/molecula/${m.id}` : `#/molecula/${m.id}`) : null;
  const passos = [
    { num: '01', rot: 'Território', ic: 'territorio', val: uf ? uf.n : tr('Brasil'), href: uf ? `#/uf/${uf.s}` : '#/', i: 0 },
    { num: '02', rot: 'Espécie', ic: g ? g.icone : 'planta', val: t ? t.nome : tr('Escolha uma espécie'), italico: !!t, href: t ? `#/especie/${t.gbif}` : null, i: 1 },
    { num: '03', rot: 'Molécula', ic: 'molecula', val: m ? m.nome : (t ? tr('Escolha uma molécula') : '–'), href: hrefMol, i: 2 },
    { num: '04', rot: 'Ação biológica', ic: 'acao', val: m ? estado.resumoAcao : '–', rolar: m ? 'acao-biologica' : null, i: 3 },
  ];
  el.trilha.innerHTML = passos.map((p) => {
    const conteudo = `<span class="rot"><span class="passo-num">${p.num}</span>${icone(p.ic)}${esc(tr(p.rot))}</span><span class="val${p.italico ? ' it' : ''}" title="${esc(p.val)}">${esc(p.val)}</span>`;
    const cur = p.i === atual ? ' atual' : '';
    const aria = p.i === atual ? ' aria-current="step"' : '';
    if (p.rolar) return `<button type="button" class="passo${cur}" data-rolar="${p.rolar}"${aria}>${conteudo}</button>`;
    if (p.href) return `<a class="passo${cur}" href="${esc(p.href)}"${aria}>${conteudo}</a>`;
    return `<span class="passo vazio">${conteudo}</span>`;
  }).join('');
}

// ═══════════════════════════ mapa e painel ═══════════════════════════
const METRICAS = {
  amazonicas: { titulo: 'Táxons do banco por estado, exceto os de registros dispersos', um: '{n} táxon', varios: '{n} táxons',
    nota: 'Exclui táxons com menos da metade dos registros brasileiros na Amazônia Legal. Conta táxons deste banco, não a biodiversidade do estado. Fonte: GBIF.' },
  todas: { titulo: 'Táxons do banco com registro no estado', um: '{n} táxon', varios: '{n} táxons',
    nota: 'Conta táxons deste banco no recorte amazônico, não a biodiversidade do estado. Fonte: GBIF.' },
  registros: { titulo: 'Registros do GBIF dos táxons do banco', um: '{n} registro', varios: '{n} registros',
    nota: 'Estados mais amostrados têm mais registros. Fonte: GBIF.' },
};
function valoresOverview() {
  const v = Object.fromEntries(estado.ufs.map((u) => [u.s, 0]));
  for (const t of estado.indice.lista) {
    if (!t.recorte || !estado.filtroGrupos.has(t.grupo)) continue;
    if (!perfis.passaFiltroTaxon(t, estado.filtros)) continue;
    if (estado.metrica === 'amazonicas' && t.predominio === 'n') continue;
    for (const [uf, n] of Object.entries(t.uf || {})) if (n > 0) v[uf] = (v[uf] || 0) + (estado.metrica === 'registros' ? n : 1);
  }
  return v;
}
function mapaOverview() {
  estado.mapaDeTaxon = false;
  const m = METRICAS[estado.metrica];
  estado.mapa.setValores(valoresOverview(), { titulo: tr(m.titulo), rotular: (n) => trn(n, m.um, m.varios), nota: tr(m.nota) });
}
function mapaTaxon(pack) {
  estado.mapaDeTaxon = true;
  const consulta = pack.consultas[pack.recorte.consulta];
  estado.mapa.setValores(pack.uf, { titulo: tr('Registros do GBIF de {nome}', { nome: pack.nome }), rotular: (n) => trn(n, '{n} registro', '{n} registros'),
    nota: consulta ? tr('Contagens por estado. Consulta de {data}.', { data: fmtData(consulta.data) }) : '' });
}

function mostrarVista(tipo, molecula = false) {
  document.documentElement.toggleAttribute('data-cena-molecular', molecula);
  el.vistaMapa.querySelector('.mapa-coluna').hidden = molecula;
  el.vistaMapa.classList.toggle('vista-molecula', molecula);
  if (molecula && !document.getElementById('css-molecula')) {
    document.head.append(Object.assign(document.createElement('link'), { id: 'css-molecula', rel: 'stylesheet', href: 'css/molecula.css' }));
  }
  el.vistaMapa.hidden = tipo !== 'mapa';
  el.vistaPagina.hidden = tipo !== 'pagina';
  if (tipo === 'mapa' && !molecula) requestAnimationFrame(() => estado.mapa?.refrescar());
}
function marcarMenu(vista) {
  el.menu.forEach((a) => { if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function depoisDeRenderizar(titulo, focoPainel = true) {
  const tLoc = tr(titulo);
  document.title = `${tLoc} · BioMapaBrasil`;
  if (!estado.primeira) {
    anunciar(tLoc);
    if (focoPainel) { const h = $('#painel-titulo') || $('h1', el.vistaPagina); h?.focus({ preventScroll: true }); }
  }
  estado.primeira = false;
}
function pintarPainel({ titulo, corpo }, { animar = true } = {}) {
  el.corpo.innerHTML = corpo.toString();
  if (animar) {
    el.corpo.scrollTop = 0;
    window.scrollTo?.({ top: 0 });
  }
  perfis.hidratarEstruturas(el.corpo);
  perfis.hidratarMidia(el.corpo);
  traduzirDOM(el.corpo);
  traduzirDOM(el.trilha);
  if (animar) animarContadores(el.corpo);
  montarConstelacao(el.corpo, {
    indice: estado.indice,
    ufs: estado.ufs,
    filtroGrupos: estado.filtroGrupos,
    filtros: estado.filtros,
    aoNavegar: (href) => { location.hash = href; },
  });
  depoisDeRenderizar(titulo, animar);
}
function carregando() { el.corpo.innerHTML = `<p class="carregando" role="status">${esc(tr('Carregando…'))}</p>`; }
function erro(e, refazer) {
  console.error(e);
  el.corpo.innerHTML = `<div class="erro-estado" role="alert"><p>${esc(tr('Não foi possível carregar este perfil. Tente novamente.'))}</p>
    <button type="button" class="btn" data-a="refazer">${esc(tr('Tentar novamente'))}</button></div>`;
  el.corpo.querySelector('[data-a="refazer"]').addEventListener('click', refazer);
}

// ───────── rotas do mapa ─────────
let ultimoRender = null;   // função que redesenha o painel atual (para filtros)
async function rotaVisaoGeral() {
  estado.uf = null; estado.taxonItem = null; estado.molItem = null; estado.resumoAcao = null;
  mostrarVista('mapa'); marcarMenu('mapa');
  estado.mapa.selecionar(null); estado.mapa.camada('lacunas', false); mapaOverview();
  if (estado.primeira) {
    estado.mapa.camada('al', true);
    if (!conexaoLenta()) estado.mapa.camada('rios', true);
  }
  estado.mapa.reiniciar();
  if (el.telemetria) el.telemetria.textContent = tr('AMAZÔNIA LEGAL');
  ultimoRender = () => { renderTrilha(0); pintarPainel(perfis.renderVisaoGeral({ manifesto: estado.manifesto, indice: estado.indice, filtroGrupos: estado.filtroGrupos, metrica: estado.metrica, filtros: estado.filtros })); };
  ultimoRender();
}
async function rotaUF(sigla, completo = false) {
  const uf = estado.ufs.find((u) => u.s === sigla);
  if (!uf) return rotaNaoEncontrada();
  const meu = ++estado.token;
  estado.uf = sigla; estado.taxonItem = null; estado.molItem = null; estado.resumoAcao = null;
  mostrarVista('mapa'); marcarMenu('mapa');
  estado.mapa.camada('lacunas', false); mapaOverview(); estado.mapa.selecionar(sigla); estado.mapa.focarUF(sigla);
  if (el.telemetria) el.telemetria.textContent = `${uf.s} · ${uf.n.toUpperCase()}`;
  if (estado.indice.parcial) {
    carregando();
    try {
      const ix = await dados.indice();
      if (meu !== estado.token) return;
      estado.indice = ix;
      mapaOverview();
    } catch (e) { erro(e, () => rotear()); return; }
  }
  ultimoRender = (c = completo) => {
    completo = c;
    renderTrilha(0);
    pintarPainel(perfis.renderUF({ uf, indice: estado.indice, filtroGrupos: estado.filtroGrupos, ufsAL: ufsAL(), completo, filtros: estado.filtros }));
  };
  ultimoRender();
}
const ufsAL = () => new Set(estado.ufs.filter((u) => u.al).map((u) => u.s));

async function rotaEspecie(gbif, molId) {
  const meu = ++estado.token;
  const item = estado.indice.porGbif.get(Number(gbif));
  mostrarVista('mapa', !!molId); marcarMenu(molId ? 'moleculas' : 'mapa');
  estado.mapa.camada('lacunas', false);
  estado.taxonItem = item || null; estado.molItem = null; estado.resumoAcao = null;
  estado.mapa.selecionar(estado.uf);
  renderTrilha(molId ? 2 : 1);
  carregando();
  try {
    const pack = await dados.taxon(gbif);
    if (meu !== estado.token) return;
    if (!molId) {
      mapaTaxon(pack);
      if (pack.recorte.dentro && !semPredominio(pack.recorte.predominio)) estado.mapa.focarAmazonia(); else estado.mapa.reiniciar();
    }
    if (el.telemetria) el.telemetria.textContent = `GBIF ${pack.gbif} · ${pack.nome.toUpperCase().slice(0, 22)}`;
    if (molId) {
      const [molPack, detMol] = await Promise.all([dados.molecula(molId), carregarDetMol()]);
      if (meu !== estado.token) return;
      estado.molItem = { id: molPack.id, nome: nomeMolecula(molPack.nome, molPack.id) };
      estado.resumoAcao = resumoAcao(molPack);
      ultimoRender = () => { renderTrilha(3); pintarPainel(detMol.renderMolecula({ pack: molPack, taxonCtx: Number(gbif) })); };
    } else {
      let mostrarMais = false, filtroMol = '', paginasCarregadas = false;
      const carregarExtrasTaxon = async () => {
        if (paginasCarregadas || !pack.paginas_moleculas?.length) return;
        paginasCarregadas = true;
        try {
          const lotes = await Promise.all(pack.paginas_moleculas.map((p) => dados.paginaTaxonExtra(p)));
          for (const pg of lotes) {
            const baseR = pack.refs.length;
            const baseC = pack.consultas.length;
            pack.refs.push(...(pg.refs || []));
            pack.consultas.push(...(pg.consultas || []));
            for (const m of pg.moleculas || []) {
              if (m.afirmacao?.refs) m.afirmacao.refs = m.afirmacao.refs.map((i) => i + baseR);
              if (m.afirmacao?.consulta != null) m.afirmacao.consulta += baseC;
              pack.moleculas.push(m);
            }
          }
        } catch { paginasCarregadas = false; }
      };
      ultimoRender = async (o = {}) => {
        const filtrando = 'filtroMol' in o;
        if ('mostrarMais' in o) mostrarMais = o.mostrarMais;
        if (filtrando) filtroMol = o.filtroMol;
        const filtroAtivo = estado.filtros.coleta || estado.filtros.curador;
        if ((mostrarMais || filtrando || filtroAtivo) && pack.paginas_moleculas?.length && !paginasCarregadas) {
          await carregarExtrasTaxon();
          if (meu !== estado.token) return;
        }
        renderTrilha(1);
        pintarPainel(perfis.renderTaxon({ pack, indiceItem: item, ufsAL: ufsAL(), mostrarMais, filtroMol, filtros: estado.filtros }), { animar: !filtrando && !o.semRolar });
        if (filtrando) { const i = $('#f-mol'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
      };
    }
    ultimoRender();
  } catch (e) { erro(e, () => rotear()); }
}
async function rotaMolecula(id) {
  const meu = ++estado.token;
  estado.taxonItem = null; estado.molItem = null; estado.resumoAcao = null;
  mostrarVista('mapa', true); marcarMenu('moleculas');
  renderTrilha(2); carregando();
  try {
    const [pack, detMol] = await Promise.all([dados.molecula(id), carregarDetMol()]);
    if (meu !== estado.token) return;
    estado.molItem = { id: pack.id, nome: nomeMolecula(pack.nome, pack.id) };
    estado.resumoAcao = resumoAcao(pack);
    if (el.telemetria) el.telemetria.textContent = `${(pack.inchikey || pack.nome).slice(0, 14)} · ${tr('MOLÉCULA')}`;
    ultimoRender = () => { renderTrilha(3); pintarPainel(detMol.renderMolecula({ pack, taxonCtx: null })); };
    ultimoRender();
  } catch (e) { erro(e, () => rotear()); }
}
function resumoAcao(m) {
  const partes = [];
  const n = m.total_atividades ?? m.atividades.length;
  if (n) partes.push(trn(n, '{n} registro de bioatividade', '{n} registros de bioatividade'));
  if (m.clinico) partes.push(tr('fármaco aprovado'));
  if (m.ocorre_em.some((o) => o.afirmacao.tipo === 'funcao_toxina')) partes.push(tr('função anotada'));
  return partes.length ? partes.join(' · ') : tr('sem registro');
}

async function rotaBacia(baciaId) {
  const meu = ++estado.token;
  estado.uf = null; estado.taxonItem = null; estado.molItem = null; estado.resumoAcao = null;
  mostrarVista('mapa'); marcarMenu('mapa');
  estado.mapa.selecionar(null); estado.mapa.camada('lacunas', false); mapaOverview();
  estado.mapa.focarAmazonia();
  if (el.telemetria) el.telemetria.textContent = tr('SUB-BACIA HIDROGRÁFICA');
  carregando();
  try {
    const [ix, baciasGeo, paginas] = await Promise.all([
      estado.indice.parcial ? dados.indice() : estado.indice,
      dados.geoBacias(),
      carregarPaginas(),
    ]);
    if (meu !== estado.token) return;
    estado.indice = ix;
    mapaOverview();
    ultimoRender = () => {
      renderTrilha(0);
      pintarPainel(paginas.renderBacia({ baciaId, baciasGeo, indice: estado.indice, filtroGrupos: estado.filtroGrupos, filtros: estado.filtros }));
    };
    ultimoRender();
  } catch (e) { erro(e, () => rotear()); }
}

// ───────── lacunas ─────────
async function rotaLacunas() {
  const meu = ++estado.token;
  estado.uf = null; estado.taxonItem = null; estado.molItem = null; estado.resumoAcao = null;
  mostrarVista('mapa'); marcarMenu('lacunas');
  estado.mapa.selecionar(null); estado.mapa.camada('lacunas', true); estado.mapa.camada('al', true);
  mapaOverview();
  estado.mapa.focarAmazonia();
  if (el.telemetria) el.telemetria.textContent = tr('GRADE DE 0,5° · LACUNAS DE COLETA');
  renderTrilha(0); carregando();
  try {
    const [grade, materiaEscura, paginas] = await Promise.all([
      dados.geoLacunas(),
      dados.viz('materia_escura').catch(() => null),
      carregarPaginas(),
    ]);
    if (meu !== estado.token) return;
    const ix = Object.fromEntries(grade.colunas.map((c, i) => [c, i]));
    const por = new Map();
    let total = 0, zero = 0, poucas = 0, criticas = 0, protegidas = 0;
    for (const l of grade.linhas) {
      const sigla = estado.mapa.ufDoPonto(l[ix.x] + l[ix.w] / 2, l[ix.y] + l[ix.h] / 2);
      const u = sigla && estado.ufs.find((x) => x.s === sigla);
      if (!u || !u.al) continue;
      total++;
      const pouca = l[ix.d] < 0.05;
      if (l[ix.n] === 0) zero++;
      if (pouca) poucas++;
      if (ix.biv != null && l[ix.biv] === 'G3_P3') criticas++;
      if (ix.prot != null && l[ix.prot] >= 0.25) protegidas++;
      const r = por.get(sigla) || { nome: u.n, celulas: 0, poucas: 0 };
      r.celulas++; if (pouca) r.poucas++;
      por.set(sigla, r);
    }
    const porUF = [...por.values()].sort((a, b) => b.poucas / b.celulas - a.poucas / a.celulas);
    ultimoRender = () => {
      pintarPainel(paginas.renderLacunas({ resumo: { total, zero, poucas, criticas, protegidas, consultas: grade.consultas || [], porUF }, materiaEscura }));
      paginas.hidratarLacunas(el.corpo, materiaEscura);
    };
    ultimoRender();
  } catch (e) { erro(e, () => rotear()); }
}

// ───────── páginas ─────────
let rotaAbort = null;
function pagina(vista, titulo, montar) {
  const meu = ++estado.token;
  const signal = rotaAbort?.signal;
  mostrarVista('pagina'); marcarMenu(vista);
  if (el.telemetria) el.telemetria.textContent = `${tr(titulo).toUpperCase()} · BIOMAPABRASIL`;
  Promise.resolve(montar(el.vistaPagina, { signal })).then(() => {
    if (meu !== estado.token || signal?.aborted) return;
    traduzirDOM(el.vistaPagina); depoisDeRenderizar(titulo);
  }).catch((e) => {
    if (meu !== estado.token || signal?.aborted) return;
    console.error(e);
    el.vistaPagina.innerHTML = `<div class="pagina"><div class="erro-estado" role="alert">${esc(tr('Não foi possível carregar esta página. Tente novamente.'))}</div></div>`;
  });
  window.scrollTo?.({ top: 0 });
}
function rotaNaoEncontrada() {
  pagina('', 'Página não encontrada', (r) => { r.innerHTML = '<div class="pagina"><h1>Página não encontrada</h1><p>Este endereço não existe.</p><p><a href="#/">Voltar ao mapa</a></p></div>'; });
}

// ═══════════════════════════ roteador ═══════════════════════════
function rotear() {
  rotaAbort?.abort();
  rotaAbort = new AbortController();
  pulsarBarraRota();
  const bruto_ = location.hash.replace(/^#/, '') || '/';
  const [caminho, consulta] = bruto_.split('?');
  const params = new URLSearchParams(consulta || '');
  let m;
  try {
    if (caminho === '/' || caminho === '') return rotaVisaoGeral();
    if ((m = caminho.match(/^\/uf\/([A-Za-z]{2})$/))) return rotaUF(m[1].toUpperCase());
    if ((m = caminho.match(/^\/bacia\/([a-z0-9_:%-]+)$/i))) { const bId = decodeURIComponent(m[1]).toUpperCase(); return rotaBacia(bId.startsWith('BAC:') ? bId : `BAC:${bId}`); }
    if ((m = caminho.match(/^\/especie\/(\d+)(?:\/molecula\/(\d+))?$/))) return rotaEspecie(m[1], m[2]);
    if ((m = caminho.match(/^\/molecula\/(\d+)$/))) return rotaMolecula(m[1]);
    if (caminho === '/lacunas') return rotaLacunas();
    if (caminho === '/galaxia') return pagina('galaxia', 'Espaço químico', (r, o) => import('./viz/galaxia_quimica.js').then((m) => !o.signal?.aborted && m.montarGalaxia(r, params, o)));
    if (caminho === '/fluxo') return pagina('fluxo', 'Fluxos e linhagens', (r, o) => import('./viz/fluxo_farmacologico.js').then((m) => !o.signal?.aborted && m.montarFluxo(r, o)));
    if (caminho === '/floresta') return pagina('floresta', 'Estratos florestais', (r, o) => import('./viz/raiox_floresta.js').then((m) => !o.signal?.aborted && m.montarFloresta(r, o)));
    if (caminho === '/filoquimica') return pagina('filoquimica', 'Quimiotaxonomia', (r, o) => import('./viz/filoquimica.js').then((m) => !o.signal?.aborted && m.montarFiloquimica(r, o)));
    if (caminho === '/especies') return pagina('especies', 'Espécies', (r, o) => Promise.all([dados.indice(), carregarPaginas()]).then(([ix, paginas]) => { if (o.signal?.aborted) return; estado.indice = ix; return paginas.montarEspecies(r, { indice: ix, ufs: estado.ufs, params, dataDados: estado.manifesto.gerado_em, recorteMin: estado.manifesto.recorte?.n_al_min }); }));
    if (caminho === '/moleculas') return pagina('moleculas', 'Moléculas', (r, o) => carregarPaginas().then((paginas) => !o.signal?.aborted && paginas.montarMoleculas(r, { params, dataDados: estado.manifesto.gerado_em })));
    if (caminho === '/fontes') return pagina('fontes', 'Fontes e método', (r, o) => carregarPaginas().then((paginas) => { if (!o.signal?.aborted) r.innerHTML = paginas.renderFontes(estado.manifesto); }));
    if (caminho === '/dados') return pagina('dados', 'Dados abertos', (r, o) => carregarPaginas().then((paginas) => { if (!o.signal?.aborted) r.innerHTML = paginas.renderDados(estado.manifesto); }));
    if (caminho === '/sobre') return pagina('sobre', 'Sobre', (r, o) => carregarPaginas().then((paginas) => { if (!o.signal?.aborted) r.innerHTML = paginas.renderSobre(); }));
    return rotaNaoEncontrada();
  } catch (e) { console.error(e); erro(e, rotear); }
}

/** Rola até o elemento: só o painel, quando ele é a área rolável (telas largas); a janela, no celular. */
function rolarAte(alvo) {
  if (!alvo) return;
  const comportamento = movimentoPausado() ? 'auto' : 'smooth';
  const c = el.corpo;
  if (c.scrollHeight > c.clientHeight + 2 && getComputedStyle(c).overflowY !== 'visible') {
    const topo = alvo.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 8;
    c.scrollTo({ top: topo, behavior: comportamento });
  } else {
    alvo.scrollIntoView({ behavior: comportamento, block: 'start' });
  }
  alvo.setAttribute('tabindex', '-1');
  alvo.focus({ preventScroll: true });
}

// ═══════════════════════════ eventos do painel e cópia ═══════════════════════════
function ligarPainel() {
  el.corpo.addEventListener('click', (e) => {
    const g = e.target.closest('[data-grupo]');
    if (g) {
      const k = g.dataset.grupo;
      if (estado.filtroGrupos.has(k) && estado.filtroGrupos.size > 1) estado.filtroGrupos.delete(k); else estado.filtroGrupos.add(k);
      mapaOverview(); ultimoRender?.();
      $(`[data-grupo="${k}"]`, el.corpo)?.focus();
      return;
    }
    const fl = e.target.closest('[data-filtro]');
    if (fl) {
      const k = fl.dataset.filtro;
      estado.filtros[k] = !estado.filtros[k];
      const aplicar = async () => {
        const noTaxon = estado.mapaDeTaxon;
        if (!noTaxon) mapaOverview();
        await ultimoRender?.(noTaxon ? { semRolar: true } : undefined);
        $(`[data-filtro="${k}"]`, el.corpo)?.focus();
      };
      // «conferido por curador» lê a coluna `verificadas`, que só o índice completo traz
      if (k === 'curador' && estado.filtros.curador && estado.indice.parcial) {
        dados.indice().then((ix) => { estado.indice = ix; aplicar(); }).catch(() => { estado.filtros.curador = false; aplicar(); });
        return;
      }
      aplicar();
      return;
    }
    const me = e.target.closest('[data-metrica]');
    if (me) {
      estado.metrica = me.dataset.metrica;
      if (estado.metrica === 'registros' && estado.indice.parcial) {
        dados.indice().then((ix) => {
          estado.indice = ix;
          mapaOverview(); ultimoRender?.();
          $(`[data-metrica="${estado.metrica}"]`, el.corpo)?.focus();
        }).catch(() => {});
        return;
      }
      mapaOverview(); ultimoRender?.();
      $(`[data-metrica="${estado.metrica}"]`, el.corpo)?.focus();
      return;
    }
    const ir = e.target.closest('[data-ir]'); if (ir) { location.hash = ir.dataset.ir; return; }
    if (e.target.closest('[data-voltar]')) { estado.navegacoes > 0 ? history.back() : (location.hash = '#/'); return; }
    const a = e.target.closest('[data-a]');
    if (a?.dataset.a === 'ver-todas') { ultimoRender?.(true); return; }
    if (a?.dataset.a === 'mais-mol') { ultimoRender?.({ mostrarMais: true }); return; }
  });
  el.corpo.addEventListener('input', (e) => { if (e.target.id === 'f-mol') ultimoRender?.({ filtroMol: e.target.value, mostrarMais: true }); });
  el.trilha.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rolar]');
    if (b) rolarAte(document.getElementById(b.dataset.rolar));
  });
  el.principal.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copiar]');
    if (!c) return;
    const texto = c.dataset.copiar || '';
    const rot = c.dataset.rotulo || tr('texto');
    try {
      await navigator.clipboard.writeText(texto);
      const original = c.innerHTML;
      c.textContent = tr('Copiado');
      anunciar(tr('{rotulo}: copiado.', { rotulo: rot }));
      setTimeout(() => { if (c.isConnected) c.innerHTML = original; }, 1600);
    } catch {
      anunciar(tr('Não foi possível copiar.'));
    }
  });
}

// ═══════════════════════════ início ═══════════════════════════
function escreverVersao() {
  const c = estado.manifesto.contagens;
  $('#rodape-versao').textContent = tr(c.moleculas_inchikey != null
    ? 'Dados de {data}. Táxons no recorte: {t}. Estruturas (InChIKey): {m}.'
    : 'Dados de {data}. Táxons no recorte: {t}. Moléculas: {m}.',
  { data: fmtData(estado.manifesto.gerado_em), t: fmtInt(c.taxons_no_recorte), m: fmtInt(c.moleculas_inchikey ?? c.moleculas) });
}
async function iniciar() {
  const primeiraMol = location.hash.match(/\/molecula\/(\d+)(?:$|[/?])/);
  if (primeiraMol) {
    mostrarVista('mapa', true);
    Promise.all([dados.molecula(Number(primeiraMol[1])), carregarDetMol()]).then(([pack]) => {
      const e = pack.estruturas_3d?.[0];
      if (e) return Promise.all([import('./viz/estrutura3d.js'), dados.estrutura3d(e.arquivo, e.sha256)]);
    }).catch(() => {}); // A rota apresenta o estado de erro da requisição principal.
  }
  iniciarTema();
  iniciarMovimento();
  const btnLang = $('#idioma');
  if (btnLang) {
    // O botão anuncia a língua de destino na própria língua de destino
    const syncBtn = () => {
      const en = idiomaAtual() === 'en';
      btnLang.textContent = en ? 'PT' : 'EN';
      btnLang.setAttribute('aria-pressed', String(en));
      btnLang.setAttribute('aria-label', en ? 'Mudar a interface para português' : 'Switch the interface to English');
      btnLang.lang = en ? 'pt-BR' : 'en';
      atualizarBotaoTema();
      atualizarBotaoMovimento();
    };
    btnLang.addEventListener('click', async () => {
      try { await alternarIdioma(dados.i18nEn); } catch { return; }
      syncBtn();
      traduzirDOM(document.body, true);
      if (estado.manifesto) { escreverVersao(); rotear(); }
    });
    try {
      const qsLang = new URLSearchParams(location.search).get('lang');
      if (qsLang === 'en' || localStorage.getItem('bmb-lang') === 'en') {
        await alternarIdioma(dados.i18nEn);
        syncBtn();
        traduzirDOM(document.body);
      }
    } catch { /* ignorado */ }
  }
  try {
    const [manifesto, indice, ufs] = await Promise.all([dados.manifesto(), dados.indiceMapa(), dados.geoUFs()]);
    estado.manifesto = manifesto; estado.indice = indice; estado.ufs = ufs.ufs;
    perfis.definirFiltrosOferecidos(manifesto.contagens);
    estado.mapa = criarMapa(el.mapa, {
      ufs, carregarRios: dados.geoRios, carregarLacunas: dados.geoLacunas, carregarBacias: dados.geoBacias,
    }, { aoEscolherUF: (s) => { location.hash = `#/uf/${s}`; } });
  } catch (e) {
    console.error(e);
    el.corpo.innerHTML = `<div class="erro-estado" role="alert"><p>${esc(tr('Não foi possível carregar os dados. Tente novamente.'))}</p>
      <button type="button" class="btn" data-a="recarregar">${esc(tr('Tentar novamente'))}</button></div>`;
    el.corpo.querySelector('[data-a="recarregar"]').addEventListener('click', () => location.reload());
    return;
  }
  escreverVersao();
  criarBusca({
    entrada: $('#q'), lista: $('#sugestoes'), ufs: estado.ufs,
    aoEscolher: (o) => { location.hash = o.href; },
  });
  ligarPainel();
  window.addEventListener('hashchange', () => { estado.navegacoes++; rotear(); });
  rotear();
  // Service worker: só em https (ou localhost com ?sw=1, para testá-lo). No desenvolvimento local ele ficaria servindo arquivos antigos.
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || (local && new URLSearchParams(location.search).has('sw')))) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker: o site funciona do mesmo jeito, só sem cache offline */ });
  }
}
iniciar();
