// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Folha de estilo das visualizações (espaço químico, fluxos e linhagens, estratos florestais, quimiotaxonomia)
// e do visualizador 3D. Injetada na primeira abertura de uma delas, fora do orçamento da primeira tela.

let injetado = false;

export function garantirEstilosObservatorio() {
  if (injetado || typeof document === 'undefined' || document.getElementById('bmb-estilos-obs')) {
    injetado = true;
    return;
  }
  injetado = true;
  const st = document.createElement('style');
  st.id = 'bmb-estilos-obs';
  st.textContent = `
  .obs-pagina {
    max-width: 1420px;
    margin: 0 auto;
    padding: 1.35rem clamp(.9rem, 2.5vw, 2.2rem) 3rem;
  }
  .obs-topo {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
    margin-bottom: 1.1rem;
  }
  .obs-topo h1 {
    margin: .18rem 0 .35rem;
    font-family: var(--serif, Fraunces, Georgia, serif);
    font-size: clamp(1.65rem, 3vw, 2.4rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
  }
  .obs-topo .sub {
    max-width: 68ch;
    margin: 0;
    color: var(--ink2);
    font-size: .95rem;
    line-height: 1.55;
  }
  .obs-acoes-topo {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
  }
  .obs-kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
    gap: .65rem;
    margin-bottom: 1rem;
  }
  .obs-kpi {
    background: var(--surface);
    border: 1px solid var(--linha);
    border-radius: 14px;
    padding: .75rem .95rem;
    display: flex;
    flex-direction: column;
    gap: .15rem;
  }
  .obs-kpi b {
    font-family: var(--mono, monospace);
    font-size: 1.28rem;
    color: var(--ink);
  }
  .obs-kpi span {
    font-size: .78rem;
    color: var(--ink3);
  }
  .obs-grade {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .obs-grade { grid-template-columns: minmax(0, 1fr); }
  }
  .obs-palco-card,
  .obs-painel-lat {
    min-width: 0;
  }
  .obs-palco-card {
    position: relative;
    background: radial-gradient(120% 95% at 50% 18%, rgba(24, 92, 68, 0.16), transparent 70%), var(--surface);
    border: 1px solid var(--linha2);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 44px rgba(0,0,0,.18);
  }
  :root[data-tema="claro"] .obs-palco-card {
    background: radial-gradient(120% 95% at 50% 18%, rgba(16, 118, 82, 0.07), transparent 70%), var(--surface);
    box-shadow: 0 10px 28px rgba(20,30,24,.08);
  }
  .obs-canvas-wrap {
    position: relative;
    width: 100%;
    height: clamp(430px, 64vh, 660px);
    touch-action: none;
    user-select: none;
  }
  .obs-canvas-wrap canvas,
  .obs-canvas-wrap svg.obs-svg-full {
    display: block;
    width: 100%;
    height: 100%;
  }
  .obs-hud-canto {
    position: absolute;
    top: .75rem;
    left: .75rem;
    right: .75rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: .5rem;
    pointer-events: none;
    z-index: 3;
  }
  .obs-hud-canto > * { pointer-events: auto; }
  .obs-pill {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    font-size: .75rem;
    font-family: var(--mono, monospace);
    padding: .32rem .68rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid var(--linha2);
    color: var(--ink2);
  }
  .obs-controles-flutuantes {
    display: inline-flex;
    gap: .3rem;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid var(--linha2);
    padding: .25rem;
    border-radius: 999px;
  }
  .obs-controles-flutuantes button {
    border: 0;
    background: transparent;
    color: var(--ink);
    padding: .3rem .58rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: .78rem;
    display: inline-flex;
    align-items: center;
    gap: .25rem;
  }
  .obs-controles-flutuantes button:hover,
  .obs-controles-flutuantes button[aria-pressed="true"] {
    background: var(--verde);
    color: var(--on-verde);
  }
  .obs-painel-lat {
    background: var(--surface);
    border: 1px solid var(--linha);
    border-radius: 16px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: .85rem;
  }
  .obs-painel-lat h2, .obs-painel-lat h3 {
    margin: 0;
    font-size: .95rem;
    display: flex;
    align-items: center;
    gap: .4rem;
  }
  .obs-faixa-slider {
    display: flex;
    flex-direction: column;
    gap: .24rem;
    font-size: .8rem;
  }
  .obs-faixa-slider label {
    display: flex;
    justify-content: space-between;
    color: var(--ink2);
    font-weight: 500;
  }
  .obs-faixa-slider input[type="range"] {
    width: 100%;
    accent-color: var(--verde);
  }
  .obs-check {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    margin-top: .5rem;
    font-size: .8rem;
    color: var(--ink2);
  }
  .obs-check input {
    accent-color: var(--verde);
  }
  .obs-dica-flutuante {
    position: absolute;
    z-index: 6;
    max-width: 280px;
    background: color-mix(in srgb, var(--surface) 96%, transparent);
    backdrop-filter: blur(12px);
    border: 1px solid var(--linha2);
    border-radius: 12px;
    padding: .65rem .8rem;
    box-shadow: 0 12px 28px rgba(0,0,0,.28);
    font-size: .8rem;
    pointer-events: none;
  }
  .obs-dica-flutuante img {
    display: block;
    width: 110px;
    height: 76px;
    object-fit: contain;
    background: #fff;
    border-radius: 8px;
    padding: 4px;
    margin: .4rem 0;
    border: 1px solid var(--linha);
  }

  /* ── Nota sob o palco das visualizações ── */
  .obs-portao-banner {
    display: flex;
    align-items: flex-start;
    gap: .65rem;
    padding: .75rem 1rem;
    border-top: 1px solid var(--linha);
    background: color-mix(in srgb, var(--alerta-bg) 55%, var(--surface));
    color: var(--ink);
    font-size: .82rem;
  }
  .obs-linhagens-grade {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
    gap: .9rem;
    margin-top: 1rem;
  }
  .obs-linhagem-card {
    background: var(--surface);
    border: 1px solid var(--linha2);
    border-radius: 15px;
    padding: .95rem;
    display: flex;
    flex-direction: column;
    gap: .65rem;
  }
  .obs-linhagem-card p { margin: 0; font-size: .84rem; line-height: 1.5; }
  .obs-linhagem-card .passagem { margin: 0; }
  .obs-linhagem-par {
    display: flex;
    flex-wrap: wrap;
    gap: .2rem .5rem;
    align-items: baseline;
    font-weight: 600;
  }
  .obs-linhagem-par span { color: var(--ouro); }
  .obs-pagina > .sec-titulo { margin-top: 1.7rem; }
  .obs-pagina > details.mais { margin-top: 1.2rem; }
  .obs-pagina .quebra-url { word-break: break-all; }
  .fx-svg-host { width: 100%; overflow-x: auto; padding: .75rem .5rem 0; }
  .obs-nota {
    border-radius: 12px;
    margin-top: .35rem;
    border: 1px solid var(--linha);
    font-size: .76rem;
    line-height: 1.45;
  }

  /* ── Estratos florestais ── */
  .floresta-layout {
    display: grid;
    grid-template-columns: minmax(310px, 460px) minmax(0, 1fr);
    gap: 1rem;
    align-items: stretch;
  }
  @media (max-width: 960px) {
    .floresta-layout { grid-template-columns: 1fr; }
  }
  .floresta-coluna-vertical {
    display: flex;
    flex-direction: column;
    gap: .45rem;
    background: linear-gradient(180deg, rgba(34,211,238,.09) 0%, rgba(16,185,129,.12) 48%, rgba(180,83,9,.11) 84%, rgba(8,145,178,.16) 100%), var(--surface);
    border: 1px solid var(--linha2);
    border-radius: 18px;
    padding: .9rem;
  }
  .estrato-btn {
    text-align: left;
    border: 1px solid var(--linha);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    color: var(--ink);
    border-radius: 12px;
    padding: .7rem .85rem;
    cursor: pointer;
    transition: border-color .18s, transform .18s, background .18s;
    display: flex;
    flex-direction: column;
    gap: .35rem;
  }
  .estrato-btn:hover,
  .estrato-btn[aria-pressed="true"] {
    border-color: var(--verde);
    background: color-mix(in srgb, var(--ok-bg) 52%, var(--surface));
  }
  .estrato-btn-topo {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: .5rem;
  }
  .estrato-barra-quim {
    display: flex;
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--bg2);
    gap: 1px;
  }
  .estrato-nao-inf {
    border-style: dashed;
    margin-top: .35rem;
  }
  .floresta-topo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: .5rem;
    margin-bottom: .2rem;
  }
  .floresta-topo strong { font-size: .86rem; display: flex; align-items: center; gap: .35rem; }
  .floresta-topo .chip { font-size: .73rem; padding: .2rem .55rem; }
  .estrato-btn-topo strong { font-size: .88rem; display: flex; align-items: center; gap: .4rem; }
  .estrato-btn-topo .mono { font-size: .74rem; color: var(--ink2); white-space: nowrap; }
  .estrato-cor { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .estrato-btn-sub { font-size: .73rem; color: var(--ink3); }
  .floresta-layout .obs-painel-lat { gap: 1rem; }
  .floresta-filtros {
    display: flex;
    flex-wrap: wrap;
    gap: .55rem;
    align-items: center;
    padding-bottom: .65rem;
    border-bottom: 1px solid var(--linha);
  }
  .campo-obs {
    flex: 1 1 220px;
    min-width: 180px;
    padding: .45rem .7rem;
    border-radius: 9px;
    border: 1px solid var(--linha2);
    background: var(--bg2);
    color: var(--ink);
    font-size: .84rem;
  }
  .check-obs { display: inline-flex; align-items: center; gap: .35rem; font-size: .8rem; color: var(--ink2); cursor: pointer; }
  .floresta-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem; flex-wrap: wrap; }
  .floresta-cab h2 { font-family: var(--serif, Georgia, serif); font-size: 1.35rem; margin: .15rem 0; display: block; }
  .floresta-cab p { margin: 0; color: var(--ink2); font-size: .86rem; }
  .floresta-classes { background: var(--bg2); border-radius: 12px; padding: .75rem .85rem; border: 1px solid var(--linha); }
  .floresta-classes > strong { font-size: .79rem; color: var(--ink2); display: block; margin-bottom: .45rem; }
  .floresta-classes-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .4rem .85rem; font-size: .76rem; }
  .floresta-classe-topo { display: flex; justify-content: space-between; gap: .35rem; margin-bottom: 2px; }
  .floresta-classe-topo span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .floresta-classe-trilho { height: 5px; border-radius: 99px; background: var(--surface); }
  .floresta-classe-trilho div { height: 100%; border-radius: 99px; }
  .floresta-lista {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(255px, 1fr));
    gap: .65rem;
    max-height: 620px;
    overflow-y: auto;
    padding-right: .2rem;
  }
  .floresta-lista > p { grid-column: 1 / -1; margin: 0; }
  .floresta-item {
    display: flex;
    flex-direction: column;
    gap: .3rem;
    padding: .72rem .85rem;
    border-radius: 12px;
    border: 1px solid var(--linha);
    background: var(--bg2);
    text-decoration: none;
    color: var(--ink);
  }
  .floresta-item:hover { border-color: var(--verde); }
  .floresta-item-topo { display: flex; justify-content: space-between; gap: .4rem; align-items: baseline; }
  .floresta-item-topo strong { font-size: .88rem; }
  .floresta-item-topo .mono { font-size: .73rem; color: var(--verde); white-space: nowrap; }
  .floresta-item-sub { font-size: .78rem; color: var(--ink2); }
  .floresta-item-selos { display: flex; flex-wrap: wrap; gap: .28rem; margin-top: .15rem; }
  .floresta-item-selos .badge { font-size: .69rem; }

  /* ── Visualizador 3D de estruturas ── */
  .lab3d-bloco {
    border: 1px solid var(--linha2);
    border-radius: 14px;
    background: var(--surface);
    overflow: hidden;
    margin-top: .55rem;
    box-shadow: 0 8px 26px rgba(0, 0, 0, .18);
  }
  .lab3d-bloco.lab3d-expandido {
    position: fixed;
    inset: .85rem;
    z-index: 950;
    margin: 0;
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    box-shadow: 0 28px 80px rgba(0, 0, 0, .62);
  }
  .lab3d-barra {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: .45rem;
    padding: .5rem .7rem;
    border-bottom: 1px solid var(--linha);
    background: var(--bg2);
    font-size: .77rem;
  }
  .lab3d-subbarra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: .4rem .6rem;
    padding: .42rem .7rem;
    border-bottom: 1px solid var(--linha);
    background: color-mix(in srgb, var(--surface) 82%, var(--bg2));
    font-size: .73rem;
  }
  .lab3d-grupo {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .26rem;
  }
  .lab3d-rotulo {
    font-size: .68rem;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--ink3);
    font-weight: 600;
    margin-right: .14rem;
  }
  .lab3d-chip {
    appearance: none;
    border: 1px solid var(--linha2);
    background: var(--surface);
    color: var(--ink2);
    border-radius: 7px;
    padding: .2rem .48rem;
    font-size: .72rem;
    font-weight: 500;
    line-height: 1.25;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: .25rem;
    transition: border-color .15s, background .15s, color .15s;
  }
  .lab3d-chip svg { width: 13px; height: 13px; }
  .lab3d-chip:hover {
    border-color: var(--verde);
    color: var(--ink);
  }
  .lab3d-chip[aria-pressed="true"],
  .lab3d-chip.ativo {
    border-color: var(--verde);
    background: color-mix(in srgb, var(--ok-bg) 68%, var(--surface));
    color: var(--ok-ink);
    font-weight: 600;
  }
  .lab3d-btn-sdf {
    appearance: none;
    border: 1px solid var(--linha2);
    background: var(--surface);
    color: var(--ink);
    border-radius: 8px;
    padding: .24rem .58rem;
    font-size: .74rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    text-decoration: none;
    transition: transform .14s, border-color .14s, background .14s;
  }
  .lab3d-btn-sdf svg { width: 14px; height: 14px; }
  .lab3d-btn-sdf:hover {
    border-color: var(--verde);
    transform: translateY(-1px);
  }
  .lab3d-btn-sdf.exp {
    border-color: var(--verde);
    background: var(--verde);
    color: var(--on-verde);
  }
  .lab3d-btn-sdf.exp:hover {
    filter: brightness(1.06);
  }
  .lab3d-palco {
    position: relative;
    width: 100%;
    height: 365px;
    background:
      radial-gradient(ellipse 68% 58% at 50% 42%, rgba(22, 101, 74, 0.25) 0%, rgba(12, 34, 31, 0.46) 52%, rgba(4, 9, 8, 0.98) 100%);
    touch-action: none;
    overflow: hidden;
    user-select: none;
  }
  .lab3d-bloco.lab3d-expandido .lab3d-palco {
    flex: 1 1 auto;
    height: auto;
    min-height: 320px;
  }
  :root[data-tema="claro"] .lab3d-palco {
    background:
      radial-gradient(ellipse 70% 60% at 50% 42%, #fcfbf7 0%, #efe9dc 62%, #ded6c5 100%);
  }
  .lab3d-palco canvas.lab3d-gl,
  .lab3d-palco canvas.lab3d-hud {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }
  .lab3d-palco canvas.lab3d-hud {
    cursor: grab;
  }
  .lab3d-palco canvas.lab3d-hud:active { cursor: grabbing; }
  .lab3d-palco.modo-regua canvas.lab3d-hud { cursor: crosshair; }
  .lab3d-inspetor {
    position: absolute;
    left: .65rem;
    bottom: .58rem;
    z-index: 4;
    max-width: calc(100% - 1.3rem);
    padding: .26rem .58rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid var(--linha2);
    color: var(--ink);
    font-size: .73rem;
    font-family: var(--mono, ui-monospace, monospace);
    pointer-events: none;
    box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
  }
  .lab3d-calibre-barra {
    position: absolute;
    top: .55rem;
    left: .65rem;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: .4rem;
    flex-wrap: wrap;
    padding: .25rem .55rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid var(--verde);
    color: var(--ink);
    font-size: .73rem;
  }
  .lab3d-telemetria {
    display: flex;
    flex-wrap: wrap;
    gap: .35rem .8rem;
    padding: .4rem .75rem;
    border-top: 1px solid var(--linha);
    background: var(--bg2);
    font-size: .72rem;
    color: var(--ink2);
    font-family: var(--mono, ui-monospace, monospace);
  }
  .lab3d-telemetria b {
    color: var(--ink);
    font-weight: 600;
  }
  .lab3d-rodape {
    padding: .5rem .75rem;
    font-size: .75rem;
    color: var(--ink2);
    border-top: 1px solid var(--linha);
    display: flex;
    flex-direction: column;
    gap: .28rem;
  }
  .lab3d-legenda-plddt {
    display: flex;
    flex-wrap: wrap;
    gap: .48rem;
    align-items: center;
    font-size: .72rem;
  }
  .lab3d-legenda-plddt i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 3px;
    vertical-align: -1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .estrato-btn, .lab3d-chip, .lab3d-btn-sdf { transition: none !important; transform: none !important; }
  }
  `;
  document.head.appendChild(st);
}
