import { Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Rastreamento, RastreamentoStatus, TipoLote } from '../entities/Rastreamento';
import { Setor } from '../entities/Setor';

export class CorteController {
  /**
   * POST /api/corte/distribuir
   * Distribui a Ordem de Teste para o Corte Automático.
   * Cria rastreamentos EXCLUSIVAMENTE para os setores de corte exigidos pelas peças do modelo.
   * Garanta que nasçam com dataEntrada = null e dataSaida = null.
   */
  public async distribuirCorte(req: Request, res: Response): Promise<Response> {
    try {
      const { ordemTesteId } = req.body;

      if (!ordemTesteId) {
        return res.status(400).json({ error: 'ordemTesteId é obrigatório.' });
      }

      const ordemRepo = AppDataSource.getRepository(OrdemTeste);
      const setorRepo = AppDataSource.getRepository(Setor);
      const rastreamentoRepo = AppDataSource.getRepository(Rastreamento);

      const ordem = await ordemRepo.findOne({
        where: { id: ordemTesteId },
        relations: { modelo: { pecas: true } }
      });

      if (!ordem) {
        return res.status(404).json({ error: 'Ordem de Teste não encontrada.' });
      }

      const pecas = ordem.modelo?.pecas || [];
      if (pecas.length === 0) {
        return res.status(400).json({ error: 'O modelo desta Ordem de Teste não possui peças configuradas.' });
      }

      // Extrai um array ÚNICO dos setorCorteOpcaoId exigidos pelas peças da Ordem de Teste
      const setorCorteOpcaoIds = Array.from(
        new Set(pecas.map(p => p.setorCorteOpcaoId).filter(Boolean))
      );

      if (setorCorteOpcaoIds.length === 0) {
        return res.status(400).json({ error: 'Nenhuma peça possui subsetor de corte configurado no modelo.' });
      }

      const todosSetores = await setorRepo.find();
      const setoresDestino: Setor[] = [];

      for (const opcaoId of setorCorteOpcaoIds) {
        const setorEncontrado = todosSetores.find(s => s.id === opcaoId || s.tipoOpcaoId === opcaoId);
        if (setorEncontrado && !setoresDestino.some(s => s.id === setorEncontrado.id)) {
          setoresDestino.push(setorEncontrado);
        }
      }

      if (setoresDestino.length === 0) {
        const setoresDiretos = await setorRepo.findBy({ id: In(setorCorteOpcaoIds) });
        setoresDestino.push(...setoresDiretos);
      }

      const rastreamentosCriados: Rastreamento[] = [];

      for (const setor of setoresDestino) {
        const jaExiste = await rastreamentoRepo.findOne({
          where: {
            ordemTesteId: ordem.id,
            setorId: setor.id,
            tipoLote: TipoLote.LOTE_PRINCIPAL
          }
        });

        if (!jaExiste) {
          // Nascem estritamente com dataEntrada = null e dataSaida = null
          const novoRast = rastreamentoRepo.create({
            ordemTesteId: ordem.id,
            setorId: setor.id,
            tipoLote: TipoLote.LOTE_PRINCIPAL,
            status: RastreamentoStatus.EM_PROCESSO,
            dataEntrada: null,
            dataSaida: null,
          });
          const salvo = await rastreamentoRepo.save(novoRast);
          rastreamentosCriados.push(salvo);
        }
      }

      return res.status(201).json({
        message: 'Distribuição de corte efetuada com sucesso.',
        distribuidos: rastreamentosCriados.length,
        setores: setoresDestino.map(s => s.nome),
        rastreamentos: rastreamentosCriados
      });
    } catch (error: any) {
      console.error('[CorteController.distribuirCorte] Erro:', error);
      return res.status(500).json({ error: error.message || 'Erro ao distribuir corte' });
    }
  }

  public async biparCorte(_req: Request, res: Response): Promise<Response> {
    try {
      return res.status(201).json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        ordemTesteId: '550e8400-e29b-41d4-a716-446655440000',
        pecaId: '550e8400-e29b-41d4-a716-446655440000',
        operadorId: '550e8400-e29b-41d4-a716-446655440000',
        bipagemDuplaOk: true,
        dataBipagem: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro na bipagem dupla de corte' });
    }
  }

  public async getEficiencia(_req: Request, res: Response): Promise<Response> {
    try {
      return res.json({
        eficienciaPercentual: 92.4,
        pecasCortadas: 1520,
        divergenciasDetectadas: 12
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar eficiência do corte' });
    }
  }
}
