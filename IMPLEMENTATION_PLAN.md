# IMPLEMENTATION_PLAN — ERP Modelagem

**Estado:** planejamento. Nenhuma TASK deste documento foi iniciada ou implementada.

**Base do diagnóstico:** leitura estática do repositório. O PostgreSQL, o gateway e a aplicação em execução ainda não foram inspecionados. Afirmações sobre registros existentes ou sobre a causa operacional de uma falha permanecem pendentes da TASK-001.

**Uso do plano:** uma TASK por branch; uma pessoa responsável por TASK; mudanças em arquivos centrais e migrations sempre serializadas. Ao descobrir trabalho novo, registrar outra TASK antes de alterar código. O plano deve ser atualizado em commits pequenos, sem edição simultânea por duas pessoas.

**Fluxo de Git obrigatório:** [`docs/GIT.md`](docs/GIT.md) é a referência para branches, sincronização, rebase e Pull Requests. Para esta demanda, toda funcionalidade pequena deve ser entregue em branch própria e PR; o outro desenvolvedor deve aprovar o PR antes do merge na `main`.

## 1. Visão geral

O objetivo é fazer `Modelo → Peças → Rota → Ordem → Bipagem → Torre de Controle` usar regras e dados consistentes. O fluxo “Iniciar Novo Teste” terá quatro passos reversíveis e só gravará o conjunto ao finalizar. Cadastros individuais continuarão disponíveis.

Os maiores riscos identificados são: gravações parciais no wizard; rota mutável do modelo usada por ordens existentes; ausência de SLA por etapa na rota; ligação indireta entre máquina da peça e setor; setores fixos na construção da rota e na bipagem; datas sem padrão explícito de timezone. O erro `ROTA_NOT_FOUND` foi localizado na leitura de `rota_modelo`, mas sua causa operacional ainda precisa de evidência do ambiente.

Módulos envolvidos: modelos, catálogo e peças de modelo, configuração de setores, construtor de rota, ordens, bipagem, conferência/checklist, qualidade, TV de rastreamento, Torre de Controle, navegação e autenticação/RBAC. Risco geral **alto**, pois rota, ordem e rastreamento já contêm dados históricos e são consumidos por várias telas.

**Limite de escopo:** preservar login, RBAC, cadastros individuais, etiquetas, checklists e inspeções. Corte/Apoio e anexos têm lacunas registradas abaixo; cada correção depende de TASK própria e não autoriza refatoração geral.

## 2. Arquitetura atual

```text
Vue 3 + TypeScript + Vue Router
  → Axios: /api/erp-modelagem
  → gateway (Vite aponta para localhost:2399 por padrão)
  → Express 5 + TypeScript (ERP_PORT, padrão 3001)
  → middlewares JWT/RBAC → routes → controllers → alguns services
  → TypeORM → PostgreSQL, schema erp_modelagem, migrations explícitas
  ↔ Socket.IO para eventos de rastreamento/ocorrência
```

O frontend está em `frontend/src/views`, `components`, `router` e `api`. `WizardCriacaoTesteView.vue`, `RouteBuilder.vue`, `GestaoOrdensView.vue`, `BipagemView.vue`, `DashboardGerencialView.vue`, `RastreamentoOrdemView.vue` e `DashboardView.vue` são os pontos principais. A sessão fica em `api/auth.store.ts`; a maioria das chamadas de negócio é feita diretamente nas telas por `api/axios.ts`. Não há store global de domínio nem cache coordenado para rota/ordem.

O backend está em `backend/src/routes`, `controllers`, `services`, `entities` e `migrations`. `auth.service.ts`, `rbac.service.ts`, `websocket.service.ts`, `etiqueta.service.ts`, `email.service.ts` e `dossie.service.ts` existem; a maior parte das regras de modelo/rota/ordem/rastreamento permanece nos controllers. Repositórios são obtidos via `AppDataSource.getRepository(...)`; não há camada própria de repositories para esses agregados. `database.ts` usa `synchronize: false`; `server.ts` verifica migrations pendentes.

Persistência atual do wizard:

```text
Passo 1: POST /admin/modelos                  → commit de Modelo
Passo 2: POST /pecas/modelo/:modeloId          → delete + insert de Peças
Passo 3: PUT  /rotas/:modeloId                 → delete + insert de RotaModelo em transação
Passo 4: POST /ordens-teste                    → commit de OrdemTeste
Depois:  POST /etiquetas/gerar                 → PDF
```

`POST /ordens-teste` conta linhas de `rota_modelo` para o `modeloId`. A OT guarda `modeloId`, planta, `possuiCaixaTeste` e `slasPorSetor` em JSONB, mas **não guarda uma cópia da rota**. Bipagem e TV leem a rota atual do modelo. A gestão de ordens e a TV também recebem `modelo.rotas` nas respostas de `/lotes`.

Principais tabelas e relações conforme entidades/migrations:

| Tabela | Relações relevantes | Limite observado |
|---|---|---|
| `marcas`, `modelos` | `modelos.marca_id`; modelo possui peças, rota e OTs | `codigo_produto` é `varchar`; `temporada` nullable; unicidade do código só checada na aplicação |
| `catalogo_pecas`, `pecas` | `pecas.modelo_id`; `setor_corte_opcao_id` aponta para opção configurável | Seleção do catálogo não grava `catalogo_peca_id` |
| `config_categorias`, `config_opcoes`, `setores` | `setores.planta_id` e `tipo_opcao_id`; peças usam opção de subsetor de corte | Rota referencia setor físico; associação opção de corte → setor depende de resolução indireta |
| `rota_modelo` | `modelo_id`, `setor_id`, `ordem`, `tipoExecucao`, `obrigatorio` | Não contém versão, SLA, condição explícita ou snapshot da OT |
| `ordens_teste` | `modelo_id`, `planta_id`, `criado_por_id` | Sem rota própria; `slas_por_setor` JSONB; `possui_caixa_teste` |
| `rastreamentos` | `ordem_teste_id`, `setor_id`, `peca_id?`, operadores, datas e status | Não aponta para uma etapa única da rota da ordem |
| `checklists`, `inspecoes`, `ocorrencias_producao`, `retrabalhos`, `anexos` | Associadas à OT, setor ou rastreamento | Alimentam validações, histórico e KPIs |
| `usuarios`, `perfis`, `perfil_permissoes` | Usuário com planta/perfil/setor; ação global ou por setor | UI e API têm guardas; preserve ambos |

**Dados reais pendentes:** cardinalidades, registros órfãos, códigos não numéricos, ordens em andamento, rotas alteradas após criação de OT, SLAs históricos, setores por planta e timezone. Nenhuma migration deve ser aplicada antes do inventário read-only da TASK-001.

## 3. Mapeamento dos módulos

| Módulo | Responsabilidade | Frontend | Backend | Tabelas | Dependências e consumidores |
|---|---|---|---|---|---|
| Modelos | Marca, código, nome e metadados | `GestaoModelosView.vue`, passo 1 de `WizardCriacaoTesteView.vue`, `BrandManagerModal.vue` | `admin.routes.ts`, `admin.controller.ts` | `marcas`, `modelos` | Alimenta peças, rota, ordens, etiquetas e TV |
| Peças | Catálogo e peças ligadas ao modelo; máquina de corte | `CatalogoPecasView.vue`, passo 2 do wizard, gestão de ordens | `pecas.routes.ts`, `admin.controller.ts`, `corte.controller.ts` | `catalogo_pecas`, `pecas`, `config_opcoes` | Depende do modelo; deve alimentar rota, corte e inspeção |
| Construtor de Rota | Desenho de etapas, sequência, paralelismo e SLA visual | `RouteBuilder.vue`, passo 3 do wizard | `rotas.routes.ts`, `rotas.controller.ts` | `rota_modelo`, `setores`, `config_opcoes` | Depende das peças e setores; consumido por ordens, bipagem e TV |
| Gestão de Ordens | Criar e manter OT, planta, prazos, SLAs, etiquetas e auditoria | `GestaoOrdensView.vue`, passo 4 do wizard | `lotes.routes.ts`, `lotes.controller.ts`, `etiqueta.controller.ts` | `ordens_teste`, `modelos`, `rota_modelo`, `audit_log` | Depende da rota; alimenta bipagem, qualidade, Torre e TV |
| Bipagem Operacional | Entrada/saída por setor, tipo de lote e crachá | `BipagemView.vue`, `ModalAuthQuiosque.vue` | `rastreamentos.routes.ts`, `rastreamentos.controller.ts` | `rastreamentos`, `ordens_teste`, `rota_modelo`, `setores`, `usuarios` | Depende da rota efetiva da OT, permissões, checklist e inspeção; alimenta Torre/TV |
| Conferência Inicial | Almoxarifado, Navalha e Telas condicional; checklist de saída | `BipagemView.vue`, `ChecklistView.vue` | `rastreamentos.controller.ts`, `checklists.controller.ts` | `rota_modelo`, `rastreamentos`, `checklists`, `checklist_itens` | Depende de Serigrafia na rota; libera handoff e atualiza execução |
| Torre de Controle | KPIs de OT, tempo, ocorrência, qualidade e retrabalho | `DashboardGerencialView.vue` | `dashboard.routes.ts`, `dashboard.controller.ts`, `websocket.service.ts` | `ordens_teste`, `rastreamentos`, `ocorrencias_producao`, `inspecoes`, `retrabalhos`, `anexos` | Consome execução real; distinta da TV de rastreamento em `RastreamentoOrdemView.vue` |
| Navegação / Layout | Menu, permissão visual, cabeçalho e sessão | `DashboardView.vue`, `router/index.ts`, `api/auth.store.ts` | `auth.routes.ts`, `auth.service.ts`, middlewares RBAC | `usuarios`, `perfis`, `perfil_permissoes` | Envolve todas as telas; mudanças visuais não podem alterar autorização da API |
| Configurações relacionadas | Tipos e opções de setor, subsetores de corte, plantas e RBAC | `AdminRBAC.vue`, `BrandManagerModal.vue`, seletores do wizard/rota | `configuracoes.routes.ts`, `admin.routes.ts`, controllers correspondentes | `config_categorias`, `config_opcoes`, `setores`, `plantas`, tabelas RBAC | Alimenta peças, rota, bipagem e autorização; não há página geral de configurações no router atual |
| Qualidade e módulos auxiliares | Inspeção, ocorrências, corte/apoio, dossiê | `InspecaoQualidadeView.vue`, `ChecklistView.vue`, `BipagemView.vue` | `inspecoes`, `ocorrencias`, `corte`, `apoio`, `dossie` | Tabelas homônimas, `anexos` | Gates da bipagem e KPIs; corte/apoio contêm endpoints simulados |

