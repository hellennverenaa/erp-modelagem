# Plano de implementação — ERP Modelagem

## Pontos pendentes

### 02 — TASK-002: Definir as regras de Bordado, Apoio e bifurcação
**Estado: em andamento.** Definir com o processo como Bordado e Apoio se relacionam na rota e na produção: substituição, paralelo ou subprocesso. Esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem. A regra deve vir da rota, sem configuração duplicada na ordem.

**Escopo concluído nesta entrega:** Incluir o setor Telas na Conferência Inicial somente quando Serigrafia estiver ativa em Setores Condicionais, tanto no Passo 4 do fluxo de criação quanto no Construtor de Rota individual. A migration normaliza novas versões de rotas existentes e preserva versões anteriores e snapshots. O restante da tarefa continua em andamento para definir as regras de Bordado, Apoio e bifurcação.

### 14 — TASK-014: Fazer o backend operacional executar a rota da ordem
**Estado: pendente.** Usar o snapshot da ordem para validar etapas permitidas, sequência e condições; associar cada bipagem à etapa da ordem e manter leitura compatível com ordens antigas.

### 15 — TASK-015: Adaptar a tela de bipagem à rota da ordem
**Estado: pendente.** Remover sequências fixas de setores. Ao selecionar uma ordem, exibir apenas setores e processos da rota dela, com posição, estado e ações permitidas.

### 16 — TASK-016: Adaptar a TV de rastreamento à rota da ordem
**Estado: pendente.** Exibir snapshot e progresso real da ordem em vez da rota atual do modelo, preservando o histórico quando o modelo for editado.

### 17 — TASK-017: Conectar os dados e indicadores da Torre de Controle
**Estado: pendente.** Revisar endpoints, filtros, setores, tempos e agregações para consumir dados reais de ordens, rotas, bipagens, qualidade e ocorrências; identificar mocks e validar indicadores com registros de produção.

### 18 — TASK-018: Revisar a interface da Torre de Controle
**Estado: implementação entregue — validação visual/manual pendente.** A view foi reorganizada em cards KPI independentes, gráfico e Saúde Operacional (8/4), e qualidade/retrabalho (5/7), com estados compactos, skeleton alinhado ao grid e erro de comunicação com retry. O grid visual está em `frontend/src/components/DashboardGerencialMetrics.vue`; tipos compartilhados ficam em `frontend/src/types/dashboardGerencial.ts`; API, sincronização e galeria permanecem em `frontend/src/views/DashboardGerencialView.vue`. Preservados o endpoint `/dashboard/kpis`, payloads, eventos/listeners WebSocket, helpers de formatação e funções da galeria. A referência `/home/hellen/Downloads/gemini-svg.svg` orientou a paleta clara, bordas slate e destaque índigo. Nenhuma mudança de backend ou migration.

**Evidências de validação:** `cd frontend && npm run build` concluído com `vue-tsc -b` e `vite build`; `git diff --check` sem erros. A tela ainda precisa de revisão visual/funcional no navegador em desktop e mobile; não foi executada nesta entrega. Próximo passo: validar a aparência e os estados com dados reais e confirmar o fluxo de abertura/navegação da galeria.

### 19 — TASK-019: Padronizar datas no backend e no banco
**Estado: pendente.** Definir como instantes e prazos são recebidos, persistidos e serializados. Tratar valores históricos conforme sua interpretação atual, sem conversões em massa sem auditoria.

### 20 — TASK-020: Corrigir a apresentação e edição de datas no frontend
**Estado: pendente.** Apresentar datas no horário local e enviar valores editados com timezone explícito, conforme o contrato da TASK-019. Remover conversões que tratem UTC como hora local ou usem offsets fixos.

### 22 — TASK-022: Auditar os módulos de Corte, Apoio e dados simulados
**Estado: pendente.** Identificar como telas e endpoints de Corte e Apoio são usados, localizar respostas fictícias e dados hardcoded, e registrar mudanças necessárias sem ampliar a auditoria para uma refatoração geral.

### 23 — TASK-023: Validar a jornada integrada
**Estado: pendente.** Validar o fluxo completo de modelo, peças, rota, ordem, bipagem e Torre, incluindo cadastros individuais, permissões, anexos, horários e integridade dos dados.

### 24 — TASK-024: Refinar a integração visual da Torre de Controle
**Estado: implementação concluída; validação visual pendente. Dependência: TASK-018.** `frontend/src/index.css` voltou a herdar a fonte global definida em `App.vue`; `DashboardView.vue` alinha a busca e remove o padding somente na rota gerencial; `DashboardGerencialView.vue` compacta o cabeçalho e o espaçamento do conteúdo; `DashboardGerencialMetrics.vue` aplica os cards com microinterações, melhora os KPIs, identifica pontos do gráfico e equilibra FPY/retrabalho. Contrato da API, WebSocket e galeria preservados. Sem alterações de backend ou migrations.

