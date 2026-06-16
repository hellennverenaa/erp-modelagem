# Guia de Deploy de Banco de Dados — ERP Chão de Fábrica

Este documento fornece as diretrizes arquiteturais, diagramas lógicos de entidade-relacionamento e o guia passo a passo para a implantação do banco de dados relacional (PostgreSQL) do **ERP Chão de Fábrica v4.0** em ambientes de produção.

---

## 1. Diagramas de Entidade-Relacionamento (ERD)

Para facilitar a leitura da modelagem composta por **32 tabelas**, dividimos a arquitetura em dois subgrupos lógicos:

### 1.1 Diagrama 1: O "Coração da Produção"
Este subgrupo foca na infraestrutura física da fábrica, no cadastro de produtos e rastreabilidade principal de peças/lotes, além do detalhamento de micro-fluxos operacionais (Apoio e Corte por Máquina).

```mermaid
erDiagram
    PLANTAS {
        uuid id PK
        varchar nome
        varchar endereco
        varchar cidade
        varchar estado
        boolean ativo
        timestamp created_at
        timestamp updated_at
    }

    SETORES {
        uuid id PK
        uuid planta_id FK
        varchar nome
        uuid tipo_opcao_id FK
        int ordem_fluxo
        boolean is_condicional
        boolean ativo
        timestamp created_at
        timestamp updated_at
    }

    ESTACOES_TRABALHO {
        uuid id PK
        uuid setor_id FK
        varchar codigo
        varchar descricao
        varchar tipo_equipamento
        boolean ativo
        timestamp created_at
        timestamp updated_at
    }

    MARCAS {
        uuid id PK
        varchar nome
        varchar logo_url
        boolean ativo
        timestamp created_at
        timestamp updated_at
    }

    MODELOS {
        uuid id PK
        uuid marca_id FK
        varchar codigo_produto
        varchar nome
        varchar mfm_referencia_url
        varchar ficha_tecnica_url
        varchar temporada
        varchar status
        timestamp created_at
        timestamp updated_at
    }

    PECAS {
        uuid id PK
        uuid modelo_id FK
        varchar nome
        varchar codigo_barras
        text descricao
        uuid setor_corte_opcao_id FK
        timestamp created_at
        timestamp updated_at
    }

    ROTA_MODELO {
        uuid id PK
        uuid modelo_id FK
        uuid setor_id FK
        int ordem
        boolean obrigatorio
        varchar tipo_execucao
        boolean bipagem_apenas_saida
        timestamp created_at
    }

    ORDENS_TESTE {
        uuid id PK
        uuid modelo_id FK
        uuid planta_id FK
        uuid criado_por_id FK
        varchar codigo_barras
        timestamp data_inicio
        timestamp data_fim_prevista
        timestamp data_fim_real
        varchar prioridade_pcp
        varchar status
        boolean liberado_producao
        boolean possui_caixa_teste
        text observacoes
        timestamp created_at
        timestamp updated_at
    }

    RASTREAMENTOS {
        uuid id PK
        uuid ordem_teste_id FK
        uuid peca_id FK
        uuid setor_id FK
        uuid estacao_id FK
        uuid operador_entrada_id FK
        uuid operador_saida_id FK
        uuid inspecao_saida_id FK
        varchar tipo_lote
        timestamp data_entrada
        timestamp data_saida
        int tempo_permanencia_min
        varchar status
        timestamp created_at
        timestamp updated_at
    }

    ETAPAS_APOIO {
        uuid id PK
        uuid rastreamento_id FK
        varchar etapa
        uuid operador_id FK
        timestamp data_inicio
        timestamp data_fim
        varchar status
        text observacao
        timestamp created_at
        timestamp updated_at
    }

    ETAPAS_CORTE {
        uuid id PK
        uuid rastreamento_id FK
        uuid estacao_id FK
        varchar etapa
        uuid operador_id FK
        timestamp data_bip
        varchar resultado_conformidade
        text observacao
        timestamp created_at
        timestamp updated_at
    }

    PLANTAS ||--o{ SETORES : "possui"
    PLANTAS ||--o{ ORDENS_TESTE : "executa"
    SETORES ||--o{ ESTACOES_TRABALHO : "contem"
    SETORES ||--o{ RASTREAMENTOS : "registra em"
    SETORES ||--o{ ROTA_MODELO : "compoe rota"
    MARCAS ||--o{ MODELOS : "possui"
    MODELOS ||--o{ PECAS : "composto por"
    MODELOS ||--o{ ROTA_MODELO : "define rota"
    MODELOS ||--o{ ORDENS_TESTE : "gera teste"
    ORDENS_TESTE ||--o{ RASTREAMENTOS : "rastreia"
    PECAS ||--o{ RASTREAMENTOS : "bipada em"
    RASTREAMENTOS ||--o{ ETAPAS_APOIO : "detalha micro-fluxo"
    RASTREAMENTOS ||--o{ ETAPAS_CORTE : "detalha micro-fluxo"
    ESTACOES_TRABALHO ||--o{ RASTREAMENTOS : "local da bipagem"
    ESTACOES_TRABALHO ||--o{ ETAPAS_CORTE : "equipamento utilizado"
```

