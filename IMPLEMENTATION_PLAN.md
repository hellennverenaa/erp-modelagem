# Plano de implementação — ERP Modelagem

**Atualizado em 20/10/2026.** Esta lista mantém trabalho que ainda requer decisão, implementação, integração ou validação. Tarefas já integradas e validadas foram removidas. Quando o código está na `main`, mas falta validação funcional ou de banco, a pendência aparece explicitamente.

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
**Estado: análise e implementação pendentes.** Revisar endpoints, filtros, setores, tempos e agregações para consumir dados reais de ordens, rotas, bipagens, qualidade e ocorrências; identificar mocks e validar indicadores com registros de produção.

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
