# Plano: marcas e peças do catálogo

## Contexto

A aplicação está configurada para o PostgreSQL em `localhost:5432`, banco `postgres`, schema `erp_modelagem`. Antes desta rodada, `catalogo_pecas` estava vazio nesse schema. A usuária informa que os dados já existiam; a causa da ausência atual foi registrada antes da importação. A investigação histórica não encontrou material suficiente para explicar quando ou como os registros anteriores deixaram de estar disponíveis.

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

### 2. Reconciliar os dados que já existiam — aguardando validação

- A configuração carregada pelo backend aponta para `127.0.0.1:5432`, banco `postgres`, schema `erp_modelagem` (equivalente ao `localhost:5432` informado); não foi encontrada outra URL de conexão ativa.
- As consultas foram limitadas a objetos de `erp_modelagem`. Antes da importação, `erp_modelagem.catalogo_pecas` estava vazio; o backend inicia sem executar seed, e o seed geral é um comando manual que também inclui dados de exemplo. Portanto, a aplicação não tinha peças para retornar à tela/API.
- A busca no histórico do repositório e nos arquivos locais do projeto não encontrou backup nem operação registrada que explique a remoção ou localização dos dados anteriormente vistos. Não consultamos outros schemas nem executamos restauração, seed geral ou migração destrutiva.
- **Causa comprovada da ausência atual no frontend:** tabela de catálogo vazia na conexão/schema usados pela aplicação, combinada com ausência de carga automática. **Origem histórica da divergência:** não comprovada com os artefatos disponíveis; não há base para afirmar que os registros foram apagados ou que estavam em outra instância/schema.

### 3. Carregar o catálogo de peças do `docs/Dados.csv` — aguardando validação

- Criado `backend/src/database/importCatalogoPecas.ts`, executável por `npm run import:catalogo-pecas`. Sem argumento, valida e pré-visualiza; `--apply` grava dentro de transação, com bloqueio da tabela alvo, sem chamar o seed geral.
- A fonte lida é exclusivamente `docs/Dados.csv`; o destino é explicitamente `erp_modelagem.catalogo_pecas`. Registros existentes são reconciliados pelo número, atualizados somente se os campos da fonte mudarem e mantêm o estado `ativo`; linhas inválidas cancelam a gravação inteira. Nenhuma peça é vinculada automaticamente a modelos.
- Prévia: 969 linhas válidas, 969 inserções planejadas, 0 atualizações e 0 rejeições. Importação: **969 inseridas, 0 atualizadas e 0 rejeitadas**. Segunda prévia: **0 inserções, 0 atualizações, 969 sem alteração e 0 rejeições**.
- `npm run build` do backend concluído com sucesso. A validação da exibição no frontend permanece na etapa 4.

**Referência:** o arquivo contém 969 registros de dados; `backend/Dados.csv` é uma cópia idêntica encontrada durante a análise.

### 4. Validar o fluxo de ponta a ponta — pendente

- Confirmar que marcas ativas e peças importadas aparecem no frontend.
- Criar um modelo de teste e verificar que as peças selecionadas são vinculadas ao modelo correto em `erp_modelagem`.
- Validar consultas da API e mensagens de erro sem gravar em outros schemas.

## Histórico de validação

- A etapa 1 foi validada/avançada pela usuária e commitada separadamente como `e1df468` (`feat: gerenciar marcas pela interface`).
- As etapas 2 e 3 foram executadas sem consultar ou modificar outros schemas e aguardam validação da usuária; ainda não foram commitadas.
