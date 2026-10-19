# Plano de implementação — ERP Modelagem

## Regras de negócio pendentes

### Bordado, Apoio e bifurcação (TASK-002)
**Estado: em andamento.** Definir com o processo como Bordado e Apoio se relacionam na rota e na produção: substituição, paralelo ou subprocesso. Esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem. A regra deve vir da rota, sem configuração duplicada na ordem.

## Implementação pendente

### Tickets por setor e possível transferência parcial
**Regras confirmadas para tickets:** gerar um ticket identificável por setor e por fluxo da ordem (Lote Principal e, quando ativada, Caixa Teste), ambos vinculados à mesma rota congelada e com códigos de bipagem distintos. O fluxo permanece discriminado no rastreamento. A Caixa Teste percorre a rota separadamente, inclusive setores hoje bloqueados como monolíticos. Os tickets do Corte são uma categoria própria, agrupada pelos subsetores/máquinas configurados e impressa uma vez por ordem.

**Transferências parciais — aguardando decisão da gerente:** ainda será definido se a operação terá saída parcial. Não iniciar análise de solução nem implementação desse fluxo até a definição. A proposta discutida anteriormente — sem controle de quantidade, motivo obrigatório, setor de origem permanecendo aberto e recebimento confirmado por crachá no setor seguinte — deve ser revisada caso a gerente aprove a funcionalidade.

**Fundação dos tickets — concluída e validada:** migration e entidade para tickets persistentes por ordem/setor; geração idempotente junto da ordem quando o snapshot da rota existe ou é congelado. O fluxo PCP cria os tickets ao finalizar a Modelagem. O fluxo do wizard grava o snapshot da rota antes de gerar os tickets.

**Gestão, impressão e leitura de tickets — implementada nesta branch, aguardando validação:** “Lote principal” imprime os tickets por setor do fluxo principal; “Caixa Teste” imprime a mesma rota com tickets e códigos próprios; “Tickets de Corte” imprime os subsetores de corte; “Imprimir todos os setores” reúne Lote Principal, Caixa Teste quando habilitada e Corte em um único PDF. Os tickets de Corte são incluídos uma vez por ordem. A bipagem reconhece o código do ticket e obtém ordem, setor e tipo de lote, mantendo compatibilidade com códigos antigos da ordem. O gabarito é A4, 2 colunas × 5 linhas, células destacáveis de 90 × 53 mm, início a 13 mm do topo e continuação em páginas adicionais após 10 etiquetas. A regra de impressão não controla quantidade.

**Validação anterior:** a impressão pelo botão “Imprimir todos os setores” foi confirmada com os tickets distintos da rota; a captura mostra duas páginas para o teste. Builds do backend e frontend passaram. A lista do modal rola dentro da janela e não oferece impressão individual por setor. **Validação desta revisão:** builds de frontend e backend, `git diff --check` e carregamento do DataSource passaram; a usuária confirmou que `npm run dev` iniciou normalmente após a etapa de migrations. Permanecem a leitura física dos códigos, o PDF combinado com os três grupos e o alinhamento do gabarito na folha.

**Correção de inicialização — validada:** `TipoLote` foi extraído para um módulo independente e reexportado por `Rastreamento.ts` para evitar o ciclo de imports entre as entidades `Peca`, `Rastreamento`, `OrdemTeste` e `TicketSetor`. Build e carregamento do DataSource passaram, e a usuária confirmou que `npm run dev` iniciou normalmente.

**Estado operacional e transferências parciais:** em espera até decisão da gerente sobre a necessidade de saídas parciais.

**Execução em etapas:**

