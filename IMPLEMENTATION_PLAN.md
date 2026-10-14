# Plano de implementação — ERP Modelagem

## Pontos de trabalho

### 01 — TASK-001: Diagnosticar a rota não encontrada
Investigar o caminho da rota entre gravação, leitura e criação da ordem, comparando o modelo e os IDs usados em cada chamada. Confirmar a causa com evidências da API e do banco; distinguir modelo sem rota de uma rota salva que não é recuperada.

**Estado em 2026-10-14:** implementação validada pela usuária ao iniciar o ponto seguinte, conforme fluxo de trabalho acordado. Os três migrations foram aplicados ao banco local de desenvolvimento, e o backend desta branch foi reiniciado na porta 3001, destino usado pela gateway local.

**Evidências iniciais:** `PUT /rotas/:modeloId` substitui e grava etapas para o ID da URL em uma transação; `GET /rotas/:modeloId` lê pelo mesmo ID. `POST /lotes` devolve `ROTA_NOT_FOUND` quando a contagem em `rota_modelo` para `modeloId` é zero. A tela de ordens usa `GET /admin/modelos`, que filtra modelos com ordem, mas não exige rota. O cadastro individual de modelo salva modelo e peças sem rota. Consulta agregada, somente leitura, ao banco configurado em 2026-10-14: 5 modelos ativos, 2 sem rota, e os mesmos 2 podem aparecer na seleção de nova ordem. Isso confirma o cenário de modelo selecionável sem rota; não demonstra falha de persistência de uma rota salva.

**Caso informado pelo usuário:** código `102030`, nome `AIR MAX TESTE`, ID `cd8e500f-3294-4ca4-b336-1148d2b927e9`. Antes da nova tentativa havia zero etapas e zero ordens. O usuário salvou a rota e recebeu sucesso; consulta somente leitura logo após encontrou somente duas etapas persistidas, Corte Atom e Corte Lectra, ambas na posição 5 e vinculadas ao ID correto. O banco possui somente cinco setores ativos: Corte Atom, Corte Lectra, Corte CN, Corte Couro e Corte Laser. O Construtor procura setores por igualdade exata de nome, descarta os IDs ausentes com `filter(r => r.setorId !== '')` e considera sucesso quando resta ao menos uma etapa. A migration de subsetores cadastra apenas esses cinco setores; o seed geral não cadastra os demais setores fixos do Construtor. Portanto, a API confirmou uma gravação parcial: o problema não é um ID de modelo diferente, mas o contrato de setores e a aceitação de uma rota incompleta como salva. A consulta `GET /rotas/:modeloId` e a contagem de `POST /lotes` agora devem encontrar as duas etapas, embora a rota operacional continue incompleta.

**Proposta registrada na fase de diagnóstico, antes da autorização:** impedir que o Construtor descarte etapas obrigatórias ausentes; exibir os setores não cadastrados e bloquear a gravação. Alinhar, por migration ou configuração controlada, o catálogo de setores da planta com o fluxo aprovado pelo processo. Validar no backend a integridade da rota antes de substituir uma rota existente ou liberar a criação da ordem. A seleção de modelos para nova ordem somente com rota válida continua registrada em TASK-024C. A autorização posterior cobriu os itens descritos abaixo; não completar automaticamente a rota `102030`, que permanece apenas como exemplo.

**Complemento do usuário (imagem do Construtor):** o preview do modelo `102030` mostrava 11 blocos visuais, incluindo Conferência Inicial, Corte Automático, Serigrafia, Apoio e Bordado, enquanto apenas Corte Lectra e Corte Atom foram persistidos. Um bloco visual pode representar mais de um setor persistido, então a contagem visual não equivale diretamente à contagem de linhas da tabela. O usuário esclareceu que a rota deve considerar o que foi definido no Construtor e os dados de peças/máquinas dos passos 2 e 3 de Iniciar Novo Teste. A análise do código mostra que o wizard propaga automaticamente apenas CN, Couro e Laser a partir das peças; Lectra, Atom e Ponte são fixos no Construtor, independentemente das peças. O Catálogo de Modelos permite vincular peças e opções de corte na criação, mas não oferece edição desse vínculo para modelos já cadastrados. Existe `POST /pecas/modelo/:modeloId`, que apaga e recria todas as peças sem transação nem validação forte; não deve ser usado como atalho de edição sem rever as referências históricas. Essas dependências se relacionam a TASK-007, TASK-012 e TASK-024 e precisam ser consideradas antes de fechar o contrato da rota.

