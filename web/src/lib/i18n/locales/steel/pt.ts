/**
 * Contrapartida em português de `steel/es.ts`. As mesmas chaves, na mesma ordem — um teste
 * verifica isso.
 *
 * ── Por que este arquivo existe ────────────────────────────────────
 *
 * Os dois arquivos irmãos diziam que qualquer outro idioma renderizaria inglês até o namespace
 * ser traduzido, e isso bastava enquanto o seletor oferecia dois idiomas. O PR #125 reduziu o
 * seletor a Español, English e Português e passou a exigir que tudo o que a superfície PRO
 * desenha exista nos três — justamente para que nada caia em inglês, em silêncio, sob um
 * seletor que promete português.
 *
 * A família metálica é superfície PRO nova. Integrar as duas coisas é o que cria a obrigação:
 * nenhum dos dois ramos a tinha sozinho. Daí este terceiro dicionário.
 *
 * A terminologia segue a prática estrutural brasileira, que nem sempre decalca o espanhol:
 * banzo (não «cordón»), terça (não «correa»), galpão (não «nave»), contraventamento,
 * cisalhamento, mesa para a aba do perfil e flambagem para o pandeo.
 */
const steelPt: Record<string, string> = {
  // ─── Família de material ───
  'steel.family.noMaterial': 'O elemento não tem material atribuído.',
  'steel.family.noStrength': 'O material não declara resistência, portanto não pode ser classificado.',
  'steel.family.inferredConcrete': 'Classificado como concreto pela magnitude de f\'c (≤ 80 MPa), não por uma declaração.',
  'steel.family.inferredMetalNotFerrousChecked': 'Classificado como metal pela magnitude de fy (> 80 MPa). Não se distingue aço de alumínio enquanto o material não declarar seu grau.',

  // ─── Estados ───
  'steel.status.NOT_DESIGNED': 'Não dimensionado',
  'steel.status.EXPERIMENTAL': 'Experimental',
  'steel.status.DEMAND_UNAVAILABLE': 'Sem solicitações',
  'steel.status.NOT_APPLICABLE': 'Não se aplica',
  'steel.status.NOT_DESIGNED.desc': 'Reconhecido como metálico. Nenhum dimensionamento foi tentado.',
  'steel.status.EXPERIMENTAL.desc': 'Há um número calculado sem autoridade verificável por trás. Não é uma certificação.',
  'steel.status.DEMAND_UNAVAILABLE.desc': 'Faltam resultados ou combinações para este membro.',
  'steel.status.NOT_APPLICABLE.desc': 'O membro não é metálico.',

  // ─── Motivos ───
  'steel.reason.noDemands': 'Resolva o modelo e defina combinações antes de olhar o aço.',
  'steel.reason.noMetallicAuthority': 'Não há norma de dimensionamento metálico utilizável vinculada ao projeto.',
  'steel.reason.designNotRun': 'Há uma norma metálica declarada, mas nenhum dimensionamento foi executado.',

  // ─── Avisos ───
  'steel.notice.noAuthorityBound': 'Nenhuma norma metálica produz resultados nesta versão. Os membros de aço são listados, não verificados.',
  'steel.notice.nonFerrousNotCovered': 'O modelo tem membros de metal não ferroso (alumínio). Esta superfície não os cobre e não os lista: nenhuma autoridade de cálculo de alumínio está implementada.',
  'steel.notice.noDemands': 'Ainda não há solicitações: resolva o modelo com combinações.',

  // ─── Hipóteses do verificador existente ───
  'steel.assume.unbracedLengthIsMemberLength': 'Comprimento destravado igual ao comprimento do membro (Lb = L).',
  'steel.assume.webAndFlangeThicknessInferred': 'Espessuras de alma e mesa inferidas como frações da largura quando a seção não as declara.',
  'steel.assume.ultimateStrengthInferred': 'Resistência à ruptura inferida como 1,25·fy quando o material não a declara.',
  'steel.assume.noSectionClassification': 'A seção não é classificada (compacta / não compacta / esbelta).',
  'steel.assume.noTests': 'O verificador não tem testes nem benchmark externo.',
  'steel.promotion.needsClauseMapAndBenchmark': 'Para deixar de ser experimental é preciso mapear as cláusulas da CIRSOC 301-2018 e validar contra ao menos um exemplo resolvido publicado.',

  'steel.checker.experimentalTitle': 'Verificação metálica experimental',
  'steel.checker.experimentalBody': 'Os números desta tabela saem de um verificador sem testes, sem cláusulas mapeadas e fora do modelo de maturidade do aplicativo. Não são uma verificação e não podem ser usados como tal. São exibidos porque um engenheiro que vê as hipóteses pode revisá-los; seriam ocultados se ele não as visse.',

  // ─── Painel ───
  'steel.panel.title': 'Estruturas metálicas',
  'steel.panel.subtitle': 'Inventário de membros metálicos. Nenhum é verificado.',
  'steel.panel.experimentalBanner': 'Superfície experimental. Esta tela informa quais membros são metálicos e o que não foi feito com eles. Não calcula capacidades, não emite certificados e nada do que mostra pode ser usado como verificação.',
  'steel.panel.empty.noElements': 'O modelo não tem elementos.',
  'steel.panel.empty.noneMetallic': 'O modelo tem {total} elementos e nenhum é metálico.',
  'steel.panel.empty.nonFerrousOnly': 'O modelo tem {total} elementos e seu único metal é não ferroso (alumínio). É metal, mas não o metal de que esta superfície pode falar.',
  'steel.panel.empty.allUnclassified': 'O modelo tem {total} elementos e nenhum declara resistência, portanto seu material não pode ser classificado.',
  'steel.panel.summary': '{n} membros metálicos · {beams} vigas · {columns} colunas · {length} m',
  'steel.panel.censusTitle': 'Materiais do modelo',
  'steel.panel.inferredWarning': 'A família de material foi deduzida da magnitude de fy. Não é uma declaração do projeto.',
  'steel.panel.gapsTitle': 'O que a norma metálica não consegue fazer',
  'steel.panel.gapsIntro': 'Cada ponto está por implementar. Nenhum bloqueia o modelo: bloqueia que ele seja reportado como completo.',
  'steel.panel.codeDeclared': 'Norma metálica declarada: {name}',
  'steel.panel.codeNotDeclared': 'O projeto não declara norma metálica.',
  'steel.panel.codeExperimental': 'experimental — não produz resultados',

  // ─── Tabela ───
  'steel.table.element': 'Elem',
  'steel.table.kind': 'Tipo',
  'steel.table.section': 'Seção',
  'steel.table.material': 'Material',
  'steel.table.length': 'Compr.',
  'steel.table.status': 'Estado',
  'steel.kind.beam': 'Viga',
  'steel.kind.column': 'Coluna',
  'steel.kind.wall': 'Parede',
  'steel.family.concrete': 'Concreto',
  'steel.family.steel': 'Aço',
  'steel.family.timber': 'Madeira',
  'steel.family.masonry': 'Alvenaria',
  'steel.family.aluminium': 'Alumínio',
  'steel.family.unknown': 'Não classificado',

  // ─── Capacidades metálicas ───
  'steel.capability.steelSectionClassification': 'Classificação da seção',
  'steel.capability.steelTension': 'Tração',
  'steel.capability.steelCompression': 'Compressão',
  'steel.capability.steelFlexure': 'Flexão',
  'steel.capability.steelLateralTorsionalBuckling': 'Flambagem lateral com torção',
  'steel.capability.steelShear': 'Cisalhamento',
  'steel.capability.steelInteraction': 'Interação',
  'steel.capability.steelBracing': 'Contraventamentos',
  'steel.capability.steelConnections': 'Ligações',
  'steel.capability.steelMemberSchedules': 'Lista e quantitativo metálico',

  // ─── Normas ───
  'regulations.problem.experimentalAdapter': '{name} está declarada como experimental: é registrada como a norma do projeto, mas o aplicativo não produz nenhum resultado sob ela.',

  // ─── Geradores: papéis ───
  'generator.role.chord': 'Banzo',
  'generator.role.post': 'Montante',
  'generator.role.diagonal': 'Diagonal',
  'generator.role.rafter': 'Caibro',
  'generator.role.column': 'Coluna',
  'generator.role.beam': 'Viga',
  'generator.role.purlin': 'Terça',
  'generator.role.bracing': 'Contraventamento',

  // ─── Geradores: problemas ───
  'generator.problem.spanPositive': 'O vão precisa ser maior que zero.',
  'generator.problem.bayPositive': 'O vão entre pórticos precisa ser maior que zero.',
  'generator.problem.panelsAtLeastOne': 'É preciso haver ao menos um painel por metade.',
  'generator.problem.divisionsAtLeastOne': 'É preciso haver ao menos uma divisão.',
  'generator.problem.framesAtLeastTwo': 'Um galpão precisa de ao menos dois pórticos.',
  'generator.problem.negative': 'O valor não pode ser negativo.',
  'generator.problem.heightPositive': 'A altura precisa ser maior que zero.',
  'generator.problem.widthPositive': 'A largura precisa ser maior que zero.',
  'generator.problem.depthPositive': 'A altura da seção precisa ser maior que zero.',
  'generator.problem.plateauExceedsSpan': 'O patamar não pode ser tão longo quanto o vão.',
  'generator.problem.archNeedsRise': 'Um arco sem flecha é uma reta de raio infinito.',
  'generator.problem.portalNeedsRise': 'Um pórtico de duas águas precisa de altura de cumeeira.',
  'generator.problem.trussHasNoDepth': 'A treliça não tem altura em ponto nenhum.',
  'generator.problem.centroidUnknown': 'A posição do centroide de {profile} ({family}) não é conhecida, portanto não se pode compor um perfil múltiplo com ele.',
  'generator.problem.profileMissing': 'Falta escolher perfil para {role}.',
  'generator.problem.profileUnknown': 'O perfil {name} não está no catálogo.',
  'generator.notice.roofWithoutPurlins': 'Sem terças as treliças de cobertura não têm restrição fora do plano do pórtico, portanto este modelo é gerado mas não pode ser calculado. Ative Terças, ou acrescente seu próprio contraventamento de cobertura.',

  // ─── Geradores: hipóteses ───
  'generator.assume.chordsContinuous': 'Banzos contínuos através dos nós.',
  'generator.assume.chordsPinned': 'Banzos birrotulados em cada painel.',
  'generator.assume.webPinned': 'Montantes e diagonais birrotulados.',
  'generator.assume.webContinuous': 'Montantes e diagonais contínuos.',
  'generator.assume.raftersContinuous': 'Caibros contínuos através da cumeeira.',
  'generator.assume.supportsSimple': 'Apoios simples: um fixo e um móvel.',
  'generator.assume.baseFixed': 'Bases engastadas.',
  'generator.assume.baseChordsPinned': 'Cada banzo apoia rotulado em sua própria ancoragem.',
  'generator.assume.lacingZigzag': 'Treliçamento em ziguezague, alternando painel a painel.',
  'generator.assume.lacingParallel': 'Treliçamento com todas as diagonais no mesmo sentido.',
  'generator.assume.columnCapSharesReaction': 'A cabeceira da coluna é uma placa rígida: distribui a reação para os dois banzos e é modelada com continuidade de momento com eles.',
  'generator.assume.eaveBeamsContinuous': 'Vigas de borda contínuas entre pórticos.',
  'generator.assume.headBeamMakesPortal': 'Viga transversal de cabeceira: sem treliça, é o que forma o pórtico.',
  'generator.assume.purlinsRolledToPitch': 'Terças giradas para a inclinação local da água.',
  'generator.assume.noRoofStructure': 'Sem estrutura de cobertura.',
  'generator.assume.roofWithoutPurlins': 'Cobertura sem terças: as treliças não têm restrição fora do seu próprio plano.',
  'generator.assume.latticeBasesPinnedNoOutOfPlane': 'Colunas treliçadas com bases rotuladas: fora do plano os pórticos se sustentam apenas pelas terças e pelo engastamento da base, e este modelo não leva contraventamento longitudinal. Resolve; não está contraventado.',
  'generator.assume.solidColumns': 'Colunas de alma cheia.',
  'generator.assume.placeholderGrade': 'Grau de aço provisório: não vem do catálogo de graus.',
  'generator.assume.propertiesOnlyProfile': 'O perfil não tem contorno canônico; usam-se as propriedades publicadas.',
  'generator.assume.nominalDimensionFamily': 'Família de dimensões nominais: a área derivada difere da tabelada.',

  // ─── Geradores: torção de perfis compostos ───
  'generator.outline.unknownProfile': 'O perfil não está no catálogo.',
  'generator.outline.noGeometry': 'O perfil não tem contorno canônico, portanto não é desenhado. As propriedades publicadas continuam sendo usadas.',
  'generator.outline.arrangementRefused': 'Não se pode compor esta disposição com este perfil.',
  'generator.builtUp.torsion.singleProfile': 'Constante de torção do catálogo.',
  'generator.builtUp.torsion.sumOfOpenParts': 'Constante de torção tomada como a soma das partes abertas. É uma hipótese, não um valor tabelado.',
  'generator.builtUp.torsion.closedCellNotComputed': 'Seção fechada: vale Bredt e a área envolvida não pode ser determinada a partir do catálogo, portanto nenhuma constante de torção é reportada.',
  'generator.builtUp.torsion.partHasNoJ': 'O perfil não publica constante de torção, portanto nenhuma composição sua pode ter uma.',

  // ─── Geradores: interface ───
  'generator.ui.title': 'Geradores',
  'generator.ui.subtitle': 'Geometria paramétrica. Não dimensiona nem verifica nada.',
  'generator.ui.kindTruss': 'Treliça',
  'generator.ui.kindColumn': 'Coluna treliçada',
  'generator.ui.kindShed': 'Galpão',
  'generator.ui.span': 'Vão (m)',
  'generator.ui.spanVT': 'Vão transversal VT (m)',
  'generator.ui.bayVP': 'Vão entre pórticos VP (m)',
  'generator.ui.frames': 'Pórticos',
  'generator.ui.clearHeight': 'Pé-direito livre (m)',
  'generator.ui.rise': 'Altura de cumeeira (m)',
  'generator.ui.endDepth': 'Altura no apoio (m)',
  'generator.ui.depth': 'Altura entre banzos (m)',
  'generator.ui.plateau': 'Patamar (m)',
  'generator.ui.panels': 'Painéis por metade',
  'generator.ui.height': 'Altura (m)',
  'generator.ui.width': 'Largura (m)',
  'generator.ui.divisions': 'Divisões',
  'generator.ui.lacing': 'Treliçamento',
  'generator.ui.fixedBase': 'Base engastada',
  'generator.ui.halfTruss': 'Meia treliça',
  'generator.ui.webPattern': 'Diagonais',
  'generator.ui.archCurve': 'Tipo de curva',
  'generator.ui.columnKind': 'Colunas',
  'generator.ui.columnLattice': 'Treliçadas',
  'generator.ui.columnSolid': 'De alma cheia',
  'generator.ui.beams': 'Vigas longitudinais',
  'generator.ui.roof': 'Adicionar treliças',
  'generator.ui.purlins': 'Terças',
  'generator.ui.profiles': 'Perfis',
  'generator.ui.arrangement': 'Disposição',
  'generator.ui.gap': 'Folga',
  'generator.ui.rotation': 'Rotação',
  'generator.ui.rotationAuto': 'Auto',
  'generator.ui.totals': '{members} barras · {nodes} nós · {length} m',
  'generator.ui.slope': 'inclinação',
  'generator.ui.previewElevation': 'Vista em elevação da geometria gerada',
  'generator.ui.previewFrame': 'Vista em elevação do pórtico transversal',
  'generator.ui.previewIso': 'Vista isométrica do galpão completo',
  'generator.ui.assumptions': 'Hipóteses do gerador',
  'generator.ui.replacesModel': 'Gerar substitui o modelo atual. Um passo de desfazer o traz de volta.',
  'generator.ui.generate': 'Gerar',
  'generator.ui.generated': '{name}: {nodes} nós e {elements} barras no modelo.',
  'generator.ui.mismatch': 'Divergência: a pré-visualização dizia {promised} barras e entraram {got}.',
  'generator.ui.currentModel': 'Modelo atual: {nodes} nós, {elements} barras.',
  'generator.truss.trapezoidal': 'Trapezoidal',
  'generator.truss.parallelChord': 'Banzos paralelos',
  'generator.truss.pratt': 'Pratt',
  'generator.truss.arch': 'Arco',
  'generator.truss.rolledPortal': 'Pórtico de alma cheia',
  'generator.archCurve.semiArch': 'Semiarco',
  'generator.archCurve.parallelChord': 'Banzos paralelos',
  'generator.archCurve.concave': 'Côncavo',
  'generator.webPattern.pratt': 'Pratt (sobem para o centro)',
  'generator.webPattern.howe': 'Howe (descem para o centro)',
  'generator.lacing.zigzag': 'Ziguezague',
  'generator.lacing.parallel': 'Paralelo',
  'generator.arrangement.single': 'Simples',
  'generator.arrangement.doubleBack': 'Duplo ][ costa a costa',
  'generator.arrangement.doubleFacing': 'Caixão []',
  'generator.arrangement.doubleParallel': 'Duplo || paralelo',
  'generator.arrangement.doubleX': 'Duplo em X',
  'generator.arrangement.quadBack': 'Quádruplo costa a costa',
  'generator.arrangement.quadBox': 'Quádruplo caixão',

  // O que cada parâmetro controla, e em que unidade. Exibido sob o campo.
  'generator.hint.span': 'O vão entre os dois apoios, em metros.',
  'generator.hint.rise': 'Altura da cumeeira sobre os apoios, em metros. Zero dá uma treliça de banzos paralelos.',
  'generator.hint.endDepth': 'Altura da treliça no apoio, em metros.',
  'generator.hint.depth': 'Altura constante entre banzos, em metros.',
  'generator.hint.plateau': 'Comprimento do trecho horizontal superior, em metros.',
  'generator.hint.panels': 'Painéis de alma por metade. Mais painéis significa montantes mais curtos e mais nós.',
  'generator.hint.height': 'Altura total da coluna, em metros.',
  'generator.hint.width': 'Separação entre os dois banzos, em metros.',
  'generator.hint.divisions': 'Painéis de treliçamento ao longo da altura.',
  'generator.hint.clearHeight': 'Altura livre sob a treliça, em metros.',
  'generator.hint.frames': 'Quantidade de pórticos transversais. Cada um é uma cópia do pórtico pré-visualizado acima.',
  'generator.hint.bayVP': 'Separação entre pórticos consecutivos, em metros.',
  'generator.hint.purlins': 'Linhas de terças por água.',
  'generator.hint.slope': 'Inclinação do telhado, como relação entre flecha e meio vão.',
};
export default steelPt;
