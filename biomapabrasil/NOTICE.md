# BioMapaBrasil: titularidade, licenças, marcas e conteúdo de terceiros

## Titularidade e financiamento

O BioMapaBrasil é concebido, desenvolvido e mantido pela Amazonia Works, titular dos direitos sobre o código e sobre a marca. O projeto é custeado com recursos próprios da Amazonia Works. Não tem vínculo, obrigação de entrega nem financiamento de agências de fomento, redes de pesquisa, fundações ou subvenções externas. Minutas e versões preparatórias não submetidas não geram compromisso com entidades externas.

## Código

O código-fonte é licenciado sob a GNU Affero General Public License v3.0 (AGPL-3.0), conforme o arquivo `LICENSE`. Licenças comerciais, para uso sem as obrigações da AGPL-3.0, são concedidas pela Amazonia Works.

## Nome e marca

A licença de software trata de direitos autorais sobre o código, não de marcas. Os nomes Amazonia Works e BioMapaBrasil, seus logotipos e sua identidade visual pertencem à Amazonia Works e não são licenciados por este repositório. Quem usar o código pode estudá-lo, modificá-lo e redistribuí-lo nos termos da AGPL-3.0, mas não pode apresentar o resultado como BioMapaBrasil nem sugerir endosso da Amazonia Works sem autorização escrita. Versões modificadas devem usar outro nome e declarar que derivam do BioMapaBrasil.

## Dados

A licença do código não altera os direitos de terceiros sobre os dados. Cada afirmação traz a licença da sua fonte.

- A compilação é distribuída sob CC BY 4.0.
- As afirmações derivadas do ChEMBL (bioatividade e efeito clínico de fármaco aprovado) mantêm a licença de origem, CC BY-SA 3.0, com compartilhamento pela mesma licença.
- Os indicadores de pressão de desmatamento e de área protegida por célula de 0,5° (INPE TerraBrasilis, CNUC, FUNAI) mantêm CC BY-SA 4.0, com compartilhamento pela mesma licença.
- O Darwin Core Archive é distribuído sob CC BY 4.0 e traz só afirmações de LOTUS, NuBBE-DB, NPAtlas e UniProt. Não inclui dados do ChEMBL.
- As decisões editoriais do projeto (lista de espécies, linhagens farmacológicas com a obra citada, conferências de curador) são distribuídas sob CC BY 4.0.
- Os indicadores de pressão de desmatamento e de fração protegida da grade de 0,5° derivam de dados do INPE TerraBrasilis, do CNUC e da FUNAI e seguem os termos dessas fontes.

## Fontes e licenças

A licença de cada fonte é a registrada em `nucleo/bmb/db.py` e publicada em `tabelas/fontes.csv`, com a URL dos termos.

| Fonte | Licença | O que entra |
|---|---|---|
| GBIF | CC0, CC BY ou CC BY-NC, por conjunto de dados | taxonomia de referência, contagens agregadas de ocorrência, fotografias |
| Flora e Funga do Brasil (Jardim Botânico do Rio de Janeiro) | CC BY 4.0 | universo de espécies, origem, endemismo, domínios, forma de vida |
| Catálogo Taxonômico da Fauna do Brasil | CC BY 4.0 | universo de espécies, origem, distribuição por estado |
| LOTUS | CC BY 4.0 | pares de estrutura e organismo com a obra citada. Lido do registro congelado 10.5281/zenodo.19360665, que declara CC BY 4.0 |
| NuBBE-DB (UNESP, ChemNet) | MIT e atribuição aberta (ChemNet, NuBBE) | compostos de espécies estudadas no Brasil, com DOI e estado de coleta declarado. Lido do repositório nubbeKG |
| The Natural Products Atlas (NPAtlas) | CC BY 4.0 | compostos de fungos, com a obra de isolamento |
| UniProtKB/Swiss-Prot (Tox-Prot) | CC BY 4.0 | toxinas animais revisadas, com função anotada |
| European Nucleotide Archive (ENA) | CC0 1.0, domínio público (INSDC) | país, estado e testemunho de sequências ligadas ao UniProt |
| ChEMBL | CC BY-SA 3.0 | bioatividade medida, alvos, fase clínica, indicações e mecanismo |
| PubChem | domínio público (NCBI); dados de contribuintes podem ter termos próprios | identificadores e nomes de compostos |
| Reactome | CC BY 4.0 | vias biológicas humanas ligadas a alvos |
| RCSB Protein Data Bank (wwPDB) | CC0 1.0 | estruturas 3D experimentais |
| Crystallography Open Database | CC0 1.0 | estruturas cristalográficas de pequenas moléculas |
| AlphaFold Protein Structure Database | CC BY 4.0 | modelos preditos de proteínas, com pLDDT |
| ESM Metagenomic Atlas (ESMFold) | CC BY 4.0 | modelos preditos de proteínas, com pLDDT |
| Crossref | CC0 (metadados) | metadados bibliográficos por DOI |
| DataCite | CC0 (metadados) | metadados de DOIs registrados fora do Crossref |
| PubMed | metadados públicos (NLM) | metadados bibliográficos por PMID |
| Europe PMC | CC0 e acesso aberto (metadados e resumos) | resumos e texto de artigos de acesso aberto, para a etapa de evidências |
| IBGE | CC BY 4.0 | unidades da federação, malhas e biomas |
| ANA, HydroSHEDS, Natural Earth | CC BY 4.0 e domínio público | sub-bacias hidrográficas e rios |
| INPE TerraBrasilis (PRODES), CNUC (MMA), FUNAI | dados abertos governamentais; CC BY-SA 4.0 | pressão de desmatamento e fração protegida por célula de 0,5° |
| Terrain Tiles (Mapzen, AWS Open Data) | domínio público e atribuição aberta (USGS SRTM, NOAA ETOPO1) | relevo e altimetria |
| Wikimedia Commons | CC0 ou CC BY, conferida por imagem | fotografias complementares |
| RDKit (cálculo local) | BSD-3-Clause (software); dados calculados em CC0 | descritores, desenhos 2D, confôrmeros 3D, projeção do espaço químico |

Condições de uso do conteúdo de terceiros:

- Fotografias: só imagens sob CC0 ou CC BY legível por máquina, com autor e página de origem. O site redistribui a miniatura, com o crédito. Imagens sob licença não comercial não entram.
- Ocorrências: só contagens agregadas por estado, por sub-bacia e por célula de 0,5°. Nenhuma coordenada de espécime é redistribuída.
- Textos de artigos: a frase que sustenta um registro só é reproduzida quando a obra é de acesso aberto. Resumos de artigos de acesso fechado não são redistribuídos.
- Estruturas 2D e confôrmeros 3D: desenhados e calculados localmente com o RDKit, a partir do SMILES.
- Resultados experimentais: pertencem às publicações identificadas por DOI ou PMID em cada afirmação.

## Software de terceiros

Dependências, sob as licenças declaradas por cada pacote: RDKit, httpx, NumPy, SciPy, Shapely, zstandard, Starlette e uvicorn (BSD de 3 cláusulas); pyproj (MIT); Pillow (MIT-CMU).

## Interpretação

Associação documentada não é eficácia. A distribuição conhecida de uma espécie não é procedência do material de um estudo. Os registros não são recomendação clínica nem autorização para coleta, acesso ou exploração de patrimônio genético.