**Evidências de validação:** `cd frontend && npm run build` concluído com `vue-tsc -b` e `vite build`; `git diff --check` sem erros. Não foi possível iniciar o servidor Vite para inspeção visual: o sandbox bloqueou a abertura de `127.0.0.1:5173` (`EPERM`). A verificação visual responsiva em desktop/mobile permanece pendente; nenhum teste funcional foi executado.

### 25 — TASK-025: Tornar o gráfico do Lead Time interativo e simplificar os rótulos
**Estado: implementação entregue — validação visual/interativa pendente. Dependência: TASK-024.** `DashboardGerencialMetrics.vue` agora seleciona o ciclo mais recente inicialmente, oferece área de interação mouse/teclado nos pontos do SVG e mostra os detalhes do lote selecionado em cartão HTML. O eixo respeita a ordem cronológica real retornada pelo backend, com os lotes mais antigos à esquerda. Os rótulos técnicos foram substituídos por linguagem de chão de fábrica compatível com o escopo atual das consultas: WIP conta ordens não reprovadas, médias usam até cinco ciclos recentes em acompanhamento, downtime não é filtrado por gravidade e FPY considera inspeções de saída de setor. Endpoint, WebSocket, galeria e cálculos do backend permanecem preservados. Sem mudanças no backend ou migrations.

**Evidências de validação:** `cd frontend && npm run build` concluído com `vue-tsc -b` e `vite build`; `git diff --check` sem erros; busca pelos rótulos técnicos substituídos sem ocorrências. A interação visual do hover, teclado e card de detalhes ainda precisa ser confirmada no navegador; nenhum teste funcional foi executado.

