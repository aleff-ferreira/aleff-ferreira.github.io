// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Elementos gráficos do painel: fundo do mapa quando não há WebGL, grafo animado de estados e espécies,
// contadores e radar de completude do registro.
import { bruto, esc, fmtInt, tr, trn, reduzMovimento, GRUPOS } from './util.js';

export function movimentoPausado() {
  return reduzMovimento() || document.documentElement.dataset.movimento === 'pausado';
}

function temaEscuro() {
  const t = document.documentElement.dataset.tema;
  return t === 'escuro' || (t !== 'claro' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function paletaCanvas() {
  const esc_ = temaEscuro();
  return esc_
    ? {
        escuro: true,
        fundo0: '#0a1712',
        fundo1: '#050b09',
        grade: 'rgba(149, 178, 160, 0.08)',
        gradeForte: 'rgba(52, 211, 153, 0.20)',
        coord: 'rgba(149, 178, 160, 0.44)',
        halo: 'rgba(52, 211, 153, 0.09)',
        haloRio: 'rgba(34, 211, 238, 0.06)',
        uf: '#38d9f5',
        planta: '#34d399',
        animal: '#fbbf24',
        fungo: '#a78bfa',
        ouro: '#fbbf24',
        silt: '#c9a15f',
        heart: '#eafff6',
        fungal: '#9dff7a',
        seed: '#f5f0ff',
        tinta: '#f1f8f3',
        tintaSuave: 'rgba(205, 226, 213, 0.84)',
        fio: 'rgba(110, 231, 183, 0.13)',
        fioAtivo: 'rgba(52, 211, 153, 0.88)',
        fioOuro: 'rgba(251, 191, 36, 0.90)',
        fundoNo: 'rgba(7, 17, 13, 0.92)',
      }
    : {
        escuro: false,
        fundo0: '#faf6ec',
        fundo1: '#ebe4d4',
        grade: 'rgba(11, 31, 24, 0.07)',
        gradeForte: 'rgba(17, 82, 56, 0.18)',
        coord: 'rgba(63, 87, 76, 0.55)',
        halo: 'rgba(28, 122, 84, 0.07)',
        haloRio: 'rgba(12, 89, 105, 0.05)',
        uf: '#0c5969',
        planta: '#115238',
        animal: '#9a6406',
        fungo: '#5b3ca8',
        ouro: '#b87409',
        silt: '#8a6830',
        heart: '#ffffff',
        fungal: '#1c7a54',
        seed: '#3b2878',
        tinta: '#0b1f18',
        tintaSuave: 'rgba(36, 59, 49, 0.84)',
        fio: 'rgba(17, 82, 56, 0.14)',
        fioAtivo: 'rgba(17, 82, 56, 0.82)',
        fioOuro: 'rgba(184, 116, 9, 0.85)',
        fundoNo: 'rgba(250, 247, 240, 0.95)',
      };
}

function misturarRGB(c1, c2, k) {
  const t = Math.max(0, Math.min(1, k));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

// Gradiente espectral da onda de seiva da Amazonia Works: Ouro → Bio → Ciano → Violeta → Semente
const ESCALA_SEIVA_ESCURA = [
  [0.00, [251, 191, 36]],
  [0.28, [52, 211, 153]],
  [0.56, [34, 211, 238]],
  [0.80, [167, 139, 250]],
  [1.00, [245, 240, 255]],
];
const ESCALA_SEIVA_CLARA = [
  [0.00, [184, 116, 9]],
  [0.32, [17, 82, 56]],
  [0.62, [12, 89, 105]],
  [0.85, [91, 60, 168]],
  [1.00, [28, 122, 84]],
];

function corSeivaRGB(progresso, escuro) {
  const esc_ = escuro ? ESCALA_SEIVA_ESCURA : ESCALA_SEIVA_CLARA;
  const x = Math.max(0, Math.min(1, progresso));
  for (let i = 0; i < esc_.length - 1; i++) {
    const [p0, c0] = esc_[i];
    const [p1, c1] = esc_[i + 1];
    if (x <= p1) return misturarRGB(c0, c1, (x - p0) / Math.max(1e-4, p1 - p0));
  }
  return esc_[esc_.length - 1][1];
}

function rgba(rgb, a) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function pontoBezierQuad(p0x, p0y, cx, cy, p1x, p1y, t) {
  const u = 1 - t;
  return {
    x: u * u * p0x + 2 * u * t * cx + t * t * p1x,
    y: u * u * p0y + 2 * u * t * cy + t * t * p1y,
  };
}

/** Fundo desenhado atrás do mapa SVG quando o WebGL não está disponível. */
export function montarAtmosferaMapa(raizMapa) {
  if (!raizMapa) return { redesenhar() {} };
  const canvas = document.createElement('canvas');
  canvas.className = 'mapa-atmosfera';
  canvas.setAttribute('aria-hidden', 'true');
  raizMapa.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { redesenhar() {} };

  let L = 0, A = 0, dpr = 1, raf = 0;
  const esporos = Array.from({ length: 26 }, (_, i) => ({
    x: ((i * 37) % 100) / 100,
    y: ((i * 61) % 100) / 100,
    r: 0.9 + (i % 4) * 0.45,
    vx: ((i % 5) - 2) * 0.000045,
    vy: -0.00008 - (i % 3) * 0.00004,
    fase: i * 0.9,
    tipo: i % 5 === 0 ? 'ouro' : i % 3 === 0 ? 'rio' : 'verde',
  }));

  function ajustar() {
    const r = raizMapa.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = Math.max(1, Math.round(r.width));
    A = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pintar(tempo) {
    if (!L || !A) ajustar();
    const p = paletaCanvas();
    ctx.clearRect(0, 0, L, A);

    const g1 = ctx.createRadialGradient(L * 0.36, A * 0.34, 8, L * 0.36, A * 0.34, Math.max(L, A) * 0.56);
    g1.addColorStop(0, p.halo);
    g1.addColorStop(0.55, p.haloRio);
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, L, A);

    ctx.strokeStyle = p.grade;
    ctx.lineWidth = 1;
    const cols = 6, lins = 5;
    for (let i = 1; i < cols; i++) {
      const x = Math.round((L / cols) * i) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, A); ctx.stroke();
    }
    for (let j = 1; j < lins; j++) {
      const y = Math.round((A / lins) * j) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L, y); ctx.stroke();
    }

    const eqY = Math.round(A * 0.21) + 0.5;
    ctx.save();
    ctx.strokeStyle = p.gradeForte;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(14, eqY); ctx.lineTo(L - 14, eqY); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = p.coord;
    ctx.font = '500 9.5px "Geist Mono", ui-monospace, monospace';
    if (L > 360) {
      ctx.fillText('00°00′ EQ', 16, eqY - 5);
      ctx.fillText('60°W', Math.round((L / cols) * 2) + 5, 16);
      ctx.fillText('50°W', Math.round((L / cols) * 4) + 5, 16);
    }

    const pausado = movimentoPausado();
    for (const s of esporos) {
      if (!pausado) {
        s.x = (s.x + s.vx + 1) % 1;
        s.y = (s.y + s.vy + 1) % 1;
      }
      const pulso = pausado ? 0.45 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(tempo * 0.0016 + s.fase));
      ctx.beginPath();
      ctx.arc(s.x * L, s.y * A, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.tipo === 'ouro'
        ? `rgba(251, 191, 36, ${(pulso * (p.escuro ? 0.65 : 0.4)).toFixed(3)})`
        : s.tipo === 'rio'
          ? `rgba(56, 217, 245, ${(pulso * (p.escuro ? 0.6 : 0.35)).toFixed(3)})`
          : `rgba(52, 211, 153, ${(pulso * (p.escuro ? 0.68 : 0.38)).toFixed(3)})`;
      ctx.fill();
    }
  }

  function ciclo(t) {
    if (!canvas.isConnected) return;
    if (!document.hidden && !raizMapa.closest('[hidden]')) pintar(t);
    if (!movimentoPausado()) raf = requestAnimationFrame(ciclo);
  }
  function reiniciarCiclo() {
    cancelAnimationFrame(raf);
    ajustar();
    pintar(performance.now());
    if (!movimentoPausado()) raf = requestAnimationFrame(ciclo);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { ajustar(); pintar(performance.now()); }) : null;
  ro?.observe(raizMapa);
  window.addEventListener('bmb:tema', reiniciarCiclo);
  window.addEventListener('bmb:movimento', reiniciarCiclo);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reiniciarCiclo(); });
  reiniciarCiclo();
  return { redesenhar: reiniciarCiclo };
}

