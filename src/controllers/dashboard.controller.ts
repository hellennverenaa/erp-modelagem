import { Request, Response } from 'express';

export class DashboardController {
  public async getKpis(_req: Request, res: Response): Promise<Response> {
    try {
      // Retorno mockado conforme especificação de BI para testes
      return res.json({
        kpi1_fidelidadeEtapas: 94.5,
        kpi2_retrabalhoGargalo: {
          setor: 'Costura',
          taxa: 12.8
        },
        kpi3_tempoCicloMedio: 180,
        kpi4_aprovacaoPrimeira: 88.2
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar KPIs do Dashboard' });
    }
  }
}
