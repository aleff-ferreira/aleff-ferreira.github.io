// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Perfis: visão geral, estado, espécie e molécula. Cada função devolve HTML seguro (valores escapados).
// Cada afirmação aparece com o nível de evidência; cada procedência, com quem a declara; a distribuição
// da espécie fica separada da procedência do material estudado.
import {
  html, bruto, icone, tr, trn, trDado, trPartes, trTermos, fmtInt, fmtDec, fmtPct, fmtData, GRUPOS, GRUPO_POR_CHAVE, PREDOMINIO,
  TIPO_MOL_POR_NOME, DIMENSOES, ESTADO_DIM, EVIDENCIA, COLETA_AMAZONICA_DECLARADA, rotulo, ehEndemica, semPredominio,
  siglaAmeaca, ehAmeacada, tituloObra, urlDoi, urlPmid, ehInchiKey, nomeMolecula,
} from './util.js';
import { svgRadarProntidao } from './constelacao.js';
import { versaoMidia, svgEstrutura, svgDataUri } from './dados.js';

const PIXEL_VAZIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const LIM_MOL_INICIAL = 36;
export const ROTULO_ESTRATO = {
  emergente: 'Emergente',
  dossel: 'Dossel',
  sub_bosque: 'Sub-bosque',
  liana_epifita: 'Liana ou epífita',
  solo_serrapilheira: 'Solo e serrapilheira',
  aquatico_ripario: 'Igapó, várzea ou ambiente aquático',
};
/** Filtros de afirmação: valem nas listas de táxons (pelo índice) e nas listas de moléculas (por afirmação). */
export const FILTROS = {
  coleta: { rotulo: 'Coleta amazônica declarada', dica: 'Registros em que o curador, ao ler o artigo, ou a base de origem declaram coleta na Amazônia.' },
  curador: { rotulo: 'Conferido por curador', dica: 'Registros cuja passagem um curador leu e confirmou na publicação.' },
};

// ═══════════════════════════ peças reutilizáveis ═══════════════════════════
export function link(url, texto, externo = true) {
  return html`<a href="${url}"${externo ? bruto(' target="_blank" rel="noopener noreferrer"') : ''}>${texto}${externo ? icone('externo') : ''}${externo ? html`<span class="so-leitor"> ${tr('(abre em nova aba)')}</span>` : ''}</a>`;
}

export function fonteLinha(pack, idx) {
  const c = idx == null ? null : pack.consultas[idx];
  if (!c) return '';
  return html`<p class="fonte-linha">${tr('Fonte')}: ${trPartes(c.fonte_nome)} · ${tr('consulta de {data}', { data: fmtData(c.data) })}${c.versao ? ` · ${tr('versão {v}', { v: c.versao })}` : ''} · ${tr('licença {l}', { l: trDado(c.licenca) })} · ${link(c.url, tr('abrir a consulta'))}</p>`;
}

// O filtro de curador só é oferecido quando o banco tem afirmação conferida por curador: sem nenhuma, ele
// só poderia devolver uma lista vazia.
let _semConferidas = false;
export function definirFiltrosOferecidos(contagens) {
  const conferidas = contagens?.afirmacoes_verificadas ?? contagens?.afirmacoes_por_evidencia?.curador;
  _semConferidas = conferidas === 0;
}
export const filtroOferecido = (k) => k in FILTROS && !(k === 'curador' && _semConferidas);

export function chipsFiltro(filtros) {
  return Object.entries(FILTROS).filter(([k]) => filtroOferecido(k)).map(([k, f]) =>
    html`<button type="button" class="chip" data-filtro="${k}" aria-pressed="${!!filtros[k]}" title="${tr(f.dica)}">${icone(k === 'curador' ? 'check' : 'territorio')}${tr(f.rotulo)}</button>`);
}
export const passaFiltroTaxon = (t, f) => (!f.coleta || !!t.coleta_amazonica_declarada) && (!f.curador || t.verificadas > 0);
const passaFiltroAfirmacao = (af, f) => (!f.coleta || COLETA_AMAZONICA_DECLARADA.has(af?.procedencia)) && (!f.curador || af?.evidencia === 'curador');

/** Nível de evidência da afirmação: um selo por registro. */
export function badgeEvidencia(codigo) {
  if (!codigo) return '';
  const e = EVIDENCIA[codigo];
  return html`<span class="badge ${e?.classe || 'ind'}" title="${e ? tr(e.significado) : ''}">${icone(e?.icone || 'dados')}${rotulo('evidencia', codigo)}</span>`;
}

/** Procedência declarada: o rótulo diz quem declara; país e UF saem em código (BR-AM), como o local declarado no artigo. */
function textoProcedencia(af) {
  if (!af?.procedencia) return '';
  const local = af.uf_coleta ? `${af.pais_coleta || 'BR'}-${af.uf_coleta}` : (af.pais_coleta || '');
  return rotulo('procedencia', af.procedencia) + (local ? ` (${local})` : '');
}
function textoProcedenciaArtigo(af) {
  const pa = af?.procedencia_artigo;
  return pa ? rotulo('procedencia_artigo', pa.classe) + (pa.local ? ` (${pa.local})` : '') : '';
}
/** Nas listas, só a procedência que alguém declarou; a ausência de declaração fica no detalhe do registro. */
export function procedenciaNaLista(af) {
  const base = af?.procedencia && af.procedencia !== 'nao_declarada' ? textoProcedencia(af) : '';
  const artigo = textoProcedenciaArtigo(af);
  return html`${base ? html`<span class="proc">${base}</span>` : ''}${artigo ? html`<span class="proc">${artigo}</span>` : ''}`;
}
export function procedenciaNoDetalhe(af, pack) {
  const base = textoProcedencia(af), artigo = textoProcedenciaArtigo(af);
  const testemunho = [
    af.voucher_base && tr('Material testemunho declarado pela base de origem: {v}.', { v: af.voucher_base }),
    af.verificacao?.voucher && tr('Material testemunho registrado pelo curador ao ler o artigo: {v}.', { v: af.verificacao.voucher }),
  ].filter(Boolean).join(' ');
  if (!base && !artigo && !testemunho) return '';
  const ref = af.procedencia_artigo?.ref != null ? pack.refs[af.procedencia_artigo.ref] : null;
  return html`<p class="fonte-linha">${base ? `${base}.` : ''}${artigo ? html` ${artigo}${ref ? html`: ${linkObra(ref)}` : ''}.` : ''}${testemunho ? ` ${testemunho}` : ''}</p>`;
}

