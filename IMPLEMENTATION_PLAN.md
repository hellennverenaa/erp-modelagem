# Plano de implementação — ERP Modelagem

**Atualizado em 21/10/2026.** Esta lista mantém trabalho que ainda requer decisão, implementação, integração ou validação. Tarefas já integradas e validadas foram removidas. Quando o código está na `main`, mas falta validação funcional ou de banco, a pendência aparece explicitamente.

## Regras de negócio pendentes

### Bordado, Apoio e bifurcação (TASK-002)
**Estado: decisão pendente.** Definir com o processo se Bordado e Apoio são substitutos, etapas paralelas ou subprocessos; esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem. A regra deve vir da rota, sem configuração duplicada na ordem.

## Implementação e validações pendentes

### Tickets por setor e possível transferência parcial

**Tickets — integrado; validação física pendente.** A impressão dos grupos Lote Principal, Caixa Teste (quando habilitada) e Corte já está disponível. A impressão combinada foi conferida em um teste de duas páginas; os builds do backend e frontend e o carregamento do DataSource passaram, e a usuária confirmou que o `npm run dev` iniciou após as migrations. Ainda falta ler fisicamente os códigos, conferir o PDF combinado com os três grupos e validar o alinhamento do gabarito A4 na folha.

**Transferências parciais — decisão da gerente pendente.** Não iniciar análise de solução nem implementação até a decisão. Se aprovada, revisar os requisitos anteriormente discutidos: saída parcial sem controle de quantidade, motivo obrigatório, setor de origem permanecendo aberto e recebimento por crachá no setor seguinte.

### Indicador de Lead Time por modelo com tênis (TASK-032)
**Estado: integrado via PR #14; validações visuais e dos dados pendentes.** Confirmar com dados reais se o Lote Principal mais recente por modelo, ordenado pelos maiores Lead Times e limitado a dez resultados, representa a comparação desejada. Validar modelos sem identificador, marca ou Lead Time positivo; apresentação, seleção e detalhes; teclado e rolagem horizontal em telas estreitas.

### Execução da rota da ordem no backend (TASK-014)
**Estado: implementação pendente.** Usar o snapshot da ordem para validar etapas permitidas, sequência e condições; associar cada bipagem à etapa da ordem e manter compatibilidade com ordens antigas.

### Bipagem orientada à rota da ordem (TASK-015)
**Estado: integrada via PR #18; validação funcional pendente.** No ambiente operacional, testar operador comum e administrador; leitura de ticket seguida de crachá; entrada e saída; ticket fora da rota; crachá não cadastrado; código antigo da ordem com setor de sessão pertencente à rota; e ordem sem snapshot. O build do backend e frontend e os testes automatizados já passaram. Nenhuma migration foi criada para esta tarefa.

### TV de rastreamento usando o snapshot da ordem (TASK-016)
**Estado: implementação pendente.** Exibir snapshot e progresso real da ordem em vez da rota atual do modelo, preservando o histórico quando o modelo for editado.

### Dados reais da Torre de Controle (TASK-017)
**Estado: implementação disponível na branch `feature/dados-reais-torre-controle`; validação com dados de produção pendente.** A análise confirmou que `GET /api/dashboard/kpis` consulta entidades reais, sem fixtures, mas ignorava a planta do usuário, não recebia filtros, agrupava setores somente pelo nome, preenchia Lead Time sem bipagens com um tipo de lote presumido, devolvia `totalRastreamentos` igual a `totalInspecoes`, representava duração ausente como zero e não correspondia ao contrato Swagger. O frontend também registrava o payload integral no console e não atualizava os KPIs após inspeções/retrabalhos.

Escopo aprovado: aplicar o escopo de planta conforme `ACESSAR_TODAS_PLANTAS`; oferecer filtros de planta, setor e período com consulta sem filtros preservando o comportamento geral; manter identidade do setor nas agregações; não inferir tipo de lote para ordem ainda sem bipagem; representar duração indisponível sem convertê-la em zero; corrigir o contrato documentado, remover o log de payload e atualizar os KPIs após gravações relevantes. Manter as regras atuais de status do WIP e de aprovação por concessão até confirmação de negócio. A validação disponível é no banco local de testes; validação com dados de produção depende de uma fonte de leitura ou extrato aprovado, ainda não fornecido.

O FPY continua calculado por registro de inspeção `SAIDA_SETOR` (não por peça), e `APROVADO_CONCESSAO` continua no numerador. O WIP mantém a regra existente de incluir todos os status exceto `REPROVADO`. Não houve confirmação para alterar essas definições. O Lead Time continua baseado na soma dos tempos das bipagens existentes; ordens sem bipagem permanecem no total de WIP, mas não são classificadas artificialmente como lote principal ou caixa teste.