- **Fundação dos tickets:** criar e persistir tickets por setor e fluxo da rota congelada, com códigos de barras distintos e criação idempotente. Os registros existentes permanecem como Lote Principal. No fluxo PCP, gerar os tickets ao finalizar a configuração da Modelagem; nos fluxos que já criam a ordem com rota, gerar na criação. Usar o snapshot da ordem para preservar a rota original.
- **Gestão, impressão e leitura de tickets (implementada nesta branch; validação pendente):** apresentar os tickets dos dois fluxos com etapa, versão da rota, tipo e código; recuperar registros ausentes idempotentemente do snapshot congelado; imprimir Lote Principal, Caixa Teste e Corte separadamente; reunir todos os grupos em um único PDF no gabarito A4 2×5, início a 13 mm, com páginas adicionais; manter o modal rolável; reconhecer na Bipagem o código e obter ordem, setor e tipo automaticamente, preservando códigos antigos. Remover a restrição que hoje impede Caixa Teste nos setores iniciais/monolíticos, em alinhamento com a regra de rota clonada. Confirmar códigos, nomes dos setores, impressão e alinhamento físico. Os tickets de Corte são impressos uma vez por ordem.
- **Transferências (aguardando decisão gerencial):** se aprovadas, definir os requisitos finais antes de implementar os eventos de saída, motivo, recebimento por crachá e cálculo do tempo do destino.
- **Bipagem e acompanhamento (dependente da decisão):** se a transferência parcial for aprovada, localizar eventos por ticket e exibir entregas e responsáveis na Bipagem, TV, SLAs e histórico, preservando compatibilidade com ordens antigas.
- **Validação (condicional):** se aprovada a funcionalidade, cobrir rotas simples e ramificadas, Lote Principal e Caixa Teste, entregas, recebimentos por pessoas diferentes, permissões, duplicidade, qualidade e ordens legadas.

**Dependências:** preservar a rota congelada em todos os caminhos de criação e integrar a fundação com a gestão, a impressão, a Bipagem e a TV nas etapas seguintes. Ordens antigas sem snapshot permanecem sem rota/tickets inferidos.

### Indicador de Lead Time por modelo com tênis (TASK-032)
**Estado: implementação integrada nesta branch; validação visual e dos dados pendente.** O protótipo veio do commit `a93a780` da branch `feat/grafico-lead-time-por-modelo`. As mudanças foram aplicadas à branch atual (`feat/ajuste-visual-tv-rastreamento`) e aguardam validação.

**Escopo do indicador:** comparar modelos, não representar uma sequência temporal. O protótipo usa colunas verticais, com um ícone genérico de tênis acima de cada coluna, valor em horas, modelo e marca; colore Nike em vermelho, Fila em azul e outras marcas em cinza. Permite selecionar um modelo e consultar os dados do lote associado. O endpoint também foi alterado no protótipo para usar o Lote Principal mais recente de cada modelo, ordenar pelo maior Lead Time e limitar a exibição a dez modelos.

**Execução em etapas:**

- **Revisão e integração (concluída):** reaplicar somente as mudanças do indicador no controller e no componente, preservando os demais módulos e o comportamento atual dos outros KPIs.
- **Regra dos dados:** confirmar com dados reais que usar o Lote Principal mais recente por modelo e ordenar pelos maiores tempos representa a comparação desejada; conferir modelos sem identificador, sem marca ou sem Lead Time positivo.
- **Apresentação e interação:** validar tênis acima das colunas, cores por marca, rótulos, seleção e painel de detalhes, navegação por teclado e rolagem horizontal em telas estreitas.
- **Validação final:** compilar frontend e backend após integrar o endpoint e conferir manualmente a Torre de Controle com modelos de marcas diferentes e com poucos ou muitos resultados.

**Dependência:** o protótipo está em uma branch separada e altera tanto `DashboardGerencialMetrics.vue` quanto a agregação de `dashboard.controller.ts`; não é apenas uma mudança de CSS.

### Execução da rota da ordem no backend (TASK-014)
Usar o snapshot da ordem para validar etapas permitidas, sequência e condições; associar cada bipagem à etapa da ordem e manter leitura compatível com ordens antigas.

### Bipagem orientada à rota da ordem (TASK-015)
Remover sequências fixas de setores. Ao selecionar uma ordem, exibir apenas setores e processos de sua rota, com posição, estado e ações permitidas.

### TV de rastreamento usando o snapshot da ordem (TASK-016)
Exibir snapshot e progresso real da ordem em vez da rota atual do modelo, preservando o histórico quando o modelo for editado.

### Dados reais da Torre de Controle (TASK-017)
Revisar endpoints, filtros, setores, tempos e agregações para consumir dados reais de ordens, rotas, bipagens, qualidade e ocorrências; identificar mocks e validar indicadores com registros de produção.

### Padronização de datas no backend e no banco (TASK-019)
Definir como instantes e prazos são recebidos, persistidos e serializados. Tratar valores históricos conforme sua interpretação atual, sem conversões em massa sem auditoria.

### Apresentação e edição de datas no frontend (TASK-020)
Apresentar datas no horário local e enviar valores editados com timezone explícito, conforme o contrato da TASK-019. Remover conversões que tratem UTC como hora local ou usem offsets fixos.