const TIPO_OBRA = {
  'book-chapter': 'capítulo de livro', book: 'livro', monograph: 'monografia', dataset: 'conjunto de dados',
  component: 'material suplementar', 'posted-content': 'preprint', 'proceedings-article': 'trabalho em anais',
  dissertation: 'tese ou dissertação', report: 'relatório',
};
const AVISO_OBRA = {
  errata_ou_corrigenda: 'Errata ou corrigenda publicada.',
  nota_de_correcao: 'Nota de correção publicada.',
  expressao_de_preocupacao: 'Expressão de preocupação publicada.',
};
const TEXTO_LIDO = {
  texto_completo_aberto: 'Texto lido: texto completo aberto.', resumo: 'Texto lido: resumo.', titulo: 'Texto lido: título.',
  nenhum: 'Texto da obra não lido.',
};

/** Citação curta com ligação para a obra (DOI ou PubMed). */
function linkObra(r) {
  const url = urlDoi(r.doi) || urlPmid(r.pmid);
  const autor = r.autores?.length ? r.autores[0] + (r.autores.length > 1 ? ' et al.' : '') : '';
  const base = autor || (r.doi ? `doi:${r.doi}` : r.pmid ? `PMID ${r.pmid}` : tr('obra citada'));
  const texto = r.ano ? `${base} (${r.ano})` : base;
  return url ? link(url, texto) : texto;
}

export function refItem(r) {
  const aut = r.autores?.length ? r.autores.join('; ') : null;
  const ids = [r.doi ? link(urlDoi(r.doi), `doi:${r.doi}`) : null, r.pmid ? link(urlPmid(r.pmid), `PMID ${r.pmid}`) : null].filter(Boolean);
  const tipo = TIPO_OBRA[r.tipo_obra] ? tr(TIPO_OBRA[r.tipo_obra]) : '';
  const titulo = r.titulo ? tituloObra(r.titulo) : null;
  return html`<li>${aut ? `${aut} ` : ''}${r.ano ? `(${r.ano}). ` : ''}${titulo ? html`${titulo}${/[.?!](<\/\w+>)?$/.test(titulo.toString()) ? '' : '.'}` : ''}${r.revista ? ` ${r.revista}.` : ''}${tipo ? ` [${tipo}]` : ''}
    ${ids.length ? bruto(' ' + ids.map((x) => x.toString()).join(' · ')) : ''}${AVISO_OBRA[r.aviso] ? ` ${tr(AVISO_OBRA[r.aviso])}` : ''}${TEXTO_LIDO[r.texto_nivel] ? ` ${tr(TEXTO_LIDO[r.texto_nivel])}` : ''}</li>`;
}
export function listaRefs(pack, idxs) {
  if (!idxs?.length) return html`<p class="fonte-linha">${tr('A fonte não indica publicação para este registro.')}</p>`;
  return html`<ol class="refs">${idxs.map((i) => refItem(pack.refs[i]))}</ol>`;
}

const ORIGEM_PASSAGEM = {
  resumo: 'Trecho localizado no resumo',
  texto_completo_aberto: 'Trecho localizado no texto aberto',
  anotacao_uniprot: 'Anotação curada do UniProt/Swiss-Prot, no idioma original',
  mecanismo_chembl: 'Mecanismo de ação registrado no ChEMBL',
  curador: 'Passagem conferida por curador',
};
/** Passagem da afirmação. Quando a frase foi localizada mas não é redistribuída, fica a origem e a ligação para a obra. */
export function blocoPassagem(af, pack, complemento = '') {
  if (!af?.passagem && !af?.passagem_origem) return '';
  const origem = tr(ORIGEM_PASSAGEM[af.passagem_origem] || 'Passagem registrada pela fonte');
  const ref = af.passagem_ref != null ? pack.refs[af.passagem_ref] : null;
  const v = af.verificacao;
  const curadoria = v?.curador && v?.em ? ` ${tr('Conferência de {curador} em {data}.', { curador: v.curador, data: fmtData(v.em) })}` : '';
  const citacao = html`${origem}${ref ? html`: ${linkObra(ref)}` : ''}.${complemento ? ` ${complemento}` : ''}${curadoria}`;
  if (!af.passagem) return html`<p class="fonte-linha">${citacao}</p>`;
  return html`<blockquote class="passagem">“${af.passagem.replace(/\s*\(PubMed:[^)]*\)/g, '')}”<cite>${citacao}</cite></blockquote>`;
}

export function matrizProntidao(af) {
  if (!af.prontidao) return '';
  const linhas = Object.entries(DIMENSOES).map(([k, rot]) => {
    const e = ESTADO_DIM[af.prontidao[k]] || ESTADO_DIM.nao_avaliado;
    return html`<tr><th scope="row">${tr(rot)}</th><td class="est"><span aria-hidden="true">${e.sim}</span> ${tr(e.rotulo)}</td></tr>`;
  });
  return html`<details class="mais"><summary>${icone('escudo')}${tr('Completude do registro: {v} de 1', { v: af.indice == null ? '–' : fmtDec(af.indice) })}</summary>
    <div class="prontidao-bloco">
      ${svgRadarProntidao(af.prontidao)}
      <table class="matriz"><caption class="so-leitor">${tr('Completude do registro em sete dimensões')}</caption><tbody>${linhas}</tbody></table>
    </div></details>`;
}

export function itemEspecie(t, { extra = '', uf = null } = {}) {
  const g = GRUPOS[t.grupo] || GRUPOS.O;
  const pred = PREDOMINIO[t.predominio];
  const regs = uf ? t.uf?.[uf] : t.n_al;
  const temPar = Array.isArray(t.foco) && t.foco.length === 2;
  const attrFoco = temPar ? bruto(` style="--fx:${t.foco[0]}%;--fy:${t.foco[1]}%"`) : (t.foco === 0 ? '' : bruto(' data-auto-foco="1"'));
  const vm = versaoMidia();
  const miniatura = t.imagens > 0
    ? html`<img class="mini" src="dados/imagens/${t.gbif}/1.jpg${vm ? `?v=${vm}` : ''}"${attrFoco} loading="lazy" decoding="async" alt="" width="50" height="50">`
    : html`<span class="mini">${icone(g.icone)}</span>`;
  return html`<li><a class="item" href="#/especie/${t.gbif}">
    ${miniatura}
    <span><span class="t" translate="no"><em>${t.nome}</em></span>
      <span class="s">${t.populares?.[0] ? html`<span translate="no">${t.populares[0]}</span>` : ''}<span>${tr(g.rotulo)}</span>
      ${t.recorte ? (pred ? html`<span class="badge ${pred.classe}" title="${tr(pred.rotulo)}">${tr(pred.curto)}</span>` : '') : html`<span class="badge fora">${tr('Fora do recorte')}</span>`}
      ${extra}</span></span>
    <span class="d">${regs != null ? trn(regs, '{n} registro', '{n} registros') : ''}<br>${trn(t.moleculas, '{n} molécula', '{n} moléculas')}</span></a></li>`;
}

