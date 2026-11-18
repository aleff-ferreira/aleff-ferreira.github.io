// BioMapaBrasil, um produto da Amazonia Works. Licenciado conforme LICENSE e NOTICE.md.
// Dossiê molecular completo (`#/molecula/:id` e `#/especie/:gbif/molecula/:id`), carregado sob demanda.
import {
  html, bruto, icone, tr, trn, trDado, trPartes, fmtInt, fmtDec, fmtFixo, fmtSig, fmtData,
  GRUPO_POR_CHAVE, TIPO_MOL_POR_NOME, TIPO_ENSAIO, rotulo, ehInchiKey, nomeMolecula, tituloObra,
} from '../util.js';
import {
  link, fonteLinha, badgeEvidencia, procedenciaNaLista, procedenciaNoDetalhe, refItem, listaRefs,
  blocoPassagem, matrizProntidao, badgeFarmaco, badgePains, BASE_DE_ORIGEM,
} from '../perfis.js';

function externos(pack) {
  const i = pack.ids || {};
  const ls = [];
  if (i.pubchem) ls.push(link(`https://pubchem.ncbi.nlm.nih.gov/compound/${i.pubchem}`, `PubChem ${i.pubchem}`));
  if (i.chembl) ls.push(link(`https://www.ebi.ac.uk/chembl/compound_report_card/${i.chembl}/`, `ChEMBL ${i.chembl}`));
  if (i.lotus) ls.push(link(`https://lotus.naturalproducts.net/compound/lotus_id/${i.lotus}`, `LOTUS ${i.lotus}`));
  if (i.nubbe) ls.push(html`<button type="button" class="btn-copiar" data-copiar="${i.nubbe}" data-rotulo="NuBBE" title="${tr('Portal externo NuBBE instável; clique para copiar o código')}">${icone('copiar')}NuBBE ${i.nubbe}</button>`);
  if (i.npatlas) ls.push(link(`https://www.npatlas.org/explore/compounds/${i.npatlas}`, `NPAtlas ${i.npatlas}`));
  if (i.uniprot) ls.push(link(`https://www.uniprot.org/uniprotkb/${i.uniprot}/entry`, `UniProt ${i.uniprot}`));
  for (const p of i.pdb || []) ls.push(link(`https://www.rcsb.org/structure/${p}`, `PDB ${p}`));
  return ls;
}

/** «IC50 · mediana 141 nM · 4 medidas em 3 publicações · 100–200 nM»; com uma medida, «IC50 · 141 nM · 1 medida». */
function textoMedida(m) {
  if (!m) return '';
  const u = m.unidade ? ` ${m.unidade}` : '';
  const rel = m.relacao && m.relacao !== '=' ? `${m.relacao} ` : '';
  const partes = [m.tipo];
  if (m.valor != null) partes.push(m.n > 1 || m.agregacao === 'mediana' ? tr('mediana {v}', { v: fmtSig(m.valor) + u }) : rel + fmtSig(m.valor) + u);
  if (m.n === 1) partes.push(tr('1 medida'));
  else if (m.n > 1) {
    partes.push(m.n_publicacoes > 0
      ? tr(m.n_publicacoes === 1 ? '{n} medidas em 1 publicação' : '{n} medidas em {p} publicações', { n: fmtInt(m.n), p: fmtInt(m.n_publicacoes) })
      : tr('{n} medidas', { n: fmtInt(m.n) }));
    if (m.min != null && m.max != null && m.min !== m.max) partes.push(`${fmtSig(m.min)}–${fmtSig(m.max)}${u}`);
  }
  return partes.filter(Boolean).join(' · ');
}

