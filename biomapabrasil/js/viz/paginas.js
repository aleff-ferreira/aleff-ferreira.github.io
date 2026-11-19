// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Páginas: tabela de espécies, tabela de moléculas, lacunas, fontes e método, dados abertos e sobre.
// A tabela de espécies é a alternativa ao mapa (teclado, leitor de tela, conexão lenta).
import {
  html, bruto, icone, tr, trn, trDado, trPartes, fmtInt, fmtPct, fmtData, GRUPOS, PREDOMINIO, TIPOS_MOLECULA, DIMENSOES, EVIDENCIA, rotulo,
  semAcento, debounce, anunciar, baixarCSV, ehInchiKey, nomeMolecula,
} from '../util.js';
import * as dados from '../dados.js';
import { FILTROS, ROTULO_ESTRATO, filtroOferecido, itemEspecie, hidratarMidia, passaFiltroTaxon, chipsGrupo, chipsFiltro } from '../perfis.js';

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : v);
  return p.toString();
}
function atualizarURL(rota, params) {
  const s = qs(params);
  history.replaceState(null, '', `#${rota}${s ? `?${s}` : ''}`);
}

// ═══════════════════════════ espécies ═══════════════════════════
export function montarEspecies(raiz, { indice, ufs, params, dataDados, recorteMin }) {
  const comCurador = filtroOferecido('curador');
  const rawG = (params.get('g') || '').trim();
  const gNorm = rawG ? ({ p: 'P', planta: 'P', plantas: 'P', a: 'A', animal: 'A', f: 'F', fungo: 'F', fungos: 'F' }[rawG.toLowerCase()] || rawG.toUpperCase()) : '';
  const rawUf = (params.get('uf') || '').trim().toUpperCase();
  const ufNorm = ufs.some((u) => u.s === rawUf) ? rawUf : '';
  const rawBacia = (params.get('bacia') || '').trim().toUpperCase();
  const candBacia = rawBacia ? (rawBacia.startsWith('BAC:') ? rawBacia : `BAC:${rawBacia}`) : '';
  const baciaNorm = candBacia && (indice.legenda?.bacias?.[candBacia] || indice.lista.some((t) => t.bacias?.[candBacia] != null)) ? candBacia : '';
  const rawPred = (params.get('pred') || '').trim().toLowerCase();
  const predNorm = rawPred in PREDOMINIO ? rawPred : '';
  const est = {
    q: params.get('q') || '', g: gNorm in GRUPOS ? gNorm : '', uf: ufNorm, bacia: baciaNorm,
    estrato: (params.get('estrato') || '').trim(), dist: (params.get('dist') || '').trim(),
    fora: params.get('fora') === '1', coleta: params.get('coleta') === '1', curador: comCurador && params.get('curador') === '1',
    pred: predNorm, ord: params.get('ord') || 'nome', dir: params.get('dir') || 'asc', vista: params.get('vista') === 'cartoes' ? 'cartoes' : 'tabela',
  };
  const opcoesUF = ufs.map((u) => html`<option value="${u.s}" ${est.uf === u.s ? bruto('selected') : ''}>${u.n}</option>`);
  const listaBacias = Object.entries(indice.legenda?.bacias || {}).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const listaEstratos = [...new Set(indice.lista.map((t) => t.estrato).filter(Boolean))].sort();
  const listaDists = [...new Set(indice.lista.map((t) => t.distribuicao_br).filter(Boolean))].sort();
  raiz.innerHTML = html`<div class="pagina">
    <header>
      <p class="eyebrow">TABELA DE TÁXONS</p>
      <h1>Espécies</h1>
      <p class="sub">${recorteMin != null
        ? tr('Táxons do banco, com os mesmos dados do mapa. O recorte amazônico exige ao menos {n} registros do GBIF na Amazônia Legal.', { n: fmtInt(recorteMin) })
        : tr('Táxons do banco, com os mesmos dados do mapa.')}</p>
    </header>
    <form class="filtros" role="search" aria-label="${tr('Filtros da tabela de espécies')}">
      <label>Nome<input type="search" id="fe-q" value="${est.q}" placeholder="${tr('científico, popular ou sinônimo')}"></label>
      <label>Grupo<select id="fe-g"><option value="">Todos</option>${['P', 'A', 'F'].map((k) => html`<option value="${k}" ${est.g === k ? bruto('selected') : ''}>${tr(GRUPOS[k].plural)}</option>`)}</select></label>
      <label>Estado com registro<select id="fe-uf"><option value="">Qualquer</option>${opcoesUF}</select></label>
      ${listaBacias.length ? html`<label>Sub-bacia<select id="fe-bacia"><option value="">Qualquer</option>${listaBacias.map(([id, n]) => html`<option value="${id}" ${est.bacia === id ? bruto('selected') : ''}>${trDado(n)}</option>`)}</select></label>` : ''}
      ${listaEstratos.length ? html`<label>Estrato florestal<select id="fe-estrato"><option value="">Qualquer</option>${listaEstratos.map((k) => html`<option value="${k}" ${est.estrato === k ? bruto('selected') : ''}>${tr(ROTULO_ESTRATO[k] || k)}</option>`)}</select></label>` : ''}
      ${listaDists.length ? html`<label>Distribuição no Brasil<select id="fe-dist"><option value="">Qualquer</option>${listaDists.map((k) => html`<option value="${k}" ${est.dist === k ? bruto('selected') : ''}>${rotulo('distribuicao_br', k)}</option>`)}</select></label>` : ''}
      <label>Predomínio amazônico<select id="fe-pred"><option value="">Qualquer</option>${Object.entries(PREDOMINIO).map(([k, v]) => html`<option value="${k}" ${est.pred === k ? bruto('selected') : ''}>${tr(v.curto)}</option>`)}</select></label>
      <label class="check" title="${tr(FILTROS.coleta.dica)}"><input type="checkbox" id="fe-coleta" ${est.coleta ? bruto('checked') : ''}> ${tr(FILTROS.coleta.rotulo)}</label>
      ${comCurador ? html`<label class="check" title="${tr(FILTROS.curador.dica)}"><input type="checkbox" id="fe-curador" ${est.curador ? bruto('checked') : ''}> ${tr(FILTROS.curador.rotulo)}</label>` : ''}
      <label class="check"><input type="checkbox" id="fe-fora" ${est.fora ? bruto('checked') : ''}> Incluir táxons fora do recorte</label>
    </form>
    <div class="barra-catalogo">
      <p id="fe-resumo" class="fonte-linha" role="status"></p>
      <div class="acoes-catalogo">
        <div class="alternador-vista" role="group" aria-label="${tr('Modo de exibição')}">
          <button type="button" data-vista-cat="tabela" aria-pressed="${est.vista === 'tabela'}">${icone('lista')}Tabela</button>
          <button type="button" data-vista-cat="cartoes" aria-pressed="${est.vista === 'cartoes'}">${icone('grade')}Cartões</button>
        </div>
        <button type="button" class="btn sec" id="fe-csv">${icone('baixar')}Baixar CSV</button>
      </div>
    </div>
    <div class="tabela-wrap" id="fe-wrap-tabela" ${est.vista === 'cartoes' ? bruto('hidden') : ''}><table class="tabela" id="fe-tabela"></table></div>
    <ul class="grade-especies" id="fe-grade" ${est.vista === 'tabela' ? bruto('hidden') : ''}></ul>
  </div>`.toString();

  const COLS = [
    ['nome', 'Nome científico'], ['populares', 'Nome popular'], ['grupo', 'Grupo'], ['familia', 'Família'],
    ['n_al', est.bacia ? 'Registros na sub-bacia' : 'Registros na Amazônia Legal'], ['predominio', 'Predomínio'], ['moleculas', 'Moléculas'],
    ...(comCurador ? [['verificadas', 'Conferidas']] : []),
  ];
  const valor = (t, k) => (k === 'populares' ? (t.populares?.[0] || '') : k === 'n_al' && est.bacia ? (t.bacias?.[est.bacia] || 0) : k === 'n_al' && est.uf ? (t.uf?.[est.uf] || 0) : t[k] ?? '');
  raiz.querySelectorAll('form.filtros').forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
  const tabela = raiz.querySelector('#fe-tabela');
  const wrapTabela = raiz.querySelector('#fe-wrap-tabela');
  const grade = raiz.querySelector('#fe-grade');
  let atual = [];
  raiz.querySelector('#fe-csv').addEventListener('click', () => {
    baixarCSV('biomapabrasil_especies.csv',
      ['nome_cientifico', 'gbif_key', 'nomes_populares', 'grupo', 'familia', 'no_recorte', 'predominio_amazonico', 'registros_amazonia_legal',
       'registros_brasil', est.uf ? `registros_em_${est.uf}` : '', est.bacia ? `registros_na_${est.bacia}` : '',
       'moleculas', 'afirmacoes_conferidas_por_curador', 'coleta_amazonica_declarada', 'fonte_dos_numeros'].filter((c) => c !== ''),
      atual.map((t) => [t.nome, t.gbif, (t.populares || []).join('; '), (GRUPOS[t.grupo] || GRUPOS.O).rotulo, t.familia, t.recorte ? 'sim' : 'não',
        PREDOMINIO[t.predominio]?.rotulo || '', t.n_al, t.n_br, ...(est.uf ? [t.uf?.[est.uf] ?? 0] : []),
        ...(est.bacia ? [t.bacias?.[est.bacia] ?? 0] : []), t.moleculas, t.verificadas,
        t.coleta_amazonica_declarada ? 'sim' : 'não',
        `Registros: GBIF, com a consulta de cada táxon em dados/tabelas/taxa.csv. Moléculas: LOTUS, NuBBE-DB, NPAtlas e UniProt, com as consultas em dados/tabelas/afirmacoes.csv. Dados de ${fmtData(dataDados)}.`]));
    anunciar(tr('CSV baixado.'));
  });

  let sinsExtra = null;
  if (est.q.trim().length >= 2) {
    dados.indiceSinonimos().then((sx) => { sinsExtra = sx?.por_gbif || null; desenhar(); }).catch(() => {});
  }
  function desenhar() {
    if (!raiz.isConnected) return;
    const q = semAcento(est.q).trim();
    const linhas = indice.lista.filter((t) => (est.fora || t.recorte) && passaFiltroTaxon(t, est)
      && (!est.g || t.grupo === est.g) && (!est.pred || t.predominio === est.pred)
      && (!est.uf || (t.uf?.[est.uf] || 0) > 0)
      && (!est.bacia || (t.bacias?.[est.bacia] || 0) > 0)
      && (!est.estrato || t.estrato === est.estrato)
      && (!est.dist || t.distribuicao_br === est.dist)
      && (!q || semAcento([t.nome, ...(t.populares || []), ...(sinsExtra?.[String(t.gbif)] || t.sinonimos || [])].join(' ')).includes(q)));
    const sinal = est.dir === 'asc' ? 1 : -1;
    linhas.sort((a, b) => {
      const x = valor(a, est.ord), y = valor(b, est.ord);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * sinal || a.nome.localeCompare(b.nome);
    });
    atual = linhas;
    raiz.querySelector('#fe-resumo').textContent = !linhas.length ? tr('Nenhum registro para este filtro.')
      : est.uf ? trn(linhas.length, '{n} táxon com registro em {uf}', '{n} táxons com registro em {uf}', { uf: est.uf })
        : est.bacia ? trn(linhas.length, '{n} táxon registrado na sub-bacia', '{n} táxons registrados na sub-bacia')
          : trn(linhas.length, '{n} táxon', '{n} táxons');
    wrapTabela.hidden = est.vista !== 'tabela';
    grade.hidden = est.vista !== 'cartoes';

    tabela.innerHTML = html`<caption class="so-leitor">${tr('Táxons do banco. Os cabeçalhos ordenam a tabela.')}</caption>
      <thead><tr>${COLS.map(([k, rot]) => html`<th scope="col"${k === 'verificadas' ? bruto(` title="${tr('Afirmações conferidas por curador')}"`) : ''} aria-sort="${est.ord === k ? (est.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-ord="${k}">${k === 'n_al' && est.uf ? tr('Registros em {uf}', { uf: est.uf }) : k === 'n_al' && est.bacia ? tr('Registros na sub-bacia') : tr(rot)}${est.ord === k ? (est.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`)}</tr></thead>
      <tbody>${linhas.map((t) => {
        const g = GRUPOS[t.grupo] || GRUPOS.O, p = PREDOMINIO[t.predominio];
        return html`<tr><th scope="row"><a href="#/especie/${t.gbif}"><em>${t.nome}</em></a>${t.recorte ? '' : html` <span class="badge fora">${tr('fora do recorte')}</span>`}</th>
          <td translate="no">${t.populares?.[0] || '–'}</td><td><span class="badge ind">${icone(g.icone)}${tr(g.rotulo)}</span></td><td>${t.familia || '–'}</td>
          <td class="num">${fmtInt(valor(t, 'n_al'))}</td><td>${p ? html`<span class="badge ${p.classe}" title="${tr(p.rotulo)}">${tr(p.curto)}</span>` : '–'}</td><td class="num">${fmtInt(t.moleculas)}</td>${comCurador ? html`<td class="num">${fmtInt(t.verificadas)}</td>` : ''}</tr>`;
      })}</tbody>`.toString();

    if (est.vista === 'cartoes') {
      grade.innerHTML = html`${linhas.map((t) => itemEspecie(t, { uf: est.uf || null }))}`.toString();
      hidratarMidia(grade);
    }
    atualizarURL('/especies', {
      q: est.q, g: est.g, uf: est.uf, bacia: est.bacia, estrato: est.estrato, dist: est.dist,
      coleta: est.coleta, curador: est.curador, fora: est.fora, pred: est.pred,
      ord: est.ord === 'nome' ? '' : est.ord, dir: est.dir === 'asc' ? '' : est.dir,
      vista: est.vista === 'cartoes' ? 'cartoes' : '',
    });
  }
  const ligar = (id, evento, f) => raiz.querySelector(id)?.addEventListener(evento, f);
  ligar('#fe-q', 'input', debounce((e) => {
    est.q = e.target.value;
    if (!sinsExtra && est.q.trim().length >= 2) {
      dados.indiceSinonimos().then((sx) => { sinsExtra = sx?.por_gbif || {}; desenhar(); }).catch(() => {});
    }
    desenhar();
  }, 120));
  ligar('#fe-g', 'change', (e) => { est.g = e.target.value; desenhar(); });
  ligar('#fe-uf', 'change', (e) => { est.uf = e.target.value; desenhar(); });
  ligar('#fe-bacia', 'change', (e) => { est.bacia = e.target.value; desenhar(); });
  ligar('#fe-estrato', 'change', (e) => { est.estrato = e.target.value; desenhar(); });
  ligar('#fe-dist', 'change', (e) => { est.dist = e.target.value; desenhar(); });
  ligar('#fe-pred', 'change', (e) => { est.pred = e.target.value; desenhar(); });
  ligar('#fe-coleta', 'change', (e) => { est.coleta = e.target.checked; desenhar(); });
  if (comCurador) ligar('#fe-curador', 'change', (e) => { est.curador = e.target.checked; desenhar(); });
  ligar('#fe-fora', 'change', (e) => { est.fora = e.target.checked; desenhar(); });
  raiz.querySelector('.alternador-vista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista-cat]'); if (!b) return;
    est.vista = b.dataset.vistaCat;
    raiz.querySelectorAll('[data-vista-cat]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.vistaCat === est.vista)));
    desenhar();
  });
  tabela.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ord]'); if (!b) return;
    const k = b.dataset.ord;
    est.dir = est.ord === k && est.dir === 'asc' ? 'desc' : (k === 'nome' || k === 'populares' || k === 'grupo' || k === 'familia' ? 'asc' : 'desc');
    est.ord = k; desenhar();
    tabela.querySelector(`[data-ord="${k}"]`)?.focus();
    anunciar(tr(est.dir === 'asc' ? 'Ordem crescente por {coluna}.' : 'Ordem decrescente por {coluna}.', { coluna: tr(COLS.find((c) => c[0] === k)[1]) }));
  });
  desenhar();
}

// ═══════════════════════════ moléculas ═══════════════════════════
export async function montarMoleculas(raiz, { params, dataDados, signal } = {}) {
  const rawTipo = (params.get('tipo') || '').trim().toLowerCase();
  const tipoNorm = { p: 'p', pequena: 'p', pequena_molecula: 'p', t: 't', toxina: 't' }[rawTipo] || '';
  const rawN3d = (params.get('n3d') || '').trim().toLowerCase();
  const n3dNorm = ['e', 'p', 'c'].includes(rawN3d) ? rawN3d : '';
  const est = { q: params.get('q') || '', tipo: tipoNorm, n3d: n3dNorm, classe: params.get('classe') || '',
    ativ: params.get('ativ') === '1', aprov: params.get('aprov') === '1', coleta: params.get('coleta') === '1', p: Math.max(1, Number(params.get('p')) || 1) };
  raiz.innerHTML = html`<div class="pagina"><header>
    <p class="eyebrow">TABELA DE MOLÉCULAS</p>
    <h1>Moléculas</h1>
    <p class="sub">Pequenas moléculas relatadas em plantas, fungos e animais (LOTUS, NuBBE-DB, NPAtlas) e toxinas peptídicas e proteicas com função anotada (UniProt/Swiss-Prot).</p></header>
    <p class="carregando" id="fm-carga" role="status">Carregando…</p></div>`.toString();
  let ix;
  try { ix = await dados.indiceMoleculasComIk(); } catch {
    try { ix = await dados.indiceMoleculas(); } catch {
      if (signal?.aborted || !raiz.isConnected) return;
      const elErr = raiz.querySelector('#fm-carga');
      if (elErr) elErr.outerHTML = `<div class="erro-estado" role="alert">${tr('Não foi possível carregar a tabela de moléculas. Tente novamente.')}</div>`;
      return;
    }
  }
  if (signal?.aborted || !raiz.isConnected) return;
  const elCarga = raiz.querySelector('#fm-carga');
  if (!elCarga) return;
  const ROT_3D = { e: 'Experimental (wwPDB ou COD)', p: 'Predita (AlphaFold ou ESMFold)', c: 'Confôrmero calculado (RDKit)' };
  const CURTO_3D = { e: ['ok', 'Experimental'], p: ['alerta', 'Predita'], c: ['ind', 'Confôrmero calculado'] };
  const classes = [...new Set(ix.lista.map((m) => m.classe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'));
  elCarga.outerHTML = html`
    <form class="filtros" role="search" aria-label="${tr('Filtros da tabela de moléculas')}">
      <label>Buscar<input type="search" id="fm-q" value="${est.q}" placeholder="${tr('nome, BMB 00616, InChIKey, fórmula ou classe')}"></label>
      <label>Tipo<select id="fm-tipo"><option value="">Todos</option>${Object.entries(TIPOS_MOLECULA).map(([k, v]) => html`<option value="${k}" ${est.tipo === k ? bruto('selected') : ''}>${tr(v)}</option>`)}</select></label>
      ${classes.length ? html`<label>Classe química<select id="fm-classe"><option value="">Todas</option>${classes.map((c) => html`<option value="${c}" ${est.classe === c ? bruto('selected') : ''}>${trDado(c)}</option>`)}</select></label>` : ''}
      <label>Estrutura 3D<select id="fm-n3d"><option value="">Qualquer</option>${Object.entries(ROT_3D).map(([k, v]) => html`<option value="${k}" ${est.n3d === k ? bruto('selected') : ''}>${tr(v)}</option>`)}</select></label>
      <label class="check"><input type="checkbox" id="fm-ativ" ${est.ativ ? bruto('checked') : ''}> Com bioatividade medida</label>
      <label class="check"><input type="checkbox" id="fm-aprov" ${est.aprov ? bruto('checked') : ''}> Fármaco aprovado</label>
      <label class="check" title="${tr(FILTROS.coleta.dica)}"><input type="checkbox" id="fm-coleta" ${est.coleta ? bruto('checked') : ''}> ${tr(FILTROS.coleta.rotulo)}</label>
    </form>
    <div class="barra-catalogo">
      <p id="fm-resumo" class="fonte-linha" role="status"></p>
      <button type="button" class="btn sec" id="fm-csv">${icone('baixar')}Baixar CSV</button>
    </div>
    <div class="tabela-wrap"><table class="tabela" id="fm-tabela"></table></div>
    <div class="paginacao" id="fm-pag"></div>`.toString();
  raiz.querySelectorAll('form.filtros').forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
  const POR = 50;
  const tabela = raiz.querySelector('#fm-tabela'), pag = raiz.querySelector('#fm-pag');
  const nomes = ix.lista.map((m) => semAcento(`${m.nome} ${nomeMolecula(m.nome, m.id)} bmb ${String(m.id).padStart(5, '0')} bmb${m.id} #${m.id} ${m.inchikey || ''} ${m.formula || ''} ${m.classe || ''}`));
  let atual = [];
  raiz.querySelector('#fm-csv').addEventListener('click', () => {
    baixarCSV('biomapabrasil_moleculas.csv',
      ['molecula_id', 'nome', 'inchikey', 'formula', 'classe_quimica', 'tipo', 'estrutura_3d', 'taxons_do_banco', 'registros_de_bioatividade', 'farmaco_aprovado_chembl', 'coleta_amazonica_declarada', 'fonte_dos_numeros'],
      atual.map((m) => [m.id, m.nome, m.inchikey || '', m.formula || '', m.classe || '', TIPOS_MOLECULA[m.tipo], ROT_3D[m.n3d] || '', m.taxa, m.atividades, m.aprovado ? 'sim' : 'não', m.coleta_amazonica_declarada ? 'sim' : 'não',
        `LOTUS, NuBBE-DB, NPAtlas, UniProt, ChEMBL, wwPDB e COD. Consultas em dados/tabelas/afirmacoes.csv e consultas.csv. Dados de ${fmtData(dataDados)}.`]));
    anunciar(tr('CSV baixado.'));
  });
  function celulaFarmaco(m) {
    if (!m.aprovado) return '–';
    if (m.retirado) return html`<span class="badge alerta">${icone('farmaco')}${tr('com retirada registrada')}</span>`;
    if (m.cat_clin === 'i') return html`<span class="badge ind">${icone('farmaco')}${tr('metabólito primário ou insumo')}</span>`;
    return html`<span class="badge alerta">${icone('farmaco')}${tr('sim')}</span>`;
  }
  function desenhar() {
    if (!raiz.isConnected) return;
    const tokens = semAcento(est.q).trim().split(/\s+/).filter(Boolean);
    const idx = [];
    ix.lista.forEach((m, i) => {
      if ((!est.tipo || m.tipo === est.tipo) && (!est.classe || m.classe === est.classe) && (!est.n3d || m.n3d === est.n3d)
        && (!est.ativ || m.atividades > 0) && (!est.aprov || m.aprovado) && (!est.coleta || m.coleta_amazonica_declarada)
        && (!tokens.length || tokens.every((tk) => nomes[i].includes(tk)))) idx.push(i);
    });
    idx.sort((a, b) => ix.lista[b].taxa - ix.lista[a].taxa || ix.lista[b].atividades - ix.lista[a].atividades || ix.lista[a].nome.localeCompare(ix.lista[b].nome));
    const paginas = Math.max(1, Math.ceil(idx.length / POR));
    est.p = Math.min(est.p, paginas);
    atual = idx.map((i) => ix.lista[i]);
    const vis = idx.slice((est.p - 1) * POR, est.p * POR).map((i) => ix.lista[i]);
    raiz.querySelector('#fm-resumo').textContent = idx.length
      ? `${trn(idx.length, '{n} molécula', '{n} moléculas')}. ${tr('Ordem: número de táxons, depois registros de bioatividade.')}`
      : tr('Nenhum registro para este filtro.');
    tabela.innerHTML = html`<caption class="so-leitor">${tr('Moléculas do banco')}</caption>
      <thead><tr>${['Nome', 'Fórmula', 'Classe química', 'Tipo', 'Estrutura 3D', 'Táxons', 'Registros de bioatividade', 'Fármaco aprovado'].map((c) => html`<th scope="col">${tr(c)}</th>`)}</tr></thead>
      <tbody>${vis.map((m) => { const e3 = CURTO_3D[m.n3d]; const ik = ehInchiKey(m.nome); return html`<tr>
        <th scope="row"><a href="#/molecula/${m.id}">${nomeMolecula(m.nome, m.id)}</a>${ik ? html`<br><small class="mono">${m.nome.slice(0, 14)}</small>` : ''}</th>
        <td class="mono">${m.formula || '–'}</td>
        <td>${m.classe ? trDado(m.classe) : '–'}</td>
        <td><span class="badge ind">${icone('molecula')}${tr(TIPOS_MOLECULA[m.tipo] || '')}</span></td>
        <td>${e3 ? html`<span class="badge ${e3[0]}">${icone('cubo')}${tr(e3[1])}</span>` : '–'}</td>
        <td class="num">${fmtInt(m.taxa)}</td>
        <td class="num">${fmtInt(m.atividades)}</td>
        <td>${celulaFarmaco(m)}</td></tr>`; })}</tbody>`.toString();
    pag.innerHTML = html`<span>${tr('Página {p} de {n}', { p: fmtInt(est.p), n: fmtInt(paginas) })}</span><span class="paginacao-botoes"><button type="button" class="btn sec" data-p="-1" ${est.p <= 1 ? bruto('disabled') : ''}>${tr('Anterior')}</button>
      <button type="button" class="btn sec" data-p="1" ${est.p >= paginas ? bruto('disabled') : ''}>${tr('Próxima')}</button></span>`.toString();
    atualizarURL('/moleculas', { q: est.q, tipo: est.tipo, classe: est.classe, n3d: est.n3d, ativ: est.ativ, aprov: est.aprov, coleta: est.coleta, p: est.p > 1 ? est.p : '' });
  }
  const ligar = (id, evento, f) => raiz.querySelector(id)?.addEventListener(evento, f);
  ligar('#fm-q', 'input', debounce((e) => { est.q = e.target.value; est.p = 1; desenhar(); }, 120));
  ligar('#fm-tipo', 'change', (e) => { est.tipo = e.target.value; est.p = 1; desenhar(); });
  ligar('#fm-classe', 'change', (e) => { est.classe = e.target.value; est.p = 1; desenhar(); });
  ligar('#fm-n3d', 'change', (e) => { est.n3d = e.target.value; est.p = 1; desenhar(); });
  ligar('#fm-ativ', 'change', (e) => { est.ativ = e.target.checked; est.p = 1; desenhar(); });
  ligar('#fm-aprov', 'change', (e) => { est.aprov = e.target.checked; est.p = 1; desenhar(); });
  ligar('#fm-coleta', 'change', (e) => { est.coleta = e.target.checked; est.p = 1; desenhar(); });
  pag.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; est.p += Number(b.dataset.p); desenhar(); tabela.scrollIntoView({ block: 'start' }); });
  desenhar();
}

