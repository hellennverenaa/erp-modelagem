# Plano: marcas e peças do catálogo

## Contexto

A aplicação está configurada para o PostgreSQL em `localhost:5432`, banco `postgres`, schema `erp_modelagem`. Na última consulta somente leitura, `marcas`, `catalogo_pecas`, `modelos` e `pecas` estavam vazias nesse schema. A usuária informa que esses dados já existiam; essa divergência precisa ser investigada antes de qualquer importação ou carga para evitar duplicar, sobrescrever ou mascarar dados.

**Limite de escopo:** não consultar nem alterar outros schemas. Não executar o seed geral, pois ele inclui marcas e modelos de exemplo além dos catálogos.

## Etapas

### 1. Gerenciar marcas pela interface — OK

- Adicionada uma interface para listar, cadastrar, renomear e ativar/desativar marcas, acessível nos dois formulários de criação de modelo.
- Criadas rotas administrativas que persistem pela conexão do backend configurada para `erp_modelagem`.
- Operações de escrita restritas a administradores; nomes vazios e duplicados (ignorando caixa e espaços repetidos) são recusados.
- O dropdown é atualizado após o cadastro ou a desativação; a nova marca fica selecionada no formulário aberto.
- A interface mostra carregamento, erro e lista vazia. Desativar preserva as referências históricas.
- Compilação do backend (`npm run build`) e do frontend (`npm run build`) concluída com sucesso.
- Nenhuma migração, seed ou gravação no banco foi executada durante a etapa 1.

**Critério de aceite:** cadastrar uma marca pela interface; vê-la no dropdown de novo modelo após salvar; desativá-la sem excluir registros históricos.

### 2. Reconciliar os dados que já existiam — em andamento

- Comparar a configuração de conexão usada pela aplicação com a instância, banco e schema onde os dados eram vistos anteriormente.
- Inspecionar somente objetos de `erp_modelagem` e histórico/backups autorizados; não executar migrações destrutivas, seeds ou restaurações nesta etapa.
- Registrar a causa encontrada antes de decidir se será necessário recuperar dados.

### 3. Carregar o catálogo de peças do `docs/Dados.csv` — em andamento

- Criar um fluxo de importação dedicado ao catálogo de peças, separado do seed geral.
- Validar e pré-visualizar o arquivo; importar de forma idempotente e transacional para `erp_modelagem.catalogo_pecas`.
- Reportar inserções, atualizações e linhas rejeitadas. Usar `docs/Dados.csv` como fonte canônica e não atribuir peças automaticamente a todos os modelos.

**Referência:** o arquivo contém 969 registros de dados; `backend/Dados.csv` é uma cópia idêntica encontrada durante a análise.

### 4. Validar o fluxo de ponta a ponta — pendente

- Confirmar que marcas ativas e peças importadas aparecem no frontend.
- Criar um modelo de teste e verificar que as peças selecionadas são vinculadas ao modelo correto em `erp_modelagem`.
- Validar consultas da API e mensagens de erro sem gravar em outros schemas.

## Histórico de validação

- A usuária enviou as etapas seguintes conforme o fluxo combinado; a etapa 1 foi marcada como **OK** e será commitada separadamente antes de começar as etapas 2 e 3.
