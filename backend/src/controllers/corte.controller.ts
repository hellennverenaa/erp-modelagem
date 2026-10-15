import { Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { Rastreamento, RastreamentoStatus, TipoLote } from '../entities/Rastreamento';
import { Setor } from '../entities/Setor';
import { RouteIntegrityError, validatePersistedModelRoute } from '../services/route-integrity.service';
import { getSetorCorteOpcaoIdsDaOrdem, mapearSubsetoresParaTiposDeSetor } from '../services/ordem-pecas.service';

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

      if (ordem.status === OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
        return res.status(409).json({ error: 'A ordem está aguardando a Modelagem configurar peças, Caixa Teste e rota.', code: 'MODELAGEM_REQUIRED' });
      }
      try {
        await validatePersistedModelRoute(AppDataSource.manager, ordem.modeloId, ordem.plantaId, ordem.rotaVersao);
      } catch (error) {
        if (error instanceof RouteIntegrityError) {
          return res.status(409).json({ error: `A ordem ainda não pode ser distribuída ao corte: ${error.message}`, code: 'ROTA_INVALIDA' });
        }
        throw error;
      }

      const pecas = ordem.modelo?.pecas || [];
      if (pecas.length === 0) {
        return res.status(400).json({ error: 'O modelo desta Ordem de Teste não possui peças configuradas.' });
      }

      // Usa as opções efetivas da ordem; um remanejamento não altera o modelo.
      const setorCorteOpcaoIds = getSetorCorteOpcaoIdsDaOrdem(ordem, pecas);

      if (setorCorteOpcaoIds.length === 0) {
        return res.status(400).json({ error: 'Nenhuma peça possui subsetor de corte configurado para esta ordem.' });
      }

      const tiposSetorPorOpcao = await mapearSubsetoresParaTiposDeSetor(AppDataSource.manager, setorCorteOpcaoIds);
      if (tiposSetorPorOpcao.size !== setorCorteOpcaoIds.length) {
        return res.status(409).json({ error: 'Uma das opções de corte da ordem não possui setor correspondente configurado.', code: 'SETOR_CORTE_NAO_CONFIGURADO' });
      }

      const tiposSetorIds = [...new Set(tiposSetorPorOpcao.values())];
      const setoresDestino: Setor[] = await setorRepo.find({
        where: { plantaId: ordem.plantaId, tipoOpcaoId: In(tiposSetorIds), ativo: true },
      });

      if (setoresDestino.length === 0) {
        return res.status(409).json({ error: 'A planta desta ordem não possui setores ativos para as máquinas selecionadas.', code: 'SETOR_CORTE_NAO_DISPONIVEL' });
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
