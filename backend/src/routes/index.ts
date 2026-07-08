import { Router } from 'express';
import authRoutes from './auth.routes';
import lotesRoutes from './lotes.routes';
import rastreamentosRoutes from './rastreamentos.routes';
import checklistsRoutes from './checklists.routes';
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
import { verificaToken } from '../middlewares/auth.middleware';

const router = Router();

// Rota pública de autenticação
router.use('/auth', authRoutes);

// Rotas protegidas por JWT
router.use('/lotes', verificaToken, lotesRoutes);
router.use('/rastreamentos', verificaToken, rastreamentosRoutes);
router.use('/checklists', verificaToken, checklistsRoutes);
router.use('/inspecoes', verificaToken, inspecoesRoutes);
router.use('/corte', verificaToken, corteRoutes);
router.use('/apoio', verificaToken, apoioRoutes);
router.use('/ocorrencias', verificaToken, ocorrenciasRoutes);
router.use('/dossies', verificaToken, dossieRoutes);
router.use('/configuracoes', verificaToken, configuracoesRoutes);
router.use('/dashboard', verificaToken, dashboardRoutes);
router.use('/admin', verificaToken, adminRoutes);
router.use('/rotas', verificaToken, rotasRoutes);
router.use('/pecas', verificaToken, pecasRoutes);
router.use('/etiquetas', verificaToken, etiquetasRoutes);

export default router;
