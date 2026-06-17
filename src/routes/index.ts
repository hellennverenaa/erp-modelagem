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

const router = Router();

// Rotas públicas ou controladas individualmente por JWT
router.use('/auth', authRoutes);
router.use('/lotes', lotesRoutes);
router.use('/rastreamentos', rastreamentosRoutes);
router.use('/checklists', checklistsRoutes);
router.use('/inspecoes', inspecoesRoutes);
router.use('/corte', corteRoutes);
router.use('/apoio', apoioRoutes);
router.use('/ocorrencias', ocorrenciasRoutes);
router.use('/dossies', dossieRoutes);
router.use('/configuracoes', configuracoesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);

export default router;