function barrasUF(uf, ufsAL) {
  const entradas = Object.entries(uf).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) return html`<p class="fonte-linha">${tr('Nenhum registro do GBIF com estado atribuído.')}</p>`;
  const max = entradas[0][1];
  return html`<ul class="barras" aria-label="${tr('Registros do GBIF por estado')}">${entradas.map(([s, n]) =>
    html`<li class="${ufsAL.has(s) ? 'al' : ''}"><span>${s}</span><span class="trilho"><span class="preenche" style="width:${Math.max(2, (n / max) * 100).toFixed(1)}%"></span></span><span class="n">${fmtInt(n)}</span></li>`)}</ul>
    <p class="fonte-linha">${tr('Barras em destaque: estados da Amazônia Legal. Contagens agregadas por estado.')}</p>`;
}

export const chipsGrupo = (filtroGrupos) => ['P', 'A', 'F'].map((k) =>
  html`<button type="button" class="chip" data-grupo="${k}" aria-pressed="${filtroGrupos.has(k)}">${icone(GRUPOS[k].icone)}${tr(GRUPOS[k].plural)}</button>`);

// ═══════════════════════════ visão geral ═══════════════════════════
export function renderVisaoGeral({ manifesto, indice, filtroGrupos, metrica, filtros = {} }) {
  const c = manifesto.contagens;
  const uc = manifesto.universo_checklist;
  const porEvidencia = c.afirmacoes_por_evidencia;
  const totalAfirmacoes = c.afirmacoes_publicas ?? Object.values(c.afirmacoes_por_tipo || {}).reduce((a, b) => a + b, 0);
  const lista = indice.lista.filter((t) => t.recorte && passaFiltroTaxon(t, filtros));
  const destaque = [...lista].filter((t) => t.moleculas > 0 && (t.predominio === 'p' || t.predominio === 'i'))
    .sort((a, b) => (b.imagens > 0) - (a.imagens > 0) || b.moleculas - a.moleculas).slice(0, 6);
  const farmaco = (manifesto.destaques_farmaco || []).map((g) => indice.porGbif.get(g))
    .filter((t) => t && filtroGrupos.has(t.grupo) && passaFiltroTaxon(t, filtros));
  const estruturas = c.moleculas_inchikey ?? c.moleculas;
  return {
    titulo: 'Da floresta à molécula',
    corpo: html`
      <div class="painel-hero">
        <p class="eyebrow">PRODUTOS NATURAIS · AMAZÔNIA LEGAL</p>
        <h2 id="painel-titulo" tabindex="-1">Da floresta à <em>molécula</em></h2>
        <p>Espécies com registro na Amazônia Legal, os constituintes relatados em cada uma e a bioatividade medida dessas moléculas. Cada registro traz fonte, licença e data de consulta.</p>
      </div>
      <div class="estatisticas">
        <div class="estat"><b data-contar="${c.taxons_no_recorte}">${fmtInt(c.taxons_no_recorte)}</b><span>táxons no recorte amazônico</span></div>
        <div class="estat"><b data-contar="${estruturas}">${fmtInt(estruturas)}</b><span>${c.moleculas_inchikey != null ? 'estruturas (InChIKey)' : 'moléculas'}</span></div>
        ${c.conectividades_2d != null ? html`<div class="estat"><b data-contar="${c.conectividades_2d}">${fmtInt(c.conectividades_2d)}</b><span>conectividades 2D</span></div>` : ''}
        <div class="estat"><b data-contar="${totalAfirmacoes}">${fmtInt(totalAfirmacoes)}</b><span>afirmações públicas</span></div>
      </div>
      ${porEvidencia ? html`<ul class="evid-lista" aria-label="${tr('Afirmações por nível de evidência')}">${Object.keys(EVIDENCIA).filter((k) => porEvidencia[k] > 0).map((k) =>
        html`<li>${badgeEvidencia(k)}<b>${fmtInt(porEvidencia[k])}</b></li>`)}</ul>` : ''}
      <p class="fonte-linha">${tr('Contagens dos dados de {data}.', { data: fmtData(manifesto.gerado_em) })}${uc ? ` ${tr('Flora e Funga do Brasil e CTFB listam {total} espécies aceitas no Bioma Amazônia; {com} ({pct}) têm molécula registrada em base aberta.', {
        total: fmtInt(uc.especies_aceitas_bioma_amazonia), com: fmtInt(uc.com_quimica_aberta),
        pct: fmtPct(uc.com_quimica_aberta / Math.max(1, uc.especies_aceitas_bioma_amazonia), 1) })}` : ''}</p>

      <section class="cartao constelacao-cartao" aria-labelledby="h-const">
        <div class="constelacao-topo">
          <h3 id="h-const">${icone('rede')}Estados e espécies com mais moléculas</h3>
          <div class="constelacao-legenda" aria-hidden="true">
            <span><i style="background:var(--rio)"></i>Estados</span>
            <span><i style="background:var(--verde)"></i>Plantas</span>
            <span><i style="background:var(--ouro)"></i>Animais com toxinas</span>
            <span><i style="background:var(--violeta)"></i>Fungos</span>
          </div>
        </div>
        <div id="constelacao-palco" class="constelacao-palco"></div>
        <p id="constelacao-status" class="constelacao-status" aria-live="off"></p>
      </section>

      <h3 class="sec-titulo">${icone('galaxia')}Visualizações</h3>
      <div class="vitrine-obs">
        <a href="#/galaxia"><strong>${icone('galaxia')}Espaço químico</strong><small>Pequenas moléculas dispostas por similaridade estrutural (ECFP4).</small></a>
        <a href="#/fluxo"><strong>${icone('fluxo')}Fluxos e linhagens</strong><small>Sub-bacias, famílias, classes químicas e alvos. Linhagens farmacológicas com a frase citada.</small></a>
        <a href="#/floresta"><strong>${icone('floresta')}Estratos florestais</strong><small>Espécies e classes químicas por estrato vertical da floresta.</small></a>
        <a href="#/filoquimica"><strong>${icone('arvore')}Quimiotaxonomia</strong><small>Árvore taxonômica com classe química, bioatividade e estado de conservação.</small></a>
      </div>

      <h3 class="sec-titulo">${icone('mapa')}Medida do mapa</h3>
      <div class="chips" role="group" aria-label="${tr('Medida do mapa')}">${[['amazonicas', 'Táxons, exceto os de registros dispersos'], ['todas', 'Todos os táxons do recorte'], ['registros', 'Registros do GBIF']].map(([k, rot]) =>
        html`<button type="button" class="chip" data-metrica="${k}" aria-pressed="${metrica === k}">${tr(rot)}</button>`)}</div>
      <div class="chips" role="group" aria-label="${tr('Grupos biológicos')}">${chipsGrupo(filtroGrupos)}</div>
      <div class="chips" role="group" aria-label="${tr('Filtros de evidência e procedência')}">${chipsFiltro(filtros)}</div>

      <h3 class="sec-titulo">${icone('planta')}Espécies com fotografia e mais moléculas registradas</h3>
      ${destaque.length ? html`<ul class="lista">${destaque.map((t) => itemEspecie(t))}</ul>` : html`<div class="vazio-estado">${tr('Nenhum registro para este filtro.')}</div>`}

      ${farmaco.length ? html`<h3 class="sec-titulo">${icone('farmaco')}Espécies com molécula relatada que é fármaco aprovado</h3>
        <p class="fonte-linha">Seleção editorial. A aprovação refere-se ao fármaco, não ao organismo nem a extratos ou preparações.</p>
        <ul class="lista">${farmaco.map((t) => itemEspecie(t))}</ul>` : ''}
      <p class="acoes-painel">
        <a class="btn sec" href="#/especies">${icone('lista')}Tabela de espécies</a>
        <a class="btn sec" href="#/moleculas">${icone('molecula')}Tabela de moléculas</a>
      </p>`,
  };
}

