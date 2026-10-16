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