**Regra de negócio confirmada pelo usuário:** Lectra, Atom, Ponte, CN, Couro e Laser são sub-setores de Corte Automático; cada peça do modelo deve estar vinculada ao sub-setor onde é cortada. Lectra e Ponte devem vir pré-configuradas na rota de todo modelo, com peças cadastradas para ambas. Atom, CN, Couro e Laser devem entrar automaticamente quando houver peças do modelo vinculadas a eles. Consulta somente leitura em 2026-10-14: `AIR MAX TESTE` não tem nenhuma linha em `pecas`; as opções ativas de `subsetor_corte` são Atom, CN, Couro, Laser e Lectra, sem Ponte. A migration de subsetores também não cadastra Corte Ponte. Portanto, o banco atual não consegue representar integralmente essa regra nem concluir a rota do modelo de teste sem provisionamento e edição de peças existentes.

**Regra adicional confirmada pelo usuário:** existe uma rota por planta. A associação modelo-planta deve ser preservada ao gravar, consultar, iniciar uma ordem e executar a sequência operacional; os setores de uma rota devem pertencer à planta escolhida.

**Implementação autorizada nesta etapa:** migrations para provisionar Ponte e os setores previstos em cada planta ativa, associar peças a IDs do catálogo e acrescentar planta à rota existente (backfill pelo setor); edição de peças/sub-setores em modelos cadastrados preservando IDs e rastreamentos; criação do modelo e das peças em transação; Construtor derivando os sub-setores de corte das peças, com Lectra e Ponte pré-configuradas e exigidas; bloqueio de rota parcial no frontend e validação da associação peça-setor-planta no backend; criação da ordem exigindo uma rota íntegra para a planta; consultas operacionais restringindo etapas à planta da ordem. O modelo `AIR MAX TESTE` segue apenas como exemplo para conferência, sem tratamento especial.

**Situação da entrega:** `npm run build` passou em `backend/` e `frontend/`; `git diff --check` passou; nenhum teste automatizado ou fluxo funcional foi executado pela agente. As migrations `1791980000000`, `1791980100000` e `1791980200000` foram aplicadas com sucesso no banco local; o backend atualizado foi reiniciado e confirmou conexão ao banco e escuta na porta 3001. A usuária avançou ao ponto seguinte, o que valida TASK-001 conforme o protocolo acordado. As alterações desta entrega serão registradas em commit nesta etapa.

**Fechamento:** TASK-001 considerada validada pela usuária conforme o protocolo da conversa e registrada no commit desta entrega. TASK-002 e as demais tarefas do plano permanecem pendentes e não foram iniciadas.

### 02 — TASK-002: Definir as regras de Bordado, Apoio e bifurcação
Analisar como Bordado e Apoio são representados nas rotas, na produção, na bipagem e na Torre de Controle. Definir com o processo se Bordado substitui Apoio, funciona em paralelo ou é um subprocesso; esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem e mostrando Telas somente quando houver Serigrafia. A regra deve ser derivada da rota, sem configuração duplicada na ordem.

### 03 — TASK-003: Definir os contratos de dados e API
Fechar o formato compartilhado entre frontend, backend e banco para peças, setores de corte, etapas e versões de rota, tempos, bifurcação, snapshots das ordens e datas. Registrar os contratos que os módulos consumidores usarão para evitar regras ou formatos diferentes entre telas.

### 04 — TASK-004: Corrigir a busca do catálogo de peças
Fazer as sugestões do catálogo aparecerem e atualizarem enquanto o usuário digita, sem perder o foco. Tratar carregamento, resultados vazios, erros, seleção, permissões e respostas de busca que chegam fora de ordem.

### 05 — TASK-005: Reorganizar a navegação e o layout
Ordenar a sidebar conforme o fluxo de uso da aplicação, remover a barra de breadcrumb superior e mover nome, perfil e logout para a parte inferior da sidebar. Preservar permissões e adaptar o layout aos modos recolhido e mobile.