// ═══════════════════════════ estado ═══════════════════════════
export function renderUF({ uf, indice, filtroGrupos, ufsAL, completo, filtros = {} }) {
  const todos = indice.lista.filter((t) => t.recorte && t.uf?.[uf.s] > 0 && passaFiltroTaxon(t, filtros));
  const filtrados = todos.filter((t) => filtroGrupos.has(t.grupo)).sort((a, b) => b.uf[uf.s] - a.uf[uf.s]);
  const total = filtrados.reduce((s, t) => s + t.uf[uf.s], 0);
  const visiveis = completo ? filtrados : filtrados.slice(0, 40);
  const al = uf.al === 2 ? 'Todo o estado integra a Amazônia Legal.' : uf.al === 1 ? 'Parte do estado integra a Amazônia Legal. As contagens usam o estado inteiro.' : 'Estado fora da Amazônia Legal.';
  return {
    titulo: uf.n,
    corpo: html`
      <button type="button" class="btn-voltar" data-ir="#/">${icone('voltar')}Brasil</button>
      <div class="cab-perfil">
        <p class="eyebrow">${tr('ESTADO')} · ${trDado(uf.rn)}</p>
        <h2 id="painel-titulo" tabindex="-1" class="nao-italico" translate="no">${uf.n} <small class="autoria">(${uf.s})</small></h2>
        <p class="populares">${al}</p>
      </div>
      <div class="estatisticas">
        <div class="estat"><b data-contar="${filtrados.length}">${fmtInt(filtrados.length)}</b><span>táxons do banco com registro no estado</span></div>
        <div class="estat"><b data-contar="${total}">${fmtInt(total)}</b><span>registros do GBIF desses táxons</span></div>
      </div>
      <div class="chips" role="group" aria-label="${tr('Grupos biológicos')}">${chipsGrupo(filtroGrupos)}</div>
      <div class="chips" role="group" aria-label="${tr('Filtros de evidência e procedência')}">${chipsFiltro(filtros)}</div>
      ${filtrados.length ? html`<ul class="lista">${visiveis.map((t) => itemEspecie(t, { uf: uf.s }))}</ul>
        ${filtrados.length > visiveis.length ? html`<p class="acoes-painel"><button type="button" class="btn sec" data-a="ver-todas">${tr('Mostrar os {n} táxons', { n: fmtInt(filtrados.length) })}</button></p>` : ''}`
        : html`<div class="vazio-estado">${tr('Nenhum registro para este filtro.')}</div>`}
      <p class="fonte-linha">Fonte: GBIF, contagens por estado (campo gadmLevel1Gid), na data de consulta de cada táxon. Registros sem estado atribuído não entram.
      <a href="#/especies?uf=${uf.s}">Tabela dos táxons do estado</a></p>`,
  };
}

// ═══════════════════════════ espécie ═══════════════════════════
export function badgeFarmaco({ retirado, insumo }) {
  if (retirado) return html`<span class="badge alerta" title="${tr('O ChEMBL registra retirada do mercado em ao menos uma jurisdição.')}">${icone('farmaco')}${tr('Fármaco aprovado, com retirada registrada')}</span>`;
  if (insumo) return html`<span class="badge ind" title="${tr('Metabólito primário ou insumo farmacêutico com fase 4 no ChEMBL.')}">${icone('farmaco')}${tr('Metabólito primário ou insumo (fase 4)')}</span>`;
  return html`<span class="badge alerta">${icone('farmaco')}${tr('Fármaco aprovado')}</span>`;
}
export const badgePains = () => html`<span class="badge ind" title="${tr('Subestrutura PAINS (RDKit): pode interferir em ensaios bioquímicos in vitro.')}">PAINS</span>`;

/** Bases que registram o par táxon–molécula. O pacote só as lista quando são mais de uma ou quando a única não é LOTUS nem UniProt. */
export const BASE_DE_ORIGEM = { lotus: 'LOTUS', nubbe: 'NuBBE-DB', npatlas: 'NPAtlas', uniprot: 'UniProt/Swiss-Prot' };

function blocoMolecula(m, taxon) {
  const af = m.afirmacao;
  const tipo = tr(TIPO_MOL_POR_NOME[m.tipo] || '');
  const miniatura = m.estrutura
    ? html`<span class="mini estr"><img src="${PIXEL_VAZIO}" data-svg-img="${m.estrutura}" loading="lazy" decoding="async" alt="" width="76" height="56"></span>`
    : html`<span class="mini">${icone('molecula')}</span>`;
  const extras = [];
  if (m.aprovado) extras.push(badgeFarmaco({ retirado: m.retirado, insumo: m.categoria_clinica === 'metabolito_ou_insumo' }));
  if (m.n_atividades) extras.push(html`<span class="badge ind">${icone('acao')}${trn(m.n_atividades, '{n} registro de bioatividade', '{n} registros de bioatividade')}</span>`);
  if (m.pains) extras.push(badgePains());
  if (m.tipo === 'peptideo' || m.tipo === 'proteina') extras.push(html`<span class="badge ind">${tipo}${m.comprimento_aa ? ` · ${m.comprimento_aa} aa` : ''}</span>`);
  const sub = [ehInchiKey(m.nome) ? m.nome.slice(0, 14) : '',
    ...(m.tipo === 'pequena_molecula' ? [m.classe, m.formula] : [m.familia])].filter(Boolean).join(' · ');
  const nomeEx = nomeMolecula(m.nome, m.id);
  const trecho = af.passagem ? af.passagem.replace(/\s*\(PubMed:[^)]*\)/g, '').slice(0, 170) + (af.passagem.length > 170 ? '…' : '') : '';
  const bases = (m.fontes || []).map((f) => BASE_DE_ORIGEM[f] || f);
  const quemDeclara = html`${bases.length ? html`<span class="proc">${trn(bases.length, 'Base de origem: {lista}', 'Bases de origem: {lista}', { lista: bases.join(', ') })}</span>` : ''}${procedenciaNaLista(af)}`.toString();
  const direita = m.tipo === 'pequena_molecula'
    ? trn(m.n_publicacoes, '{n} publicação', '{n} publicações')
    : af.experimental == null ? '' : tr(af.experimental ? 'evidência experimental' : 'sem evidência experimental direta');
  return html`<li><a class="item mol" href="#/especie/${taxon.gbif}/molecula/${m.id}">
    ${miniatura}
    <span><span class="t"${ehInchiKey(m.nome) ? '' : bruto(' translate="no"')}>${nomeEx}</span>
      <span class="s">${sub ? html`<span>${sub}</span>` : ''}${badgeEvidencia(af.evidencia)}${extras}</span>
      ${quemDeclara ? html`<span class="s">${bruto(quemDeclara)}</span>` : ''}
      ${trecho ? html`<span class="s">${trecho}</span>` : ''}</span>
    <span class="d">${direita}</span></a></li>`;
}

