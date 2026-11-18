// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Quimiotaxonomia (`#/filoquimica`): árvore taxonômica radial (reino, filo, classe, ordem, família, gênero,
// espécie) com cinco anéis de dados por espécie:
//   1. classe química dominante
//   2. maior pChEMBL de molécula isolada
//   3. completude média dos registros
//   4. categoria de ameaça (IUCN ou MMA)
//   5. endemismo no Brasil ou predomínio amazônico
import {
  html, bruto, esc, icone, tr, trn, trDado, trPartes, fmtInt, fmtDec, fmtData, semAcento, anunciar, baixarCSV, ehEndemica, ehAmeacada, siglaAmeaca,
  rotuloEndemismo, comPredominio, GRUPO_POR_CHAVE,
} from '../util.js';
import * as dados from '../dados.js';
import { garantirEstilosObservatorio } from './estilos_obs.js';

const CORES_CLASSE_QUIM = [
  '#34d399', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6',
  '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#38bdf8',
];

const COR_GRUPO = {
  planta: '#34d399',
  animal_peconhento: '#fbbf24',
  fungo: '#a78bfa',
};

const COR_AMEACA = {
  CR: '#ef4444',
  EN: '#f97316',
  VU: '#eab308',
  NT: '#84cc16',
  LC: '#334155',
};

function arcoPolarSVG(cx, cy, rInt, rExt, a0, a1) {
  const delta = Math.max(0.002, a1 - a0);
  const aFim = a0 + delta;
  const x0i = cx + rInt * Math.cos(a0), y0i = cy + rInt * Math.sin(a0);
  const x1i = cx + rInt * Math.cos(aFim), y1i = cy + rInt * Math.sin(aFim);
  const x0e = cx + rExt * Math.cos(a0), y0e = cy + rExt * Math.sin(a0);
  const x1e = cx + rExt * Math.cos(aFim), y1e = cy + rExt * Math.sin(aFim);
  const grande = delta > Math.PI ? 1 : 0;
  return `M${x0i.toFixed(2)},${y0i.toFixed(2)} L${x0e.toFixed(2)},${y0e.toFixed(2)} A${rExt},${rExt} 0 ${grande} 1 ${x1e.toFixed(2)},${y1e.toFixed(2)} L${x1i.toFixed(2)},${y1i.toFixed(2)} A${rInt},${rInt} 0 ${grande} 0 ${x0i.toFixed(2)},${y0i.toFixed(2)} Z`;
}

function clonarFiltrado(no, grupoFiltro, qNorm) {
  const especies = (no.especies || []).filter((sp) => {
    if (grupoFiltro !== 'todos' && sp.grupo !== grupoFiltro) return false;
    if (qNorm) {
      const texto = semAcento(`${sp.nome} ${sp.popular || ''} ${(sp.classes || []).map((c) => c[0]).join(' ')}`);
      if (!texto.includes(qNorm)) return false;
    }
    return true;
  });
  const filhos = [];
  for (const f of no.filhos || []) {
    const fc = clonarFiltrado(f, grupoFiltro, qNorm);
    if (fc) filhos.push(fc);
  }
  if (!especies.length && !filhos.length) return null;
  return { nome: no.nome, nivel: no.nivel, filhos, especies };
}

function anotarFolhas(no, prof = 0, acum = []) {
  no.prof = prof;
  const ini = acum.length;
  for (const f of no.filhos || []) {
    anotarFolhas(f, prof + 1, acum);
  }
  for (const sp of no.especies || []) {
    acum.push({ sp, pai: no });
  }
  no.i0 = ini;
  no.i1 = acum.length - 1;
  no.nFolhas = acum.length - ini;
  return acum;
}

