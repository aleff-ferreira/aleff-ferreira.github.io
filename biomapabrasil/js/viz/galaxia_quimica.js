// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Espaço químico (`#/galaxia`): pequenas moléculas dispostas por similaridade estrutural, em 3D (WebGL), em 2D
// (canvas) ou em tabela, com arestas TMAP, cores por variável, filtros por descritores RDKit e por esqueleto de
// Bemis–Murcko, e exportação em CSV.
import { html, esc, icone, tr, trDado, trPartes, fmtInt, fmtDec, fmtData, semAcento, nomeMolecula, anunciar, baixarCSV } from '../util.js';
import { FILTROS } from '../perfis.js';
import * as dados from '../dados.js';
import { garantirEstilosObservatorio } from './estilos_obs.js';
import { criarGalaxia3D } from './galaxia_3d.js';

const EIXOS_Z = [['fsp3', 'Fsp³'], ['clogp', 'cLogP'], ['mw', 'Massa monoisotópica'], ['domo', 'Sem variável']];
const LEGENDAS = {
  procedencia: [['#10b981', 'Coleta amazônica declarada'], ['#94a3b8', 'Sem coleta amazônica declarada']],
  potencia: [['#fbbf24', 'pChEMBL ≥ 7,5'], ['#34d399', 'pChEMBL de 6,0 a 7,5'], ['#38bdf8', 'pChEMBL < 6,0']],
  npl: [['#10b981', 'NP-likeness ≥ 1,2'], ['#22d3ee', 'NP-likeness de 0 a 1,2'], ['#f472b6', 'NP-likeness < 0']],
  fase: [['#f59e0b', 'Fase 4'], ['#38bdf8', 'Fases 1 a 3']],
  pains: [['#ef4444', 'Com alerta PAINS'], ['#34d399', 'Sem alerta PAINS']],
};

const PALETA_CLASSES = [
  '#34d399', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6',
  '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#38bdf8',
  '#facc15', '#2dd4bf',
];

function temaClaro() {
  return document.documentElement.dataset.tema === 'claro';
}

const COR_CACHE = new Map();
function parseCorRGB(str) {
  let hit = COR_CACHE.get(str);
  if (hit) return hit;
  let r = 0.5, g = 0.5, b = 0.5;
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    }
  } else if (str.startsWith('rgba') || str.startsWith('rgb')) {
    const m = str.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) {
      r = parseFloat(m[0]) / 255;
      g = parseFloat(m[1]) / 255;
      b = parseFloat(m[2]) / 255;
    }
  }
  hit = [r, g, b];
  COR_CACHE.set(str, hit);
  return hit;
}