## 4. Funcionalidades que NÃO devem ser quebradas

### Funcionalidades protegidas

Itens abaixo existem no código; marcar somente após regressão em ambiente apropriado, sem presumir que estejam validados em runtime.

- [ ] Login DASS, sessão JWT, `/auth/me` e logout continuam funcionando.
- [ ] RBAC de tela, ação e setor continua sendo aplicado na API e na navegação.
- [ ] Escopo por planta da listagem/criação de OT permanece coerente com as permissões.
- [ ] Cadastro/listagem individual de marca e modelo continuam funcionando.
- [ ] Catálogo individual de peças e vínculo de peças ao modelo continuam utilizáveis.
- [ ] Edição individual da rota continua disponível fora do wizard.
- [ ] Criação de OT a partir de modelo já cadastrado continua disponível em Gestão de Ordens.
- [ ] Ordens antigas, rastreamentos, auditoria, SLAs e etiquetas continuam acessíveis.
- [ ] Rotas já cadastradas não são apagadas ou reinterpretadas silenciosamente.
- [ ] Bipagem por crachá/RFID registra operador, setor, tipo de lote e histórico corretamente.
- [ ] Checklist, inspeção e retrabalho continuam aplicando seus gates existentes.
- [ ] Ocorrências e eventos Socket.IO continuam atualizando consumidores existentes.
- [ ] PDF de etiqueta e geração de dossiê não são afetados sem necessidade.
- [ ] Torre e TV continuam exibindo registros antigos, inclusive durante a transição de contrato.
- [ ] Layout recolhido, teclado e responsividade permanecem utilizáveis.

## 5. Problemas encontrados

### ISS-01 — Rota não encontrada ao criar a ordem

- **Problema / atual:** `POST /ordens-teste` retorna `ROTA_NOT_FOUND` quando `count(rota_modelo where modelo_id = modeloId)` é zero.
- **Esperado:** uma rota salva com sucesso para o mesmo modelo e banco é recuperada antes da criação da OT.
- **Causa raiz:** **em investigação**. O código de escrita, leitura e contagem usa `RotaModelo` e `modeloId`; a transação de escrita retorna erro se falhar. Confirmar IDs, resposta do PUT, conexão/schema e linhas reais antes de concluir.
- **Frontend afetado:** `RouteBuilder.vue`, `WizardCriacaoTesteView.vue`, `GestaoOrdensView.vue`.
- **Backend afetado:** `rotas.controller.ts`, `lotes.controller.ts`, gateway/configuração.
- **Banco afetado:** `rota_modelo`, `modelos`; verificar schema `erp_modelagem`.
- **Arquivos envolvidos:** os citados e `backend/src/config/database.ts` (leitura/configuração).
- **Dependências:** TASK-001; correção definida em TASK-009 após evidência.
- **Risco:** crítico.

### ISS-02 — Wizard grava parcialmente e não volta com segurança

- **Problema / atual:** modelo, peças e rota são gravados nos passos 1–3; voltar ao passo 1 e avançar tenta criar outro modelo. Peças são substituídas por `delete` seguido de `save` sem transação conjunta.
- **Esperado:** quatro passos editáveis e uma gravação atômica ao finalizar; cadastros individuais preservados.
- **Causa raiz:** o frontend encadeia endpoints de CRUD independentes; não existe endpoint de finalização do agregado.
- **Frontend afetado:** `WizardCriacaoTesteView.vue`, `RouteBuilder.vue`.
- **Backend afetado:** `admin.controller.ts`, `pecas.routes.ts`, `rotas.controller.ts`, `lotes.controller.ts`.
- **Banco afetado:** `modelos`, `pecas`, `rota_modelo`, `ordens_teste`.
- **Arquivos envolvidos:** acima; novos serviços/contrato nas TASK-011 a TASK-013.
- **Dependências:** TASK-006 a TASK-011.
- **Risco:** crítico.

### ISS-03 — Código do produto e Temporada

- **Problema / atual:** código é texto sem regra numérica no Zod/DB; Temporada ainda é editável no wizard e no cadastro individual.
- **Esperado:** código composto só por dígitos; Temporada removida do fluxo ativo sem perder valores antigos.
- **Causa raiz:** validação `string().min().max()` e coluna `varchar` sem `CHECK`; campo `temporada` continua no DTO, entidade e telas.
- **Frontend afetado:** `WizardCriacaoTesteView.vue`, `GestaoModelosView.vue`.
- **Backend afetado:** `admin.controller.ts`.
- **Banco afetado:** `modelos.codigo_produto`, `modelos.temporada`; verificar códigos históricos e duplicatas.
- **Arquivos envolvidos:** citados, `entities/Modelo.ts`, migration aditiva.
- **Dependências:** TASK-001, TASK-006.
- **Risco:** alto.

### ISS-04 — Busca de peça às vezes não apresenta sugestões

- **Problema / atual:** wizard busca todo o catálogo uma vez; filtro local depende dessa carga. GET interno exige `TELA_CATALOGO_PECAS`, mesmo para perfil que pode abrir o wizard; falha de uma das duas chamadas do `Promise.all` impede atribuir ambas as listas.
- **Esperado:** resultado durante a digitação, com estados de carregamento, vazio e erro claros.
- **Causa raiz:** contrato de autorização desalinhado e carga acoplada; o `v-model` já atualiza o texto reativamente, então não atribuir o sintoma apenas à ausência de `@input`.
- **Frontend afetado:** `WizardCriacaoTesteView.vue`.
- **Backend afetado:** `pecas.routes.ts`, RBAC da rota de catálogo.
- **Banco afetado:** leitura de `catalogo_pecas`.
- **Arquivos envolvidos:** citados; opcionalmente serviço de busca frontend específico.
- **Dependências:** TASK-004; serializar edição do wizard com TASK-013.
- **Risco:** médio.

### ISS-05 — Peça perde identidade do catálogo e máquina não dirige toda a rota

- **Problema / atual:** POST de peças descarta ID/número do item de catálogo; `Peca` salva nome e opção de corte. Ponte/Lectra/Atom são inseridos sempre na rota; CN/Couro/Laser vêm de comparação textual das opções escolhidas.
- **Esperado:** peça vinculada ao catálogo e ao subsetor válido; todos os subsetores necessários derivados das peças.
- **Causa raiz:** falta FK `catalogo_peca_id` e mapeamento explícito opção de corte → tipo/setor da rota.
- **Frontend afetado:** wizard, construtor e Gestão de Ordens.
- **Backend afetado:** `pecas.routes.ts`, `admin.controller.ts`, `corte.controller.ts`, serviço de rota proposto.
- **Banco afetado:** `pecas`, `catalogo_pecas`, `config_opcoes`, `setores`, rota futura.
- **Arquivos envolvidos:** entidades e controllers citados, migrations aditivas.
- **Dependências:** TASK-001 a TASK-003, TASK-007 a TASK-012.
- **Risco:** alto.

### ISS-06 — Tempo do preview não é tempo da etapa persistida

- **Problema / atual:** controles usam mapa por `setorId`, blocos visuais agregam várias etapas e IDs de setor ausentes podem compartilhar chave vazia. `RotaModelo` não tem SLA; o PUT envia `slasPorSetor`, mas o schema do endpoint só persiste `rota`. O wizard guarda o mapa depois na OT.
- **Esperado:** ID e SLA independentes por etapa, salvos e recuperados na rota e herdados pela OT.
- **Causa raiz:** unidade do preview difere da unidade persistida; SLA não pertence à entidade de etapa e o estado é indexado por setor, não por etapa.
- **Frontend afetado:** `RouteBuilder.vue`, wizard, Gestão de Ordens.
- **Backend afetado:** `rotas.controller.ts`, `lotes.controller.ts`.
- **Banco afetado:** `rota_modelo`, `ordens_teste.slas_por_setor` e novas etapas/snapshots.
- **Arquivos envolvidos:** citados, `entities/RotaModelo.ts`, `entities/OrdemTeste.ts`.
- **Dependências:** TASK-008 a TASK-013.
- **Risco:** alto.

### ISS-07 — Serigrafia, Telas e bifurcação com regras dispersas

- **Problema / atual:** construtor sempre salva Telas na Conferência Inicial; Serigrafia é opcional na rota. `possuiCaixaTeste` fica na OT, e toggle de Caixa Teste no construtor não é serializado. Paralelismo usa mesma `ordem` e `tipoExecucao`.
- **Esperado:** presença de Serigrafia na rota determina Telas e o caminho Serigrafia/Apoio; Caixa Teste só permanece na OT se for realmente uma decisão distinta de tipo de lote.
- **Causa raiz:** skeleton fixo no frontend e ausência de contrato explícito para condições/grupos; conceitos de ramo produtivo e tipo de lote estão misturados na UX.
- **Frontend afetado:** `RouteBuilder.vue`, wizard, `BipagemView.vue`.
- **Backend afetado:** serviços de rota, `rastreamentos.controller.ts`.
- **Banco afetado:** rota de modelo e snapshot da OT; `ordens_teste.possui_caixa_teste` sob análise sem exclusão automática.
- **Arquivos envolvidos:** citados.
- **Dependências:** TASK-002, TASK-008 a TASK-015.
- **Risco:** alto.

