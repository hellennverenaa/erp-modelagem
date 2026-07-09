import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../config/database';
import { Rastreamento, RastreamentoStatus, TipoLote } from '../entities/Rastreamento';
import { Checklist, ChecklistStatus } from '../entities/Checklist';
import { Inspecao, TipoInspecao, ResultadoInspecao } from '../entities/Inspecao';
import { OcorrenciaProducao } from '../entities/OcorrenciaProducao';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Setor } from '../entities/Setor';
import { OrdemTeste } from '../entities/OrdemTeste';
import { RotaModelo } from '../entities/RotaModelo';
import { webSocketService } from '../services/websocket.service';

// ═══════════════════════════════════════════════════════════════════════════
// RastreamentosController — Motor do ERP (Bipagem de Entrada/Saída)
// ═══════════════════════════════════════════════════════════════════════════
// Implementa a lógica de Gate de Qualidade Seletiva:
//   Categoria A — Handoff Automático (com validação de checklist)
//   Categoria B — Gate Obrigatório (inspeção ou Lab exigido)
// Calcula SLA Dinâmico descontando pausas por ocorrências (interrompeSla=true)
// Zero Hardcode: setores identificados via JOIN com config_opcoes
// Conforme Seção 2.6 e Gate de Qualidade Seletiva do implementation_plan_4.md

// ═══ Schemas de Validação Zod ═══

const biparEntradaSchema = z.object({
  ordemTesteId: z.string().uuid({ message: 'ordemTesteId deve ser um UUID válido.' }),
  setorId:      z.string().uuid({ message: 'setorId deve ser um UUID válido.' }),
  tipoLote:     z.nativeEnum(TipoLote),
  pecaId:       z.string().uuid().optional().nullable(),
  estacaoId:    z.string().uuid().optional().nullable(),
});

const biparSaidaSchema = z.object({
  ordemTesteId:   z.string().uuid({ message: 'ordemTesteId deve ser um UUID válido.' }),
  setorId:        z.string().uuid({ message: 'setorId deve ser um UUID válido.' }),
  tipoLote:       z.nativeEnum(TipoLote).optional().default(TipoLote.LOTE_PRINCIPAL),
  pecaId:         z.string().uuid().optional().nullable(),
});

// ═══ Valor dos tipos de setor no config_opcoes (dinâmico, sem hardcode) ═══
// Esses são os `valor` armazenados na tabela config_opcoes, categoria 'setor_tipo'.
// Os setores de Handoff Automático (Categoria A) são definidos pelo campo config_opcoes.valor
const SETORES_HANDOFF_AUTOMATICO_VALORES = [
  'ALMOXARIFADO',
  'NAVALHA',
  'TELAS',
  'RECEBIMENTO_CORTE',
  'SEPARACAO_CORTE',
  'DUBLAGEM_CORTE',
];

