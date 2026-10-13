# Plano de implementação — ERP Modelagem

## Pontos de trabalho

### 01 — TASK-001: Diagnosticar a rota não encontrada
Investigar o caminho da rota entre gravação, leitura e criação da ordem, comparando o modelo e os IDs usados em cada chamada. Confirmar a causa com evidências da API e do banco; distinguir modelo sem rota de uma rota salva que não é recuperada.

### 02 — TASK-002: Definir as regras de Bordado, Apoio e bifurcação
Analisar como Bordado e Apoio são representados nas rotas, na produção, na bipagem e na Torre de Controle. Definir com o processo se Bordado substitui Apoio, funciona em paralelo ou é um subprocesso; esclarecer como Serigrafia determina a bifurcação e a Conferência Inicial, preservando Navalha e Almoxarifado de Modelagem e mostrando Telas somente quando houver Serigrafia. A regra deve ser derivada da rota, sem configuração duplicada na ordem.

### 03 — TASK-003: Definir os contratos de dados e API
Fechar o formato compartilhado entre frontend, backend e banco para peças, setores de corte, etapas e versões de rota, tempos, bifurcação, snapshots das ordens e datas. Registrar os contratos que os módulos consumidores usarão para evitar regras ou formatos diferentes entre telas.

### 04 — TASK-004: Corrigir a busca do catálogo de peças
Fazer as sugestões do catálogo aparecerem e atualizarem enquanto o usuário digita, sem perder o foco. Tratar carregamento, resultados vazios, erros, seleção, permissões e respostas de busca que chegam fora de ordem.

### 05 — TASK-005: Reorganizar a navegação e o layout
Ordenar a sidebar conforme o fluxo de uso da aplicação, remover a barra de breadcrumb superior e mover nome, perfil e logout para a parte inferior da sidebar. Preservar permissões e adaptar o layout aos modos recolhido e mobile.

### 06 — TASK-006: Validar o código do produto e retirar Temporada do cadastro ativo
Aplicar a regra de que o código do produto contém somente dígitos no frontend, backend e banco, preservando zeros à esquerda. Remover Temporada dos formulários e dos novos contratos sem apagar os valores históricos ou quebrar consumidores existentes.

### 07 — TASK-007: Vincular as peças do modelo aos setores de corte
Fazer cada peça do modelo preservar sua identidade de catálogo e seu setor de Corte Automático por identificadores, para que a rota use os dados selecionados sem depender de comparação de nomes.

#### 07A — Persistência e API das peças
Implementar no backend e no banco a associação entre a peça do modelo, a peça de catálogo e a opção de corte. As opções incluem Lectra, Atom, CN, Ponte, Laser e Couro; dados antigos devem continuar legíveis.

#### 07B — Seleção de peças nas telas
Atualizar o cadastro individual e o passo de peças do wizard para selecionar, salvar e exibir os identificadores definidos em 07A. Esta parte fica restrita às telas de peças; não implementa a persistência do backend.

### 08 — TASK-008: Persistir etapas versionadas da rota
Representar a rota como etapas identificáveis e versionadas. Cada etapa deve guardar seu setor, posição, tempo e configurações próprias, suportando setores repetidos, paralelismo e leitura das rotas já existentes.

### 09 — TASK-009: Corrigir a gravação e leitura da rota
Centralizar a gravação e consulta da rota para que a resposta de sucesso corresponda a dados confirmados no banco. Corrigir a causa de ROTA_NOT_FOUND encontrada na TASK-001 e garantir que o mesmo modelo e a mesma rota sejam usados no Construtor e na criação da ordem.

### 10 — TASK-010: Registrar um snapshot da rota na ordem
Ao criar uma ordem, guardar uma cópia da versão e das etapas da rota que ela recebeu, incluindo sequência, setores, tempos e condições. Alterações futuras na rota do modelo não devem mudar ordens existentes; ordens antigas precisam de uma leitura compatível.

### 11 — TASK-011: Tornar transacional a finalização do wizard no backend
Persistir modelo, peças, rota e ordem em uma única transação ao finalizar o wizard. Se qualquer etapa falhar, nenhuma parte do novo teste deve ficar gravada. Os cadastros individuais continuam usando seus próprios fluxos de gravação.

### 12 — TASK-012: Corrigir o Construtor e o preview da rota
Usar os setores de corte definidos nas peças para pré-configurar a rota. Manter identificador e estado próprios para cada etapa, para que editar o tempo ou outra configuração de um setor não altere os demais; incluir as regras de Serigrafia e Conferência Inicial definidas na TASK-002.

### 13 — TASK-013: Tornar o wizard reversível
Organizar “Iniciar Novo Teste” em quatro passos: modelo, peças, rota e ordem. Manter as informações como rascunho enquanto o usuário avança, volta, revisa e altera os passos; enviar para persistência somente ao finalizar.