### ISS-08 — Papel de Bordado em relação a Apoio

- **Problema / atual:** Bordado é setor independente no construtor; `EtapaApoio` modela subprocessos sob Rastreamento de Apoio, mas não inclui Bordado, e `/apoio` contém respostas simuladas.
- **Esperado:** semântica definida antes de mudar rota, bipagem, permissões ou histórico.
- **Causa raiz:** decisão de processo ainda não formalizada; schema plano da rota não expressa hierarquia.
- **Frontend afetado:** `RouteBuilder.vue`, bipagem, Torre/TV.
- **Backend afetado:** `apoio.controller.ts`, `rastreamentos.controller.ts`.
- **Banco afetado:** `setores`, rota, `rastreamentos`, `etapas_apoio`.
- **Arquivos envolvidos:** citados, `entities/EtapaApoio.ts`.
- **Dependências:** TASK-001, TASK-002, TASK-022.
- **Risco:** alto.

### ISS-09 — OT não possui rota própria; bipagem e TV usam rota mutável

- **Problema / atual:** OT contém apenas `modelo_id`; bipagem lista todos os setores da API e valida contra a rota atual do modelo. TV ordena pelo `modelo.rotas` atual. Editar rota pode alterar a interpretação de OT existente.
- **Esperado:** OT herda snapshot imutável; bipagem e telas de acompanhamento consomem esse plano.
- **Causa raiz:** falta entidade/relacionamento de rota da ordem e contrato de fluxo por OT.
- **Frontend afetado:** `BipagemView.vue`, `RastreamentoOrdemView.vue`, gestão/torre.
- **Backend afetado:** `lotes.controller.ts`, `rastreamentos.controller.ts`, serviço de rota/ordem.
- **Banco afetado:** `ordens_teste`, `rota_modelo`, `rastreamentos`, tabelas aditivas de snapshot.
- **Arquivos envolvidos:** citados, entities/migrations correspondentes.
- **Dependências:** TASK-008 a TASK-016.
- **Risco:** crítico.

### ISS-10 — Horários sem convenção temporal única

- **Problema / atual:** migrations usam `TIMESTAMP` sem timezone; backend cria `Date`; inputs `datetime-local` não incluem zona; edição usa `toISOString().slice(0, 16)`.
- **Esperado:** instantes persistidos com semântica UTC; exibição na zona apropriada; dados antigos preservados.
- **Causa raiz:** conversão entre horário local e UTC sem contrato explícito no frontend/API/banco.
- **Frontend afetado:** wizard, Gestão de Ordens, TV e Torre.
- **Backend afetado:** `lotes.controller.ts` e serialização de datas.
- **Banco afetado:** datas de `ordens_teste`, `rastreamentos` e tabelas correlatas.
- **Arquivos envolvidos:** citados, entities e migration planejada.
- **Dependências:** TASK-001, TASK-019, TASK-020.
- **Risco:** alto.

### ISS-11 — Ordem do menu, breadcrumb e perfil

- **Problema / atual:** Gestão de Ordens aparece antes de Construtor de Rota; breadcrumb e perfil/logout ocupam a barra superior.
- **Esperado:** navegação coerente, sem breadcrumb superior, perfil/logout no rodapé da sidebar expandida/recolhida.
- **Causa raiz:** layout e lista de links em `DashboardView.vue` refletem organização anterior.
- **Frontend afetado:** `DashboardView.vue`, eventualmente `router/index.ts` se houver alteração de links.
- **Backend afetado:** nenhum; permissões atuais devem ser preservadas.
- **Banco afetado:** nenhum.
- **Arquivos envolvidos:** citados.
- **Dependências:** TASK-005; execução isolada do núcleo de rota.
- **Risco:** baixo.

### ISS-12 — Torre usa dados reais com métricas e atualização incompletas

- **Problema / atual:** `/dashboard/kpis` usa OT/rastreamento/ocorrência/inspeção/retrabalho reais, mas considera ativos todos os status exceto `REPROVADO`, não filtra por planta/período, faz consultas repetidas de ocorrência e não recebe evento específico de nova OT. UI usa tipografia e densidade irregulares.
- **Esperado:** KPIs com definição operacional explícita, escopo, atualização e visual consistentes com o fluxo da OT.
- **Causa raiz:** agregações independentes do plano de execução e do estado derivado dos rastreamentos; contratos de filtro/status incompletos.
- **Frontend afetado:** `DashboardGerencialView.vue`.
- **Backend afetado:** `dashboard.controller.ts`, emissão de eventos da OT/execução.
- **Banco afetado:** consultas a `ordens_teste`, `rastreamentos`, ocorrências, inspeções e retrabalhos; índices a avaliar.
- **Arquivos envolvidos:** citados.
- **Dependências:** TASK-014, TASK-017, TASK-018.
- **Risco:** médio.

### ISS-13 — Lacunas de integração auxiliares

- **Problema / atual:** foto de ocorrência é enviada no campo `foto`, rota espera `file`; upload de inspeção chama endpoint ausente; `/corte` e `/apoio` contêm respostas simuladas e não são consumidores identificados da tela operacional.
- **Esperado:** telas ativas têm contratos reais; mocks não são apresentados como produção integrada.
- **Causa raiz:** contratos frontend/backend divergentes e módulos auxiliares ainda parciais.
- **Frontend afetado:** `BipagemView.vue`, `InspecaoQualidadeView.vue`; Corte/Apoio se vierem a ser expostos.
- **Backend afetado:** `ocorrencias.routes.ts`, `inspecoes.routes.ts`, `corte.controller.ts`, `apoio.controller.ts`.
- **Banco afetado:** `anexos`, `etapas_corte`, `etapas_apoio` quando aplicável.
- **Arquivos envolvidos:** citados.
- **Dependências:** TASK-021, TASK-022; não ampliar escopo sem TASK específica.
- **Risco:** médio.

## 6. Plano de implementação por etapas

**Convenção:** a marcação `[x] Não iniciado` significa que nenhuma implementação da TASK ocorreu. Diagnóstico estático deste plano não equivale a teste ou auditoria de dados. `Pode ser executada em paralelo` pressupõe branches/worktrees separados, responsáveis diferentes, nenhum arquivo crítico em comum e dependências já integradas. Cada TASK tem um dono exclusivo. Os nomes dos novos arquivos e endpoints são propostas a confirmar em TASK-003.

### FASE 0 — Evidência e decisões de domínio

#### TASK-001 — Auditar dados, ambiente e falha de persistência da rota

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** seguir um caso real de `PUT /rotas/:modeloId` até o `POST /ordens-teste`; comparar IDs, base/schema, linhas e respostas. Levantar contagens de modelos, rotas, peças, OTs em andamento, órfãos, códigos não numéricos, `temporada`, SLAs e timestamps. Inspecionar permissões, setor/planta e rotas históricas sem alterar registros.
- **Arquivos prováveis:** frontend `RouteBuilder.vue`, `WizardCriacaoTesteView.vue`, `GestaoOrdensView.vue`; backend `rotas.controller.ts`, `lotes.controller.ts`, `config/database.ts`, entidades; banco `modelos`, `pecas`, `rota_modelo`, `ordens_teste`, `rastreamentos`, `setores` (somente SELECT). Registrar consultas e resultados agregados neste plano, sem dados pessoais.
- **Dependências:** nenhuma. **Paralelo:** sim, com TASK-005. **Risco:** baixo na execução; crítico no diagnóstico.
- **Aceite:** causa de `ROTA_NOT_FOUND` comprovada por logs/SQL ou explicitamente não reproduzida, com hipóteses restantes e passos para reproduzir; inventário de dados/compatibilidade registrado.
- **Testes necessários:** reprodução controlada de gravação/leitura em ambiente seguro; conferência read-only de schema e conexão. **Rollback:** nenhum dado deve ser alterado.

#### TASK-002 — Decidir semântica de Bordado/Apoio, bifurcação e planta

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** documentar se Bordado substitui, acompanha ou integra Apoio, após inspecionar rotas/OTs/produção/bipagem/Torre. Separar `possuiCaixaTeste` de bifurcação por Serigrafia; decidir comportamento de múltiplas plantas, rotas antigas e reuso de modelo em várias OTs. Confirmar decisão operacional com responsável do processo antes da mudança correspondente.
- **Arquivos prováveis:** frontend `RouteBuilder.vue`, `BipagemView.vue`; backend `rastreamentos.controller.ts`, `lotes.controller.ts`, entidades `EtapaApoio.ts`, `Setor.ts`; banco `rota_modelo`, `ordens_teste`, `rastreamentos`, `etapas_apoio` (leitura).
- **Dependências:** TASK-001. **Paralelo:** sim, com TASK-004/005, desde que sem editar os mesmos arquivos. **Risco:** alto.
- **Aceite:** decisão escrita, cenários com/sem Serigrafia, efeito em OTs antigas e plano de compatibilidade; se a decisão operacional faltar, marcar TASK-002 bloqueada sem escolher arbitrariamente.
- **Testes necessários:** exemplos de rotas e ordens reais anonimizados, matriz de fluxo. **Rollback:** decisão documental revisável.