### Filtros compactos da Torre de Controle (TASK-046)
**Estado: implementação disponível na branch `feature/dados-reais-torre-controle`; validação funcional autenticada pendente.** Depende dos filtros e do escopo autorizativo da TASK-017. O painel foi compactado e recolhido inicialmente, o bloco informativo de planta foi removido para usuários sem acesso global, e o seletor agora apresenta estados de carregamento, erro com nova tentativa e ausência de setores. O banco local de testes contém 19 setores ativos na única planta. A captura da usuária mostrou `404` em `GET /api/erp-modelagem/dashboard/filters`. A configuração atual do Vite encaminha `/api` ao gateway, e o backend publica as rotas em `/api` e `/`. Requisições locais sem token para Vite, gateway e backend responderam `401`, comportamento esperado da camada de autenticação; isso não confirma a resposta do handler autenticado. Como o backend usa `ts-node` sem reinício automático, um processo antigo é a hipótese mais provável para o `404`, ainda sem confirmação autenticada. Reiniciar o backend iniciado deste checkout e conferir a chamada no navegador. Não houve alteração de backend ou de banco.

### Auditoria de Corte, Apoio e dados simulados (TASK-022)
**Estado: análise pendente.** Identificar como telas e endpoints de Corte e Apoio são usados, localizar respostas fictícias e dados hardcoded, e registrar mudanças necessárias sem ampliar a auditoria para uma refatoração geral.

### Jornada integrada (TASK-023)
**Estado: validação pendente.** Validar o fluxo completo de modelo, peças, rota, ordem, bipagem e Torre, incluindo cadastros individuais, permissões, anexos, horários e integridade dos dados.

## Verificação de migrations por ambiente

As migrations abaixo foram confirmadas somente no PostgreSQL local. O estado em outros ambientes não foi consultado; verificar cada ambiente antes de implantação:

- TASK-026: 1791980400000, 1791980500000, 1791980600000 e 1791980700000.
- TASK-027: 1791980800000.
- TASK-028: 1791981000000.
- TASK-030: 1791981100000 e 1791981200000.
- TASK-045: 1792161500000, aplicada no banco local de testes (`postgres`, schema `erp_modelagem`). O estado em outros ambientes não foi consultado; confirmar banco e schema antes de aplicar.

### Renovação da sessão DASS (TASK-031)
**Estado: integrada via PR #15; validação funcional pendente.** Confirmar no navegador e em HTTPS o comportamento dos cookies; testar renovação após expiração, retry HTTP único, reconexão do WebSocket após interrupção de rede e logout. Não houve teste de integração com o DASS.

### Preservar sessão em falhas transitórias de autenticação (TASK-033)
**Estado: integrado na `main` (commit `778d743`); validação funcional pendente.** Verificar timeout, falha de rede e resposta `5xx` com perfil em cache e sem perfil em cache; tentativa de recuperação; rejeição definitiva do refresh token; e reconexão da TV. Confirmar os códigos de resposta da sessão real antes de atribuir causas a logout observado.

### Corrigir resolução de `pg_trgm` na migration de índices (TASK-043)
**Estado: integrada via PR #18; validação de banco pendente.** O diagnóstico anterior confirmou erro PostgreSQL `42704` ao resolver `gin_trgm_ops`, que impedia a migration e, por encadeamento do comando `dev`, a inicialização da API. A migration `1792161400000-OtimizacaoIndicesEBuscaTrigram` foi ajustada para criar a extensão no schema configurado e qualificar a classe de operadores pelo schema real da extensão. Próximo passo: validar em banco de desenvolvimento o registro da migration, a extensão `pg_trgm`, a classe de operadores e os índices no schema `erp_modelagem`.

### Verificar aderência do índice trigram à busca do catálogo (TASK-044)
**Estado: análise pendente; depende da validação de TASK-043.** A busca de `GET /catalogo-pecas` usa `LOWER(p.nome)`, `LOWER(p.numero)` e `LOWER(p.codigo_original)`, enquanto a migration declara índice trigram sobre `nome` sem `LOWER` e não declara índices trigram nos outros dois campos. Usar `EXPLAIN` para confirmar se a busca server-side usa o índice esperado e registrar eventual ajuste em escopo próprio.

## Registro da revisão anterior — PR #21

- Escopo desta entrega: remover da lista ativa os trabalhos concluídos e manter decisões, implementações, integrações e validações ainda pendentes.
- Nenhum código de aplicação, configuração ou migration foi alterado; nenhuma migration foi criada ou aplicada nesta revisão.
- `git diff --check` aprovado. Builds e testes da aplicação não foram executados por se tratar de uma alteração documental.
- Próximo passo: seguir as pendências acima, sem tratar validação manual ou de banco como já executada.

## Registro desta revisão

- Escopo: verificar a aplicação da migration da TASK-045 no banco de testes e corrigir o status desatualizado no plano.
- A conexão configurada identificou o banco `postgres`, schema atual `erp_modelagem` e `search_path` `erp_modelagem,public`; a usuária já havia confirmado este alvo como banco de testes.
- A tabela `erp_modelagem.migrations` contém `RemoveSetoresCorteRecebimentoSeparacao1792161500000`. A consulta somente de leitura encontrou zero opções correspondentes em `config_opcoes` e zero setores correspondentes em `setores`.
- A verificação anterior à revisão registrou zero referências de rota após a limpeza; referências de rota não foram reconsultadas nesta revisão.
- Nenhuma migration foi executada e nenhum arquivo de aplicação foi alterado. O registro em `TASK-045` foi removido da lista ativa; a migration permanece registrada acima como aplicada somente no ambiente local de testes, com demais ambientes pendentes de verificação.
- `git diff --check` aprovado. Builds e testes não foram executados por se tratar de uma alteração documental.
- Próximo passo: antes de aplicar a migration em outro ambiente, confirmar o banco e o schema de destino; seguir as demais pendências do plano.