### 14 — TASK-014: Fazer o backend operacional executar a rota da ordem
Obter o fluxo operacional a partir do snapshot da ordem e validar as etapas permitidas, sua sequência e suas condições. Associar cada bipagem à etapa correspondente da ordem e manter leitura compatível para ordens antigas.

### 15 — TASK-015: Adaptar a tela de bipagem à rota da ordem
Remover sequências fixas de setores da tela. Ao selecionar uma ordem, exibir somente os setores e processos da rota dela, com posição, estado e ações permitidas, atualizando a interface ao trocar de ordem.

### 16 — TASK-016: Adaptar a TV de rastreamento à rota da ordem
Exibir na TV o snapshot e o progresso real da ordem, em vez de consultar a rota atual do modelo. A edição posterior do modelo não deve alterar o histórico mostrado para a ordem.

### 17 — TASK-017: Conectar os dados e indicadores da Torre de Controle
Revisar endpoints, filtros, setores, tempos e agregações da Torre para consumir dados reais de ordens, rotas, bipagens, qualidade e ocorrências. Identificar mocks, atualizar eventos e conferir os indicadores com os registros de produção.

### 18 — TASK-018: Revisar a interface da Torre de Controle
Organizar hierarquia visual, tipografia, espaçamento, cards, tabelas, indicadores e cores da Torre. Exibir os dados do contrato definido para o backend com estados claros de carregamento, erro e ausência de resultados, em desktop e mobile.

### 19 — TASK-019: Padronizar datas no backend e no banco
Definir como instantes de criação e prazos são recebidos, persistidos e serializados, usando um formato inequívoco. Tratar valores históricos conforme sua interpretação atual; não aplicar offsets ou conversões em massa sem auditoria.

### 20 — TASK-020: Corrigir a apresentação e edição de datas no frontend
Converter datas para o horário local somente na apresentação e enviar valores editados com timezone explícito, conforme o contrato da TASK-019. Remover conversões que tratam UTC como hora local ou usam offsets fixos.

### 21 — TASK-021: Corrigir os contratos de anexos
Garantir que anexos de ocorrência e de inspeção usem os campos e endpoints corretos, respeitem autenticação e permissões e possam ser listados ou reenviados após falha.

#### 21A — Foto de ocorrência
Alinhar o campo enviado pela tela de bipagem ao campo aceito pelo endpoint de upload de ocorrência, preservando as permissões e a leitura da foto.

#### 21B — Anexos de inspeção
Permitir anexar e listar imagens de inspeção com validação de usuário, planta, tipo e tamanho. Em caso de falha, permitir nova tentativa sem criar outra inspeção.

### 22 — TASK-022: Auditar os módulos de Corte, Apoio e dados simulados
Identificar como as telas e endpoints de Corte e Apoio são usados e localizar respostas fictícias ou dados hardcoded. Registrar o que precisa ser integrado à rota e criar tarefas específicas para mudanças necessárias, sem ampliar esta auditoria para uma refatoração geral.

### 23 — TASK-023: Validar a jornada integrada
Verificar o fluxo completo de modelo, peças, rota, ordem, bipagem e Torre para novos cadastros e registros históricos. Conferir também cadastros individuais, permissões, anexos, horários e integridade dos dados.

### 24 — TASK-024: Fazer o cadastro de modelo incluir peças e rota
Guiar a criação de um novo modelo no Catálogo de Modelos para que suas peças e sua rota sejam definidas antes da gravação final. Preservar a edição de modelos existentes e permitir identificar modelos históricos que ainda precisam de rota.

#### 24A — Serviço e API do cadastro agregado
Criar uma operação de backend compartilhada que valide e persista modelo, peças e rota como um conjunto. Disponibilizar a consulta de modelos que têm rota e podem receber uma nova ordem; não duplicar essa regra nos consumidores.

#### 24B — Jornada de cadastro no Catálogo de Modelos
Compor cadastro do modelo, seleção de peças e construção da rota em uma jornada no catálogo. Permitir revisar e voltar entre as etapas antes de salvar o conjunto.

#### 24C — Seleção de modelos na criação de ordens
Exibir como opções somente modelos com rota válida para a nova ordem e orientar o usuário sobre modelos históricos pendentes. A API também deve aplicar essa regra, sem depender somente do filtro visual.

### 25 — TASK-025: Garantir a unicidade do código do produto
Impedir que duas criações concorrentes gravem o mesmo código, tanto no cadastro individual quanto no cadastro agregado. Antes de adicionar a constraint do banco, identificar duplicidades existentes e definir como tratá-las sem alterar códigos históricos automaticamente.

### 26 — TASK-026: Fazer o wizard gravar a rota no snapshot da ordem
Adaptar a finalização do wizard para reutilizar o serviço de cadastro agregado e gravar na ordem a mesma versão da rota definida para o modelo. Modelo, peças, rota e ordem devem ser confirmados juntos na transação final.
