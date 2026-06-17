import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// Configuração Swagger/OpenAPI 3.0 — Documentação Interativa
// ═══════════════════════════════════════════════════════════════════════════
// Conforme Seção 12 do implementation_plan_4.md
// Rota pública: GET /api-docs (sem autenticação)
// Spec JSON: GET /api-docs.json (importável no Postman)

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'ERP Chão de Fábrica — API de Testes de Produção',
      version: '4.0.0',
      description: `
API REST para rastreamento de testes de produção calçadista.

**Funcionalidades Principais:**
- Rastreamento de bipagem por peça/setor
- Gestão de Ordens de Teste com Caixa Teste e Lote Principal
- Checklists dinâmicos com itens avulsos
- Inspeção de Qualidade seletiva (Handoff Automático + Gate Obrigatório)
- Micro-fluxo de Corte Automático com dupla bipagem
- Micro-fluxo de Apoio com Lab interno
- Dashboard Gerencial de BI (4 KPIs)
- Ocorrências com upload de fotos
- Dossiê do Modelo (PDF via Genkit)
- RBAC Dinâmico "Zero Hardcode"
      `,
      contact: {
        name: 'Equipe de Desenvolvimento — Modelagem',
        email: 'dev.modelagem@empresa.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Desenvolvimento',
      },
      {
        url: 'http://10.100.1.43:3001',
        description: 'Homologação',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido via POST /api/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Descrição do erro' },
            code: { type: 'string', example: 'ERROR_CODE' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  campo: { type: 'string' },
                  mensagem: { type: 'string' },
                },
              },
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 150 },
            totalPages: { type: 'integer', example: 8 },
          },
        },
        Usuario: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            nomeCompleto: { type: 'string', example: 'João Silva' },
            usuario: { type: 'string', example: 'joao.silva' },
            cargo: { type: 'string', example: 'Operador de Corte' },
            email: { type: 'string', format: 'email', nullable: true, example: 'joao.silva@empresa.com' },
            ativo: { type: 'boolean', example: true },
            perfilId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            setorId: { type: 'string', format: 'uuid', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
            plantaId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            gestorId: { type: 'string', format: 'uuid', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
            ultimoAcesso: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            usuario: { $ref: '#/components/schemas/Usuario' },
          },
        },
        RotaModelo: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            modeloId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            setorId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            ordem: { type: 'integer', example: 1 },
            obrigatorio: { type: 'boolean', example: true },
            tipoExecucao: { type: 'string', enum: ['SEQUENCIAL', 'PARALELO'], example: 'SEQUENCIAL' },
            bipagemApenasSaida: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Planta: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            nome: { type: 'string', example: 'Planta Principal' },
            endereco: { type: 'string', nullable: true, example: 'Av. Brasil, 1000' },
            cidade: { type: 'string', nullable: true, example: 'Novo Hamburgo' },
            estado: { type: 'string', nullable: true, example: 'RS' },
            ativo: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Setor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            plantaId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            nome: { type: 'string', example: 'Corte Automático' },
            tipoOpcaoId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            ordemFluxo: { type: 'integer', example: 2 },
            isCondicional: { type: 'boolean', example: false },
            ativo: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Marca: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            nome: { type: 'string', example: 'Nike' },
            logoUrl: { type: 'string', nullable: true, example: 'https://logo.url/nike.png' },
            ativo: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Modelo: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            marcaId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            codigoProduto: { type: 'string', example: 'MOD-992' },
            nome: { type: 'string', example: 'Air Max 90' },
            mfmReferenciaUrl: { type: 'string', nullable: true, example: 'https://mfm.url/airmax90' },
            fichaTecnicaUrl: { type: 'string', nullable: true, example: 'https://tech.url/airmax90.pdf' },
            temporada: { type: 'string', nullable: true, example: '2026-Q2' },
            status: { type: 'string', enum: ['CADASTRADO', 'EM_TESTE', 'LIBERADO', 'NAO_LIBERADO'], example: 'CADASTRADO' },
            ativo: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Peca: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            modeloId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            nome: { type: 'string', example: 'Cabedal Couro' },
            codigoBarras: { type: 'string', nullable: true, example: 'PEC-123456789' },
            descricao: { type: 'string', nullable: true, example: 'Cabedal cortado em couro bovino' },
            setorCorteOpcaoId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        OrdemTeste: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            modeloId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            plantaId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            criadoPorId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            codigoBarras: { type: 'string', example: 'OT-987654321' },
            dataInicio: { type: 'string', format: 'date-time' },
            dataFimPrevista: { type: 'string', format: 'date-time', nullable: true },
            dataFimReal: { type: 'string', format: 'date-time', nullable: true },
            prioridadePcp: { type: 'string', example: 'ALTA' },
            status: { type: 'string', example: 'AGUARDANDO_MATERIAL' },
            liberadoProducao: { type: 'boolean', example: false },
            possuiCaixaTeste: { type: 'boolean', example: false },
            observacoes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Rastreamento: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            ordemTesteId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            pecaId: { type: 'string', format: 'uuid', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
            setorId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            estacaoId: { type: 'string', format: 'uuid', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
            operadorEntradaId: { type: 'string', format: 'uuid', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
            operadorSaidaId: { type: 'string', format: 'uuid', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
            inspecaoSaidaId: { type: 'string', format: 'uuid', nullable: true },
            tipoLote: { type: 'string', enum: ['LOTE_PRINCIPAL', 'CAIXA_TESTE'], example: 'LOTE_PRINCIPAL' },
            dataEntrada: { type: 'string', format: 'date-time', nullable: true },
            dataSaida: { type: 'string', format: 'date-time', nullable: true },
            tempoPermanenciaMin: { type: 'integer', nullable: true, example: 45 },
            status: { type: 'string', enum: ['EM_PROCESSO', 'CONCLUIDO', 'REPROVADO', 'EM_RETRABALHO'], example: 'EM_PROCESSO' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'auth', description: 'Autenticação e tokens' },
      { name: 'lotes', description: 'Ordens de Teste e Lotes de Produção' },
      { name: 'rastreamentos', description: 'Bipagem e movimentação' },
      { name: 'checklists', description: 'Templates e preenchimento' },
      { name: 'inspecoes', description: 'Qualidade e laboratório' },
      { name: 'corte', description: 'Micro-fluxo de corte por máquina' },
      { name: 'apoio', description: 'Micro-fluxo do setor de apoio' },
      { name: 'ocorrencias', description: 'Gargalos e problemas' },
      { name: 'dossie', description: 'Relatório final em PDF' },
      { name: 'dashboard', description: 'KPIs e BI gerencial' },
      { name: 'admin', description: 'Gestão de usuários e RBAC' },
      { name: 'configuracoes', description: 'Config dinâmicas e opções' },
    ],
  },
  /**
   * @swagger
   * 
   * 
   */
  // Onde ficam as anotações JSDoc nos arquivos de rota
  apis: [
    path.join(__dirname, '../routes/**/*.{ts,js}'),
    path.join(__dirname, '../controllers/**/*.{ts,js}'),
    path.join(__dirname, '../schemas/**/*.{ts,js}'),
    path.join(__dirname, '../**/*.{ts,js}'),
    path.join(__dirname, '../../dist/routes/**/*.{ts,js}'),
    path.join(__dirname, '../../dist/controllers/**/*.{ts,js}'),
    path.join(__dirname, '../../dist/schemas/**/*.{ts,js}'),
    path.join(__dirname, '../../dist/**/*.js')
  ],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export function swaggerSetup(app: Express): void {
  // Swagger UI interativo na rota /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ERP Modelagem — API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
  }));

  // Endpoint JSON da spec (para importação no Postman)
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
