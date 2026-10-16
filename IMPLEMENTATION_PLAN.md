# Plano de implementação — ERP Modelagem

## Regras de negócio pendentes

### Bordado, Apoio e bifurcação (TASK-002)
**Estado: em andamento.** Definir com o processo como Bordado e Apoio se relacionam na rota e na produção: substituição, paralelo ou subprocesso. Esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem. A regra deve vir da rota, sem configuração duplicada na ordem.

## Implementação pendente

### Tickets por setor e transferências parciais
**Regras confirmadas:** não controlar quantidade. Gerar um ticket identificável por setor da ordem, vinculado à rota congelada. Cada entrega é um evento associado ao ticket; o tipo de lote (Lote Principal/Caixa Teste) permanece discriminado no rastreamento. A saída parcial exige motivo e mantém o setor de origem aberto; a saída final encerra sua etapa. O próximo setor só inicia a contagem do tempo após uma pessoa ativa e autorizada confirmar o recebimento com o próprio crachá. Registrar quem recebeu, sem fixar previamente uma pessoa responsável.

**Etapa atual — fundação implementada, aguardando validação:** migration e entidade para tickets persistentes por ordem/setor; geração idempotente junto da ordem quando o snapshot da rota existe ou é congelado. O fluxo PCP cria os tickets ao finalizar a Modelagem. O fluxo do wizard agora grava o snapshot da rota antes de gerar os tickets. Nenhuma tela de gestão/impressão ou transferência parcial foi incluída nesta etapa.

**Execução em etapas:**

- **Fundação dos tickets:** criar e persistir um ticket por setor da rota quando ela estiver definida, com código de barras único e criação idempotente. No fluxo PCP, isso ocorre ao finalizar a configuração da Modelagem; nos fluxos que já criam a ordem com rota, ocorre na criação. Usar o snapshot da ordem para preservar a rota original.
- **Gestão e impressão:** apresentar na Gestão de Ordens os tickets de todos os setores, com status e ações de impressão/reimpressão, preservando as etiquetas existentes de Corte, Lote e Caixa Teste durante a transição.
- **Transferências:** registrar eventos de saída total/parcial por ticket; exigir motivo na parcial; manter a etapa de origem aberta nas parciais; registrar entrega pendente e confirmação pelo crachá do setor destino. A confirmação inicia o tempo do destino e identifica o recebedor. Cada transferência deve ser transacional e idempotente.
- **Bipagem e acompanhamento:** localizar por ticket, aplicar rota e gates de qualidade, exibir entregas e responsáveis, e alinhar a TV, SLAs e histórico. Preservar compatibilidade com ordens/tickets antigos.
- **Validação:** cobrir rotas simples e ramificadas, Lote Principal e Caixa Teste, múltiplas entregas parciais seguidas da final, recebimentos por pessoas diferentes, permissões, duplicidade, qualidade e ordens legadas.

**Dependências:** preservar a rota congelada em todos os caminhos de criação e integrar a fundação com a gestão, a impressão, a Bipagem e a TV nas etapas seguintes. Ordens antigas sem snapshot permanecem sem rota/tickets inferidos.

### Indicador de Lead Time por modelo com tênis (TASK-032)
**Estado: pendente nesta branch.** A implementação visual já existe no commit `a93a780` da branch `feat/grafico-lead-time-por-modelo`, mas essa branch não está integrada à branch atual (`feat/ajuste-visual-tv-rastreamento`). Por isso a tela atual ainda exibe os lotes conectados por uma linha.

**Escopo do indicador:** comparar modelos, não representar uma sequência temporal. O protótipo usa colunas verticais, com um ícone genérico de tênis acima de cada coluna, valor em horas, modelo e marca; colore Nike em vermelho, Fila em azul e outras marcas em cinza. Permite selecionar um modelo e consultar os dados do lote associado. O endpoint também foi alterado no protótipo para usar o Lote Principal mais recente de cada modelo, ordenar pelo maior Lead Time e limitar a exibição a dez modelos.

**Execução em etapas:**

- **Revisão e integração:** revisar o commit existente e trazer somente as mudanças relacionadas ao indicador para a branch de trabalho, preservando os demais módulos e o comportamento atual dos outros KPIs.
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
