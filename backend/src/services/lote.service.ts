import { randomUUID } from 'crypto';
import { AppDataSource } from '../config/database';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { Modelo } from '../entities/Modelo';
import { Planta } from '../entities/Planta';
import { lockModelConfiguration, validatePersistedModelRoute, getPersistedModelRoute } from './route-integrity.service';
import { saveModelPieces, ModelPieceInput } from './model-pieces.service';
import { garantirTicketsSetorDaOrdem } from './ticket-setor.service';
import { parseDateOnly } from '../utils/date.utils';

export class LoteServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'LOTE_ERROR',
    public readonly extra: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'LoteServiceError';
  }
}

export interface CriarOrdemPcpDTO {
  modeloId: string;
  plantaId: string;
  prioridadePcp: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  dataCorte?: string | null;
  observacoes?: string | null;
}

export interface SalvarConfiguracaoPecasDTO {
  possuiCaixaTeste: boolean;
  pecas: Array<{
    id?: string;
    catalogoPecaId: string;
    setorCorteOpcaoId: string;
  }>;
}

export interface FinalizarModelagemDTO {
  slasPorSetor?: Record<string, number> | null;
}

export interface UsuarioContexto {
  userId: string;
  perfilId: string;
  plantaId?: string;
}

export class LoteService {
  /**
   * Cria uma ordem de teste originada pelo PCP antes da configuração da Modelagem.
   */
  public static async criarOrdemPcp(
    dados: CriarOrdemPcpDTO,
    usuario: UsuarioContexto,
    acessoTodasPlantas = false
  ): Promise<OrdemTeste> {
    if (!acessoTodasPlantas && dados.plantaId !== usuario.plantaId) {
      throw new LoteServiceError('Não é permitido criar uma ordem em outra planta.', 403, 'PLANTA_FORBIDDEN');
    }

    try {
      return await AppDataSource.transaction(async (manager) => {
        await lockModelConfiguration(manager, dados.modeloId);

        const modeloRepo = manager.getRepository(Modelo);
        const modelo = await modeloRepo.findOne({ where: { id: dados.modeloId, ativo: true } });
        if (!modelo) {
          throw new LoteServiceError('Modelo não encontrado ou inativo.', 404, 'MODELO_NOT_FOUND');
        }

        const ordemExistente = await manager.getRepository(OrdemTeste).findOne({ where: { modeloId: modelo.id } });
        if (ordemExistente) {
          throw new LoteServiceError(
            'Este modelo já possui uma ordem de teste. A relação Modelo → Ordem de Teste é 1:1.',
            409,
            'MODELO_TESTE_DUPLICADO',
            { ordemId: ordemExistente.id, codigoBarras: ordemExistente.codigoBarras }
          );
        }

        const planta = await manager.getRepository(Planta).findOne({
          where: { id: dados.plantaId, ativo: true },
          select: { id: true }
        });
        if (!planta) {
          throw new LoteServiceError('Planta não encontrada ou inativa.', 404, 'PLANTA_NOT_FOUND');
        }

        const previsaoCorte = dados.dataCorte ? parseDateOnly(dados.dataCorte) : modelo.dataCorte;
        if (!previsaoCorte) {
          throw new LoteServiceError('Informe a previsão de corte antes de criar a ordem.', 400, 'DATA_CORTE_REQUIRED');
        }

        if (dados.dataCorte) {
          modelo.dataCorte = previsaoCorte;
          await modeloRepo.save(modelo);
        }

        const repo = manager.getRepository(OrdemTeste);
        return await repo.save(repo.create({
          modeloId: modelo.id,
          plantaId: dados.plantaId,
          criadoPorId: usuario.userId,
          codigoBarras: `OT-${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`,
          dataInicio: new Date(),
          prioridadePcp: dados.prioridadePcp,
          observacoes: dados.observacoes?.trim() || null,
          status: OrdemTesteStatus.AGUARDANDO_MODELAGEM,
          liberadoProducao: false,
          possuiCaixaTeste: null,
          rotaSnapshot: null,
          rotaVersao: null,
          slasPorSetor: null,
        }));
      });
    } catch (error: any) {
      if (error instanceof LoteServiceError) throw error;
      if (error?.code === '23505') {
        throw new LoteServiceError('Já existe uma ordem de teste para este modelo.', 409, 'MODELO_TESTE_DUPLICADO');
      }
      throw error;
    }
  }