export async function montarGalaxia(raiz, params = null, { signal } = {}) {
  garantirEstilosObservatorio();
  raiz.innerHTML = `<div class="obs-pagina"><p class="carregando" role="status">${esc(tr('Carregando…'))}</p></div>`;
  const gz = await dados.viz('galaxia');
  if (signal?.aborted) return;
  const ix = Object.fromEntries(gz.colunas.map((c, i) => [c, i]));
  const escXY = gz.escala_xy || 1;
  const dicCls = gz.dicionario_classes || null;
  const dicFts = gz.dicionario_fontes || null;
  const mols = gz.linhas.map((l) => {
    if (escXY === 1 && !dicCls && !dicFts) return l;
    const r = l.slice();
    if (escXY !== 1) {
      r[ix.x] = r[ix.x] / escXY;
      r[ix.y] = r[ix.y] / escXY;
    }
    if (dicCls && typeof r[ix.classe] === 'number') r[ix.classe] = dicCls[r[ix.classe]] || '';
    if (dicFts && typeof r[ix.fontes] === 'number') r[ix.fontes] = dicFts[r[ix.fontes]] || [];
    if (typeof r[ix.estrutura] === 'string' && r[ix.estrutura].startsWith('#')) {
      const p = r[ix.estrutura].slice(1).split('#');
      if (p.length === 2) r[ix.estrutura] = `estruturas_lotes/${p[0]}.json#${p[1]}`;
    }
    return r;
  });
  const arestas = gz.arestas || [];
  const scaffolds = gz.scaffolds || [];
  const classesTop = (gz.classes || []).slice(0, 10).map((c) => c.nome);
  const corClasse = new Map(classesTop.map((c, i) => [c, PALETA_CLASSES[i % PALETA_CLASSES.length]]));

  let vista = '3d';       // 3d | canvas | tabela
  let lente = 'classe';   // classe | procedencia | potencia | npl | fase | pains
  let mostrarTMAP = true;
  let buscaQ = '';
  let mwMax = 1200, clogpMax = 10, tpsaMax = 350, fsp3Min = 0;
  let soColeta = false;
  let scafSel = -1;
  let cam = { x: 0, y: 0, z: 1 };
  let focoIdx = -1;
  let molFocoFixo = -1;
  let vizinhosFoco = [];
  const idxPorId = new Map(mols.map((m, i) => [m[ix.id], i]));

  const nComAtiv = mols.filter((m) => m[ix.max_pch] != null).length;
  const nFase4 = mols.filter((m) => (m[ix.fase] || 0) >= 4).length;

  raiz.innerHTML = html`<div class="obs-pagina">
    <div class="obs-topo">
      <div>
        <p class="eyebrow">ESPAÇO QUÍMICO · MORGAN ECFP4 · TMAP</p>
        <h1>Espaço químico</h1>
        <p class="sub">${trDado(gz.metodo || '')}</p>
      </div>
      <div class="obs-acoes-topo">
        <div class="alternador-vista" role="group" aria-label="${tr('Modo de exibição')}">
          <button type="button" data-gx-vista="3d" aria-pressed="true">${icone('cubo')}3D</button>
          <button type="button" data-gx-vista="canvas" aria-pressed="false">${icone('galaxia')}2D</button>
          <button type="button" data-gx-vista="tabela" aria-pressed="false">${icone('lista')}Tabela</button>
        </div>
        <button type="button" class="btn sec" id="gx-csv">${icone('baixar')}Baixar CSV</button>
      </div>
    </div>

    <div class="obs-kpis">
      <div class="obs-kpi"><b>${fmtInt(mols.length)}</b><span>pequenas moléculas</span></div>
      <div class="obs-kpi"><b>${fmtInt(arestas.length)}</b><span>arestas de similaridade (TMAP)</span></div>
      <div class="obs-kpi"><b>${fmtInt(scaffolds.length)}</b><span>esqueletos de Bemis–Murcko recorrentes</span></div>
      <div class="obs-kpi"><b>${fmtInt(nComAtiv)}</b><span>com pChEMBL de molécula isolada</span></div>
      <div class="obs-kpi"><b>${fmtInt(nFase4)}</b><span>em fase 4 no ChEMBL</span></div>
    </div>

    <div id="gx-foco-mol" class="cartao" hidden style="margin-bottom:1rem"></div>

    <div id="gx-area-canvas" class="obs-grade">
      <div class="obs-palco-card">
        <div class="obs-hud-canto">
          <span class="obs-pill" id="gx-contagem-viva"></span>
          <div class="obs-controles-flutuantes" role="group" aria-label="${tr('Zoom')}">
            <button type="button" data-gx-z="1.35" aria-label="${tr('Aproximar')}">+</button>
            <button type="button" data-gx-z="0.74" aria-label="${tr('Afastar')}">−</button>
            <button type="button" data-gx-reset="1" aria-label="${tr('Centralizar')}">0</button>
            <button type="button" id="gx-btn-tmap" aria-pressed="true">Arestas TMAP</button>
          </div>
        </div>
        <div class="obs-canvas-wrap" id="gx-wrap">
          <canvas id="gx-cv" tabindex="0" role="application" aria-label="${tr('Projeção 2D do espaço químico. Mais e menos aproximam, as setas movem e um clique em um ponto abre a molécula.')}" style="display:none"></canvas>
          <div class="obs-mira-3d" id="gx-mira" style="position:absolute;pointer-events:none;width:24px;height:24px;border-radius:50%;border:2px solid #fef08a;box-shadow:0 0 10px rgba(254,240,138,0.7);transform:translate(-50%,-50%);transition:opacity .12s;display:none;z-index:2"></div>
          <div class="obs-dica-flutuante" id="gx-dica" hidden></div>
        </div>
        ${gz.aviso_epistemico ? html`<div class="obs-portao-banner">
          ${icone('info')}
          <div>${trDado(gz.aviso_epistemico)}</div>
        </div>` : ''}
      </div>

      <aside class="obs-painel-lat" aria-label="${tr('Cor, eixo vertical e filtros')}">
        <div id="gx-seletor-z-bloco">
          <h2>${icone('cubo')}Eixo vertical (3D)</h2>
          <div class="chips" style="margin-top:.45rem" role="group" aria-label="${tr('Variável do eixo vertical')}">
            ${EIXOS_Z.map(([k, r]) => html`<button type="button" class="chip" data-gx-eixo-z="${k}" aria-pressed="${k === 'fsp3'}">${tr(r)}</button>`)}
          </div>
          <div style="margin-top:.45rem">
            <select id="gx-sel-z" class="sel-eixo-z" aria-label="${tr('Variável do eixo vertical')}" style="width:100%;padding:.42rem .75rem;border-radius:8px;border:1px solid var(--linha2);background:var(--bg);color:var(--ink);font-size:.8rem">
              ${EIXOS_Z.map(([k, r]) => html`<option value="${k}" ${k === 'fsp3' ? 'selected' : ''}>${tr(r)}</option>`)}
            </select>
          </div>
        </div>

        <div>
          <h2>${icone('camadas')}Cor dos pontos</h2>
          <div class="chips" style="margin-top:.45rem" role="group" aria-label="${tr('Variável de cor')}">
            ${[
              ['classe', 'Classe química'],
              ['procedencia', FILTROS.coleta.rotulo],
              ['potencia', 'pChEMBL máximo'],
              ['npl', 'NP-likeness'],
              ['fase', 'Fase clínica'],
              ['pains', 'Alertas PAINS'],
            ].map(([k, r]) => html`<button type="button" class="chip" data-gx-lente="${k}" aria-pressed="${lente === k}">${tr(r)}</button>`)}
          </div>
          <div id="gx-legenda" style="margin-top:.55rem;font-size:.77rem;color:var(--ink2);display:flex;flex-wrap:wrap;gap:.45rem"></div>
        </div>

        <div>
          <label for="gx-q" style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.3rem">Molécula ou classe química</label>
          <input id="gx-q" type="search" placeholder="${tr('quercetina, flavonoide, alcaloide')}" style="width:100%;padding:.48rem .75rem;border-radius:999px;border:1px solid var(--linha2);background:var(--bg);color:var(--ink)">
          <label class="obs-check" title="${tr(FILTROS.coleta.dica)}"><input type="checkbox" id="gx-coleta"> ${tr(FILTROS.coleta.rotulo)}</label>
        </div>

        <div style="display:flex;flex-direction:column;gap:.55rem">
          <h3>${icone('molecula')}Descritores (RDKit)</h3>
          <div class="obs-faixa-slider">
            <label for="gx-mw"><span>Massa monoisotópica máxima</span><b id="gx-mw-v">≤ 1200 Da</b></label>
            <input id="gx-mw" type="range" min="120" max="1200" step="20" value="1200">
          </div>
          <div class="obs-faixa-slider">
            <label for="gx-lp"><span>cLogP máximo</span><b id="gx-lp-v">≤ 10</b></label>
            <input id="gx-lp" type="range" min="-2" max="10" step="0.5" value="10">
          </div>
          <div class="obs-faixa-slider">
            <label for="gx-tp"><span>TPSA máxima</span><b id="gx-tp-v">≤ 350 Å²</b></label>
            <input id="gx-tp" type="range" min="20" max="350" step="10" value="350">
          </div>
          <div class="obs-faixa-slider">
            <label for="gx-f3"><span>Fsp³ mínimo</span><b id="gx-f3-v">≥ 0</b></label>
            <input id="gx-f3" type="range" min="0" max="0.95" step="0.05" value="0">
          </div>
        </div>

        ${scaffolds.length ? html`<div>
          <h3>${icone('rede')}Esqueletos de Bemis–Murcko</h3>
          <div style="display:flex;flex-wrap:wrap;gap:.35rem;max-height:150px;overflow-y:auto;margin-top:.45rem">
            <button type="button" class="chip" data-gx-scaf="-1" aria-pressed="true">Todos</button>
            ${scaffolds.slice(0, 14).map((s) => html`<button type="button" class="chip mono" data-gx-scaf="${s.id}" aria-pressed="false" title="${s.smiles}">${s.smiles.slice(0, 18)}${s.smiles.length > 18 ? '…' : ''} (${s.n})</button>`)}
          </div>
        </div>` : ''}
      </aside>
    </div>

    <div id="gx-area-tabela" class="tabela-wrap" hidden>
      <table class="tabela" id="gx-tabela"></table>
    </div>

    ${gz.consultas?.length ? html`<details class="mais">
      <summary>${icone('dados')}${tr(gz.consultas.length === 1 ? 'Consulta às fontes ({n})' : 'Consultas às fontes ({n})', { n: fmtInt(gz.consultas.length) })}</summary>
      <ul class="refs">${gz.consultas.map((c) => html`<li>${trPartes(c.fonte_nome)} · ${fmtData(c.data)}${c.versao ? ` · ${c.versao}` : ''} · ${tr('licença {l}', { l: trDado(c.licenca) })} · <a href="${c.url}" target="_blank" rel="noopener noreferrer">${tr('abrir a consulta')}</a></li>`)}</ul>
    </details>` : ''}
  </div>`.toString();

  const wrap = raiz.querySelector('#gx-wrap');
  const cv = raiz.querySelector('#gx-cv');
  const ctx = cv.getContext('2d');
  const dica = raiz.querySelector('#gx-dica');
  dica.style.cursor = 'pointer';
  dica.addEventListener('click', () => {
    if (focoIdx >= 0) {
      location.hash = `#/molecula/${mols[focoIdx][ix.id]}`;
    }
  });
  const mira = raiz.querySelector('#gx-mira');
  const legenda = raiz.querySelector('#gx-legenda');
  const contViva = raiz.querySelector('#gx-contagem-viva');
  const selZ = raiz.querySelector('#gx-sel-z');
  const maskVisivel = new Uint8Array(mols.length);
  const telaXY = new Float32Array(mols.length * 2);

  function corDaMolecula(m) {
    if (lente === 'procedencia') {
      return m[ix.coleta_amazonica_declarada] ? '#10b981' : (temaClaro() ? 'rgba(100,116,139,0.34)' : 'rgba(148,163,184,0.25)');
    }
    if (lente === 'potencia') {
      const p = m[ix.max_pch];
      if (p == null) return temaClaro() ? 'rgba(100,116,139,0.34)' : 'rgba(148,163,184,0.25)';
      return p >= 7.5 ? '#fbbf24' : p >= 6.0 ? '#34d399' : '#38bdf8';
    }
    if (lente === 'npl') {
      const n = m[ix.npl];
      if (n == null) return 'rgba(148,163,184,0.3)';
      return n >= 1.2 ? '#10b981' : n >= 0 ? '#22d3ee' : '#f472b6';
    }
    if (lente === 'fase') {
      const f = m[ix.fase] || 0;
      return f >= 4 ? '#f59e0b' : f >= 1 ? '#38bdf8' : (temaClaro() ? 'rgba(100,116,139,0.32)' : 'rgba(148,163,184,0.24)');
    }
    if (lente === 'pains') {
      return m[ix.pains] ? '#ef4444' : '#34d399';
    }
    return corClasse.get(m[ix.classe]) || (temaClaro() ? '#64748b' : '#94a3b8');
  }

  function mostrarDicaMolecula(m, pos) {
    if (!m) {
      dica.hidden = true;
      if (mira) mira.style.display = 'none';
      focoIdx = -1;
      return;
    }
    const PIX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const nomeEx = nomeMolecula(m[ix.nome], m[ix.id]);
    dica.innerHTML = `<strong>${esc(nomeEx)}</strong>
      <div style="color:var(--ink3);font-size:.74rem">${esc([trDado(m[ix.classe]), m[ix.mw] ? `${fmtDec(m[ix.mw])} Da` : ''].filter(Boolean).join(' · '))}</div>
      ${m[ix.estrutura] ? `<img src="${PIX}" data-gx-est="${esc(m[ix.estrutura])}" alt="">` : ''}
      <div style="font-size:.74rem">cLogP ${fmtDec(m[ix.clogp])} · Fsp³ ${fmtDec(m[ix.fsp3])} · NP ${fmtDec(m[ix.npl])}${m[ix.max_pch] != null ? ` · <b>pChEMBL ${fmtDec(m[ix.max_pch])}</b>` : ''}</div>
      <div style="font-size:.72rem;color:var(--verde);margin-top:.2rem">${esc(tr('Clique para abrir o perfil'))}</div>`;
    const im = dica.querySelector('img[data-gx-est]');
    if (im) {
      dados.svgDataUri(im.dataset.gxEst).then((uri) => { if (uri && im.isConnected) im.src = uri; }).catch(() => {});
    }
    const r = wrap.getBoundingClientRect();
    dica.style.left = `${Math.min(r.width - 250, Math.max(10, pos.x + 14))}px`;
    dica.style.top = `${Math.min(r.height - 190, Math.max(10, pos.y - 18))}px`;
    dica.hidden = false;

    if (mira) {
      mira.style.left = `${pos.x}px`;
      mira.style.top = `${pos.y}px`;
      mira.style.display = 'block';
    }
  }

  function esconderDicaMolecula() {
    dica.hidden = true;
    if (mira) mira.style.display = 'none';
    focoIdx = -1;
  }

  // Motor WebGL da vista 3D
  const gx3D = criarGalaxia3D(wrap, {
    nos: mols,
    arestas,
    ix,
    escalaXY: escXY,
    onHover: (m, pos) => {
      focoIdx = pos.idx != null ? pos.idx : mols.indexOf(m);
      mostrarDicaMolecula(m, pos);
    },
    onUnhover: () => {
      esconderDicaMolecula();
    },
    onClick: (m) => {
      location.hash = `#/molecula/${m[ix.id]}`;
    },
    inicialZ: 'fsp3',
  });

  const coresBufferFloat = new Float32Array(mols.length * 3);
  function sincronizarCores3D() {
    if (!gx3D || !gx3D.ativo) return;
    for (let i = 0; i < mols.length; i++) {
      const rgb = parseCorRGB(corDaMolecula(mols[i]));
      coresBufferFloat[i * 3] = rgb[0];
      coresBufferFloat[i * 3 + 1] = rgb[1];
      coresBufferFloat[i * 3 + 2] = rgb[2];
    }
    gx3D.atualizarCores(coresBufferFloat);
  }

  function atualizarLegenda() {
    if (lente === 'classe') {
      legenda.innerHTML = classesTop.map((c) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${corClasse.get(c)};margin-right:4px"></i>${esc(trDado(c))}</span>`).join('');
    } else {
      legenda.innerHTML = LEGENDAS[lente].map(([cor, texto]) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cor};margin-right:4px"></i>${esc(tr(texto))}</span>`).join('');
    }
  }

  function recalcularFiltro() {
    const q = semAcento(buscaQ).trim();
    let vis = 0;
    let unicoVisivel = null;
    for (let i = 0; i < mols.length; i++) {
      const m = mols[i];
      const ok = (m[ix.mw] == null || mwMax >= 1200 || m[ix.mw] <= mwMax)
        && (m[ix.clogp] == null || clogpMax >= 10 || m[ix.clogp] <= clogpMax)
        && (m[ix.tpsa] == null || tpsaMax >= 350 || m[ix.tpsa] <= tpsaMax)
        && (fsp3Min <= 0 || (m[ix.fsp3] != null && m[ix.fsp3] >= fsp3Min))
        && (scafSel < 0 || m[ix.scaf] === scafSel)
        && (!soColeta || m[ix.coleta_amazonica_declarada] === 1)
        && (!q || semAcento(`${m[ix.nome]} bmb ${String(m[ix.id]).padStart(5, '0')} bmb${m[ix.id]} #${m[ix.id]} ${m[ix.classe]}`).includes(q));
      maskVisivel[i] = ok ? 1 : 0;
      if (ok) {
        vis++;
        if (vis === 1) unicoVisivel = m;
      }
    }
    contViva.textContent = tr('{n} de {total} moléculas visíveis', { n: fmtInt(vis), total: fmtInt(mols.length) });

    if (gx3D && gx3D.ativo) {
      gx3D.atualizarMascara(maskVisivel);
      if (vis === 1 && unicoVisivel && q.length >= 4) {
        gx3D.focarMolecula(unicoVisivel);
      }
    }

    if (vista === 'tabela') desenharTabela();
    if (vista === 'canvas') pedirQuadro();
  }

  // Vista 2D em canvas
  let raf = 0;
  function desenhar() {
    raf = 0;
    if (!cv.isConnected || vista !== 'canvas') return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(260, cv.clientWidth || 640);
    const h = Math.max(260, cv.clientHeight || 480);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const claro = temaClaro();
    ctx.fillStyle = claro ? '#f4f0e6' : '#050c09';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + cam.x, cy = h / 2 + cam.y;
    const rEsc = Math.min(w, h) * 0.43 * cam.z;
    ctx.strokeStyle = claro ? 'rgba(15,61,44,0.08)' : 'rgba(52,211,153,0.08)';
    ctx.lineWidth = 1;
    for (const f of [0.35, 0.7, 1.05]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rEsc * f, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = 0; i < mols.length; i++) {
      telaXY[i * 2] = cx + mols[i][ix.x] * rEsc;
      telaXY[i * 2 + 1] = cy - mols[i][ix.y] * rEsc;
    }

    if (mostrarTMAP && arestas.length) {
      ctx.lineWidth = Math.min(1.6, 0.65 * Math.sqrt(cam.z));
      ctx.strokeStyle = claro ? 'rgba(13,108,82,0.16)' : 'rgba(45,212,191,0.15)';
      ctx.beginPath();
      for (let e = 0; e < arestas.length; e++) {
        const [a, b] = arestas[e];
        if (!maskVisivel[a] || !maskVisivel[b]) continue;
        const ax = telaXY[a * 2], ay = telaXY[a * 2 + 1];
        const bx = telaXY[b * 2], by = telaXY[b * 2 + 1];
        if ((ax < -30 && bx < -30) || (ax > w + 30 && bx > w + 30) || (ay < -30 && by < -30) || (ay > h + 30 && by > h + 30)) continue;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }

    const rBase = Math.max(1.8, Math.min(5.8, 2.25 * Math.pow(cam.z, 0.42)));
    const modoDenso = mols.length > 4000 && cam.z < 1.8;
    for (let i = 0; i < mols.length; i++) {
      if (!maskVisivel[i]) continue;
      const sx = telaXY[i * 2], sy = telaXY[i * 2 + 1];
      if (sx < -12 || sx > w + 12 || sy < -12 || sy > h + 12) continue;
      const m = mols[i];
      const cor = corDaMolecula(m);
      const destaque = (m[ix.fase] || 0) >= 4 || (m[ix.max_pch] || 0) >= 7.5;
      if (modoDenso && !destaque) {
        ctx.fillStyle = cor;
        ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4);
        continue;
      }
      const r = destaque ? rBase * 1.45 : rBase;
      if (destaque && !claro) {
        ctx.fillStyle = 'rgba(251,191,36,0.18)';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const destaqueIdx = molFocoFixo >= 0 ? molFocoFixo : focoIdx;
    if (molFocoFixo >= 0 && vizinhosFoco.length) {
      const fx = telaXY[molFocoFixo * 2], fy = telaXY[molFocoFixo * 2 + 1];
      ctx.strokeStyle = claro ? '#0284c7' : '#22d3ee';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (const [vi] of vizinhosFoco) {
        if (!maskVisivel[vi]) continue;
        ctx.moveTo(fx, fy);
        ctx.lineTo(telaXY[vi * 2], telaXY[vi * 2 + 1]);
      }
      ctx.stroke();
      for (const [vi] of vizinhosFoco) {
        if (!maskVisivel[vi]) continue;
        ctx.beginPath();
        ctx.arc(telaXY[vi * 2], telaXY[vi * 2 + 1], rBase * 1.9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (destaqueIdx >= 0 && maskVisivel[destaqueIdx]) {
      const sx = telaXY[destaqueIdx * 2], sy = telaXY[destaqueIdx * 2 + 1];
      ctx.strokeStyle = claro ? '#065f46' : '#fef08a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(sx, sy, rBase * 2.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function pedirQuadro() {
    if (!raf && cv.isConnected && vista === 'canvas') raf = requestAnimationFrame(desenhar);
  }

  function desenharTabela() {
    const tb = raiz.querySelector('#gx-tabela');
    const todas = mols.filter((_, i) => maskVisivel[i]);
    const totalVis = todas.length;
    const vis = todas.slice(0, 120);
    tb.innerHTML = html`<caption>${tr('{n} de {total} moléculas listadas. O CSV traz todas.', { n: fmtInt(vis.length), total: fmtInt(totalVis) })}</caption>
      <thead><tr>${['Molécula', 'Classe química', 'Massa monoisotópica (Da)', 'cLogP', 'TPSA (Å²)', 'Fsp³', 'NP-likeness', 'pChEMBL máximo', 'Táxons'].map((c) => html`<th scope="col">${tr(c)}</th>`)}</tr></thead>
      <tbody>${vis.map((m) => html`<tr>
        <th scope="row"><a href="#/molecula/${m[ix.id]}">${nomeMolecula(m[ix.nome], m[ix.id])}</a></th>
        <td>${trDado(m[ix.classe])}</td>
        <td class="num">${fmtDec(m[ix.mw])}</td>
        <td class="num">${fmtDec(m[ix.clogp])}</td>
        <td class="num">${fmtDec(m[ix.tpsa])}</td>
        <td class="num">${fmtDec(m[ix.fsp3])}</td>
        <td class="num">${fmtDec(m[ix.npl])}</td>
        <td class="num">${fmtDec(m[ix.max_pch])}</td>
        <td class="num">${fmtInt(m[ix.taxa])}</td>
      </tr>`)}</tbody>`.toString();
  }

  function acharPonto2D(px, py) {
    let melhor = -1, dMin = 14 * 14;
    for (let i = 0; i < mols.length; i++) {
      if (!maskVisivel[i]) continue;
      const dx = telaXY[i * 2] - px, dy = telaXY[i * 2 + 1] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < dMin) { dMin = d2; melhor = i; }
    }
    return melhor;
  }

  // Eventos do canvas 2D
  let arrasto2D = null;
  cv.addEventListener('pointerdown', (e) => {
    arrasto2D = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moveu: false };
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (arrasto2D) {
      const dx = e.clientX - arrasto2D.x, dy = e.clientY - arrasto2D.y;
      if (Math.hypot(dx, dy) > 4) arrasto2D.moveu = true;
      if (arrasto2D.moveu) {
        cam.x = arrasto2D.cx + dx;
        cam.y = arrasto2D.cy + dy;
        esconderDicaMolecula();
        pedirQuadro();
        return;
      }
    }
    const idx = acharPonto2D(px, py);
    const mudou = idx !== focoIdx;
    if (mudou) {
      focoIdx = idx;
      pedirQuadro();
    }
    if (idx >= 0) {
      mostrarDicaMolecula(mols[idx], { x: px, y: py });
    } else {
      esconderDicaMolecula();
    }
  });
  cv.addEventListener('pointerup', () => {
    if (arrasto2D && !arrasto2D.moveu && focoIdx >= 0) {
      location.hash = `#/molecula/${mols[focoIdx][ix.id]}`;
    }
    arrasto2D = null;
  });
  cv.addEventListener('pointerleave', () => {
    arrasto2D = null;
    esconderDicaMolecula();
    pedirQuadro();
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const fator = Math.exp(-e.deltaY * 0.0015);
    const nz = Math.max(0.65, Math.min(14, cam.z * fator));
    const k = nz / cam.z;
    cam.x *= k; cam.y *= k; cam.z = nz;
    pedirQuadro();
  }, { passive: false });
  cv.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); cam.z = Math.min(14, cam.z * 1.3); pedirQuadro(); }
    else if (e.key === '-') { e.preventDefault(); cam.z = Math.max(0.65, cam.z / 1.3); pedirQuadro(); }
    else if (e.key === '0') { e.preventDefault(); cam = { x: 0, y: 0, z: 1 }; pedirQuadro(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); cam.x += 40; pedirQuadro(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); cam.x -= 40; pedirQuadro(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cam.y += 40; pedirQuadro(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cam.y -= 40; pedirQuadro(); }
  });

  // Alternador de vistas (3D, 2D, tabela) e controles
  const pag = raiz.querySelector('.obs-pagina') || raiz;
  pag.addEventListener('click', (e) => {
    const bv = e.target.closest('[data-gx-vista]');
    if (bv) {
      vista = bv.getAttribute('data-gx-vista');
      raiz.querySelectorAll('[data-gx-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-gx-vista') === vista)));

      const cv3D = gx3D?.obterCanvas();
      if (cv3D) cv3D.style.display = vista === '3d' ? 'block' : 'none';
      cv.style.display = vista === 'canvas' ? 'block' : 'none';

      raiz.querySelector('#gx-area-canvas').hidden = vista === 'tabela';
      raiz.querySelector('#gx-area-tabela').hidden = vista !== 'tabela';
      const blocoZ = raiz.querySelector('#gx-seletor-z-bloco');
      if (blocoZ) blocoZ.style.display = vista === '3d' ? 'block' : 'none';

      esconderDicaMolecula();
      if (vista === '3d') {
        gx3D?.redimensionar();
        gx3D?.solicitarRedesenho?.();
        gx3D?.pedirQuadro();
      } else if (vista === 'canvas') {
        pedirQuadro();
      } else if (vista === 'tabela') {
        desenharTabela();
      }
      return;
    }

    const bl = e.target.closest('[data-gx-lente]');
    if (bl) {
      lente = bl.getAttribute('data-gx-lente');
      raiz.querySelectorAll('[data-gx-lente]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-gx-lente') === lente)));
      atualizarLegenda();
      sincronizarCores3D();
      if (vista === 'canvas') pedirQuadro();
      return;
    }

    const bs = e.target.closest('[data-gx-scaf]');
    if (bs) {
      scafSel = Number(bs.getAttribute('data-gx-scaf'));
      raiz.querySelectorAll('[data-gx-scaf]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-gx-scaf')) === scafSel)));
      recalcularFiltro();
      if (scafSel >= 0 && gx3D && gx3D.ativo) {
        const primeiro = mols.find((m) => m[ix.scaf] === scafSel);
        if (primeiro) gx3D.focarMolecula(primeiro);
      }
      return;
    }

    const bz = e.target.closest('[data-gx-z]');
    if (bz) {
      const fator = Number(bz.getAttribute('data-gx-z'));
      if (vista === '3d' && gx3D && gx3D.ativo) {
        gx3D.aproximar(fator > 1 ? 0.78 : 1.28);
      } else {
        cam.z = Math.max(0.65, Math.min(14, cam.z * fator));
        pedirQuadro();
      }
      return;
    }

    if (e.target.closest('[data-gx-reset]')) {
      if (vista === '3d' && gx3D && gx3D.ativo) {
        gx3D.resetarCamera();
      } else {
        cam = { x: 0, y: 0, z: 1 };
        pedirQuadro();
      }
      return;
    }

    const bzModo = e.target.closest('[data-gx-eixo-z]');
    if (bzModo) {
      const modo = bzModo.getAttribute('data-gx-eixo-z');
      raiz.querySelectorAll('[data-gx-eixo-z]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-gx-eixo-z') === modo)));
      if (selZ) selZ.value = modo;
      if (gx3D && gx3D.ativo) gx3D.definirEixoZ(modo);
      return;
    }

    if (e.target.closest('#gx-btn-tmap')) {
      mostrarTMAP = !mostrarTMAP;
      raiz.querySelector('#gx-btn-tmap').setAttribute('aria-pressed', String(mostrarTMAP));
      if (gx3D && gx3D.ativo) gx3D.alternarFilamentos(mostrarTMAP);
      if (vista === 'canvas') pedirQuadro();
      return;
    }

    const bViz = e.target.closest('[data-gx-ir-mol]');
    if (bViz) {
      focarPorMolId(Number(bViz.dataset.gxIrMol), true);
      return;
    }

    if (e.target.closest('[data-gx-fechar-foco]')) {
      limparFocoMol(true);
    }
  });

  if (selZ) {
    selZ.addEventListener('change', (e) => {
      const modo = e.target.value;
      raiz.querySelectorAll('[data-gx-eixo-z]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-gx-eixo-z') === modo)));
      if (gx3D && gx3D.ativo) gx3D.definirEixoZ(modo);
    });
  }

  raiz.querySelector('#gx-q').addEventListener('input', (e) => { buscaQ = e.target.value; recalcularFiltro(); });
  raiz.querySelector('#gx-coleta').addEventListener('change', (e) => { soColeta = e.target.checked; recalcularFiltro(); });
  raiz.querySelector('#gx-mw').addEventListener('input', (e) => { mwMax = Number(e.target.value); raiz.querySelector('#gx-mw-v').textContent = `≤ ${mwMax} Da`; recalcularFiltro(); });
  raiz.querySelector('#gx-lp').addEventListener('input', (e) => { clogpMax = Number(e.target.value); raiz.querySelector('#gx-lp-v').textContent = `≤ ${fmtDec(clogpMax)}`; recalcularFiltro(); });
  raiz.querySelector('#gx-tp').addEventListener('input', (e) => { tpsaMax = Number(e.target.value); raiz.querySelector('#gx-tp-v').textContent = `≤ ${tpsaMax} Å²`; recalcularFiltro(); });
  raiz.querySelector('#gx-f3').addEventListener('input', (e) => { fsp3Min = Number(e.target.value); raiz.querySelector('#gx-f3-v').textContent = `≥ ${fmtDec(fsp3Min)}`; recalcularFiltro(); });

  raiz.querySelector('#gx-csv').addEventListener('click', () => {
    const vis = mols.filter((_, i) => maskVisivel[i]);
    baixarCSV(
      'biomapabrasil_espaco_quimico.csv',
      ['molecula_id', 'nome', 'classe', 'massa_monoisotopica_da', 'clogp', 'tpsa_a2', 'fsp3', 'qed', 'np_likeness', 'max_pchembl', 'fase_clinica', 'alerta_pains', 'coleta_amazonica_declarada', 'x', 'y', 'fontes'],
      vis.map((m) => [m[ix.id], m[ix.nome], m[ix.classe], m[ix.mw], m[ix.clogp], m[ix.tpsa], m[ix.fsp3], m[ix.qed], m[ix.npl], m[ix.max_pch], m[ix.fase], m[ix.pains],
        m[ix.coleta_amazonica_declarada], m[ix.x], m[ix.y], (m[ix.fontes] || []).join(';')])
    );
    anunciar(tr('CSV baixado.'));
  });

  const onTema = () => {
    sincronizarCores3D();
    if (vista === 'canvas') pedirQuadro();
  };
  window.addEventListener('bmb:tema', onTema, signal ? { signal } : undefined);

  const ro = new ResizeObserver(() => {
    if (vista === '3d') gx3D?.redimensionar();
    if (vista === 'canvas') pedirQuadro();
  });
  ro.observe(wrap);
  signal?.addEventListener('abort', () => {
    ro.disconnect();
    gx3D?.destruir();
  }, { once: true });

  const cardFoco = raiz.querySelector('#gx-foco-mol');
  function limparFocoMol(atualizarUrl = false) {
    molFocoFixo = -1;
    vizinhosFoco = [];
    if (cardFoco) { cardFoco.hidden = true; cardFoco.innerHTML = ''; }
    if (atualizarUrl) history.replaceState(null, '', '#/galaxia');
    if (vista === 'canvas') pedirQuadro();
  }
  function focarPorMolId(molId, atualizarUrl = false) {
    const i = idxPorId.get(Number(molId));
    if (i == null || !cardFoco) { limparFocoMol(false); return; }
    const m = mols[i];
    const viz = [];
    for (const e of arestas) {
      if (e[0] === i) viz.push([e[1], e[2] ?? null]);
      else if (e[1] === i) viz.push([e[0], e[2] ?? null]);
    }
    viz.sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));
    molFocoFixo = i;
    focoIdx = i;
    vizinhosFoco = viz.slice(0, 10);
    cam.z = 3.2;
    const w_ = Math.max(260, wrap.clientWidth || 640);
    const h_ = Math.max(260, wrap.clientHeight || 480);
    const rEsc = Math.min(w_, h_) * 0.43 * cam.z;
    cam.x = -m[ix.x] * rEsc;
    cam.y = m[ix.y] * rEsc;
    gx3D?.focarMolecula?.(m);

    const nomeF = nomeMolecula(m[ix.nome], m[ix.id]);
    const metaF = [trDado(m[ix.classe]), m[ix.mw] ? `${fmtDec(m[ix.mw])} Da` : '', m[ix.max_pch] != null ? `pChEMBL ${fmtDec(m[ix.max_pch])}` : ''].filter(Boolean).join(' · ');
    cardFoco.innerHTML = html`<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:.75rem">
        <div>
          <p class="eyebrow" style="margin:0">${icone('galaxia')}${tr('Foco no espaço químico')} · BMB ${String(m[ix.id]).padStart(5, '0')}</p>
          <h2 style="margin:.18rem 0">${nomeF}</h2>
          ${metaF ? html`<p class="fonte-linha" style="margin:0">${metaF}</p>` : ''}
        </div>
        <div class="acoes-catalogo">
          <a class="btn sec" href="#/molecula/${m[ix.id]}">${icone('molecula')}${tr('Abrir perfil')}</a>
          <button type="button" class="btn sec" data-gx-fechar-foco="1">${icone('fechar')}${tr('Fechar')}</button>
        </div>
      </div>
      ${vizinhosFoco.length ? html`<p class="fonte-linha" style="margin:.65rem 0 .35rem">${tr('Vizinhos estruturais diretos na árvore TMAP (clique para focar):')}</p>
        <div class="chips">${vizinhosFoco.map(([vi, sim]) => {
          const vm = mols[vi];
          return html`<button type="button" class="chip" data-gx-ir-mol="${vm[ix.id]}">${nomeMolecula(vm[ix.nome], vm[ix.id])}${sim != null ? ` · Tanimoto ${fmtDec(sim, 2)}` : ''}</button>`;
        })}</div>` : html`<p class="fonte-linha">${tr('Nenhum vizinho TMAP registrado neste recorte.')}</p>`}`.toString();
    cardFoco.hidden = false;
    if (atualizarUrl) history.replaceState(null, '', `#/galaxia?mol=${m[ix.id]}`);
    if (vista === 'canvas') pedirQuadro();
  }

  atualizarLegenda();
  sincronizarCores3D();
  recalcularFiltro();
  const molInicial = params?.get('mol');
  if (molInicial) requestAnimationFrame(() => { if (raiz.isConnected) focarPorMolId(molInicial, false); });
}