const NIVEL_DO_SINONIMO = { SUBSPECIES: 'subespécie', VARIETY: 'variedade', FORM: 'forma' };
/** Sinônimo como texto simples ou como objeto {nome, autoria, categoria}; a categoria é o nível taxonômico do nome. */
function itemSinonimo(s) {
  if (typeof s === 'string') return html`<li><em>${s}</em></li>`;
  const nivel = NIVEL_DO_SINONIMO[s.categoria];
  return html`<li><em>${s.nome}</em>${s.autoria ? ` ${s.autoria}` : ''}${nivel ? ` (${tr(nivel)})` : ''}</li>`;
}

function blocoCobertura(pack) {
  const cob = pack.cobertura || {};
  const linhas = [];
  if (cob.compostos != null) linhas.push(html`<dt>${tr('Moléculas com afirmação pública')}</dt><dd>${fmtInt(cob.compostos)}</dd>`);
  for (const [chave, nome] of [['compostos_lotus', 'LOTUS'], ['compostos_nubbe', 'NuBBE-DB'], ['compostos_npatlas', 'NPAtlas']]) {
    if (cob[chave] != null) linhas.push(html`<dt>${nome}</dt><dd>${trn(cob[chave], '{n} composto', '{n} compostos')}</dd>`);
  }
  if (cob.toxinas_fonte != null) linhas.push(html`<dt>UniProt/Swiss-Prot (Tox-Prot)</dt><dd>${trn(cob.toxinas_fonte, '{n} toxina revisada', '{n} toxinas revisadas')}</dd>`);
  if (!linhas.length) return '';
  return html`<section class="cartao cartao-topo" aria-labelledby="h-cob">
      <h3 id="h-cob">${icone('dados')}Registros por base</h3>
      <dl class="dados">${linhas}</dl>
      ${[cob.consulta_lotus, cob.consulta_nubbe, cob.consulta_npatlas, cob.consulta_uniprot].map((idx) => fonteLinha(pack, idx))}
    </section>`;
}