#### TASK-003 — Fechar esquema alvo e contratos de API

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** aprovar identificador de etapa, versão da rota, snapshot da OT, SLA por etapa, condição de bifurcação, subsetor de corte, regra de planta, compatibilidade de payload e nomes de endpoints. Atualizar seções 11 e 12 antes de migrations.
- **Arquivos prováveis:** documentação/contratos neste plano; leitura de `entities/*`, `routes/*`, `controllers/*`, `frontend/src/api/axios.ts`; banco somente desenho.
- **Dependências:** TASK-001 e TASK-002. **Paralelo:** sim, com TASK-004/005; não com qualquer migration. **Risco:** alto.
- **Aceite:** exemplos completos de request/response e comportamento legado; consumidor de cada campo identificado. **Testes necessários:** revisão de contrato entre as duas pessoas. **Rollback:** revisão documental.

### FASE 1 — Correções isoláveis

#### TASK-004 — Corrigir busca do catálogo no wizard

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** desacoplar cargas, alinhar RBAC da busca com uso permitido no wizard, mostrar sugestões durante digitação/foco, tratar loading/vazio/erro, respostas atrasadas e seleção.
- **Arquivos prováveis:** frontend `frontend/src/views/WizardCriacaoTesteView.vue`; backend `backend/src/routes/pecas.routes.ts`; banco leitura `catalogo_pecas`.
- **Dependências:** nenhuma para correção isolada; usar achados da TASK-001 se disponíveis. **Paralelo:** sim, com TASK-001/002/003/005; **não** com TASK-013 ou TASK-007 se estas alterarem `pecas.routes.ts`. **Risco:** médio.
- **Aceite:** sugestões mudam ao digitar sem blur/refocus; seleção e acesso autorizado funcionam; erro de outra carga não apaga resultados. **Testes necessários:** digitação rápida, foco, vazio, permissão, busca de vários termos, cadastro individual de catálogo. **Rollback:** reverter branch/commit sem alterar DB.

#### TASK-005 — Reorganizar sidebar e layout

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** ordenar navegação conforme dependências reais e páginas existentes; retirar breadcrumb; mover nome, perfil e sair ao rodapé da sidebar; adaptar estado recolhido/mobile sem alterar RBAC.
- **Arquivos prováveis:** frontend `frontend/src/views/DashboardView.vue`, estilos locais e, apenas se necessário, `frontend/src/router/index.ts`; backend/banco nenhum.
- **Dependências:** nenhuma. **Paralelo:** sim, com TASK-001/004; não com outra tarefa que altere `DashboardView.vue`. **Risco:** baixo/médio.
- **Aceite:** menu reflete fluxo, perfis veem mesmas permissões, logout funciona, nenhum vazio no topo, responsivo. **Testes necessários:** desktop/mobile, sidebar aberta/fechada, login/logout e perfis. **Rollback:** reverter commit visual.

#### TASK-006 — Validar código numérico e retirar Temporada do uso ativo

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** aplicar `^[0-9]+$` no backend e nas duas telas de modelo; tratar códigos históricos após auditoria; retirar `temporada` de formulários/DTO novo mantendo coluna/dados antigos até migração separada. Preservar zeros à esquerda como texto.
- **Arquivos prováveis:** frontend `GestaoModelosView.vue`, `WizardCriacaoTesteView.vue`; backend `admin.controller.ts`, possível schema compartilhado; banco `modelos`, migration de `CHECK` apenas se dados conformes.
- **Dependências:** TASK-001; contrato final da TASK-003 para DTO. **Paralelo:** somente com TASK-005 ou outra sem wizard/admin/migrations. **Risco:** alto para dados legados.
- **Aceite:** cadastros individuais e wizard rejeitam letras de modo igual; históricos são preservados/identificados; Temporada some das entradas. **Testes necessários:** criação/edição, zeros à esquerda, código legado, unicidade, API direta. **Rollback:** manter coluna e remover constraint nova se necessário; não apagar dados.

### FASE 2 — Identidade da peça e rota persistente

#### TASK-007 — Fixar vínculo peça–catálogo–subsetor de corte

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** preservar ID da peça de catálogo e identificar opções Lectra, Atom, CN, Ponte, Laser e Couro por IDs/configuração, evitando comparação textual; validar opção existente, ativa e coerente com planta/modelo.
- **Arquivos prováveis:** backend `entities/Peca.ts`, `entities/CatalogoPeca.ts`, `routes/pecas.routes.ts`, `controllers/admin.controller.ts`, serviço novo; frontend wizard e cadastro individual de peças se consumidor; banco migration aditiva em `pecas` e configuração existente.
- **Dependências:** TASK-001, TASK-002, TASK-003, TASK-006. **Paralelo:** não com TASK-004/006/008 ou migration concorrente. **Risco:** alto.
- **Aceite:** peça escolhida guarda catálogo e subsetor, casos históricos sem vínculo continuam legíveis; os seis tipos são configuráveis. **Testes necessários:** CRUD individual, wizard, opções inválidas, modelo com peças repetidas, dados legados. **Rollback:** coluna nullable e leitura compatível; nenhuma remoção.

#### TASK-008 — Persistir etapas versionadas da rota com dados independentes

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** criar esquema aditivo para rota/etapas versionadas com identificador estável, `setor_id`, posição, tempo/SLA e condições/grupos; garantir que cada etapa possui tempo próprio. Materializar/buscar versão histórica sem reescrever `rota_modelo` ou OTs antigas.
- **Arquivos prováveis:** backend `entities/RotaModelo.ts`, novas entidades, migrations, configuração TypeORM; banco `rota_modelo` e novas tabelas a definir em TASK-003; frontend nenhum nesta TASK.
- **Dependências:** TASK-001/002/003/007. **Paralelo:** não com outra migration/entidade central. **Risco:** crítico.
- **Aceite:** esquema suporta duplicidade de setor em etapas distintas, ordem e tempo independentes, versão ativa única por modelo/planta conforme decisão; dados antigos legíveis. **Testes necessários:** migration up/down em cópia, FK/índices, conversão de rotas legadas. **Rollback:** `down` somente se nenhuma gravação nova; em produção, rollback por aplicação compatível e preservação de tabelas.

#### TASK-009 — Centralizar gravação/leitura da rota e sanar erro comprovado

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** serviço de domínio para validar peça/setor/planta, salvar rota completa em transação e devolver versão/etapas confirmadas; leitura da criação da OT usa o mesmo contrato. Aplicar correção específica de `ROTA_NOT_FOUND` encontrada na TASK-001, sem presumir causa.
- **Arquivos prováveis:** backend `controllers/rotas.controller.ts`, `controllers/lotes.controller.ts`, `routes/rotas.routes.ts`, novo service, entidades de rota; frontend `RouteBuilder.vue` somente se contrato exigir; banco tabelas de rota.
- **Dependências:** TASK-001/003/008. **Paralelo:** não com TASK-010/011/012. **Risco:** crítico.
- **Aceite:** PUT confirmado é recuperável por GET e pela criação de OT com mesmo modelo; falha transacional não reporta sucesso; rotas antigas continuam legíveis. **Testes necessários:** integração save→read→create OT, rollback, IDs incorretos, ausência de setor, duas plantas, regressão de rota individual. **Rollback:** alternar leitura compatível, preservar linhas legadas e versão recém-gravada.

### FASE 3 — Ordem e wizard atômico

#### TASK-010 — Criar snapshot imutável da rota na ordem

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** copiar versão/etapas da rota validada para a OT ao criá-la, com `ordem`, `setor`, tempo e condições; definir fallback explícito para OTs existentes sem snapshot. `possuiCaixaTeste` mantém semântica própria se confirmada; bifurcação por Serigrafia deriva do snapshot.
- **Arquivos prováveis:** backend `controllers/lotes.controller.ts`, `entities/OrdemTeste.ts`, entidades novas, serviço de OT; banco `ordens_teste`, tabela de etapas da ordem, migration aditiva; frontend Gestão de Ordens só se contrato exigir.
- **Dependências:** TASK-001/002/003/009. **Paralelo:** não com outra migration/OT service; TASK-016 pode começar após integração. **Risco:** crítico.
- **Aceite:** editar rota do modelo não muda OT existente; OT antiga abre com fallback documentado; sem Serigrafia regra inicia Apoio conforme decisão; Setor de Telas condicionado à rota. **Testes necessários:** criação de OT, edição posterior da rota, duas OTs do mesmo modelo, histórico sem snapshot, plantas. **Rollback:** leitura legada/fallback; manter snapshots gravados.

#### TASK-011 — Finalização transacional do Novo Teste

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** endpoint agregado para validar e criar modelo, peças, rota e ordem em uma transação, reutilizando os mesmos validadores/serviços dos cadastros individuais. Garantir idempotência para duplo clique/retry; geração de etiqueta ocorre depois do commit com falha recuperável.
- **Arquivos prováveis:** backend `routes/index.ts`, nova rota/controller/service, `admin.controller.ts`, `pecas.routes.ts`, `rotas.controller.ts`, `lotes.controller.ts`; banco tabelas do agregado e chave idempotente se aprovada em TASK-003; frontend nenhum nesta TASK.
- **Dependências:** TASK-006/007/009/010. **Paralelo:** não com TASK-012/013 se tocarem contrato central; nenhuma migration concorrente. **Risco:** crítico.
- **Aceite:** erro em qualquer subetapa não deixa modelo/peça/rota/OT parcial; retry não duplica; CRUD individual permanece. **Testes necessários:** falha injetada em cada passo, duplicidade, RBAC, etiqueta, concorrência, leitura pós-commit. **Rollback:** ocultar endpoint novo e conservar endpoints individuais; preservar agregados já finalizados.

