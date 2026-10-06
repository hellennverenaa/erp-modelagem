# Plano de Implementação — Fase 2 (Segurança &amp; API)

Este plano descreve o design e as alterações técnicas necessárias para implementar a camada de segurança enterprise (Helmet, CORS dinâmico, Rate Limiting multinível), autenticação baseada em JWT compatível com o serviço legado `dass_auth_service`, e a documentação interativa de API com Swagger/OpenAPI.

## User Review Required

[!IMPORTANT] **Compatibilidade de Segredos JWT**: O segredo de validação `JWT_SECRET` será lido do arquivo `.env` e deve ser compartilhado entre o ERP de Modelagem e o serviço legado `dass_auth_service` para que os tokens gerados por este último possam ser validados com sucesso no nosso middleware de autenticação.

**CORS com credenciais**: O CORS está configurado para habilitar `credentials: true`. Por motivos de segurança, isso impede o uso de origens curingas (`*`). A lista de origens autorizadas será lida dinamicamente da variável `CORS_ALLOWED_ORIGINS` do arquivo `.env`.

\-------------------------------------------------------------------------------- 

## Proposed Changes

### Dependências (Instalação via NPM)

Instalação dos pacotes necessários para JWT e Swagger:

* Dependências principais: `jsonwebtoken`, `swagger-ui-express`, `swagger-jsdoc`
* Dependências de desenvolvimento: `@types/jsonwebtoken`, `@types/swagger-ui-express`, `@types/swagger-jsdoc`

\-------------------------------------------------------------------------------- 

### Configurações

#### [NEW] 

Implementa as opções do CORS consumindo a whitelist `CORS_ALLOWED_ORIGINS` do `.env`, com fallback para `localhost` em desenvolvimento.

#### [NEW] 

Configura os três níveis de limitação com `express-rate-limit`:

1. **Global (** **globalLimiter** **)**: 200 requisições a cada 15 minutos (por IP ou ID de usuário).
2. **Auth (** **authLimiter** **)**: Máximo de 5 tentativas de login a cada 15 minutos (pulando requisições de sucesso).
3. **Heavy (** **heavyLimiter** **)**: Máximo de 10 operações pesadas por hora (geração de relatórios/dossiês).

#### [NEW] 

Configuração do `swagger-jsdoc` e montagem do Swagger UI na rota `/api-docs` e arquivo JSON em `/api-docs.json`.

\-------------------------------------------------------------------------------- 

### Middlewares

#### [NEW] 

Middleware `verificaToken` que extrai o token JWT do header `Authorization: Bearer