export class RastreamentosController {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POST /api/rastreamentos/bipar-entrada
  // Registra a entrada de um lote/peça em um setor
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  public biparEntrada = async (req: Request, res: Response): Promise<Response> => {
    // 1. Valida o payload com Zod
    const parseResult = biparEntradaSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Dados de entrada inválidos.',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { ordemTesteId, setorId, tipoLote, pecaId, estacaoId } = parseResult.data;
    const operadorId = req.user?.userId;

    if (!operadorId) {
      return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHENTICATED' });
    }

    try {
      // 1.1. Busca a Ordem de Teste correspondente para obter o modeloId
      const ordemRepo = AppDataSource.getRepository(OrdemTeste);
      const ordem = await ordemRepo.findOne({ where: { id: ordemTesteId } });
      if (!ordem) {
        return res.status(404).json({
          error: 'Ordem de teste não encontrada.',
          code: 'ORDEM_NOT_FOUND',
        });
      }

      // 1.2. Verifica se o setorId pertence à rota de produção mapeada para o modelo
      const rotaRepo = AppDataSource.getRepository(RotaModelo);
      const pertenceARota = await rotaRepo.findOne({
        where: {
          modeloId: ordem.modeloId,
          setorId: setorId,
        },
      });

      if (!pertenceARota) {
        return res.status(403).json({
          error: 'Acesso Negado: Este setor não pertence à rota de produção definida para este modelo.',
          code: 'SETOR_NOT_IN_ROUTE',
        });
      }

      // 1.2.1. Trava Estrita de Sequência (Anti-Teletransporte)
      if (pertenceARota.ordem > 1) {
        // Encontra a etapa imediatamente anterior na rota desse mesmo modelo
        const rotaAnterior = await rotaRepo.findOne({
          where: {
            modeloId: ordem.modeloId,
            ordem: pertenceARota.ordem - 1,
          },
        });

        if (rotaAnterior) {
          const checkRastreamentoRepo = AppDataSource.getRepository(Rastreamento);
          
          // Verifica se a saída do setor anterior foi concluída
          const queryAnterior = checkRastreamentoRepo.createQueryBuilder('r')
            .where('r.ordemTesteId = :ordemTesteId', { ordemTesteId })
            .andWhere('r.setorId = :setorId', { setorId: rotaAnterior.setorId })
            .andWhere('r.status = :status', { status: RastreamentoStatus.CONCLUIDO })
            .andWhere('r.dataSaida IS NOT NULL')
            .andWhere('r.tipoLote = :tipoLote', { tipoLote });

          if (pecaId) {
            queryAnterior.andWhere('r.pecaId = :pecaId', { pecaId });
          } else {
            queryAnterior.andWhere('r.pecaId IS NULL');
          }

          const rastreamentoAnterior = await queryAnterior.getOne();

          if (!rastreamentoAnterior) {
            return res.status(403).json({
              error: 'Falha de Sequência: A peça não pode entrar neste setor pois não teve a saída registrada no setor anterior da rota.',
              code: 'SEQUENCIA_INVALIDA',
            });
          }
        }
      }

      const rastreamentoRepo = AppDataSource.getRepository(Rastreamento);

      // 1.3. Trava de Duplicidade: Verifica se já existe um registro de processamento para essa ordem/peça/tipoLote neste setor
      const queryExistente = rastreamentoRepo.createQueryBuilder('r')
        .where('r.ordemTesteId = :ordemTesteId', { ordemTesteId })
        .andWhere('r.setorId = :setorId', { setorId })
        .andWhere('r.tipoLote = :tipoLote', { tipoLote });
      
      if (pecaId) {
        queryExistente.andWhere('r.pecaId = :pecaId', { pecaId });
      } else {
        queryExistente.andWhere('r.pecaId IS NULL');
      }

      const registroExistente = await queryExistente.getOne();
      if (registroExistente) {
        return res.status(400).json({
          error: 'Bloqueio: Esta ordem já possui um registro de processamento neste setor.',
          code: 'BIPAGEM_DUPLICADA_SETOR'
        });
      }

      // 2. Verifica se já existe uma bipagem de entrada ativa (sem dataSaida) para essa
      //    combinação ordemTeste + setor + tipoLote + peca (evita bips duplicados)
      const bipagemAtiva = await rastreamentoRepo.findOne({
        where: {
          ordemTesteId,
          setorId,
          tipoLote,
          ...(pecaId ? { pecaId } : {}),
          status: RastreamentoStatus.EM_PROCESSO,
        },
      });

      if (bipagemAtiva) {
        return res.status(409).json({
          error: 'Já existe uma bipagem de entrada ativa para este setor/lote/peça.',
          code: 'BIPAGEM_DUPLICADA',
          rastreamentoId: bipagemAtiva.id,
        });
      }

      // 3. Cria o registro de entrada
      const novoRastreamento = rastreamentoRepo.create({
        ordemTesteId,
        setorId,
        tipoLote,
        pecaId:           pecaId ?? null,
        estacaoId:        estacaoId ?? null,
        operadorEntradaId: operadorId,
        dataEntrada:      new Date(),
        status:           RastreamentoStatus.EM_PROCESSO,
      });

      const salvo = await rastreamentoRepo.save(novoRastreamento);

      // Emitir avanço via WebSocket
      webSocketService.emit('peca:avanco', { action: 'entrada', data: salvo });

      return res.status(201).json({
        message: 'Bipagem de entrada registrada com sucesso.',
        rastreamento: salvo,
      });

    } catch (error) {
      console.error('[RastreamentosController.biparEntrada] Erro:', error);
      return res.status(500).json({
        error: 'Erro interno ao registrar bipagem de entrada.',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POST /api/rastreamentos/bipar-saida
  // Registra a saída de um lote/peça de um setor com lógica de Gate
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  public biparSaida = async (req: Request, res: Response): Promise<Response> => {
    // 1. Valida o payload com Zod
    const parseResult = biparSaidaSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Dados de entrada inválidos.',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { ordemTesteId, setorId, tipoLote, pecaId } = parseResult.data;
    const operadorId = req.user?.userId;

    if (!operadorId) {
      return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHENTICATED' });
    }

    try {
      const rastreamentoRepo  = AppDataSource.getRepository(Rastreamento);
      const checklistRepo     = AppDataSource.getRepository(Checklist);
      const inspecaoRepo      = AppDataSource.getRepository(Inspecao);
      const ocorrenciaRepo    = AppDataSource.getRepository(OcorrenciaProducao);
      const configOpcaoRepo   = AppDataSource.getRepository(ConfigOpcao);
      const setorRepo         = AppDataSource.getRepository(Setor);

      // 2. Busca o rastreamento ativo (EM_PROCESSO) para esse setor/lote/peca
      const rastreamento = await rastreamentoRepo.findOne({
        where: {
          ordemTesteId,
          setorId,
          tipoLote,
          ...(pecaId ? { pecaId } : {}),
          status: RastreamentoStatus.EM_PROCESSO,
        },
      });

      if (!rastreamento) {
        return res.status(404).json({
          error: 'Nenhuma bipagem de entrada ativa encontrada para este setor/lote.',
          code: 'RASTREAMENTO_NAO_ENCONTRADO',
          details: { ordemTesteId, setorId, tipoLote },
        });
      }

      // ── GATE DE QUALIDADE SELETIVA ──────────────────────────────────────
      // Identifica a categoria do setor via JOIN com config_opcoes
      // Zero Hardcode: não compara strings fixas de nome de setor
      let foundInspecaoId: string | null = null;

      const setorInfo = await setorRepo.findOne({ where: { id: setorId } });
      if (!setorInfo) {
        return res.status(404).json({ error: 'Setor não encontrado.', code: 'SETOR_NAO_ENCONTRADO' });
      }

      // Busca o tipo do setor na config_opcoes (categoria 'setor_tipo')
      const tipoOpcao = await configOpcaoRepo.findOne({
        where: { id: setorInfo.tipoOpcaoId },
      });

      const isSetorHandoffAutomatico =
        tipoOpcao !== null &&
        SETORES_HANDOFF_AUTOMATICO_VALORES.includes(tipoOpcao.valor);

      if (isSetorHandoffAutomatico) {
        // ── CATEGORIA A: Handoff Automático ─────────────────────────────
        // Verifica checklist mais recente desse setor/ordem
        const checklist = await checklistRepo.findOne({
          where: { ordemTesteId, setorId },
          order: { dataPreenchimento: 'DESC' },
        });

        if (checklist && checklist.status === ChecklistStatus.COM_PENDENCIAS) {
          if (checklist.bloqueante) {
            // TRAVA: Bipagem bloqueada por pendências bloqueantes
            return res.status(403).json({
              error: 'Bipagem travada por pendências bloqueantes no checklist.',
              code: 'CHECKLIST_BLOQUEANTE',
              details: {
                checklistId: checklist.id,
                status: checklist.status,
                bloqueante: checklist.bloqueante,
              },
            });
          }
          // CONCESSÃO: avança com alerta (não bloqueia, mas registra)
          // TODO: Disparar e-mail/WebSocket para modelistas e gerente (Genkit flow)
          console.warn(
            `[Gate Categoria A] Concessão concedida para ordemTeste=${ordemTesteId} ` +
            `setor=${setorId}. Checklist com pendências não-bloqueantes. ` +
            `Alerta disparado (e-mail/WebSocket pendente de integração Genkit).`
          );
        }
        // Se checklist PREENCHIDO ou não existir → avança normalmente

      } else {
        // ── CATEGORIA B: Gate Obrigatório ────────────────────────────────
        // Todos os demais setores a partir dos subsetores de Corte por Máquina.
        // Exige inspeção aprovada (SAIDA_SETOR, LABORATORIO ou LABORATORIO_APOIO)
        const inspecaoAprovada = await inspecaoRepo.findOne({
          where: [
            {
              ordemTesteId,
              setorId,
              tipoLote,
              tipoInspecao: TipoInspecao.SAIDA_SETOR,
              resultado: ResultadoInspecao.APROVADO,
            },
            {
              ordemTesteId,
              setorId,
              tipoLote,
              tipoInspecao: TipoInspecao.SAIDA_SETOR,
              resultado: ResultadoInspecao.APROVADO_CONCESSAO,
            },
            {
              ordemTesteId,
              setorId,
              tipoLote,
              tipoInspecao: TipoInspecao.LABORATORIO,
              resultado: ResultadoInspecao.APROVADO,
            },
            {
              ordemTesteId,
              setorId,
              tipoLote,
              tipoInspecao: TipoInspecao.LABORATORIO,
              resultado: ResultadoInspecao.APROVADO_CONCESSAO,
            },
            {
              ordemTesteId,
              setorId,
              tipoLote,
              tipoInspecao: TipoInspecao.LABORATORIO_APOIO,
              resultado: ResultadoInspecao.APROVADO,
            },
            {
              ordemTesteId,
              setorId,
              tipoLote,
              tipoInspecao: TipoInspecao.LABORATORIO_APOIO,
              resultado: ResultadoInspecao.APROVADO_CONCESSAO,
            },
          ],
        });

        if (!inspecaoAprovada) {
          return res.status(403).json({
            error:
              'Saída bloqueada. Este setor exige inspeção de qualidade (SAIDA_SETOR, LABORATORIO ou LABORATORIO_APOIO) com resultado APROVADO ou APROVADO_CONCESSAO antes do handoff.',
            code: 'GATE_QUALIDADE_OBRIGATORIO',
            details: { ordemTesteId, setorId, tipoLote },
          });
        }
        foundInspecaoId = inspecaoAprovada.id;
      }
      // ── FIM DO GATE ──────────────────────────────────────────────────────

      // 3. CÁLCULO DE SLA DINÂMICO
      // tempoPermanenciaMin = (dataSaida - dataEntrada) - tempo pausado por ocorrências (interrompeSla=true)
      const agora = new Date();
      const dataEntrada = rastreamento.dataEntrada!;

      // Tempo bruto em minutos
      const tempoTotalMs  = agora.getTime() - dataEntrada.getTime();
      const tempoTotalMin = Math.floor(tempoTotalMs / 60_000);

      // Soma o tempo das ocorrências que interrompem SLA (com resolução registrada)
      const ocorrencias = await ocorrenciaRepo
        .createQueryBuilder('oc')
        .where('oc.rastreamentoId = :rastreamentoId', { rastreamentoId: rastreamento.id })
        .andWhere('oc.interrompeSla = true')
        .andWhere('oc.dataResolucao IS NOT NULL')
        .getMany();

      let tempoPausadoMs = 0;
      for (const oc of ocorrencias) {
        if (oc.dataResolucao) {
          tempoPausadoMs +=
            oc.dataResolucao.getTime() - oc.dataOcorrencia.getTime();
        }
      }
      const tempoPausadoMin   = Math.floor(tempoPausadoMs / 60_000);
      const tempoPermanenciaMin = Math.max(0, tempoTotalMin - tempoPausadoMin);

      // 4. Atualiza o rastreamento com dados de saída
      rastreamento.dataSaida          = agora;
      rastreamento.operadorSaidaId    = operadorId;
      rastreamento.inspecaoSaidaId    = foundInspecaoId;
      rastreamento.tempoPermanenciaMin = tempoPermanenciaMin;
      rastreamento.status             = RastreamentoStatus.CONCLUIDO;

      const atualizado = await rastreamentoRepo.save(rastreamento);

      // Emitir avanço via WebSocket
      webSocketService.emit('peca:avanco', { action: 'saida', data: atualizado });

      // 5. Handoff Automático (se aplicável)
      // Se for um setor de Handoff Automático (Categoria A), transfere automaticamente para o próximo setor lógico da rota
      if (isSetorHandoffAutomatico) {
        try {
          const ordemRepo = AppDataSource.getRepository(OrdemTeste);
          const ordemObj = await ordemRepo.findOne({ where: { id: ordemTesteId } });
          
          if (ordemObj) {
            const rotaRepo = AppDataSource.getRepository(RotaModelo);
            const rotaAtual = await rotaRepo.findOne({
              where: {
                modeloId: ordemObj.modeloId,
                setorId: setorId,
              },
            });

            if (rotaAtual) {
              // 1. Verifica se existem outros setores com a mesma ordem (irmãos paralelos) na rota do modelo
              const setoresMesmaOrdem = await rotaRepo.find({
                where: {
                  modeloId: ordemObj.modeloId,
                  ordem: rotaAtual.ordem,
                },
              });

              if (setoresMesmaOrdem.length > 1) {
                const setoresIdsParalelos = setoresMesmaOrdem.map(s => s.setorId);

                // Consulta os rastreamentos concluídos para esta ordemTesteId, tipoLote e pecaId nesses setores
                const checkRastreamentoRepo = AppDataSource.getRepository(Rastreamento);
                const queryParalelos = checkRastreamentoRepo.createQueryBuilder('r')
                  .where('r.ordemTesteId = :ordemTesteId', { ordemTesteId })
                  .andWhere('r.tipoLote = :tipoLote', { tipoLote })
                  .andWhere('r.setorId IN (:...setoresIds)', { setoresIds: setoresIdsParalelos })
                  .andWhere('r.status = :status', { status: RastreamentoStatus.CONCLUIDO })
                  .andWhere('r.dataSaida IS NOT NULL');

                if (pecaId) {
                  queryParalelos.andWhere('r.pecaId = :pecaId', { pecaId });
                } else {
                  queryParalelos.andWhere('r.pecaId IS NULL');
                }

                const rastreamentosConcluidos = await queryParalelos.getMany();

                // Mapeia os setores concluídos
                const setoresConcluidosIds = new Set(rastreamentosConcluidos.map(r => r.setorId));

                // Como a saída do setor atual já foi salva logo acima na requisição,
                // nós a adicionamos de forma garantida no Set
                setoresConcluidosIds.add(setorId);

                const todosConcluidos = setoresIdsParalelos.every(id => setoresConcluidosIds.has(id));

                if (!todosConcluidos) {
                  console.log(`[HandoffJoin] Setores paralelos da ordem ${rotaAtual.ordem} nao concluiram todos. Concluidos: ${setoresConcluidosIds.size}/${setoresIdsParalelos.length}. Aguardando conclusao dos demais.`);
                  
                  return res.status(200).json({
                    message: 'Bipagem de saída registrada com sucesso. Aguardando a conclusão dos demais setores paralelos.',
                    rastreamento: atualizado,
                    sla: {
                      tempoTotalMin,
                      tempoPausadoMin,
                      tempoPermanenciaMin,
                      ocorrenciasPausadoras: ocorrencias.length,
                    },
                  });
                }
              }

              // 2. Se todos concluíram (ou só havia 1 setor na ordem atual), prossiga para a próxima ordem (ordem + 1)
              const proximasRotas = await rotaRepo.find({
                where: {
                  modeloId: ordemObj.modeloId,
                  ordem: rotaAtual.ordem + 1,
                },
              });

              if (proximasRotas && proximasRotas.length > 0) {
                const checkRastreamentoRepo = AppDataSource.getRepository(Rastreamento);

                for (const proxima of proximasRotas) {
                  // Verificação de existência para evitar duplicar entradas na próxima etapa
                  const queryExistenteProxima = checkRastreamentoRepo.createQueryBuilder('r')
                    .where('r.ordemTesteId = :ordemTesteId', { ordemTesteId })
                    .andWhere('r.setorId = :setorId', { setorId: proxima.setorId })
                    .andWhere('r.tipoLote = :tipoLote', { tipoLote });
                  
                  if (pecaId) {
                    queryExistenteProxima.andWhere('r.pecaId = :pecaId', { pecaId });
                  } else {
                    queryExistenteProxima.andWhere('r.pecaId IS NULL');
                  }

                  const jaExiste = await queryExistenteProxima.getOne();

                  if (!jaExiste) {
                    // Cria e salva a entrada de cada próximo setor de forma imediata e transparente
                    const proximoRastreamento = rastreamentoRepo.create({
                      ordemTesteId,
                      setorId:          proxima.setorId,
                      tipoLote,
                      pecaId:           pecaId ?? null,
                      operadorEntradaId: operadorId,
                      dataEntrada:      new Date(),
                      status:           RastreamentoStatus.EM_PROCESSO,
                    });
                    const salvoHandoff = await rastreamentoRepo.save(proximoRastreamento);
                    webSocketService.emit('peca:avanco', { action: 'handoff', data: salvoHandoff });
                    console.log(`[Handoff Automático] Peça transferida automaticamente de ${setorId} para ${proxima.setorId}`);
                  } else {
                    console.log(`[Handoff Automático] Evitada duplicidade. Entrada para o setor ${proxima.setorId} já existe.`);
                  }
                }
              }
            }
          }
        } catch (handoffErr) {
          console.error('[Handoff Automático] Falha ao processar transferência:', handoffErr);
        }
      }

      return res.status(200).json({
        message: 'Bipagem de saída registrada com sucesso. Handoff concluído.',
        rastreamento: atualizado,
        sla: {
          tempoTotalMin,
          tempoPausadoMin,
          tempoPermanenciaMin,
          ocorrenciasPausadoras: ocorrencias.length,
        },
      });

    } catch (error) {
      console.error('[RastreamentosController.biparSaida] Erro:', error);
      return res.status(500).json({
        error: 'Erro interno ao registrar bipagem de saída.',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /api/rastreamentos/historico/:ordemTesteId
  // Retorna o histórico cronológico de movimentação de uma Ordem de Teste
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  public getHistorico = async (req: Request, res: Response): Promise<Response> => {
    const ordemTesteId = req.params['ordemTesteId'] as string;

    if (!ordemTesteId || !/^[0-9a-f-]{36}$/i.test(String(ordemTesteId))) {
      return res.status(400).json({
        error: 'ordemTesteId inválido.',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      const rastreamentoRepo = AppDataSource.getRepository(Rastreamento);

      // Retorna todos os rastreamentos ordenados cronologicamente, com
      // informações de setor e operadores para exibição no dashboard
      const historico = await rastreamentoRepo
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.setor', 'setor')
        .leftJoinAndSelect('r.operadorEntrada', 'operadorEntrada')
        .leftJoinAndSelect('r.operadorSaida', 'operadorSaida')
        .leftJoinAndSelect('r.estacao', 'estacao')
        .where('r.ordemTesteId = :ordemTesteId', { ordemTesteId })
        .orderBy('r.dataEntrada', 'ASC')
        .getMany();

      // Enriquece com o tipo do setor (config_opcoes) para o frontend
      const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);
      const historicoComTipoSetor = await Promise.all(
        historico.map(async (r) => {
          let tipoSetor: string | null = null;
          if (r.setor?.tipoOpcaoId) {
            const opcao = await configOpcaoRepo.findOne({
              where: { id: r.setor.tipoOpcaoId },
            });
            tipoSetor = opcao?.valor ?? null;
          }
          return {
            ...r,
            setor: {
              ...r.setor,
              tipoSetor,
            },
          };
        })
      );

      return res.status(200).json({
        ordemTesteId,
        total: historico.length,
        historico: historicoComTipoSetor,
      });

    } catch (error) {
      console.error('[RastreamentosController.getHistorico] Erro:', error);
      return res.status(500).json({
        error: 'Erro interno ao buscar histórico de rastreamento.',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