#### TASK-012 — Corrigir construtor e preview da rota

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** estado por etapa com ID próprio, setor, posição, tempo e opções; preconfigurar os setores de corte a partir das peças; refletir Serigrafia/Telas e decisão Bordado/Apoio; confirmar persistência antes de sucesso visual.
- **Arquivos prováveis:** frontend `components/RouteBuilder.vue`, chamadas locais de API; backend apenas contrato fechado da TASK-009; banco leitura indireta da rota.
- **Dependências:** TASK-002/007/009. **Paralelo:** sim, com TASK-010 **após** contrato congelado, se arquivos não se cruzarem; não com TASK-013. **Risco:** alto.
- **Aceite:** tempo de uma etapa não altera outra; seis subsetores surgem conforme peças, sem recadastro; ordem/versão retornam corretamente; setor inválido gera erro visível. **Testes necessários:** múltiplas etapas iguais/diferentes, reordenação, save/reload, rota sem/com Serigrafia, cadastro individual. **Rollback:** reverter componente mantendo contrato backend compatível.

#### TASK-013 — Tornar o wizard reversível e persistir só ao finalizar

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** manter agregado temporário no frontend pelos quatro passos; avançar, voltar e editar sem chamadas de gravação; revisar tudo no passo 4 e finalizar no endpoint atômico. Tratar perda de sessão, retry e saída com rascunho local apenas se aprovado em contrato.
- **Arquivos prováveis:** frontend `views/WizardCriacaoTesteView.vue`, `components/RouteBuilder.vue` se integração exigir, serviço de API específico; backend endpoint TASK-011; banco somente no POST final.
- **Dependências:** TASK-004/006/011/012. **Paralelo:** não com TASK-004/006/012 ou qualquer edição do wizard. **Risco:** alto.
- **Aceite:** quatro passos navegáveis sem perda; nenhuma linha nova antes de Finalizar; finalização única; cadastros individuais intactos. **Testes necessários:** avançar/voltar/editar, sair sem finalizar, falha de API, retry, duplo clique, peças/setores/rota/ordem, regressão dos cadastros isolados. **Rollback:** reverter UI para fluxo anterior só em ambiente seguro; endpoint novo pode permanecer inativo, sem eliminar dados finalizados.

### FASE 4 — Execução operacional

#### TASK-014 — Fazer backend de bipagem executar rota da OT

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** resolver etapas a partir do snapshot da OT, validar setor/ordem de execução/bifurcação e criar `rastreamentos` associados à etapa concreta. Manter fallback explícito para ordens antigas e gates de checklist/inspeção.
- **Arquivos prováveis:** backend `controllers/rastreamentos.controller.ts`, `routes/rastreamentos.routes.ts`, serviços de fluxo, `entities/Rastreamento.ts`; banco `rastreamentos`, etapas da OT, migration nullable se necessária; frontend nenhum.
- **Dependências:** TASK-009/010. **Paralelo:** sim, com TASK-016 após contrato fechado; não com TASK-015 no mesmo contrato mutável. **Risco:** crítico.
- **Aceite:** setor fora da OT não bipável; Serigrafia/Telas e Apoio seguem snapshot; ordem antiga continua rastreável. **Testes necessários:** entrada/saída, crachá, permissões, rotas paralelas, retrabalho, checklist, inspeção, histórico. **Rollback:** leitura/execução legada com flag controlada, preservando novos rastreamentos.

#### TASK-015 — Construir tela de bipagem pela rota da ordem

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** carregar fluxo da OT escolhida e exibir somente seus setores/etapas, posição, status e ações permitidas; retirar sequência fixa do componente. Telas condicional por Serigrafia.
- **Arquivos prováveis:** frontend `views/BipagemView.vue`, componentes de setor/checklist, API de fluxo; backend endpoint de fluxo da OT da TASK-014; banco nenhum diretamente.
- **Dependências:** TASK-014. **Paralelo:** sim, com TASK-017 se contratos congelados e arquivos distintos; não com TASK-021 no mesmo componente. **Risco:** alto.
- **Aceite:** duas OTs com rotas diferentes mostram setores diferentes; troca de OT limpa estado antigo; bipagem permanece autorizada. **Testes necessários:** duas rotas exemplos, rota sem Serigrafia, setor repetido, mobile, crachá, permissão, checklist. **Rollback:** reverter UI preservando endpoint compatível.

#### TASK-016 — Atualizar TV de rastreamento para rota da OT

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** usar snapshot da OT e progresso real na visualização da TV, com fallback para histórico; impedir que edição da rota do modelo altere a TV de uma OT antiga.
- **Arquivos prováveis:** frontend `views/RastreamentoOrdemView.vue`; backend leitura da OT/fluxo já definida; banco nenhum diretamente.
- **Dependências:** TASK-010. **Paralelo:** sim, com TASK-014; não com alterações do endpoint de fluxo ainda não congelado. **Risco:** médio.
- **Aceite:** TV da OT permanece estável após edição da rota do modelo; status reflete bipagens. **Testes necessários:** OT nova e antiga, fluxo paralelo, Socket.IO, atualização/reload. **Rollback:** reverter UI com fallback anterior.

### FASE 5 — Monitoramento e horário

#### TASK-017 — Revisar dados e agregações da Torre

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** definir KPIs/status/filtros por planta e período com dados de OT, snapshot, bipagem, qualidade e ocorrências; revisar atualização Socket.IO e consulta N+1/índices. Distinguir Torre gerencial da TV.
- **Arquivos prováveis:** backend `controllers/dashboard.controller.ts`, `routes/dashboard.routes.ts`, `services/websocket.service.ts`, índices/migration apenas se justificados; frontend contrato da Torre documentado.
- **Dependências:** TASK-010/014. **Paralelo:** sim, com TASK-015 ou TASK-016; nenhuma migration simultânea. **Risco:** alto.
- **Aceite:** KPIs reproduzíveis por SQL/contrato, filtros corretos, nenhum mock no endpoint, evento após mudanças de OT/execução. **Testes necessários:** comparação agregação/linhas, sem/com movimentação, planta, período, ordens antigas, carga. **Rollback:** consulta anterior com esquema preservado.

#### TASK-018 — Revisar interface da Torre de Controle

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** consumir contrato validado, estados de atualização/erro e filtros; ajustar tipografia, hierarquia, cards, tabelas, cores, densidade e responsividade.
- **Arquivos prováveis:** frontend `views/DashboardGerencialView.vue`, estilos/componentes locais; backend contrato TASK-017; banco nenhum.
- **Dependências:** TASK-017; TASK-016 para consistência de status se compartilhar contrato. **Paralelo:** sim, com TASK-021 se não tocarem componentes compartilhados. **Risco:** médio.
- **Aceite:** dados exibidos correspondem ao backend, indicadores têm legenda e escopo, tela legível em desktop/mobile. **Testes necessários:** dados vazios/reais, filtro, evento em tempo real, acessibilidade básica, comparação com TV. **Rollback:** reverter UI preservando API.

#### TASK-019 — Padronizar timestamps de backend e banco

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** medir timezone efetivo de Node/PostgreSQL e formatos retornados; padronizar novos instantes em UTC/ISO com offset, sem deslocar automaticamente históricos `timestamp without time zone`; plano separado para correção dos ambíguos.
- **Arquivos prováveis:** backend `config/database.ts`, entidades `OrdemTeste.ts` e timestamps relacionados, `lotes.controller.ts`, migration aditiva/transformação somente após auditoria; banco `ordens_teste`, `rastreamentos`.
- **Dependências:** TASK-001/010/011. **Paralelo:** não com outra migration ou alteração em `lotes.controller.ts`; pode ocorrer ao lado de TASK-018. **Risco:** alto/crítico para histórico.
- **Aceite:** instantes novos serializados de modo inequívoco; horários antigos não sofrem deslocamento cego. **Testes necessários:** zonas diferentes, horário de verão histórico, leitura de OT antiga, criação e serialização. **Rollback:** preservar coluna original/backup e formato legado durante transição.

#### TASK-020 — Corrigir exibição e edição de horários no frontend

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** converter UTC apenas na apresentação e converter `datetime-local` com timezone explícito ao enviar; substituir `toISOString().slice(0,16)` usado como hora local. Sem offsets numéricos fixos.
- **Arquivos prováveis:** frontend `views/GestaoOrdensView.vue`, wizard e Torre se consumidores, helper de datas específico; backend contrato TASK-019; banco nenhum.
- **Dependências:** TASK-019/013/018 para evitar edição simultânea das telas. **Paralelo:** sim, com TASK-022 se nenhum arquivo comum. **Risco:** médio/alto.
- **Aceite:** criação/visualização coerentes em duas zonas; OT antiga permanece como valor histórico interpretado conforme decisão. **Testes necessários:** Bahia, UTC, outra zona, virada de dia, editar prazo, exportações/etiquetas se mostram datas. **Rollback:** reverter conversor frontend mantendo contrato backend compatível.

### FASE 6 — Contratos auxiliares e aceitação

#### TASK-021 — Corrigir contratos de anexos ativos

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** alinhar `foto`/`file` em ocorrência e criar ou corrigir endpoint de anexo de inspeção apenas após mapear autorização e armazenamento atuais.
- **Arquivos prováveis:** frontend `BipagemView.vue`, `InspecaoQualidadeView.vue`; backend `ocorrencias.routes.ts`, `inspecoes.routes.ts`, controllers e armazenamento de anexos; banco `anexos` se contrato exigir.
- **Dependências:** TASK-015 para evitar conflito na bipagem; TASK-001 para inventário. **Paralelo:** com TASK-018 após arquivos isolados. **Risco:** médio.
- **Aceite:** upload, leitura e permissões de anexo funcionam para ocorrência/inspeção; legado intacto. **Testes necessários:** tipos/tamanho, permissão, falha de upload, visualização histórica. **Rollback:** manter leitura de ambos os nomes de campo durante transição.