const ALVO_QUALIFICADO = new Set(['complexo_proteico', 'familia_proteica', 'acido_nucleico']);
function rotuloAlvo(natureza) {
  if (natureza === 'proteina_unica') return tr('Alvo molecular');
  const qual = rotulo('natureza_alvo', natureza);
  if (ALVO_QUALIFICADO.has(natureza)) return tr('Alvo molecular ({natureza})', { natureza: qual });
  return qual ? qual.charAt(0).toUpperCase() + qual.slice(1) : tr('Sistema de ensaio');
}
function textoEnsaio(codigos) {
  const t = (codigos || '').split('+').filter(Boolean).map((c) => tr(TIPO_ENSAIO[c] || c)).join(' · ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function cartaoMedida(a, pack) {
  const alvo = a.alvo;
  const vias = alvo?.vias_reactome || [];
  const ensaio = textoEnsaio(a.ensaio_tipo) || trDado(a.metodo) || '';
  return html`<div class="medida">
    <span class="valor">${textoMedida(a.medida)}</span>
    ${alvo ? html`<span>${rotuloAlvo(alvo.natureza)}: <strong>${alvo.nome || alvo.chembl}</strong>${alvo.organismo && alvo.organismo !== alvo.nome ? html` (<em>${alvo.organismo}</em>)` : ''}${alvo.chembl ? html` · ${link(`https://www.ebi.ac.uk/chembl/target_report_card/${alvo.chembl}/`, alvo.chembl)}` : ''}</span>` : ''}
    ${vias.length ? html`<span class="s">${tr('Vias (Reactome)')}: ${vias.map((v, idx) => html`${idx ? ' · ' : ''}${link(`https://reactome.org/content/detail/${v.id}`, `${v.nome} (${v.id})`)}`)}</span>` : ''}
    ${ensaio ? html`<span class="sistema">${ensaio}</span>` : ''}
    ${a.sistema && a.medida?.n === 1 ? html`<span class="sistema">${tr('Descrição do ensaio no ChEMBL')}: ${a.sistema}</span>` : ''}
    <span class="s">${badgeEvidencia(a.evidencia)}</span>
    ${listaRefs(pack, a.refs)}
    ${blocoPassagem(a, pack)}
    ${matrizProntidao(a)}
  </div>`;
}

function linkObraLocal(r) {
  const aut = r.autores?.length ? r.autores[0] + (r.autores.length > 1 ? ' et al.' : '') : '';
  const url = r.doi ? `https://doi.org/${encodeURI(r.doi)}` : (r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(r.pmid)}/` : null);
  const base = aut || (r.doi ? `doi:${r.doi}` : r.pmid ? `PMID ${r.pmid}` : tr('obra citada'));
  const t = r.ano ? `${base} (${r.ano})` : base;
  return url ? link(url, t) : t;
}

/** Linhagem farmacológica: o texto da relação e a frase da obra citada, entre aspas, com a citação. */
function blocoLinhagem(ln, pack) {
  const ref = ln.refs?.length ? pack.refs[ln.refs[0]] : (typeof ln.referencia === 'number' ? pack.refs[ln.referencia] : ln.referencia) || null;
  const fonteTrecho = { resumo_pubmed: 'resumo no PubMed', texto_completo_europepmc: 'texto completo no Europe PMC' }[ln.trecho_fonte];
  const citacao = ref ? html`${linkObraLocal(ref)}${ref.titulo ? html`. ${tituloObra(ref.titulo)}` : ''}${fonteTrecho && ln.trecho ? ` (${tr(fonteTrecho)})` : ''}` : '';
  return html`<div class="linhagem">
    <p>${ln.parceiro ? html`<a href="#/molecula/${ln.parceiro.id}"><strong>${ln.parceiro.nome}</strong></a>. ` : ''}${trDado(ln.texto || '')}</p>
    ${ln.trecho ? html`<blockquote class="passagem">“${ln.trecho}”${citacao ? html`<cite>${citacao}</cite>` : ''}</blockquote>` : citacao ? html`<p class="fonte-linha">${citacao}</p>` : ''}
  </div>`;
}

function blocoClinico(pack, consultaFase) {
  const cl = pack.clinico;
  if (!cl) {
    if (!consultaFase) return '';
    const data = fmtData(consultaFase.data);
    return html`<p class="fonte-linha">${pack.fase.maxima != null
      ? tr('Fase clínica máxima no ChEMBL: {fase} (consulta de {data}).', { fase: pack.fase.maxima, data })
      : tr('O ChEMBL não registra fase clínica para esta molécula (consulta de {data}).', { data })}</p>`;
  }
  const fontes = cl.fontes_regulatorias || [];
  const jaDiz = /n[ãa]o (descreve )?o organismo/i.test(cl.enunciado || '');
  const jaDizRetirada = /retirada/i.test(cl.enunciado || '');
  const insumo = pack.fase?.categoria_clinica === 'metabolito_ou_insumo';
  return html`<div class="cartao destaque">
      <h4>${icone('farmaco')}${tr(insumo ? 'Metabólito primário ou insumo farmacêutico (fase 4 no ChEMBL)' : pack.fase?.retirado ? 'Fármaco aprovado, com retirada registrada' : 'Fármaco aprovado')}</h4>
      ${cl.evidencia ? html`<p class="evid-linha">${badgeEvidencia(cl.evidencia)}</p>` : ''}
      <p class="rotulo-campo">${tr('Indicações listadas pelo regulador')}</p>
      <p>${trDado(cl.enunciado)}</p>
      ${jaDiz ? '' : html`<p>${tr('As indicações descrevem o fármaco, não o organismo em que a molécula foi relatada.')}</p>`}
      ${fontes.length ? html`<p class="fonte-linha">${tr('Fontes regulatórias')}: ${fontes.map((f, i) => html`${i ? ' · ' : ''}${f.url ? link(f.url, [f.tipo, f.id].filter(Boolean).join(' ')) : [f.tipo, f.id].filter(Boolean).join(' ')}`)}</p>` : ''}
      ${pack.fase?.retirado && !jaDizRetirada ? html`<p class="fonte-linha">${tr('O ChEMBL registra retirada do mercado em ao menos uma jurisdição.')}</p>` : ''}
      ${blocoPassagem(cl, pack)}
      ${fonteLinha(pack, cl.consulta)}
      ${matrizProntidao(cl)}</div>`;
}

export function renderMolecula({ pack, taxonCtx }) {
  const tipo = tr(TIPO_MOL_POR_NOME[pack.tipo] || '');
  const ext = externos(pack);
  const massaMono = pack.massa_monoisotopica ?? pack.massa;
  const tem3d = (pack.estruturas_3d?.length || 0) > 0;
  const limites = {
    estereoquimica_indefinida: 'Estereoquímica incompleta na identidade de origem.',
    tamanho_ou_flexibilidade: 'Tamanho ou flexibilidade fora da faixa validada.',
    macrociclo: 'Macrociclo fora da faixa validada.',
    multicomponente: 'A estrutura contém mais de um componente.',
    elementos_ou_radical: 'Composição fora da faixa validada.',
    sem_parametros_mmff: 'Parâmetros MMFF94s indisponíveis.',
    identidade_ausente: 'Identidade química incompleta.', identidade_divergente: 'Identidade química sem confirmação.',
  };
  const estPrim = tem3d ? pack.estruturas_3d[0] : null;
  const ikNome = ehInchiKey(pack.nome);
  const tituloMol = nomeMolecula(pack.nome, pack.id);
  const irmaos = pack.mesma_conectividade || [];
  const irmaos3d = irmaos.filter((x) => x.tem_3d);
  const json3d = tem3d ? JSON.stringify(pack.estruturas_3d) : '';
  const jsonCons = tem3d ? JSON.stringify(pack.consultas || []) : '';
  const jsonMol = tem3d ? JSON.stringify({ id: pack.id, nome: tituloMol, formula: pack.formula, inchikey: pack.inchikey }) : '';
  const estrutura = html`<section class="mol-abertura" data-est-bloco data-vista="${tem3d ? '3d' : '2d'}" aria-labelledby="painel-titulo">
    <div class="mol-barra-topo">
      <button type="button" class="mol-voltar" data-voltar>${icone('voltar')}${tr('Voltar')}</button>
      ${tem3d && pack.estrutura ? html`<div class="alternador-vista" role="group" aria-label="${tr('Representação da estrutura')}">
        <button type="button" data-modo-est="3d" aria-pressed="true">3D</button>
        <button type="button" data-modo-est="2d" aria-pressed="false">2D</button></div>` : ''}
    </div>
    <header class="mol-cab-cena">
      <p class="mol-registro">${icone('molecula')}${tr('Molécula')} · BMB ${String(pack.id).padStart(5, '0')}</p>
      <h2 id="painel-titulo" tabindex="-1"${ikNome ? '' : bruto(' translate="no"')} class="${tituloMol.length > 38 ? 'nome-longo' : ''}">${tituloMol}</h2>
      <p class="mol-formula">${pack.formula ? html`<span aria-label="${pack.formula}">${pack.formula.split(/(\d+)/).map((t) => /^\d+$/.test(t) ? html`<sub>${t}</sub>` : t)}</span>` : ''}${massaMono ? html`<span>${fmtFixo(massaMono, 4)} Da</span>` : ''}</p>
      <p class="mol-natureza" data-cena-origem>${tem3d ? tr(estPrim.natureza === 'experimental' ? 'Estrutura experimental' : estPrim.natureza === 'predicao_computacional' ? 'Modelo predito' : 'Confôrmero calculado') : tr('Estrutura 3D indisponível')}</p>
    </header>
    ${tem3d ? html`<div data-painel-3d data-3d-auto="1" data-3d-mol="${jsonMol}" data-3d-json="${json3d}" data-3d-consultas="${jsonCons}"><div class="mol-espera" role="status">${tr('Carregando estrutura…')}</div></div>` : ''}
    <div class="mol-plana" data-painel-2d ${tem3d ? bruto('hidden') : ''}>
      ${pack.estrutura ? html`<div class="estrutura" data-svg="dados/${pack.estrutura}" role="img" aria-label="${tr('Estrutura química 2D de {nome}', { nome: tituloMol })}"></div>` : ''}
      <p role="status" data-fallback>${!tem3d ? tr('Sem coordenadas 3D verificadas para este registro.') : ''} ${limites[pack.limitacao_3d] ? tr(limites[pack.limitacao_3d]) : ''}${!tem3d && irmaos3d.length ? html` ${tr('Estereoisômero com estrutura 3D disponível')}: ${irmaos3d.slice(0, 3).map((s, idx) => html`${idx ? ', ' : ''}<a href="#/molecula/${s.id}">${nomeMolecula(s.nome, s.id)}</a>`)}.` : ''} ${pack.estrutura ? tr('Diagrama 2D · RDKit') : tr('Sem desenho 2D para esta molécula.')}</p>
    </div>
  </section>`;

  const ocorre = pack.ocorre_em || [];
  const funcoes = ocorre.filter((o) => o.afirmacao.tipo === 'funcao_toxina' && (o.afirmacao.passagem || o.afirmacao.passagem_origem));
  const totalOcorre = pack.total_ocorrencias ?? ocorre.length;
  const registrosDoTaxon = new Map();
  ocorre.forEach((o) => registrosDoTaxon.set(o.gbif, (registrosDoTaxon.get(o.gbif) || 0) + 1));
  const ocorreTxt = ocorre.length ? html`<ul class="lista">${ocorre.map((o) => {
    const fonte = o.afirmacao.fonte;
    const base = registrosDoTaxon.get(o.gbif) > 1 || !['lotus', 'uniprot'].includes(fonte) ? BASE_DE_ORIGEM[fonte] || fonte : '';
    const proc = html`${base ? html`<span class="proc">${tr('Base de origem: {lista}', { lista: base })}</span>` : ''}${procedenciaNaLista(o.afirmacao)}`.toString();
    return html`<li><a class="item ${taxonCtx && taxonCtx === o.gbif ? 'atual' : ''}" href="#/especie/${o.gbif}/molecula/${pack.id}">
      <span class="mini">${icone(GRUPO_POR_CHAVE[o.grupo]?.icone || 'planta')}</span>
      <span><span class="t" translate="no"><em>${o.nome}</em></span><span class="s">${o.popular ? html`<span translate="no">${o.popular}</span>` : ''}${badgeEvidencia(o.afirmacao.evidencia)}${o.no_recorte ? '' : html`<span class="badge fora">${tr('Fora do recorte')}</span>`}</span>
        ${proc ? html`<span class="s">${bruto(proc)}</span>` : ''}</span>
      <span class="d">${trn(o.afirmacao.refs.length, '{n} publicação', '{n} publicações')}</span></a></li>`;
  })}</ul>`
    : html`<div class="vazio-estado">${tr('Nenhum organismo do banco com registro desta molécula.')}</div>`;

  const atividades = pack.atividades || [];
  const totalAtiv = pack.total_atividades ?? atividades.length;
  const consultaFase = pack.fase?.consulta != null ? pack.consultas[pack.fase.consulta] : null;
  const insumo = pack.fase?.categoria_clinica === 'metabolito_ou_insumo';
  const nEst = pack.estereocentros, nIndef = pack.estereocentros_indefinidos || 0;
  const estereo = nEst == null ? '' : nEst === 0 ? tr('Nenhum estereocentro')
    : nIndef > 0 ? (nEst === 1 ? tr('1 estereocentro, sem configuração definida') : tr('{i} de {n} estereocentros sem configuração definida', { i: fmtInt(nIndef), n: fmtInt(nEst) }))
      : trn(nEst, '{n} estereocentro, com configuração definida', '{n} estereocentros, todos com configuração definida');
  const natureza3d = estPrim && {
    experimental: ['ok', '3D experimental', estPrim.fonte === 'cod' ? 'Crystallography Open Database' : 'wwPDB'],
    predicao_computacional: ['alerta', '3D predita', estPrim.metodo || ''],
    conformero_calculado: ['ind', 'Confôrmero 3D calculado', estPrim.metodo || 'RDKit ETKDGv3'],
  }[estPrim.natureza];
  const fq = pack.fisico_quimica;

  const corpo = html`
    ${estrutura}
    <div class="mol-dossie"><div class="cab-perfil">
      <h3 class="sec-titulo">${tr('Identidade química')}</h3>
      ${(!ikNome && pack.nome.length > 38) ? html`<p class="quebra-livre" translate="no">${pack.nome}</p>` : ''}
      ${ikNome ? html`<p class="fonte-linha mono quebra-livre">${pack.nome}</p>` : ''}
      <div class="chips"><span class="badge ind">${icone('molecula')}${tipo}</span>
        ${natureza3d ? html`<span class="badge ${natureza3d[0]}" title="${natureza3d[2]}">${icone('cubo')}${tr(natureza3d[1])}</span>` : ''}
        ${pack.clinico ? badgeFarmaco({ retirado: pack.fase?.retirado, insumo }) : ''}
        ${pack.pains?.length ? badgePains() : ''}
        ${pack.classe ? html`<span class="badge ind">${pack.classe}</span>` : ''}
        ${pack.familia ? html`<span class="badge ind">${pack.familia}</span>` : ''}</div>
      ${pack.nome_na_fonte && pack.nome_na_fonte !== pack.nome ? html`<p class="fonte-linha quebra-livre">${tr('Nome na fonte: {nome}.', { nome: pack.nome_na_fonte })}</p>` : ''}
    </div>
    <section class="cartao cartao-topo" aria-label="${tr('Identidade química')}">
      <dl class="dados">
        ${pack.formula ? html`<dt>${tr('Fórmula')}</dt><dd class="mono">${pack.formula}</dd>` : ''}
        ${massaMono ? html`<dt>${tr('Massa monoisotópica')}</dt><dd class="mono">${fmtFixo(massaMono, 4)} Da</dd>` : ''}
        ${pack.massa_media ? html`<dt>${tr('Massa molecular média')}</dt><dd class="mono">${fmtFixo(pack.massa_media, 2)} Da</dd>` : ''}
        ${pack.comprimento_aa ? html`<dt>${tr('Comprimento')}</dt><dd class="mono">${trn(pack.comprimento_aa, '{n} aminoácido', '{n} aminoácidos')}</dd>` : ''}
        ${pack.inchikey ? html`<dt>InChIKey</dt><dd class="linha-copiavel"><span class="mono">${pack.inchikey}</span><button type="button" class="btn-copiar" data-copiar="${pack.inchikey}" data-rotulo="InChIKey">${icone('copiar')}${tr('Copiar')}</button></dd>` : ''}
        ${pack.conectividade ? html`<dt>${tr('Conectividade 2D')}</dt><dd><span class="mono">${pack.conectividade}</span>${pack.n_mesma_conectividade > 1 ? html`<br>${tr('{n} estereoisômeros ou formas com o mesmo esqueleto no banco', { n: fmtInt(pack.n_mesma_conectividade) })}` : ''}${irmaos.length ? html`<br><small>${irmaos.slice(0, 6).map((s, idx) => html`${idx ? ' · ' : ''}<a href="#/molecula/${s.id}">${nomeMolecula(s.nome, s.id)}</a>${s.tem_3d ? html` <span class="badge ind">${icone('cubo')}3D</span>` : ''}`)}</small>` : ''}</dd>` : ''}
        ${estereo ? html`<dt>${tr('Estereoquímica')}</dt><dd>${nIndef > 0 ? html`<strong>${estereo}</strong>` : estereo}</dd>` : ''}
        ${pack.smiles ? html`<dt>SMILES</dt><dd class="linha-copiavel"><span class="mono">${pack.smiles}</span><button type="button" class="btn-copiar" data-copiar="${pack.smiles}" data-rotulo="SMILES">${icone('copiar')}${tr('Copiar')}</button></dd>` : ''}
        ${ext.length ? html`<dt>${tr('Identificadores')}</dt><dd>${ext.map((x, i) => html`${i ? ' · ' : ''}${x}`)}</dd>` : ''}
      </dl>
      ${fq ? html`<div class="fq-bloco">
        <div class="fq-topo">
          <strong>${tr('Descritores calculados (RDKit)')}</strong>
          ${fq.umap ? html`<a class="chip" href="#/galaxia?mol=${pack.id}">${icone('galaxia')}${tr('Ver no espaço químico')}</a>` : ''}
        </div>
        <div class="fq-grade">
          ${fq.clogp != null ? html`<div class="fq-cel"><span>cLogP (Wildman–Crippen)</span><b>${fmtDec(fq.clogp)}</b></div>` : ''}
          ${fq.tpsa != null ? html`<div class="fq-cel"><span>TPSA</span><b>${fmtDec(fq.tpsa)} Å²</b></div>` : ''}
          ${fq.fsp3 != null ? html`<div class="fq-cel"><span>Fsp³</span><b>${fmtDec(fq.fsp3)}</b></div>` : ''}
          ${(fq.hbd != null || fq.hba != null) ? html`<div class="fq-cel"><span>${tr('Doadores / aceptores de H')}</span><b>${fq.hbd ?? '–'} / ${fq.hba ?? '–'}</b></div>` : ''}
          ${fq.qed != null ? html`<div class="fq-cel"><span>QED</span><b>${fmtDec(fq.qed)}</b></div>` : ''}
          ${fq.np_likeness != null ? html`<div class="fq-cel"><span>NP-likeness (Ertl)</span><b>${fmtDec(fq.np_likeness)}</b></div>` : ''}
        </div>
        ${fq.murcko_smiles ? html`<p class="fonte-linha quebra-livre">${tr('Esqueleto de Bemis–Murcko')}: <code class="mono">${fq.murcko_smiles}</code></p>` : ''}
      </div>` : ''}
    </section>
    ${pack.linhagens?.length ? html`<section class="cartao destaque" aria-labelledby="h-linhagem">
      <h4 id="h-linhagem">${icone('fluxo')}${tr('Linhagem farmacológica')}</h4>
      ${pack.linhagens.map((ln) => blocoLinhagem(ln, pack))}
      <p class="fonte-linha"><a href="#/fluxo">${tr('Todas as linhagens')}</a></p>
    </section>` : ''}
    ${pack.pains?.length ? html`<div class="aviso info" role="note">${icone('info')}<p>${tr('Subestrutura PAINS (RDKit): {lista}. Subestruturas desse tipo interferem com frequência em ensaios bioquímicos in vitro (Baell e Holloway, 2010).', { lista: pack.pains.join(', ') })}</p></div>` : ''}
    ${pack.controle_regulatorio ? html`<div class="aviso" role="note">${icone('alerta')}<p><strong>${tr('Controle regulatório da substância')}:</strong> ${trPartes(pack.controle_regulatorio)}</p></div>` : ''}

    <h3 class="sec-titulo">${icone('planta')}${tr('Organismos em que foi relatada')}<span class="contagem">${fmtInt(totalOcorre)}</span></h3>
    ${totalOcorre > ocorre.length ? html`<p class="fonte-linha">${tr('{n} de {total} táxons listados. A relação completa está em afirmacoes.csv.', { n: fmtInt(ocorre.length), total: fmtInt(totalOcorre) })}</p>` : ''}
    ${ocorreTxt}
    ${ocorre.length ? html`<details class="mais"><summary>${tr('Registro por organismo: enunciado, publicações e procedência')}</summary>
      ${ocorre.map((o) => { const af = o.afirmacao; return html`<div class="cartao"><strong><em>${o.nome}</em></strong> ${badgeEvidencia(af.evidencia)}
        <p>${trDado(af.enunciado)}</p>
        ${af.organismo_na_fonte ? html`<p class="fonte-linha">${tr('Nome do organismo na fonte')}: <em>${af.organismo_na_fonte}</em>.</p>` : ''}
        ${af.validacao_fonte ? html`<p class="fonte-linha">${tr('A base de origem marca o registro como validado manualmente.')}</p>` : ''}
        ${af.tipo === 'funcao_toxina' ? '' : blocoPassagem(af, pack)}
        ${listaRefs(pack, af.refs)}
        ${af.escopo_ref === 'entrada_geral' ? html`<p class="fonte-linha">${tr('As referências são as da entrada da proteína no UniProt/Swiss-Prot, não as da anotação de função.')}</p>` : ''}
        ${procedenciaNoDetalhe(af, pack)}
        ${fonteLinha(pack, af.consulta)}
        ${matrizProntidao(af)}</div>`; })}</details>` : ''}

    <h3 class="sec-titulo" id="acao-biologica">${icone('acao')}${tr('Ação biológica documentada')}</h3>
    ${funcoes.length ? html`<h4>${tr('Função anotada da toxina')}</h4>${funcoes.map((o) => blocoPassagem(o.afirmacao, pack, tr('Organismo: {nome}.', { nome: o.nome }) + (o.afirmacao.metodo ? ` ${trDado(o.afirmacao.metodo)}.` : '')))}` : ''}
    <h4>${tr('Bioatividade medida')}</h4>
    ${atividades.length ? html`<p class="fonte-linha">${tr('Medidas do ChEMBL para a molécula isolada. Cada bloco resume as medidas válidas de um par molécula–alvo.')}${totalAtiv > atividades.length ? ` ${tr('{n} de {total} registros listados.', { n: fmtInt(atividades.length), total: fmtInt(totalAtiv) })}` : ''}</p>${atividades.map((a) => cartaoMedida(a, pack))}`
      : html`<p class="fonte-linha">${consultaFase ? tr('Sem medida de bioatividade no ChEMBL (consulta de {data}).', { data: fmtData(consultaFase.data) }) : tr('Nenhum registro de bioatividade.')}</p>`}
    ${blocoClinico(pack, consultaFase)}

    ${pack.refs.length ? html`<h3 class="sec-titulo">${icone('livro')}${tr('Referências')}<span class="contagem">${fmtInt(pack.refs.length)}</span></h3>
    <details class="mais"><summary>${trn(pack.refs.length, 'Mostrar {n} referência', 'Mostrar as {n} referências')}</summary><ol class="refs">${pack.refs.map(refItem)}</ol></details>` : ''}
    ${pack.consultas.length ? html`<h3 class="sec-titulo">${icone('dados')}${tr('Consultas às fontes')}</h3>
    <ul class="refs sem-marcador">${pack.consultas.map((c) => html`<li>${trPartes(c.fonte_nome)} · ${fmtData(c.data)}${c.versao ? ` · ${tr('versão {v}', { v: c.versao })}` : ''} · ${tr('licença {l}', { l: trDado(c.licenca) })} · ${link(c.url, tr('abrir a consulta'))}</li>`)}</ul>` : ''}</div>`;
  return { titulo: tituloMol, corpo };
}