### Auditoria de Corte, Apoio e dados simulados (TASK-022)
Identificar como telas e endpoints de Corte e Apoio são usados, localizar respostas fictícias e dados hardcoded, e registrar mudanças necessárias sem ampliar a auditoria para uma refatoração geral.

### Jornada integrada (TASK-023)
Validar o fluxo completo de modelo, peças, rota, ordem, bipagem e Torre, incluindo cadastros individuais, permissões, anexos, horários e integridade dos dados.

## Verificação de migrations por ambiente

As migrations abaixo foram confirmadas somente no PostgreSQL local desta sessão. O estado em outros ambientes não foi consultado; confirmar antes de qualquer implantação:

- TASK-026: 1791980400000, 1791980500000, 1791980600000 e 1791980700000.
- TASK-027: 1791980800000.
- TASK-028: 1791981000000.
- TASK-030: 1791981100000 e 1791981200000.

### TASK-031 — Renovação da sessão DASS para telas de acompanhamento contínuo
**Estado: implementada nesta branch; builds do backend e frontend passaram. Validação funcional/manual pendente.** O ERP repassa somente os cookies `token` e `refreshToken` emitidos pelo DASS, renova a sessão expirada via `POST /auth/me`, retorna o access token renovado e encaminha a rotação/limpeza dos cookies. O frontend compartilha uma renovação entre chamadas simultâneas, repete uma vez a requisição que recebeu `AUTH_TOKEN_EXPIRED` e atualiza/reconecta o WebSocket da TV. Falhas transitórias do DASS mantêm a sessão local e são tentadas novamente; logout revoga a sessão remota e limpa os dados locais. O refresh token não é exposto ao JavaScript. Sem mudanças no Gateway, DASS ou banco.

**Validação pendente:** confirmar o comportamento de cookies no navegador e HTTPS; testar renovação após expiração, retry HTTP único, reconexão do WebSocket após interrupção de rede e logout. Não foram executados testes de integração com o DASS.

### TASK-033 — Preservar a sessão em falhas transitórias de autenticação
**Estado: implementada nesta branch; build do frontend passou. Validação funcional pendente.** A guarda de navegação redirecionava ao login diante de qualquer falha em `/auth/me`, inclusive timeout, indisponibilidade temporária ou resposta `5xx`. O interceptor também encerrava a sessão para qualquer `401`, sem distinguir os códigos de sessão inválida emitidos pelo backend.

**Escopo:** classificar erros de autenticação pelos códigos reais do backend; renovar em `AUTH_TOKEN_EXPIRED`; limpar a sessão apenas em rejeição explícita ou invalidez conhecida; manter o perfil em cache e não redirecionar durante falhas transitórias; limitar a validação de `/auth/me` para evitar uma chamada a cada navegação. Quando não houver perfil em cache durante uma indisponibilidade, apresentar uma tela temporária com opção de tentar novamente.

**Validação executada:** `npm run build` no frontend e `git diff --check` passaram. **Validação funcional pendente:** conferir renovação após expiração, falha de rede/`5xx` com navegação e perfil em cache, indisponibilidade sem perfil em cache, rejeição definitiva do refresh token e reconexão da TV. Não presumir o gatilho específico do logout observado sem os códigos de resposta da sessão real.

### TASK-034 — Seeding de dados genéricos operacionais para o ERP de Modelagem
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Correção do seeder para respeitar a constraint `CHK_modelos_codigo_produto_numerico` e expansão de dados genéricos completos para permitir teste e operação de todas as telas (Gestão de Modelos, Catálogo de Peças, Gestão de Ordens, Construtor de Rota, Bipagem Operacional, TV Rastreamento, Torre de Controle e Inspeção de Qualidade).

