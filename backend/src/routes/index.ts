import { Router } from 'express';
import authRoutes from './auth.routes';
import lotesRoutes from './lotes.routes';
import rastreamentosRoutes from './rastreamentos.routes';
import inspecoesRoutes from './inspecoes.routes';
import corteRoutes from './corte.routes';
import apoioRoutes from './apoio.routes';
import ocorrenciasRoutes from './ocorrencias.routes';
import dossieRoutes from './dossie.routes';
import configuracoesRoutes from './configuracoes.routes';
import dashboardRoutes from './dashboard.routes';
import adminRoutes from './admin.routes';
import rotasRoutes from './rotas.routes';
import pecasRoutes from './pecas.routes';
import etiquetasRoutes from './etiquetas.routes';
import historicoRoutes from './historico.routes';
import { verificaToken } from '../middlewares/auth.middleware';
import { exigirAlgumaPermissao, exigirPermissao } from '../middlewares/rbac.middleware';

const router = Router();

// Rota pública de autenticação
router.use('/auth', authRoutes);

// Rotas protegidas por JWT
router.use('/lotes', verificaToken, exigirAlgumaPermissao([
  'TELA_GESTAO_ORDENS', 'TELA_NOVA_ORDEM_TESTE', 'TELA_BIPAGEM',
  'TELA_INSPECAO_QUALIDADE', 'TELA_RASTREAMENTO',
]), lotesRoutes);
router.use('/ordens-teste', verificaToken, exigirAlgumaPermissao([
  'TELA_GESTAO_ORDENS', 'TELA_NOVA_ORDEM_TESTE', 'TELA_BIPAGEM',
  'TELA_INSPECAO_QUALIDADE', 'TELA_RASTREAMENTO',
]), lotesRoutes);
router.use('/rastreamentos', verificaToken, exigirAlgumaPermissao([
  'TELA_BIPAGEM', 'TELA_RASTREAMENTO', 'TELA_GESTAO_ORDENS',
  'TELA_INSPECAO_QUALIDADE',
]), rastreamentosRoutes);
router.use('/inspecoes', verificaToken, exigirPermissao('TELA_INSPECAO_QUALIDADE'), inspecoesRoutes);
router.use('/corte', verificaToken, exigirPermissao('TELA_BIPAGEM'), corteRoutes);
router.use('/apoio', verificaToken, exigirPermissao('TELA_BIPAGEM'), apoioRoutes);
router.use('/ocorrencias', verificaToken, exigirPermissao('TELA_BIPAGEM'), ocorrenciasRoutes);
router.use('/dossies', verificaToken, exigirAlgumaPermissao(['TELA_GESTAO_ORDENS', 'TELA_RASTREAMENTO']), dossieRoutes);
router.use('/configuracoes', verificaToken, exigirAlgumaPermissao([
  'TELA_GESTAO_ORDENS', 'TELA_CONSTRUTOR_ROTA', 'TELA_NOVA_ORDEM_TESTE', 'TELA_BIPAGEM',
]), configuracoesRoutes);
router.use('/config', verificaToken, exigirAlgumaPermissao([
  'TELA_GESTAO_ORDENS', 'TELA_CONSTRUTOR_ROTA', 'TELA_NOVA_ORDEM_TESTE', 'TELA_BIPAGEM',
]), configuracoesRoutes);
router.use('/dashboard', verificaToken, exigirPermissao('TELA_TORRE_CONTROLE'), dashboardRoutes);
router.use('/admin', verificaToken, adminRoutes);
router.use('/rotas', verificaToken, exigirAlgumaPermissao([
  'TELA_CONSTRUTOR_ROTA', 'TELA_GESTAO_ORDENS', 'TELA_NOVA_ORDEM_TESTE',
]), rotasRoutes);
router.use('/pecas', verificaToken, exigirAlgumaPermissao([
  'TELA_CATALOGO_PECAS', 'TELA_CATALOGO_MODELOS', 'TELA_GESTAO_ORDENS',
  'TELA_NOVA_ORDEM_TESTE',
]), pecasRoutes);
router.use('/catalogo-pecas', verificaToken, exigirAlgumaPermissao([
  'TELA_CATALOGO_PECAS', 'TELA_CATALOGO_MODELOS', 'TELA_GESTAO_ORDENS',
  'TELA_NOVA_ORDEM_TESTE',
]), pecasRoutes);
router.use('/etiquetas', verificaToken, exigirAlgumaPermissao([
  'TELA_GESTAO_ORDENS', 'TELA_NOVA_ORDEM_TESTE', 'TELA_BIPAGEM',
]), etiquetasRoutes);
router.use('/historico', verificaToken, exigirPermissao('TELA_HISTORICO_MOVIMENTACOES'), historicoRoutes);

export default router;