---

### 1.2 Diagrama 2: A "Qualidade Onipresente"
Este subgrupo foca no ciclo de garantia de qualidade (Checklists Dinâmicos, Inspeções de Qualidade, Divergências, Retrabalho Cirúrgico, Apontamento de Ocorrências com Fotos e Dossiê PDF Final).

```mermaid
erDiagram
    ORDENS_TESTE {
        uuid id PK
        uuid modelo_id FK
    }

    CHECKLIST_TEMPLATES {
        uuid id PK
        uuid modelo_id FK
        uuid marca_id FK
        varchar setor_tipo
        varchar nome
        text descricao
        int versao
        boolean ativo
        timestamp created_at
        timestamp updated_at
    }

    CHECKLIST_TEMPLATE_ITENS {
        uuid id PK
        uuid template_id FK
        varchar descricao
        varchar tipo_resposta
        boolean obrigatorio
        int ordem
        timestamp created_at
    }

    CHECKLISTS {
        uuid id PK
        uuid ordem_teste_id FK
        uuid template_id FK
        uuid setor_id FK
        uuid preenchido_por_id FK
        timestamp data_preenchimento
        varchar status
        boolean bloqueante
        text observacoes
        timestamp created_at
        timestamp updated_at
    }

    CHECKLIST_ITENS {
        uuid id PK
        uuid checklist_id FK
        uuid template_item_id FK "nullable"
        varchar descricao_avulsa "nullable"
        text valor_resposta
        boolean conforme
        text observacao
        timestamp created_at
    }

    INSPECOES {
        uuid id PK
        uuid ordem_teste_id FK
        uuid inspetor_id FK
        uuid setor_id FK
        varchar tipo_inspecao
        varchar tipo_lote
        timestamp data_inspecao
        varchar resultado
        text observacoes
        timestamp created_at
        timestamp updated_at
    }

    INSPECAO_PECAS {
        uuid id PK
        uuid inspecao_id FK
        uuid peca_id FK
        varchar resultado
        text observacao
        timestamp created_at
    }

    DIVERGENCIAS {
        uuid id PK
        uuid ordem_teste_id FK
        uuid inspecao_id FK
        uuid peca_id FK
        uuid setor_id FK
        uuid reportado_por_id FK
        text descricao
        varchar tipo_divergencia
        varchar gravidade
        boolean resolvido
        timestamp data_resolucao
        uuid resolvido_por_id FK
        timestamp created_at
        timestamp updated_at
    }

    RETRABALHOS {
        uuid id PK
        uuid divergencia_id FK
        uuid ordem_teste_id FK
        uuid peca_id FK
        uuid setor_origem_id FK
        uuid setor_destino_id FK
        uuid responsavel_id FK
        text descricao
        varchar status
        timestamp data_inicio
        timestamp data_fim
        timestamp created_at
        timestamp updated_at
    }

    OCORRENCIAS_PRODUCAO {
        uuid id PK
        uuid ordem_teste_id FK
        uuid rastreamento_id FK
        uuid setor_id FK
        uuid reportado_por_id FK
        varchar titulo
        text descricao
        varchar tipo_ocorrencia
        varchar gravidade
        varchar status
        boolean interrompe_sla
        timestamp data_ocorrencia
        timestamp data_resolucao
        uuid resolvido_por_id FK
        text resolucao_descricao
        timestamp created_at
        timestamp updated_at
    }

    DOSSIES_MODELO {
        uuid id PK
        uuid ordem_teste_id FK
        uuid modelo_id FK
        uuid gerado_por_id FK
        varchar status
        varchar caminho_pdf
        int tamanho_bytes
        jsonb metadados_compilacao
        timestamp gerado_em
        timestamp created_at
    }

    ANEXOS {
        uuid id PK
        varchar entidade_tipo
        uuid entidade_id
        varchar nome_arquivo
        varchar caminho_arquivo
        varchar tipo_mime
        int tamanho_bytes
        uuid uploaded_por_id FK
        timestamp created_at
    }

    EMAILS {
        uuid id PK
        uuid ordem_teste_id FK
        uuid checklist_id FK
        varchar tipo_email
        varchar assunto
        text corpo_html
        jsonb destinatarios
        timestamp data_envio
        varchar status
        text erro_mensagem
        timestamp created_at
    }

    ORDENS_TESTE ||--o{ CHECKLISTS : "preenche"
    ORDENS_TESTE ||--o{ INSPECOES : "inspeciona"
    ORDENS_TESTE ||--o{ DIVERGENCIAS : "registra"
    ORDENS_TESTE ||--o{ RETRABALHOS : "gera"
    ORDENS_TESTE ||--o{ OCORRENCIAS_PRODUCAO : "tem"
    ORDENS_TESTE ||--o{ DOSSIES_MODELO : "gera dossie"
    ORDENS_TESTE ||--o{ EMAILS : "envia"

    CHECKLIST_TEMPLATES ||--o{ CHECKLIST_TEMPLATE_ITENS : "define"
    CHECKLIST_TEMPLATES ||--o{ CHECKLISTS : "instancia"
    CHECKLISTS ||--o{ CHECKLIST_ITENS : "itens"
    CHECKLIST_TEMPLATE_ITENS ||--o{ CHECKLIST_ITENS : "mapeia"
    CHECKLISTS ||--o{ EMAILS : "vincula"

    INSPECOES ||--o{ INSPECAO_PECAS : "detalha"
    INSPECOES ||--o{ DIVERGENCIAS : "origina"
    DIVERGENCIAS ||--o{ RETRABALHOS : "determina"

    %% Relacionamentos Lógicos Polimórficos de Anexos
    ANEXOS ||--o{ OCORRENCIAS_PRODUCAO : "fotos de gargalos (polimorfico)"
    ANEXOS ||--o{ DOSSIES_MODELO : "PDF compilado (polimorfico)"
```