#### TASK-022 — Auditar exposição de Corte/Apoio e mocks

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** verificar consumidores reais de `/corte` e `/apoio`, dados simulados e efeitos na nova rota. Se for necessária implementação, criar TASK específica com contrato/migração e dependências; não expandir esta TASK silenciosamente.
- **Arquivos prováveis:** backend `corte.controller.ts`, `apoio.controller.ts`, routes e entidades; frontend consumidores encontrados; banco `etapas_corte`, `etapas_apoio` (leitura).
- **Dependências:** TASK-002/014/017. **Paralelo:** sim, com TASK-020. **Risco:** baixo na auditoria; impacto potencial alto.
- **Aceite:** inventário de mocks/consumidores e decisão documentada com novas TASKs se necessário. **Testes necessários:** leitura dos contratos e navegação das telas expostas. **Rollback:** nenhum dado alterado.

#### TASK-023 — Aceitação integrada e regressão final

**Status:** [x] Não iniciado · [ ] Em andamento · [ ] Em revisão · [ ] Concluído · [ ] Bloqueado

**Responsável:** Não definido · **Branch:** — · **Commit:** — · **PR:** — · **Revisor/aprovação:** — · **Merge:** — · **Arquivos alterados:** —

- **Objetivo:** percorrer modelo→peças→rota→OT→bipagem→Torre em banco de teste com casos novos e históricos; fechar checklist protegido, contrato e rollback operacional. Registrar pendências como TASKs novas.
- **Arquivos prováveis:** documentação, fixtures e testes específicos; código somente para defeito novo registrado em outra TASK; banco de teste.
- **Dependências:** TASK-004 a TASK-022 concluídas/integradas ou exceção documentada. **Paralelo:** não com mudanças de contrato. **Risco:** alto.
- **Aceite:** critérios do pedido original rastreados como aprovados, falhos ou bloqueados com evidência; nenhum dado histórico perdido. **Testes necessários:** matriz da seção 13. **Rollback:** reverter release por versão compatível e migrations aditivas preservadas.

## 7. Ordem obrigatória das dependências

```text
Modelo → Peças → Rota do modelo/versionada → Ordem + snapshot
                                              → Bipagem/checklist/qualidade
                                              → Torre de Controle e TV
```

| Gate | Tarefas que liberam | Tarefas bloqueadas até integrar o gate |
|---|---|---|
| Evidência de dados/erro | TASK-001 | TASK-002/003/006/007/008/009/010/019 |
| Decisão operacional e contrato | TASK-002 + TASK-003 | TASK-007/008 e regra Bordado/Apoio; TASK-009/010/011/012/014 |
| Peça e rota persistente | TASK-007 + TASK-008 + TASK-009 | TASK-010/011/012 e consumidores posteriores |
| Ordem com snapshot | TASK-010 | TASK-011/014/016/017/019 |
| Finalização e construtor | TASK-004 + TASK-006 + TASK-011 + TASK-012 | TASK-013 |
| Execução operacional | TASK-014 | TASK-015/017/022 |
| Torre confiável | TASK-017 + TASK-016 | TASK-018 |
| Horário padronizado | TASK-019 + TASK-013 + TASK-018 | TASK-020 |
| Integração completa | TASK-004…TASK-022 | TASK-023 |

`TASK-004` e `TASK-005` são isoláveis desde o início. Dependência significa **TASK concluída, commit integrado na branch base e contrato conferido**, não só código local. Uma nova necessidade de schema ou contrato reabre o gate correspondente, em vez de fazer alterações fora da TASK.

## 8. Tarefas que podem ser executadas em paralelo

### Trabalho paralelo

| Janela segura | Desenvolvedor A | Desenvolvedor B | Condição |
|---|---|---|---|
| Início | TASK-001 (auditoria read-only) | TASK-005 (sidebar/layout) | Não editar `DashboardView.vue` na auditoria; plano atualizado por uma pessoa por vez |
| Após TASK-001 | TASK-002/003 (decisões/contratos) | TASK-004 (autocomplete) | TASK-004 não editar o contrato estrutural de peças nem TASK-013 iniciar |
| Após TASK-009, contrato congelado | TASK-010 (backend/schema OT) | TASK-012 (RouteBuilder frontend) | Sem edição simultânea de endpoint/tipo compartilhado; integrar TASK-010 antes de validar OT |
| Após TASK-010 | TASK-014 (bipagem backend) | TASK-016 (TV frontend) | Contrato de fluxo estável; nenhum arquivo comum |
| Após TASK-014 | TASK-017 (Torre backend) | TASK-015 (bipagem frontend) | Snapshot/fluxo integrado; migrations sob posse exclusiva |
| Após TASK-017 | TASK-019 (datas backend/banco) | TASK-018 (Torre frontend) | Nenhum service/migration compartilhado; backend da Torre já integrado |

**Nunca executar simultaneamente:** duas migrations; alterações em `admin.controller.ts`, `lotes.controller.ts`, `rotas.controller.ts` ou `rastreamentos.controller.ts` pela dupla; TASK-004/006/013 em `WizardCriacaoTesteView.vue`; TASK-012/013 em `RouteBuilder.vue`; TASK-015/021 em `BipagemView.vue`. A divisão é sugestão de posse por janela, não autorização para começar implementação agora.

## 9. Controle de arquivos compartilhados

**Regra:** “NÃO ALTERAR EM PARALELO” significa uma branch/pessoa com posse no período. A TASK autorizada toma posse ao registrar responsável e branch. Arquivos protegidos fora da lista da TASK exigem registrar justificativa e revisar dependências no plano antes da edição.

