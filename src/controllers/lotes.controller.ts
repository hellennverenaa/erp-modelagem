import { Request, Response } from 'express';

export class LotesController {
  public async getLotes(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          modeloId: '550e8400-e29b-41d4-a716-446655440000',
          plantaId: '550e8400-e29b-41d4-a716-446655440000',
          criadoPorId: '550e8400-e29b-41d4-a716-446655440000',
          codigoBarras: 'OT-987654321',
          dataInicio: new Date().toISOString(),
          dataFimPrevista: null,
          dataFimReal: null,
          prioridadePcp: 'ALTA',
          status: 'AGUARDANDO_MATERIAL',
          liberadoProducao: false,
          possuiCaixaTeste: false,
          observacoes: 'Ordem de teste de exemplo',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar ordens de teste' });
    }
  }

  public async getLoteById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      return res.json({
        id,
        modeloId: '550e8400-e29b-41d4-a716-446655440000',
        plantaId: '550e8400-e29b-41d4-a716-446655440000',
        criadoPorId: '550e8400-e29b-41d4-a716-446655440000',
        codigoBarras: 'OT-987654321',
        dataInicio: new Date().toISOString(),
        dataFimPrevista: null,
        dataFimReal: null,
        prioridadePcp: 'ALTA',
        status: 'AGUARDANDO_MATERIAL',
        liberadoProducao: false,
        possuiCaixaTeste: false,
        observacoes: 'Ordem de teste de exemplo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar ordem de teste' });
    }
  }

  public async createLote(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(201).json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        modeloId: '550e8400-e29b-41d4-a716-446655440000',
        plantaId: '550e8400-e29b-41d4-a716-446655440000',
        criadoPorId: '550e8400-e29b-41d4-a716-446655440000',
        codigoBarras: 'OT-987654321',
        dataInicio: new Date().toISOString(),
        status: 'AGUARDANDO_MATERIAL',
        liberadoProducao: false,
        possuiCaixaTeste: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar ordem de teste' });
    }
  }

  public async updateLote(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      return res.json({
        id,
        modeloId: '550e8400-e29b-41d4-a716-446655440000',
        plantaId: '550e8400-e29b-41d4-a716-446655440000',
        criadoPorId: '550e8400-e29b-41d4-a716-446655440000',
        codigoBarras: 'OT-987654321',
        dataInicio: new Date().toISOString(),
        status: 'EM_CORTE',
        liberadoProducao: true,
        possuiCaixaTeste: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar ordem de teste' });
    }
  }
}
