# Repository Guidelines

## Estrutura do projeto

O ERP de modelagem possui duas aplicações TypeScript com instalações independentes:

- `backend/src/`: API Express organizada em `routes/`, `controllers/`, `services/`, `entities/`, `middlewares/` e `config/`. As migrações TypeORM ficam em `migrations/`; preparação do banco e seeds, em `database/`.
- `frontend/src/`: aplicação Vue 3. Telas ficam em `views/`, componentes reutilizáveis em `components/`, navegação em `router/` e integração com API e sessão em `api/`.
- `frontend/public/` e `frontend/src/assets/`: arquivos estáticos e recursos importados.
- `docs/`: documentação e dados CSV. Consulte `docs/GIT.md` para o fluxo de colaboração e `docs/plano_implementation.md` para o planejamento histórico.

## Comandos de desenvolvimento e build

Execute `npm ci` separadamente em `backend/` e `frontend/`.

- `cd backend && npm run dev`: prepara o banco, aplica migrações e inicia a API com ts-node. Utilize um banco de desenvolvimento configurado.
- `cd backend && npm run build`: compila TypeScript para `dist/`.
- `cd backend && npm start`: executa a API compilada.
- `cd backend && npm run migration:run`: prepara o banco e aplica migrações pendentes.
- `cd frontend && npm run dev`: inicia o servidor Vite.
- `cd frontend && npm run build`: verifica os tipos Vue/TypeScript e gera o bundle.
- `cd frontend && npm run preview`: disponibiliza uma prévia do frontend compilado.

## Estilo de código e nomenclatura

Siga os arquivos próximos, geralmente com indentação de dois espaços. O backend costuma usar ponto e vírgula; o TypeScript do frontend costuma omiti-lo. Preserve os nomes de domínio em português. Use PascalCase para entidades e componentes (`GestaoOrdensView.vue`), camelCase para variáveis e funções e os sufixos existentes: `.routes.ts`, `.controller.ts` e `.service.ts`. Mantenha as verificações estritas de TypeScript. Não há comandos configurados de lint ou formatação.

## Orientações de testes

Não há framework automatizado nem meta de cobertura configurados. O `npm test` do backend é um placeholder que falha. Compile as aplicações afetadas e valide manualmente os fluxos alterados. Para mudanças de autorização, confira acessos permitidos e negados na interface e na API. Registre verificações e limitações no PR.

## Commits e pull requests

Faça commits pequenos seguindo o histórico: `feat(auth): carrega permissões da sessão` ou `fix(escopo): descrição`. Trabalhe em branches `feature/nome-da-feature`, atualizadas com a `main` conforme `docs/GIT.md`, e integre por PR. Descreva alterações, validação e impactos em configuração ou migrações; inclua capturas para mudanças visuais. Solicite revisão de outro desenvolvedor quando possível.

## Segurança e configuração

Consulte o `.env.example` de cada aplicação. Nunca versione credenciais nem exponha segredos em logs. Preserve autenticação e RBAC na API: guardas de navegação não garantem autorização.