**Escopo implementado:**
- Resolução do erro na inserção de modelos garantindo códigos estritamente numéricos (`3080910`, `3080920`, `3060908`, `3060918`, `3060400`, `3060410`, `3060420`, `3060430`).
- Otimização do seeder do catálogo de peças evitando loops redundantes quando o catálogo técnico já estiver populado (969 registros de `Dados.csv`).
- Provisionamento idempotente de 21 setores operacionais por planta (Planta Padrão e Planta Principal) alinhados às categorias `setor_tipo` e `subsetor_corte`.
- Cadastro de estações de trabalho e máquinas físicas para os setores de corte, serigrafia, apoio, costura, montagem e laboratório.
- Cadastro de colaboradores e crachás para teste de leitura de crachá/RFID agnóstica de hardware.
- Cadastro de modelos e associação com peças técnicas do catálogo (`CatalogoPeca`) respeitando as exigências de corte da regra de negócio (`validateRouteIntegrity`).
- Construção de rotas operacionais completas, sequenciais, com versionamento e SLAs definidos.
- Geração de 6 ordens de teste em múltiplos estados operacionais (`MONTAGEM`, `LIBERADO_PRODUCAO`, `EM_CORTE`, `EM_RETRABALHO`, `INSPECAO_QUALIDADE`, `AGUARDANDO_MATERIAL`), além de modelos livres para criação via Wizard/PCP.
- Geração idempotente de tickets persistentes por setor para os fluxos Lote Principal e Caixa Teste.
- Registro de 104 eventos de rastreamento com horários, tempos de permanência, operadores e estações de trabalho para cálculo de Lead Time e WIP.
- Registro de ocorrências ativas e em análise de chão de fábrica (gargalo de máquina e falta de material).
- Registro de inspeções de qualidade formais e de saída de setor, com divergência dimensional e ordem de retrabalho cirúrgico.

**Validação técnica executada:**
- `npm run seed` executado duas vezes com sucesso, confirmando idempotência (0 duplicatas, 0 falhas).
- Verificação das 18 tabelas operacionais no PostgreSQL confirmando dados consistentes.
- `npm run build` no backend concluído sem erros de TypeScript.
- `npm run build` no frontend concluído sem erros de TypeScript/Vue.
- `git diff --check` aprovado sem pendências.

### TASK-035 — Otimização de Banco de Dados, Índices Estratégicos e Paginação
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 1 do relatório de melhorias: criação de 12 índices estratégicos para tabelas transacionais, habilitação de busca Trigram GIN, suporte a paginação e parametrização do pool de conexões PostgreSQL.

**Escopo implementado:**
- Criação e aplicação da migration `1792161400000-OtimizacaoIndicesEBuscaTrigram.ts`:
  - `idx_rastreamentos_ordem_tipo_status` em `(ordem_teste_id, "tipoLote", status)`.
  - `idx_rastreamentos_setor_datas` em `(setor_id, data_entrada, data_saida)`.
  - `idx_rastreamentos_peca_id` em `(peca_id) WHERE peca_id IS NOT NULL`.
  - `idx_inspecoes_ordem_setor` em `(ordem_teste_id, setor_id, resultado)`.
  - `idx_ocorrencias_ordem_status` em `(ordem_teste_id, status)`.
  - `idx_ocorrencias_setor_data` em `(setor_id, data_ocorrencia)`.
  - `idx_etapas_corte_rastreamento` em `(rastreamento_id)`.
  - `idx_etapa_corte_pecas_etapa` em `(etapa_corte_id)`.
  - `idx_divergencias_ordem_setor` em `(ordem_teste_id, setor_id, resolvido)`.
  - `idx_retrabalhos_ordem_divergencia` em `(ordem_teste_id, divergencia_id, status)`.
  - Habilitação da extensão `pg_trgm` e índice `idx_catalogo_pecas_trgm_nome` USING GIN (`nome gin_trgm_ops`).
  - `idx_catalogo_pecas_codigo_original` em `(codigo_original) WHERE codigo_original IS NOT NULL`.
