// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Service worker: o esqueleto do site fica em cache (abre sem rede) e os pacotes de dados, depois de vistos,
// também. Estratégia pensada para 400 kbps: dados JSON "usa o cache e atualiza em segundo plano";
// imagens, estruturas e fontes "cache primeiro". Os índices de topo e o dicionário de tradução sempre tentam a rede antes
// (versão nova dos dados).
const VERSAO = 'bmb-v21';
const ESQUELETO = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icones/icone.svg',
  'js/main.js', 'js/util.js', 'js/dados.js', 'js/mapa.js', 'js/busca.js', 'js/constelacao.js', 'js/perfis.js',
  'fontes/fraunces-normal-latin.woff2', 'fontes/geist-latin.woff2', 'fontes/geist-mono-latin.woff2',
];
const LIMITE_DADOS = 600;   // pacotes de táxon e molécula guardados; os mais antigos saem primeiro

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO + '-esqueleto').then((c) => c.addAll(ESQUELETO.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function aparar(cache) {
  const chaves = await cache.keys();
  for (let i = 0; i < chaves.length - LIMITE_DADOS; i++) await cache.delete(chaves[i]);
}
async function redeEAtualiza(req, nomeCache) {
  const cache = await caches.open(nomeCache);
  const resposta = await fetch(req);
  if (resposta.ok) { cache.put(req, resposta.clone()); aparar(cache); }
  return resposta;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // nada de terceiros: o site não os usa

  if (req.mode === 'navigate') {                                    // página: rede primeiro, esqueleto se estiver sem rede
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  const caminho = url.pathname;
  if (/\/dados\/(indice|indice_mapa|sinonimos_indice|moleculas_indice|manifesto|territorios)\.json$/.test(caminho)
      || /\/dados\/i18n\/.+\.json$/.test(caminho)) {
    // índices e dicionário de tradução: rede primeiro, para acompanharem a versão dos dados já na primeira visita
    e.respondWith(redeEAtualiza(req, VERSAO + '-dados').catch(() => caches.match(req)));
    return;
  }
  if (/\/dados\/(taxa|moleculas|moleculas_lotes|estruturas_lotes|estruturas3d_lotes|viz|estruturas3d)\/.+\.json$/.test(caminho) || /\/dados\/geo\//.test(caminho)) {
    e.respondWith(caches.match(req).then((c) => {
      const atualiza = redeEAtualiza(req, VERSAO + '-dados').catch(() => c);
      return c || atualiza;                                          // cache primeiro, atualiza em segundo plano
    }));
    return;
  }
  if (/\/dados\/(imagens|estruturas)\//.test(caminho) || /\/fontes\//.test(caminho)) {
    e.respondWith(caches.match(req).then((c) => c || redeEAtualiza(req, VERSAO + '-midia')));
    return;
  }
  // esqueleto (HTML, CSS, JS): usa o cache e atualiza em segundo plano, para que a versão nova chegue na visita seguinte
  e.respondWith(caches.open(VERSAO + '-esqueleto').then(async (cache) => {
    const guardado = await cache.match(req);
    const rede = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => guardado);
    return guardado || rede;
  }));
});