export function renderTaxon({ pack, indiceItem, ufsAL, mostrarMais, filtroMol, filtros = {} }) {
  const g = GRUPO_POR_CHAVE[pack.grupo] || GRUPOS.O;
  const r = pack.recorte;
  const pred = indiceItem ? PREDOMINIO[indiceItem.predominio] : null;
  const populares = pack.populares?.length ? pack.populares.slice(0, 5).map((p) => p.nome).join(' · ') : null;
  const nFotos = pack.imagens?.length || 0;
  const imagens = nFotos
    ? html`<div class="galeria-bloco" data-galeria>
        <div class="galeria" role="group" aria-label="${tr('Fotografias de {nome}', { nome: pack.nome })}">
          ${pack.imagens.map((i, idx) => {
            const fx = i.foco?.[0], fy = i.foco?.[1], temFoco = fx != null && fy != null;
            const iw = i.largura || 640, ih = i.altura || 480;
            const estPalco = `--iw:${iw}px${temFoco ? `;--fx:${fx}%;--fy:${fy}%` : ''}`;
            const carregamento = idx === 0 ? 'eager' : 'lazy';
            const srcFoto = `dados/${i.arquivo}${i.v ? `?v=${i.v}` : ''}`;
            return html`<figure class="foto" data-slide="${idx}">
              <div class="foto-palco" style="${estPalco}" data-abrir-foto="${idx}" role="button" tabindex="0" aria-label="${tr('Ampliar fotografia {i} de {n} de {nome}', { i: idx + 1, n: nFotos, nome: pack.nome })}">
                <img class="foto-fundo" src="${srcFoto}" alt="" aria-hidden="true" loading="${carregamento}" decoding="async">
                <img class="foto-especime" src="${srcFoto}" width="${iw}" height="${ih}"${temFoco ? '' : bruto(' data-auto-foco="1"')} loading="${carregamento}" decoding="async" alt="${tr('Fotografia de {nome}, por {autor}', { nome: pack.nome, autor: i.autor })}">
                <span class="foto-ampliar" aria-hidden="true">${icone('lupa')}</span>
              </div>
              <figcaption>${icone('camera')}<span>${tr('Foto')}: ${i.autor} · ${i.licenca}${i.instituicao ? ` · ${i.instituicao}` : ''}${i.pais && i.pais !== 'BR' ? ` · ${tr('registro em {pais}', { pais: i.pais })}` : ''} · ${link(i.pagina, tr('registro no GBIF'))}</span></figcaption></figure>`;
          })}
        </div>
        ${nFotos > 1 ? html`<div class="galeria-barra" aria-label="${tr('Navegação das fotografias')}">
          <button type="button" class="gal-btn" data-gal-dir="-1" aria-label="${tr('Fotografia anterior')}">${icone('voltar')}</button>
          <div class="gal-pontos">${pack.imagens.map((_, idx) =>
            html`<button type="button" class="gal-ponto" data-gal-ir="${idx}" aria-current="${idx === 0 ? 'true' : 'false'}" aria-label="${tr('Fotografia {i} de {n}', { i: idx + 1, n: nFotos })}"></button>`)}</div>
          <span class="gal-conta" data-gal-conta aria-live="polite">1 / ${nFotos}</span>
          <button type="button" class="gal-btn" data-gal-dir="1" aria-label="${tr('Próxima fotografia')}">${icone('seta')}</button>
        </div>` : ''}
      </div>`
    : html`<div class="foto-vazia">${icone('camera')}<span>Sem fotografia sob CC0 ou CC BY com autor identificado.</span></div>`;

  const molsTodas = pack.moleculas;
  const filtro = (filtroMol || '').trim().toLowerCase();
  const filtrando = !!filtro || filtros.coleta || filtros.curador;
  const molsFilt = molsTodas.filter((m) => passaFiltroAfirmacao(m.afirmacao, filtros)
    && (!filtro || (m.nome + ' ' + (m.classe || '') + ' ' + (m.familia || '')).toLowerCase().includes(filtro)));
  const molsVis = mostrarMais ? molsFilt : molsFilt.slice(0, LIM_MOL_INICIAL);
  const animal = pack.grupo === 'animal_peconhento';
  const temPeqMol = molsTodas.some((m) => m.tipo === 'pequena_molecula');
  const temToxina = molsTodas.some((m) => m.afirmacao?.tipo === 'funcao_toxina');

  const eco = pack.ecologia || {};
  const bacias = pack.bacias || [];
  const maxBacia = bacias.length ? Math.max(1, ...bacias.map((b) => b.n)) : 1;
  const totalMolsPack = pack.total_moleculas || molsTodas.length;
  const sinonimos = pack.sinonimos || [];
  const perfilEco = [eco.forma_vida && tr('Forma de vida e habitat: {v}.', { v: trTermos(eco.forma_vida) }), eco.biomas?.length && tr('Biomas: {v}.', { v: eco.biomas.map(trDado).join(', ') })].filter(Boolean).join(' ');
  const mma = siglaAmeaca(eco.categoria_mma);

  const RANKS = [['reino', 'Reino'], ['filo', 'Filo'], ['classe', 'Classe'], ['ordem', 'Ordem'], ['familia', 'Família'], ['genero', 'Gênero']];

  const corpo = html`
    <button type="button" class="btn-voltar" data-voltar>${icone('voltar')}Voltar</button>
    <div class="cab-perfil">
      <p class="eyebrow">${tr('ESPÉCIE')} · ${pack.taxonomia.familia || tr(g.rotulo)}</p>
      <h2 id="painel-titulo" tabindex="-1" translate="no">${pack.nome} <span class="autoria">${pack.autoria || ''}</span></h2>
      ${populares ? html`<p class="populares" translate="no">${populares}</p>` : ''}
      <div class="chips">
        <span class="badge ind">${icone(g.icone)}${tr(g.rotulo)}</span>
        ${r.dentro ? (pred ? html`<span class="badge ${pred.classe}" title="${tr(pred.rotulo)}">${tr(pred.curto)}</span>` : '') : html`<span class="badge fora">${tr('Fora do recorte amazônico')}</span>`}
        ${pack.origem_estabelecimento === 'introduzida' ? html`<span class="badge alerta" title="${tr('Classificação da Flora e Funga do Brasil ou do CTFB.')}">${tr('Introduzida no Brasil')}</span>` : pack.origem_estabelecimento === 'nativa' ? html`<span class="badge ok" title="${tr('Classificação da Flora e Funga do Brasil ou do CTFB.')}">${tr('Nativa do Brasil')}</span>` : ''}
        ${ehEndemica(eco.endemismo_br) ? html`<span class="badge ok" title="${tr('Endemismo segundo a Flora e Funga do Brasil ou o CTFB.')}">${tr('Endêmica do Brasil')}</span>` : ''}
        ${eco.estrato_florestal && ROTULO_ESTRATO[eco.estrato_florestal] ? html`<a class="badge ind" href="#/floresta" title="${tr('Estrato vertical na floresta')}">${icone('floresta')}${tr(ROTULO_ESTRATO[eco.estrato_florestal])}</a>` : ''}
        ${ehAmeacada(mma) ? html`<span class="badge alerta" title="${tr('Lista oficial de espécies ameaçadas (MMA).')}">MMA: ${mma}</span>` : ''}
        ${pack.iucn?.categoria ? html`<span class="badge ind" title="${tr('Categoria da Lista Vermelha da IUCN, via GBIF.')}">IUCN: ${pack.iucn.categoria}</span>` : ''}
        <a class="chip" href="https://www.gbif.org/species/${pack.gbif}" target="_blank" rel="noopener noreferrer">GBIF ${pack.gbif}${icone('externo')}<span class="so-leitor"> ${tr('(abre em nova aba)')}</span></a>
      </div>
    </div>
    ${imagens}

    <section class="cartao cartao-topo" aria-labelledby="h-recorte">
      <h3 id="h-recorte">${icone('territorio')}Distribuição da espécie</h3>
      ${pack.distribuicao_br ? html`<p class="distribuicao"><strong>${rotulo('distribuicao_br', pack.distribuicao_br)}</strong></p>
        <p class="fonte-linha">Classificação da distribuição pela Flora e Funga do Brasil, pelo CTFB e pelas contagens do GBIF no Brasil.</p>` : ''}
      ${r.n_br != null ? html`<div class="recorte ${r.dentro && !semPredominio(r.predominio) ? '' : 'marg'}">
        <div class="numeros">
          <div><b data-contar="${r.n_br}">${fmtInt(r.n_br)}</b>registros no Brasil</div>
          <div><b data-contar="${r.n_br_com_uf}">${fmtInt(r.n_br_com_uf)}</b>com estado atribuído</div>
          <div><b data-contar="${r.n_al}">${fmtInt(r.n_al)}</b>na Amazônia Legal</div>
          ${r.n_bioma_amazonia != null ? html`<div><b data-contar="${r.n_bioma_amazonia}">${fmtInt(r.n_bioma_amazonia)}</b>no Bioma Amazônia</div>` : ''}
          ${r.n_ma_oeste44 != null && r.n_ma_oeste44 > 0 ? html`<div><b>${fmtInt(r.n_ma_oeste44)}</b>no Maranhão a oeste de 44°W</div>` : ''}
          <div><b>${fmtPct(r.fracao_com_uf)}</b>na Amazônia Legal, entre os registros com estado</div>
          <div><b>${fmtPct(r.fracao_total)}</b>na Amazônia Legal, entre todos os registros do Brasil</div>
        </div></div>
        ${fonteLinha(pack, r.consulta)}
        ${barrasUF(pack.uf, ufsAL)}
        ${bacias.length ? html`<details class="mais"><summary>${icone('bacia')}${tr('Registros por sub-bacia amazônica ({n})', { n: bacias.length })}</summary>
          <ul class="barras barras-largas" aria-label="${tr('Registros do GBIF por sub-bacia')}">${bacias.map((b) =>
            html`<li class="al"><span title="${b.nome}"><a href="#/bacia/${b.id}">${b.nome.replace(/^Bacia do /, '')}</a></span><span class="trilho"><span class="preenche" style="width:${Math.max(2, (b.n / maxBacia) * 100).toFixed(1)}%"></span></span><span class="n">${fmtInt(b.n)}</span></li>`)}</ul>
          ${fonteLinha(pack, bacias[0].consulta)}</details>` : ''}` : ''}
    </section>

    <section class="cartao" aria-labelledby="h-tax">
      <h3 id="h-tax">${icone('livro')}Identidade taxonômica</h3>
      <div class="linhagem-tax" role="list" aria-label="${tr('Hierarquia taxonômica')}">
        ${RANKS.map(([k, rot]) => html`<div class="linhagem-no" role="listitem"><span>${tr(rot)}</span><strong>${pack.taxonomia[k] || '–'}</strong></div>`)}
      </div>
      ${perfilEco ? html`<p class="fonte-linha">${perfilEco}${eco.fonte_checklist && eco.consulta == null ? ` ${tr('Fonte: {fonte}.', { fonte: trDado(eco.fonte_checklist) })}` : ''}</p>${fonteLinha(pack, eco.consulta)}` : ''}
      ${sinonimos.length ? html`<details class="mais"><summary>${trn(sinonimos.length, '{n} sinônimo', '{n} sinônimos')}</summary><ul class="refs sem-marcador">${sinonimos.map(itemSinonimo)}</ul></details>` : ''}
    </section>

    ${pack.contexto_biocultural?.length ? html`<section class="cartao" aria-labelledby="h-biocult">
      <h3 id="h-biocult">${icone('escudo')}Contexto biocultural</h3>
      ${pack.contexto_biocultural.map((cb) => html`<p>${trDado(cb.nota || cb.contexto || '')}${cb.tronco_linguistico ? html` <small class="mono">(${cb.tronco_linguistico})</small>` : ''}</p>
        ${cb.fonte ? html`<p class="fonte-linha">${tr('Referência: {fonte}.', { fonte: cb.fonte })}</p>` : ''}`)}
    </section>` : ''}

    <h3 class="sec-titulo">${icone('molecula')}${tr(animal ? (temPeqMol ? 'Toxinas e outras moléculas relatadas' : 'Toxinas com função anotada') : 'Constituintes relatados')}<span class="contagem">${filtrando ? tr('{n} de {total}', { n: fmtInt(molsFilt.length), total: fmtInt(molsTodas.length) }) : fmtInt(totalMolsPack)}</span></h3>
    <div class="chips" role="group" aria-label="${tr('Filtros de evidência e procedência')}">${chipsFiltro(filtros)}</div>
    ${temToxina ? html`<p class="fonte-linha">As descrições de função são anotações curadas do UniProt/Swiss-Prot, no idioma original.</p>` : ''}
    ${molsTodas.length ? html`
      ${molsTodas.length > 12 ? html`<p><label for="f-mol" class="so-leitor">Filtrar moléculas</label>
        <input id="f-mol" class="campo-filtro" type="search" value="${filtroMol || ''}" placeholder="${tr('Nome, classe química ou família')}"></p>` : ''}
      ${molsVis.length ? html`<ul class="lista" id="lista-mol">${molsVis.map((m) => blocoMolecula(m, pack))}</ul>` : html`<div class="vazio-estado">${tr('Nenhum registro para este filtro.')}</div>`}
      ${(molsFilt.length > molsVis.length || (!filtrando && totalMolsPack > molsTodas.length)) ? html`<p class="acoes-painel"><button type="button" class="btn sec" data-a="mais-mol">${tr('Mostrar as {n} moléculas', { n: fmtInt(filtrando ? molsFilt.length : totalMolsPack) })}</button></p>` : ''}`
      : html`<div class="vazio-estado">${tr('Nenhuma molécula registrada para este táxon.')}</div>`}

    ${blocoCobertura(pack)}`;
  return { titulo: pack.nome, corpo };
}

