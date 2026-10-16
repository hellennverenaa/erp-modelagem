# Plano de implementação — ERP Modelagem

## Regras de negócio pendentes

### Bordado, Apoio e bifurcação (TASK-002)
**Estado: em andamento.** Definir com o processo como Bordado e Apoio se relacionam na rota e na produção: substituição, paralelo ou subprocesso. Esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem. A regra deve vir da rota, sem configuração duplicada na ordem.

## Implementação pendente

### Tickets por setor e transferências parciais
**Regras confirmadas:** não controlar quantidade. Gerar um ticket identificável por setor da ordem, vinculado à rota congelada. Cada entrega é um evento associado ao ticket; o tipo de lote (Lote Principal/Caixa Teste) permanece discriminado no rastreamento. A saída parcial exige motivo e mantém o setor de origem aberto; a saída final encerra sua etapa. O próximo setor só inicia a contagem do tempo após uma pessoa ativa e autorizada confirmar o recebimento com o próprio crachá. Registrar quem recebeu, sem fixar previamente uma pessoa responsável.

**Fundação dos tickets — concluída e validada:** migration e entidade para tickets persistentes por ordem/setor; geração idempotente junto da ordem quando o snapshot da rota existe ou é congelado. O fluxo PCP cria os tickets ao finalizar a Modelagem. O fluxo do wizard grava o snapshot da rota antes de gerar os tickets.

**Gestão e impressão — implementadas nesta branch, aguardando validação:** a Gestão de Ordens reúne as ações de etiquetas da ordem em um modal e agrupa Timeline/Rastreamento detalhado em uma única ação de acompanhamento. Cada setor tem um ticket único; a tela envia todos os tickets em lote, sem ação de impressão individual por setor. Ao abrir o modal, a API completa de forma idempotente os tickets ausentes usando somente o snapshot congelado da ordem. O PDF usa o padrão físico existente: A4, 2 colunas × 5 linhas, células destacáveis de 90 × 53 mm e início do gabarito a 13 mm do topo; ordens com mais de 10 setores continuam em páginas adicionais. As etiquetas existentes de Lote Principal, Caixa Teste e Corte permanecem disponíveis no modal.

**Validação parcial informada:** a impressão pelo botão “Imprimir todos os setores” foi confirmada com os tickets distintos da ordem; a captura mostra duas páginas para a rota testada. Builds do backend e frontend passaram. A lista do modal foi ajustada para rolar dentro da janela e não oferece impressão individual por setor. Permanecem a conferência visual do modal após o ajuste e a verificação do alinhamento físico do gabarito a 13 mm.

**Ainda não implementado nesta etapa:** estado operacional e transferências parciais; esses comportamentos seguem para as etapas de saída e recebimento.

**Execução em etapas:**

- **Fundação dos tickets:** criar e persistir um ticket por setor da rota quando ela estiver definida, com código de barras único e criação idempotente. No fluxo PCP, isso ocorre ao finalizar a configuração da Modelagem; nos fluxos que já criam a ordem com rota, ocorre na criação. Usar o snapshot da ordem para preservar a rota original.
- **Gestão e impressão (implementadas nesta branch; validação pendente):** apresentar na Gestão de Ordens os tickets de todos os setores, com etapa, versão da rota e código de barras; recuperar idempotentemente registros ausentes do snapshot congelado; explicar quando a rota ainda não foi congelada; imprimir todos os tickets distintos juntos no gabarito físico A4 2×5, com início a 13 mm; limitar a altura do modal e rolar sua lista internamente; reunir as opções de impressão e acompanhamento para reduzir os botões por ordem; preservar as etiquetas existentes de Corte, Lote e Caixa Teste. Confirmar o backend/gateway em execução, os nomes e códigos dos setores no PDF e o alinhamento na folha física. O status operacional será exibido quando a etapa de transferências o definir.
- **Transferências:** registrar eventos de saída total/parcial por ticket; exigir motivo na parcial; manter a etapa de origem aberta nas parciais; registrar entrega pendente e confirmação pelo crachá do setor destino. A confirmação inicia o tempo do destino e identifica o recebedor. Cada transferência deve ser transacional e idempotente.
- **Bipagem e acompanhamento:** localizar por ticket, aplicar rota e gates de qualidade, exibir entregas e responsáveis, e alinhar a TV, SLAs e histórico. Preservar compatibilidade com ordens/tickets antigos.
- **Validação:** cobrir rotas simples e ramificadas, Lote Principal e Caixa Teste, múltiplas entregas parciais seguidas da final, recebimentos por pessoas diferentes, permissões, duplicidade, qualidade e ordens legadas.

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