**Diagnóstico em 2026-10-14:** `DashboardView.vue` contém a sidebar e o layout autenticado. A lista atual põe a Torre de Controle antes dos catálogos; “Iniciar Novo Teste” já aparece como ação destacada no topo. Nome, perfil e logout já ficam no rodapé, enquanto o controle de recolher fica no final da barra e usa X/Menu. A versão recolhida existe no desktop, mas no mobile a barra continua ocupando espaço lateral; não há drawer, fundo de sobreposição ou fechamento automático depois de navegar. A sidebar inicia sempre expandida.

**Permissões e rotas:** cada item já é filtrado por `hasPermission`; RBAC usa `isAdminAutomacao`, e as rotas também têm guardas independentes. A reorganização deve manter esses filtros e guards sem alterar seus critérios. A rota inicial pós-login é selecionada separadamente em `router/index.ts` e hoje prioriza Gestão de Ordens; a proposta não a altera.

**Breadcrumb:** não foi encontrada uma barra ou componente compartilhado de breadcrumb no frontend. O layout renderiza diretamente a tela ativa, e as telas possuem cabeçalhos próprios. Na implementação, remover somente uma faixa de breadcrumb caso seja identificada na interface-alvo e preservar títulos e contexto próprios das telas.

**Direção visual e ordem sugeridas pela usuária:** Torre de Controle e TV Rastreamento devem ficar no topo dos links de navegação. Manter “Iniciar Novo Teste” como ação principal destacada no topo da barra e, logo abaixo, priorizar Torre de Controle e TV Rastreamento. Em seguida, agrupar Catálogo de Modelos, Catálogo de Peças e Construtor de Rota como Modelagem; Gestão de Ordens, Bipagem Operacional e Inspeção de Qualidade como Produção; Permissões RBAC como Administração.

**Escopo aprovado:** adotar das referências a estrutura de marca com controle lateral de seta no alto, campo para filtrar os links autorizados, rótulos de seção, item ativo com faixa de destaque, navegação por ícones e textos e rodapé separado. Usar a paleta já existente do ERP (azul-marinho e azul), com acabamento mais consistente em espaçamento, contraste, foco e hover; não replicar a paleta roxa/preta das referências. Manter nome/perfil e saída no rodapé. No modo recolhido, preservar ícones, indicação de item ativo e dicas de texto; a busca fica acessível por ícone. Em telas pequenas, usar a sidebar como drawer sobre o conteúdo, com fundo de fechamento e encerramento ao escolher uma tela; no desktop, manter a barra compacta por ícones. Preservar o catálogo de permissões, guards e rota inicial atual.

**Entrega em 2026-10-14:** `DashboardView.vue` agora organiza a navegação em Acesso rápido (Torre de Controle e TV Rastreamento), Modelagem, Produção e Administração, mantendo “Iniciar Novo Teste” como ação destacada acima dos links. Foi aplicado o padrão visual inspirado nas referências com a paleta azul do ERP, botão de seta no cabeçalho, busca local de telas, destaque lateral da rota ativa e identificação do usuário/logout no rodapé. O modo compacto de desktop mantém ícones e dicas; em telas pequenas, a sidebar abre como drawer com fundo, botão superior, fechamento por Escape, clique no fundo ou navegação e bloqueio de rolagem do conteúdo ao fundo.

**Permissões e escopo:** o filtro da busca só considera links já autorizados por `hasPermission`/`isAdminAutomacao`; as condições de acesso e os guards do router não foram alterados. A rota inicial pós-login também foi preservada. A busca no código não encontrou breadcrumb compartilhado para remover; os cabeçalhos próprios das telas foram mantidos.

**Validação:** `npm run build` passou em `frontend/`, incluindo `vue-tsc -b` e `vite build`; `git diff --check` passou. Não foi realizado teste funcional visual em desktop/mobile nem teste automatizado.

**Estado:** validada pela usuária ao iniciar o ponto seguinte, em 2026-10-14; commitada separadamente conforme o fluxo acordado.

### 06 — TASK-006: Validar o código do produto e retirar Temporada do cadastro ativo
Aplicar a regra de que o código do produto contém somente dígitos no frontend, backend e banco, preservando zeros à esquerda. Remover Temporada dos formulários e dos novos contratos sem apagar os valores históricos ou quebrar consumidores existentes.

### 07 — TASK-007: Vincular as peças do modelo aos setores de corte
Fazer cada peça do modelo preservar sua identidade de catálogo e seu setor de Corte Automático por identificadores, para que a rota use os dados selecionados sem depender de comparação de nomes.