/** Busca e insere os SVG de estrutura química (gerados com RDKit) e monta o visualizador 3D sob demanda. */
export async function hidratarEstruturas(raiz) {
  for (const im of raiz.querySelectorAll('img[data-svg-img]')) {
    svgDataUri(im.dataset.svgImg).then((uri) => { if (uri && im.isConnected) im.src = uri; }).catch(() => {});
  }

  const hidratarAlvoSvg = async (alvo) => {
    if (!alvo || alvo.dataset.svgCarregado === '1') return;
    alvo.dataset.svgCarregado = '1';
    try {
      const t = await svgEstrutura(alvo.dataset.svg);
      if (!t.trimStart().startsWith('<svg')) throw new Error('não é SVG');
      const doc = new DOMParser().parseFromString(t, 'image/svg+xml');
      const svg = doc.documentElement;
      if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('script, foreignObject')) throw new Error('SVG recusado');
      svg.removeAttribute('role'); svg.removeAttribute('aria-label');
      alvo.replaceChildren(document.importNode(svg, true));
    } catch {
      alvo.classList.add('vazia');
      alvo.replaceChildren(Object.assign(document.createElement('span'), { textContent: tr('Não foi possível carregar a estrutura. Tente novamente.') }));
    }
  };

  const montarHost3D = async (host) => {
    if (!host || host.dataset.montado === '1') return;
    host.dataset.montado = '1';
    try {
      const opcoes = JSON.parse(host.getAttribute('data-3d-json') || '[]');
      const consultas = JSON.parse(host.getAttribute('data-3d-consultas') || '[]');
      const molMeta = JSON.parse(host.getAttribute('data-3d-mol') || '{}');
      const mod = await import('./viz/estrutura3d.js');
      await mod.montarVisualizador3D(host, opcoes, consultas, molMeta);
    } catch {
      host.dispatchEvent(new Event('bmb:falha3d', { bubbles: true }));
      host.innerHTML = html`<p class="fonte-linha erro-3d">${tr('Não foi possível carregar a estrutura 3D. Tente novamente.')}</p>`.toString();
    }
  };

  for (const autoHost of raiz.querySelectorAll('[data-3d-auto="1"]')) {
    montarHost3D(autoHost);
  }

  for (const alvo of raiz.querySelectorAll('[data-svg]')) {
    if (!alvo.closest('[hidden]')) hidratarAlvoSvg(alvo);
  }

  for (const bloco of raiz.querySelectorAll('[data-est-bloco]')) {
    const p2d = bloco.querySelector('[data-painel-2d]');
    const p3d = bloco.querySelector('[data-painel-3d]');
    if (!p2d || !p3d) continue;
    bloco.addEventListener('bmb:falha3d', () => {
      p3d.hidden = true;
      p2d.hidden = false;
      bloco.dataset.vista = '2d';
      bloco.querySelector('[data-cena-origem]').textContent = tr('Estrutura 3D indisponível');
      const modos = bloco.querySelector('.alternador-vista');
      if (modos) modos.hidden = true;
      hidratarAlvoSvg(p2d.querySelector('[data-svg]'));
    });
    bloco.querySelectorAll('[data-modo-est]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modo = btn.getAttribute('data-modo-est');
        bloco.querySelectorAll('[data-modo-est]').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        bloco.dataset.vista = modo;
        p2d.hidden = modo !== '2d';
        p3d.hidden = modo !== '3d';
        if (modo === '3d') montarHost3D(p3d);
        if (modo === '2d') hidratarAlvoSvg(p2d.querySelector('[data-svg]'));
      });
    });
  }
}