### 26 — TASK-026: Remover indicadores de pausa da Torre e restringir interrupção de SLA por usuário
**Estado: implementação entregue — validação funcional/manual pendente. Dependência: TASK-025 (PR #11).** A Torre não expõe mais o KPI de downtime, motivos de parada nem parada por lote; o payload `/dashboard/kpis` e os tipos foram reduzidos e as consultas de pausa removidas. O Lead Time, gargalos, ocorrências e cálculo de SLA em rastreamentos permanecem. A coluna individual `pode_interromper_sla` é administrada na aba Usuários, com escrita somente para `ADMIN_AUTOMACAO`, auditoria RBAC e verificação server-side baseada na conta autenticada. A interface de Bipagem só mostra o controle para contas autorizadas.

**Evidências de validação:** `cd frontend && npm run build` e `cd backend && npm run build` concluídos; `git diff --check` sem erros; busca nos consumidores do dashboard sem referências aos campos e rótulos de pausa removidos. Em 2026-10-15, o estado inicial do banco PostgreSQL local configurado mostrou 18 de 19 migrations aplicadas; as migrations `1791980400000`, `1791980500000` e `1791980600000` já constavam no histórico do banco. A `1791980700000-AdicionaPermissaoIndividualPausarSla` foi executada com sucesso e commit transacional. A consulta final `migration:show` confirmou as 19 migrations aplicadas, sem pendências. O comando de preparação também concluiu a verificação/criação idempotente do schema `erp_modelagem` e da extensão `uuid-ossp`. **Pendências:** validação funcional da API/interface com usuários autorizados e não autorizados; revisão visual no navegador não executada. Próximo passo: validar o fluxo de concessão, revogação e tentativa de pausa.

## Migrations relacionadas à TASK-026

- `1791980400000-ConcedeConfiguracaoModeloAdminAutomacao`: aplicada no banco local; concede a ação de configuração do modelo ao perfil de automação.
- `1791980500000-HabilitaMatrizRbacDelegada`: aplicada no banco local; habilita a permissão da Matriz no catálogo RBAC e para o perfil de automação.
- `1791980600000-RemoveDataPrevistaProducao`: já aplicada no banco local antes desta execução; remove a coluna `data_prevista_producao` e os valores existentes.
- `1791980700000-AdicionaPermissaoIndividualPausarSla`: aplicada nesta execução no banco local; adiciona `usuarios.pode_interromper_sla` como `boolean NOT NULL DEFAULT false`, deixando a pausa negada por padrão.

O estado acima foi confirmado somente no PostgreSQL local apontado pela configuração desta sessão. Outros ambientes precisam de consulta e aplicação próprias; não foram acessados.

### 27 — TASK-027: Ampliar categorias de gargalo e detalhar ocorrências do tipo Outro
**Estado: implementação entregue — validação funcional/manual pendente. Dependência: TASK-026.** O formulário de Bipagem oferece `Liberação parcial` e `Aguardando resposta do Sul`. `OUTRO` mostra o campo condicional `Qual ocorrência?`, armazenado no `titulo` existente (limite de 200 caracteres); a descrição detalhada continua separada. O enum TypeScript, enum PostgreSQL e contrato Swagger foram atualizados, e o Dossiê apresenta rótulos legíveis para as novas categorias. Upload de evidências, identificação por crachá e autorização individual para interromper SLA permanecem preservados.

**Evidências de validação:** `cd backend && npm run build`, `cd frontend && npm run build` e `git diff --check` concluídos. A migration `1791980800000-AdicionaTiposOcorrenciaProducao` foi aplicada no PostgreSQL local configurado e `migration:show` confirmou 20 de 20 migrations aplicadas. **Pendências:** validar manualmente na interface a seleção das categorias e o campo de `OUTRO`, além da gravação e leitura no Dossiê; nenhum teste automatizado dedicado existe no projeto. Outros ambientes não foram acessados nem migrados.

## Migration relacionada à TASK-027

- `1791980800000-AdicionaTiposOcorrenciaProducao`: aplicada somente no banco local; adiciona `LIBERACAO_PARCIAL` e `AGUARDANDO_RESPOSTA_SUL` ao enum PostgreSQL antes de `OUTRO`. O rollback recusa remover os valores quando já houver ocorrências usando-os.

### 28 — TASK-028: Persistir SLA da rota e iniciar o tempo na entrada do setor
**Estado: implementação entregue — validação funcional/manual pendente. Relação: entrega parcial relacionada à TASK-016.** Persistir o prazo em minutos em cada etapa/versionamento da rota, carregar o valor salvo no Construtor de Rota e disponibilizá-lo para a TV por meio do mapa congelado na ordem/snapshot ou da rota vinculada. O tempo exibido usa `dataEntrada` do rastreamento; etapas sintéticas sem uma entrada registrada permanecem aguardando, sem contador nem atraso.

**Entrega:** `RotaModelo.slaAlvoMin` guarda o prazo da etapa e a migration backfill lê mapas de ordens/snapshots para a versão correspondente, usando 120 minutos quando não há valor histórico. O controller de rotas salva o mapa recebido; o Construtor de Rota hidrata os valores ao reabrir o modelo. Os fluxos de finalização/criação da ordem copiam os SLAs da rota para o mapa por ordem, e o fluxo de manutenção preserva os overrides existentes. A TV prioriza mapa da ordem, depois snapshot e por fim o SLA da rota; não inicia o contador para a Conferência Inicial sintética. `dataEntrada` real continua vindo do rastreamento persistido.

**Evidências:** `cd backend && npm run build` e `cd frontend && npm run build` concluídos; `git diff --check` sem erros. Não há teste automatizado dedicado a SLA/TV e o `npm test` do backend é placeholder; não foi executado. A migration foi criada, mas não aplicada. **Pendências:** validar salvar/reabrir uma rota, finalizar uma ordem e conferir na TV a contagem antes/depois de refresh, atraso e espera por entrada; conferir também os dados após aplicar a migration no banco alvo.

## Migration relacionada à TASK-028

- `1791981000000-PersisteSlaNaRotaModelo`: adiciona `rota_modelo.sla_alvo_min` com padrão de 120 minutos e migra valores de SLA do snapshot/mapa de cada ordem para a versão correspondente da rota. Criada nesta entrega; ainda não aplicada em banco.

### 29 — TASK-029: Listar modelos sem rota no Construtor de Rota
**Estado: implementação entregue — validação funcional/manual pendente.** Separada a listagem do Construtor da listagem usada na criação de ordens. O novo `GET /rotas/modelos`, protegido pela permissão `TELA_CONSTRUTOR_ROTA`, retorna somente os campos necessários de todos os modelos ativos, sem filtrar ordens ou rotas. A tela individual usa esse endpoint; o carregamento da rota continua escopado à planta selecionada. O endpoint `/admin/modelos` mantém o filtro 1:1 para criação de ordens.

**Evidências:** `cd backend && npm run build`, `cd frontend && npm run build` e `git diff --check` concluídos. Não há teste automatizado dedicado a essa listagem. **Pendências:** validar manualmente um modelo ativo sem rota, um modelo com ordem mas sem rota, um modelo com rota em outra planta, modelo inativo e acesso à listagem por usuário com e sem a permissão do Construtor. O endpoint de criação de ordens deve continuar omitindo modelos já vinculados a uma ordem.