---

## 2. Passo a Passo para o Servidor de Produção Real

Este roteiro destina-se a Administradores de Banco de Dados (DBAs) ou Engenheiros DevOps encarregados do deploy do banco de dados no ambiente produtivo corporativo.

### Passo 2.1: Isolamento de Schema no PostgreSQL
Para garantir que as tabelas de modelagem e testes não se misturem com outras tabelas da base corporativa compartilhada (evitando colisões), deve-se criar um namespace (schema) isolado.

O DBA deve acessar o servidor PostgreSQL alvo e executar o seguinte comando SQL:

```sql
-- Criar a gaveta isolada para o ERP de Modelagem
CREATE SCHEMA IF NOT EXISTS erp_modelagem;

-- Opcional: conceder permissões para o usuário da aplicação
ALTER SCHEMA erp_modelagem OWNER TO seu_usuario_aplicacao;
```

---

### Passo 2.2: Configuração das Variáveis de Ambiente (`.env`)
No servidor de produção real (ou nas variáveis de ambiente da pipeline de CI/CD), as seguintes chaves do `.env` devem ser configuradas para apontar corretamente para o schema isolado:

```env
# Ambiente de Execução
NODE_ENV=production

# Configurações de Conexão com o PostgreSQL Corporativo
DB_HOST=10.0.0.12               # IP ou host do servidor de banco em produção
DB_PORT=5432                    # Porta do PostgreSQL
DB_NAME=sobracorte              # Banco de dados corporativo principal
DB_USER=seu_usuario_aplicacao   # Usuário com permissão no schema erp_modelagem
DB_PASS=sua_senha_segura        # Senha em produção

# Schema Isolado do ERP de Modelagem (Crucial)
DB_SCHEMA=erp_modelagem
```

---

### Passo 2.3: Execução de Migrações em Produção (CI/CD ou Console)

Para efetuar a criação de tabelas, índices e relacionamentos sem risco de perda de dados e mantendo o histórico de controle de schema, a aplicação deve rodar as migrations.

#### Cenário A: Pipeline de CI/CD (Recomendado)
A pipeline de build/deploy deve executar o comando como um step de "Pre-deploy" (logo após a instalação de dependências e compilação do TypeScript):

```bash
# 1. Instalar dependências necessárias
npm ci --only=production

# 2. Compilar TypeScript em JavaScript
npm run build

# 3. Rodar as migrações (conecta no banco e aplica as deltas de DDL)
npm run migration:run
```

#### Cenário B: Execução Manual no Servidor
Se o deploy for manual, o engenheiro DevOps deve abrir o terminal na raiz do projeto configurado no servidor e executar:

```bash
npm run migration:run
```

#### Logs Esperados no Terminal:
```text
query: CREATE TABLE "erp_modelagem"."plantas" ...
query: CREATE TABLE "erp_modelagem"."setores" ...
...
Migration InitialMigration1781642463742 has been executed successfully.
```

---

## 3. Estrutura de Controle (TypeORM Metadata)

O TypeORM criará uma tabela chamada `migrations` sob o schema isolado (`erp_modelagem.migrations`). Esta tabela registra o carimbo de data/hora (timestamp) e o nome de cada migração executada, impedindo que a mesma migration rode duas vezes ou cause colisões. 

> [!CAUTION]
> **Nunca** altere, exclua ou manipule manualmente os registros da tabela `erp_modelagem.migrations` em produção, sob o risco de dessincronizar a aplicação e causar falhas de deploy futuras.
