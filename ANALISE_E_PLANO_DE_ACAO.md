# Análise do projeto e plano de ações corretivas

Data: 03/10/2026. Referência funcional: `plano_implementation.md` (v5.1), complementada por `plano_implementation_api.md`.

Branch analisada e deixada ativa: `feature/cartao-7.2-tv-rastreamento`.
Commit: `bbcf46d99971123b9906f97c0df7d922083d084e` — `fix(migrations): alinhar entidades ao schema do ERP`, de 29/09/2026.

**Onde estão as 72 tarefas:** na [seção 7 — Plano de execução por etapas](#7-plano-de-execução-por-etapas). Elas aparecem como caixas `- [ ]` numeradas de `0.01` a `5.10`: 11 na etapa 0, 12 na etapa 1, 15 na etapa 2, 12 na etapa 3, 12 na etapa 4 e 10 na etapa 5. Este arquivo se chama `ANALISE_E_PLANO_DE_ACAO.md`; `plano_implementation.md` é o plano original usado como referência e não contém esse checklist.

## 1. Diagnóstico executivo e ponto de partida

O projeto tem uma base considerável de telas, entidades e APIs reais, mas o ciclo de produção ainda não é confiável de ponta a ponta. A existência de uma tela, entidade ou resposta HTTP de sucesso não significa que a regra correspondente esteja implementada. Os maiores riscos estão na autorização administrativa, na identidade do operador, no avanço sem aprovação de qualidade e na impossibilidade de concluir corretamente o retrabalho.

**Por onde começar:** executar a etapa 0 e a etapa 1 da seção 7, depois implementar uma única trajetória operacional verificável: criação da OP → conferência inicial paralela → corte em uma máquina → inspeção → reprovação → retrabalho → reinspeção. Essa trajetória valida o núcleo do produto antes de expandir o restante do fluxo e os painéis.

Não recomendo iniciar pela reformulação visual, por funcionalidades de IA ou por uma reescrita geral. Preservar Vue, Express, TypeORM e PostgreSQL e extrair progressivamente as regras dos controllers permite aproveitar o investimento existente.

### Escopo e limites da evidência

- Revisão estática transversal do plano, rotas, controllers, serviços, entidades, migrations, seeds, autenticação, componentes e telas operacionais, dashboards e infraestrutura versionada.
- Foram encontrados 35 arquivos de entidades e 5 migrations. A comparação `main...HEAD` envolve 31 arquivos; a análise cobre também componentes anteriores à branch, não somente seu diff.
- A branch foi criada localmente a partir da referência `origin/feature/cartao-7.2-tv-rastreamento` já disponível. Não foi realizado `fetch`; este relatório identifica exatamente o commit analisado, sem afirmar que o remoto não recebeu commits posteriores.
- Os planos estavam **não rastreados**, presentes no diretório de trabalho enquanto a `main` estava ativa. Foram preservados na troca de branch, assim como o `package-lock.json` não rastreado da raiz.
- `npm run build` foi tentado em ambos os projetos: backend não encontrou `tsc`; frontend não encontrou `vue-tsc`. Não existem pastas `node_modules` nesses projetos. Portanto, **compilação não validada**, e não “build aprovado” nem “erro TypeScript comprovado”.
- Não foram executados migrations, seeds, scripts de limpeza, login real, envio de e-mail, chamadas ao banco, nem testes de navegador. O schema e os dados de um banco em execução **não foram inspecionados**. As conclusões de banco abaixo dizem respeito ao código e ao histórico de migrations versionado.
- Não foi identificada suíte automatizada integrada: `backend/package.json` tem teste que encerra com erro por definição; `frontend/test-agrupamento.js` apenas imprime um exemplo, sem asserções. Não há pipeline em `.github` versionado.
- Os itens descritos como **confirmados** são demonstráveis pela leitura do código. Cenários de concorrência, implantação e dados existentes precisam de reprodução em ambiente descartável. Não há alegação de teste de exploração ou de incidente ocorrido.

## 2. Plano versus estado atual

| Área do plano | Estado encontrado | Avaliação |
| --- | --- | --- |
| Infraestrutura e entidades, §§1–2 | 35 entidades, PostgreSQL/TypeORM, migrations e `synchronize: false` | Base implementada; integridade e instalação inicial precisam de correções |
| Autenticação e segurança, §10 | SSO, JWT, Helmet, CORS e limitadores presentes | Parcial: refresh fictício, bypass fora de produção, RBAC incompleto |
| RBAC dinâmico, §7 | Tabela, middleware e painel existem | Administração sem autorização específica; frontend usa outra fonte de permissões |
| Wizard e rotas, §5 | Quatro passos, peças, rota e criação da OP | Parcial: persistência fragmentada, SLA da rota descartado, falta de invariantes no servidor |
| Bipagem e conferência paralela, §§2.6 e 3.2 | Entrada, saída, histórico e handoff persistem dados | Regras de sequência, concorrência e checklist incompletas |
| Corte v5.1, §2.8 | Distribuição cria rastreamentos; entidades de fechamento existem | Dupla bipagem retorna dados fixos; avaliação por peça sem fluxo persistente |
| Apoio e laboratório interno, §2.7 | Entidade e endpoints existem | Endpoints de apoio são simulados; microfluxo não implementado |
| Checklist, §2.9 | Templates, catálogo, respostas e e-mail reais | IDs de catálogo/template incompatíveis; não há ciclo de correção de pendências |
| Inspeção e retrabalho, §2.10 | Inspeção, divergência e abertura de retrabalho transacionais | Gate ineficaz; reinspeção/retorno/conclusão incompletos |
| Reunião final, §2.11 | Entidade e enum de aprovação existem | Não foi encontrado comando/rota de veredito final |
| Ocorrências e fotos, §2.12 | Criação, resolução e upload de ocorrências reais | Falta escopo/autorização; relógios e timeline não refletem corretamente as pausas |
| Dossiê, §§2.13 e 4.8 | Geração de PDF e registro de status reais | Conteúdo e gatilho final incompletos; processamento sem retomada durável |
| KPIs, §6.1 | Quatro agrupamentos calculados e dashboard implementado | Fórmulas, período e população não cumprem integralmente o plano |
| Tickets por setor, §6.2 | Bipagem, gestão de ordens e TV possuem visualizações operacionais | Não foi encontrado módulo equivalente completo à fila com estados operacionais do corte/apoio |
| Catálogos, §6.3 | Consulta/criação de peças e importadores via seed | Faltam edição/inativação/importação na UI e gestão completa de itens de checklist |
| IA/Genkit, §4 | Configuração e dependências presentes | Não foram encontrados os flows de análise, sugestão, resumo e insights previstos |
| Docker, §11 | Compose com banco, Redis e backend | Referencia `backend/Dockerfile`, que não existe na branch |
| Swagger/API, §12 | Swagger e anotações de rotas presentes | Documentação diverge dos contratos e comportamentos executados |

## 3. Achados e ações por ponto

Prioridades: **P0** = impede confiar na autorização ou integridade operacional; **P1** = necessário para fluxo piloto completo; **P2** = consolidação funcional/operacional; **P3** = evolução após estabilização. Cada aceite abaixo deve virar um teste ou uma evidência de homologação da correção.

### A01 — P0 — Administração do RBAC acessível a qualquer usuário autenticado

**Confirmado.** `backend/src/routes/index.ts:37` exige JWT, mas `routes/admin.routes.ts:293` e `:340` não verificam `ADMINISTRAR_RBAC`. `controllers/admin.controller.ts:306` e `:363` gravam permissões e perfis sem autorização adicional. Um usuário local autenticado consegue chamar diretamente esses endpoints, independentemente do bloqueio visual do painel.

**Ação:** aplicar autorização no servidor para administrar perfis/permissões e separar permissões de leitura e alteração; auditar autor, alvo e mudanças. Cobrir também edição de rotas, modelos, peças, manutenção, retrabalho manual, resolução de ocorrências e dossiês, que atualmente dependem majoritariamente só de JWT.

**Aceite:** operador recebe 403 ao alterar seu perfil ou a matriz; administrador autorizado consegue alterar; nenhuma gravação ocorre após uma negativa. Referência: §§7 e 10.

### A02 — P0 — Liberação da produção sem veredito final

**Confirmado.** `controllers/lotes.controller.ts:227`–`253` aceita qualquer status do enum e `liberadoProducao` no PUT genérico. Não exige conclusão da rota, qualidade, laboratório ou `AprovacaoFinal`. A entidade `AprovacaoFinal` está registrada, mas não foi encontrado fluxo de gravação nos controllers/serviços.

**Ação:** restringir o PUT genérico; criar comandos de transição explícitos e veredito com autorização `REGISTRAR_VEREDICTO_FINAL`, justificativa e auditoria. Atualizar ordem, modelo e datas na mesma transação. Dossiê final deve depender desse resultado.

**Aceite:** tentar liberar uma OP sem requisitos resulta em erro de domínio; apenas o perfil permitido registra o resultado e a liberação coerente. Referência: §§2.11, 3.5 e 4.8.

### A03 — P0 — Falha do SSO vira login válido fora de produção

**Confirmado, condicionado ao ambiente.** `services/auth.service.ts:115` considera desenvolvimento qualquer `NODE_ENV` diferente de `production`, inclusive ausente. Todo erro do SSO, inclusive credenciais recusadas, retorna `isMockBypass`. No processamento a partir de `:188`, nome contendo `admin` determina perfil ADMIN para novo usuário. O caminho também permite representar usuários locais existentes sem validação da senha quando o SSO falha.

**Ação:** falhar de forma fechada em autenticação. Se necessário, usar provedor falso exclusivo de testes, explicitamente habilitado, sem ligação com dados reais; impedir inicialização desse modo em ambientes compartilhados. Remover o log integral da resposta do SSO em `:83`, que pode incluir o token retornado.

**Aceite:** SSO indisponível ou senha inválida nunca emite token operacional; ambiente de teste não concede perfil por substring do login. Referência: §10.2.

### A04 — P0 — Sessão e refresh não implementam o contrato prometido

**Confirmado.** `frontend/src/api/axios.ts:46`–`67` tenta novo login com senha fixa e usuário de fallback após 401. `controllers/auth.controller.ts:65` retorna token mock no refresh; logout só retorna mensagem. `auth.store.ts` limpa somente `erp_token`/`erp_user`, enquanto o interceptor também consulta `token`/`jwt_token`. Requisições 401 concorrentes podem limpar a sessão enquanto outra tenta renová-la.

**Ação:** definir o contrato real de renovação com o SSO; implementar refresh/expiração e revogação de acordo com esse contrato, uma fila de renovação no cliente e uma fonte única de sessão. Retirar credenciais fixas e limpar todas as chaves legadas. O middleware também precisa rejeitar usuário/perfil inativo, não apenas localizar o cadastro.

**Aceite:** expiração renova uma vez ou encerra a sessão; logout não deixa token reutilizado pelo cliente; conta desativada perde acesso. Referência: §10.2.

### A05 — P0 — Crachá não autoriza a ação nem garante autoria

**Confirmado.** `services/auth.service.ts:435` aceita UUID, usuário e e-mail como credencial, além do crachá; não recebe ação/setor. O modal envia apenas `codigoCredencial` (`ModalAuthQuiosque.vue:98`). Bipagem envia IDs do colaborador, mas entrada usa `req.user` e saída o sobrescreve com o usuário da sessão (`rastreamentos.controller.ts:112`, `:392`). Checklist e inspeção gravam `req.user.userId`; a inspetora passada para a função da UI nem integra o payload da inspeção.

O caminho alternativo que recebe `codigoCrachao` na bipagem consulta qualquer permissão do perfil no setor, sem filtrar a ação (`:162`, `:460`), ignora concessão global e não filtra `ativo`. O middleware anterior verifica a sessão, não o colaborador do crachá.

**Ação:** distinguir sessão do terminal e ator da operação; validar credencial real + atividade + planta + setor + ação no servidor. Vincular a autorização à operação, com validade curta e proteção contra repetição. Não confiar em `operadorId` arbitrário enviado pelo cliente.

**Aceite:** terminal autenticado como A e crachá B registram B; crachá sem permissão de inspeção não inspeciona; nome/e-mail/UUID não substituem crachá. Referência: §10.9.

### A06 — P0 — Falta de isolamento por planta e exposição de dados internos

**Confirmado no código.** O middleware injeta `plantaId`, mas consultas como `getLotes`, `getUsuarios`, `getOcorrencias`, KPIs e histórico não o usam como filtro. `websocket.service.ts:80` transmite globalmente com `io.emit`. `Usuario.senhaHash` e campos de credencial são selecionáveis normalmente; usuários e relações de operador são serializados inteiros em várias respostas.

**Ação:** estabelecer política de acesso entre plantas, inclusive exceção administrativa; aplicar escopo nas consultas e validar relações entre OP/setor/peça/estação. Usar DTOs com lista explícita de campos; excluir senha e credenciais de respostas comuns. Autorizar salas WebSocket por planta/contexto e conferir usuário local ativo no handshake.

**Aceite:** usuário da planta A não lê/altera OP da B nem recebe seus eventos; respostas operacionais não incluem hash ou códigos de crachá. A existência de plantas é prevista no plano; o alcance de visibilidade entre elas precisa ser formalizado.

### A07 — P0 — Gate de qualidade consulta aprovação, mas não bloqueia sua ausência

**Confirmado.** `controllers/rastreamentos.controller.ts:632`–`683` busca aprovação; se não encontrar, mantém `foundInspecaoId = null` e continua salvando `CONCLUIDO` em `:728`. Já `inspecoes.controller.ts:70` lista pendências apenas com `dataSaida IS NOT NULL`. Restaurar apenas o bloqueio criaria um impasse: a inspeção só apareceria depois da saída que passaria a exigir inspeção.

**Ação:** corrigir conjuntamente o gate e a fila. Definir “operação terminada/aguardando inspeção” separado de “transferência liberada”. Inspeção deve apontar para passagem/ciclo e peças, impedindo aprovação antiga de liberar uma passagem nova. No corte, conciliar a inspeção pós-recolhimento pela assistente com a transferência física prevista no plano.

**Aceite:** sem aprovação não há avanço liberado; a OP aparece para inspeção antes dessa liberação; uma reprovação posterior invalida aprovação anterior para o ciclo. Referência: §§2.6, 2.8 e 3.3.

### A08 — P0 — Retrabalho é aberto, mas não possui caminho de encerramento coerente

**Confirmado.** `inspecoes.controller.ts:236` cria destino `EM_RETRABALHO` com entrada preenchida. Nova entrada rejeita entrada existente; saída busca exclusivamente `EM_PROCESSO` (`rastreamentos.controller.ts:573`). Não foi encontrado comando que conclua o retrabalho, resolva a divergência e reabra a reinspeção. A fila de inspeção exclui toda combinação OP/setor/lote que já teve qualquer inspeção, até reprovada.

**Ação:** modelar ciclos/passagens de retrabalho com início, execução, término, retorno e reinspeção; permitir repetição legítima sem apagar o histórico. Não usar `status` fornecido pelo cliente para contornar retrocesso. Encerrar divergência somente conforme a regra de reinspeção.

**Aceite:** reprovar → retornar ao setor selecionado → refazer → reinspecionar → aprovar funciona duas vezes para a mesma peça sem duplicação indevida. Referência: §§2.10 e 3.

### A09 — P1 — Identidade da peça é perdida ou escolhida arbitrariamente

**Confirmado.** A inspeção aceita `pecaId`, mas não grava `InspecaoPeca`; só usa o campo na reprovação. Na ausência dele, escolhe a primeira peça do modelo (`inspecoes.controller.ts:183`). O retrabalho manual também pode sobrescrever a peça encontrada com a primeira do modelo. A busca do rastreamento ativo da reprovação não filtra `tipoLote` nem peça.

**Ação:** exigir seleção explícita de peça ou conjunto inspecionado, validar vínculo com a OP e persistir os resultados individuais. Incluir lote e ciclo em todas as consultas. Remover fallback para a primeira peça.

**Aceite:** reprovar a peça B da caixa teste nunca altera peça A nem o lote principal. Referência: §§2.10 e 2.8.

### A10 — P0 — Sequência e paralelismo não são garantidos pelo servidor

**Confirmado.** Entrada busca apenas um registro de rota com `ordem - 1` usando `findOne` (`rastreamentos.controller.ts:269`), em vez de todos os predecessores obrigatórios. Se houver salto de numeração e não existir ordem anterior, não bloqueia. Handoff valida irmãos em um caminho, mas isso não protege a entrada direta. O código contém exceção baseada em `ordem === 5`.

**Ação:** centralizar cálculo dos predecessores e junções paralelas; validar ordens contíguas ou representar dependências explicitamente. Usar a mesma regra na entrada manual, handoff e UI. Remover posição mágica e determinar regras por configuração/capacidade de etapa.

**Aceite:** A/B/C paralelos precisam cumprir a junção antes de D; concluir só um não libera D; setores flutuantes não mudam a regra; rota inválida é rejeitada no cadastro. Referência: §§3.2, 3.6 e 5.

### A11 — P1 — Caixa teste e bipagem apenas de saída divergem do modelo de fluxo

**Confirmado/decisão funcional pendente.** Caixa teste é proibida nos setores iniciais e máquinas por listas fixas; depois a entrada exige predecessor concluído do mesmo `tipoLote`, salvo exceção da ordem 5. Não há transição explícita de bifurcação. `possuiCaixaTeste` não é validado como pré-condição da bipagem. `bipagemApenasSaida` é salvo na rota, mas a saída sempre exige entrada prévia.

**Ação:** definir o ponto de nascimento da caixa teste e materializá-lo no servidor, sem depender de índices numéricos. Implementar regras de saída única para apoio e demais etapas configuradas. Acrescentar tamanho/quantidade da caixa onde o negócio exigir: o wizard e a entidade hoje persistem essencialmente o booleano.

**Aceite:** OP sem caixa não aceita CX; OP com caixa bifurca no ponto definido; caixa avança independentemente do lote; setor somente-saída não exige bip extra. Referência: §§2.5–2.7, 3.6 e 5.

### A12 — P0 — “Idempotência” apenas por consulta e ordenação por UUID

**Confirmado no desenho; ocorrência exige teste concorrente.** Entrada, saída e handoff fazem consulta seguida de gravação, sem proteção transacional conjunta nem unicidade operacional. Checklist consulta duplicidade antes da transação. `order: { id: 'DESC' }` é usado como “mais recente”, mas `Rastreamento.id` é UUID gerado e a migration usa `uuid_generate_v4()`: ordenar UUID v4 não é ordenar tempo.

**Ação:** definir chaves operacionais por OP/lote/peça/etapa/ciclo; usar transações, bloqueio ou atualização condicional, índices de unicidade compatíveis com `pecaId` nulo e chave de idempotência. Ordenar por data e critério determinístico. Publicar eventos após commit; não ocultar falha do handoff após gravar a saída.

**Aceite:** duas requisições simultâneas causam uma única transição; uma falha no handoff não deixa sucesso parcial sem recuperação; retrabalhos legítimos continuam possíveis.

### A13 — P1 — Saída sem peça pode selecionar rastreamento de uma peça

**Confirmado.** Entrada usa `pecaId: IsNull()` quando não informado; saída usa `{}` (`rastreamentos.controller.ts:561`, `:580`). Assim, uma saída de lote pode bloquear por peça já concluída ou fechar o registro ativo de uma peça arbitrária.

**Ação:** adotar identidade consistente do recurso em todas as operações, distinguindo lote e peça explicitamente; preferir comando por passagem identificada e conferida no servidor.

**Aceite:** existindo registros de lote e peças no mesmo setor, cada saída afeta exclusivamente o alvo solicitado.

### A14 — P1 — Corte v5.1 não foi concluído

**Confirmado.** `corte.controller.ts:102` devolve UUIDs fixos no bip; eficiência retorna números fixos. Distribuição grava somente `Rastreamento`, sem `EtapaCorte`/`EtapaCortePeca`. Não foi localizado endpoint persistente de revisão, fechamento individual, justificativa e retrabalho por NÃO OK.

**Ação:** substituir simulações por revisão e fechamento transacionais; carregar exatamente as peças destinadas à máquina, exigir todos os resultados, observação e destino para falhas e validar estação/setor. Disponibilizar anexos do fechamento. Evitar que bipagem genérica contorne esse fluxo.

**Aceite:** nenhum 201 sem persistência; revisão e fechamento têm autores corretos; peça faltante ou NÃO OK sem observação/destino bloqueia conclusão. Referência: §2.8.

### A15 — P1 — Microfluxo de apoio é simulado

**Confirmado.** Todos os métodos de `controllers/apoio.controller.ts` retornam objetos fixos sem repositórios. Não executam Corte → Chanfração/Etiqueta/Prensagem → Fuse/Frequência → laboratório → Recorte.

**Ação:** persistir etapas, dependências e resultado de laboratório; bloquear Recorte quando laboratório obrigatório não estiver aprovado; integrar retrabalho e saída única.

**Aceite:** estado consultado após reiniciar o serviço reflete os registros reais; falha de laboratório impede Recorte. Referência: §2.7.

### A16 — P1 — Checklist mistura IDs de catálogo com IDs de template

**Confirmado.** `BipagemView.vue:296` usa `query`, mas `checklists.controller.ts:230` espera `q`. A UI seleciona itens de `catalogo_itens_checklist` e os trata como `templateItemId` (`:427`–`447`); o backend relaciona esse campo a `checklist_template_itens`. UUID v7 do catálogo é rejeitado pelo regex v1–v5 da UI e vira texto avulso; se o ID passar pelo regex, pode falhar a FK por apontar à tabela errada. `catalogItemId` não é campo aceito/persistido pelo schema do controller.

**Ação:** separar IDs e vínculos de catálogo, template e resposta; escolher entre referência catalogada com snapshot ou geração versionada de template. Unificar validação de UUID, parâmetro de busca e resposta tipada; preservar origem e descrição histórica.

**Aceite:** pesquisar termo filtra resultados; item UUID v7 mantém vínculo correto; não há item de catálogo salvo como FK de template nem perda silenciosa de identidade.

### A17 — P1 — Checklist não assegura completude e pode bloquear correção para sempre

**Confirmado.** O controller aceita uma lista parcial, não verifica pertencimento de item ao template e assume `conforme = true` se omitido. Template inexistente pode criar template genérico com a primeira marca ativa. Qualquer checklist anterior da OP/setor gera 409, inclusive pendente; não existe revisão. No frontend o salvamento e a saída são requisições separadas; se a segunda falha, uma tentativa de salvar novamente encontra 409.

**Ação:** validar marca/modelo/setor, versão e itens obrigatórios; não criar estrutura implicitamente por ID inválido. Separar rascunho, submissão, correção e liberação, com histórico e retomada idempotente. Definir se ausência de checklist nos setores iniciais permite saída: hoje permite (`rastreamentos.controller.ts:604`).

**Aceite:** item obrigatório ausente não aprova; pendência corrigível sem exclusão de histórico; falha na saída permite retomá-la sem recriar checklist. Referência: §§2.6 e 2.9.

### A18 — P1 — Anexos de inspeção chamam endpoint inexistente e sucesso parcial é ocultado

**Confirmado.** `InspecaoQualidadeView.vue:461` chama `POST /inspecoes/:id/anexos`; `routes/inspecoes.routes.ts` não registra essa rota. O erro é capturado apenas com aviso no console. A tela cria várias inspeções com `Promise.all`: algumas podem persistir antes de outra falhar, sem comando atômico de inspeção agrupada.

**Ação:** implementar contrato de anexos com autorização e validação de proprietário; tratar upload falho visivelmente. Definir inspeção de conjunto atômica ou resposta com resultados individuais e retomada segura.

**Aceite:** foto reaparece após recarregar; falha de foto não é anunciada como sucesso completo; retentar grupo não duplica inspeções.

### A19 — P1 — SLA salvo não desconta pausas; sobreposição é somada duas vezes

**Confirmado.** `rastreamentos.controller.ts:725` grava `tempoPermanenciaMin = tempoTotalMin`, apesar do cálculo de pausa. Pausas sobrepostas são somadas individualmente em `:707`. O filtro por OP/setor pode aplicar ocorrência de outra peça/lote/ciclo quando há `rastreamentoId` distinto. Resolver ocorrência novamente também altera sua data final (`ocorrencias.controller.ts:136`).

**Ação:** definir tempo bruto, pausa e líquido separadamente; usar união dos intervalos intersectada com a passagem correta. Tornar resolução idempotente e validar a ligação ocorrência/OP/setor. Reutilizar o cálculo no backend e nos dados entregues às telas.

**Aceite:** em 60 minutos, pausas 10–30 e 20–40 descontam 30, não 40; líquido é 30; resolução repetida não altera duração; lote independente não herda pausa sem regra explícita. Referência: §6.1.

### A20 — P1 — KPIs não representam a definição funcional completa

**Confirmado.** `dashboard.controller.ts` soma permanências de setores, conta espera sem entrada por `createdAt`, seleciona uma lista incompleta de status ativos e inclui estados finais. FPY em `:223`–`270` conta todas as inspeções aprovadas sobre todas, sem primeira tentativa nem período de 30 dias. Retrabalho agrupa por nome do setor e não tem encerramentos confiáveis para tempo médio. Há consulta de ocorrências dentro do loop de rastreamentos.

**Ação:** fechar definições com o negócio antes de alterar SQL; calcular primeira passagem por identidade operacional e separar lead time decorrido de soma de esforço. Aplicar período/planta/marca, agrupar por IDs, agregar no banco e evitar N+1. Só homologar os indicadores depois de A07–A12 e A19.

**Aceite:** fixtures com paralelismo, reprovação seguida de aprovação, pausa e duas plantas produzem resultados previamente calculados e iguais na API e UI. Referência: §6.1; ver ambiguidades na seção 6.

### A21 — P1 — SLA do construtor de rota é descartado

**Confirmado.** `RouteBuilder.vue:520` envia `{ rota, slasPorSetor }`, mas `rotas.controller.ts:19` valida apenas `rota` e só a persiste. `RotaModelo` não tem SLA. No wizard há compensação parcial: o evento devolve os SLAs em memória e o passo 4 os grava na OP. Salvar a rota isoladamente não persiste os SLAs anunciados.

**Ação:** estabelecer SLA padrão versionado por etapa/modelo e snapshot/override por OP. Persistir e retornar explicitamente os valores; garantir ida e volta após reload.

**Aceite:** salvar rota, sair e reabrir mantém cada SLA; OP existente não muda por edição posterior do padrão sem operação autorizada.

### A22 — P1 — TV não recebe ocorrências e pode ficar desatualizada

**Confirmado.** `RastreamentoOrdemView.vue:255` carrega `/lotes` e espera `h.ocorrencias`, mas `getLotes` não carrega essas informações e a entidade de rastreamento não declara essa relação. O relógio calcula `agora - entrada`, sem pausa. A TV ouve os dois eventos emitidos por cada bip e recarrega tudo duas vezes (`:514`); não ouve `gargalo:update`. O evento `connect` apenas altera o indicador, sem recuperar alterações perdidas na desconexão.

**Ação:** criar leitura de rastreamento que entregue posição, pausa, ocorrências/anexos e SLA calculado; um evento de versão por transição com atualização agrupada; buscar snapshot após reconexão e integrar renovação do token do socket.

**Aceite:** abrir/resolver ocorrência atualiza a TV e o relógio; desconectar, movimentar OP e reconectar recupera estado sem F5; um bip não dispara duas recargas globais.

### A23 — P1 — Integridade de banco não acompanha as regras dos controllers

**Confirmado nas migrations.** `Peca` declara relação com `ConfigOpcao`, mas não há FK de `pecas.setor_corte_opcao_id` nas migrations versionadas. A coluna é NOT NULL, enquanto os endpoints de modelo/peças aceitam e enviam null. Regras de duplicidade de `codigoProduto`, permissão por perfil/setor/ação e checklist são verificadas na aplicação sem constraints correspondentes. Há só dois índices explícitos de otimização, distantes da lista do §9.

**Ação:** em banco descartável, comparar metadata com schema criado por todas as migrations. Projetar FK, unicidade e checks após auditar dados existentes, incluindo tratamento de NULL nas permissões globais. Adicionar índices das consultas críticas mediante `EXPLAIN`; não impor unicidade que impeça revisões/retrabalho.

**Aceite:** banco novo e clone atualizado têm schema esperado; referência inválida é rejeitada; concorrência não duplica chaves de negócio. Não se afirma que o banco real está sem FK: ele não foi consultado.

### A24 — P1 — Bootstrap não entrega uma fábrica operacional e schema é inconsistente

**Confirmado.** `database/seed.ts` cria plantas, marcas, opções, modelos e catálogos, mas não setores físicos, estações ou matriz de permissões. Os valores `Almoxarifado`/`Navalha`/`Telas` divergem dos valores em maiúsculas usados nos gates. `DB_SCHEMA` é configurável, mas a migration inicial, três entidades de engenharia e SQL de `getModelos` fixam `erp_modelagem`.

**Ação:** padronizar códigos estáveis separados dos rótulos; completar seed mínimo idempotente de setor/estação/perfil/permissão e usuário administrador por procedimento controlado. Adotar schema fixo documentado ou parametrização integral; criar novas migrations corretivas para ambientes já migrados.

**Aceite:** instalação vazia segue procedimento único e permite login autorizado, cadastro e primeira OP; segundo seed não duplica; comportamento dos gates coincide com os códigos do banco.

### A25 — P1 — SQL de fallback consulta coluna inexistente

**Confirmado contra o schema versionado.** `admin.controller.ts:102` usa `cat.valor`; `ConfigCategoria` e a migration definem `slug`, sem `valor`. As telas recorrem a esse endpoint quando `/config/opcoes/subsetor_corte` falha, portanto o fallback também pode falhar.

**Ação:** usar o contrato/campo correto e consolidar endpoints duplicados; diferenciar resposta vazia de erro de infraestrutura.

**Aceite:** consulta por categoria retorna as mesmas opções pelo caminho oficial; não existe fallback SQL inválido.

### A26 — P1 — Cadastro e manutenção podem deixar dados parciais ou alterar outra OP

**Confirmado.** `admin.controller.ts:210` salva modelo antes de salvar peças, sem transação conjunta. `routes/pecas.routes.ts:43` apaga as peças antes de inserir substitutas, também sem transação. A manutenção salva a ordem antes de percorrer as peças e busca cada peça apenas por ID (`lotes.controller.ts:423`), sem conferir se pertence ao modelo da OP. Auditoria pode falhar e ser apenas logada. Rota é substituída sem versão, alterando a interpretação do histórico das OPs existentes.

**Ação:** comandos transacionais por agregado, diff de peças com IDs preservados, vínculo obrigatório da peça à OP/modelo e versão/snapshot de rota. AuditLog obrigatório deve participar da transação; validar remanejamento contra passagens já iniciadas.

**Aceite:** erro na peça não deixa modelo incompleto ou lista apagada; peça de outra OP não muda; editar rota não reinterpreta um teste iniciado.

### A27 — P1 — Scripts de limpeza destroem grupos paralelos se executados

**Confirmado no algoritmo; scripts não executados nesta análise.** `backend/src/clean_rotas.ts` e `clean_rotas2.ts` renumeram cada linha com contador crescente. Etapas com mesma ordem passam a ter ordens distintas. O primeiro também remove setores de separação de todas as rotas encontradas.

**Ação:** retirar essas rotinas do fluxo operacional/build, substituindo-as por manutenção explícita, com escopo, modo de simulação, backup, transação e preservação dos grupos. Não executá-las sobre a base atual para “corrigir sequência”.

**Aceite:** nenhuma manutenção lineariza grupos paralelos; relatório de diferenças é revisado antes de qualquer migração de dados.

### A28 — P1 — Banco modela várias ordens por modelo, API impõe uma única para sempre

**Divergência confirmada; decisão de negócio pendente.** Plano §2.5 e entidades usam `ManyToOne`/`OneToMany`. `createLote` bloqueia qualquer ordem prévia do modelo, mesmo encerrada, alegando relação 1:1; `getModelos` oculta modelos já usados. Não há unicidade de `modelo_id` no banco para essa suposta regra.

**Ação:** decidir entre uma OP por modelo, uma ativa por versão/planta ou várias rodadas. Formalizar no plano e implementar restrição/versão apropriada, sem permitir que simples concorrência decida a regra.

**Aceite:** segundo teste, reteste e teste em outra planta têm comportamento explícito e consistente na UI, API e banco.

### A29 — P1 — RBAC tem duas fontes e rotas visuais por nomes fixos

**Confirmado.** API consulta `perfil_permissoes`; login devolve `Perfil.permissoes` JSON; `auth.store.ts` consulta esse JSON e nomes de perfil. Router verifica ADMIN/MODELISTA/GERENTE/SUPERVISOR_SETOR por texto, enquanto o plano prevê GERENTE_MODELAGEM e permissões dinâmicas. Alterar a matriz não atualiza automaticamente o JSON ou a sessão frontend.

**Ação:** escolher a matriz como fonte única; expor capacidades efetivas por contexto e usar as mesmas ações no cliente. Normalizar os nomes por migração de dados se necessário, sem substituir autorização por ocultação visual.

**Aceite:** concessão/revogação administrativa produz a mesma decisão na UI e API; perfil personalizado autorizado consegue acessar a função.

### A30 — P1 — Compose não constrói o backend e health não mede prontidão

**Confirmado no repositório.** `backend/docker-compose.yml` aponta para `Dockerfile`, target `runtime`, mas o arquivo não existe. `server.ts:58` responde HTTP 200 no health mesmo com banco desconectado, e inicia a escuta antes da conexão. Redis é provisionado, mas limitadores usam memória e não há adapter/store Redis implementado.

**Ação:** completar Dockerfile/ignore e procedimento de migrations, usuário de execução e dependências do navegador PDF. Separar liveness de readiness, com readiness 503 sem banco/schema pronto. Definir arquitetura de instância única inicialmente ou realmente conectar Redis quando necessário.

**Aceite:** build de imagem reproduzível; inicialização em ambiente descartável; readiness falha com banco indisponível; geração de PDF funciona no container. Referência: §11.

### A31 — P2 — Limitação de tráfego não combina com atualização da TV

**Risco derivado do código, não medido em carga.** São 200 requisições por IP a cada 15 minutos, antes da autenticação. Dez estações atrás do mesmo NAT podem compartilhar o limite. Cada bip emite dois eventos que fazem os painéis recarregar dados. PDFs de etiquetas não recebem o limitador pesado; todo acesso a dossiês, inclusive leitura/download, recebe o mesmo limite de 10/h.

**Ação:** eliminar recargas duplicadas, paginar/projetar leituras, desenhar limites por tipo de operação e identidade. Configurar proxy confiável quando existir; usar store compartilhado somente se a implantação exigir. Limitar credenciais de crachá e criação de PDFs adequadamente.

**Aceite:** simulação com as 10 estações e TV do plano não interrompe produção legítima; abuso de autenticação/PDF é limitado. Referências: contexto consolidado e §§10.4–11.

### A32 — P2 — Dossiê e e-mail são reais, mas incompletos e sem retomada durável

**Confirmado.** `dossie.service.ts:314` coleta rastreamentos, checklists, ocorrências e inspeções; não inclui aprovação final, resultados de peças, retrabalhos e imagens conforme o plano. Geração manual não exige aprovação e pode iniciar de novo enquanto GERANDO; tarefas executam em background no processo, sem fila recuperável. E-mail escolhe MODELISTA/GERENTE globalmente e tem destinatário fixo de fallback (`email.service.ts:244`).

**Ação:** compor dossiê a partir de snapshot aprovado, manter versão do PDF, fila/outbox com idempotência e retentativa; completar anexos, veredito e dados de retrabalho. Configurar destinatários por planta/setor e aplicar consolidação dos três checklists quando prevista. Desligar SMTP real em testes.

**Aceite:** reinício retoma trabalho pendente; pedido repetido não cria processamentos concorrentes; PDF contém evidências do ciclo final; e-mail não sai para destinatário fixo não configurado. Referência: §§4.1 e 4.8.

### A33 — P1 — Arquivos e renderização HTML precisam de fronteira de acesso

**Confirmado no código; impacto de execução não reproduzido.** `/uploads` é servido publicamente em `server.ts:70`, incluindo PDFs quando gravados nesse diretório. Serviços de etiquetas/dossiê interpolam textos em HTML sem escape; Puppeteer processa esse HTML. O endpoint de impressão aceita DTOs com validação apenas do array. Upload valida MIME declarado e usa caminho/limite fixos, apesar de variáveis de configuração previstas.

**Ação:** servir documentos/fotos privados por rota autorizada ou URL curta assinada; escapar texto e validar DTO/tamanho de lotes de impressão. Restringir scripts e carregamento de recursos externos no renderizador; validar conteúdo real dos arquivos e respeitar configuração de armazenamento. Não confundir o problema de interpolação com vulnerabilidade explorada: é uma superfície identificada para correção/teste.

**Aceite:** download sem autorização falha; texto como `<b>teste</b>` aparece como texto quando não há suporte a HTML; recursos arbitrários não são buscados pelo renderizador.

### A34 — P2/P3 — Funcionalidades previstas ainda ausentes ou simuladas

**Confirmado por inventário de rotas/consumidores.** `ConfiguracoesController` simula leitura/gravação. Catálogo permite listar/criar peças, mas não oferece a gestão completa prevista de edição, inativação e CSV. Não foi localizado módulo completo de tickets por setor com estados de revisão/fechamento, nem fluxo operacional de insights, sugestão de rota, resumo diário e análise de divergências; `config/genkit.ts` sozinho não implementa esses processos.

**Ação:** catalogar explicitamente os endpoints simulados e impedir sucesso fictício; entregar configurações/catálogos e tickets depois do núcleo operacional. IA deve ficar em etapa posterior, baseada em dados consistentes, com avaliação de resultados e sem decidir gates de qualidade no lugar das regras determinísticas.

**Aceite:** cada item marcado como entregue tem gravação/leitura real e cenário de negócio homologado. Referências: §§4, 6.2 e 6.3.

## 4. Quadro de conflitos frontend/API/banco

| Contrato | Frontend | Backend/banco | Ação |
| --- | --- | --- | --- |
| Renovação | Refaz login com senha fixa | Refresh retorna token mock | A04 |
| Ator RFID | Passa usuário validado pelo modal | Grava sessão ou valida permissão sem ação | A05 |
| Permissões | JSON `Perfil.permissoes` e nomes de perfil | Tabela `perfil_permissoes` | A29 |
| Inspeção | Seleciona OP depois da saída | Regra planejada exige aprovação antes da transferência | A07 |
| Evidência de inspeção | POST `/:id/anexos` | Rota ausente | A18 |
| Busca checklist | `query` | `q` | A16 |
| Item de checklist | ID do catálogo / UUID v7 | FK do template / campo de catálogo descartado | A16 |
| SLA da rota | Envia e mostra sucesso | Schema Zod não persiste o campo | A21 |
| Ocorrência na TV | Espera `rastreamento.ocorrencias` | `/lotes` não entrega o campo | A22 |
| Subsetor | Fallback `/admin/config-opcoes` | Consulta `cat.valor`, mas coluna é `slug` | A25 |
| Peças | Campos opcionais aceitos | Coluna de subsetor NOT NULL; FK ausente nas migrations | A23/A26 |
| Leitura de modelo | Gestão de ordens usa fallback `/admin/modelos/:id` | GET individual não registrado em `admin.routes.ts` | Consolidar com `/lotes/:id` ou criar endpoint tipado |

Evitar corrigir esses contratos adicionando sucessivos aliases e fallbacks. Definir DTOs e erros estáveis, alinhar OpenAPI e criar testes de contrato entre chamadas reais e endpoints. O Swagger atual promete bloqueio do gate e refresh que o código não entrega; o documento auxiliar de API termina truncado no header Authorization e deve ser completado.

## 5. Banco de dados: ordem segura para corrigir

1. Criar PostgreSQL descartável, executar todas as migrations e seeds com efeitos externos desabilitados. Registrar versões e resultado. Não usar `synchronize: true` como correção.
2. Comparar metadata de entidades e schema real. Examinar particularmente FK do subsetor, schemas fixos, nullability, enums e unicidade operacional.
3. Em cópia sanitizada dos dados, procurar duplicatas de rastreamento ativo, permissões globais, modelos/códigos, checklist e peças; referências inválidas e mistura de plantas; datas impossíveis; conclusões sem aprovação; retrabalhos abertos sem passagem válida.
4. Definir a semântica de ciclo e versão antes dos índices únicos. Uma unicidade simples por OP/setor destruiria a possibilidade legítima de retrabalho.
5. Corrigir dados por scripts revisáveis com contagens antes/depois e backup verificável. Depois aplicar migrations incrementais; não editar migration já aplicada esperando que execute novamente.
6. Adicionar índices prioritários de rastreamento por OP/setor/lote/ciclo, inspeção por passagem/resultado, checklist por OP/setor/versão, ocorrência por passagem/status, rota por modelo/versão/ordem e auditoria por entidade. Verificar planos de execução na carga representativa.
7. Ensaiar upgrade sobre cópia da base existente e restauração. A aprovação do schema não substitui homologação do fluxo.

## 6. Ambiguidades do próprio plano que precisam virar decisões

Estas são decisões a registrar antes de implementar o ponto correspondente, não motivo para adiar as correções P0 demonstradas.

| Decisão | Conflito encontrado | Direção recomendada para discussão |
| --- | --- | --- |
| Inspeção do corte | §2.6 exige gate na saída da máquina; contexto/§3.3 coloca primeira inspeção após recolhimento pela assistente | Distinguir conclusão de máquina, recolhimento e liberação de transferência; definir quem autoriza cada marco |
| Lead Time | §6.1 define tempo decorrido, mas SQL soma permanências, inclusive possíveis paralelos | Expor tempo decorrido e esforço acumulado como métricas distintas; definir tratamento de pausas de ramos paralelos |
| FPY | Texto exige primeira tentativa; SQL de exemplo conta todas as inspeções | Introduzir passagem/ciclo e escolher primeira inspeção por unidade mensurada |
| Modelo/OP | Plano e entidades permitem várias OPs; controller impõe 1:1 permanente | Definir retestes, versões e escopo por planta antes de criar constraint |
| Peça rastreável | Contexto fala em cada peça cortada; `Peca` representa componente do modelo e admite lote pós-corte | Definir se identifica componente, unidade física, par ou pacote; incluir quantidade/tamanho e serialização se necessários |
| Caixa teste | Plano prevê assincronismo e tamanho antecipado; código proíbe CX antes do pós-corte | Definir bifurcação, herança das conferências comuns e condições de liberação do lote principal |
| Checklist obrigatório | Texto exige validação, mas não define claramente ausência/rascunho/revisão | Fixar obrigatoriedade por etapa, como retomar pendências e quem concede liberação |
| Gerente/permissão | Plano usa GERENTE_MODELAGEM; código usa GERENTE | Definir papel funcional e uma ação de autorização independente do nome visível |
| Segurança/API | Plano principal prevê refresh, emissor/audiência e sessão; contrato legado ainda indicado como pendente | Obter contrato real do SSO e versionar adapter; não substituir por bypass |

## 7. Plano de execução por etapas

### Como acompanhar a execução

Cada tarefa possui um identificador no formato **etapa.ponto**, por exemplo `2.06`. Os códigos **A01–A34** apontam para o diagnóstico, as evidências e os critérios de aceite da seção 3. As caixas abaixo começam abertas: detalhar o plano não significa que as correções foram executadas.

- Executar os pontos na ordem apresentada, respeitando as dependências de cada etapa. Correções independentes de autorização e retirada de bypass podem começar assim que houver fixtures seguras, sem esperar todas as decisões funcionais.
- Para cada ponto iniciado, registrar responsável, status, branch/PR, decisão pendente e evidência de validação no quadro ao final desta seção.
- Se uma decisão funcional estiver pendente, marcar o ponto como bloqueado e registrar exatamente qual decisão falta; prosseguir nos pontos independentes.
- Só marcar `[x]` quando a implementação, a migration necessária, o contrato frontend/API e a validação do ponto estiverem concluídos. Não marcar uma etapa inteira como pronta por ter entregue somente a tela.
- Atualizar OpenAPI e testes de contrato junto de cada alteração da API. A etapa 4 faz a conferência final, não adia essa documentação.
- Antes de passar à próxima etapa, conferir seus entregáveis e critérios de saída. Quando um achado aparecer em mais de uma etapa, concluir todas as partes indicadas antes de encerrá-lo.

| Etapa | Resultado principal | Achados tratados |
| --- | --- | --- |
| 0 | Ambiente reproduzível, diagnóstico do schema e decisões registradas | A23, A24, A27, A28; preparação de A30/A34 |
| 1 | Autorização, sessão e identidade confiáveis | A01–A06, A29, A33; proteção inicial de A02/A26 |
| 2 | Trajetória piloto com qualidade e retrabalho | A07–A14, A16–A18, A21, A23, A25–A28 |
| 3 | Ciclo fabril completo e encerramento formal | A02, A11, A14, A15, A18, A32 |
| 4 | Indicadores, TV e implantação verificáveis | A19, A20, A22, A23, A30, A31; validação operacional de A33 |
| 5 | Requisitos restantes e organização do código | A34 e revisão final de todos os achados |

### Etapa 0 — Preparar o ambiente e registrar as decisões do núcleo

**Objetivo:** permitir que qualquer pessoa da equipe reproduza o projeto e saiba quais regras implementar.

**Responsáveis sugeridos:** backend/infra + responsável funcional. **Dependência:** nenhuma etapa anterior; migrations e seeds devem ser executados somente no ambiente descartável preparado para isso.

#### Pontos a executar, nesta ordem

- [ ] **0.01 — Registrar a base de trabalho.** Confirmar branch e commit de partida; inventariar arquivos locais; revisar os dois planos e este relatório antes de versioná-los. Preservar alterações existentes e não publicar arquivos locais por engano.
- [ ] **0.02 — Reproduzir a instalação.** Registrar versões de Node/npm e instalar dependências pelos lockfiles de `backend` e `frontend`. Documentar comandos e variáveis obrigatórias sem expor segredos. O lockfile solto da raiz não instala os dois projetos.
- [ ] **0.03 — Levantar o estado dos builds.** Executar os builds separadamente, registrar erros reais e corrigir os impedimentos. Distinguir falta de ferramenta, erro de ambiente e erro de código.
- [ ] **0.04 — Isolar integrações externas.** Configurar banco descartável, SSO de teste e SMTP de teste/desabilitado. Garantir que o ambiente de validação não envie e-mails nem altere dados reais.
- [ ] **0.05 — Validar o schema inicial — A23/A24.** Executar as cinco migrations na base vazia, comparar o resultado com as entidades e listar divergências de FK, nullability, enums e schema. Escolher e documentar schema fixo ou parametrização integral.
- [ ] **0.06 — Completar os dados mínimos — A24.** Padronizar códigos de setores separados dos rótulos; criar seed idempotente de plantas, setores, estações, perfis e permissões. Preparar administrador de teste por procedimento explícito.
- [ ] **0.07 — Registrar as decisões de negócio — A28 e seção 6.** Definir unidade rastreável, OP/reteste, passagem/ciclo, sequência e paralelismo, marcos da inspeção, obrigatoriedade/revisão de checklist e nascimento da caixa teste. Registrar responsável e decisão para cada tema; não decidir silenciosamente no código.
- [ ] **0.08 — Preparar dados de homologação.** Criar fixtures com duas plantas, terminal e operadores distintos, perfis permitidos/negados, duas peças, três setores paralelos, máquina de corte e qualidade. Incluir OP com caixa teste e OP sem caixa teste.
- [ ] **0.09 — Impedir limpeza indevida — A27.** Documentar que `clean_rotas.ts` e `clean_rotas2.ts` não devem ser executados no fluxo de preparação. Planejar sua substituição por rotina com simulação, escopo e preservação de paralelos.
- [ ] **0.10 — Montar verificação automatizada mínima.** Configurar build dos dois projetos e teste de integração conectado ao PostgreSQL na CI. Registrar comando local equivalente e não usar SMTP/SSO reais.
- [ ] **0.11 — Registrar limitações conhecidas — A30/A34.** Identificar endpoints simulados, funcionalidades não entregues e o Dockerfile ausente. Tornar explícito o que ainda não pode ser usado para homologar produção.

**Arquivos/áreas de partida:** `backend/package.json`, `frontend/package.json`, lockfiles, `backend/src/config/database.ts`, `backend/src/migrations/`, `backend/src/database/`, planos locais e scripts `clean_rotas`.

**Entregáveis:** procedimento de instalação, registro dos builds, comparação entidades/schema, fixtures, seed mínimo, matriz de transições e decisões funcionais.

**Critério para concluir:** outro desenvolvedor levanta a base de teste pelo procedimento, repete os builds e executa o teste de integração; as decisões necessárias para iniciar o núcleo estão documentadas ou têm bloqueio explícito. Falha de infraestrutura não conta como validação aprovada.

### Etapa 1 — Fechar brechas de autorização e identidade

**Objetivo:** garantir quem pode executar cada operação e quem será registrado como autor.

**Responsáveis sugeridos:** backend + frontend de sessão/permissões. **Dependência:** ambiente e fixtures da etapa 0; contrato do SSO para implementar renovação completa. A retirada do bypass e a proteção administrativa não dependem desse contrato estar completo.

#### Pontos a executar, nesta ordem

- [ ] **1.01 — Mapear operações e permissões — A01/A29.** Listar endpoints de leitura e alteração, ação exigida, escopo de planta/setor e exceções administrativas. Incluir rotas, peças, modelos, manutenção, inspeção, retrabalho, ocorrência, arquivos e dossiê.
- [ ] **1.02 — Proteger a administração — A01.** Exigir `ADMINISTRAR_RBAC` nos comandos de perfil/permissão; validar o alvo e registrar auditoria. Demonstrar que operador não consegue elevar seus privilégios por chamada direta.
- [ ] **1.03 — Bloquear liberação arbitrária — A02.** Impedir alteração genérica de status final/`liberadoProducao` pelo PUT da OP. Manter a liberação protegida até o comando formal da etapa 3 estar pronto.
- [ ] **1.04 — Remover autenticação por fallback — A03.** Eliminar login concedido após erro do SSO, escolha de ADMIN por nome e logs contendo resposta/token completos. Provedor falso deve existir somente no contexto de testes isolado.
- [ ] **1.05 — Corrigir sessão e renovação — A04.** Implementar o contrato real de expiração/refresh ou encerramento explícito da sessão; remover senha fixa; unificar armazenamento e limpeza das chaves; tratar 401 concorrentes com uma única renovação e reconectar o socket com credencial atualizada.
- [ ] **1.06 — Rejeitar usuários/perfis inativos — A04/A06.** Aplicar a regra em requisições HTTP, validação de crachá e conexão WebSocket. Definir comportamento quando a conta é desativada durante uma sessão aberta.
- [ ] **1.07 — Implementar ator da operação — A05.** Separar usuário do terminal e colaborador identificado; validar crachá real, atividade, planta, setor e ação no backend. Vincular a autorização temporária à operação; não aceitar nome/e-mail/UUID como substituto de credencial nem confiar em IDs enviados isoladamente.
- [ ] **1.08 — Aplicar o ator em todas as gravações — A05.** Ajustar bipagem, checklist, inspeção, fechamento e ocorrência para registrar o colaborador autorizado. Atualizar modal e payloads da UI; manter informação do terminal separada quando necessária à auditoria.
- [ ] **1.09 — Unificar permissões da UI — A29.** Expor capacidades efetivas a partir de `perfil_permissoes`; substituir decisões por JSON desatualizado ou nomes fixos; refletir concessão/revogação sem depender de redeploy.
- [ ] **1.10 — Aplicar escopo de planta e recurso — A06/A26.** Filtrar leituras, autorizar alterações e conferir vínculo OP/setor/peça/estação. Autorizar salas WebSocket; impedir remanejamento de peça pertencente a outra OP/modelo.
- [ ] **1.11 — Restringir dados e arquivos — A06/A33.** Criar DTOs sem senha/credenciais; proteger downloads e retirar exposição pública de arquivos privados. Validar uploads e DTOs de impressão, escapar textos no HTML e restringir execução/carregamento externo no renderizador.
- [ ] **1.12 — Validar segurança funcional.** Testar administrador/operador, sessão expirada, SSO indisponível, crachá sem ação, usuário inativo e acesso entre plantas. Conferir que pedidos negados não alteram banco nem disparam eventos.

**Arquivos/áreas de partida:** rotas administrativas e operacionais, middlewares de autenticação/RBAC, `auth.service.ts`, `websocket.service.ts`, `frontend/src/api/`, router, `ModalAuthQuiosque.vue`, uploads e serviços de PDF.

**Entregáveis:** matriz de autorização, comandos protegidos, sessão coerente, autoria por crachá, DTOs seguros e testes de acesso.

**Critério para concluir:** operador não altera privilégios nem libera produção; terminal A com crachá B registra B; usuários sem acesso não leem/alteram recursos de outra planta nem recebem seus eventos. Todas as rotas devem ter política explícita antes de operar com múltiplas plantas.

### Etapa 2 — Estabilizar o motor de produção e entregar a trajetória piloto

**Objetivo:** executar conferência → corte em uma máquina → inspeção → retrabalho → reinspeção sem atalhos nem perda de histórico.

**Responsáveis sugeridos:** backend + modelagem/qualidade, com frontend acompanhando cada contrato. **Dependência:** identidade/autorização da etapa 1 e decisões de passagem, peça, inspeção e reteste registradas na etapa 0.

#### Pontos a executar, nesta ordem

- [ ] **2.01 — Definir identidade operacional — A08/A09/A11/A28.** Formalizar OP, tipo de lote, peça ou unidade rastreada, etapa, passagem/ciclo e versão de rota. Implementar a regra aprovada de reteste por modelo/planta e distinguir a primeira passagem das seguintes.
- [ ] **2.02 — Criar migrations de integridade — A12/A23.** Auditar dados de uma cópia antes de acrescentar FK, checks e unicidade. Cobrir subsetor da peça, rastreamento ativo e permissões com setor nulo; permitir ciclos legítimos de retrabalho. Ensaiar base vazia e upgrade.
- [ ] **2.03 — Preservar cadastro e histórico — A21/A26/A27.** Tornar modelo/peças e manutenção transacionais; atualizar peças por diff com IDs estáveis; versionar/salvar snapshot de rota e SLA. Corrigir rotinas de limpeza para preservar grupos paralelos, com simulação e escopo explícito.
- [ ] **2.04 — Corrigir contratos de consulta — A25.** Substituir `cat.valor` por campo válido e consolidar consulta de opções; resolver a chamada de modelo individual inexistente da seção 4. Atualizar consumidores e respostas tipadas.
- [ ] **2.05 — Criar serviço central de transição — A07/A12.** Concentrar autorização, estado atual, pré-condições, gravação, auditoria e idempotência. Publicar eventos após commit e impedir sucesso parcial de saída com handoff perdido.
- [ ] **2.06 — Corrigir sequência e paralelismo — A10.** Validar todos os predecessores obrigatórios; aplicar a mesma regra à entrada manual e automática; rejeitar rotas inválidas; remover exceção de posição 5. Testar também setores flutuantes e condicionais.
- [ ] **2.07 — Corrigir o alvo e a concorrência da bipagem — A12/A13.** Distinguir lote sem peça de peça individual em todas as consultas; ordenar passagens por data/critério determinístico; proteger gravações simultâneas e repetição após perda de resposta.
- [ ] **2.08 — Corrigir fila e gate em conjunto — A07.** Implementar os marcos aprovados de conclusão operacional, espera de inspeção e transferência liberada. Exibir pendência antes da transferência; exigir aprovação válida para a passagem atual, sem reaproveitar aprovação antiga.
- [ ] **2.09 — Persistir inspeção por peça — A09.** Gravar os resultados individuais e vínculo com a passagem; exigir identificação explícita; remover escolha automática da primeira peça; filtrar por tipo de lote e validar pertencimento à OP.
- [ ] **2.10 — Completar o ciclo de retrabalho — A08.** Implementar abertura, entrada no destino, execução, conclusão, retorno e reinspeção. Resolver divergência conforme resultado e permitir novo ciclo sem apagar registros anteriores nem aceitar bypass de status enviado pela UI.
- [ ] **2.11 — Corrigir identidade do checklist — A16.** Separar catálogo/template/resposta; aceitar UUIDs usados pelo banco; persistir vínculo ou snapshot aprovado; corrigir `query`/`q` e seleção por setor/modelo/marca.
- [ ] **2.12 — Implementar revisão e retomada do checklist — A17.** Validar itens obrigatórios e conformidade explícita; rejeitar template inválido; separar rascunho/submissão/correção/liberação. Permitir retomar a saída quando o checklist já foi salvo e a segunda operação falhou.
- [ ] **2.13 — Corrigir inspeção agrupada e fotos — A18.** Implementar endpoint autorizado de anexos; definir atomicidade ou resultados individuais do grupo; permitir repetição segura; exibir erro de upload e confirmar persistência ao recarregar.
- [ ] **2.14 — Implementar corte real em uma máquina — A14.** Persistir revisão e fechamento, estação, autores e peças avaliadas. Exigir resultado de todas as peças, observação e destino para NÃO OK; integrar retrabalho; retirar sucesso fictício e impedir bypass pela bipagem genérica.
- [ ] **2.15 — Homologar a trajetória piloto.** Executar pela UI e diretamente pela API os caminhos aprovado, reprovado, retrabalho e reinspeção. Repetir com duas requisições simultâneas, falha de rede e reinício entre operações; registrar o resultado com modelagem/qualidade.

**Arquivos/áreas de partida:** controllers de rastreamentos, inspeções, checklists, corte, lotes e rotas; entidades/migrations relacionadas; `BipagemView.vue`, `ChecklistView.vue`, `InspecaoQualidadeView.vue`, wizard e `RouteBuilder.vue`.

**Entregáveis:** serviço de transições, migrations verificadas, contratos atualizados, corte piloto persistente, ciclos de qualidade/retrabalho e evidência de homologação.

**Critério para concluir:** os caminhos de sucesso e reprovação completos funcionam para a peça/lote corretos; nenhuma transferência contorna a qualidade; paralelos e concorrência não duplicam nem pulam etapas; salvar/reabrir mantém rota e SLA.

### Etapa 3 — Completar o ciclo fabril e o encerramento formal

**Objetivo:** ampliar o núcleo validado para os demais setores, caixa teste, laboratório, reunião de resultado e dossiê.

**Responsáveis sugeridos:** equipe full stack + representantes dos setores. **Dependência:** trajetória piloto homologada na etapa 2 e regras de caixa teste/apoio/resultado final definidas.

#### Pontos a executar, nesta ordem

- [ ] **3.01 — Expandir conferências e máquinas — A14.** Aplicar o fluxo validado a Almoxarifado/Navalha/Telas e às máquinas previstas, conferindo permissões, peças destinadas a cada subsetor, estação e junções paralelas. Retirar eficiência com valores fixos.
- [ ] **3.02 — Materializar a bifurcação da caixa teste — A11.** Criar a transição de nascimento no ponto aprovado; herdar conferências comuns conforme regra; validar `possuiCaixaTeste` e persistir tamanho/quantidade quando aplicável. Permitir avanços independentes sem misturar históricos.
- [ ] **3.03 — Implementar saída única — A11.** Aplicar `bipagemApenasSaida` na regra do servidor e na UI, definindo como medir espera/permanência sem inventar entrada física que não ocorreu.
- [ ] **3.04 — Persistir etapas de apoio — A15.** Substituir respostas fixas por etapas e estados reais; implementar dependências entre Corte, Chanfração/Etiqueta/Prensagem, Fuse/Frequência e Recorte; mostrar pendência/conclusão a partir do banco.
- [ ] **3.05 — Integrar laboratório interno — A15.** Exigir teste quando necessário antes do Recorte; persistir resultado e evidências; encaminhar reprovação ao setor correto e retomar o fluxo após reinspeção.
- [ ] **3.06 — Validar setores condicionais e laboratório final.** Percorrer rotas com e sem Serigrafia/Vulcanizado, posições permitidas de flutuantes e paralelismo com Montagem. Confirmar que o laboratório recebe apenas passagens liberadas.
- [ ] **3.07 — Implementar reunião e veredito — A02.** Criar comando com permissão específica, justificativa e registro em `AprovacaoFinal`; conferir requisitos da rota/qualidade/laboratório; manter bloqueio do PUT genérico.
- [ ] **3.08 — Encerrar a OP de forma atômica — A02.** Atualizar resultado, liberação, status do modelo e datas finais juntos; auditar ator e decisão; definir comportamento para reprovação/concessão e pedido repetido de encerramento.
- [ ] **3.09 — Completar dossiê e anexos — A18/A32.** Incluir veredito, peças inspecionadas, divergências, retrabalhos e imagens; vincular o documento ao snapshot aprovado e controlar sua versão e acesso.
- [ ] **3.10 — Tornar geração e notificações recuperáveis — A32.** Implementar fila/outbox, idempotência, retentativas e retomada após reinício; impedir dois processamentos concorrentes do mesmo pedido; mostrar estados pendente/gerando/concluído/erro.
- [ ] **3.11 — Corrigir destinatários e consolidação do e-mail — A32.** Configurar distribuição por planta/setor; retirar destinatário fixo de fallback; consolidar os três checklists iniciais conforme o plano; verificar concessão e falha de envio em SMTP de teste.
- [ ] **3.12 — Homologar OP completa.** Executar uma OP sem caixa e outra com caixa teste, incluindo falha no apoio, inspeção final, veredito e dossiê; reconciliar histórico, autores e documento com os setores envolvidos.

**Arquivos/áreas de partida:** controllers de corte/apoio/inspeções/lotes/dossiê, entidades de etapas e aprovação, serviços de dossiê/e-mail e respectivas telas operacionais.

**Entregáveis:** microfluxos persistentes, bifurcação explícita, comando de veredito, encerramento auditável, dossiê completo e notificações recuperáveis.

**Critério para concluir:** OP percorre todas as etapas aplicáveis, caixa e lote mantêm sua independência, reprovações são tratadas e a liberação só ocorre com veredito autorizado. O dossiê final representa esse ciclo e pode ser recuperado após falha do serviço.

### Etapa 4 — Validar indicadores, TV e implantação

**Objetivo:** fazer os dados gerenciais refletirem a produção real e tornar a operação reproduzível no ambiente de implantação.

**Responsáveis sugeridos:** backend/BI + frontend/infra. **Dependência:** estados e ciclos operacionais estabilizados; definições de métricas da seção 6 aprovadas. Docker/readiness podem ser preparados antes, sem aguardar o término de todos os microfluxos.

#### Pontos a executar, nesta ordem

- [ ] **4.01 — Fechar definições e exemplos dos indicadores — A19/A20.** Registrar fórmula, unidade, população, período, tratamento de concessão/retrabalho e filtro por planta/marca. Separar tempo decorrido de esforço acumulado em paralelo; calcular exemplos esperados antes de alterar consultas.
- [ ] **4.02 — Corrigir ocorrências e pausas — A19.** Validar vínculo com passagem/OP/setor; tornar resolução idempotente; calcular união de intervalos e sua interseção com a passagem; impedir desconto indevido em outro lote/peça.
- [ ] **4.03 — Padronizar tempos persistidos — A19.** Distinguir bruto, pausado e líquido; entregar cálculo coerente para passagens abertas/encerradas. Planejar tratamento dos dados antigos antes de recalculá-los.
- [ ] **4.04 — Corrigir os quatro KPIs — A20.** Implementar Lead Time com semântica acordada, gargalos ativos, FPY da primeira tentativa e retrabalho com ciclos encerrados; aplicar filtros e agrupar por IDs, não por nome de setor.
- [ ] **4.05 — Corrigir leitura da TV — A22.** Entregar snapshot com posição, SLA, pausa, ocorrências e anexos; remover expectativa de campos ausentes em `/lotes`; alinhar cálculo e exibição ao backend.
- [ ] **4.06 — Recuperar atualização em tempo real — A22/A31.** Emitir evento coerente por transição, agrupar recargas e escutar mudanças de ocorrência; buscar snapshot após reconexão; renovar autenticação do socket sem deixar a TV permanentemente desconectada.
- [ ] **4.07 — Otimizar consultas e índices — A20/A23/A31.** Medir payloads e consultas; eliminar N+1, paginar/projetar listagens e adicionar índices orientados por `EXPLAIN`. Não mudar fórmulas para ganhar performance.
- [ ] **4.08 — Ajustar limites de tráfego — A31.** Separar login/crachá, leitura operacional e geração de PDFs; definir limites por identidade/contexto; configurar proxy confiável quando existir; usar Redis compartilhado apenas se a arquitetura exigir.
- [ ] **4.09 — Completar infraestrutura — A30.** Criar Dockerfile/ignore e procedimento de migrations; configurar usuário de execução, volumes e dependências do navegador PDF. Separar liveness/readiness e responder 503 quando banco/schema não estiver pronto.
- [ ] **4.10 — Validar arquivos e PDF no ambiente alvo — A30/A33.** Testar impressão, geração/download autorizado, caminhos de upload, persistência dos volumes, texto escapado e restrição de recursos externos. Conferir comportamento depois de reiniciar o container.
- [ ] **4.11 — Reconciliar documentação e contratos.** Conferir todos os conflitos da seção 4, schemas/payloads/respostas e erros no Swagger; completar o plano auxiliar truncado e executar testes de contrato dos consumidores reais.
- [ ] **4.12 — Homologar carga e recuperação.** Simular 10 estações e TV, medir latência/erros/limites, desconectar e reconectar clientes e ensaiar backup/restauração. Comparar cada KPI com os exemplos aprovados em 4.01.

**Arquivos/áreas de partida:** controllers de dashboard/ocorrências/rastreamentos, views gerencial/TV, `websocket.service.ts`, configurações de rate limit/Swagger, `server.ts`, Compose, migrations e serviços de PDF.

**Entregáveis:** fórmulas documentadas, métricas reconciliadas, TV recuperável, resultados de carga, imagem reproduzível e procedimento de implantação/restauração.

**Critério para concluir:** pausas e primeira passagem produzem os valores esperados; TV recupera eventos perdidos; 10 estações operam sem bloqueio indevido; imagem constrói e readiness detecta indisponibilidade. Identidade e gates continuam sendo requisitos das etapas anteriores.

### Etapa 5 — Completar requisitos restantes e organizar a evolução

**Objetivo:** finalizar funcionalidades previstas, retirar simulações restantes e reduzir o custo de manutenção.

**Responsáveis sugeridos:** equipe full stack + responsável funcional; responsável por IA quando essa frente começar. **Dependência:** contratos operacionais estáveis; IA depende também dos indicadores e dados validados na etapa 4.

#### Pontos a executar, nesta ordem

- [ ] **5.01 — Conferir a cobertura do plano — A34.** Atualizar a tabela da seção 2 e listar requisitos ainda não entregues, incluindo endpoints simulados. Separar pendência aprovada de mudança de escopo que precisa ser registrada no plano.
- [ ] **5.02 — Persistir configurações reais — A34.** Substituir leitura/gravação fictícias por operações validadas, autorizadas e auditadas; demonstrar persistência após recarregar/reiniciar.
- [ ] **5.03 — Completar catálogo de peças — A34.** Entregar consulta paginada, criação, edição e inativação; definir efeitos sobre modelos e OPs existentes sem apagar referências históricas.
- [ ] **5.04 — Completar catálogo de checklist — A34.** Entregar gestão por setor, ordenação, obrigatoriedade e tipo de resposta; aplicar a estratégia de versão/snapshot definida na etapa 2.
- [ ] **5.05 — Implementar importação/exportação — A34.** Criar prévia de CSV, validação de colunas/duplicatas/referências, relatório de erros e confirmação do lote; preservar dados existentes e garantir repetição segura da importação.
- [ ] **5.06 — Entregar tickets por setor — A34.** Implementar filtros dos setores críticos, filas de trabalho, espera de revisão/fechamento e concluídos; mostrar peça/máquina/tipo de lote/SLA/pausa; ligar ações rápidas às regras existentes e atualizar por eventos.
- [ ] **5.07 — Implementar automações determinísticas pendentes — A34.** Conferir notificações de status, consolidações e agendamentos previstos; reutilizar fila/outbox da etapa 3, sem duplicar envio ou alterar gates por automação de texto.
- [ ] **5.08 — Entregar flows de IA previstos — A34.** Implementar análise de divergências, sugestão de rota, resumo diário e insights de qualidade. Definir dados de entrada, resultado esperado, permissões, tratamento de falha, custo e avaliação; manter decisões operacionais obrigatórias no motor determinístico.
- [ ] **5.09 — Organizar componentes e regras compartilhadas.** Dividir telas grandes por responsabilidade e extrair lógica repetida de contratos, permissões e apresentação. Fazer mudanças incrementais com regressão do comportamento já homologado.
- [ ] **5.10 — Encerrar achados com evidência.** Revisar A01–A34, relacionar PRs e resultados de homologação, atualizar documentação de operação e registrar pendências remanescentes com responsável. Só declarar aderência integral quando todos os requisitos aprovados estiverem demonstrados.

**Arquivos/áreas de partida:** configurações, rotas/catálogos/seeds, telas de catálogos e tickets, configuração/serviços de Genkit, componentes compartilhados e documentação.

**Entregáveis:** gestão completa de catálogos/configurações, tickets operacionais, automações previstas, avaliação dos flows de IA e quadro final de cobertura.

**Critério para concluir:** funcionalidades anunciadas persistem e consultam dados reais; importação é verificável; tickets refletem as passagens; automações não violam autorização/qualidade; requisitos e achados têm evidência de conclusão ou pendência explicitamente registrada.

### Quadro de acompanhamento por ponto

Copiar uma linha para cada ponto iniciado. Usar os status **Não iniciado**, **Em andamento**, **Bloqueado**, **Em validação** ou **Concluído**. Este quadro complementa as caixas das etapas e permite retomar o trabalho sem depender da memória de quem executou.

| Ponto | Responsável | Status | Branch/PR ou alteração | Validação realizada | Pendência / próximo passo |
| --- | --- | --- | --- | --- | --- |
| 0.01 | A definir | Não iniciado | — | — | Confirmar base de trabalho e arquivos locais |

Ao finalizar uma etapa, registrar quem validou, quando, quais cenários da seção 9 foram executados e o que permanece pendente. Se houver dependência não resolvida, não marcar os pontos dependentes como concluídos.

## 8. Primeiros tickets concretos recomendados

Os tickets abaixo são recortes iniciais do roteiro da seção 7; não substituem os demais pontos obrigatórios das etapas.

| Ordem | Pontos do roteiro | Entrega pequena e revisável | Dependência | Evidência de conclusão |
| --- | --- | --- | --- | --- |
| 1 | 0.01–0.06, 0.08, 0.10 | Ambiente descartável, builds e teste de API conectado ao PostgreSQL | Nenhuma | Execução reproduzível e erros registrados |
| 2 | 1.01–1.03 | Proteção dos PUTs administrativos e do PUT de liberação | Fixture de perfis | Operador 403; administrador autorizado; zero gravação indevida |
| 3 | 1.04–1.06 | Remover bypass/credenciais fixas; sessão com contrato explícito | Contrato do SSO para refresh completo | Falha do SSO não autentica; logout limpa sessão |
| 4 | 1.07–1.10 | Resolver ator do crachá por ação/setor e escopo | Ticket 2 | Terminal A, ator B, permissão B e auditoria B |
| 5 | 2.01–2.02, 2.05, 2.08–2.09 | Introduzir passagem/ciclo e testes do gate/fila | Decisões 0.07 e identidade da etapa 1 | Sem inspeção não transfere; pendência visível antes da liberação |
| 6 | 2.03–2.07 | Entrada/saída/handoff transacionais com junção paralela | Modelo de passagem do ticket 5; implementar junto da integração do gate | Duas requisições, uma transição; todos os predecessores necessários |
| 7 | 2.11–2.13 | IDs e revisão de checklist; upload de evidência | Tickets 4–6 | Submissão, correção e retomada sem perda |
| 8 | 2.10, 2.14–2.15 | Corte de uma máquina + retrabalho + reinspeção completos | Tickets 5–7 | Trajetória piloto homologada pela qualidade |

Não estimar datas apenas por quantidade de telas. Os tickets 1–3 fornecem a base para estimar o restante com menos incerteza. Manter PRs pequenos, cada um com mudança de contrato, migration quando necessária e cenário de negócio demonstrável.

## 9. Matriz mínima de homologação

| Cenário | Resultado esperado |
| --- | --- |
| Instalação vazia e atualização de cópia da base | Mesmo schema final, seeds idempotentes e perfis utilizáveis |
| Usuário sem ADMINISTRAR_RBAC | Não altera perfil nem permissão, mesmo por chamada direta |
| SSO recusa login / indisponível | Nenhum token operacional é emitido |
| Crachá diferente da sessão e crachá inativo | Autor correto; inativo negado |
| Duas plantas e recurso fora de escopo | Leitura, alteração, anexos e eventos negados conforme política |
| Três conferências paralelas, só duas concluídas | Próxima etapa permanece indisponível |
| Saída sem qualidade e aprovação de ciclo anterior | Ambas rejeitadas quando gate obrigatório |
| Duas bipagens simultâneas e repetição por falha de rede | Uma única transição; resposta idempotente ou conflito controlado |
| Lote e peças coexistindo no mesmo setor | Saída não escolhe passagem alheia |
| Reprovação da peça B/CX e reinspeção | Só B/CX retorna; ciclo conclui sem bloquear novos retrabalhos |
| Peça NÃO OK no corte | Observação e destino obrigatórios; dados persistidos |
| Checklist UUID v7, obrigatório ausente, pendência corrigida | Identidade preservada, incompleto bloqueado e revisão auditada |
| Foto de inspeção e falha de upload | Persistência verificável e erro visível, sem falso sucesso |
| Pausas sobrepostas e resolução repetida | União de intervalos correta; duração estável |
| FPY com reprovação seguida de aprovação | Não conta como primeira passagem aprovada |
| Salvar SLA, recarregar e criar OP | Valores mantidos e snapshot consistente |
| Queda/reconexão da TV durante movimentação | Recupera estado atual e pausas |
| Veredito final e PDF com reinício do worker | Liberação autorizada e geração retomável sem duplicidade |

## 10. Critério de conclusão da recuperação

Considerar o núcleo pronto para piloto controlado quando os P0 estiverem resolvidos, a trajetória piloto tiver aprovação dos responsáveis funcionais, as migrations forem repetíveis e os cenários críticos de identidade, concorrência, qualidade e retrabalho passarem. Considerar aderência integral ao plano apenas após homologar também os microfluxos, decisão final, relatórios, tickets, catálogos e automações acordadas.

Este documento é o plano de correção. Nesta análise não foram implementadas correções na aplicação nem alterados dados do banco.