| Arquivo ou conjunto | Módulo | Tarefa(s) | Responsável | Pode alterar simultaneamente? |
|---|---|---|---|---|
| `IMPLEMENTATION_PLAN.md` | Coordenação | Todas, updates seriais | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/migrations/*`, entidades novas | Banco | 006/007/008/010/014/017/019 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/entities/{Modelo,Peca,RotaModelo,OrdemTeste,Rastreamento}.ts` | Domínio | 006–010/014/019 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/controllers/admin.controller.ts` | Modelos/peças | 006/007/011 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/controllers/rotas.controller.ts` | Rota | 009/011 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/controllers/lotes.controller.ts` | Ordem | 009/010/011/019 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/controllers/rastreamentos.controller.ts` | Operação | 014 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/controllers/dashboard.controller.ts` | Torre | 017 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/routes/{index,pecas,rotas,lotes,rastreamentos}.ts` | API | 004/007/009/011/014 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/config/database.ts` | Banco | 001 leitura; 019 se preciso | Não definido | **NÃO ALTERAR EM PARALELO** |
| `frontend/src/views/WizardCriacaoTesteView.vue` | Wizard | 004/006/007/013 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `frontend/src/components/RouteBuilder.vue` | Rota | 012/013 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `frontend/src/views/BipagemView.vue` | Operação | 015/021 | Não definido | **NÃO ALTERAR EM PARALELO** |
| `frontend/src/views/DashboardGerencialView.vue` | Torre | 018/020 se data | Não definido | **NÃO ALTERAR EM PARALELO** |
| `frontend/src/views/{GestaoOrdens,RastreamentoOrdem,DashboardView}.vue` | Ordem/TV/layout | 005/016/020 conforme arquivo | Não definido | **NÃO ALTERAR EM PARALELO** |
| `frontend/src/api/{axios,auth.store}.ts`, `frontend/src/router/index.ts` | HTTP/sessão/rotas | Só TASK explicitamente relacionada | Não definido | **NÃO ALTERAR EM PARALELO** |
| `backend/src/services/{auth,rbac,websocket}.service.ts` | Infraestrutura | 017 apenas websocket, demais protegidos | Não definido | **NÃO ALTERAR EM PARALELO** |

**Partes protegidas sem TASK específica:** autenticação JWT, tabelas/permissões RBAC, emissão de etiquetas, dossiê, exclusão de dados antigos e endpoints de cadastro individuais. Só tocá-las quando um teste demonstrar dependência e a alteração estiver registrada na TASK ou em nova TASK.

## 10. Estratégia de Git

O procedimento de [`docs/GIT.md`](docs/GIT.md) prevalece para Git. Cada entrega deve ser **uma funcionalidade pequena e revisável**, em branch nova criada a partir da `main` atualizada. Se uma TASK do plano ficar grande para um PR, dividi-la em subentregas com IDs próprios, contratos e critérios de aceite, antes de implementar.

1. Antes de iniciar: `git switch main`, `git pull`, verificar `git status` e criar branch específica, por exemplo `feature/task-010-order-snapshot` ou `fix/task-004-piece-autocomplete`. Worktrees separados podem isolar o trabalho das duas pessoas.
2. Registrar no plano responsável, branch, arquivos reservados e dependências. Congelar o contrato da seção 12 antes de trabalhos paralelos em frontend/backend.
3. Durante o trabalho, manter commits pequenos e objetivos, restritos à subentrega; usar o ID da TASK na mensagem. Verificar atualizações remotas com `git fetch origin` e `git log HEAD..origin/main --oneline`.
4. Quando a `main` avançar, atualizar a branch com `git rebase origin/main`; antes do PR, fazer novo `fetch`/`rebase`, resolver conflitos manualmente e executar testes/regressões. Se a branch publicada precisar de push após rebase, usar somente `git push --force-with-lease` nela; nunca force push na `main`.
5. Fazer push e abrir **um Pull Request por funcionalidade pequena**. O **outro desenvolvedor deve revisar e aprovar** o PR. Não fazer merge sem essa aprovação. Registrar link do PR, revisor, aprovação e hash do merge no plano. Mudanças em arquivos críticos exigem atenção especial à compatibilidade.
6. Depois do merge, atualizar a `main` local e verificar `origin/main` nas branches ainda abertas. A próxima TASK dependente só começa depois que o PR anterior estiver aprovado e integrado na `main`.
7. Se duas pessoas precisarem do mesmo arquivo, a segunda espera a integração ou divide o trabalho em PRs sequenciais. Não resolver conflito de migration ou regra de negócio por escolha automática.

## 11. Banco de dados

**Estado confirmado apenas no código:** TypeORM com migrations e `synchronize: false`, schema `erp_modelagem`. Estrutura alvo abaixo é **proposta**, depende do inventário TASK-001 e do contrato TASK-003. Verificar SELECTs de cardinalidade, FKs reais, índices, duplicatas, registros órfãos, OTs em andamento e uso de colunas antes de qualquer DDL. Fazer backup/snapshot e ensaio em cópia antes de produção.

| Tabela atual | Alteração proposta e motivo | Impacto/compatibilidade | Migration/rollback |
|---|---|---|---|
| `modelos.codigo_produto` (`varchar`) | Validar dígitos no serviço; adicionar `CHECK (codigo_produto ~ '^[0-9]+$')` quando histórico conforme | Zeros à esquerda preservados; códigos antigos inválidos exigem saneamento explícito, sem conversão automática | Migration aditiva após inventário; rollback remove apenas constraint nova |
| `modelos.temporada` | Parar de escrever/mostrar em formulários; manter coluna inicialmente | Valores históricos continuam disponíveis; checar relatórios antes de eventual descontinuação | Nenhuma remoção nesta demanda; eventual drop é outra TASK com migração/rollback próprios |
| `pecas` | `catalogo_peca_id` nullable com FK/índice, se identidade não existir em outra coluna; preservar `setor_corte_opcao_id` | Peças legadas sem correspondência permanecem com nome e setor; backfill só em pares inequívocos | Adicionar FK/índice, leitura dual; rollback de aplicação sem apagar coluna preenchida |
| `config_opcoes`/`setores` | Mapear explicitamente subsetor de corte a setor da rota por ID/configuração existente; nova FK/mapeamento só se não houver conceito equivalente | Checar planta e opções em uso; evitar renomear opções históricas | Migration aditiva e backfill auditado; rollback da leitura mantendo mapeamento |
| `rota_modelo` | Preservar como legado; criar estrutura de versões/etapas ou estendê-la sem romper leitores | Cada etapa precisa ID, posição, tempo/SLA, tipo, condição/grupo; uma rota ativa por modelo/planta conforme TASK-002 | Migrations aditivas, backfill versionado, comparação linha a linha; rollback por leitor legado, sem drop de histórico |
| `ordens_teste` | Associar versão da rota e snapshot imutável em tabela própria; conservar `slas_por_setor` JSONB e `possui_caixa_teste` até semântica confirmada | OTs existentes não recebem snapshot fictício; fallback explícito/relatório de lacunas | Adição nullable, criação só para OTs novas; rollback do aplicativo sem apagar snapshots |
| `rastreamentos` | Opcional `ordem_rota_etapa_id` nullable apontando etapa da OT | Bipagens antigas mantêm setor e timestamps; backfill somente correspondência unívoca | Migration aditiva; rollback mantém coluna/dados até consumidores removidos |
| `ordens_teste` e datas relacionadas | Definir instantes novos com offset/UTC e considerar coluna nova ou migração assistida se `timestamp` atual for ambíguo | Não aplicar `AT TIME ZONE` em massa sem conhecer fuso de origem por período/ambiente | Backup + amostra + migration reversível; manter valor original para reconciliação |
| `ocorrencias_producao`, `inspecoes`, `anexos`, `checklists`, `retrabalhos` | Sem DDL presumido; checar FKs/índices se TASK-017/021 justificar | Preservar gates e links históricos | Migration separada apenas com evidência, plano de rollback por índice/coluna aditiva |

**Transformação histórica:** registrar total antes/depois e linhas sem correspondência. Rotas antigas tornam-se versão legada sem reinterpretar sequência; OTs antigas usam rota legada por fallback sinalizado, pois não se conhece a rota no instante da criação. Não preencher snapshot histórico com rota atual como se fosse comprovadamente original. Não apagar ou renomear coluna/tabela existente nesta série de TASKs.

## 12. Contratos entre frontend e backend

**Propostas a congelar na TASK-003.** A forma exata dos campos atuais deve ser copiada dos handlers durante essa TASK; os exemplos abaixo indicam a diferença essencial e não substituem OpenAPI/DTO. Em todas as respostas novas, erros usam código estável + detalhes, e sucesso de gravação ocorre após commit.

| Endpoint / método | Request atual → novo | Response atual → nova | Compatibilidade / telas consumidoras |
|---|---|---|---|
| `POST /admin/modelos` | Marca/código/nome/`temporada` → marca/código só dígitos/nome; `temporada` ignorada/depreciada após período de transição | Modelo criado → mesmo formato, sem exigir temporada | Preservar CRUD individual; `GestaoModelosView`, wizard antigo até TASK-013 |
| `GET /catalogo-pecas` | Lista sem busca obrigatória → `?q=...&limit=...` opcional ou filtragem local com permissão corrigida | Lista → lista filtrada/paginada se aprovada, mantendo forma legada | `WizardCriacaoTesteView`, `CatalogoPecasView`; RBAC permite busca apenas aos perfis autorizados à seleção |
| `POST /pecas/modelo/:modeloId` | Peças com nome/opção de corte → acrescentar `catalogoPecaId` e opção por ID | Lista salva → lista com IDs/identidade | Cadastro individual e wizard antigo até TASK-013; sem perda de legado |
| `GET/PUT /rotas/:modeloId` | Array de setor/ordem/tipo/obrigatório; frontend envia `slasPorSetor` ignorado → etapas com ID/posição/tempo/condição/versão | Lista/“salvo” → versão e etapas persistidas confirmadas | `RouteBuilder`, Gestão de Ordens; GET aceita rota antiga, PUT antigo durante transição |
| `POST /ordens-teste` | Modelo/planta/prazo/`possuiCaixaTeste`/SLAs → mantém campos legítimos; bifurcação deriva da rota | OT criada → OT com `rotaVersaoId` e resumo do snapshot | Gestão de Ordens e wizard antigo; rejeitar rota ausente com erro comprovável |
| **Proposto** `POST /novos-testes/finalizar` | Inexistente → `{idempotencyKey, modelo, pecas, rota, ordem}` | Inexistente → `{modeloId, ordemId, rotaVersaoId, etapas}` após commit | Só wizard novo; cadastros individuais continuam nos endpoints próprios |
| **Proposto** `GET /ordens-teste/:id/fluxo` | Inexistente; leitores pegam `modelo.rotas` → ID da OT | Inexistente → etapas do snapshot, status de execução e sinalizador de legado | Bipagem, TV, Torre se necessário; fallback de OT antiga explicitado |
| `POST /rastreamentos/bipar-entrada` e `/bipar-saida` | OT/setor/crachá/tipo → OT + identificador de etapa quando ambíguo | Rastreamento → rastreamento com etapa/status | `BipagemView`; payload legado aceito se etapa puder ser inferida sem ambiguidade |
| `GET /dashboard/kpis` | Filtros atuais → planta/período/status com semântica documentada | KPIs atuais → KPIs com escopo, atualização e contagens da execução | `DashboardGerencialView`; contrato versionado ou campos aditivos |
| Datas de OT em todos os endpoints | `datetime-local`/ISO ambíguo → ISO 8601 com offset no request | `timestamp` sem offset → ISO 8601 UTC para registros novos | `GestaoOrdensView`, wizard, Torre, TV; históricos tratados por estratégia TASK-019 |

**Protocolo de mudança:** backend e frontend não mudam contrato em silêncio. Registrar JSON real de request/response, status HTTP, validação, permissão, versão e consumidores antes de cada PR. Campos novos são aditivos na fase de convivência; remoção de campo requer confirmação de zero consumidores e TASK separada.

## 13. Testes de regressão

Nenhum teste ou build foi executado durante a criação deste plano. O repositório não tem lint configurado; `backend npm test` é placeholder, e o build do frontend faz checagem de tipos e bundle. Na implementação, criar testes automatizados relevantes para serviços/transações/contratos alterados e registrar comandos/resultados reais. Se um script não existir, marcar **N/A com motivo**, não “aprovado”. Ensaiar migrations em cópia dos dados.

| Ao concluir | Testar alteração | Regressão cruzada obrigatória |
|---|---|---|
| TASK-004/005/006 | Busca, sidebar, código/Temporada | Cadastro individual, login, perfis, navegação desktop/mobile, wizard não finalizado |
| TASK-007/008/009 | Peça↔catálogo/subsetor e save/read da rota | Modelo/peça individual, rota antiga, criar OT com rota, OT antiga, duas plantas, tempo de cada etapa |
| TASK-010/011 | Snapshot e finalização atômica | CRUD individual, falha no passo 1/2/3/4, duplicidade/retry, rota editada após OT, etiqueta, auditoria |
| TASK-012/013 | Construtor e wizard | Quatro passos avançar/voltar, saída antes de finalizar sem escrita, setores de corte, Serigrafia/Telas, criar OT, cadastro isolado |
| TASK-014/015/016 | Backend/UI bipagem e TV | OT sem/com Serigrafia, rota com Bordado, setor repetido, caixa de teste, crachá, RBAC, checklist, inspeção, retrabalho, OT antiga |
| TASK-017/018 | Agregações e UX da Torre | Comparar KPIs com SQL, planta/período, evento Socket.IO, ocorrências, qualidade, filtros, carga, responsividade, TV |
| TASK-019/020 | Datas | Persistir/ler em UTC, exibir em Bahia e outro fuso, virada de dia, prazos, OT antiga, etiqueta/exportação se consumir data |
| TASK-021/022 | Anexos e mocks | Permissões, upload/leitura, falha, vínculo com OT/inspeção, ausência de dados fictícios em tela ativa |
| TASK-023 | Jornada completa | Checklist da seção 4 e critérios do pedido, OTs novas/históricas, dados íntegros e contratos versionados |

Para cada falha, registrar reprodução, causa, TASK responsável e resultado após correção. Não “corrigir junto” fora da TASK autorizada. Critério de regressão inclui verificar ausência de escrita quando o wizard é abandonado e preservação de ordens antigas após alteração da rota do modelo.

## 14. Checklist antes de iniciar uma tarefa

- [ ] Reler a TASK e as decisões registradas neste plano.
- [ ] Entender problema e hipótese, diferenciando causa confirmada de investigação.
- [ ] Identificar arquivos e tabelas envolvidos; verificar dados existentes se houver banco.
- [ ] Verificar dependências concluídas/integradas e contrato da seção 12.
- [ ] Conferir funcionalidades protegidas e riscos de regressão.
- [ ] Confirmar que outra pessoa não altera os mesmos arquivos centrais, service ou migration.
- [ ] Criar branch/worktree específica a partir da base atualizada.
- [ ] Confirmar `git fetch origin` e que a branch partiu da `main` atualizada, conforme `docs/GIT.md`.
- [ ] Registrar `Status: Em andamento`, responsável e branch no plano, sob posse exclusiva do arquivo.
- [ ] Definir testes e estratégia de rollback apropriados à TASK.

## 15. Checklist antes de concluir uma tarefa

- [ ] Implementação limitada à TASK, sem refatoração incidental.
- [ ] Lint executado se houver script; se não houver, registrar N/A e motivo.
- [ ] Build frontend/backend afetados executado.
- [ ] Testes automatizados relacionados executados; testes novos incluídos quando aplicável.
- [ ] Fluxo principal e regressões da seção 13 verificados em ambiente adequado.
- [ ] Banco validado, com contagens/integridade e ensaio de rollback quando aplicável.
- [ ] Request/response, permissão e consumidores da API validados.
- [ ] Dados antigos, OT em andamento e módulos protegidos verificados.
- [ ] `IMPLEMENTATION_PLAN.md` atualizado: decisão, status, responsável, branch, arquivos, resultados, rollback e commit.
- [ ] Diff revisado; commit único ou pequena série com `TASK-XXX`; PR/revisão e integração antes da sucessora.
- [ ] Branch sincronizada com `origin/main`; Pull Request aberto, revisado e **aprovado pelo outro desenvolvedor antes do merge**.

## 16. Regra de atualização contínua do plano

Ao iniciar: `Status: Em andamento`, `Responsável: nome/dev`, `Branch: nome-da-branch`, data e arquivos reservados. Ao concluir: `Status: Concluído`, `Commit: hash`, `PR: link`, `Revisor: nome`, `Aprovação: data`, `Merge: hash`, arquivos alterados, testes executados/resultados, migração/rollback realizados e evidência de aceite. Enquanto o PR aguarda aprovação, registrar `Status: Em revisão`; só marcar `Concluído` após o merge na `main`. Ao bloquear: `Status: Bloqueado`, motivo, dado ou decisão faltante, impacto nas sucessoras. Apenas uma pessoa edita este arquivo por vez; a outra atualiza após a primeira integrar sua alteração.

Novo problema recebe um novo ID `ISS-XX` e nova `TASK-XXX`, com dependências, dono e risco, **antes** de alteração de código. Se a causa raiz mudar, atualizar diagnóstico, contrato, banco e testes afetados. Não apagar histórico de decisões; registrar data, decisão, evidência e consequência. Se uma TASK exceder os arquivos previstos, registrar extensão e colisões antes de prosseguir.

**Registro inicial de decisões pendentes**

| Decisão | Evidência necessária | Dono futuro | Estado |
|---|---|---|---|
| Causa real de `ROTA_NOT_FOUND` | PUT/GET/POST com ID, schema e contagem de linhas | TASK-001 | Em investigação |
| Bordado vs Apoio | Rotas/OTs/rastreamentos existentes e regra operacional | TASK-002 | Em investigação |
| Semântica de `possuiCaixaTeste` vs bifurcação | Código e uso histórico do campo | TASK-002 | Em investigação |
| Rota por planta/versão | `setores.planta_id`, modelos/OTs por planta, casos reais | TASK-001/002/003 | Em investigação |
| Timezone histórico | Tipo SQL, timezone do banco/Node, amostras de OT | TASK-001/019 | Em investigação |

## 17. Escopo funcional rastreado

| Demanda | Diagnóstico | TASK de implementação/decisão | Evidência de aceite |
|---|---|---|---|
| Novo Teste em quatro passos, só finalizar grava, voltar/avançar | ISS-02 | 011/013 | Banco vazio antes de finalizar; agregado completo depois |
| Cadastro individual preservado | ISS-02 | 006/007/009/011/013 | CRUD de modelo, peça, rota e OT fora do wizard |
| Código numérico e Temporada removida | ISS-03 | 006 | UI/API/DB coerentes; histórico preservado |
| Peças em Lectra, Atom, CN, Ponte, Laser e Couro | ISS-05 | 007/012 | IDs/opções persistidos e rota pré-configurada |
| Autocomplete ao digitar | ISS-04 | 004 | Sugestões sem perder foco, RBAC correto |
| Tempo independente por etapa | ISS-06 | 008/009/012 | Alterar uma etapa não altera outra, save/read iguais |
| Bordado/Apoio sem escolha arbitrária | ISS-08 | 002, depois 008/012/014 conforme decisão | Decisão operacional e impacto histórico documentados |
| Bifurcação única, Serigrafia e Apoio | ISS-07 | 002/003/008/010/014 | Derivação da rota/snapshot, sem recadastro na OT |
| Telas só com Serigrafia; Navalha/Almoxarifado preservados | ISS-07 | 010/012/014/015 | Conferência de duas rotas reais |
| Rota salva e recuperada para criação de OT | ISS-01 | 001/008/009 | PUT→GET→POST com IDs e SQL confirmados |
| Bipagem dinâmica pela rota da OT | ISS-09 | 010/014/015 | OTs diferentes exibem/executam setores diferentes |
| TV/ordens antigas estáveis após mudar rota modelo | ISS-09 | 010/016 | Snapshot ou fallback histórico explícito |
| Datas/horários corretos | ISS-10 | 001/019/020 | UTC persistido, apresentação local, legado sem deslocamento cego |
| Menu, breadcrumb, perfil/logout na sidebar | ISS-11 | 005 | Layout e RBAC em desktop/mobile |
| Torre real, integrada e legível | ISS-12 | 017/018 | KPI auditável, eventos e UX revisados |
| Contratos auxiliares de qualidade/Corte/Apoio | ISS-13 | 021/022 | Anexos ativos íntegros; mocks inventariados |
| Integração e fonte única de verdade | ISS-01…ISS-13 | 003/007…023 | Jornada integral + regressão da seção 13 |

## 18. Fonte única de verdade por regra

| Regra/dado | Autoridade proposta | Consumidores e proibição de duplicação |
|---|---|---|
| Marca, código, nome | `Modelo` + validação de domínio/backend + constraint compatível | Formulários só antecipam erros; não criam regra diferente |
| Identidade da peça e subsetor de Corte Automático | `Peca` vinculada ao catálogo e configuração por ID | Construtor deriva setores das peças; não reatribuir por texto |
| Sequência, setor, paralelismo, SLA, Serigrafia, Bordado/Apoio | Versão persistida da **Rota do Modelo** | Wizard e cadastro individual usam mesmo serviço; nenhuma condição manual duplicada na criação de OT |
| Rota executável de uma OT | **Snapshot da rota na Ordem** no instante da criação | Bipagem, conferência, TV e Torre consultam a OT; mudança futura no modelo não muda execução anterior |
| Bifurcação e Telas | Presença/condição de Serigrafia no snapshot; exceções operacionais documentadas | `possuiCaixaTeste` só permanece se representar conceito distinto; não usar como substituto silencioso de Serigrafia |
| Progresso e tempo realizado | `Rastreamento` associado à etapa da OT e registros de qualidade | Torre agrega fatos; UI não inventa status nem sequência fixa |
| Tempo estimado | Etapa versionada da rota, copiada ao snapshot da OT | Preview edita por ID de etapa; OT não reconfigura a mesma estimativa sem regra explícita |
| Tempo civil | Instantes UTC com offset inequívoco; apresentação no fuso do usuário | Sem offsets manuais; legado tratado como dado de origem ambígua até auditoria |
| Permissões | Middleware RBAC da API | Menu apenas esconde/mostra opções; nunca é autorização final |

**Compatibilidade:** a estrutura alvo é incremental. `rota_modelo`, `slas_por_setor`, `possui_caixa_teste` e `temporada` podem permanecer como legado enquanto houver consumidores/dados. Fonte única de verdade não significa apagar colunas antes de provar que não são necessárias.

## 19. Modo de execução e parada

Este documento é o resultado autorizado nesta rodada. **Parar após criar/revisar o plano; não iniciar nenhuma TASK automaticamente.** A primeira etapa recomendada é a **TASK-001**, para transformar hipóteses em evidência de banco/runtime e fixar a causa real de `ROTA_NOT_FOUND` antes de migrations. TASK-005 pode ser executada por outra pessoa em paralelo, seguindo a posse de arquivos; TASK-004 também é isolável, mas não deve coincidir com TASK-013 no wizard.

Quando houver pedido explícito `implemente TASK-XXX`: reler a TASK e dependências; verificar arquivos protegidos, branch e posse; sincronizar a `main`, criar branch nova; executar somente uma funcionalidade pequena; testar função e regressões; atualizar este plano; fazer commit com ID; abrir PR e aguardar a aprovação do outro desenvolvedor antes do merge. Após merge, atualizar a `main`, registrar a conclusão e **parar**, aguardando autorização da próxima TASK. Se uma dependência estiver pendente ou surgir decisão operacional sem resposta, registrar bloqueio e não improvisar implementação.

