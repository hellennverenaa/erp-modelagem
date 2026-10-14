# Plano de implementação — ERP Modelagem

## Pontos pendentes

### 02 — TASK-002: Definir as regras de Bordado, Apoio e bifurcação
**Estado: pendente.** Definir com o processo como Bordado e Apoio se relacionam na rota e na produção: substituição, paralelo ou subprocesso. Esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem e mostrando Telas somente quando houver Serigrafia. A regra deve vir da rota, sem configuração duplicada na ordem.

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

## Migrations criadas e pendentes de aplicação

- `1791980400000-ConcedeConfiguracaoModeloAdminAutomacao`: concede a ação de configuração do modelo ao perfil de automação.
- `1791980500000-HabilitaMatrizRbacDelegada`: habilita a permissão da Matriz no catálogo RBAC e para o perfil de automação.
- `1791980600000-RemoveDataPrevistaProducao`: remove a coluna `data_prevista_producao` e os valores existentes, conforme autorizado.