#### 07A — Persistência e API das peças
Implementar no backend e no banco a associação entre a peça do modelo, a peça de catálogo e a opção de corte. As opções incluem Lectra, Atom, CN, Ponte, Laser e Couro; dados antigos devem continuar legíveis.

#### 07B — Seleção de peças nas telas
Atualizar o cadastro individual e o passo de peças do wizard para selecionar, salvar e exibir os identificadores definidos em 07A. Esta parte fica restrita às telas de peças; não implementa a persistência do backend.

### 08 — TASK-008: Persistir etapas versionadas da rota
Representar a rota como etapas identificáveis e versionadas. Cada etapa deve guardar seu setor, posição, tempo e configurações próprias, suportando setores repetidos, paralelismo e leitura das rotas já existentes.

### 09 — TASK-009: Corrigir a gravação e leitura da rota
Centralizar a gravação e consulta da rota para que a resposta de sucesso corresponda a dados confirmados no banco. Corrigir a causa de ROTA_NOT_FOUND encontrada na TASK-001 e garantir que o mesmo modelo e a mesma rota sejam usados no Construtor e na criação da ordem.

### 10 — TASK-010: Registrar um snapshot da rota na ordem
Ao criar uma ordem, guardar uma cópia da versão e das etapas da rota que ela recebeu, incluindo sequência, setores, tempos e condições. Alterações futuras na rota do modelo não devem mudar ordens existentes; ordens antigas precisam de uma leitura compatível.

### 11 — TASK-011: Tornar transacional a finalização do wizard no backend
Persistir modelo, peças, rota e ordem em uma única transação ao finalizar o wizard. Se qualquer etapa falhar, nenhuma parte do novo teste deve ficar gravada. Os cadastros individuais continuam usando seus próprios fluxos de gravação.

### 12 — TASK-012: Corrigir o Construtor e o preview da rota
Usar os setores de corte definidos nas peças para pré-configurar a rota. Manter identificador e estado próprios para cada etapa, para que editar o tempo ou outra configuração de um setor não altere os demais; incluir as regras de Serigrafia e Conferência Inicial definidas na TASK-002.

### 13 — TASK-013: Tornar o wizard reversível
Organizar “Iniciar Novo Teste” em quatro passos: modelo, peças, rota e ordem. Manter as informações como rascunho enquanto o usuário avança, volta, revisa e altera os passos; enviar para persistência somente ao finalizar.

### 14 — TASK-014: Fazer o backend operacional executar a rota da ordem
Obter o fluxo operacional a partir do snapshot da ordem e validar as etapas permitidas, sua sequência e suas condições. Associar cada bipagem à etapa correspondente da ordem e manter leitura compatível para ordens antigas.

### 15 — TASK-015: Adaptar a tela de bipagem à rota da ordem
Remover sequências fixas de setores da tela. Ao selecionar uma ordem, exibir somente os setores e processos da rota dela, com posição, estado e ações permitidas, atualizando a interface ao trocar de ordem.

### 16 — TASK-016: Adaptar a TV de rastreamento à rota da ordem
Exibir na TV o snapshot e o progresso real da ordem, em vez de consultar a rota atual do modelo. A edição posterior do modelo não deve alterar o histórico mostrado para a ordem.

### 17 — TASK-017: Conectar os dados e indicadores da Torre de Controle
Revisar endpoints, filtros, setores, tempos e agregações da Torre para consumir dados reais de ordens, rotas, bipagens, qualidade e ocorrências. Identificar mocks, atualizar eventos e conferir os indicadores com os registros de produção.

### 18 — TASK-018: Revisar a interface da Torre de Controle
Organizar hierarquia visual, tipografia, espaçamento, cards, tabelas, indicadores e cores da Torre. Exibir os dados do contrato definido para o backend com estados claros de carregamento, erro e ausência de resultados, em desktop e mobile.

### 19 — TASK-019: Padronizar datas no backend e no banco
Definir como instantes de criação e prazos são recebidos, persistidos e serializados, usando um formato inequívoco. Tratar valores históricos conforme sua interpretação atual; não aplicar offsets ou conversões em massa sem auditoria.

### 20 — TASK-020: Corrigir a apresentação e edição de datas no frontend
Converter datas para o horário local somente na apresentação e enviar valores editados com timezone explícito, conforme o contrato da TASK-019. Remover conversões que tratam UTC como hora local ou usam offsets fixos.

