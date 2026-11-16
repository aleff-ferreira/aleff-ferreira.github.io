// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Busca global: espécies (nome científico, popular, sinônimo), moléculas e estados.
// Padrão ARIA combobox/listbox: setas, Enter, Escape. O índice de moléculas só é baixado quando preciso.
import { esc, semAcento, debounce, anunciar, tr, trn, GRUPOS } from './util.js';
import * as dados from './dados.js';

const LIMITE = { uf: 3, taxon: 7, molecula: 7 };

function pontuar(chave, tokens, nomeNorm) {
  if (!tokens.every((t) => chave.includes(t))) return -1;
  const q = tokens.join(' ');
  if (nomeNorm === q) return 100;
  if (nomeNorm.startsWith(q)) return 80;
  if (nomeNorm.split(/[\s\-(),]+/).some((w) => w.startsWith(tokens[0]))) return 60;
  return 30;
}

/** Destaca no texto original o primeiro token encontrado (só quando a normalização preserva o comprimento). */
function destacar(texto, tokens) {
  const norm = semAcento(texto);
  if (norm.length !== texto.length) return esc(texto);
  let melhor = null;
  for (const t of tokens) {
    const i = norm.indexOf(t);
    if (i >= 0 && (!melhor || i < melhor.i)) melhor = { i, n: t.length };
  }
  if (!melhor) return esc(texto);
  return `${esc(texto.slice(0, melhor.i))}<mark>${esc(texto.slice(melhor.i, melhor.i + melhor.n))}</mark>${esc(texto.slice(melhor.i + melhor.n))}`;
}

