import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { RotaModelo, TipoExecucao } from '../entities/RotaModelo';
import { Modelo } from '../entities/Modelo';
import { Setor } from '../entities/Setor';
import { In } from 'typeorm';
import { Peca } from '../entities/Peca';
import { lockModelConfiguration, RouteIntegrityError, validateRouteIntegrity } from '../services/route-integrity.service';
import { perfilPossuiPermissao } from '../services/rbac.service';

const itemRotaSchema = z.object({
  setorId: z.string().uuid({ message: 'setorId deve ser um UUID válido.' }),
  ordem: z.number().int().min(1),
  obrigatorio: z.boolean().optional().default(true),
  tipoExecucao: z.nativeEnum(TipoExecucao).optional().default(TipoExecucao.SEQUENCIAL),
  bipagemApenasSaida: z.boolean().optional().default(false)
});

const salvarRotaSchema = z.object({
  plantaId: z.string().uuid(),
  // Uma rota vazia apagaria a configuração existente na transação abaixo.
  rota: z.array(itemRotaSchema).min(1, { message: 'A rota deve conter ao menos um setor.' }),
  slasPorSetor: z.record(z.string(), z.number().nonnegative()).optional().nullable(),
});

export class RotasController {
  /**
   * PUT /api/rotas/:modeloId
   * Salva (sobrescreve) a rota de produção de um modelo.
   */
  public salvarRota = async (req: Request, res: Response): Promise<Response> => {
    const modeloId = req.params.modeloId as string;

    if (!modeloId || !/^[0-9a-f-]{36}$/i.test(String(modeloId))) {
      return res.status(400).json({ error: 'modeloId inválido.', code: 'VALIDATION_ERROR' });
    }

    const parseResult = salvarRotaSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Estrutura da rota inválida.',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors
      });
    }

      const { rota, plantaId } = parseResult.data;

    try {
      if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });
      const acessoTodasPlantas = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS');
      if (!acessoTodasPlantas && plantaId !== req.user.plantaId) {
        return res.status(403).json({ error: 'Não é permitido editar a rota de outra planta.', code: 'PLANTA_FORBIDDEN' });
      }
      const modeloRepo = AppDataSource.getRepository(Modelo);
      const modelo = await modeloRepo.findOne({ where: { id: modeloId } });
      if (!modelo) {
        return res.status(404).json({ error: 'Modelo não encontrado.', code: 'MODELO_NOT_FOUND' });
      }

      // Validação de existência dos setores (Prevenção de FK Constraint Error)
      const setorIdsPayload = Array.from(new Set(rota.map(r => r.setorId)));
      const setorRepo = AppDataSource.getRepository(Setor);
      const setoresExistentes = await setorRepo.find({
        where: { id: In(setorIdsPayload) }
      });
      const idsExistentes = setoresExistentes.map(s => s.id);
      
      const setoresFaltantes = setorIdsPayload.filter(id => !idsExistentes.includes(id));
      if (setoresFaltantes.length > 0) {
        return res.status(400).json({
          error: 'Um ou mais Setores fornecidos não existem no banco de dados. Foreign Key constraint validation failed.',
          code: 'SETORES_NOT_FOUND',
          invalidIds: setoresFaltantes
        });
      }

      // Executa tudo dentro de uma transação
      const resultado = await AppDataSource.transaction(async (transactionalEntityManager) => {
        await lockModelConfiguration(transactionalEntityManager, modeloId);
        const rotaRepo = transactionalEntityManager.getRepository(RotaModelo);
        const pecas = await transactionalEntityManager.getRepository(Peca).find({ where: { modeloId } });
        await validateRouteIntegrity(transactionalEntityManager, rota, pecas, plantaId);
        const versaoAnterior = await rotaRepo.createQueryBuilder('rota')
          .select('COALESCE(MAX(rota.versao), 0)', 'versao')
          .where('rota.modeloId = :modeloId AND rota.plantaId = :plantaId', { modeloId, plantaId })
          .getRawOne();
        const versao = Number(versaoAnterior?.versao || 0) + 1;
        const novosItens = rota.map((item) => {
          return rotaRepo.create({
            modeloId,
            plantaId,
            setorId: item.setorId,
            ordem: item.ordem,
            obrigatorio: item.obrigatorio,
            tipoExecucao: item.tipoExecucao,
            bipagemApenasSaida: item.bipagemApenasSaida,
            versao,
          });
        });
        return { itensSalvos: await rotaRepo.save(novosItens), versao };
      });

      return res.status(200).json({
        message: 'Rota de produção salva com sucesso.',
        totalSetores: resultado.itensSalvos.length,
        versao: resultado.versao,
        modeloId,
        plantaId,
        rota: resultado.itensSalvos,
      });

    } catch (error: any) {
      if (error instanceof RouteIntegrityError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      console.error('[RotasController.salvarRota] Erro interno:', error.message || error);
      return res.status(500).json({
        error: 'Erro interno ao salvar a rota de produção. ' + (error.message || ''),
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/rotas/:modeloId
   * Obtém a rota de produção de um modelo.
   */
  public getRota = async (req: Request, res: Response): Promise<Response> => {
    const modeloId = req.params.modeloId as string;
    const plantaId = String(req.query.plantaId || '');

    if (!modeloId || !/^[0-9a-f-]{36}$/i.test(String(modeloId))) {
      return res.status(400).json({ error: 'modeloId inválido.', code: 'VALIDATION_ERROR' });
    }
    if (!z.string().uuid().safeParse(plantaId).success) {
      return res.status(400).json({ error: 'plantaId é obrigatório.', code: 'VALIDATION_ERROR' });
    }

    try {
      if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado.', code: 'AUTH_UNAUTHENTICATED' });
      const acessoTodasPlantas = await perfilPossuiPermissao(req.user.perfilId, 'ACESSAR_TODAS_PLANTAS');
      if (!acessoTodasPlantas && plantaId !== req.user.plantaId) {
        return res.status(403).json({ error: 'Não é permitido consultar a rota de outra planta.', code: 'PLANTA_FORBIDDEN' });
      }
      const rotaRepo = AppDataSource.getRepository(RotaModelo);
      const rotas = await rotaRepo.find({
        where: { modeloId, plantaId },
        relations: { setor: true },
        order: { ordem: 'ASC' }
      });
      const versao = rotas.reduce((maior, etapa) => Math.max(maior, etapa.versao || 1), 0);
      const rota = rotas.filter((etapa) => (etapa.versao || 1) === versao);

      return res.status(200).json({
        modeloId,
        plantaId,
        versao,
        rota
      });

    } catch (error: any) {
      console.error('[RotasController.getRota] Erro interno:', error.message || error);
      return res.status(500).json({
        error: 'Erro interno ao buscar rota de produção.',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}