## Registro da implementação — TASK-017

- Escopo: adicionar escopo por planta, filtros de planta/setor/período e corrigir a leitura/agregação dos indicadores da Torre de Controle.
- `GET /api/dashboard/kpis` aplica `ACESSAR_TODAS_PLANTAS` ou a planta do usuário, aceita filtros validados, usa o snapshot de rota quando disponível para o filtro de setor e mantém os dados agrupados por identidade de setor e planta. `GET /api/dashboard/filters` fornece opções dentro do mesmo escopo.
- Inspeções continuam medidas por registro de inspeção; reworks sem duração completa são apresentados como indisponíveis; ordens sem bipagens continuam no WIP, mas não entram nos Lead Times por lote. Status de WIP e aprovação por concessão preservam as fórmulas existentes.
- O frontend não registra mais o payload integral e recebe atualização via WebSocket após salvar inspeções/retrabalhos. A documentação Swagger foi alinhada ao contrato retornado.
- Sem migrations e sem alteração do banco. Não houve consulta ao banco de produção. O banco local de testes analisado tem poucos registros de qualidade e nenhum volume suficiente de ocorrências/retrabalhos para validar esses indicadores de produção.
- Validações técnicas: builds backend e frontend; `npm test` (8 arquivos, 51 testes); `git diff --check`. A validação funcional em navegador e a conferência dos resultados com registros de produção permanecem pendentes.
- Próximo passo: disponibilizar extrato anonimizado ou conexão somente leitura aprovada para validar os indicadores de produção; revisar a definição de status do WIP e tratamento de concessão se o negócio desejar alterar as regras atuais.

## Registro da implementação — TASK-046

- Escopo: reduzir o espaço ocupado pelos filtros da Torre de Controle e esclarecer por que o seletor de setor não apresenta opções.
- Em `frontend/src/views/DashboardGerencialView.vue`, os filtros passaram a iniciar recolhidos com um resumo das seleções ativas. A área expandida usa espaçamento menor e não exibe o bloco de planta não interativo para usuários restritos. O seletor apresenta carregamento, falha com ação para tentar novamente e lista vazia no escopo autorizado.
- Consulta somente leitura ao banco de testes: banco `postgres`, schema `erp_modelagem`, uma planta e 19 setores ativos. O código atual de `GET /dashboard/filters` consulta setores vinculados às plantas autorizadas; a resposta HTTP da sessão da usuária não pôde ser inspecionada porque não havia navegador disponível nesta sessão. Portanto, falha do endpoint/processo antigo permanece hipótese, não confirmação.
- O script `backend/package.json` executa `ts-node src/server.ts` sem watcher; um processo iniciado antes da atualização não carrega alterações do backend automaticamente. Reiniciar a API e conferir a chamada de rede é necessário para validar a causa em execução.
- Sem alteração no backend, sem migration e sem escrita no banco. Validações: `frontend: npm run build` aprovado; `git diff --check` aprovado. Builds do backend e testes automatizados não foram executados porque não houve alteração de backend e o projeto não configura testes de frontend.
- Próximo passo: validar no navegador a resposta de `/api/dashboard/filters` e a lista de setores para usuário restrito e administrador, após reiniciar o backend; se a resposta continuar vazia ou falhar, investigar o status e payload retornados antes de alterar a API.

## Registro da análise do 404 — TASK-046

- A captura reportou `404 Not Found` para `http://localhost:5173/api/erp-modelagem/dashboard/filters`. O frontend usa esse prefixo; o Vite encaminha `/api` para `GATEWAY_URL` (padrão local `localhost:2399`), e o Express monta as rotas em `/api` e `/`.
- O código fonte da branch registra `/dashboard/filters` protegido por autenticação e permissão `TELA_TORRE_CONTROLE`. Consultas locais GET sem token ao Vite (`:5173`), gateway (`:2399`) e backend (`:3001`) retornaram `401`, não `404`. A autenticação executa no prefixo `/dashboard` antes do roteamento da ação; portanto, esse resultado só confirma que as requisições alcançam a camada protegida e não prova o retorno autenticado do handler.
- A ausência de reinício automático no script `backend: npm run dev` torna um processo iniciado antes da atualização a hipótese mais provável para a captura, mas a resposta da sessão autenticada ainda não foi verificada. Não alterei código neste diagnóstico.
- Próximo passo: reiniciar a API a partir deste checkout e conferir no navegador a resposta autenticada e o array `setores`; se persistir o `404`, confirmar qual `GATEWAY_URL` está carregado pelo Vite e qual instância/branch do backend atende a porta `3001`.