export function criarBusca({ entrada, lista, ufs, aoEscolher }) {
  let taxa = null, mols = null, molsPromessa = null;
  let opcoes = [], ativo = -1;

  let sinonimosExtras = false, indiceCompleto = false;
  const indexarTaxa = (ix) => {
    taxa = ix.lista.map((t) => ({
      t, nomeNorm: semAcento(t.nome),
      chave: semAcento([t.nome, ...(t.populares || []), ...(t.sinonimos || [])].join(' | ')),
    }));
  };
  dados.indiceMapa().then(indexarTaxa);
  const carregarSinonimosExtras = () => {
    if (!indiceCompleto) {
      indiceCompleto = true;
      dados.indice().then((ix) => { indexarTaxa(ix); if (entrada.value.trim().length >= 2) buscar(); }).catch(() => { indiceCompleto = false; });
    }
    if (sinonimosExtras || !taxa) return;
    sinonimosExtras = true;
    dados.indiceSinonimos().then((sx) => {
      const por = sx?.por_gbif || {};
      for (const item of taxa) {
        const todos = por[String(item.t.gbif)];
        if (todos?.length) {
          item.chave = semAcento([item.t.nome, ...(item.t.populares || []), ...todos].join(' | '));
        }
      }
      if (entrada.value.trim().length >= 2) buscar();
    }).catch(() => { sinonimosExtras = false; });
  };
  const carregarMols = () => {
    if (!molsPromessa) {
      molsPromessa = dados.indiceMoleculas().then((ix) => {
        mols = ix.lista.map((m) => ({ m, nomeNorm: semAcento(m.nome), chave: semAcento(m.nome) }));
        if (entrada.value.trim().length >= 2) buscar();
      }).catch(() => { molsPromessa = null; });
    }
    return molsPromessa;
  };
  const ufsNorm = ufs.map((u) => ({ u, nomeNorm: semAcento(u.n), chave: semAcento(`${u.n} ${u.s}`) }));

  function resultados(q) {
    const tokens = semAcento(q).trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const grupo = (arr, tipo, f) => arr.map((x) => ({ x, p: pontuar(x.chave, tokens, x.nomeNorm) })).filter((r) => r.p >= 0)
      .sort((a, b) => b.p - a.p || f(b.x) - f(a.x)).slice(0, LIMITE[tipo]);
    const saida = [];
    for (const { x } of grupo(ufsNorm, 'uf', () => 0)) {
      saida.push({ tipo: 'uf', ic: 'territorio', id: x.u.s, rotulo: x.u.n, sub: x.u.s, href: `#/uf/${x.u.s}`, tokens });
    }
    if (taxa) {
      for (const { x } of grupo(taxa, 'taxon', (o) => o.t.recorte * 1000 + o.t.moleculas)) {
        const t = x.t;
        const g = GRUPOS[t.grupo] || GRUPOS.O;
        saida.push({
          tipo: 'taxon', ic: g.icone, id: t.gbif, rotulo: t.nome, italico: true,
          sub: (t.populares && t.populares[0]) || tr(g.rotulo) || '',
          href: `#/especie/${t.gbif}`, tokens, aviso: t.recorte ? '' : tr('fora do recorte'),
        });
      }
    }
    if (mols) {
      for (const { x } of grupo(mols, 'molecula', (o) => o.m.taxa * 10 + o.m.atividades)) {
        saida.push({
          tipo: 'molecula', ic: 'molecula', id: x.m.id, rotulo: x.m.nome,
          sub: trn(x.m.taxa, '{n} táxon', '{n} táxons'), href: `#/molecula/${x.m.id}`, tokens,
        });
      }
    }
    return saida;
  }

  const TITULOS = { uf: 'Estados', taxon: 'Espécies', molecula: 'Moléculas' };
  function desenhar(q, lista_) {
    opcoes = lista_;
    ativo = -1;
    entrada.removeAttribute('aria-activedescendant');
    if (!q.trim()) { fechar(); return; }
    let h = '', ultimo = null, i = 0;
    for (const o of lista_) {
      if (o.tipo !== ultimo) { h += `<li class="grupo" role="presentation">${esc(tr(TITULOS[o.tipo]))}</li>`; ultimo = o.tipo; }
      h += `<li role="option" id="op-${i}" data-i="${i}" aria-selected="false">
        <svg class="ic op-ic" aria-hidden="true" focusable="false"><use href="#i-${o.ic}"/></svg>
        <span class="${o.italico ? 'it' : ''}">${destacar(o.rotulo, o.tokens)}</span>
        <small>${esc(o.sub)}${o.aviso ? ` · ${esc(o.aviso)}` : ''}</small></li>`;
      i++;
    }
    const carregandoMols = !mols && q.trim().length >= 2;
    if (!lista_.length) h += `<li class="vazio" role="presentation">${esc(carregandoMols ? tr('Carregando moléculas…') : tr('Nenhum resultado para “{q}”.', { q }))}</li>`;
    else if (carregandoMols) h += `<li class="vazio" role="presentation">${esc(tr('Carregando moléculas…'))}</li>`;
    lista.innerHTML = h;
    lista.hidden = false;
    entrada.setAttribute('aria-expanded', 'true');
  }
  function fechar() { lista.hidden = true; entrada.setAttribute('aria-expanded', 'false'); entrada.removeAttribute('aria-activedescendant'); ativo = -1; }
  function marcar(novo) {
    const itens = lista.querySelectorAll('[role="option"]');
    if (!itens.length) return;
    ativo = (novo + itens.length) % itens.length;
    itens.forEach((el, i) => el.setAttribute('aria-selected', String(i === ativo)));
    entrada.setAttribute('aria-activedescendant', itens[ativo].id);
    itens[ativo].scrollIntoView({ block: 'nearest' });
  }
  function escolher(i) {
    const o = opcoes[i];
    if (!o) return;
    fechar();
    entrada.value = '';
    aoEscolher(o);
    entrada.blur();
  }
  const buscar = () => {
    const q = entrada.value;
    desenhar(q, resultados(q));
    if (q.trim().length >= 2) {
      const n = resultados(q).length;
      anunciar(n ? trn(n, '{n} sugestão. Use as setas para escolher.', '{n} sugestões. Use as setas para escolher.') : tr('Nenhuma sugestão.'));
    }
  };
  const buscarAtrasado = debounce(buscar, 90);

  entrada.addEventListener('input', () => { if (entrada.value.trim().length >= 2) { carregarMols(); carregarSinonimosExtras(); } buscarAtrasado(); });
  entrada.addEventListener('focus', () => { if (entrada.value.trim()) buscar(); });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) buscar(); marcar(ativo + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(ativo - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (ativo >= 0) escolher(ativo);
      else if (opcoes.length) escolher(0);
    } else if (e.key === 'Escape') { if (!lista.hidden) { e.preventDefault(); fechar(); } else entrada.value = ''; }
  });
  lista.addEventListener('pointerdown', (e) => { e.preventDefault(); });
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) escolher(Number(li.dataset.i));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.busca')) fechar(); });
  entrada.addEventListener('blur', () => setTimeout(fechar, 120));

  // atalho: "/" foca a busca
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')) {
      e.preventDefault(); entrada.focus();
    }
  });
  // aquece o índice de moléculas quando o navegador está ocioso e a conexão não é lenta
  (window.requestIdleCallback || ((f) => setTimeout(f, 2500)))(() => { if (!navigator.connection?.saveData) carregarMols(); }, { timeout: 4000 });
}