### 21 — TASK-021: Corrigir os contratos de anexos
Garantir que anexos de ocorrência e de inspeção usem os campos e endpoints corretos, respeitem autenticação e permissões e possam ser listados ou reenviados após falha.

#### 21A — Foto de ocorrência
Alinhar o campo enviado pela tela de bipagem ao campo aceito pelo endpoint de upload de ocorrência, preservando as permissões e a leitura da foto.

#### 21B — Anexos de inspeção
Permitir anexar e listar imagens de inspeção com validação de usuário, planta, tipo e tamanho. Em caso de falha, permitir nova tentativa sem criar outra inspeção.

### 22 — TASK-022: Auditar os módulos de Corte, Apoio e dados simulados
Identificar como as telas e endpoints de Corte e Apoio são usados e localizar respostas fictícias ou dados hardcoded. Registrar o que precisa ser integrado à rota e criar tarefas específicas para mudanças necessárias, sem ampliar esta auditoria para uma refatoração geral.

### 23 — TASK-023: Validar a jornada integrada
Verificar o fluxo completo de modelo, peças, rota, ordem, bipagem e Torre para novos cadastros e registros históricos. Conferir também cadastros individuais, permissões, anexos, horários e integridade dos dados.

### 24 — TASK-024: Fazer o cadastro de modelo incluir peças e rota
Guiar a criação de um novo modelo no Catálogo de Modelos para que suas peças e sua rota sejam definidas antes da gravação final. Preservar a edição de modelos existentes e permitir identificar modelos históricos que ainda precisam de rota.

#### 24A — Serviço e API do cadastro agregado
Criar uma operação de backend compartilhada que valide e persista modelo, peças e rota como um conjunto. Disponibilizar a consulta de modelos que têm rota e podem receber uma nova ordem; não duplicar essa regra nos consumidores.

#### 24B — Jornada de cadastro no Catálogo de Modelos
Compor cadastro do modelo, seleção de peças e construção da rota em uma jornada no catálogo. Permitir revisar e voltar entre as etapas antes de salvar o conjunto.

#### 24C — Seleção de modelos na criação de ordens
Exibir como opções somente modelos com rota válida para a nova ordem e orientar o usuário sobre modelos históricos pendentes. A API também deve aplicar essa regra, sem depender somente do filtro visual.

### 25 — TASK-025: Garantir a unicidade do código do produto
Impedir que duas criações concorrentes gravem o mesmo código, tanto no cadastro individual quanto no cadastro agregado. Antes de adicionar a constraint do banco, identificar duplicidades existentes e definir como tratá-las sem alterar códigos históricos automaticamente.

### 26 — TASK-026: Fazer o wizard gravar a rota no snapshot da ordem
Adaptar a finalização do wizard para reutilizar o serviço de cadastro agregado e gravar na ordem a mesma versão da rota definida para o modelo. Modelo, peças, rota e ordem devem ser confirmados juntos na transação final.

### 27 — TASK-027: Desativar temporariamente o checklist
Desativar a função de checklist no ERP inteiro enquanto ela não fizer parte do processo. Remover a tela, a API de preenchimento, o seed de novos itens e a trava de saída na Bipagem. Preservar entidades, tabelas, migrations e registros existentes; o dossiê continua podendo incluir respostas históricas.

**Escopo aprovado em 2026-10-14:** desativar o checklist no ERP todo, conforme confirmação da usuária. Remover a tela e rota frontend, endpoints de leitura/escrita, permissões específicas e seed; a saída de setores de handoff automático não deve consultar checklist. Preservar dados e leitura histórica no dossiê. O Gate de Inspeção de Qualidade para os demais setores permanece independente.

**Entrega técnica em 2026-10-14:** removidos a tela e rota frontend, os endpoints/controller de checklist, permissões ativas, seed de novos itens e envio de e-mail de checklist. A saída de setores de handoff automático não consulta mais checklists; o gate separado de inspeção dos demais setores continua ativo. O dossiê mantém a leitura de registros históricos.

**Preservação e validação:** nenhuma migration foi criada ou executada; tabelas, entidades, relações e registros existentes permanecem no banco. `npm run build` passou em `backend/` e `frontend/`; `git diff --check` passou. Nenhum teste automatizado ou fluxo manual foi executado. O backend compilado foi iniciado na porta 3001 e conectou ao banco, sem migrations pendentes.