export async function montarFiloquimica(raiz, { signal } = {}) {
  garantirEstilosObservatorio();
  raiz.innerHTML = `<div class="obs-pagina"><p class="carregando" role="status">${esc(tr('Carregando…'))}</p></div>`;
  const fq = await dados.viz('filoquimica');
  if (signal?.aborted) return;
  const arvoreRaiz = fq.arvore;
  const aneisMeta = fq.aneis || [];

  // Reúne as espécies para as contagens, as cores das classes químicas, a tabela e o CSV
  const todasFolhas = [];
  const contClasses = new Map();
  function varrer(no, trilha = []) {
    const proxTrilha = no.nivel === 'raiz' ? trilha : [...trilha, no.nome];
    for (const f of no.filhos || []) varrer(f, proxTrilha);
    for (const sp of no.especies || []) {
      todasFolhas.push({ ...sp, taxonomia: proxTrilha });
      const dom = sp.classes?.[0]?.[0];
      if (dom) contClasses.set(dom, (contClasses.get(dom) || 0) + 1);
    }
  }
  varrer(arvoreRaiz);

  const classesOrdenadas = [...contClasses.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const corPorClasse = new Map(classesOrdenadas.slice(0, 10).map((c, i) => [c, CORES_CLASSE_QUIM[i % CORES_CLASSE_QUIM.length]]));

  const nComPotencia = todasFolhas.filter((f) => f.max_pch != null).length;
  const nAmeacadas = todasFolhas.filter((f) => ehAmeacada(f.iucn) || ehAmeacada(f.mma)).length;

  let vista = 'arvore';
  let caminhoClado = []; // índices/nomes a partir de arvoreRaiz
  let grupoFiltro = 'todos';
  let buscaQ = '';
  let zoom = 1;
  let panX = 0, panY = 0;
  let folhaSelecionada = todasFolhas.find((f) => f.n_mol > 0) || todasFolhas[0] || null;

  raiz.innerHTML = html`<div class="obs-pagina">
    <div class="obs-topo">
      <div>
        <p class="eyebrow">QUIMIOTAXONOMIA · GBIF · LOTUS · NUBBE-DB · CHEMBL · IUCN · MMA</p>
        <h1>Quimiotaxonomia</h1>
        <p class="sub">Árvore taxonômica circular das espécies do recorte, com cinco anéis de dados por espécie. Um clique em um nó interno abre o clado. Um clique em uma espécie abre o perfil.</p>
      </div>
      <div class="obs-acoes-topo">
        <div class="alternador-vista" role="group" aria-label="${tr('Modo de exibição')}">
          <button type="button" data-fq-vista="arvore" aria-pressed="true">${icone('arvore')}Árvore</button>
          <button type="button" data-fq-vista="tabela" aria-pressed="false">${icone('lista')}Tabela</button>
        </div>
        <button type="button" class="btn sec" id="fq-csv">${icone('baixar')}Baixar CSV</button>
      </div>
    </div>

    <div class="obs-kpis">
      <div class="obs-kpi"><b>${fmtInt(todasFolhas.length)}</b><span>espécies na árvore</span></div>
      <div class="obs-kpi"><b>${fmtInt(classesOrdenadas.length)}</b><span>classes químicas dominantes</span></div>
      <div class="obs-kpi"><b>${fmtInt(nComPotencia)}</b><span>espécies com pChEMBL de molécula isolada</span></div>
      <div class="obs-kpi"><b>${fmtInt(nAmeacadas)}</b><span>espécies em categoria de ameaça (VU, EN ou CR) na IUCN ou no MMA</span></div>
    </div>

    <div id="fq-area-arvore" class="obs-grade">
      <div class="obs-palco-card">
        <div class="obs-hud-canto">
          <nav id="fq-migalhas" aria-label="${tr('Clado em foco')}" style="display:flex;flex-wrap:wrap;gap:.25rem;align-items:center"></nav>
          <div class="obs-controles-flutuantes" role="group" aria-label="${tr('Zoom')}">
            <button type="button" data-fq-z="1.3" aria-label="${tr('Aproximar')}">+</button>
            <button type="button" data-fq-z="0.77" aria-label="${tr('Afastar')}">−</button>
            <button type="button" id="fq-reset-cam" aria-label="${tr('Centralizar')}">0</button>
          </div>
        </div>
        <div class="obs-canvas-wrap" id="fq-svg-wrap" style="height:clamp(480px,68vh,700px)">
          <svg id="fq-svg" class="obs-svg-full" viewBox="-460 -460 920 920" role="img" aria-label="${tr('Árvore taxonômica radial com cinco anéis de dados')}"></svg>
          <div class="obs-dica-flutuante" id="fq-dica" hidden></div>
        </div>
        <div class="obs-portao-banner">
          ${icone('info')}
          <div>Anéis, de dentro para fora: classe química dominante; maior pChEMBL de molécula isolada; completude média dos registros; categoria de ameaça (IUCN ou MMA); endemismo no Brasil ou predomínio amazônico.</div>
        </div>
      </div>

      <aside class="obs-painel-lat">
        <div>
          <h2>${icone('lupa')}Filtro</h2>
          <input type="search" id="fq-busca" placeholder="${tr('Espécie, nome popular ou classe química')}" aria-label="${tr('Buscar na árvore')}" style="width:100%;margin-top:.45rem;padding:.45rem .68rem;border-radius:9px;border:1px solid var(--linha2);background:var(--bg2);color:var(--ink);font-size:.83rem">
          <div class="chips" role="group" aria-label="${tr('Grupos biológicos')}" style="margin-top:.5rem">
            <button type="button" class="chip" data-fq-grupo="todos" aria-pressed="true">Todos</button>
            <button type="button" class="chip" data-fq-grupo="planta" aria-pressed="false">${icone('planta')}Plantas</button>
            <button type="button" class="chip" data-fq-grupo="animal_peconhento" aria-pressed="false">${icone('animal')}Animais com toxinas</button>
            <button type="button" class="chip" data-fq-grupo="fungo" aria-pressed="false">${icone('fungo')}Fungos</button>
          </div>
        </div>

        <div id="fq-card-folha" style="background:var(--bg2);border:1px solid var(--linha);border-radius:12px;padding:.8rem"></div>

        <div>
          <h3>Anel 1: classe química dominante</h3>
          <div style="display:flex;flex-direction:column;gap:.28rem;margin-top:.4rem;font-size:.77rem">
            ${classesOrdenadas.slice(0, 8).map((c) => html`<div style="display:flex;justify-content:space-between;align-items:center;gap:.4rem">
              <span style="display:flex;align-items:center;gap:.4rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <i style="display:inline-block;width:10px;height:10px;border-radius:3px;flex:none;background:${corPorClasse.get(c) || '#64748b'}"></i>${trDado(c)}
              </span>
              <span class="mono" style="color:var(--ink3)">${fmtInt(contClasses.get(c))}</span>
            </div>`)}
          </div>
        </div>

        <details>
          <summary style="font-size:.8rem;cursor:pointer;color:var(--ink2)">Definição dos anéis</summary>
          <ol style="margin:.45rem 0 0;padding-left:1.15rem;font-size:.76rem;color:var(--ink2);display:flex;flex-direction:column;gap:.3rem">
            ${aneisMeta.map((a) => html`<li><strong>${trDado(a.titulo)}:</strong> ${trDado(a.nota)}</li>`)}
          </ol>
        </details>
      </aside>
    </div>

    <div id="fq-area-tabela" class="tabela-wrap" hidden>
      <table class="tabela">
        <caption class="so-leitor">Espécies e dados dos anéis</caption>
        <thead>
          <tr>
            <th scope="col">Espécie</th>
            <th scope="col">Reino e família</th>
            <th scope="col">Classe química dominante</th>
            <th scope="col">Moléculas</th>
            <th scope="col">pChEMBL máximo</th>
            <th scope="col">Completude</th>
            <th scope="col">IUCN / MMA</th>
            <th scope="col">Endemismo no Brasil</th>
          </tr>
        </thead>
        <tbody>
          ${todasFolhas.map((sp) => html`<tr>
            <td><a href="#/especie/${sp.gbif}"><em>${sp.nome}</em></a>${sp.popular ? html` <small>(${sp.popular})</small>` : ''}</td>
            <td>${[sp.taxonomia?.[0], sp.taxonomia?.[4]].filter(Boolean).join(' › ') || '–'}</td>
            <td>${trDado(sp.classes?.[0]?.[0]) || '–'}</td>
            <td class="num">${fmtInt(sp.n_mol)}</td>
            <td class="num">${fmtDec(sp.max_pch)}</td>
            <td class="num">${fmtDec(sp.prontidao)}</td>
            <td>${[sp.iucn && `IUCN ${sp.iucn}`, sp.mma && `MMA ${siglaAmeaca(sp.mma)}`].filter(Boolean).join(' · ') || '–'}</td>
            <td>${rotuloEndemismo(sp.endemismo) || '–'}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>

    ${fq.consultas?.length ? html`<details class="mais">
      <summary>${icone('dados')}${trn(fq.consultas.length, 'Consulta às fontes ({n})', 'Consultas às fontes ({n})')}</summary>
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th scope="col">Fonte</th><th scope="col">Licença</th><th scope="col">Versão</th><th scope="col">Data</th><th scope="col">Endereço da consulta</th></tr></thead>
          <tbody>${fq.consultas.map((c) => html`<tr>
            <td>${trPartes(c.fonte_nome)}</td>
            <td>${trDado(c.licenca)}</td>
            <td>${c.versao || '–'}</td>
            <td>${fmtData(c.data)}</td>
            <td style="word-break:break-all"><a href="${c.url}" target="_blank" rel="noopener noreferrer">${c.url}</a></td>
          </tr>`)}</tbody>
        </table>
      </div>
    </details>` : ''}
  </div>`;

  const svg = raiz.querySelector('#fq-svg');
  const svgWrap = raiz.querySelector('#fq-svg-wrap');
  const elMigalhas = raiz.querySelector('#fq-migalhas');
  const elCard = raiz.querySelector('#fq-card-folha');
  const elDica = raiz.querySelector('#fq-dica');

  function obterSubarvoreFoco() {
    let atual = arvoreRaiz;
    for (const passo of caminhoClado) {
      const prox = (atual.filhos || []).find((f) => f.nome === passo);
      if (!prox) break;
      atual = prox;
    }
    return atual;
  }

  function aplicarViewBox() {
    const metade = 460 / zoom;
    svg.setAttribute('viewBox', `${(-metade + panX).toFixed(1)} ${(-metade + panY).toFixed(1)} ${(metade * 2).toFixed(1)} ${(metade * 2).toFixed(1)}`);
  }

  function renderCardFolha(sp) {
    if (!sp) {
      elCard.innerHTML = `<p class="vazio" style="margin:0">${esc(tr('Selecione uma espécie na árvore.'))}</p>`;
      return;
    }
    const grp = GRUPO_POR_CHAVE[sp.grupo] || GRUPO_POR_CHAVE.planta;
    elCard.innerHTML = html`
      <div style="display:flex;flex-direction:column;gap:.38rem">
        <span class="eyebrow">${tr(grp.rotulo).toUpperCase()}</span>
        <strong style="font-size:1rem"><em>${sp.nome}</em></strong>
        ${sp.popular ? html`<span translate="no" style="font-size:.82rem;color:var(--ink2)">${sp.popular}</span>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin:.25rem 0;font-size:.77rem">
          <div style="background:var(--surface);padding:.4rem .55rem;border-radius:8px;border:1px solid var(--linha)">
            <span style="color:var(--ink3);display:block">${tr('Moléculas')}</span>
            <b class="mono">${fmtInt(sp.n_mol)}</b>
          </div>
          <div style="background:var(--surface);padding:.4rem .55rem;border-radius:8px;border:1px solid var(--linha)">
            <span style="color:var(--ink3);display:block">${tr('pChEMBL máximo')}</span>
            <b class="mono">${fmtDec(sp.max_pch)}</b>
          </div>
          <div style="background:var(--surface);padding:.4rem .55rem;border-radius:8px;border:1px solid var(--linha)">
            <span style="color:var(--ink3);display:block">${tr('Completude')}</span>
            <b class="mono">${fmtDec(sp.prontidao)}</b>
          </div>
          <div style="background:var(--surface);padding:.4rem .55rem;border-radius:8px;border:1px solid var(--linha)">
            <span style="color:var(--ink3);display:block">${tr('IUCN / MMA')}</span>
            <b class="mono">${[sp.iucn, siglaAmeaca(sp.mma)].filter(Boolean).join(' / ') || '–'}</b>
          </div>
        </div>
        ${sp.classes?.length ? html`<div style="font-size:.76rem;color:var(--ink2)">
          <strong>${tr('Classes químicas')}:</strong> ${sp.classes.map((c) => `${trDado(c[0])} (${c[1]})`).join(', ')}
        </div>` : ''}
        <a href="#/especie/${sp.gbif}" class="btn" style="margin-top:.25rem;justify-content:center">${tr('Abrir perfil da espécie')}</a>
      </div>`.toString();
  }

  function renderMigalhas() {
    const itens = [tr('Todos os táxons'), ...caminhoClado];
    elMigalhas.innerHTML = itens.map((nome, idx) => html`
      ${idx > 0 ? bruto('<span style="color:var(--ink3);font-size:.75rem">›</span>') : ''}
      <button type="button" class="obs-pill" data-migalha="${idx}" style="cursor:pointer;border-color:${idx === itens.length - 1 ? 'var(--verde)' : 'var(--linha2)'}">${trDado(nome)}</button>
    `).join('');
    elMigalhas.querySelectorAll('[data-migalha]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.getAttribute('data-migalha'));
        caminhoClado = caminhoClado.slice(0, idx);
        zoom = 1; panX = 0; panY = 0;
        renderArvore();
      });
    });
  }

  function renderArvore() {
    renderMigalhas();
    const focoBruto = obterSubarvoreFoco();
    const sub = clonarFiltrado(focoBruto, grupoFiltro, semAcento(buscaQ.trim()));
    if (!sub) {
      svg.innerHTML = `<text x="0" y="0" text-anchor="middle" fill="currentColor" font-size="15">${esc(tr('Nenhum registro para este filtro.'))}</text>`;
      return;
    }

    const folhas = anotarFolhas(sub, 0, []);
    const N = Math.max(1, folhas.length);
    const maxProf = Math.max(1, ...folhas.map((f) => f.pai.prof + 1));

    const rInternoMax = 248;
    const passoAng = (Math.PI * 2 * 0.965) / N;
    const angOffset = -Math.PI / 2 + (Math.PI * 2 * 0.0175);

    const angFolha = (i) => angOffset + (i + 0.5) * passoAng;
    const raioNivel = (prof) => (prof / maxProf) * rInternoMax;

    const ramosSVG = [];
    const nosCladoSVG = [];

    function desenharClado(no, trilhaRel = []) {
      const aMeio = (angFolha(no.i0) + angFolha(no.i1)) / 2;
      const rNo = raioNivel(no.prof);
      const xNo = rNo * Math.cos(aMeio);
      const yNo = rNo * Math.sin(aMeio);

      if (no.prof > 0 && no.nFolhas >= 2) {
        nosCladoSVG.push(
          `<g class="fq-no-clado" data-trilha="${esc(JSON.stringify(trilhaRel))}" style="cursor:pointer">` +
          `<circle cx="${xNo.toFixed(2)}" cy="${yNo.toFixed(2)}" r="${no.nFolhas > 15 ? 4.4 : 3.1}" fill="#22d3ee" fill-opacity="0.82" stroke="rgba(8,20,16,.8)" stroke-width="1"/>` +
          `<title>${esc(trn(no.nFolhas, '{nome}: {n} espécie. Abrir clado.', '{nome}: {n} espécies. Abrir clado.', { nome: trDado(no.nome) }))}</title></g>`
        );
      }

      for (const f of no.filhos || []) {
        const af = (angFolha(f.i0) + angFolha(f.i1)) / 2;
        const rf = raioNivel(f.prof);
        const xArc = rNo * Math.cos(af), yArc = rNo * Math.sin(af);
        const xf = rf * Math.cos(af), yf = rf * Math.sin(af);
        const delta = Math.abs(af - aMeio);
        const varredura = af >= aMeio ? 1 : 0;
        const grande = delta > Math.PI ? 1 : 0;
        ramosSVG.push(
          `<path d="M${xNo.toFixed(2)},${yNo.toFixed(2)} A${rNo.toFixed(2)},${rNo.toFixed(2)} 0 ${grande} ${varredura} ${xArc.toFixed(2)},${yArc.toFixed(2)} L${xf.toFixed(2)},${yf.toFixed(2)}" fill="none" stroke="rgba(148,163,184,0.34)" stroke-width="1.05"/>`
        );
        desenharClado(f, [...trilhaRel, f.nome]);
      }

      for (let k = 0; k < (no.especies || []).length; k += 1) {
        const idxGlobal = no.i1 - (no.especies.length - 1 - k);
        const sp = folhas[idxGlobal]?.sp;
        if (!sp) continue;
        const af = angFolha(idxGlobal);
        const xArc = rNo * Math.cos(af), yArc = rNo * Math.sin(af);
        const xf = rInternoMax * Math.cos(af), yf = rInternoMax * Math.sin(af);
        const corG = COR_GRUPO[sp.grupo] || '#34d399';
        const delta = Math.abs(af - aMeio);
        const varredura = af >= aMeio ? 1 : 0;
        const grande = delta > Math.PI ? 1 : 0;
        ramosSVG.push(
          `<path d="M${xNo.toFixed(2)},${yNo.toFixed(2)} A${rNo.toFixed(2)},${rNo.toFixed(2)} 0 ${grande} ${varredura} ${xArc.toFixed(2)},${yArc.toFixed(2)} L${xf.toFixed(2)},${yf.toFixed(2)}" fill="none" stroke="${corG}" stroke-opacity="0.46" stroke-width="0.95"/>`
        );
      }
    }

    desenharClado(sub, []);

    // Cinco anéis externos e rótulos das espécies quando N <= 95
    const aneisSVG = [];
    const rotulosSVG = [];
    const mostrarRotulos = N <= 95;
    const meiaFatia = Math.min(0.055, passoAng * 0.44);

    folhas.forEach(({ sp }, i) => {
      const a = angFolha(i);
      const a0 = a - meiaFatia;
      const a1 = a + meiaFatia;

      // Anel 1 (254..274): classe química dominante
      const clsDom = sp.classes?.[0]?.[0];
      const cor1 = clsDom ? (corPorClasse.get(clsDom) || '#2dd4bf') : 'rgba(148,163,184,0.16)';

      // Anel 2 (278..304): potência pChEMBL (4..10 -> altura radial)
      const pch = sp.max_pch;
      const fracPch = pch != null ? Math.min(1, Math.max(0.18, (pch - 4) / 5.5)) : 0;
      const r2Fim = 278 + fracPch * 26;

      // Anel 3 (308..324): completude média dos registros (0..1)
      const pr = sp.prontidao ?? 0;
      const opPr = sp.prontidao != null ? (0.25 + pr * 0.75).toFixed(2) : '0.10';

      // Anel 4 (328..342): ameaça IUCN / MMA
      const catAm = ['CR', 'EN', 'VU', 'NT'].find((c) => sp.iucn === c || siglaAmeaca(sp.mma) === c) || (sp.iucn === 'LC' ? 'LC' : null);
      const cor4 = catAm ? COR_AMEACA[catAm] : 'rgba(148,163,184,0.12)';

      // Anel 5 (346..360): endemismo BR / predomínio amazônico
      const cor5 = ehEndemica(sp.endemismo) ? '#22d3ee' : (comPredominio(sp.predominio) ? '#10b981' : 'rgba(148,163,184,0.14)');

      aneisSVG.push(
        `<g class="fq-folha" data-idx="${i}" style="cursor:pointer">` +
        `<path d="${arcoPolarSVG(0, 0, 254, 274, a0, a1)}" fill="${cor1}"/>` +
        (fracPch > 0
          ? `<path d="${arcoPolarSVG(0, 0, 278, r2Fim, a0, a1)}" fill="#fbbf24"/>`
          : `<path d="${arcoPolarSVG(0, 0, 278, 283, a0, a1)}" fill="rgba(148,163,184,0.10)"/>`) +
        `<path d="${arcoPolarSVG(0, 0, 308, 324, a0, a1)}" fill="#38bdf8" fill-opacity="${opPr}"/>` +
        `<path d="${arcoPolarSVG(0, 0, 328, 342, a0, a1)}" fill="${cor4}"/>` +
        `<path d="${arcoPolarSVG(0, 0, 346, 360, a0, a1)}" fill="${cor5}"/>` +
        `</g>`
      );

      if (mostrarRotulos) {
        const graus = (a * 180) / Math.PI;
        const virar = graus > 90 && graus < 270;
        const rot = virar ? graus + 180 : graus;
        const anc = virar ? 'end' : 'start';
        const dx = virar ? -366 : 366;
        const nomeCurto = sp.nome.replace(/^([A-Z])[a-z]+\s+/, '$1. ');
        rotulosSVG.push(
          `<text class="fq-rotulo" data-idx="${i}" transform="rotate(${rot.toFixed(2)})" x="${dx}" y="3" text-anchor="${anc}" font-size="${N <= 45 ? 9.5 : 7.8}" font-style="italic" fill="currentColor" opacity="0.86" style="cursor:pointer">${esc(nomeCurto)}</text>`
        );
      }
    });

    // Guias circulares dos anéis e núcleo central
    const guias = [254, 278, 308, 328, 346, 360].map(
      (r) => `<circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(148,163,184,0.13)" stroke-width="0.7"/>`
    ).join('');

    svg.innerHTML =
      `<circle cx="0" cy="0" r="24" fill="rgba(16,185,129,0.14)" stroke="#34d399" stroke-width="1.2"/>` +
      `<text x="0" y="-2" text-anchor="middle" fill="currentColor" font-size="9.5" font-weight="600">${esc((caminhoClado.length ? trDado(sub.nome) : tr('Todos os táxons')).slice(0, 18))}</text>` +
      `<text x="0" y="10" text-anchor="middle" fill="currentColor" opacity="0.68" font-size="8">${esc(trn(N, '{n} espécie', '{n} espécies'))}</text>` +
      guias +
      ramosSVG.join('') +
      aneisSVG.join('') +
      rotulosSVG.join('') +
      nosCladoSVG.join('');

    aplicarViewBox();

    svg.querySelectorAll('.fq-no-clado').forEach((g) => {
      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const rel = JSON.parse(g.getAttribute('data-trilha') || '[]');
        caminhoClado = [...caminhoClado, ...rel];
        zoom = 1; panX = 0; panY = 0;
        renderArvore();
        anunciar(tr('Clado: {nome}', { nome: trDado(caminhoClado[caminhoClado.length - 1]) }));
      });
    });

    const ligarEventosFolha = (el) => {
      el.addEventListener('pointerenter', (ev) => {
        const sp = folhas[Number(el.getAttribute('data-idx'))]?.sp;
        if (!sp) return;
        folhaSelecionada = sp;
        renderCardFolha(sp);
        const rect = svgWrap.getBoundingClientRect();
        elDica.hidden = false;
        elDica.style.left = `${Math.min(rect.width - 250, Math.max(8, ev.clientX - rect.left + 14))}px`;
        elDica.style.top = `${Math.min(rect.height - 130, Math.max(8, ev.clientY - rect.top + 14))}px`;
        elDica.innerHTML = html`
          <strong><em>${sp.nome}</em></strong>
          ${sp.popular ? html`<div translate="no" style="color:var(--ink2)">${sp.popular}</div>` : ''}
          <div class="mono" style="font-size:.73rem;margin-top:.2rem">${trn(sp.n_mol, '{n} molécula', '{n} moléculas')}${sp.classes?.[0]?.[0] ? ` · ${trDado(sp.classes[0][0])}` : ''}</div>
          ${sp.max_pch != null ? html`<div style="font-size:.73rem;color:var(--ouro)">${tr('pChEMBL máximo')}: ${fmtDec(sp.max_pch)}</div>` : ''}
        `.toString();
      });
      el.addEventListener('pointerleave', () => { elDica.hidden = true; });
      el.addEventListener('click', () => {
        const sp = folhas[Number(el.getAttribute('data-idx'))]?.sp;
        if (sp) location.hash = `#/especie/${sp.gbif}`;
      });
    };

    svg.querySelectorAll('.fq-folha, .fq-rotulo').forEach(ligarEventosFolha);
  }

  // Arrasto e roda do mouse no SVG
  let arrastando = false, iniX = 0, iniY = 0;
  svgWrap.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.fq-folha, .fq-no-clado, .fq-rotulo')) return;
    arrastando = true;
    iniX = ev.clientX;
    iniY = ev.clientY;
  });
  const winOpts = signal ? { signal } : undefined;
  window.addEventListener('pointermove', (ev) => {
    if (!arrastando) return;
    const escala = (920 / zoom) / Math.max(320, svgWrap.clientWidth);
    panX -= (ev.clientX - iniX) * escala;
    panY -= (ev.clientY - iniY) * escala;
    iniX = ev.clientX;
    iniY = ev.clientY;
    aplicarViewBox();
  }, winOpts);
  window.addEventListener('pointerup', () => { arrastando = false; }, winOpts);

  svgWrap.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoom = Math.min(5, Math.max(0.65, zoom * (ev.deltaY < 0 ? 1.15 : 0.87)));
    aplicarViewBox();
  }, { passive: false });

  raiz.querySelectorAll('[data-fq-z]').forEach((b) => {
    b.addEventListener('click', () => {
      zoom = Math.min(5, Math.max(0.65, zoom * Number(b.getAttribute('data-fq-z'))));
      aplicarViewBox();
    });
  });

  raiz.querySelector('#fq-reset-cam').addEventListener('click', () => {
    zoom = 1; panX = 0; panY = 0;
    aplicarViewBox();
  });

  raiz.querySelectorAll('[data-fq-grupo]').forEach((b) => {
    b.addEventListener('click', () => {
      grupoFiltro = b.getAttribute('data-fq-grupo');
      raiz.querySelectorAll('[data-fq-grupo]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      caminhoClado = [];
      renderArvore();
    });
  });

  raiz.querySelector('#fq-busca').addEventListener('input', (ev) => {
    buscaQ = ev.target.value;
    renderArvore();
  });

  raiz.querySelectorAll('[data-fq-vista]').forEach((b) => {
    b.addEventListener('click', () => {
      vista = b.getAttribute('data-fq-vista');
      raiz.querySelectorAll('[data-fq-vista]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      raiz.querySelector('#fq-area-arvore').hidden = vista !== 'arvore';
      raiz.querySelector('#fq-area-tabela').hidden = vista !== 'tabela';
    });
  });

  raiz.querySelector('#fq-csv').addEventListener('click', () => {
    baixarCSV(
      'biomapabrasil_quimiotaxonomia.csv',
      ['gbif_key', 'especie', 'nome_popular', 'grupo', 'reino', 'filo', 'classe', 'ordem', 'familia', 'genero', 'moleculas', 'classe_quimica_dominante', 'max_pchembl', 'completude_media', 'iucn', 'mma', 'endemismo_br', 'predominio_al'],
      todasFolhas.map((sp) => [
        sp.gbif, sp.nome, sp.popular || '', sp.grupo,
        sp.taxonomia?.[0] || '', sp.taxonomia?.[1] || '', sp.taxonomia?.[2] || '',
        sp.taxonomia?.[3] || '', sp.taxonomia?.[4] || '', sp.taxonomia?.[5] || '',
        sp.n_mol, sp.classes?.[0]?.[0] || '', sp.max_pch ?? '', sp.prontidao ?? '',
        sp.iucn || '', sp.mma || '', sp.endemismo || '', sp.predominio || '',
      ]),
    );
    anunciar(tr('CSV baixado.'));
  });

  renderCardFolha(folhaSelecionada);
  renderArvore();
}