/** Grafo animado que liga os estados da Amazônia Legal às espécies com mais moléculas registradas. */
export function montarConstelacao(raizPainel, { indice, ufs, filtroGrupos, aoNavegar }) {
  const palco = raizPainel?.querySelector('#constelacao-palco');
  const statusEl = raizPainel?.querySelector('#constelacao-status');
  if (!palco || !indice || !ufs) return;

  palco.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'constelacao-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', tr('Grafo dos estados da Amazônia Legal e das espécies com mais moléculas registradas. As setas alternam entre os nós e Enter abre o nó em foco.'));
  palco.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ufsAL = ufs.filter((u) => u.al);
  const siglasAL = new Set(ufsAL.map((u) => u.s));
  const contUF = Object.fromEntries(ufsAL.map((u) => [u.s, 0]));
  for (const t of indice.lista) {
    if (!t.recorte || !filtroGrupos.has(t.grupo)) continue;
    for (const [s, n] of Object.entries(t.uf || {})) if (n > 0 && siglasAL.has(s)) contUF[s] = (contUF[s] || 0) + 1;
  }

  const especies = [...indice.lista]
    .filter((t) => t.recorte && filtroGrupos.has(t.grupo) && t.moleculas > 0)
    .sort((a, b) => (b.aprovado - a.aprovado) || ((b.predominio === 'p') - (a.predominio === 'p')) || (b.moleculas - a.moleculas))
    .slice(0, 20);

  // Sementes-luz de sumaúma e esporos do dossel (estilo Amazonia Works Hero)
  const SEMENTES = Array.from({ length: 96 }, (_, i) => {
    const a = (i * 2.399963) % (Math.PI * 2);
    const d = 0.08 + ((i * 29) % 92) / 100;
    return {
      ang: a,
      dist: d,
      velAng: (i % 2 === 0 ? 1 : -1) * (0.045 + (i % 7) * 0.014),
      radOsc: 0.018 + (i % 5) * 0.006,
      r: 0.85 + (i % 4) * 0.55 + (i % 13 === 0 ? 1.15 : 0),
      fase: i * 1.17,
      corIdx: (i * 3) % 5, // 0 ouro, 1 bio, 2 ciano, 3 violeta, 4 semente
      dx: 0,
      dy: 0,
    };
  });

  const CORES_SEMENTE_ESCURA = [
    [251, 191, 36],
    [52, 211, 153],
    [34, 211, 238],
    [167, 139, 250],
    [245, 240, 255],
  ];
  const CORES_SEMENTE_CLARA = [
    [184, 116, 9],
    [17, 82, 56],
    [12, 89, 105],
    [91, 60, 168],
    [63, 87, 76],
  ];

  let L = 0, A = 0, dpr = 1;
  let rUF = 64, rEsp = 128, raioMax = 140;
  let nosUF = [], nosEsp = [], todosNos = [], elos = [];
  let focoNo = null;
  let raf = 0;
  let tZero = performance.now();

  // Rastro micelial de 16 pontos e ondas de choque ao clicar no vazio
  const rastro = [];
  const ondasClique = [];
  let cursor = { x: -9999, y: -9999, ativo: false };

  function calcularGeometria() {
    const r = palco.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = Math.max(260, Math.round(r.width));
    A = Math.max(220, Math.round(r.height));
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = L * 0.5, cy = A * 0.5;
    // Deixa folga horizontal generosa para os rótulos em Fraunces Italic nas laterais
    const margemRotulo = L >= 460 ? 96 : L >= 360 ? 64 : 26;
    raioMax = Math.max(68, Math.min((L - margemRotulo * 2) * 0.5, A * 0.435));
    rUF = raioMax * 0.46;
    rEsp = raioMax * 0.92;

    const maxUF = Math.max(1, ...Object.values(contUF));
    const maxMol = Math.max(1, ...especies.map((t) => t.moleculas));
    const raioJoiaUF = L >= 440 ? 13.2 : 11.2;

    nosUF = ufsAL.map((u, i) => {
      const ang = -Math.PI / 2 + (i / ufsAL.length) * Math.PI * 2;
      const n = contUF[u.s] || 0;
      return {
        tipo: 'uf',
        id: u.s,
        sigla: u.s,
        nome: u.n,
        contagem: n,
        frac: n / maxUF,
        ang,
        x: cx + Math.cos(ang) * rUF,
        y: cy + Math.sin(ang) * rUF,
        r: raioJoiaUF,
        href: `#/uf/${u.s}`,
      };
    });
    const mapaUF = new Map(nosUF.map((n) => [n.sigla, n]));

    nosEsp = especies.map((t, i) => {
      const ang = -Math.PI / 2 + ((i + 0.5) / Math.max(1, especies.length)) * Math.PI * 2;
      const ufsLigadas = Object.entries(t.uf || {}).filter(([s, n]) => n > 0 && mapaUF.has(s)).map(([s]) => s);
      const partes = t.nome.split(' ');
      const curto = partes.length >= 2 ? `${partes[0][0]}. ${partes[1]}` : t.nome;
      return {
        tipo: 'especie',
        id: t.gbif,
        nome: t.nome,
        curto,
        popular: t.populares?.[0] || tr(GRUPOS[t.grupo]?.rotulo || ''),
        grupo: t.grupo,
        moleculas: t.moleculas,
        aprovado: !!t.aprovado,
        ufs: ufsLigadas,
        ang,
        x: cx + Math.cos(ang) * rEsp,
        y: cy + Math.sin(ang) * rEsp,
        r: 4.4 + Math.sqrt(t.moleculas / maxMol) * 4.8,
        href: `#/especie/${t.gbif}`,
      };
    });

    todosNos = [...nosUF, ...nosEsp];
    if (focoNo) {
      focoNo = todosNos.find((n) => n.tipo === focoNo.tipo && n.id === focoNo.id) || null;
    }

    elos = [];
    for (const esp of nosEsp) {
      for (const s of esp.ufs) {
        const u = mapaUF.get(s);
        if (!u) continue;
        // Ponto de controle curvo puxado suavemente rumo ao coração para formar arcos orgânicos micorrízicos
        const mx = (u.x + esp.x) * 0.5 + (cx - (u.x + esp.x) * 0.5) * 0.28;
        const my = (u.y + esp.y) * 0.5 + (cy - (u.y + esp.y) * 0.5) * 0.28;
        elos.push({ u, esp, mx, my, fase: (u.ang * 1.7 + esp.ang * 2.3) % 1 });
      }
    }
  }

  function atualizarTextoStatus(no) {
    if (!statusEl) return;
    if (!no) {
      statusEl.innerHTML = `<span>${esc(`${trn(nosUF.length, '{n} estado', '{n} estados')} · ${trn(nosEsp.length, '{n} espécie', '{n} espécies')}`)}</span><span>${esc(tr('Selecione um nó'))}</span>`;
      return;
    }
    if (no.tipo === 'uf') {
      statusEl.innerHTML = `<span><strong>${esc(no.sigla)} · ${esc(no.nome)}</strong>: ${esc(trn(no.contagem, '{n} táxon no recorte amazônico', '{n} táxons no recorte amazônico'))}</span><span>${esc(tr('Abrir estado'))}</span>`;
    } else {
      statusEl.innerHTML = `<span><em>${esc(no.nome)}</em>${no.popular ? ` (${esc(no.popular)})` : ''}: ${esc(trn(no.moleculas, '{n} molécula', '{n} moléculas'))} · ${esc(no.ufs.slice(0, 5).join(', '))}</span><span>${esc(tr('Abrir espécie'))}</span>`;
    }
  }

  function rgbGrupo(g, escuro) {
    if (escuro) return g === 'A' ? [251, 191, 36] : g === 'F' ? [167, 139, 250] : [52, 211, 153];
    return g === 'A' ? [154, 100, 6] : g === 'F' ? [91, 60, 168] : [17, 82, 56];
  }

  // Anel helicoidal trançado contrarrotativo (assinatura visual do Hero da Amazonia Works)
  function desenharAnelTrancado(cx, cy, raio, tSec, voltas, amp, corA, corB, pausado) {
    const passos = 128;
    for (let fita = 0; fita < 2; fita++) {
      const sentido = fita === 0 ? 1 : -0.78;
      const desvio = fita * Math.PI;
      ctx.beginPath();
      for (let i = 0; i <= passos; i++) {
        const a = (i / passos) * Math.PI * 2;
        const ond = Math.sin(a * voltas + (pausado ? 0 : tSec * 0.75 * sentido) + desvio) * amp;
        const rr = raio + ond;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = fita === 0 ? corA : corB;
      ctx.lineWidth = fita === 0 ? 1.05 : 0.85;
      ctx.stroke();
    }
  }

  function desenhar(agora) {
    if (!L || !A) calcularGeometria();
    const p = paletaCanvas();
    const pausado = movimentoPausado();
    const tSec = pausado ? 1.05 : (agora - tZero) * 0.001;
    const cx = L * 0.5, cy = A * 0.5;
    const modoLuz = p.escuro ? 'lighter' : 'source-over';

    // 1. Fundo atmosférico profundo do dossel / herbário
    const gBg = ctx.createRadialGradient(cx, cy, 6, cx, cy, Math.max(L, A) * 0.68);
    gBg.addColorStop(0, p.fundo0);
    gBg.addColorStop(1, p.fundo1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gBg;
    ctx.fillRect(0, 0, L, A);

    // 2. Pulso cardíaco lub-dub de 7,5 s + frente de seiva propagante (PERIOD = 7.5s, DUB = 0.28s)
    const PERIODO = 7.5;
    const faseCiclo = tSec % PERIODO;
    const lub = Math.exp(-Math.pow(faseCiclo / 0.14, 2));
    const dub = 0.78 * Math.exp(-Math.pow((faseCiclo - 0.28) / 0.16, 2));
    const batida = pausado ? 0.22 : Math.min(1, lub + dub);

    // Frente radial da onda de seiva (0 .. 1.22 ao longo de 3.8s após a batida)
    const progSeiva = pausado ? -1 : faseCiclo / 3.85;
    const rFrenteSeiva = progSeiva >= 0 && progSeiva <= 1.25 ? progSeiva * (rEsp * 1.12) : -999;

    // 3. Nebulosa bioluminescente central + halo da onda de seiva
    ctx.save();
    ctx.globalCompositeOperation = modoLuz;
    const gNeb = ctx.createRadialGradient(cx, cy, 4, cx, cy, rEsp * (0.95 + 0.08 * batida));
    gNeb.addColorStop(0, p.escuro ? `rgba(52, 211, 153, ${(0.12 + 0.10 * batida).toFixed(3)})` : 'rgba(28, 122, 84, 0.08)');
    gNeb.addColorStop(0.46, p.escuro ? 'rgba(34, 211, 238, 0.065)' : 'rgba(12, 89, 105, 0.04)');
    gNeb.addColorStop(0.82, p.escuro ? 'rgba(167, 139, 250, 0.035)' : 'rgba(91, 60, 168, 0.02)');
    gNeb.addColorStop(1, 'transparent');
    ctx.fillStyle = gNeb;
    ctx.fillRect(0, 0, L, A);

    // Onda esférica expansiva da seiva
    if (rFrenteSeiva > 6) {
      const kCor = Math.min(1, rFrenteSeiva / Math.max(1, rEsp));
      const rgbOnda = corSeivaRGB(kCor, p.escuro);
      const envOnda = Math.sin(Math.min(1, progSeiva / 1.25) * Math.PI);
      const largAnel = 26;
      const gOnda = ctx.createRadialGradient(
        cx, cy, Math.max(1, rFrenteSeiva - largAnel),
        cx, cy, rFrenteSeiva + largAnel * 0.7
      );
      gOnda.addColorStop(0, 'transparent');
      gOnda.addColorStop(0.55, rgba(rgbOnda, (p.escuro ? 0.20 : 0.12) * envOnda));
      gOnda.addColorStop(1, 'transparent');
      ctx.fillStyle = gOnda;
      ctx.beginPath();
      ctx.arc(cx, cy, rFrenteSeiva + largAnel * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ondas de choque interativas ao clicar no palco vazio
    for (let i = ondasClique.length - 1; i >= 0; i--) {
      const o = ondasClique[i];
      const idade = (agora - o.t0) * 0.001;
      if (idade > 1.85) { ondasClique.splice(i, 1); continue; }
      const k = idade / 1.85;
      const rr = 8 + (1 - Math.pow(1 - k, 2.4)) * (rEsp * 1.18);
      const rgbC = corSeivaRGB(k, p.escuro);
      ctx.beginPath();
      ctx.arc(o.x, o.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(rgbC, (1 - k) * (p.escuro ? 0.58 : 0.38));
      ctx.lineWidth = 2.2 * (1 - k * 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Anéis orbitais helicoidais trançados + contas viajantes de seiva
    desenharAnelTrancado(
      cx, cy, rUF, tSec, 9, 2.1,
      p.escuro ? 'rgba(56, 217, 245, 0.19)' : 'rgba(12, 89, 105, 0.16)',
      p.escuro ? 'rgba(201, 161, 95, 0.15)' : 'rgba(154, 100, 6, 0.13)',
      pausado
    );
    desenharAnelTrancado(
      cx, cy, rEsp, -tSec * 0.72, 14, 2.5,
      p.escuro ? 'rgba(52, 211, 153, 0.15)' : 'rgba(17, 82, 56, 0.14)',
      p.escuro ? 'rgba(167, 139, 250, 0.12)' : 'rgba(91, 60, 168, 0.11)',
      pausado
    );

    if (!pausado) {
      ctx.save();
      ctx.globalCompositeOperation = modoLuz;
      for (let b = 0; b < 6; b++) {
        const interno = b < 3;
        const rr = interno ? rUF : rEsp;
        const a = tSec * (interno ? 0.42 : -0.26) + (b * Math.PI * 2) / 3;
        const bx = cx + Math.cos(a) * rr;
        const by = cy + Math.sin(a) * rr;
        ctx.beginPath();
        ctx.arc(bx, by, interno ? 2.1 : 2.4, 0, Math.PI * 2);
        ctx.fillStyle = interno
          ? (p.escuro ? 'rgba(111, 245, 214, 0.78)' : 'rgba(12, 89, 105, 0.65)')
          : (p.escuro ? 'rgba(251, 191, 36, 0.75)' : 'rgba(184, 116, 9, 0.65)');
        ctx.fill();
      }
      ctx.restore();
    }

    // 5. Campo de sementes-luz de sumaúma e esporos com repulsão/vórtice de cursor
    const paletaSem = p.escuro ? CORES_SEMENTE_ESCURA : CORES_SEMENTE_CLARA;
    ctx.save();
    ctx.globalCompositeOperation = modoLuz;
    for (const s of SEMENTES) {
      const angAtual = s.ang + (pausado ? 0 : tSec * s.velAng);
      const dOsc = s.dist + (pausado ? 0 : Math.sin(tSec * 0.6 + s.fase) * s.radOsc);
      const baseX = cx + Math.cos(angAtual) * (rEsp * 1.16 * dOsc);
      const baseY = cy + Math.sin(angAtual) * (rEsp * 1.06 * dOsc);

      if (!pausado && cursor.ativo) {
        const vx = baseX + s.dx - cursor.x;
        const vy = baseY + s.dy - cursor.y;
        const d2 = vx * vx + vy * vy;
        if (d2 < 4600 && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 68) * 1.65;
          // Impulso radial + leve redemoinho tangencial
          s.dx += (vx / d - (vy / d) * 0.45) * f;
          s.dy += (vy / d + (vx / d) * 0.45) * f;
        }
      }
      s.dx *= 0.91;
      s.dy *= 0.91;

      const sx = baseX + s.dx;
      const sy = baseY + s.dy;
      if (sx < 4 || sx > L - 4 || sy < 4 || sy > A - 4) continue;

      const resp = pausado ? 0.55 : 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(tSec * 1.7 + s.fase));
      const dCentro = Math.hypot(sx - cx, sy - cy);
      const impulsoSeiva = rFrenteSeiva > 0 ? Math.exp(-Math.pow((dCentro - rFrenteSeiva) / 24, 2)) : 0;
      const alfa = Math.min(0.95, (p.escuro ? 0.46 : 0.30) * resp + impulsoSeiva * 0.48);
      const rgbS = paletaSem[s.corIdx];

      if (s.r > 2.0 && p.escuro) {
        const gS = ctx.createRadialGradient(sx, sy, 0.2, sx, sy, s.r * 3.4);
        gS.addColorStop(0, rgba(rgbS, alfa));
        gS.addColorStop(1, 'transparent');
        ctx.fillStyle = gS;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r * 3.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = rgba(rgbS, alfa);
        ctx.beginPath();
        ctx.arc(sx, sy, s.r + impulsoSeiva * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rastro micelial luminescente (#9dff7a) sob o ponteiro
    if (!pausado && rastro.length > 1) {
      for (let i = rastro.length - 1; i >= 0; i--) {
        const idade = (agora - rastro[i].t) * 0.001;
        if (idade > 0.52) rastro.splice(i, 1);
      }
      for (let i = 1; i < rastro.length; i++) {
        const pt = rastro[i];
        const ant = rastro[i - 1];
        const k = 1 - Math.min(1, (agora - pt.t) * 0.001 / 0.52);
        ctx.beginPath();
        ctx.moveTo(ant.x, ant.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = p.escuro ? `rgba(157, 255, 122, ${(k * 0.42).toFixed(3)})` : `rgba(28, 122, 84, ${(k * 0.28).toFixed(3)})`;
        ctx.lineWidth = 1.2 + k * 3.2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    ctx.restore();

    // 6. Raízes radiais do coração às 9 UFs + propagação da seiva
    for (const u of nosUF) {
      const ativo = focoNo && (focoNo === u || (focoNo.tipo === 'especie' && focoNo.ufs.includes(u.sigla)));
      const esmaecido = focoNo && !ativo;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(u.x, u.y);
      ctx.strokeStyle = ativo ? p.fioAtivo : p.gradeForte;
      ctx.globalAlpha = esmaecido ? 0.18 : (ativo ? 0.95 : 0.55);
      ctx.lineWidth = ativo ? 1.65 : 0.95;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Crista de seiva viajando do coração até a UF
      if (!pausado && progSeiva >= 0 && progSeiva <= 0.52 && !esmaecido) {
        const s = Math.min(1, progSeiva / 0.44);
        const sx = cx + (u.x - cx) * s;
        const sy = cy + (u.y - cy) * s;
        ctx.save();
        ctx.globalCompositeOperation = modoLuz;
        const rgbP = corSeivaRGB(s * 0.35, p.escuro);
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(rgbP, p.escuro ? 0.85 : 0.65);
        ctx.fill();
        ctx.restore();
      }
    }

    // 7. Filamentos micorrízicos Bezier entre UFs e Espécies + pacotes de seiva viajantes
    ctx.save();
    for (const elo of elos) {
      const { u, esp, mx, my, fase } = elo;
      const ativo = focoNo ? (focoNo === u || focoNo === esp) : false;
      const esmaecido = focoNo && !ativo;

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.quadraticCurveTo(mx, my, esp.x, esp.y);
      ctx.strokeStyle = ativo ? (esp.aprovado ? p.fioOuro : p.fioAtivo) : p.fio;
      ctx.globalAlpha = esmaecido ? 0.08 : 1;
      ctx.lineWidth = ativo ? 1.75 : 0.85;
      ctx.stroke();

      // Filamento ativo recebe trança secundária + gotas vivas de seiva fluindo UF → Espécie
      if (ativo && !pausado) {
        ctx.globalCompositeOperation = modoLuz;
        for (let g = 0; g < 2; g++) {
          const s = (tSec * 0.58 + fase + g * 0.5) % 1;
          const pt = pontoBezierQuad(u.x, u.y, mx, my, esp.x, esp.y, s);
          const rgbG = esp.aprovado ? [251, 191, 36] : corSeivaRGB(0.25 + s * 0.65, p.escuro);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = rgba(rgbG, p.escuro ? 0.92 : 0.78);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (!focoNo && !pausado && progSeiva > 0.36 && progSeiva < 1.08) {
        // Onda global de seiva percorrendo todos os filamentos a cada batimento de 7,5 s
        const s = (progSeiva - 0.36) / 0.66;
        if (s >= 0 && s <= 1) {
          ctx.globalCompositeOperation = modoLuz;
          const pt = pontoBezierQuad(u.x, u.y, mx, my, esp.x, esp.y, s);
          const rgbO = corSeivaRGB(0.35 + s * 0.65, p.escuro);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.55, 0, Math.PI * 2);
          ctx.fillStyle = rgba(rgbO, p.escuro ? 0.42 : 0.28);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 8. Orbe cardíaco refrativo central ("Da floresta à molécula")
    const rOrbe = (L >= 420 ? 15.5 : 13.0) * (1 + 0.14 * batida);
    ctx.save();
    ctx.globalCompositeOperation = modoLuz;
    const gAura = ctx.createRadialGradient(cx, cy, 2, cx, cy, rOrbe * 2.7);
    gAura.addColorStop(0, p.escuro ? 'rgba(251, 191, 36, 0.92)' : 'rgba(184, 116, 9, 0.48)');
    gAura.addColorStop(0.36, p.escuro ? 'rgba(52, 211, 153, 0.52)' : 'rgba(28, 122, 84, 0.24)');
    gAura.addColorStop(0.72, p.escuro ? 'rgba(34, 211, 238, 0.18)' : 'transparent');
    gAura.addColorStop(1, 'transparent');
    ctx.fillStyle = gAura;
    ctx.beginPath();
    ctx.arc(cx, cy, rOrbe * 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Esfera de vidro bioluminescente central + reflexo especular
    const gEsfera = ctx.createRadialGradient(cx - rOrbe * 0.28, cy - rOrbe * 0.28, 1, cx, cy, rOrbe);
    gEsfera.addColorStop(0, p.heart);
    gEsfera.addColorStop(0.42, p.ouro);
    gEsfera.addColorStop(0.88, p.escuro ? '#0f5e43' : '#115238');
    gEsfera.addColorStop(1, p.escuro ? '#082920' : '#0b3826');
    ctx.beginPath();
    ctx.arc(cx, cy, rOrbe * 0.64, 0, Math.PI * 2);
    ctx.fillStyle = gEsfera;
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = p.escuro ? 'rgba(234, 255, 246, 0.65)' : 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();

    // 9. Orbes-joia das 9 UFs da Amazônia Legal (siglas centralizadas dentro da joia + arco de riqueza)
    ctx.font = `600 ${L >= 440 ? '9.5px' : '8.5px'} "Geist Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pulsoChegadaUF = rFrenteSeiva > 0 ? Math.exp(-Math.pow((rUF - rFrenteSeiva) / 20, 2)) : 0;

    for (const u of nosUF) {
      const emFoco = focoNo === u;
      const conectado = !focoNo || emFoco || (focoNo.tipo === 'especie' && focoNo.ufs.includes(u.sigla));
      const rr = u.r + (emFoco ? 2.2 : 0) + pulsoChegadaUF * 1.4;

      ctx.save();
      ctx.globalAlpha = conectado ? 1 : 0.28;

      if ((emFoco || pulsoChegadaUF > 0.12) && p.escuro) {
        const gUF = ctx.createRadialGradient(u.x, u.y, rr * 0.5, u.x, u.y, rr * 2.1);
        gUF.addColorStop(0, `rgba(56, 217, 245, ${(emFoco ? 0.38 : pulsoChegadaUF * 0.32).toFixed(3)})`);
        gUF.addColorStop(1, 'transparent');
        ctx.fillStyle = gUF;
        ctx.beginPath();
        ctx.arc(u.x, u.y, rr * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Corpo vítreo escuro/claro do orbe da UF
      ctx.beginPath();
      ctx.arc(u.x, u.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = p.fundoNo;
      ctx.fill();
      ctx.lineWidth = emFoco ? 2.1 : 1.15;
      ctx.strokeStyle = emFoco ? p.ouro : (p.escuro ? 'rgba(56, 217, 245, 0.42)' : 'rgba(12, 89, 105, 0.35)');
      ctx.stroke();

      // Arco proporcional de riqueza taxonômica ao redor do orbe
      if (u.frac > 0) {
        ctx.beginPath();
        ctx.arc(u.x, u.y, rr + 2.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.08, u.frac));
        ctx.strokeStyle = emFoco ? p.ouro : p.uf;
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Sigla perfeitamente centrada dentro da joia (zero colisão com raios ou filamentos)
      ctx.fillStyle = p.tinta;
      ctx.fillText(u.sigla, u.x, u.y + 0.5);
      ctx.restore();
    }

    // 10. Coroa externa: Joias de espécies documentadas + linhas-guia e rótulos Fraunces Italic
    const pulsoChegadaEsp = rFrenteSeiva > 0 ? Math.exp(-Math.pow((rEsp - rFrenteSeiva) / 24, 2)) : 0;
    let ultimoYDir = -999, ultimoYEsq = -999;

    // Pré-seleciona quais rótulos exibir sem empilhamento vertical
    const mostrarRotulo = new Set();
    if (focoNo?.tipo === 'especie') mostrarRotulo.add(focoNo.id);
    if (L >= 390) {
      const ordenadosY = [...nosEsp].sort((a, b) => a.y - b.y);
      for (const esp of ordenadosY) {
        const conectado = !focoNo || focoNo === esp || (focoNo.tipo === 'uf' && esp.ufs.includes(focoNo.sigla));
        if (!conectado) continue;
        if (!focoNo && esp.r < 5.9 && !esp.aprovado) continue;
        const dir = Math.cos(esp.ang) >= 0;
        if (dir) {
          if (esp.y - ultimoYDir >= 15.5) { mostrarRotulo.add(esp.id); ultimoYDir = esp.y; }
        } else if (esp.y - ultimoYEsq >= 15.5) {
          mostrarRotulo.add(esp.id); ultimoYEsq = esp.y;
        }
      }
    }

    for (const esp of nosEsp) {
      const emFoco = focoNo === esp;
      const conectado = !focoNo || emFoco || (focoNo.tipo === 'uf' && esp.ufs.includes(focoNo.sigla));
      const rgb = rgbGrupo(esp.grupo, p.escuro);
      const rr = esp.r + (emFoco ? 2.4 : 0) + (conectado ? pulsoChegadaEsp * 1.8 : 0);

      ctx.save();
      ctx.globalAlpha = conectado ? 1 : 0.22;

      // Halo bioluminescente da joia da espécie
      if (p.escuro && conectado) {
        const gJ = ctx.createRadialGradient(esp.x, esp.y, 0.5, esp.x, esp.y, rr * (emFoco ? 3.2 : 2.3));
        gJ.addColorStop(0, rgba(rgb, emFoco ? 0.62 : 0.34 + pulsoChegadaEsp * 0.34));
        gJ.addColorStop(1, 'transparent');
        ctx.fillStyle = gJ;
        ctx.beginPath();
        ctx.arc(esp.x, esp.y, rr * (emFoco ? 3.2 : 2.3), 0, Math.PI * 2);
        ctx.fill();
      }

      // Anel dourado duplo para espécie ligada a fármaco aprovado
      if (esp.aprovado) {
        ctx.beginPath();
        ctx.arc(esp.x, esp.y, rr + 3.4, 0, Math.PI * 2);
        ctx.strokeStyle = p.ouro;
        ctx.lineWidth = emFoco ? 1.7 : 1.25;
        ctx.stroke();
      }

      // Joia principal + núcleo especular
      ctx.beginPath();
      ctx.arc(esp.x, esp.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(rgb, 0.96);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(esp.x - rr * 0.25, esp.y - rr * 0.25, Math.max(1.1, rr * 0.34), 0, Math.PI * 2);
      ctx.fillStyle = p.escuro ? 'rgba(245, 255, 250, 0.85)' : 'rgba(255, 255, 255, 0.78)';
      ctx.fill();

      // Rótulo botânico/zoológico com fina linha-guia radial
      if (mostrarRotulo.has(esp.id)) {
        const dir = Math.cos(esp.ang) >= 0 ? 1 : -1;
        const x0 = esp.x + Math.cos(esp.ang) * (rr + 2.5);
        const y0 = esp.y + Math.sin(esp.ang) * (rr + 2.5);
        const x1 = esp.x + Math.cos(esp.ang) * (rr + 8.5);
        const y1 = esp.y + Math.sin(esp.ang) * (rr + 8.5);
        const x2 = x1 + dir * 6;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.strokeStyle = emFoco ? p.ouro : (p.escuro ? 'rgba(149, 178, 160, 0.42)' : 'rgba(63, 87, 76, 0.42)');
        ctx.lineWidth = 0.9;
        ctx.stroke();

        ctx.font = `${emFoco ? '600 ' : ''}italic ${L >= 460 ? '11px' : '10px'} "Fraunces", Georgia, serif`;
        ctx.textAlign = dir > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = emFoco ? p.tinta : p.tintaSuave;
        ctx.fillText(esp.curto, x2 + dir * 3.5, y1);
      }
      ctx.restore();
    }
  }

  function acharNo(mx, my) {
    let melhor = null, dMin = 22;
    for (const n of todosNos) {
      const d = Math.hypot(mx - n.x, my - n.y);
      if (d < Math.max(15, n.r + 7) && d < dMin) { melhor = n; dMin = d; }
    }
    return melhor;
  }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    cursor = { x: mx, y: my, ativo: true };
    if (!movimentoPausado()) {
      const ult = rastro[rastro.length - 1];
      if (!ult || Math.hypot(mx - ult.x, my - ult.y) > 4) {
        rastro.push({ x: mx, y: my, t: performance.now() });
        if (rastro.length > 16) rastro.shift();
      }
    }
    const achado = acharNo(mx, my);
    if (achado !== focoNo) {
      focoNo = achado;
      canvas.style.cursor = focoNo ? 'pointer' : 'crosshair';
      atualizarTextoStatus(focoNo);
      if (movimentoPausado()) desenhar(performance.now());
    }
  });
  canvas.addEventListener('pointerleave', () => {
    cursor.ativo = false;
    if (focoNo) {
      focoNo = null;
      atualizarTextoStatus(null);
      if (movimentoPausado()) desenhar(performance.now());
    }
  });
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const achado = acharNo(mx, my);
    if (achado && aoNavegar) {
      aoNavegar(achado.href);
    } else if (!movimentoPausado()) {
      ondasClique.push({ x: mx, y: my, t0: performance.now() });
      if (ondasClique.length > 4) ondasClique.shift();
    }
  });
  canvas.addEventListener('keydown', (e) => {
    if (!todosNos.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = focoNo ? todosNos.indexOf(focoNo) : -1;
      focoNo = todosNos[(idx + 1) % todosNos.length];
      atualizarTextoStatus(focoNo);
      desenhar(performance.now());
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = focoNo ? todosNos.indexOf(focoNo) : 0;
      focoNo = todosNos[(idx - 1 + todosNos.length) % todosNos.length];
      atualizarTextoStatus(focoNo);
      desenhar(performance.now());
    } else if ((e.key === 'Enter' || e.key === ' ') && focoNo && aoNavegar) {
      e.preventDefault();
      aoNavegar(focoNo.href);
    }
  });

  function loop(t) {
    if (!canvas.isConnected) return;
    if (!document.hidden && !palco.closest('[hidden]')) desenhar(t);
    if (!movimentoPausado()) raf = requestAnimationFrame(loop);
  }
  function iniciar() {
    cancelAnimationFrame(raf);
    calcularGeometria();
    atualizarTextoStatus(focoNo);
    desenhar(performance.now());
    if (!movimentoPausado()) raf = requestAnimationFrame(loop);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    if (!canvas.isConnected) { ro.disconnect(); return; }
    calcularGeometria();
    desenhar(performance.now());
  }) : null;
  ro?.observe(palco);

  const aoMudar = () => { if (canvas.isConnected) iniciar(); };
  window.addEventListener('bmb:tema', aoMudar);
  window.addEventListener('bmb:movimento', aoMudar);
  iniciar();
}

/** Anima contadores numéricos [data-contar] com suavização cúbica. */
export function animarContadores(raiz) {
  if (!raiz) return;
  const alvos = raiz.querySelectorAll('[data-contar]');
  if (!alvos.length) return;
  if (movimentoPausado()) {
    alvos.forEach((el) => { el.textContent = fmtInt(Number(el.dataset.contar)); });
    return;
  }
  const t0 = performance.now(), dur = 680;
  const itens = [...alvos].map((el) => ({ el, fim: Number(el.dataset.contar) || 0 }));
  function passo(t) {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    for (const { el, fim } of itens) {
      if (el.isConnected) el.textContent = fmtInt(Math.round(fim * e));
    }
    if (k < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

const EIXOS_RADAR = [
  ['identidade_biologica', 'BIO'],
  ['procedencia', 'PROC'],
  ['identidade_quimica', 'QUÍM'],
  ['qualidade_experimental', 'EXP'],
  ['rastreabilidade', 'RAST'],
  ['reutilizacao', 'LIC'],
  ['sensibilidade', 'ÉTIC'],
];
const PESO_ESTADO = { atende: 1, parcial: 0.56, nao_se_aplica: 0.3, nao_avaliado: 0.24, ausente: 0.12 };

/** Radar SVG das sete dimensões de completude do registro (acompanha a tabela acessível). */
export function svgRadarProntidao(prontidao) {
  if (!prontidao) return '';
  const cx = 80, cy = 82, R = 50;
  const ponto = (i, f) => {
    const a = -Math.PI / 2 + (i / EIXOS_RADAR.length) * Math.PI * 2;
    return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f];
  };
  const poligono = (f) => EIXOS_RADAR.map((_, i) => ponto(i, f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const verts = EIXOS_RADAR.map(([k], i) => ponto(i, PESO_ESTADO[prontidao[k]] ?? 0.24));
  const area = verts.map((v) => v.map((n) => n.toFixed(1)).join(',')).join(' ');

  const eixos = EIXOS_RADAR.map(([k, rot], i) => {
    const [x1, y1] = ponto(i, 1);
    const [lx, ly] = ponto(i, 1.27);
    const [vx, vy] = verts[i];
    const est = prontidao[k];
    const cor = est === 'atende' ? 'var(--verde)' : est === 'parcial' ? 'var(--ouro)' : 'var(--ink3)';
    return `<line x1="${cx}" y1="${cy}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--linha2)" stroke-width="0.8"/>`
      + `<circle cx="${vx.toFixed(1)}" cy="${vy.toFixed(1)}" r="2.8" fill="${cor}"/>`
      + `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" fill="var(--ink3)" font-size="8.5" font-family="var(--mono)">${esc(tr(rot))}</text>`;
  }).join('');

  return bruto(`<div class="prontidao-radar" aria-hidden="true">
    <svg viewBox="0 0 160 164" focusable="false">
      <polygon points="${poligono(1)}" fill="none" stroke="var(--linha2)" stroke-width="0.9"/>
      <polygon points="${poligono(0.56)}" fill="none" stroke="var(--linha)" stroke-width="0.8" stroke-dasharray="2 2"/>
      <polygon points="${area}" fill="var(--brilho-verde)" stroke="var(--verde)" stroke-width="1.6"/>
      ${eixos}
    </svg>
  </div>`);
}