  /**
   * Salva as peças e a decisão de Caixa Teste pela equipe de Modelagem.
   */
  public static async salvarConfiguracaoPecasModelagem(
    ordemId: string,
    dados: SalvarConfiguracaoPecasDTO,
    usuarioPlantaId?: string,
    acessoTodasPlantas = false
  ): Promise<{ ordem: OrdemTeste; pecas: any[] }> {
    if (!acessoTodasPlantas && !usuarioPlantaId) {
      throw new LoteServiceError('Usuário sem planta associada.', 403, 'PLANTA_REQUIRED');
    }

    return await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OrdemTeste);
      const where = acessoTodasPlantas ? { id: ordemId } : { id: ordemId, plantaId: usuarioPlantaId };

      const encontrada = await repo.findOne({ where, select: { id: true, modeloId: true } });
      if (!encontrada) {
        throw new LoteServiceError('Ordem de teste não encontrada.', 404, 'LOTE_NOT_FOUND');
      }

      await lockModelConfiguration(manager, encontrada.modeloId);

      const ordem = await repo.findOne({ where });
      if (!ordem) {
        throw new LoteServiceError('Ordem de teste não encontrada.', 404, 'LOTE_NOT_FOUND');
      }

      if (ordem.status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
        throw new LoteServiceError(
          'A configuração da Modelagem só pode ser alterada enquanto a ordem estiver aguardando modelagem.',
          409,
          'MODELAGEM_ALREADY_COMPLETED'
        );
      }

      const pecas = await saveModelPieces(manager, ordem.modeloId, dados.pecas as ModelPieceInput[]);
      ordem.possuiCaixaTeste = dados.possuiCaixaTeste;
      await repo.save(ordem);

      return { ordem, pecas };
    });
  }

  /**
   * Finaliza a configuração da Modelagem, congela o snapshot da rota, gera tickets e libera para produção.
   */
  public static async finalizarConfiguracaoModelagem(
    ordemId: string,
    dados: FinalizarModelagemDTO,
    usuarioPlantaId?: string,
    acessoTodasPlantas = false
  ): Promise<OrdemTeste> {
    if (!acessoTodasPlantas && !usuarioPlantaId) {
      throw new LoteServiceError('Usuário sem planta associada.', 403, 'PLANTA_REQUIRED');
    }

    return await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OrdemTeste);
      const where = acessoTodasPlantas ? { id: ordemId } : { id: ordemId, plantaId: usuarioPlantaId };

      const encontrada = await repo.findOne({ where, select: { id: true, modeloId: true } });
      if (!encontrada) {
        throw new LoteServiceError('Ordem de teste não encontrada.', 404, 'LOTE_NOT_FOUND');
      }

      await lockModelConfiguration(manager, encontrada.modeloId);

      const atual = await repo.findOne({ where });
      if (!atual) {
        throw new LoteServiceError('Ordem de teste não encontrada.', 404, 'LOTE_NOT_FOUND');
      }

      if (atual.status !== OrdemTesteStatus.AGUARDANDO_MODELAGEM) {
        throw new LoteServiceError(
          'A ordem não está aguardando configuração da Modelagem.',
          409,
          'MODELAGEM_ALREADY_COMPLETED'
        );
      }

      if (atual.possuiCaixaTeste === null) {
        throw new LoteServiceError(
          'Defina se o modelo possui Caixa Teste antes de finalizar.',
          400,
          'CAIXA_TESTE_NOT_DEFINED'
        );
      }

      await validatePersistedModelRoute(manager, atual.modeloId, atual.plantaId);
      const { versao, etapas } = await getPersistedModelRoute(manager, atual.modeloId, atual.plantaId);

      const slasPorSetor = { ...(dados.slasPorSetor || {}) };
      for (const etapa of etapas) {
        slasPorSetor[etapa.setorId] = etapa.slaAlvoMin;
      }

      atual.rotaVersao = versao;
      atual.rotaSnapshot = {
        versao,
        plantaId: atual.plantaId,
        etapas: etapas.map((etapa) => ({
          setorId: etapa.setorId,
          nome: etapa.setor?.nome || 'Setor',
          ordem: etapa.ordem,
          obrigatorio: etapa.obrigatorio,
          tipoExecucao: etapa.tipoExecucao,
          bipagemApenasSaida: etapa.bipagemApenasSaida,
        })),
        slasPorSetor,
      };
      atual.slasPorSetor = slasPorSetor;
      atual.status = OrdemTesteStatus.AGUARDANDO_MATERIAL;
      atual.liberadoProducao = true;

      const ordemSalva = await repo.save(atual);
      await garantirTicketsSetorDaOrdem(manager, ordemSalva);

      return ordemSalva;
    });
  }
}
