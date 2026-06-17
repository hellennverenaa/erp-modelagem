import { Request, Response } from 'express';

export class ApoioController {
  public async postEtapa(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(201).json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
        etapaApoioTipo: 'SERIGRAFIA',
        status: 'EM_ANDAMENTO',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar etapa do apoio' });
    }
  }

  public async postLaboratorio(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(201).json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
        enviadoParaLab: true,
        dataEnvio: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao enviar amostra para laboratório' });
    }
  }

  public async getStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { ordemTesteId } = req.params;
      return res.json({
        ordemTesteId,
        etapaApoioTipo: 'SERIGRAFIA',
        status: 'CONCLUIDO',
        tempoProcessamentoMin: 120
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar status do apoio' });
    }
  }
}