// ═══════════════════════════ sub-bacia hidrográfica ═══════════════════════════
export function renderBacia({ baciaId, baciasGeo, indice, filtroGrupos, filtros = {} }) {
  const bacia = (baciasGeo?.bacias || []).find((x) => x.id === baciaId);
  if (!bacia) {
    return {
      titulo: 'Sub-bacia hidrográfica',
      corpo: html`<button type="button" class="btn-voltar" data-ir="#/">${icone('voltar')}Brasil</button>
        <div class="vazio-estado">${tr('Sub-bacia não encontrada.')}</div>`,
    };
  }
  const filtrados = indice.lista
    .filter((t) => (t.bacias?.[baciaId] || 0) > 0 && t.recorte && passaFiltroTaxon(t, filtros) && filtroGrupos.has(t.grupo))
    .sort((a, b) => (b.bacias?.[baciaId] || 0) - (a.bacias?.[baciaId] || 0) || b.moleculas - a.moleculas);
  const totalReg = filtrados.reduce((s, t) => s + (t.bacias?.[baciaId] || 0), 0);
  const familias = new Map();
  for (const t of filtrados) if (t.familia) familias.set(t.familia, (familias.get(t.familia) || 0) + 1);
  const topFams = [...familias.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const visiveis = filtrados.slice(0, 30);
  return {
    titulo: bacia.nome,
    corpo: html`
      <button type="button" class="btn-voltar" data-ir="#/">${icone('voltar')}Brasil</button>
      <div class="cab-perfil">
        <p class="eyebrow">${tr('SUB-BACIA HIDROGRÁFICA')}${bacia.rio_principal ? ` · ${bacia.rio_principal}` : ''}</p>
        <h2 id="painel-titulo" tabindex="-1" class="nao-italico" translate="no">${bacia.nome}</h2>
      </div>
      <div class="estatisticas">
        <div class="estat"><b data-contar="${filtrados.length}">${fmtInt(filtrados.length)}</b><span>táxons no recorte com registro na sub-bacia</span></div>
        <div class="estat"><b data-contar="${totalReg}">${fmtInt(totalReg)}</b><span>registros do GBIF desses táxons na sub-bacia</span></div>
        ${bacia.area_km2 ? html`<div class="estat"><b>${fmtInt(Math.round(bacia.area_km2))} km²</b><span>área na Amazônia Legal</span></div>` : ''}
      </div>
      ${topFams.length ? html`<div class="chips" aria-label="${tr('Famílias mais frequentes')}">${topFams.map(([f, n]) => html`<span class="badge ind">${f} (${fmtInt(n)})</span>`)}</div>` : ''}
      <div class="chips" role="group" aria-label="${tr('Grupos biológicos')}">${chipsGrupo(filtroGrupos)}</div>
      <div class="chips" role="group" aria-label="${tr('Filtros de evidência e procedência')}">${chipsFiltro(filtros)}</div>
      ${visiveis.length ? html`<ul class="lista">${visiveis.map((t) => itemEspecie(t, { extra: trn(t.bacias?.[baciaId] || 0, '{n} na sub-bacia', '{n} na sub-bacia') }))}</ul>`
        : html`<div class="vazio-estado">${tr('Nenhum registro para este filtro.')}</div>`}
      <p class="acoes-painel">
        <a class="btn sec" href="#/especies?bacia=${baciaId}">${icone('lista')}Tabela de espécies desta sub-bacia</a>
        <a class="btn sec" href="#/fluxo">${icone('fluxo')}Fluxos e linhagens</a>
      </p>`,
  };
}

// ═══════════════════════════ lacunas de amostragem ═══════════════════════════
const ROT_GRUPO_ME = {
  planta: 'Plantas',
  animal_peconhento: 'Animais com toxinas',
  animal_outro: 'Fauna (demais grupos)',
  fungo: 'Fungos',
  outro: 'Outros',
};

export function renderLacunas({ resumo, materiaEscura }) {
  const { total, zero, poucas, criticas = 0, protegidas = 0, consultas = [], porUF } = resumo;
  const linhas = porUF.slice(0, 9).map((u) => {
    const frac = u.poucas / Math.max(1, u.celulas);
    return html`<tr>
      <th scope="row">${u.nome}</th>
      <td class="num">${fmtInt(u.celulas)}</td>
      <td class="num">${fmtInt(u.poucas)}</td>
      <td class="num"><span class="barra-fracao"><span><span style="width:${(frac * 100).toFixed(0)}%"></span></span>${fmtPct(frac)}</span></td>
    </tr>`;
  });
  const fontes = [...new Set(consultas.map((c) => c.fonte_nome).filter(Boolean))];
  const datas = consultas.map((c) => c.data).filter(Boolean).sort();
  const me = materiaEscura && materiaEscura.total_especies > 0 ? materiaEscura : null;
  const pctSem = me ? me.sem_quimica_aberta / Math.max(1, me.total_especies) : 0;
  return {
    titulo: 'Lacunas de amostragem',
    corpo: html`
      <div class="painel-hero">
        <p class="eyebrow">ESFORÇO DE COLETA · GRADE DE 0,5°</p>
        <h2 id="painel-titulo" tabindex="-1">Lacunas de amostragem</h2>
        <p>Células de 0,5° (cerca de 55 km de lado) sobre a Amazônia Legal. Cada célula cruza a densidade de registros do GBIF com o desmatamento (INPE PRODES) e a cobertura de áreas protegidas (CNUC e FUNAI). Poucos registros indicam pouca coleta, não poucas espécies.</p>
      </div>
      <div class="estatisticas">
        <div class="estat"><b data-contar="${total}">${fmtInt(total)}</b><span>células analisadas</span></div>
        <div class="estat"><b data-contar="${zero}">${fmtInt(zero)}</b><span>sem registro no GBIF</span></div>
        <div class="estat"><b>${fmtPct(poucas / Math.max(1, total))}</b><span>com menos de 0,05 registro/km²</span></div>
        ${criticas > 0 ? html`<div class="estat"><b data-contar="${criticas}">${fmtInt(criticas)}</b><span>com poucos registros e desmatamento alto (G3×P3)</span></div>` : ''}
        ${protegidas > 0 ? html`<div class="estat"><b data-contar="${protegidas}">${fmtInt(protegidas)}</b><span>com 25% ou mais em unidade de conservação ou terra indígena</span></div>` : ''}
      </div>
      <h3 class="sec-titulo">${icone('lacuna')}Estados com maior proporção de células pouco amostradas</h3>
      <div class="tabela-wrap"><table class="tabela"><caption class="so-leitor">Células pouco amostradas por estado</caption>
        <thead><tr><th scope="col">Estado</th><th scope="col">Células</th><th scope="col">Menos de 0,05/km²</th><th scope="col">Proporção</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="fonte-linha">${tr('Cada célula é atribuída ao estado que contém seu ponto central.')}${fontes.length ? ` ${tr('Fontes: {fontes}.', { fontes: fontes.map(trPartes).join('; ') })}` : ''}${datas.length ? ` ${datas[0] === datas[datas.length - 1] ? tr('Consulta de {data}.', { data: fmtData(datas[0]) }) : tr('Consultas de {a} a {b}.', { a: fmtData(datas[0]), b: fmtData(datas[datas.length - 1]) })}` : ''}</p>
      ${me ? html`
        <h3 class="sec-titulo">${icone('molecula')}Espécies aceitas sem química aberta nos catálogos nacionais</h3>
        <p class="fonte-linha">${tr('Comparação entre as espécies aceitas no Bioma Amazônia (Flora e Funga do Brasil e CTFB) e as moléculas relatadas em bases abertas.')}</p>
        <div class="estatisticas">
          <div class="estat"><b data-contar="${me.total_especies}">${fmtInt(me.total_especies)}</b><span>espécies aceitas no Bioma Amazônia</span></div>
          <div class="estat"><b>${fmtPct(pctSem, 1)}</b><span>${tr('{n} espécies sem química aberta', { n: fmtInt(me.sem_quimica_aberta) })}</span></div>
          <div class="estat"><b data-contar="${me.endemicas_br_sem_quimica}">${fmtInt(me.endemicas_br_sem_quimica)}</b><span>endêmicas do Brasil sem química aberta</span></div>
        </div>
        <div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th scope="col">Grupo</th><th scope="col">Aceitas</th><th scope="col">Com química</th><th scope="col">Sem química</th></tr></thead>
          <tbody>${(me.por_grupo || []).map((g) => html`<tr><th scope="row">${tr(ROT_GRUPO_ME[g.grupo] || g.grupo)}</th><td class="num">${fmtInt(g.total)}</td><td class="num">${fmtInt(g.com_quimica)}</td><td class="num">${fmtInt(g.sem_quimica)}</td></tr>`)}</tbody></table></div>
        <h4 class="sec-titulo">${icone('lupa')}Gêneros prioritários sem química aberta</h4>
        <div class="filtros" role="search" aria-label="${tr('Filtros de gêneros prioritários')}">
          <label>Gênero ou família<input type="search" id="me-q" placeholder="${tr('filtrar gênero ou família')}"></label>
          <label>Grupo<select id="me-grupo"><option value="">Todos</option>${(me.por_grupo || []).map((g) => html`<option value="${g.grupo}">${tr(ROT_GRUPO_ME[g.grupo] || g.grupo)}</option>`)}</select></label>
          <label class="check"><input type="checkbox" id="me-end"> Somente com endêmicas do Brasil</label>
          <button type="button" class="btn sec" id="me-csv">${icone('baixar')}Baixar CSV</button>
        </div>
        <div class="tabela-wrap"><table class="tabela compacta" id="me-tabela"></table></div>` : ''}`,
  };
}

export function hidratarLacunas(raiz, materiaEscura) {
  if (!raiz || !materiaEscura?.generos_prioritarios?.length) return;
  const lista = materiaEscura.generos_prioritarios;
  const tb = raiz.querySelector('#me-tabela');
  const inpQ = raiz.querySelector('#me-q');
  const selG = raiz.querySelector('#me-grupo');
  const chkE = raiz.querySelector('#me-end');
  const btnCsv = raiz.querySelector('#me-csv');
  if (!tb) return;

  let visiveis = lista;
  const desenhar = () => {
    if (!raiz.isConnected || !tb.isConnected) return;
    const q = semAcento(inpQ?.value || '').trim();
    const gSel = selG?.value || '';
    const soEnd = !!chkE?.checked;
    visiveis = lista.filter((g) => (!gSel || g.grupo === gSel)
      && (!soEnd || g.endemicas_sem_quimica > 0)
      && (!q || semAcento(`${g.genero} ${g.familia} ${(g.exemplos_endemicos || []).join(' ')}`).includes(q)));
    tb.innerHTML = html`<caption class="so-leitor">${tr('Gêneros prioritários com espécies amazônicas sem química aberta')}</caption>
      <thead><tr><th scope="col">${tr('Gênero')}</th><th scope="col">${tr('Família')}</th><th scope="col">${tr('Sem química / Total')}</th><th scope="col">${tr('Endêmicas s/ química')}</th><th scope="col">${tr('Exemplos')}</th></tr></thead>
      <tbody>${visiveis.slice(0, 40).map((g) => html`<tr>
        <th scope="row" translate="no"><em>${g.genero}</em></th>
        <td>${g.familia}</td>
        <td class="num">${fmtInt(g.sem_quimica)} / ${fmtInt(g.total)}</td>
        <td class="num">${fmtInt(g.endemicas_sem_quimica)}</td>
        <td><small translate="no"><em>${(g.exemplos_endemicos || []).slice(0, 2).join('; ') || '–'}</em></small></td>
      </tr>`)}</tbody>`.toString();
  };
  inpQ?.addEventListener('input', debounce(desenhar, 100));
  selG?.addEventListener('change', desenhar);
  chkE?.addEventListener('change', desenhar);
  btnCsv?.addEventListener('click', () => {
    baixarCSV('biomapabrasil_generos_prioritarios.csv',
      ['genero', 'familia', 'grupo', 'especies_aceitas', 'com_quimica_aberta', 'sem_quimica_aberta', 'endemicas_br_sem_quimica', 'exemplos_endemicos'],
      visiveis.map((g) => [g.genero, g.familia, ROT_GRUPO_ME[g.grupo] || g.grupo, g.total, g.com_quimica, g.sem_quimica, g.endemicas_sem_quimica, (g.exemplos_endemicos || []).join('; ')]));
    anunciar(tr('CSV baixado.'));
  });
  desenhar();
}

// ═══════════════════════════ fontes e método ═══════════════════════════
const ESTADO_CURADORIA = { candidato: 'Candidato', em_revisao: 'Em revisão', verificado: 'Verificado' };

/** Tabela de contagens por código do vocabulário (procedência declarada, distribuição da espécie). */
function tabelaContagens(dic, contagens, colRotulo, colN) {
  const linhas = Object.entries(contagens || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!linhas.length) return '';
  return html`<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th scope="col">${tr(colRotulo)}</th><th scope="col">${tr(colN)}</th></tr></thead>
    <tbody>${linhas.map(([k, n]) => html`<tr><th scope="row">${rotulo(dic, k)}</th><td class="num">${fmtInt(n)}</td></tr>`)}</tbody></table></div>`;
}

export function renderFontes(m) {
  const fontes = (m.fontes || []).filter((f) => f.consultas > 0 || f.id === 'curadoria');
  const c = m.contagens || {};
  const uc = m.universo_checklist;
  const estados = m.estados || {};
  const gov = m.governanca_sisgen || {};
  const exclusao = m.politica_de_exclusao || {};
  const textosGov = [gov.escopo_plataforma, gov.protecao_territorial, gov.marco_legal, exclusao.texto].filter(Boolean);
  const dimensoes = (m.dimensoes_prontidao || []).map((d) => tr(DIMENSOES[d] || d.replace(/_/g, ' ')).toLowerCase());
  return html`<div class="pagina"><header>
    <p class="eyebrow">FONTES E MÉTODO</p>
    <h1>Fontes e método</h1>
    <p class="sub">Fontes, licenças e datas de consulta. Critérios do recorte, níveis de evidência e procedência dos registros.</p></header>

    ${m.principios?.length ? html`<section class="cartao" aria-labelledby="h-princ">
      <h2 id="h-princ">Princípios</h2>
      <ol class="grade-principios">${m.principios.map((p) => html`<li><span class="num-p">${String(p.n).padStart(2, '0')}</span><strong>${trDado(p.titulo)}</strong><p>${trDado(p.texto)}</p></li>`)}</ol>
    </section>` : ''}

    <section class="cartao" aria-labelledby="h-evid">
      <h2 id="h-evid">${icone('check')}Nível de evidência</h2>
      <p>Cada afirmação traz um nível de evidência. Só o nível “Conferido por curador” é verificação em fonte primária.</p>
      <dl class="dados evid-def">${Object.entries(EVIDENCIA).map(([k, e]) => html`<dt><span class="badge ${e.classe}">${icone(e.icone)}${rotulo('evidencia', k)}</span></dt><dd>${tr(e.significado)}${c.afirmacoes_por_evidencia?.[k] != null ? ` ${trn(c.afirmacoes_por_evidencia[k], '{n} afirmação.', '{n} afirmações.')}` : ''}</dd>`)}</dl>
      <p class="fonte-linha">Cada referência indica o que foi lido da obra: texto completo aberto, resumo, título ou nada.</p>
    </section>

    <div class="grade-dupla">
      <section class="cartao" aria-labelledby="h-proc">
        <h2 id="h-proc">${icone('territorio')}Procedência declarada</h2>
        <p>A procedência do material estudado é a que alguém declara: o curador, ao ler o artigo; o texto aberto do artigo; ou a base de origem. O rótulo de cada registro diz quem declara.</p>
        <p>Nenhum campo traz local de coleta mais fino que país e unidade da federação.</p>
        ${tabelaContagens('procedencia', c.procedencia_declarada, 'Procedência declarada', 'Afirmações')}
      </section>

      <section class="cartao" aria-labelledby="h-dist">
        <h2 id="h-dist">${icone('mapa')}Distribuição da espécie</h2>
        <p>A distribuição descreve onde a espécie ocorre, segundo a Flora e Funga do Brasil, o CTFB e as contagens do GBIF no Brasil. Não indica onde o material de um estudo foi coletado.</p>
        ${tabelaContagens('distribuicao_br', c.taxons_por_distribuicao, 'Distribuição no Brasil', 'Táxons')}
      </section>
    </div>

    <div class="grade-dupla">
      <section class="cartao" aria-labelledby="h-bio">
        <h2 id="h-bio">${icone('acao')}Bioatividade</h2>
        <p>Cada registro resume as medidas válidas do ChEMBL para um par molécula–alvo e um tipo de medida: mediana, número de medidas, número de publicações e faixa observada. As medidas são da molécula isolada.</p>
        <p>Só proteína única é tratada como alvo molecular individual. Linhagem celular, organismo, tecido e demais sistemas de ensaio aparecem com o próprio nome.</p>
        <p>As indicações de um fármaco aprovado são as listadas pelo regulador e descrevem o fármaco.</p>
      </section>

      <section class="cartao" aria-labelledby="h-quim">
        <h2 id="h-quim">${icone('molecula')}Identidade química</h2>
        <p>A identidade de uma molécula é o InChIKey. O primeiro bloco do InChIKey identifica a conectividade 2D, comum a estereoisômeros.</p>
        <p>As contagens distinguem estruturas (InChIKey) e conectividades 2D. A massa monoisotópica e a massa molecular média são campos separados.</p>
        ${c.moleculas_inchikey != null && c.conectividades_2d != null ? html`<p class="fonte-linha">${tr('Dados de {data}. Estruturas (InChIKey): {e}. Conectividades 2D: {c}.', { e: fmtInt(c.moleculas_inchikey), c: fmtInt(c.conectividades_2d), data: fmtData(m.gerado_em) })}</p>` : ''}
      </section>
    </div>

    <section class="cartao" aria-labelledby="h-fontes"><h2 id="h-fontes">Fontes e licenças</h2>
      <div class="tabela-wrap"><table class="tabela"><caption class="so-leitor">Fontes de dados</caption>
        <thead><tr><th scope="col">Fonte</th><th scope="col">Licença</th><th scope="col">Consultas</th><th scope="col">Primeira e última consulta</th><th scope="col">Versão</th></tr></thead>
        <tbody>${fontes.map((f) => html`<tr><th scope="row">${f.url ? html`<a href="${f.url}" target="_blank" rel="noopener noreferrer">${trPartes(f.nome)}${icone('externo')}<span class="so-leitor"> (abre em nova aba)</span></a>` : trPartes(f.nome)}${f.descricao ? html`<br><small>${trDado(f.descricao)}</small>` : ''}</th>
          <td>${f.licenca_url ? html`<a href="${f.licenca_url}" target="_blank" rel="noopener noreferrer">${trDado(f.licenca)}</a>` : trDado(f.licenca)}</td>
          <td class="num">${fmtInt(f.consultas)}</td><td>${!f.primeira_consulta ? '–' : f.primeira_consulta === f.ultima_consulta || !f.ultima_consulta ? fmtData(f.primeira_consulta) : `${fmtData(f.primeira_consulta)} – ${fmtData(f.ultima_consulta)}`}</td>
          <td class="mono">${f.versoes?.length ? f.versoes.join(', ') : '–'}</td></tr>`)}</tbody></table></div>
      ${m.licencas_dos_dados ? html`<p class="fonte-linha">${trDado(m.licencas_dos_dados)}</p>` : ''}</section>

    <section class="cartao" aria-labelledby="h-geo"><h2 id="h-geo">${icone('mapa')}Geometria do mapa</h2>
      <dl class="dados">
        <dt>Estados</dt><dd>Malha do IBGE, simplificada para exibição.</dd>
        <dt>Limites territoriais</dt><dd>IBGE, via INPE TerraBrasilis: Amazônia Legal e Bioma Amazônia 1:250.000.</dd>
        <dt>Sub-bacias</dt><dd>ANA e HydroBASINS, recortadas pela Amazônia Legal.</dd>
        <dt>Relevo</dt><dd>Terrain Tiles (Mapzen, AWS Open Data), com dados de SRTM e GMTED2010 (USGS) e ETOPO1 (NOAA).</dd>
        <dt>Rios</dt><dd>Natural Earth, escala 1:10.000.000, domínio público.</dd>
        <dt>Lacunas</dt><dd>Grade de 0,5° com registros do GBIF, desmatamento do PRODES (INPE) e áreas protegidas do CNUC (MMA) e da FUNAI.</dd>
      </dl></section>

    <div class="grade-dupla">
      ${m.recorte?.descricao ? html`<section class="cartao" aria-labelledby="h-rec"><h2 id="h-rec">Recorte amazônico</h2><p>${trDado(m.recorte.descricao)}</p>
        <p class="fonte-linha">Cada táxon traz as contagens e a data da consulta ao GBIF usadas no recorte.</p></section>` : ''}

      <section class="cartao" aria-labelledby="h-est"><h2 id="h-est">Estado de curadoria</h2>
        <dl class="dados">${Object.entries(estados).map(([k, v]) => html`<dt>${tr(ESTADO_CURADORIA[k] || k)}</dt><dd>${trDado(v)}</dd>`)}</dl></section>
    </div>

    <div class="grade-dupla">
      <section class="cartao" aria-labelledby="h-pront"><h2 id="h-pront">${icone('escudo')}Completude do registro</h2>
        <p>${tr('O índice de completude descreve o que o registro traz para reutilização, nas dimensões: {lista}.', { lista: dimensoes.join(', ') })}</p>
        ${m.aviso_prontidao ? html`<p class="fonte-linha">${trDado(m.aviso_prontidao)}</p>` : ''}
        <p class="fonte-linha">Dimensões que não se aplicam ao tipo de registro saem do cálculo.</p></section>

      ${uc ? html`<section class="cartao" aria-labelledby="h-univ"><h2 id="h-univ">${icone('dados')}Espécies do Bioma Amazônia nos catálogos nacionais</h2>
        <p>${tr('A Flora e Funga do Brasil (JBRJ) e o CTFB listam {total} espécies aceitas no Bioma Amazônia. Dessas, {com} ({pct}) têm molécula registrada em base aberta e {sem} não têm.', {
          total: fmtInt(uc.especies_aceitas_bioma_amazonia), com: fmtInt(uc.com_quimica_aberta),
          pct: fmtPct(uc.com_quimica_aberta / Math.max(1, uc.especies_aceitas_bioma_amazonia), 1), sem: fmtInt(uc.sem_quimica_aberta_dark_matter) })}</p></section>` : ''}
    </div>

    ${textosGov.length ? html`<section class="cartao" aria-labelledby="h-sisgen"><h2 id="h-sisgen">${icone('escudo')}Patrimônio genético e conhecimento tradicional</h2>
      ${textosGov.map((t) => html`<p>${trDado(t)}</p>`)}
      ${exclusao.especies?.length ? html`<details class="mais"><summary>Espécies fora da plataforma</summary>
        <ul class="refs lista-pontos">${exclusao.especies.map((e) => html`<li><em translate="no">${e.nome}</em>. ${trDado(e.motivo)}</li>`)}</ul></details>` : ''}</section>` : ''}

    <section class="cartao" aria-labelledby="h-alc"><h2 id="h-alc">Alcance dos dados</h2>
      <ul class="refs lista-pontos">
        <li>LOTUS, NuBBE-DB e NPAtlas registram a ocorrência de um composto em um organismo, com a publicação de origem. O UniProt/Swiss-Prot registra a função anotada de toxinas.</li>
        <li>A ausência de um composto ou de uma medida reflete o conteúdo das fontes na data da consulta.</li>
        <li>Subestruturas PAINS (RDKit) e fármacos com retirada de mercado registrada no ChEMBL são sinalizados. Metabólitos primários e insumos farmacêuticos em fase 4 são distinguidos dos demais fármacos aprovados.</li>
      </ul></section>

    <p class="fonte-linha linha-copiavel">${tr('Dados de {data}, gerados por {versao}. SHA-256 do conjunto:', { data: fmtData(m.gerado_em), versao: m.gerado_por })}
      <span class="mono">${m.integridade?.conjunto}</span>
      <button type="button" class="btn-copiar" data-copiar="${m.integridade?.conjunto}" data-rotulo="SHA-256">${icone('copiar')}Copiar</button>
    </p></div>`.toString();
}

// ═══════════════════════════ dados abertos ═══════════════════════════
export function renderDados(m) {
  const T = 'dados/tabelas/';
  const arquivos = [
    ['Táxons', `${T}taxa.csv`, 'CSV', 'Classificação, contagens de registros, recorte amazônico, distribuição no Brasil e consulta de origem.', true],
    ['Espécies do Bioma Amazônia nos catálogos nacionais', `${T}universo_checklist_amazonia.csv`, 'CSV', 'Espécies aceitas na Flora e Funga do Brasil e no CTFB, com indicação de registro químico em base aberta.', true],
    ['Ocorrências por estado', `${T}ocorrencias_por_uf.csv`, 'CSV', 'Contagens de registros do GBIF por táxon e estado.', true],
    ['Ocorrências por sub-bacia', `${T}ocorrencias_por_bacia.csv`, 'CSV', 'Contagens de registros do GBIF por táxon e sub-bacia amazônica.', true],
    ['Moléculas', `${T}moleculas.csv`, 'CSV', 'InChIKey, conectividade 2D, massas, estereocentros, identificadores externos e descritores RDKit.', true],
    ['Estruturas 3D experimentais', 'api/estruturas3d/experimentais/index.json', 'JSON / SDF', 'Estruturas do wwPDB e do COD, com arquivo SDF.', false],
    ['Linhagens farmacológicas', `${T}linhagens_bioinspiradas.csv`, 'CSV', 'Relações entre molécula natural e fármaco, com a referência.', true],
    ['Afirmações', `${T}afirmacoes.csv`, 'CSV', 'Nível de evidência, procedência declarada, medida agregada, fonte, licença, data de consulta e referências.', true],
    // a tabela de conferências só tem linhas quando há afirmação conferida por curador
    ...(filtroOferecido('curador') ? [['Conferências de curador', `${T}verificacoes.csv`, 'CSV', 'Curador, data, obra lida e trecho conferido de cada afirmação conferida.', true]] : []),
    ['Referências', `${T}referencias.csv`, 'CSV', 'DOI, PMID, periódico, ano e avisos editoriais.', true],
    ['Completude dos registros', `${T}prontidao.csv`, 'CSV', 'As sete dimensões e o índice de completude de cada afirmação.', true],
    ['Fontes', `${T}fontes.csv`, 'CSV', 'Fontes e licenças.', true],
    ['Consultas', `${T}consultas.csv`, 'CSV', 'Cada consulta às fontes, com data, tamanho e SHA-256 da resposta.', true],
    ['Darwin Core Archive', 'dados/dwca/biomapabrasil_dwca.zip', 'DwC-A', 'Núcleo Taxon com nomes populares, compostos relatados, contagens por estado e referências.', true],
    ['Estados', 'dados/geo/ufs.geojson', 'GeoJSON', 'Geometria simplificada dos estados, em WGS 84.', true],
    ['Sub-bacias amazônicas', 'dados/geo/bacias.json', 'JSON', 'Contornos das sub-bacias e do Bioma Amazônia, com contagens.', true],
    ['Manifesto', 'dados/manifesto.json', 'JSON', 'Contagens, fontes, rótulos, versões e SHA-256 dos pacotes.', true],
    ['Somas de verificação', 'dados/SHA256SUMS.txt', 'SHA-256', 'SHA-256 de cada arquivo publicado.', true],
    ['API de consulta', 'api/docs', 'OpenAPI', 'Consulta somente leitura, em JSON.', false],
    ['Código-fonte (GNU AGPL-3.0)', 'codigo-fonte/biomapabrasil-codigo-fonte.tar.gz', 'TAR.GZ', 'Código-fonte correspondente completo desta versão, nos termos da licença GNU AGPL-3.0.', true],
  ];
  const citacao = tr('BioMapaBrasil (Amazonia Works). Dados abertos, versão de {data}. {url}. Acesso em {hoje}.',
    { data: fmtData(m.gerado_em), url: `${location.origin}${location.pathname}`, hoje: fmtData(new Date().toISOString()) });
  const gov = m.governanca_sisgen;
  return html`<div class="pagina"><header>
    <p class="eyebrow">DADOS ABERTOS</p>
    <h1>Dados abertos</h1>
    <p class="sub">Os dados exibidos no site, em arquivos. Cada linha traz fonte e data de consulta. CSV em UTF-8 com BOM.</p></header>
    <div class="tabela-wrap"><table class="tabela"><caption class="so-leitor">Arquivos para baixar</caption><thead><tr><th scope="col">Arquivo</th><th scope="col">Formato</th><th scope="col">Conteúdo</th></tr></thead>
      <tbody>${arquivos.map(([n, u, fmt, d, dl]) => html`<tr><th scope="row"><a href="${u}"${dl ? bruto(' download') : ''}>${n}</a></th><td><span class="badge ind mono">${fmt}</span></td><td>${d}</td></tr>`)}</tbody></table></div>
    <div class="grade-dupla grade-topo">
      <section class="cartao"><h2>Licenças</h2><p>${trDado(m.licencas_dos_dados || '')}</p><p class="fonte-linha">${trDado(m.licenca_do_codigo || '')}</p></section>
      <section class="cartao"><h2>Como citar</h2>
        <p class="mono quebra-livre">${citacao}</p>
        <p><button type="button" class="btn-copiar" data-copiar="${citacao}" data-rotulo="${tr('Citação')}">${icone('copiar')}Copiar citação</button></p>
        <p class="fonte-linha">Ao reutilizar dados de uma fonte, cite também a fonte.</p></section>
    </div>
    ${gov?.escopo_plataforma ? html`<p class="fonte-linha">${trDado(gov.escopo_plataforma)} <a href="#/fontes">Fontes e método</a></p>` : ''}
  </div>`.toString();
}

// ═══════════════════════════ sobre ═══════════════════════════
export function renderSobre() {
  return html`<div class="pagina"><header>
    <p class="eyebrow">SOBRE</p>
    <h1>Sobre o BioMapaBrasil</h1>
    <p class="sub">Base de dados aberta sobre espécies da Amazônia Legal, seus produtos naturais e toxinas, a bioatividade medida e os fármacos aprovados.</p></header>

    <section class="cartao">
      <h2>Do território à ação biológica</h2>
      <p>O mapa liga cada estado às espécies do banco com registro nele. Cada espécie leva às moléculas que a literatura relata no organismo. Cada molécula leva à bioatividade medida em ensaio e, quando existe, ao fármaco aprovado.</p>
      <div class="fluxo-trilha-sobre">
        <div class="fluxo-no"><span>01</span><strong>${icone('territorio')}Território</strong><p>Contagens de registros do GBIF por estado e por sub-bacia. Lacunas de amostragem em grade de 0,5°.</p></div>
        <div class="fluxo-no"><span>02</span><strong>${icone('planta')}Espécie</strong><p>Táxon aceito, sinônimos, distribuição no Brasil e fotografias sob CC0 ou CC BY.</p></div>
        <div class="fluxo-no"><span>03</span><strong>${icone('molecula')}Molécula</strong><p>Estrutura, InChIKey, massas e ocorrência em organismos, com nível de evidência.</p></div>
        <div class="fluxo-no"><span>04</span><strong>${icone('acao')}Ação biológica</strong><p>Medidas agregadas do ChEMBL por par molécula–alvo. Indicações do fármaco aprovado.</p></div>
      </div>
    </section>

    <div class="grade-dupla">
      <section class="cartao"><h2>Limites</h2>
        <ul class="refs lista-pontos">
          <li>Não orienta uso medicinal, tratamento ou dose.</li>
          <li>Não atribui efeito terapêutico a planta, animal ou fungo. Associação documentada não é eficácia.</li>
          <li>Não substitui orientação médica ou farmacêutica.</li>
          <li>Não publica coordenadas de ocorrência nem conhecimento tradicional associado.</li>
        </ul></section>

      <section class="cartao"><h2>Proveniência</h2>
        <p>Cada número aponta para a consulta de origem, com data e SHA-256 da resposta.</p>
        <p><a href="#/fontes">Fontes e método</a></p></section>
    </div>

    <div class="grade-dupla">
      <section class="cartao"><h2>Autoria e licença</h2>
        <p>O BioMapaBrasil é um produto da Amazonia Works. Código sob GNU AGPL-3.0, com licença comercial disponível. Nome e marca reservados.</p>
        <p class="fonte-linha"><a href="codigo-fonte/biomapabrasil-codigo-fonte.tar.gz" download>Código-fonte (GNU AGPL-3.0)</a> · <a href="https://github.com/aleff-ferreira/aleff-ferreira.github.io/releases" target="_blank" rel="noopener noreferrer">Releases públicas${icone('externo')}<span class="so-leitor"> (abre em nova aba)</span></a></p>
        <p class="fonte-linha">Erros e sugestões: <a href="https://github.com/aleff-ferreira/aleff-ferreira.github.io/issues" target="_blank" rel="noopener noreferrer">registro público de edições (Issues)${icone('externo')}<span class="so-leitor"> (abre em nova aba)</span></a></p></section>

      <section class="cartao"><h2>Teclado e acessibilidade</h2>
        <dl class="dados teclas">
          <dt><kbd>/</kbd></dt><dd>Foca a busca.</dd>
          <dt><kbd>Tab</kbd></dt><dd>Percorre os estados do mapa.</dd>
          <dt><kbd>Enter</kbd></dt><dd>Abre o estado em foco.</dd>
          <dt><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Movem o mapa.</dd>
          <dt><kbd>+</kbd> <kbd>-</kbd></dt><dd>Aproximam e afastam.</dd>
          <dt><kbd>0</kbd></dt><dd>Mostra o Brasil inteiro.</dd>
        </dl>
        <p class="fonte-linha">O conteúdo do mapa existe também em tabela ordenável. As animações seguem a preferência de movimento reduzido do sistema e podem ser pausadas no topo da página.</p>
        <p><a href="#/especies">Tabela de espécies</a></p></section>
    </div></div>`.toString();
}
