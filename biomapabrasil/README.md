# Site do BioMapaBrasil

Site estático, sem build e sem framework: HTML, CSS e módulos JavaScript (ES2022). Funciona em qualquer hospedagem de arquivos estáticos. Lê os pacotes de `dados/`, gerados por `python -m bmb exportar` (ver `../nucleo/README.md`). As formas dos dados estão em `../docs/MODELO_DE_DADOS.md`, seção 9.

> BioMapaBrasil é um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.

## Rodar

```bash
python nucleo/servir.py        # servidor estático de desenvolvimento, sem cache
python -m bmb servir           # o mesmo, mais a API em /api/docs (precisa do pacote bmb e do banco)
```

Qualquer servidor de arquivos serve (`python -m http.server --directory app`). Abrir o `index.html` direto do disco (`file://`) não funciona: os módulos JavaScript e os `fetch` exigem `http`.

## Estrutura

```
index.html                    esqueleto, sprite de ícones, CSP
css/app.css                   tokens de tema (claro e escuro), layout, componentes
js/main.js                    inicialização, roteador por hash, trilha, eventos do painel
js/mapa.js                    mapa SVG: relevo, estados, rios, lacunas; zoom, arrasto, teclado
js/busca.js                   combobox de busca (espécies, moléculas, estados)
js/perfis.js                  visão geral, estado, espécie, molécula (HTML com valores escapados)
js/constelacao.js             grafo de estados e espécies, contadores, radar de completude
js/dados.js                   acesso aos pacotes, com cache em memória
js/util.js                    escape de HTML, números e datas por idioma, vocabulário do contrato, tradução
js/viz/paginas.js             tabelas de espécies e de moléculas, lacunas, fontes e método, dados abertos, sobre
js/viz/galaxia_quimica.js     espaço químico (com galaxia_3d.js)
js/viz/fluxo_farmacologico.js fluxos e linhagens
js/viz/raiox_floresta.js      estratos florestais
js/viz/filoquimica.js         quimiotaxonomia
js/viz/estrutura3d.js         visualizador 3D de estruturas
js/viz/terreno_gl.js          relevo WebGL do mapa
js/viz/estilos_obs.js         estilos das visualizações, injetados sob demanda
sw.js                         service worker (abre sem rede depois da primeira visita)
manifest.webmanifest          instalável como app
dados/                        pacotes gerados (não editar à mão)
```

A interface é escrita em pt-BR. A versão em inglês usa `nucleo/semente/i18n/en.json`, em que cada chave é o texto em pt-BR:

- `traduzirDOM` troca o texto fixo do HTML e `tr()` traduz o texto montado em JavaScript, preenchendo os marcadores `{nome}`;
- `trDado()` traduz o texto que vem dos dados. Rótulos e avisos fixos (manifesto, visualizações) entram pelo texto inteiro. Enunciados gerados por modelo entram pelos padrões: as chaves com marcadores, como `«{mol}» consta como relatado em {taxon}, com {n} publicações associadas no {fonte}.`, casam com o enunciado e o que cada marcador captura vai para o modelo em inglês;
- `trTermos()` trata termo a termo o vocabulário de forma de vida e habitat dos catálogos: escreve por extenso os códigos do CTFB e, em inglês, traduz cada termo pelo dicionário. `trPartes()` traduz os nomes de fonte.

Quando o exportador muda um texto fixo ou um modelo de enunciado, a chave correspondente do dicionário muda junto; sem chave, o texto aparece em pt-BR.

## Rotas (links compartilháveis)

| Endereço | Mostra |
|---|---|
| `#/` | visão geral e mapa do Brasil |
| `#/uf/PA` | estado: táxons do banco com registro nele |
| `#/especie/5220775` | perfil da espécie (chave do GBIF) |
| `#/especie/5220775/molecula/4` | molécula no contexto da espécie |
| `#/molecula/72` | molécula sem contexto |
| `#/especies?g=P&uf=AM&q=andiroba&coleta=1&curador=1` | tabela de espécies (alternativa ao mapa) |
| `#/moleculas?aprov=1&coleta=1` | tabela de moléculas |
| `#/galaxia`, `#/fluxo`, `#/floresta`, `#/filoquimica` | espaço químico, fluxos e linhagens, estratos florestais, quimiotaxonomia |
| `#/lacunas` | lacunas de amostragem |
| `#/fontes`, `#/dados`, `#/sobre` | fontes e método, dados abertos, sobre |

## Acessibilidade

- `lang="pt-BR"`, pontos de referência (`header`, `nav`, `main`, `aside`, `footer`), link "Pular para o conteúdo".
- Busca como combobox ARIA (`aria-expanded`, `aria-activedescendant`, `listbox`/`option`); `/` foca a busca.
- Mapa: cada estado é focável (`Tab`) e abre com `Enter`; as setas movem, `+` e `-` aproximam, `0` mostra o Brasil; o mesmo conteúdo existe em lista e em tabela (`#/especies`).
- O foco vai para o título do painel a cada mudança de rota; a região `aria-live` anuncia mudanças.
- `prefers-reduced-motion`: sem animação de rios, sem transição de câmera, sem inclinação animada.
- Temas claro e escuro com contraste AA conferido por teste (`nucleo/testes/test_site_estatico.py`); nada depende só de cor; `forced-colors` tratado.
- Estruturas químicas com nome acessível; fotografias com `alt` e crédito.
- Sem fonte remota e sem terceiros: a CSP (`default-src 'self'`) bloqueia qualquer recurso externo.

## Desempenho

Meta: 400 kbps, 400 ms por viagem, Android de entrada. `python -m bmb orcamento` mede a primeira tela (HTML, CSS, JS, índice, estados, relevo pequeno, com gzip) e os pacotes que abrem depois, e falha se algum passar do limite.

| Item | Limite (gzip) |
|---|---|
| Primeira tela | 170 KB |
| Maior pacote de táxon | 45 KB |
| Maior pacote de molécula | 20 KB |
| Índice de moléculas | 160 KB |
| Primeira tela estimada a 400 kbps | 8 s |

- índice de táxons enxuto na primeira tela; índice de moléculas só quando se busca por elas;
- um pacote por táxon e por molécula, abertos sob demanda;
- relevo em WebP em duas resoluções (a maior só carrega se a conexão não for lenta nem `saveData`);
- camadas de rios e de lacunas baixadas só quando ligadas;
- miniaturas com `loading="lazy"`;
- service worker: índices com rede primeiro, pacotes com cache primeiro e atualização em segundo plano.

## Hospedar

Qualquer hospedagem estática serve. Recomendado: gzip ou brotli para `.json`, `.js`, `.css`, `.svg`; `Cache-Control: no-cache` para `index.html`, `sw.js` e `dados/indice.json`; cache longo para `dados/imagens/` e `dados/estruturas/`. O service worker exige HTTPS (localhost conta). A API (`python -m bmb servir`) é opcional: o site não depende dela.
