// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Fluxos e linhagens (`#/fluxo`): diagrama aluvial de quatro colunas (sub-bacia, família, classe química da
// molécula isolada e, na quarta, alvo molecular, sistema de ensaio, via do Reactome ou fármaco) e a lista de
// linhagens farmacológicas com a frase citada.
import { html, esc, icone, tr, trn, trDado, trPartes, tituloObra, fmtInt, fmtDec, fmtData, urlDoi, urlPmid, anunciar, baixarCSV } from '../util.js';
import * as dados from '../dados.js';
import { garantirEstilosObservatorio } from './estilos_obs.js';

const CORES_COLUNA = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24'];
const FONTE_TRECHO = { resumo_pubmed: 'resumo no PubMed', texto_completo_europepmc: 'texto completo no Europe PMC' };

/** Nome de nó como chega nos dados («Via: …», «Linhagem celular: …», «Outras famílias»), no idioma da interface. */
function nomeNo(nome) {
  const inteiro = trDado(nome);
  const i = nome.indexOf(': ');
  if (inteiro !== nome || i < 1) return inteiro;
  const prefixo = nome.slice(0, i), minusculo = prefixo.charAt(0).toLowerCase() + prefixo.slice(1);
  const traduzido = trDado(prefixo) !== prefixo ? trDado(prefixo) : trDado(minusculo).replace(/^./, (c) => c.toUpperCase());
  return traduzido + nome.slice(i);
}

/** Linhagem farmacológica: o texto da relação e a frase da obra citada, entre aspas, com a citação. */
function cartaoLinhagem(ln) {
  const ref = ln.referencia;
  const url = ref ? urlDoi(ref.doi) || urlPmid(ref.pmid) : null;
  const obra = ref && (ref.titulo || ref.ano) ? html`${ref.titulo ? tituloObra(ref.titulo) : ''}${ref.titulo && ref.ano ? ' ' : ''}${ref.ano ? `(${ref.ano})` : ''}` : '';
  const id = ref?.doi ? `doi:${ref.doi}` : ref?.pmid ? `PMID ${ref.pmid}` : '';
  const origemTrecho = ln.trecho && FONTE_TRECHO[ln.trecho_fonte] ? ` (${tr(FONTE_TRECHO[ln.trecho_fonte])})` : '';
  const citacao = ref ? html`${obra}${obra && id ? ' · ' : ''}${url ? html`<a href="${url}" target="_blank" rel="noopener noreferrer">${id}${icone('externo')}<span class="so-leitor"> ${tr('(abre em nova aba)')}</span></a>` : id}${origemTrecho}` : '';
  return html`<article class="obs-linhagem-card">
    <p class="obs-linhagem-par"><a href="#/molecula/${ln.origem.id}">${ln.origem.nome}</a><span aria-hidden="true">→</span><a href="#/molecula/${ln.destino.id}">${ln.destino.nome}</a></p>
    <p>${trDado(ln.texto || '')}</p>
    ${ln.trecho ? html`<blockquote class="passagem">“${ln.trecho}”${citacao ? html`<cite>${citacao}</cite>` : ''}</blockquote>` : citacao ? html`<p class="fonte-linha">${citacao}</p>` : ''}
  </article>`;
}