**Estado:** validado pela usuária em 2026-10-14 ao iniciar a análise da TASK-005; alterações commitadas separadamente antes de iniciar o próximo ponto.

### 28 — TASK-028: Reorganizar “Iniciar Novo Teste” para ordem PCP antes da configuração de Modelagem

**Estado:** validada pela usuária ao iniciar o ponto seguinte, conforme fluxo acordado. Migration para remover `data_prevista_producao` criada e ainda não aplicada.

**Regra informada pela usuária em 2026-10-14:** o PCP será responsável por gerar a ordem. A sequência deve ser: (1) criação do modelo, (2) criação da ordem pelo PCP e, depois, os passos de peças e rota que serão feitos pela Modelagem.

**Esclarecimento confirmado pela usuária:** o PCP será o primeiro a saber do novo modelo e fará seu cadastro e o cadastro da ordem para que a unidade fique ciente do teste futuro. A ordem deve poder existir e permanecer visível antes da configuração da rota; o requisito da rota é para liberar a execução na produção, não para permitir cadastro ou conhecimento da ordem.

**Regras adicionais confirmadas pela usuária:** Gestão de Ordens e TV devem mostrar a ordem como “Aguardando Modelagem”; a Bipagem também deve reconhecer e mostrar a ordem, informando a pendência antes de iniciar qualquer operação. O PCP informa a previsão de corte do modelo. A decisão sobre possuir Caixa Teste não pertence ao PCP: será preenchida pela Modelagem durante a configuração. As permissões de PCP e Modelagem devem ser separadas e atribuíveis/gerenciáveis pela tela “Gestão de Perfis & Permissões (RBAC)”.

**Diagnóstico do fluxo atual:** `WizardCriacaoTesteView.vue` ainda organiza os passos como Modelo → Peças → Rota → Ordem. O botão de avançar do modelo só muda o passo; a rota do wizard também é mantida localmente e apenas preparada para envio. O endpoint final `/ordens-teste/wizard` cria modelo, peças, rota e ordem em uma única transação, e os dados do formulário não são retomáveis após recarregar ou fechar a tela. Portanto, o wizard ainda não grava o modelo no primeiro passo nem emite a ordem no segundo.

**Dependências a consolidar no mesmo trabalho, se aprovadas:** TASK-004 (busca de peças), TASK-006 (validação do código e Temporada), TASK-007A/007B (persistência e seleção de peças), TASK-008/009 (identidade, gravação e leitura da rota), TASK-010/026 (snapshot da rota da ordem), TASK-011 (transações, redefinidas para as etapas persistidas separadamente), TASK-012 (Construtor/preview), TASK-013 (wizard persistente e retomável), TASK-023 (jornada integrada), TASK-024A/024B/024C (cadastro/seleção do modelo e ordem, a reavaliar para evitar duplicidade de fluxos) e TASK-025 (unicidade concorrente do código). De TASK-014/015/016, incluir somente as barreiras necessárias para impedir que uma ordem incompleta entre na produção; a execução completa da rota e as adaptações completas de bipagem/TV permanecem sucessoras.

**Evidências técnicas:** o autocomplete já abre em `focus`/`input`, filtra localmente um catálogo carregado ao entrar no passo e o dropdown pode ser recortado pelo `overflow: hidden` do cartão; a causa exata do atraso visual relatado ainda precisa ser reproduzida. O endpoint agregado exige modelo, no mínimo duas peças, rota e ordem. `OrdemTesteStatus` não possui estado de espera por configuração da Modelagem. `GET /lotes` já retorna ordens sem rota e é consumido por Gestão de Ordens, Bipagem, Inspeção de Qualidade e TV. A Bipagem localiza qualquer ordem pelo código antes de autenticar o operador; a API de entrada depois exige que o setor exista na rota. A TV considera toda ordem não terminal ativa e cria nós visuais de “Conferência Inicial” mesmo sem histórico/rota. `PUT /lotes/:id` hoje aceita `liberadoProducao=true` sem validar rota. `POST /corte/distribuir` verifica peças, mas não valida a rota ou estado de liberação antes de criar rastreamentos. As permissões do wizard e do endpoint agregado exigem simultaneamente `EDITAR_TELA_NOVA_ORDEM_TESTE` e `EDITAR_ROTA`; as chaves e descrições de novas permissões precisam ser incluídas no catálogo RBAC para aparecer na tela de administração. O endpoint atual de ordens exige rota válida pré-existente, enquanto a regra nova exige gerar a ordem antes da rota. O código atual também mantém a regra Modelo → Ordem 1:1. O campo `Modelo.dataCorte` já existe e o Catálogo de Modelos o rotula “Data de Corte (Previsão)” com a orientação “Previsão da data de corte para programação da OP”; o wizard não o recebe atualmente. `OrdemTeste.dataPrevistaProducao` representa outro dado, exibido como “Data Prevista de Início na Produção”.