- Parametrização do pool de conexões do PostgreSQL em `backend/src/config/database.ts` (`max: 25`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`).
- Adição de suporte a paginação (`page`, `limit`) e busca otimizada (`q`) em `GET /api/catalogo-pecas` com fallback retrocompatível de array direto e cabeçalho `X-Total-Count`.
- Adição de suporte a paginação (`page`, `limit`), filtros de status e busca em `GET /api/lotes` com fallback retrocompatível de array direto e cabeçalho `X-Total-Count`.

**Validação técnica executada:**
- `npm run migration:run` executado e aplicado com sucesso no PostgreSQL.
- Verificação dos 15 índices operacionais no PostgreSQL via `pg_indexes`.
- Teste de `EXPLAIN ANALYZE` confirmando uso do `Index Scan using idx_rastreamentos_ordem_tipo_status`.
- `npm run seed` executado com 100% de sucesso e integridade preservada.
- `npm run build` no backend e frontend aprovados sem erros.
- `git diff --check` sem pendências.

### TASK-036 — Otimização do Puppeteer (Browser Singleton) e Suíte de Testes com Vitest
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 2 e Ponto 4 do relatório de melhorias: eliminação de inicialização e destruição contínua do Chromium para geração de PDFs/etiquetas e implantação da suíte de testes automatizados com Vitest cobrindo regras críticas de integridade de rota.

**Escopo implementado:**
- Criação de `backend/src/services/puppeteer.service.ts`:
  - Padrão Singleton gerenciado para o Chromium, evitando o custo de *process spawn* a cada documento gerado.
  - Isolamento seguro por aba (`browser.newPage()`), fechamento garantido no bloco `finally` (`page.close()`) e reciclagem transparente da aba.
  - Auto-recuperação diante de crash ou desconexão inesperada (`browser.on('disconnected')`).
  - Suporte a caminho customizado via variável de ambiente `PUPPETEER_EXECUTABLE_PATH`.
  - Tratamento de *graceful shutdown* nos eventos `SIGTERM` e `SIGINT`.
- Refatoração de `backend/src/services/etiqueta.service.ts` e `backend/src/services/dossie.service.ts` para consumir `PuppeteerService.renderPdf`, reduzindo o tempo de emissão e consumo de RAM.
- Instalação e configuração do framework `vitest` no backend (`vitest.config.mts` e scripts `npm test` / `npm run test:watch`).
- Criação de suíte de testes unitários determinísticos em `backend/src/services/__tests__/`:
  - `route-integrity.spec.ts`: 8 testes cobrindo rotas vazias, peças sem setor de corte, categorias inválidas, integridade de plantas, exigência de Lectra e Ponte, presença condicional de Telas/Serigrafia e validação de peças vinculadas a subsetores de corte.
  - `puppeteer.service.spec.ts`: 4 testes cobrindo Singleton, auto-recuperação de processo desconectado, garantia de renderização e liberação garantida de recursos no bloco `finally`.

**Validação técnica executada:**
- `npm test` executado no backend com 12 testes aprovados em 468ms (0 falhas).
- `npm run build` no backend compilado com TypeScript 100% livre de erros.
- `npm run build` no frontend compilado com Vue 3/TypeScript 100% livre de erros.
- `git diff --check` sem pendências.

### TASK-037 — Desacoplamento de Fat Controllers (TicketService e LoteService)
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 2.2 do relatório de melhorias: extração das regras transacionais de ordens e resolução de tickets de dentro de `lotes.controller.ts` para Services de aplicação especializados.

**Escopo implementado:**
- Criação de `backend/src/services/ticket.service.ts`:
  - `obterTicketsOrdem`: Validação de autorização multi-planta, reconciliação idempotente de tickets a partir da rota congelada (`garantirTicketsSetorDaOrdem`) e serialização ordenada do DTO de resposta.
  - `obterTicketPorCodigo`: Resolução e validação de código de barras físico/bipado, consistência de Caixa Teste e retorno de metadados da ordem.
  - Classe de erro especializada `TicketServiceError` com status HTTP e códigos de erro tipados.
- Criação de `backend/src/services/lote.service.ts`:
  - `criarOrdemPcp`: Orquestração transacional de lock de concorrência (`lockModelConfiguration`), validação de unicidade 1:1 Modelo-Ordem, verificação de planta, gravação de data de corte e persistência da ordem em estado inicial.
  - `salvarConfiguracaoPecasModelagem`: Validação de estado `AGUARDANDO_MODELAGEM`, lock e persistência atômica das peças técnicas vinculadas e decisão de Caixa Teste via `saveModelPieces`.
  - `finalizarConfiguracaoModelagem`: Validação estrita de integridade de rota congelada (`validatePersistedModelRoute`), congelamento do snapshot com versionamento e SLAs por setor, transição de estado para `AGUARDANDO_MATERIAL`, liberação de produção e emissão idempotente de tickets.
  - Classe de erro especializada `LoteServiceError`.
- Refatoração de `backend/src/controllers/lotes.controller.ts`:
  - Delegação de `criarOrdemPcp`, `salvarConfiguracaoPecasModelagem`, `finalizarConfiguracaoModelagem`, `getTicketsSetor` e `getTicketSetorPorCodigo` para os novos services.
  - Remoção de queries manuais e blocos de transação aninhados do controller.
  - Limpeza de imports não utilizados (`randomUUID`, `Modelo`, `Planta`, `TicketSetor`, `ModelPieceInput`, `saveModelPieces`).
- Criação de suíte de testes unitários para `TicketService` em `backend/src/services/__tests__/ticket.service.spec.ts` (8 testes):
  - Rejeição de UUIDs malformados, validação de restrição de planta, 404 para ordens ausentes, reconciliação ordenada de tickets, validação de códigos vazios, 404 para tickets inexistentes, 409 para Caixa Teste inativa e retorno estruturado de DTO.

**Validação técnica executada:**
- `npm run build` no backend concluído com 0 erros de TypeScript.
- `npm run build` no frontend concluído com 0 erros.
- `git diff --check` aprovado sem pendências.

### TASK-038 — Desacoplamento de admin.controller em AdminRbacService e MarcaService
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 2.2 do relatório de melhorias: desacoplamento de segurança, permissões RBAC e regras de marcas para Services especializados, eliminando acoplamento do maior controller da aplicação (de 1.115 para ~770 linhas).

**Escopo implementado:**
- Criação de `backend/src/services/admin-rbac.service.ts`:
  - `listarPerfis`: Filtragem sensível com ocultação de perfil `ADMIN_AUTOMACAO` para atores não autorizados.
  - `criarPerfil`: Validação de duplicidade case-insensitive e bloqueio de nomes reservados do sistema (`ADMIN`, `ADMIN_AUTOMACAO`) com emissão de auditoria (`RBAC_PERFIL_CRIADO`).
  - `atualizarPerfil`: Proteção intransponível contra renomeação ou inativação de perfis de sistema (`ADMIN`, `VISUALIZADOR`, `ADMIN_AUTOMACAO`), bloqueio de inativação de perfis com usuários associados (`PERFIL_HAS_USERS`) e registro no `AuditLog`.
  - `atualizarPermissoes`: Validação de dependências de tela (edição requer visualização e remoção de visualização revoga edição), validação em lote (1 a 500 itens), trava de perfil de automação e diff atômico persistido em `AuditLog`.
  - `atualizarPerfilUsuario`: Validação de privilégios de concessão/revogação de acesso à Matriz de Acessos, trava de permissão para provisionar `ADMIN_AUTOMACAO` e registro auditado.
  - `atualizarPermissaoPausaSla`: Bloqueio estrito de acesso apenas a atores de automação e proteção permanente da conta `ADMIN_AUTOMACAO`.
  - Classe de erro `AdminRbacError` com status HTTP e códigos semânticos.
- Criação de `backend/src/services/marca.service.ts`:
  - Normalização de espaços e caracteres em português.
  - Comparação estrita case-insensitive.
  - `listarMarcas` (ativas ou todas), `criarMarca` e `atualizarMarca` com validação de unicidade.
  - Classe de erro `MarcaServiceError`.
- Refatoração de `backend/src/controllers/admin.controller.ts`:
  - Delegação completa dos fluxos de perfis, permissões, usuários e marcas aos novos services.
  - Remoção de queries manuais e do helper procedural `auditarRbac` do controller.
- Suíte de testes unitários criada no Vitest:
  - `admin-rbac.service.spec.ts` (8 testes): Validação de ocultação de perfil, bloqueio de nomes reservados, duplicidade, proteção de perfis de sistema, bloqueio de desativação com usuários, trava de permissão e proteção da conta de automação.
  - `marca.service.spec.ts` (6 testes): Normalização de espaços, comparação case-insensitive, duplicidade no cadastro e na atualização.

**Validação técnica executada:**
- `npm run build` no backend concluído com 0 erros de TypeScript.
- `npm run build` no frontend concluído com 0 erros.
- `git diff --check` aprovado sem pendências.

### TASK-039 — Observabilidade, Logs Estruturados (Pino) e Correlation ID (X-Request-ID)
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 2.3 do relatório de melhorias: eliminação de saídas síncronas/desestruturadas de console, implantação de Correlation ID em todas as requisições HTTP e logging JSON assíncrono de alta performance.

**Escopo implementado:**
- Criação de `backend/src/config/logger.ts`:
  - Configuração do logger `pino` com suporte a níveis de log (`debug`, `info`, `warn`, `error`, `fatal`).
  - Redaction automático de campos sensíveis (`authorization`, `cookie`, `password`, `token`, `refreshToken`, `senha`).
  - Pretty-printing colorido e legível para ambiente de desenvolvimento (`pino-pretty`) e JSON puro com timestamp ISO para produção.
- Criação de `backend/src/middlewares/requestLogger.ts`:
  - Captura ou geração automática de UUID para o correlation ID `X-Request-ID`.
  - Injeção de `req.requestId` no contexto da requisição Express.
  - Exposição do cabeçalho `X-Request-ID` em todas as respostas HTTP para auditoria e rastreamento pelo frontend.
  - Cálculo de latência de execução com precisão de nanossegundos (`process.hrtime.bigint`) e emissão estruturada de logs (`requestId`, `method`, `url`, `statusCode`, `durationMs`, `ip`, `userId`).
  - Categorização automática por código de resposta (2xx/3xx -> INFO, 4xx -> WARN, 5xx -> ERROR).
- Integração em `backend/src/server.ts`:
  - Inserção do middleware `requestLogger` como Camada 0 da pilha HTTP.
  - Substituição de logs textuais de inicialização e tratamento de falhas críticas com `logger.info` e `logger.fatal`.
- Integração em `backend/src/middlewares/errorHandler.ts`:
  - Substituição de `console.error` por `logger.error` estruturado contendo o correlation ID da requisição falha.
- Suíte de testes unitários criada no Vitest:
  - `backend/src/middlewares/__tests__/requestLogger.spec.ts` (5 testes): Geração de UUID aleatório, propagação de correlation ID vindo do cliente, log de sucesso com latência, log de alerta para 4xx e log de erro para 5xx.

**Validação técnica executada:**
- `npm test` executado com 39/39 testes unitários aprovados em 702ms.
- `npm run build` no backend concluído com 0 erros de TypeScript.
- `npm run build` no frontend concluído com 0 erros.
- `git diff --check` aprovado sem pendências.

---

### Registro de Integração — Pull Request #16
- **Pull Request**: [#16 — feat: seeding operacional, otimizações de banco, desacoplamento em services, vitest e observabilidade (TASK-034 a TASK-039)](https://github.com/hellennverenaa/erp-modelagem/pull/16)
- **Branch Origem**: `feature/seeding-dados-genericos`
- **Branch Destino**: `main`
- **Escopo Integrado**: TASK-034 (População de dados genéricos/operacionais), TASK-035 (Índices e performance de banco), TASK-036 (Puppeteer Singleton e Vitest), TASK-037 (Desacoplamento de lotes/tickets), TASK-038 (Desacoplamento de admin/RBAC e marcas) e TASK-039 (Observabilidade e logs estruturados Pino).

---

### TASK-040 — Modularização e Fatiamento da God View GestaoOrdensView.vue
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 3.1 do relatório de melhorias: desmantelamento da "God View" monolítica (`GestaoOrdensView.vue`), que possuía 2.892 linhas de código, fatiando modais e drawers pesados em componentes Vue 3 desacoplados e tipados.

**Escopo implementado:**
- Criação do diretório de componentes `frontend/src/components/ordens/` e interfaces TypeScript em `types.ts`.
- Extração de `OrderCreateModal.vue`:
  - Formulário completo de criação de ordem de teste com regras de validação (modelo, planta, prioridade PCP e previsão de corte).
  - Isolamento de erros específicos (ex.: duplicidade na regra 1:1 `MODELO_TESTE_DUPLICADO`).
- Extração de `OrderPrintModal.vue`:
  - Modal de seleção e impressão de tickets por setor e por fluxo (Lote Principal, Caixa Teste e Corte) e impressão agrupada em gabarito A4.
  - Carregamento assíncrono dos tickets por ordem via `/lotes/:id/tickets-setor`.
- Extração de `OrderHistoryModal.vue`:
  - Modal de escolha rápida (Timeline vs Rastreamento Detalhado) e drawer lateral retrátil de Timeline de Rastreamento com histórico, tempos de permanência em minutos/horas, status dots e crachás de operadores.
- Extração de `OrderMaintenanceModal.vue`:
  - Abas de SLA por setor (com conversão bidirecional minutos/horas/dias), remanejamento de máquinas técnicas para corte automático e histórico auditado com diff de alterações.
- Refatoração de `frontend/src/views/GestaoOrdensView.vue`:
  - Redução massiva de **2.892 linhas** para **932 linhas** (-68% de tamanho de arquivo).
  - Eliminação de centenas de linhas de CSS de modal e drawer duplicados do escopo da view.
  - Orquestração limpa e reativa baseada em eventos (`v-model`, `@saved`, `@created`, `@error`, `@success`).

**Validação técnica executada:**
- `npm run build` no frontend (Vite + vue-tsc) compilado com 0 erros (tempo: 2.25s).
- `npm test` no backend com 39/39 testes unitários aprovados em 775ms.
- `npm run build` no backend compilado com 0 erros.
- `git diff --check` aprovado sem pendências.

---

### TASK-041 — Paginação e Busca Server-Side com Otimização Trigram nos Grids Frontend
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 3.2 do relatório de melhorias: eliminação de carregamento de listas completas em memória no frontend, conectando os grids de Catálogo de Peças e Gestão de Ordens aos endpoints de paginação e busca indexada por Trigram (GIN) criados no backend.

**Escopo implementado:**
- Atualização de `frontend/src/views/CatalogoPecasView.vue`:
  - Integração aos parâmetros `page`, `limit` e `q` da rota `GET /catalogo-pecas`.
  - Busca server-side com debounce de 300ms e botão rápido de limpeza da consulta.
  - Rodapé de paginação com seletor de tamanho de lote (25, 50, 100), navegação entre páginas (`Anterior` / `Próxima`) e indicador dinâmico de intervalo exibido e total de peças.
  - Empty state contextualizado para buscas sem resultados vs catálogo vazio.
- Atualização de `frontend/src/views/GestaoOrdensView.vue`:
  - Integração aos parâmetros `page`, `limit` e `q` da rota `GET /lotes`, consumindo a resposta paginada e o cabeçalho `X-Total-Count`.
  - Busca debounced (300ms) por código de barras, nome ou referência do modelo com índice server-side.
  - Rodapé com paginação server-side, seletor de limite (15, 25, 50, 100) e controle de estado reativo.
  - Sincronização do KPI strip com a contagem total de ordens cadastradas no banco de dados.
- Estilização consistente:
  - Adicionados estilos utilitários `.table-footer-pagination`, `.page-size-selector`, `.pagination-controls`, `.pagination-btn` e `.btn-clear-search` preservando o design system clean industrial do projeto.

**Validação técnica executada:**
- `npm run build` no frontend (Vite + vue-tsc) compilado com 0 erros (tempo: 2.20s).
- `npm test` no backend com 39/39 testes unitários aprovados em 788ms.
- `npm run build` no backend compilado com 0 erros.
- `git diff --check` aprovado sem pendências.

---

### TASK-042 — Store Reativa de Configurações, Cache com TTL e Deduplicação In-Flight
**Estado: implementada nesta branch; validação técnica concluída com sucesso.** Resolução dos gargalos identificados no Ponto 3.3 do relatório de melhorias: eliminação de requisições HTTP redundantes para metadados e configurações operacionais (plantas, modelos, marcas, setores e máquinas de corte), implementando gerenciamento de cache reativo com TTL e compartilhamento de requisições concorrentes.

**Escopo implementado:**
- Criação de `frontend/src/api/config.store.ts`:
  - Cache reativo em memória com TTL configurável (padrão de 5 minutos) para metadados operacionais (`plantas`, `marcas`, `modelos`, `catalogoModelos`, `setores`, `maquinasCorte`).
  - Deduplicação de requisições em voo (In-flight request pooling): múltiplos componentes que montam simultaneamente compartilham a mesma Promise HTTP sem emitir requisições duplicadas à API.
  - Invalidação atômica e granular (`invalidateMarcas`, `invalidateModelos`, `invalidatePlantas`, `invalidateSetores`, `invalidateAll`).
  - Limpeza automática e isolamento de cache ao encerrar sessão (`erp:auth-session-ended`).
  - Funções de resolução rápida com fallback seguro (`getModeloNome`, `getModeloReferencia`, `getPlantaNome`, `getMarcaNome`).
- Adoção nos componentes e views do frontend:
  - `GestaoOrdensView.vue`: Consumo centralizado de modelos, catálogo e plantas com getters cacheados.
  - `GestaoModelosView.vue`: Consumo de catálogo de modelos, marcas e opções de corte via `configStore`, com invalidação automática ao salvar modelos e marcas.
  - `WizardCriacaoTesteView.vue`: Consumo de marcas, plantas e modelos disponíveis via `configStore`, com invalidação atômica na criação de rascunhos e ordens.
  - `RouteBuilder.vue`: Carregamento compartilhado de setores operacionais e plantas ativas.
  - `BrandManagerModal.vue`: Disparo de `invalidateMarcas()` em operações de cadastro, alteração de status e renomeação.

**Validação técnica executada:**
- `npm run build` no frontend (Vite + vue-tsc) compilado com 0 erros (tempo: 2.67s).
- `npm test` no backend com 39/39 testes unitários aprovados em 755ms.
- `npm run build` no backend compilado com 0 erros.
- `git diff --check` aprovado sem pendências.
