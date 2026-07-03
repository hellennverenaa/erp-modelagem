import { Request, Response } from 'express';

export class OcorrenciasController {
  public async createOcorrencia(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(201).json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
        setorId: '550e8400-e29b-41d4-a716-446655440000',
        tipoOcorrencia: 'GARGALO_MAQUINA',
        gravidade: 'ALTA',
        descricao: 'Lentidão operacional na esteira de montagem',
        status: 'ABERTA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar ocorrência de produção' });
    }
  }

  public async getOcorrencias(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
          setorId: '550e8400-e29b-41d4-a716-446655440000',
          tipoOcorrencia: 'GARGALO_MAQUINA',
          gravidade: 'ALTA',
          status: 'ABERTA'
        }
      ]);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar ocorrências' });
    }
  }

  public async resolverOcorrencia(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      return res.json({
        id,
        status: 'RESOLVIDA',
        dataResolucao: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao resolver ocorrência' });
    }
  }
}