**Solução proposta para validação:** o PCP persiste o modelo no passo 1, preenchendo como obrigatória a previsão de corte já representada por `Modelo.dataCorte`, e cria a ordem no passo 2, recebendo sua identificação/código de barras. A ordem fica em estado explícito de “Aguardando Modelagem” e continua visível como teste futuro em Gestão de Ordens e na TV. Na Bipagem, reconhecer o código e informar a pendência, sem autenticar o operador nem iniciar a ação. A Modelagem retoma essa pendência em uma fila/tela, grava peças e rota em operação transacional, define se haverá Caixa Teste, registra na ordem o snapshot da rota validada para a planta e conclui a configuração. A ordem só pode ser liberada para produção após essa validação. A API deve impedir liberação, distribuição ao corte ou bipagem enquanto rota/configuração forem inválidas ou incompletas, sem retirar a ordem das listas de acompanhamento. A TV deve distinguir a ordem anunciada da ordem em execução e não simular etapa operacional antes da rota. Separar as permissões de criação de modelo/ordem e configuração de Modelagem, expor suas chaves no catálogo da tela RBAC e permitir que a administração atribua e revogue o acesso por perfil ali, sem IDs de perfil fixos no código. Manter busca de peças responsiva, com estados de carregamento/erro/vazio, interação por teclado e dropdown que não seja recortado pelo cartão. Aplicar unicidade do código no banco e preservar zeros à esquerda.

**Contratos confirmados pela usuária em 2026-10-14:** usar `Modelo.dataCorte` como única data de previsão no fluxo PCP e remover `dataPrevistaProducao` de telas, contratos, backend e banco; manter os campos de planta, prioridade e observações na ordem PCP; retirar Caixa Teste do PCP e exigir a decisão da Modelagem; manter uma ordem por modelo; e separar os acessos de PCP e Modelagem com atribuição pela tela RBAC. Gestão de Ordens e TV mostram “Aguardando Modelagem”; a Bipagem reconhece a ordem e informa a pendência sem iniciar operação. TASK-024B deve ser alinhada para não criar um fluxo concorrente anterior à ordem do PCP.

**Início da implementação em 2026-10-14:** escopo aprovado; alterações em andamento na branch `feature/erp-pontos-criticos`. Não houve alteração de código nem migration aplicada até o início desta etapa. A validação técnica (builds e `git diff --check`) e os fluxos manuais ficam registrados após a implementação. A usuária validou este ponto ao iniciar o seguinte; as alterações serão commitadas separadamente nesta etapa.

**Implementação concluída em 2026-10-14:** o PCP salva a identificação do modelo e sua previsão de corte antes de criar a ordem; a ordem recebe código de barras, mantém a relação 1:1 e passa a `AGUARDANDO_MODELAGEM`, sem decisão de Caixa Teste. A fila da Modelagem permite retomar a ordem, cadastrar/vincular peças preservando IDs, definir Caixa Teste, salvar uma nova versão da rota por planta e finalizar com snapshot/versionamento da rota. Gestão de Ordens, TV e Bipagem reconhecem o estado pendente; os endpoints de bipagem, distribuição ao corte, inspeção e ocorrência bloqueiam ordens pendentes e validam a rota selecionada. A edição direta de peças de modelos com ordem é direcionada ao fluxo da Modelagem; gravações de configuração/rota são serializadas para evitar finalizar uma versão desatualizada. A permissão `CONFIGURAR_MODELO_ORDEM` foi exposta no catálogo RBAC e a navegação da fila funciona para o perfil de Modelagem sem permissão para criar ordens. A busca de peças abre ao focar/digitar, permite teclado, exibe estados de carga/erro/vazio e não é recortada pelo cartão. A decisão de Caixa Teste foi removida do PCP e do Construtor de Rota, permanecendo na configuração da Modelagem.

