// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Mapa do Brasil: relevo WebGL sincronizado ao mapa vetorial SVG de estados, rios e lacunas.
// Zoom e arrasto por mouse, toque e teclado. O mesmo conteúdo existe em lista no painel (alternativa acessível).
import { esc, fmtInt, fmtFixo, tr, trn, conexaoLenta, mapaParaGeo, fmtCoord } from './util.js';
import { montarAtmosferaMapa, movimentoPausado } from './constelacao.js';

const NS = 'http://www.w3.org/2000/svg';
const ZOOM_MAX = 14;
const ROTULOS_SOL = ['Iluminação do relevo: noroeste', 'Iluminação do relevo: nordeste', 'Iluminação do relevo: sudeste', 'Iluminação do relevo: sudoeste'];

function criar(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
}

export function criarMapa(raiz, geo, { aoEscolherUF }) {
  const { W, H, ufs } = geo.ufs;
  let vb = { x: 0, y: 0, w: W, h: H };
  let valores = {};
  let selecionada = null;
  let suprimirClique = false;
  let anim = null;

  raiz.innerHTML = '';
  raiz.classList.remove('gl-ativo', 'inclinado');

  const palco = document.createElement('div');
  palco.className = 'mapa-palco';
  raiz.appendChild(palco);

  let atmosfera = { redesenhar() {} };
  const bufGL = { vb: { ...vb }, choro: null, foco: null, sel: null, inclinado: false, cursor: [null, null], camadas: new Map() };
  let glReal = null;
  const terreno = {
    get ativo() { return !!(glReal && glReal.ativo); },
    setVB(v) { bufGL.vb = { ...v }; glReal?.setVB(v); },
    setCoropletico(n) { bufGL.choro = n; glReal?.setCoropletico(n); },
    setEstadoFoco(o) {
      if ('foco' in o) bufGL.foco = o.foco;
      if ('selecionada' in o) bufGL.sel = o.selecionada;
      glReal?.setEstadoFoco(o);
    },
    setInclinado(on) { bufGL.inclinado = !!on; glReal?.setInclinado(on); },
    setCamada(nome, on, extra) { bufGL.camadas.set(nome, [on, extra]); glReal?.setCamada(nome, on, extra); },
    setCursor(x, y) { bufGL.cursor = [x, y]; glReal?.setCursor(x, y); },
    girarSol() { return glReal ? glReal.girarSol() : 0; },
    elevacaoEm(x, y) { return glReal ? glReal.elevacaoEm(x, y) : null; },
    elevacaoMetricaEm(x, y) { return glReal ? glReal.elevacaoMetricaEm(x, y) : null; },
    redesenhar() { glReal?.redesenhar(); },
  };

  const svg = criar('svg', {
    class: 'mapa-svg', viewBox: `0 0 ${W} ${H}`, role: 'group', tabindex: '-1',
    'aria-label': tr('Mapa do Brasil por estado. Tab percorre os estados e Enter abre. As setas movem o mapa; mais e menos aproximam.')
  }, palco);

  // Recorte do território brasileiro para o relevo SVG, usado antes do WebGL e quando ele não existe
  const defs = criar('defs', {}, svg);
  const clipBr = criar('clipPath', { id: 'bmb-recorte-br' }, defs);
  for (const u of ufs) criar('path', { d: u.d }, clipBr);

  const relevo = criar('image', {
    class: 'relevo', x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none',
    href: 'dados/geo/relevo_pequeno.webp', 'clip-path': 'url(#bmb-recorte-br)'
  }, svg);
  relevo.setAttribute('aria-hidden', 'true');

  const fallbackSemGL = () => {
    atmosfera = montarAtmosferaMapa(raiz);
    if (!conexaoLenta()) {
      const img = new Image();
      img.onload = () => relevo.setAttribute('href', img.src);
      img.src = 'dados/geo/relevo.webp';
    }
  };
  const iniciarGL = () => {
    if (conexaoLenta()) { fallbackSemGL(); return; }
    import('./viz/terreno_gl.js').then(({ criarTerrenoGL }) => {
      if (!palco.isConnected) return;
      glReal = criarTerrenoGL(palco, { W, H, ufs });
      if (glReal.ativo) {
        raiz.classList.add('gl-ativo');
        glReal.setVB(bufGL.vb);
        if (bufGL.choro) glReal.setCoropletico(bufGL.choro);
        glReal.setEstadoFoco({ foco: bufGL.foco, selecionada: bufGL.sel });
        glReal.setInclinado(bufGL.inclinado);
        for (const [nm, [on, ex]] of bufGL.camadas) glReal.setCamada(nm, on, ex);
        if (bufGL.cursor[0] != null) glReal.setCursor(bufGL.cursor[0], bufGL.cursor[1]);
        if (zoomLeitura && !ctl.querySelector('[data-a="sol"]')) {
          const bSol = document.createElement('button');
          bSol.type = 'button';
          bSol.dataset.a = 'sol';
          bSol.setAttribute('aria-label', tr(ROTULOS_SOL[0]));
          bSol.setAttribute('title', tr('Mudar a direção da iluminação do relevo'));
          bSol.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-sol"/></svg>';
          ctl.insertBefore(bSol, zoomLeitura);
        }
        glReal.redesenhar();
      } else {
        fallbackSemGL();
      }
    }).catch(fallbackSemGL);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(iniciarGL, { timeout: 350 });
  else setTimeout(iniciarGL, 60);

  const gLacunas = criar('g', { class: 'camada-lacunas' }, svg);
  gLacunas.style.display = 'none';
  const gUFs = criar('g', { class: 'ufs' }, svg);
  const gBacias = criar('g', { class: 'camada-bacias' }, svg);
  gBacias.style.display = 'none';
  const gBioma = criar('g', { class: 'camada-bioma' }, svg);
  gBioma.style.display = 'none';
  const gRios = criar('g', { class: 'rios' }, svg);
  gRios.style.display = 'none';
  const gRotulos = criar('g', { class: 'rotulos', 'aria-hidden': 'true' }, svg);

  const caminhos = new Map();
  for (const u of ufs) {
    const p = criar('path', {
      class: `uf v0${u.al === 2 ? ' al' : u.al === 1 ? ' al al-parcial' : ''}`, d: u.d, 'data-uf': u.s,
      tabindex: '0', role: 'button', 'aria-label': `${u.n}`
    }, gUFs);
    caminhos.set(u.s, p);
    const t = criar('text', { class: 'rotulo', x: u.cx, y: u.cy + 4 }, gRotulos);
    t.textContent = u.s;
  }

  // ─── camadas opcionais, construídas só quando pedidas ───
  let riosFeitos = false;
  let cacheRios = null;
  async function montarRios() {
    if (riosFeitos) return;
    riosFeitos = true;
    let dadosRios;
    try { dadosRios = await geo.carregarRios(); } catch { riosFeitos = false; return; }
    cacheRios = dadosRios;
    for (const r of dadosRios.rios) {
      const largura = r.ordem <= 1 ? 2.5 : r.ordem <= 4 ? 1.8 : r.ordem <= 6 ? 1.3 : 0.9;
      const d = r.t.map((linha) => 'M' + linha.map((pt) => pt.join(',')).join('L')).join('');
      criar('path', { class: 'rio', d, 'stroke-width': largura }, gRios);
      if (!movimentoPausado()) criar('path', { class: 'rio-fluxo', d, 'stroke-width': largura + 0.7 }, gRios);
    }
    terreno.setCamada('rios', gRios.style.display !== 'none', dadosRios);
  }

  let baciasFeitas = false;
  let listaBacias = [];
  async function montarBacias() {
    if (baciasFeitas || !geo.carregarBacias) return;
    baciasFeitas = true;
    let db;
    try { db = await geo.carregarBacias(); } catch { baciasFeitas = false; return; }
    listaBacias = db.bacias || [];
    for (const b of listaBacias) {
      if (!b.d) continue;
      criar('path', {
        class: 'bacia-poligono', d: b.d, fill: b.cor || '#22d3ee', stroke: b.cor || '#22d3ee',
        'data-bacia': b.id,
      }, gBacias);
    }
    if (db.bioma_amazonia_d) {
      criar('path', { class: 'bioma-contorno', d: db.bioma_amazonia_d }, gBioma);
    }
  }

  let lacunasFeitas = false;
  let temBivariada = false;
  function classeLacuna(n, d) { return n === 0 ? 'd0' : d < 0.01 ? 'd1' : d < 0.05 ? 'd2' : d < 0.25 ? 'd3' : 'd4'; }
  async function montarLacunas() {
    if (lacunasFeitas) return;
    lacunasFeitas = true;
    let grade;
    try { grade = await geo.carregarLacunas(); } catch { lacunasFeitas = false; return; }
    const { colunas, linhas } = grade;
    const ix = Object.fromEntries(colunas.map((c, i) => [c, i]));
    const frag = document.createDocumentFragment();
    for (const l of linhas) {
      const biv = ix.biv != null ? l[ix.biv] : null;
      if (biv && !biv.endsWith('_P0')) temBivariada = true;
      const clsBiv = biv && !biv.endsWith('_P0') ? ` biv-${biv}` : '';
      const r = criar('rect', { class: `lacuna ${classeLacuna(l[ix.n], l[ix.d])}${clsBiv}`, x: l[ix.x], y: l[ix.y], width: l[ix.w], height: l[ix.h] });
      frag.appendChild(r);
    }
    gLacunas.appendChild(frag);
    atualizarLegenda();
  }

  let zoomLeitura = null;
  function atualizarZoomTexto() {
    if (!zoomLeitura) return;
    const f = W / Math.max(1, vb.w);
    zoomLeitura.textContent = `${fmtFixo(f, 1)}×`;
  }

  // ─── viewBox, conversão exata de coordenadas, zoom e arrasto ───
  function aplicarVB() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    terreno.setVB(vb);
    ajustarRotulos();
    atualizarZoomTexto();
  }
  function geometria() {
    const r = svg.getBoundingClientRect();
    const cw = svg.clientWidth || r.width;
    const ch = svg.clientHeight || r.height;
    const s = Math.min(cw / vb.w, ch / vb.h);
    return { r, cw, ch, s, offx: (cw - vb.w * s) / 2, offy: (ch - vb.h * s) / 2 };
  }
  function clienteParaMapa(cx, cy) {
    try {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
        if (isFinite(pt.x) && isFinite(pt.y)) return { x: pt.x, y: pt.y };
      }
    } catch { /* fallback linear */ }
    const { r, s, offx, offy } = geometria();
    return { x: vb.x + (cx - r.left - offx) / s, y: vb.y + (cy - r.top - offy) / s };
  }
  function limitar(v) {
    const margem = 0.15;
    v.w = Math.min(Math.max(v.w, W / ZOOM_MAX), W * 1.05);
    v.h = v.w * (H / W);
    v.x = Math.min(Math.max(v.x, -W * margem), W * (1 + margem) - v.w);
    v.y = Math.min(Math.max(v.y, -H * margem), H * (1 + margem) - v.h);
    return v;
  }
  function irPara(alvo, ms = 680) {
    alvo = limitar({ ...alvo });
    cancelAnimationFrame(anim);
    if (movimentoPausado() || ms === 0) { vb = alvo; aplicarVB(); return; }
    const ini = { ...vb }, t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      vb = { x: ini.x + (alvo.x - ini.x) * e, y: ini.y + (alvo.y - ini.y) * e, w: ini.w + (alvo.w - ini.w) * e, h: ini.h + (alvo.h - ini.h) * e };
      aplicarVB();
      if (k < 1) anim = requestAnimationFrame(passo);
    };
    anim = requestAnimationFrame(passo);
  }
  function zoomEm(fator, cx, cy) {
    const centro = cx == null ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : clienteParaMapa(cx, cy);
    const w = vb.w / fator;
    const nv = limitar({ w, h: w * (H / W), x: centro.x - (centro.x - vb.x) / fator, y: centro.y - (centro.y - vb.y) / fator });
    cancelAnimationFrame(anim);
    vb = nv; aplicarVB();
  }
  function mover(dx, dy) { cancelAnimationFrame(anim); vb = limitar({ ...vb, x: vb.x + dx, y: vb.y + dy }); aplicarVB(); }

  // ─── Coordenadas e altitude sob o cursor ───
  const coordsHUD = document.createElement('div');
  coordsHUD.className = 'mapa-coords';
  coordsHUD.setAttribute('aria-hidden', 'true');
  const textoSemCursor = () => tr('PROJEÇÃO DE MERCATOR');
  coordsHUD.textContent = textoSemCursor();
  raiz.appendChild(coordsHUD);

  function fmtElevacao(m) {
    if (m == null) return null;
    if (m < -8) return tr('PROF −{m} m', { m: fmtInt(Math.abs(m)) });
    return tr('ALT +{m} m', { m: fmtInt(Math.max(0, m)) });
  }

  const ponteiros = new Map();
  let arrasto = null, pinca = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    suprimirClique = false;
    if (ponteiros.size === 1) arrasto = { x: e.clientX, y: e.clientY, vb: { ...vb }, moveu: false };
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), w: vb.w };
      arrasto = null;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') {
      const pm = clienteParaMapa(e.clientX, e.clientY);
      terreno.setCursor(pm.x, pm.y);
      const { lat, lon } = mapaParaGeo(pm.x, pm.y);
      const elv = fmtElevacao(terreno.elevacaoMetricaEm(pm.x, pm.y));
      const ufAlvo = e.target.closest?.('[data-uf]')?.dataset.uf;
      const partes = [`${fmtCoord(lat, 'N', 'S')} ${fmtCoord(lon, 'E', 'W')}`];
      if (elv) partes.push(elv);
      if (ufAlvo) partes.push(ufAlvo);
      coordsHUD.textContent = partes.join(' · ');
    }
    if (!ponteiros.has(e.pointerId)) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca && ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const alvoW = pinca.w * (pinca.d / Math.max(d, 1));
      zoomEm(vb.w / alvoW, (a.x + b.x) / 2, (a.y + b.y) / 2);
      suprimirClique = true;
    } else if (arrasto) {
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (!arrasto.moveu && Math.hypot(dx, dy) > 5) {
        arrasto.moveu = true; suprimirClique = true;
        try { svg.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
      }
      if (arrasto.moveu) {
        const { s } = geometria();
        cancelAnimationFrame(anim);
        vb = limitar({ ...arrasto.vb, x: arrasto.vb.x - dx / s, y: arrasto.vb.y - dy / s });
        aplicarVB();
      }
    }
  });
  svg.addEventListener('pointerleave', () => {
    terreno.setCursor(null, null);
    terreno.setEstadoFoco({ foco: null });
    coordsHUD.textContent = textoSemCursor();
  });
  const soltar = (e) => {
    ponteiros.delete(e.pointerId);
    if (ponteiros.size < 2) pinca = null;
    if (ponteiros.size === 0) arrasto = null;
    try { svg.releasePointerCapture(e.pointerId); } catch { /* ignorado */ }
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomEm(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY);
  }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const passo = vb.w * 0.12;
    const mapa = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    if (mapa[e.key]) { e.preventDefault(); mover(...mapa[e.key]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomEm(1.35); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomEm(1 / 1.35); }
    else if (e.key === '0') { e.preventDefault(); reiniciar(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.uf) { e.preventDefault(); aoEscolherUF(e.target.dataset.uf); }
  });
  gUFs.addEventListener('click', (e) => {
    if (suprimirClique) return;
    const alvo = e.target.closest('[data-uf]');
    if (alvo) aoEscolherUF(alvo.dataset.uf);
  });

  // ─── dica flutuante (nunca é a única via: o painel traz os mesmos números) ───
  const dica = document.createElement('div');
  dica.className = 'mapa-dica'; dica.hidden = true; dica.setAttribute('role', 'tooltip');
  raiz.appendChild(dica);
  let rotular = (n) => trn(n, '{n} registro', '{n} registros');
  function rotuloValor(v) { return v == null ? tr('sem registro') : rotular(v); }
  function mostrarDica(uf, x, y, elevM = null) {
    if (!uf) return;
    const v = valores[uf.s];
    const tagAL = uf.al ? ` · ${tr('Amazônia Legal')}` : '';
    const tagAlt = elevM != null && elevM >= 0 ? ` · +${fmtInt(elevM)} m` : '';
    dica.innerHTML = `<div class="dica-topo"><b>${esc(uf.n)}</b><span class="dica-sigla">${esc(uf.s)}</span></div>`
      + `<div class="dica-val">${esc(rotuloValor(v))}${esc(tagAL)}${esc(tagAlt)}</div>`;
    const r = raiz.getBoundingClientRect();
    dica.style.left = `${Math.min(Math.max(x - r.left, 96), r.width - 96)}px`;
    dica.style.top = `${y - r.top}px`;
    dica.hidden = false;
  }
  gUFs.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || arrasto?.moveu) { dica.hidden = true; return; }
    const alvo = e.target.closest('[data-uf]');
    if (alvo) {
      const sigla = alvo.dataset.uf;
      terreno.setEstadoFoco({ foco: sigla });
      const pm = clienteParaMapa(e.clientX, e.clientY);
      mostrarDica(ufs.find((u) => u.s === sigla), e.clientX, e.clientY, terreno.elevacaoMetricaEm(pm.x, pm.y));
    } else {
      terreno.setEstadoFoco({ foco: null });
      dica.hidden = true;
    }
  });
  gBacias.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || arrasto?.moveu) { dica.hidden = true; return; }
    const alvo = e.target.closest('[data-bacia]');
    const b = alvo && listaBacias.find((x) => x.id === alvo.dataset.bacia);
    if (!b) { dica.hidden = true; return; }
    dica.innerHTML = `<div class="dica-topo"><b>${esc(b.nome)}</b><span class="dica-sigla">${esc(b.rio_principal)}</span></div>`
      + `<div class="dica-val">${esc(`${trn(b.especies_no_recorte, '{n} táxon no recorte', '{n} táxons no recorte')} · ${trn(b.ocorrencias_gbif, '{n} registro do GBIF', '{n} registros do GBIF')} · ${fmtInt(Math.round(b.area_km2))} km²`)}</div>`;
    const r = raiz.getBoundingClientRect();
    dica.style.left = `${Math.min(Math.max(e.clientX - r.left, 110), r.width - 110)}px`;
    dica.style.top = `${e.clientY - r.top}px`;
    dica.hidden = false;
  });
  gBacias.addEventListener('pointerleave', () => { dica.hidden = true; });
  gBacias.addEventListener('click', () => { location.hash = '#/fluxo'; });
  gUFs.addEventListener('pointerleave', () => {
    terreno.setEstadoFoco({ foco: null });
    dica.hidden = true;
  });
  gUFs.addEventListener('focusin', (e) => {
    const alvo = e.target.closest('[data-uf]');
    if (!alvo) return;
    const sigla = alvo.dataset.uf;
    terreno.setEstadoFoco({ foco: sigla });
    const r = alvo.getBoundingClientRect();
    mostrarDica(ufs.find((u) => u.s === sigla), r.left + r.width / 2, r.top);
  });
  gUFs.addEventListener('focusout', () => {
    terreno.setEstadoFoco({ foco: null });
    dica.hidden = true;
  });

  // Rótulos com tamanho estável na tela, em qualquer zoom
  function ajustarRotulos() {
    const { s } = geometria();
    if (!(s > 0) || !isFinite(s)) return;
    const zoom = W / Math.max(1, vb.w);
    const fonte = `${(10.5 / s).toFixed(2)}px`, halo = `${(3.2 / s).toFixed(2)}px`;
    for (const t of gRotulos.children) {
      t.style.fontSize = fonte;
      t.style.strokeWidth = halo;
      if (t.textContent === 'DF') t.style.opacity = zoom < 1.85 ? '0' : '1';
    }
  }

  // ─── controles ───
  function alternarInclinacao() {
    const on = raiz.classList.toggle('inclinado');
    terreno.setInclinado(on);
    ctl.querySelector('[data-a="inclinar"]')?.setAttribute('aria-pressed', String(on));
    presets.querySelector('[data-p="3d"]')?.setAttribute('aria-pressed', String(on));
  }

  const ctl = document.createElement('div');
  ctl.className = 'mapa-ctl';
  ctl.innerHTML = `
    <button type="button" data-a="mais" aria-label="${tr('Aproximar')}" title="${tr('Aproximar (+)')}"><svg class="ic" aria-hidden="true"><use href="#i-mais"/></svg></button>
    <button type="button" data-a="menos" aria-label="${tr('Afastar')}" title="${tr('Afastar (−)')}"><svg class="ic" aria-hidden="true"><use href="#i-menos"/></svg></button>
    <button type="button" data-a="reset" aria-label="${tr('Mostrar o Brasil inteiro')}" title="${tr('Brasil inteiro (0)')}"><svg class="ic" aria-hidden="true"><use href="#i-alvo"/></svg></button>
    <button type="button" data-a="inclinar" aria-pressed="false" aria-label="${tr('Relevo em perspectiva')}" title="${tr('Relevo em perspectiva')}"><svg class="ic" aria-hidden="true"><use href="#i-cubo"/></svg></button>
    <span class="mapa-zoom-lido" aria-hidden="true"></span>`;
  raiz.appendChild(ctl);
  zoomLeitura = ctl.querySelector('.mapa-zoom-lido');

  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'mais') zoomEm(1.5);
    if (b.dataset.a === 'menos') zoomEm(1 / 1.5);
    if (b.dataset.a === 'reset') reiniciar();
    if (b.dataset.a === 'inclinar') alternarInclinacao();
    if (b.dataset.a === 'sol') {
      const i = terreno.girarSol();
      b.setAttribute('aria-label', tr(ROTULOS_SOL[i] || ROTULOS_SOL[0]));
      b.setAttribute('title', tr(ROTULOS_SOL[i] || ROTULOS_SOL[0]));
    }
  });

  const presets = document.createElement('div');
  presets.className = 'mapa-presets';
  presets.setAttribute('role', 'group');
  presets.setAttribute('aria-label', tr('Enquadramento do mapa'));
  presets.innerHTML = `
    <button type="button" data-p="brasil">${tr('Brasil')}</button>
    <button type="button" data-p="amazonia">${tr('Amazônia Legal')}</button>
    <button type="button" data-p="3d" aria-pressed="false">${tr('Relevo em perspectiva')}</button>`;
  raiz.appendChild(presets);
  presets.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p === 'brasil') reiniciar();
    if (b.dataset.p === 'amazonia') focarAmazonia();
    if (b.dataset.p === '3d') alternarInclinacao();
  });

  const camadas = document.createElement('details');
  camadas.className = 'mapa-camadas';
  camadas.open = false;
  camadas.innerHTML = `<summary><svg class="ic" aria-hidden="true"><use href="#i-camadas"/></svg>${tr('Camadas')}</summary>
    <label><input type="checkbox" data-c="al"> ${tr('Amazônia Legal')}</label>
    <label><input type="checkbox" data-c="bioma"> ${tr('Bioma Amazônia (IBGE)')}</label>
    <label><input type="checkbox" data-c="bacias"> ${tr('Sub-bacias amazônicas')}</label>
    <label><input type="checkbox" data-c="rios"> ${tr('Rios')}</label>
    <label><input type="checkbox" data-c="lacunas"> ${tr('Lacunas de amostragem')}</label>`;
  raiz.appendChild(camadas);
  function ligar(nome, on) {
    if (nome === 'al') svg.classList.toggle('mostra-al', on);
    if (nome === 'bioma') { if (on) montarBacias(); gBioma.style.display = on ? '' : 'none'; }
    if (nome === 'bacias') { if (on) montarBacias(); gBacias.style.display = on ? '' : 'none'; }
    if (nome === 'rios') { if (on) montarRios(); gRios.style.display = on ? '' : 'none'; }
    if (nome === 'lacunas') { if (on) montarLacunas(); gLacunas.style.display = on ? '' : 'none'; atualizarLegenda(); }
    terreno.setCamada(nome, on, nome === 'rios' ? cacheRios : undefined);
    const caixa = camadas.querySelector(`[data-c="${nome}"]`);
    if (caixa) caixa.checked = on;
  }
  camadas.addEventListener('change', (e) => ligar(e.target.dataset.c, e.target.checked));

  const legenda = document.createElement('div');
  legenda.className = 'mapa-legenda';
  (raiz.parentElement || raiz).appendChild(legenda);
  let legendaChoro = '';
  function atualizarLegenda() {
    const lacunasOn = gLacunas.style.display !== 'none';
    const textoLac = `<p class="nota">${esc(tr(temBivariada
      ? 'Células de 0,5°. Ciano: poucos registros do GBIF sob floresta preservada. Âmbar: desmatamento (PRODES). Magenta com borda dourada (G3×P3): poucos registros e desmatamento alto.'
      : 'Células de 0,5°. Âmbar mais intenso: menos registros do GBIF por km². Mede esforço de amostragem, não riqueza de espécies.'))}</p>`;
    legenda.innerHTML = legendaChoro + (lacunasOn ? textoLac : '');
    legenda.hidden = !legenda.innerHTML.trim();
  }

  // ─── API pública ───
  function setValores(v, { titulo, rotular: novoRotular, nota = '' } = {}) {
    valores = v;
    if (novoRotular) rotular = novoRotular;
    const positivos = Object.values(v).filter((x) => x > 0).sort((a, b) => a - b);
    const lim = [];
    if (positivos.length) {
      for (let k = 1; k <= 4; k++) lim.push(positivos[Math.max(0, Math.ceil((k * positivos.length) / 5) - 1)]);
      lim.push(positivos[positivos.length - 1]);
    }
    const unicos = [...new Set(lim)];
    const maxVal = positivos.length ? positivos[positivos.length - 1] : 1;
    const classe = (x) => { if (!(x > 0)) return 0; const i = unicos.findIndex((l) => x <= l); return (i < 0 ? unicos.length : i + 1); };
    const niveisGL = {};
    for (const u of ufs) {
      const p = caminhos.get(u.s);
      const val = v[u.s] || 0;
      const c = classe(val);
      p.setAttribute('class', p.getAttribute('class').replace(/\bv\d\b/, `v${c}`));
      p.setAttribute('aria-label', `${u.n}: ${rotuloValor(v[u.s] ?? 0)}`);
      if (val <= 0) niveisGL[u.s] = 0;
      else {
        const faixa = c / Math.max(1, unicos.length);
        const logNorm = Math.log1p(val) / Math.max(1e-6, Math.log1p(maxVal));
        niveisGL[u.s] = 0.16 + 0.84 * (faixa * 0.62 + logNorm * 0.38);
      }
    }
    terreno.setCoropletico(niveisGL);
    let faixas = '<li class="v0">0</li>';
    let ant = 0;
    unicos.forEach((l, i) => { faixas += `<li class="v${i + 1}">${ant + 1 === l ? fmtInt(l) : `${fmtInt(ant + 1)}–${fmtInt(l)}`}</li>`; ant = l; });
    legendaChoro = `<b>${esc(titulo || tr('Registros por estado'))}</b><ol aria-label="${esc(tr('Faixas de valores'))}">${faixas}</ol>${nota ? `<p class="nota">${esc(nota)}</p>` : ''}`;
    atualizarLegenda();
  }
  function selecionar(sigla) {
    if (selecionada) caminhos.get(selecionada)?.classList.remove('sel');
    selecionada = sigla;
    if (sigla) { const p = caminhos.get(sigla); p?.classList.add('sel'); p?.parentNode.appendChild(p); }
    terreno.setEstadoFoco({ selecionada: sigla || null });
  }
  function focarUF(sigla) {
    const p = caminhos.get(sigla); if (!p) return;
    const b = p.getBBox();
    const pad = 0.28;
    let w = b.width * (1 + pad * 2), h = b.height * (1 + pad * 2);
    if (h / w > H / W) w = h * (W / H); else h = w * (H / W);
    irPara({ x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - h / 2, w, h });
  }
  function reiniciar() { irPara({ x: 0, y: 0, w: W, h: H }); }
  /** Enquadra a Amazônia Legal. */
  function focarAmazonia() {
    const al = ufs.filter((u) => u.al).map((u) => caminhos.get(u.s));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of al) { const b = p.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
    let w = (x1 - x0) * 1.12, h = (y1 - y0) * 1.12;
    if (h / w > H / W) w = h * (W / H); else h = w * (H / W);
    irPara({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h });
  }
  aplicarVB();
  window.addEventListener('resize', () => { aplicarVB(); });

  /** Sigla do estado que contém o ponto (coordenadas do mapa), ou null. */
  function ufDoPonto(x, y) {
    const ponto = new DOMPoint(x, y);
    for (const [sigla, p] of caminhos) if (p.isPointInFill(ponto)) return sigla;
    return null;
  }
  const refrescar = () => { aplicarVB(); atmosfera.redesenhar(); terreno.redesenhar(); };

  return { setValores, selecionar, focarUF, reiniciar, focarAmazonia, camada: ligar, ufDoPonto, refrescar, svg, ufs };
}