let _cvFoco, _dlgFoto, _dlgEstado;
/** Calcula o ponto focal por nitidez e contraste de borda para imagens sem metadados de foco. */
function calcularFocoImagem(img) {
  try {
    const G = 32;
    if (!_cvFoco) _cvFoco = Object.assign(document.createElement('canvas'), { width: G, height: G });
    const ctx = _cvFoco.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, G, G);
    const d = ctx.getImageData(0, 0, G, G).data;
    const lum = new Float32Array(G * G);
    let mRg = 0, mBy = 0, nb = 0;
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const k = (y * G + x) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
        lum[y * G + x] = 0.299 * r + 0.587 * g + 0.114 * b;
        if (x < 2 || x >= G - 2 || y < 2 || y >= G - 2) { mRg += r - g; mBy += 0.5 * (r + g) - b; nb++; }
      }
    }
    mRg /= nb || 1; mBy /= nb || 1;
    let sx = 0, sy = 0, sw = 0;
    for (let y = 1; y < G - 1; y++) {
      for (let x = 1; x < G - 1; x++) {
        const i = y * G + x, k = i * 4, L = lum[i];
        if (L < 14 || L > 248) continue;
        const det = Math.abs(4 * L - lum[i - 1] - lum[i + 1] - lum[i - G] - lum[i + G]);
        const croma = Math.hypot((d[k] - d[k + 1]) - mRg, (0.5 * (d[k] + d[k + 1]) - d[k + 2]) - mBy);
        const w = ((det + 1) ** 1.35) * (1 + 0.01 * croma);
        sx += ((x + 0.5) / G) * 100 * w; sy += ((y + 0.5) / G) * 100 * w; sw += w;
      }
    }
    if (sw <= 0) return null;
    const clamp = (v) => Math.max(14, Math.min(86, v)).toFixed(1);
    return [clamp(sx / sw), clamp(sy / sw)];
  } catch { return null; }
}

function garantirLightbox() {
  if (_dlgFoto) return _dlgFoto;
  const dlg = document.createElement('dialog');
  dlg.className = 'bmb-lightbox';
  dlg.setAttribute('aria-label', tr('Fotografia ampliada'));
  dlg.innerHTML = `<div class="lb-corpo">
    <button type="button" class="lb-fechar" aria-label="${tr('Fechar')}">${icone('fechar')}</button>
    <div class="lb-palco">
      <button type="button" class="lb-nav ant" data-lb-dir="-1" aria-label="${tr('Fotografia anterior')}">${icone('voltar')}</button>
      <img class="lb-img" alt="">
      <button type="button" class="lb-nav prox" data-lb-dir="1" aria-label="${tr('Próxima fotografia')}">${icone('seta')}</button>
    </div>
    <div class="lb-legenda"></div>
  </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.lb-fechar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.querySelectorAll('[data-lb-dir]').forEach((b) => b.addEventListener('click', () => mudarSlideLightbox(Number(b.dataset.lbDir))));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); mudarSlideLightbox(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); mudarSlideLightbox(1); }
  });
  _dlgFoto = dlg;
  return dlg;
}

function mudarSlideLightbox(delta) {
  if (!_dlgEstado) return;
  const { slides } = _dlgEstado;
  _dlgEstado.idx = (_dlgEstado.idx + delta + slides.length) % slides.length;
  const s = slides[_dlgEstado.idx], dlg = _dlgFoto;
  const img = dlg.querySelector('.lb-img');
  img.src = s.src; img.alt = s.alt;
  dlg.querySelector('.lb-legenda').innerHTML = s.legenda;
  dlg.querySelectorAll('.lb-nav').forEach((b) => { b.hidden = slides.length <= 1; });
}

/** Liga as galerias de fotografias, a ampliação e o ponto focal automático. */
export function hidratarMidia(raiz) {
  for (const img of raiz.querySelectorAll('img.foto-especime, img[data-auto-foco]')) {
    const aoCarregar = () => {
      const palco = img.closest('.foto-palco');
      if (palco && img.naturalWidth > 0) palco.style.setProperty('--iw', `${img.naturalWidth}px`);
      if (img.hasAttribute('data-auto-foco')) {
        const foco = calcularFocoImagem(img);
        if (foco) {
          const alvo = palco || img;
          alvo.style.setProperty('--fx', `${foco[0]}%`);
          alvo.style.setProperty('--fy', `${foco[1]}%`);
        }
      }
    };
    if (img.complete && img.naturalWidth > 0) aoCarregar();
    else img.addEventListener('load', aoCarregar, { once: true });
  }

  for (const bloco of raiz.querySelectorAll('[data-galeria]')) {
    const faixa = bloco.querySelector('.galeria');
    const figs = [...bloco.querySelectorAll('.foto')];
    if (!faixa || !figs.length) continue;
    const pontos = [...bloco.querySelectorAll('[data-gal-ir]')];
    const conta = bloco.querySelector('[data-gal-conta]');
    const slides = figs.map((f) => {
      const im = f.querySelector('.foto-especime');
      return { src: im?.getAttribute('src') || '', alt: im?.alt || '', legenda: f.querySelector('figcaption')?.innerHTML || '' };
    });
    let atual = 0;
    const irPara = (idx) => {
      atual = (idx + figs.length) % figs.length;
      faixa.scrollTo({ left: figs[atual].offsetLeft - faixa.offsetLeft, behavior: 'smooth' });
      pontos.forEach((p, i) => p.setAttribute('aria-current', String(i === atual)));
      if (conta) conta.textContent = `${atual + 1} / ${figs.length}`;
    };
    bloco.querySelectorAll('[data-gal-dir]').forEach((b) => b.addEventListener('click', () => irPara(atual + Number(b.dataset.galDir))));
    pontos.forEach((p) => p.addEventListener('click', () => irPara(Number(p.dataset.galIr))));
    let raf = 0;
    faixa.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = faixa.clientWidth || 1;
        const i = Math.max(0, Math.min(figs.length - 1, Math.round(faixa.scrollLeft / w)));
        if (i !== atual) {
          atual = i;
          pontos.forEach((p, k) => p.setAttribute('aria-current', String(k === atual)));
          if (conta) conta.textContent = `${atual + 1} / ${figs.length}`;
        }
      });
    }, { passive: true });
    bloco.querySelectorAll('[data-abrir-foto]').forEach((palco) => {
      const abrir = () => {
        const dlg = garantirLightbox();
        _dlgEstado = { slides, idx: Number(palco.dataset.abrirFoto) || 0 };
        mudarSlideLightbox(0);
        if (!dlg.open) dlg.showModal();
      };
      palco.addEventListener('click', abrir);
      palco.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
      });
    });
  }
}