**Migration adicionada e aplicada no banco de desenvolvimento em 2026-10-14:** `1791980300000-PcpModelagemOrdem` acrescenta o estado, snapshot/versão da rota e nullable para a decisão ainda não feita de Caixa Teste; cria unicidade de código do modelo e da relação modelo-ordem; publica a ação RBAC. O log da usuária confirmou execução bem-sucedida e `COMMIT`; não houve renumeração nem alteração destrutiva de registros.

**Verificações técnicas:** `npm run build` passou em `backend/` e `frontend/`; `git diff --check` passou. Nenhum teste automatizado foi executado. A migration foi aplicada com sucesso no banco de desenvolvimento. Os fluxos funcionais ainda precisam de validação manual pela usuária, incluindo: criar modelo com código numérico contendo zeros à esquerda e previsão de corte; criar ordem e confirmar Aguardando Modelagem na Gestão de Ordens/TV/Bipagem; configurar peças/Caixa Teste/rota como Modelagem; confirmar que a ordem só então fica disponível na produção e que a bipagem usa a versão vinculada à ordem.

**Validação manual parcial — fluxo PCP:** a usuária confirmou com captura de tela que o modelo e a ordem foram criados com sucesso e que a ordem aparece como “Aguardando Modelagem”. Isso valida a criação da ordem no fluxo anterior aos ajustes aprovados abaixo. A usuária também reportou `404` no `PATCH /api/erp-modelagem/admin/modelos/:id/previsao-corte`. A instância inicial, PID `632079` (`node dist/server.js`), ocupava a porta `3001` e carregava arquivos compilados antigos, o que explica aquele `404`. Em seguida, uma instância de desenvolvimento iniciada pelo agente ocupou a mesma porta e causou um `EADDRINUSE`; o agente a encerrou com `Ctrl+C`, e `ss` confirmou a porta livre. A migration já está aplicada. Após os ajustes de posicionamento da previsão descritos abaixo, a usuária ainda precisa validar o salvamento da previsão no Passo 2, a criação da ordem, e o fluxo completo de configuração pela Modelagem.

**Feedback visual/fluxo da usuária em 2026-10-14 — implementado:** no PCP, a previsão de corte aparece somente no Passo 2, obrigatória e editável. O Passo 1 salva apenas a identificação do modelo. `Modelo.dataCorte` aceita nulo; a API grava a previsão enviada no Passo 2 e cria a ordem na mesma transação. O indicador do PCP apresenta apenas Modelo e Ordem; Peças e Rota continuam no indicador da Modelagem e na fila de pendências. O dropdown de Marca permanece sincronizado com as mudanças do modal: remove marcas inativas, inclui reativadas, atualiza renomeadas e limpa seleção inativa em novo cadastro, sem perder a identificação de um modelo existente já selecionado. **Verificação técnica:** builds do backend e frontend passaram e `git diff --check` passou; nenhum teste automatizado foi executado e nenhuma migration foi necessária. **Validação manual pendente:** conferir a previsão somente no Passo 2, salvar modelo e ordem, e verificar o dropdown depois de desativar, reativar e renomear marcas; concluir também a validação ponta a ponta da fila e liberação da Modelagem.

**Organização Git:** commit `405c1cf` (`feat(pcp): reorganiza cadastro e configuração de ordens`) criado a pedido da usuária. A branch continua `feature/erp-pontos-criticos`; não houve push ou PR.

### 29 — TASK-029: Completar o acesso à fila da Modelagem e o vínculo de peças

**Estado:** pendente de implementação e validação.

**Escopo:** garantir o acesso da Modelagem à fila de ordens, permitir cadastrar/vincular peças por sub-setor e preservar o Catálogo de Peças como cadastro mestre.

### 30 — TASK-030: Corrigir descarte e delegação de acesso RBAC

**Estado:** validado pela usuária ao avançar para os próximos pontos; builds do backend e frontend passaram e `git diff --check` passou. Migrations criadas, ainda não aplicadas.

**Escopo:** corrigir “Descartar rascunho” e delegar acesso à Matriz via RBAC. Somente a equipe de automação concede/revoga esse acesso e administra `ADMIN_AUTOMACAO`.
