// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Estratos florestais (`#/floresta`): espécies do recorte por estrato vertical da floresta (emergente, dossel,
// sub-bosque, lianas e epífitas, solo e serrapilheira, ambiente aquático, estrato não informado), com as
// classes químicas das moléculas relatadas em cada estrato.
import {
  html, bruto, esc, icone, tr, trn, trDado, trPartes, trTermos, fmtInt, fmtData, semAcento, anunciar, baixarCSV, ehEndemica, ehAmeacada, siglaAmeaca,
  rotuloEndemismo, GRUPO_POR_CHAVE,
} from '../util.js';
import * as dados from '../dados.js';
import { garantirEstilosObservatorio } from './estilos_obs.js';

const CORES_QUIM = [
  '#34d399', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6',
  '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#38bdf8',
];
const COR_ESTRATO = {
  emergente: '#38bdf8', dossel: '#34d399', sub_bosque: '#10b981', liana_epifita: '#a78bfa',
  solo_serrapilheira: '#d97706', aquatico_ripario: '#06b6d4', nao_informado: '#94a3b8',
};
const LIMITE_CARTOES = 120;

export async function montarFloresta(raiz, { signal } = {}) {
  garantirEstilosObservatorio();
  raiz.innerHTML = `<div class="obs-pagina"><p class="carregando" role="status">${esc(tr('Carregando…'))}</p></div>`;
  const fl = await dados.viz('floresta');
  if (signal?.aborted || !raiz.isConnected) return;
  const estratos = fl.estratos || [];

  const mapaCorClasse = new Map();
  let idxCor = 0;
  for (const est of estratos) {
    for (const c of est.classes_quimicas || []) {
      if (!mapaCorClasse.has(c.classe)) {
        mapaCorClasse.set(c.classe, CORES_QUIM[idxCor % CORES_QUIM.length]);
        idxCor += 1;
      }
    }
  }

  const totalEspecies = estratos.reduce((s, e) => s + e.n_especies, 0);
  const naoInf = estratos.find((e) => e.id === 'nao_informado')?.n_especies || 0;
  const comEstrato = totalEspecies - naoInf;
  const totalRelMol = estratos.reduce((s, e) => s + e.n_relacoes_moleculares, 0);

  let vista = 'corte';
  let estratoSel = estratos.find((e) => e.id !== 'nao_informado' && e.n_especies > 0)?.id || (estratos[0]?.id ?? 'todos');
  let grupoFiltro = 'todos';
  let apenasEndemicas = false;
  let buscaQ = '';

  const todasLinhasPlanas = [];
  for (const est of estratos) {
    for (const sp of est.especies || []) {
      todasLinhasPlanas.push({ estrato_id: est.id, estrato_titulo: est.titulo, ...sp });
    }
  }

  raiz.innerHTML = html`<div class="obs-pagina">
    <div class="obs-topo">
      <div>
        <p class="eyebrow">ESTRATOS · FLORA E FUNGA DO BRASIL · CTFB · GBIF</p>
        <h1>Estratos florestais</h1>
        <p class="sub">Espécies do recorte por estrato vertical da floresta, com as classes químicas das moléculas relatadas em cada estrato.</p>
      </div>
      <div class="obs-acoes-topo">
        <div class="alternador-vista" role="group" aria-label="${tr('Modo de exibição')}">
          <button type="button" data-fl-vista="corte" aria-pressed="true">${icone('floresta')}Perfil vertical</button>
          <button type="button" data-fl-vista="tabela" aria-pressed="false">${icone('lista')}Tabela</button>
        </div>
        <button type="button" class="btn sec" id="fl-csv">${icone('baixar')}Baixar CSV</button>
      </div>
    </div>

    <div class="obs-kpis">
      <div class="obs-kpi"><b>${fmtInt(comEstrato)}</b><span>espécies com estrato informado</span></div>
      <div class="obs-kpi"><b>${fmtInt(naoInf)}</b><span>espécies sem estrato informado na fonte</span></div>
      <div class="obs-kpi"><b>${fmtInt(totalRelMol)}</b><span>pares espécie–molécula</span></div>
    </div>

    <div id="fl-area-corte" class="floresta-layout">
      <aside class="floresta-coluna-vertical" aria-label="${tr('Estratos')}">
        <div class="floresta-topo">
          <strong>${icone('floresta')}Estratos</strong>
          <button type="button" class="chip" id="fl-btn-todos" aria-pressed="${estratoSel === 'todos' ? 'true' : 'false'}">${tr('Todos ({n})', { n: fmtInt(totalEspecies) })}</button>
        </div>

        ${estratos.map((est) => {
          const somaTop = (est.classes_quimicas || []).reduce((s, c) => s + c.n, 0) || 1;
          return html`<button type="button"
            class="estrato-btn ${est.id === 'nao_informado' ? 'estrato-nao-inf' : ''}"
            data-estrato="${est.id}"
            aria-pressed="${estratoSel === est.id ? 'true' : 'false'}">
            <div class="estrato-btn-topo">
              <strong><span aria-hidden="true" class="estrato-cor" style="background:${COR_ESTRATO[est.id] || COR_ESTRATO.nao_informado}"></span>${trDado(est.titulo)}</strong>
              <span class="mono">${trn(est.n_especies, '{n} espécie', '{n} espécies')}</span>
            </div>
            <div class="estrato-btn-sub">${trn(est.n_relacoes_moleculares, '{n} par espécie–molécula', '{n} pares espécie–molécula')}</div>
            ${est.classes_quimicas?.length ? html`<div class="estrato-barra-quim" aria-hidden="true">
              ${est.classes_quimicas.map((c) => bruto(
                `<span title="${esc(trDado(c.classe))}: ${c.n}" style="width:${Math.max(4, (c.n / somaTop) * 100).toFixed(1)}%;background:${mapaCorClasse.get(c.classe) || '#34d399'}"></span>`
              ))}
            </div>` : ''}
          </button>`;
        })}

        ${fl.aviso_metodologico ? html`<div class="obs-portao-banner obs-nota">
          ${icone('info')}
          <div>${trDado(fl.aviso_metodologico)}</div>
        </div>` : ''}
      </aside>

      <section class="obs-painel-lat" aria-live="polite">
        <div id="fl-cabecalho-estrato"></div>

        <div class="floresta-filtros">
          <input type="search" id="fl-busca" class="campo-obs" placeholder="${tr('Espécie, nome popular, família ou forma de vida')}" aria-label="${tr('Filtrar espécies do estrato')}">
          <div class="chips" role="group" aria-label="${tr('Grupos biológicos')}">
            <button type="button" class="chip" data-fl-grupo="todos" aria-pressed="true">Todos</button>
            <button type="button" class="chip" data-fl-grupo="planta" aria-pressed="false">${icone('planta')}Plantas</button>
            <button type="button" class="chip" data-fl-grupo="animal_peconhento" aria-pressed="false">${icone('animal')}Animais com toxinas</button>
            <button type="button" class="chip" data-fl-grupo="fungo" aria-pressed="false">${icone('fungo')}Fungos</button>
          </div>
          <label class="check-obs"><input type="checkbox" id="fl-endemicas"> Endêmicas do Brasil</label>
        </div>

        <div id="fl-assinatura-quimica"></div>
        <div id="fl-lista-especies" class="floresta-lista"></div>
      </section>
    </div>

    <div id="fl-area-tabela" class="tabela-wrap" hidden>
      <table class="tabela">
        <caption class="so-leitor">Espécies por estrato vertical</caption>
        <thead>
          <tr>
            <th scope="col">Estrato</th>
            <th scope="col">Espécie</th>
            <th scope="col">Grupo</th>
            <th scope="col">Família</th>
            <th scope="col">Forma de vida e habitat</th>
            <th scope="col">Endemismo no Brasil</th>
            <th scope="col">Conservação</th>
            <th scope="col">Moléculas</th>
            <th scope="col">Fonte do estrato</th>
          </tr>
        </thead>
        <tbody>
          ${todasLinhasPlanas.map((sp) => html`<tr>
            <td>${trDado(sp.estrato_titulo)}</td>
            <td><a href="#/especie/${sp.gbif}"><em>${sp.nome}</em></a>${sp.popular ? html` <small>(${sp.popular})</small>` : ''}</td>
            <td>${tr(GRUPO_POR_CHAVE[sp.grupo]?.rotulo || sp.grupo)}</td>
            <td>${sp.familia || '–'}</td>
            <td>${trTermos(sp.forma_vida) || '–'}</td>
            <td>${rotuloEndemismo(sp.endemismo) || '–'}</td>
            <td>${[sp.iucn && `IUCN ${sp.iucn}`, sp.mma && `MMA ${siglaAmeaca(sp.mma)}`].filter(Boolean).join(' · ') || '–'}</td>
            <td class="num">${fmtInt(sp.moleculas)}</td>
            <td>${trDado(sp.fonte_checklist) || '–'}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>

    ${fl.consultas?.length ? html`<details class="mais">
      <summary>${icone('dados')}${trn(fl.consultas.length, 'Consulta às fontes ({n})', 'Consultas às fontes ({n})')}</summary>
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th scope="col">Fonte</th><th scope="col">Licença</th><th scope="col">Versão</th><th scope="col">Data</th><th scope="col">Endereço da consulta</th></tr></thead>
          <tbody>${fl.consultas.map((c) => html`<tr>
            <td>${trPartes(c.fonte_nome)}</td>
            <td>${trDado(c.licenca)}</td>
            <td>${c.versao || '–'}</td>
            <td>${fmtData(c.data)}</td>
            <td class="quebra-url"><a href="${c.url}" target="_blank" rel="noopener noreferrer">${c.url}</a></td>
          </tr>`)}</tbody>
        </table>
      </div>
    </details>` : ''}
  </div>`;

  const elCab = raiz.querySelector('#fl-cabecalho-estrato');
  const elQuim = raiz.querySelector('#fl-assinatura-quimica');
  const elLista = raiz.querySelector('#fl-lista-especies');
  const btnTodos = raiz.querySelector('#fl-btn-todos');

  function obterFiltradas() {
    const q = semAcento(buscaQ.trim());
    const base = estratoSel === 'todos'
      ? todasLinhasPlanas
      : (estratos.find((e) => e.id === estratoSel)?.especies || []).map((sp) => ({
          estrato_id: estratoSel,
          estrato_titulo: estratos.find((e) => e.id === estratoSel)?.titulo || '',
          ...sp,
        }));
    return base.filter((sp) => {
      if (grupoFiltro !== 'todos' && sp.grupo !== grupoFiltro) return false;
      if (apenasEndemicas && !ehEndemica(sp.endemismo)) return false;
      if (q) {
        const alvo = semAcento(`${sp.nome} ${sp.popular || ''} ${sp.familia || ''} ${sp.forma_vida || ''}`);
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }

  function renderDetalhe() {
    const estObj = estratos.find((e) => e.id === estratoSel);
    const filtradas = obterFiltradas();
    if (estObj) {
      elCab.innerHTML = html`
        <div class="floresta-cab">
          <div>
            <h2>${trDado(estObj.titulo)}</h2>
            <p>${trDado(estObj.descricao)}</p>
          </div>
          <span class="obs-pill">${tr(estObj.n_especies === 1 ? '{n} de {total} espécie' : '{n} de {total} espécies', { n: fmtInt(filtradas.length), total: fmtInt(estObj.n_especies) })}</span>
        </div>`.toString();

      const topQ = estObj.classes_quimicas || [];
      const maxN = Math.max(1, ...topQ.map((c) => c.n));
      elQuim.innerHTML = topQ.length ? html`
        <div class="floresta-classes">
          <strong>${tr('Classes químicas mais frequentes no estrato')}</strong>
          <div class="floresta-classes-grade">
            ${topQ.map((c) => html`<div>
              <div class="floresta-classe-topo">
                <span>${trDado(c.classe)}</span>
                <b class="mono">${fmtInt(c.n)}</b>
              </div>
              <div class="floresta-classe-trilho">
                ${bruto(`<div style="width:${Math.max(5, (c.n / maxN) * 100).toFixed(1)}%;background:${mapaCorClasse.get(c.classe) || '#34d399'}"></div>`)}
              </div>
            </div>`)}
          </div>
        </div>`.toString() : '';
    } else {
      elCab.innerHTML = html`
        <div class="floresta-cab">
          <div><h2>${tr('Todos os estratos')}</h2></div>
          <span class="obs-pill">${trn(filtradas.length, '{n} espécie', '{n} espécies')}</span>
        </div>`.toString();
      elQuim.innerHTML = '';
    }

    if (!filtradas.length) {
      elLista.innerHTML = `<p class="vazio">${esc(tr('Nenhum registro para este filtro.'))}</p>`;
      return;
    }

    elLista.innerHTML = filtradas.slice(0, LIMITE_CARTOES).map((sp) => {
      const grp = GRUPO_POR_CHAVE[sp.grupo] || GRUPO_POR_CHAVE.planta;
      return html`<a href="#/especie/${sp.gbif}" class="floresta-item">
        <div class="floresta-item-topo">
          <strong>${icone(grp.icone)} <em>${sp.nome}</em></strong>
          <span class="mono">${trn(sp.moleculas, '{n} molécula', '{n} moléculas')}</span>
        </div>
        <span class="floresta-item-sub">${sp.popular ? `${sp.popular} · ` : ''}${sp.familia || tr(grp.rotulo)}</span>
        ${sp.forma_vida ? html`<span class="floresta-item-sub">${trTermos(sp.forma_vida)}</span>` : ''}
        <div class="floresta-item-selos">
          ${ehEndemica(sp.endemismo) ? html`<span class="badge ok">${tr('Endêmica do Brasil')}</span>` : ''}
          ${ehAmeacada(sp.mma) ? html`<span class="badge alerta">MMA ${siglaAmeaca(sp.mma)}</span>` : ''}
          ${sp.aprovado ? html`<span class="badge alerta">${tr('Fármaco aprovado')}</span>` : ''}
        </div>
      </a>`;
    }).join('') + (filtradas.length > LIMITE_CARTOES
      ? `<p class="fonte-linha">${esc(tr('{n} de {total} espécies listadas. A tabela traz todas.', { n: fmtInt(LIMITE_CARTOES), total: fmtInt(filtradas.length) }))}</p>` : '');
  }

  function atualizarBotoesEstrato() {
    btnTodos.setAttribute('aria-pressed', estratoSel === 'todos' ? 'true' : 'false');
    raiz.querySelectorAll('[data-estrato]').forEach((b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-estrato') === estratoSel ? 'true' : 'false');
    });
  }

  btnTodos.addEventListener('click', () => {
    estratoSel = 'todos';
    atualizarBotoesEstrato();
    renderDetalhe();
    anunciar(tr('Todos os estratos'));
  });

  raiz.querySelectorAll('[data-estrato]').forEach((b) => {
    b.addEventListener('click', () => {
      estratoSel = b.getAttribute('data-estrato');
      atualizarBotoesEstrato();
      renderDetalhe();
      anunciar(trDado(estratos.find((e) => e.id === estratoSel)?.titulo || estratoSel));
    });
  });

  raiz.querySelectorAll('[data-fl-grupo]').forEach((b) => {
    b.addEventListener('click', () => {
      grupoFiltro = b.getAttribute('data-fl-grupo');
      raiz.querySelectorAll('[data-fl-grupo]').forEach((x) => {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      renderDetalhe();
    });
  });

  raiz.querySelector('#fl-endemicas').addEventListener('change', (ev) => {
    apenasEndemicas = ev.target.checked;
    renderDetalhe();
  });

  raiz.querySelector('#fl-busca').addEventListener('input', (ev) => {
    buscaQ = ev.target.value;
    renderDetalhe();
  });

  raiz.querySelectorAll('[data-fl-vista]').forEach((b) => {
    b.addEventListener('click', () => {
      vista = b.getAttribute('data-fl-vista');
      raiz.querySelectorAll('[data-fl-vista]').forEach((x) => {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      raiz.querySelector('#fl-area-corte').hidden = vista !== 'corte';
      raiz.querySelector('#fl-area-tabela').hidden = vista !== 'tabela';
    });
  });

  raiz.querySelector('#fl-csv').addEventListener('click', () => {
    const filtradas = obterFiltradas();
    baixarCSV(
      'biomapabrasil_estratos_florestais.csv',
      ['estrato_id', 'estrato_titulo', 'gbif_key', 'especie', 'nome_popular', 'grupo', 'familia', 'forma_vida', 'endemismo_br', 'iucn', 'mma', 'moleculas', 'fonte_checklist'],
      filtradas.map((s) => [
        s.estrato_id, s.estrato_titulo, s.gbif, s.nome, s.popular || '', s.grupo,
        s.familia || '', s.forma_vida || '', s.endemismo || '', s.iucn || '', s.mma || '', s.moleculas, s.fonte_checklist || '',
      ]),
    );
    anunciar(tr('CSV baixado.'));
  });

  renderDetalhe();
}