export async function montarFluxo(raiz) {
  garantirEstilosObservatorio();
  raiz.innerHTML = `<div class="obs-pagina"><p class="carregando" role="status">${esc(tr('Carregando…'))}</p></div>`;
  const fx = await dados.viz('fluxo');
  const nos = fx.nos || [];
  const links = fx.links || [];
  const linhagens = fx.linhagens || [];
  let vista = 'diagrama';
  let noFoco = null;

  raiz.innerHTML = html`<div class="obs-pagina">
    <div class="obs-topo">
      <div>
        <p class="eyebrow">SUB-BACIAS · FAMÍLIAS · CLASSES QUÍMICAS · ALVOS E VIAS</p>
        <h1>Fluxos e linhagens</h1>
        <p class="sub">Diagrama aluvial em quatro colunas: sub-bacia amazônica, família, classe química da molécula isolada e, na quarta, alvo molecular, sistema de ensaio, via do Reactome ou fármaco. A largura de cada faixa é proporcional ao número de pares táxon–molécula que ligam os dois nós. Um par com várias sub-bacias ou vários destinos é dividido igualmente entre eles.</p>
      </div>
      <div class="obs-acoes-topo">
        <div class="alternador-vista" role="group" aria-label="${tr('Modo de exibição')}">
          <button type="button" data-fx-vista="diagrama" aria-pressed="true">${icone('fluxo')}Diagrama</button>
          <button type="button" data-fx-vista="tabela" aria-pressed="false">${icone('lista')}Tabela</button>
        </div>
        <button type="button" class="btn sec" id="fx-csv">${icone('baixar')}Baixar CSV</button>
      </div>
    </div>

    <div class="obs-kpis">
      <div class="obs-kpi"><b>${fmtInt(nos.filter((n) => n.coluna === 0).length)}</b><span>sub-bacias</span></div>
      <div class="obs-kpi"><b>${fmtInt(nos.filter((n) => n.coluna === 1).length)}</b><span>famílias ou grupos de famílias</span></div>
      <div class="obs-kpi"><b>${fmtInt(links.length)}</b><span>ligações no diagrama</span></div>
      <div class="obs-kpi"><b>${fmtInt(linhagens.length)}</b><span>linhagens farmacológicas</span></div>
    </div>

    <div id="fx-area-diagrama" class="obs-palco-card">
      <div id="fx-svg-host" class="fx-svg-host"></div>
      <div class="obs-portao-banner" role="note">
        ${icone('info')}
        <div>À esquerda da linha tracejada, a ocorrência de constituintes em organismos. À direita, ensaios com a molécula isolada, vias do Reactome e fármacos aprovados.</div>
      </div>
    </div>

    <div id="fx-area-tabela" class="tabela-wrap" hidden>
      <table class="tabela">
        <caption class="so-leitor">Ligações do diagrama</caption>
        <thead><tr><th scope="col">Origem</th><th scope="col">Destino</th><th scope="col">Molécula isolada</th><th scope="col">Peso</th></tr></thead>
        <tbody>${links.map((l) => html`<tr>
          <td>${nos[l.origem] ? nomeNo(nos[l.origem].nome) : '–'}</td>
          <td>${nos[l.destino] ? nomeNo(nos[l.destino].nome) : '–'}</td>
          <td>${tr(l.transpoe_portao ? 'sim' : 'não')}</td>
          <td class="num">${fmtDec(l.valor)}</td>
        </tr>`)}</tbody>
      </table>
    </div>

    ${linhagens.length ? html`
      <h2 class="sec-titulo">${icone('farmaco')}Linhagens farmacológicas</h2>
      <div class="obs-linhagens-grade">${linhagens.map(cartaoLinhagem)}</div>` : ''}

    ${fx.consultas?.length ? html`<details class="mais">
      <summary>${icone('dados')}${trn(fx.consultas.length, 'Consulta às fontes ({n})', 'Consultas às fontes ({n})')}</summary>
      <ul class="refs">${fx.consultas.map((c) => html`<li>${trPartes(c.fonte_nome)} · ${fmtData(c.data)}${c.versao ? ` · ${c.versao}` : ''} · ${tr('licença {l}', { l: trDado(c.licenca) })} · <a href="${c.url}" target="_blank" rel="noopener noreferrer">${tr('abrir a consulta')}</a></li>`)}</ul>
    </details>` : ''}
  </div>`.toString();

  const host = raiz.querySelector('#fx-svg-host');

  function renderizarSankey() {
    const W = 1160, H = 560;
    const padTop = 52, padBot = 24, padX = 24, largNo = 16;
    const xs = [padX, 345, 700, W - padX - largNo];
    const xPortao = (xs[2] + largNo + xs[3]) / 2;

    const porCol = [0, 1, 2, 3].map((c) => nos.filter((n) => n.coluna === c));
    const pesoSaida = new Array(nos.length).fill(0);
    const pesoEntrada = new Array(nos.length).fill(0);
    for (const l of links) {
      pesoSaida[l.origem] += l.valor;
      pesoEntrada[l.destino] += l.valor;
    }
    const pesoNo = nos.map((_, i) => Math.max(pesoSaida[i], pesoEntrada[i], 0.5));

    const geomNo = new Array(nos.length);
    for (let c = 0; c < 4; c++) {
      const lista = porCol[c];
      const gap = 9;
      const disp = H - padTop - padBot - Math.max(0, lista.length - 1) * gap;
      const soma = lista.reduce((s, n) => s + pesoNo[n.id], 0) || 1;
      let y = padTop;
      for (const n of lista) {
        const h = Math.max(12, (pesoNo[n.id] / soma) * disp);
        geomNo[n.id] = { x: xs[c], y, w: largNo, h, offOut: 0, offIn: 0, cor: CORES_COLUNA[c], coluna: c, nome: n.nome };
        y += h + gap;
      }
    }

    // Nós ligados ao nó em foco
    const conectados = new Set();
    if (noFoco != null) {
      conectados.add(noFoco);
      for (const l of links) {
        if (l.origem === noFoco || l.destino === noFoco) {
          conectados.add(l.origem);
          conectados.add(l.destino);
        }
      }
    }

    const fitas = links.map((l, idx) => {
      const a = geomNo[l.origem], b = geomNo[l.destino];
      if (!a || !b) return '';
      const espA = (l.valor / pesoNo[l.origem]) * a.h;
      const espB = (l.valor / pesoNo[l.destino]) * b.h;
      const esp = Math.max(1.8, (espA + espB) * 0.5);
      const y0 = a.y + a.offOut + espA * 0.5;
      const y1 = b.y + b.offIn + espB * 0.5;
      a.offOut += espA;
      b.offIn += espB;
      const x0 = a.x + a.w, x1 = b.x;
      const mx = (x0 + x1) * 0.5;
      const ativo = noFoco == null || l.origem === noFoco || l.destino === noFoco;
      const op = noFoco == null ? (l.transpoe_portao ? 0.38 : 0.28) : (ativo ? 0.78 : 0.05);
      const cor = l.transpoe_portao ? '#fbbf24' : a.cor;
      return `<path d="M${x0},${y0.toFixed(1)} C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1},${y1.toFixed(1)}"
        fill="none" stroke="${cor}" stroke-opacity="${op}" stroke-width="${esp.toFixed(1)}" data-fx-elo="${idx}">
        <title>${esc(nomeNo(a.nome))} → ${esc(nomeNo(b.nome))} (${fmtDec(l.valor)})</title></path>`;
    }).join('');

    const cabecalhos = (fx.colunas_diagrama || []).map((t, c) => {
      const anc = c === 3 ? 'end' : c === 0 ? 'start' : 'middle';
      const x = c === 3 ? xs[c] + largNo : c === 0 ? xs[c] : xs[c] + largNo / 2;
      return `<text x="${x}" y="22" text-anchor="${anc}" fill="var(--ink3)" font-size="11.5" font-weight="600">${esc(trDado(t))}</text>`;
    }).join('');

    const nosSvg = nos.map((n) => {
      const g = geomNo[n.id];
      if (!g) return '';
      const op = noFoco == null || conectados.has(n.id) ? 1 : 0.28;
      const dir = g.coluna < 3;
      const tx = dir ? g.x + g.w + 7 : g.x - 7;
      const anc = dir ? 'start' : 'end';
      const rotulo = nomeNo(n.nome);
      const rotCurto = rotulo.length > 36 ? rotulo.slice(0, 35) + '…' : rotulo;
      return `<g class="fx-no" data-fx-no="${n.id}" tabindex="0" role="button" aria-label="${esc(tr('{nome}: destacar ligações', { nome: rotulo }))}" style="cursor:pointer;opacity:${op}">
        <rect x="${g.x}" y="${g.y.toFixed(1)}" width="${g.w}" height="${g.h.toFixed(1)}" rx="4" fill="${g.cor}"/>
        <text x="${tx}" y="${(g.y + g.h / 2 + 4).toFixed(1)}" text-anchor="${anc}" fill="var(--ink)" font-size="11.5">${esc(rotCurto)}</text>
      </g>`;
    }).join('');

    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:820px;height:auto;display:block" role="group" aria-label="${esc(tr('Diagrama aluvial em quatro colunas'))}">
      ${cabecalhos}
      <line x1="${xPortao.toFixed(1)}" y1="34" x2="${xPortao.toFixed(1)}" y2="${H - 12}" stroke="#fbbf24" stroke-width="1.6" stroke-dasharray="5 5" stroke-opacity="0.72"/>
      <text x="${xPortao.toFixed(1)}" y="44" text-anchor="middle" fill="#fbbf24" font-size="10" font-weight="700">${esc(tr('MOLÉCULA ISOLADA'))}</text>
      <g>${fitas}</g>
      <g>${nosSvg}</g>
    </svg>`;
  }

  host.addEventListener('click', (e) => {
    const g = e.target.closest('[data-fx-no]');
    if (!g) { if (noFoco != null) { noFoco = null; renderizarSankey(); } return; }
    const id = Number(g.getAttribute('data-fx-no'));
    noFoco = noFoco === id ? null : id;
    renderizarSankey();
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const g = e.target.closest('[data-fx-no]');
      if (g) { e.preventDefault(); const id = Number(g.getAttribute('data-fx-no')); noFoco = noFoco === id ? null : id; renderizarSankey(); }
    }
  });

  raiz.addEventListener('click', (e) => {
    const bv = e.target.closest('[data-fx-vista]');
    if (bv) {
      vista = bv.getAttribute('data-fx-vista');
      raiz.querySelectorAll('[data-fx-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-fx-vista') === vista)));
      raiz.querySelector('#fx-area-diagrama').hidden = vista !== 'diagrama';
      raiz.querySelector('#fx-area-tabela').hidden = vista !== 'tabela';
    }
  });

  raiz.querySelector('#fx-csv').addEventListener('click', () => {
    baixarCSV(
      'biomapabrasil_fluxos.csv',
      ['coluna_origem', 'origem', 'coluna_destino', 'destino', 'molecula_isolada', 'peso'],
      links.map((l) => [nos[l.origem]?.coluna, nos[l.origem]?.nome, nos[l.destino]?.coluna, nos[l.destino]?.nome, l.transpoe_portao ? 'sim' : 'nao', l.valor])
    );
    anunciar(tr('CSV baixado.'));
  });

  renderizarSankey();
}
