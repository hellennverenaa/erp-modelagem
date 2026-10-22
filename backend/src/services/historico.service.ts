import { AppDataSource } from '../config/database';
import { Planta } from '../entities/Planta';
import { Setor } from '../entities/Setor';

export type CategoriaHistorico =
  | 'CONFIGURACAO'
  | 'ORDEM'
  | 'BIPAGEM'
  | 'QUALIDADE'
  | 'OCORRENCIA'
  | 'RETRABALHO'
  | 'CHECKLIST'
  | 'CORTE_APOIO';

export interface EscopoHistorico {
  acessoTodasPlantas: boolean;
  plantaId: string | null;
}

export interface FiltrosHistorico {
  pagina: number;
  limite: number;
  dataInicio?: string;
  dataFim?: string;
  plantaId?: string;
  setorId?: string;
  categoria?: CategoriaHistorico;
  busca?: string;
}

interface LinhaEvento {
  id: string;
  data_hora: Date | string;
  categoria: CategoriaHistorico;
  acao: string;
  descricao: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  planta_id: string | null;
  planta_nome: string | null;
  setor_id: string | null;
  setor_nome: string | null;
  ordem_id: string | null;
  codigo_ordem: string | null;
  entidade_tipo: string;
  entidade_id: string;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  detalhes: Record<string, unknown> | null;
  responsavel_nome: string | null;
  total_linhas: string | number;
}

const EVENTOS_SQL = `
WITH eventos AS (
  SELECT
    'auditoria:' || auditoria.id::text AS id,
    auditoria.created_at AS data_hora,
    'CONFIGURACAO'::text AS categoria,
    auditoria.acao,
    CASE auditoria.acao
      WHEN 'MODELO_CRIADO' THEN 'Modelo criado'
      WHEN 'MODELO_PREVISAO_CORTE_ALTERADA' THEN 'Previsão de corte alterada'
      WHEN 'PECAS_MODELO_CRIADAS' THEN 'Peças do modelo cadastradas'
      WHEN 'PECAS_MODELO_ALTERADAS' THEN 'Peças do modelo alteradas'
      WHEN 'ROTA_CRIADA' THEN 'Rota criada'
      WHEN 'ROTA_ATUALIZADA' THEN 'Rota atualizada'
      WHEN 'PECA_CATALOGO_CRIADA' THEN 'Peça adicionada ao catálogo'
      WHEN 'SLA_ALTERADO' THEN 'SLA da ordem alterado'
      WHEN 'PECA_REMANEJADA' THEN 'Peça remanejada na ordem'
      ELSE 'Alteração de configuração registrada'
    END AS descricao,
    auditoria.usuario_id::text AS usuario_id,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario) AS usuario_nome,
    auditoria.planta_id::text AS planta_id,
    planta.nome AS planta_nome,
    NULL::text AS setor_id,
    NULL::text AS setor_nome,
    ordem.id::text AS ordem_id,
    ordem.codigo_barras AS codigo_ordem,
    auditoria.entidade_tipo,
    auditoria.entidade_id::text AS entidade_id,
    auditoria.dados_anteriores,
    auditoria.dados_novos,
    COALESCE(auditoria.dados_novos, auditoria.dados_anteriores, '{}'::jsonb) AS detalhes,
    NULL::text AS responsavel_nome
  FROM audit_log auditoria
  LEFT JOIN usuarios usuario ON usuario.id = auditoria.usuario_id
  LEFT JOIN plantas planta ON planta.id = auditoria.planta_id
  LEFT JOIN ordens_teste ordem
    ON auditoria.entidade_tipo = 'ordens_teste' AND ordem.id = auditoria.entidade_id

  UNION ALL

  SELECT
    'ordem:' || ordem.id::text,
    ordem.created_at,
    'ORDEM'::text,
    'ORDEM_CRIADA'::text,
    'Ordem de teste criada'::text,
    ordem.criado_por_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    NULL::text,
    NULL::text,
    ordem.id::text,
    ordem.codigo_barras,
    'ordens_teste'::text,
    ordem.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'modelo', modelo.nome,
      'codigoProduto', modelo.codigo_produto
    )),
    NULL::text
  FROM ordens_teste ordem
  JOIN modelos modelo ON modelo.id = ordem.modelo_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  LEFT JOIN usuarios usuario ON usuario.id = ordem.criado_por_id

  UNION ALL

  SELECT
    'bipagem-entrada:' || rastreamento.id::text,
    rastreamento.data_entrada,
    'BIPAGEM'::text,
    'BIPAGEM_ENTRADA'::text,
    'Entrada registrada no setor'::text,
    rastreamento.operador_entrada_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'rastreamentos'::text,
    rastreamento.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'tipoLote', rastreamento."tipoLote",
      'estacao', COALESCE(estacao.descricao, estacao.codigo),
      'pecaId', rastreamento.peca_id
    )),
    NULL::text
  FROM rastreamentos rastreamento
  JOIN ordens_teste ordem ON ordem.id = rastreamento.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = rastreamento.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = rastreamento.operador_entrada_id
  LEFT JOIN estacoes_trabalho estacao ON estacao.id = rastreamento.estacao_id
  WHERE rastreamento.data_entrada IS NOT NULL

  UNION ALL

  SELECT
    'bipagem-saida:' || rastreamento.id::text,
    rastreamento.data_saida,
    'BIPAGEM'::text,
    'BIPAGEM_SAIDA'::text,
    'Saída registrada do setor'::text,
    rastreamento.operador_saida_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'rastreamentos'::text,
    rastreamento.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'tipoLote', rastreamento."tipoLote",
      'estacao', COALESCE(estacao.descricao, estacao.codigo),
      'pecaId', rastreamento.peca_id
    )),
    NULL::text
  FROM rastreamentos rastreamento
  JOIN ordens_teste ordem ON ordem.id = rastreamento.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = rastreamento.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = rastreamento.operador_saida_id
  LEFT JOIN estacoes_trabalho estacao ON estacao.id = rastreamento.estacao_id
  WHERE rastreamento.data_saida IS NOT NULL

  UNION ALL

  SELECT
    'inspecao:' || inspecao.id::text,
    inspecao.data_inspecao,
    'QUALIDADE'::text,
    'INSPECAO_REGISTRADA'::text,
    'Inspeção de qualidade registrada'::text,
    inspecao.inspetor_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'inspecoes'::text,
    inspecao.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'tipo', inspecao."tipoInspecao",
      'tipoLote', inspecao."tipoLote",
      'resultado', inspecao.resultado,
      'observacoes', inspecao.observacoes,
      'pecas', (
        SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'nome', peca.nome,
          'resultado', inspecao_peca.resultado,
          'observacao', inspecao_peca.observacao
        )) ORDER BY peca.nome), '[]'::jsonb)
        FROM inspecao_pecas inspecao_peca
        JOIN pecas peca ON peca.id = inspecao_peca.peca_id
        WHERE inspecao_peca.inspecao_id = inspecao.id
      )
    )),
    NULL::text
  FROM inspecoes inspecao
  JOIN ordens_teste ordem ON ordem.id = inspecao.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = inspecao.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = inspecao.inspetor_id

  UNION ALL

  SELECT
    'ocorrencia-aberta:' || ocorrencia.id::text,
    ocorrencia.data_ocorrencia,
    'OCORRENCIA'::text,
    'OCORRENCIA_REGISTRADA'::text,
    ocorrencia.titulo,
    ocorrencia.reportado_por_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'ocorrencias_producao'::text,
    ocorrencia.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'tipo', ocorrencia.tipo_ocorrencia,
      'gravidade', ocorrencia.gravidade,
      'descricao', ocorrencia.descricao,
      'interrompeSla', ocorrencia.interrompe_sla
    )),
    NULL::text
  FROM ocorrencias_producao ocorrencia
  JOIN ordens_teste ordem ON ordem.id = ocorrencia.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = ocorrencia.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = ocorrencia.reportado_por_id

  UNION ALL

  SELECT
    'ocorrencia-resolvida:' || ocorrencia.id::text,
    ocorrencia.data_resolucao,
    'OCORRENCIA'::text,
    'OCORRENCIA_RESOLVIDA'::text,
    'Ocorrência resolvida: ' || ocorrencia.titulo,
    ocorrencia.resolvido_por_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'ocorrencias_producao'::text,
    ocorrencia.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'resolucao', ocorrencia.resolucao_descricao
    )),
    NULL::text
  FROM ocorrencias_producao ocorrencia
  JOIN ordens_teste ordem ON ordem.id = ocorrencia.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = ocorrencia.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = ocorrencia.resolvido_por_id
  WHERE ocorrencia.data_resolucao IS NOT NULL

  UNION ALL

  SELECT
    'checklist:' || checklist.id::text,
    checklist.data_preenchimento,
    'CHECKLIST'::text,
    'CHECKLIST_PREENCHIDO'::text,
    'Checklist preenchido: ' || template.nome,
    checklist.preenchido_por_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'checklists'::text,
    checklist.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'bloqueante', checklist.bloqueante,
      'observacoes', checklist.observacoes,
      'itens', (
        SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'item', COALESCE(item.descricao_avulsa, item_template.descricao),
          'resposta', item.valor_resposta,
          'conforme', item.conforme,
          'observacao', item.observacao
        )) ORDER BY item_template.ordem NULLS LAST, item.created_at), '[]'::jsonb)
        FROM checklist_itens item
        LEFT JOIN checklist_template_itens item_template ON item_template.id = item.template_item_id
        WHERE item.checklist_id = checklist.id
      )
    )),
    NULL::text
  FROM checklists checklist
  JOIN checklist_templates template ON template.id = checklist.template_id
  JOIN ordens_teste ordem ON ordem.id = checklist.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = checklist.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = checklist.preenchido_por_id

  UNION ALL

  SELECT
    'validacao-setor:' || validacao.id::text,
    validacao.data_validacao,
    'QUALIDADE'::text,
    'SETOR_VALIDADO'::text,
    CASE WHEN validacao.aprovado THEN 'Setor validado' ELSE 'Validação do setor reprovada' END,
    validacao.validador_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'validacoes_setor'::text,
    validacao.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'aprovado', validacao.aprovado,
      'comentario', validacao.comentario
    )),
    NULL::text
  FROM validacoes_setor validacao
  JOIN ordens_teste ordem ON ordem.id = validacao.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = validacao.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = validacao.validador_id

  UNION ALL

  SELECT
    'aprovacao-final:' || aprovacao.id::text,
    aprovacao.data_aprovacao,
    'QUALIDADE'::text,
    'APROVACAO_FINAL'::text,
    'Aprovação final registrada',
    aprovacao.aprovador_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    NULL::text,
    NULL::text,
    ordem.id::text,
    ordem.codigo_barras,
    'aprovacoes_finais'::text,
    aprovacao.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'tipo', aprovacao.tipo,
      'resultado', aprovacao.resultado,
      'justificativa', aprovacao.justificativa
    )),
    NULL::text
  FROM aprovacoes_finais aprovacao
  JOIN ordens_teste ordem ON ordem.id = aprovacao.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  LEFT JOIN usuarios usuario ON usuario.id = aprovacao.aprovador_id

  UNION ALL

  SELECT
    'divergencia-aberta:' || divergencia.id::text,
    divergencia.created_at,
    'QUALIDADE'::text,
    'DIVERGENCIA_REGISTRADA'::text,
    'Divergência registrada',
    divergencia.reportado_por_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'divergencias'::text,
    divergencia.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'tipo', divergencia.tipo_divergencia,
      'gravidade', divergencia.gravidade,
      'descricao', divergencia.descricao,
      'pecaId', divergencia.peca_id
    )),
    NULL::text
  FROM divergencias divergencia
  JOIN ordens_teste ordem ON ordem.id = divergencia.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = divergencia.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = divergencia.reportado_por_id

  UNION ALL

  SELECT
    'divergencia-resolvida:' || divergencia.id::text,
    divergencia.data_resolucao,
    'QUALIDADE'::text,
    'DIVERGENCIA_RESOLVIDA'::text,
    'Divergência resolvida',
    divergencia.resolvido_por_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'divergencias'::text,
    divergencia.id::text,
    NULL::jsonb,
    NULL::jsonb,
    '{}'::jsonb,
    NULL::text
  FROM divergencias divergencia
  JOIN ordens_teste ordem ON ordem.id = divergencia.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = divergencia.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = divergencia.resolvido_por_id
  WHERE divergencia.data_resolucao IS NOT NULL

  UNION ALL

  SELECT
    'retrabalho-criado:' || retrabalho.id::text,
    retrabalho.created_at,
    'RETRABALHO'::text,
    'RETRABALHO_REGISTRADO'::text,
    'Retrabalho registrado',
    NULL::text,
    NULL::text,
    ordem.planta_id::text,
    planta.nome,
    origem.id::text,
    origem.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'retrabalhos'::text,
    retrabalho.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'descricao', retrabalho.descricao,
      'setorDestino', destino.nome,
      'responsavel', COALESCE(NULLIF(BTRIM(responsavel.nome_completo), ''), responsavel.usuario),
      'pecaId', retrabalho.peca_id
    )),
    COALESCE(NULLIF(BTRIM(responsavel.nome_completo), ''), responsavel.usuario)
  FROM retrabalhos retrabalho
  JOIN ordens_teste ordem ON ordem.id = retrabalho.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores origem ON origem.id = retrabalho.setor_origem_id
  JOIN setores destino ON destino.id = retrabalho.setor_destino_id
  LEFT JOIN usuarios responsavel ON responsavel.id = retrabalho.responsavel_id

  UNION ALL

  SELECT
    'retrabalho-iniciado:' || retrabalho.id::text,
    retrabalho.data_inicio,
    'RETRABALHO'::text,
    'RETRABALHO_INICIADO'::text,
    'Execução do retrabalho iniciada',
    NULL::text,
    NULL::text,
    ordem.planta_id::text,
    planta.nome,
    origem.id::text,
    origem.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'retrabalhos'::text,
    retrabalho.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'setorDestino', destino.nome,
      'responsavel', COALESCE(NULLIF(BTRIM(responsavel.nome_completo), ''), responsavel.usuario)
    )),
    COALESCE(NULLIF(BTRIM(responsavel.nome_completo), ''), responsavel.usuario)
  FROM retrabalhos retrabalho
  JOIN ordens_teste ordem ON ordem.id = retrabalho.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores origem ON origem.id = retrabalho.setor_origem_id
  JOIN setores destino ON destino.id = retrabalho.setor_destino_id
  LEFT JOIN usuarios responsavel ON responsavel.id = retrabalho.responsavel_id
  WHERE retrabalho.data_inicio IS NOT NULL

  UNION ALL

  SELECT
    'retrabalho-concluido:' || retrabalho.id::text,
    retrabalho.data_fim,
    'RETRABALHO'::text,
    'RETRABALHO_CONCLUIDO'::text,
    'Retrabalho concluído',
    NULL::text,
    NULL::text,
    ordem.planta_id::text,
    planta.nome,
    origem.id::text,
    origem.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'retrabalhos'::text,
    retrabalho.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'setorDestino', destino.nome,
      'responsavel', COALESCE(NULLIF(BTRIM(responsavel.nome_completo), ''), responsavel.usuario)
    )),
    COALESCE(NULLIF(BTRIM(responsavel.nome_completo), ''), responsavel.usuario)
  FROM retrabalhos retrabalho
  JOIN ordens_teste ordem ON ordem.id = retrabalho.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores origem ON origem.id = retrabalho.setor_origem_id
  JOIN setores destino ON destino.id = retrabalho.setor_destino_id
  LEFT JOIN usuarios responsavel ON responsavel.id = retrabalho.responsavel_id
  WHERE retrabalho.data_fim IS NOT NULL

  UNION ALL

  SELECT
    'etapa-corte:' || etapa.id::text,
    etapa.data_bip,
    'CORTE_APOIO'::text,
    etapa.etapa::text,
    'Etapa de Corte registrada: ' || replace(lower(etapa.etapa::text), '_', ' '),
    etapa.operador_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'etapas_corte'::text,
    etapa.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'estacao', COALESCE(estacao.descricao, estacao.codigo),
      'resultadoConformidade', etapa.resultado_conformidade,
      'observacao', etapa.observacao,
      'pecas', (
        SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'nome', peca.nome,
          'resultado', etapa_peca.resultado_conformidade,
          'observacao', etapa_peca.observacao
        )) ORDER BY peca.nome), '[]'::jsonb)
        FROM etapa_corte_pecas etapa_peca
        JOIN pecas peca ON peca.id = etapa_peca.peca_id
        WHERE etapa_peca.etapa_corte_id = etapa.id
      )
    )),
    NULL::text
  FROM etapas_corte etapa
  JOIN rastreamentos rastreamento ON rastreamento.id = etapa.rastreamento_id
  JOIN ordens_teste ordem ON ordem.id = rastreamento.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = rastreamento.setor_id
  JOIN estacoes_trabalho estacao ON estacao.id = etapa.estacao_id
  LEFT JOIN usuarios usuario ON usuario.id = etapa.operador_id

  UNION ALL

  SELECT
    'etapa-apoio-inicio:' || etapa.id::text,
    etapa.data_inicio,
    'CORTE_APOIO'::text,
    'ETAPA_APOIO_INICIADA'::text,
    'Etapa de Apoio iniciada: ' || replace(lower(etapa.etapa::text), '_', ' '),
    etapa.operador_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'etapas_apoio'::text,
    etapa.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'etapa', etapa.etapa,
      'observacao', etapa.observacao
    )),
    NULL::text
  FROM etapas_apoio etapa
  JOIN rastreamentos rastreamento ON rastreamento.id = etapa.rastreamento_id
  JOIN ordens_teste ordem ON ordem.id = rastreamento.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = rastreamento.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = etapa.operador_id
  WHERE etapa.data_inicio IS NOT NULL

  UNION ALL

  SELECT
    'etapa-apoio-fim:' || etapa.id::text,
    etapa.data_fim,
    'CORTE_APOIO'::text,
    'ETAPA_APOIO_CONCLUIDA'::text,
    'Etapa de Apoio concluída: ' || replace(lower(etapa.etapa::text), '_', ' '),
    etapa.operador_id::text,
    COALESCE(NULLIF(BTRIM(usuario.nome_completo), ''), usuario.usuario),
    ordem.planta_id::text,
    planta.nome,
    setor.id::text,
    setor.nome,
    ordem.id::text,
    ordem.codigo_barras,
    'etapas_apoio'::text,
    etapa.id::text,
    NULL::jsonb,
    NULL::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'etapa', etapa.etapa,
      'observacao', etapa.observacao
    )),
    NULL::text
  FROM etapas_apoio etapa
  JOIN rastreamentos rastreamento ON rastreamento.id = etapa.rastreamento_id
  JOIN ordens_teste ordem ON ordem.id = rastreamento.ordem_teste_id
  JOIN plantas planta ON planta.id = ordem.planta_id
  JOIN setores setor ON setor.id = rastreamento.setor_id
  LEFT JOIN usuarios usuario ON usuario.id = etapa.operador_id
  WHERE etapa.data_fim IS NOT NULL
)
`;

const rotulosCategorias: Array<{ chave: CategoriaHistorico; nome: string }> = [
  { chave: 'CONFIGURACAO', nome: 'Configuração' },
  { chave: 'ORDEM', nome: 'Ordem' },
  { chave: 'BIPAGEM', nome: 'Bipagem' },
  { chave: 'QUALIDADE', nome: 'Qualidade' },
  { chave: 'OCORRENCIA', nome: 'Ocorrência' },
  { chave: 'RETRABALHO', nome: 'Retrabalho' },
  { chave: 'CHECKLIST', nome: 'Checklist' },
  { chave: 'CORTE_APOIO', nome: 'Corte e Apoio' },
];

export async function buscarOpcoesHistorico(escopo: EscopoHistorico) {
  const plantaRepository = AppDataSource.getRepository(Planta);
  const setorRepository = AppDataSource.getRepository(Setor);
  const plantas = escopo.plantaId
    ? await plantaRepository.find({ where: { id: escopo.plantaId }, order: { nome: 'ASC' } })
    : await plantaRepository.find({ order: { nome: 'ASC' } });
  const plantaIds = plantas.map((planta) => planta.id);
  const setores = plantaIds.length === 0
    ? []
    : escopo.plantaId
      ? await setorRepository.find({ where: { plantaId: escopo.plantaId }, order: { nome: 'ASC' } })
      : await setorRepository.find({ order: { nome: 'ASC' } });

  return {
    acessoTodasPlantas: escopo.acessoTodasPlantas,
    plantaId: escopo.plantaId,
    plantas: plantas.map(({ id, nome, ativo }) => ({ id, nome, ativo })),
    setores: setores.map(({ id, nome, plantaId }) => ({ id, nome, plantaId })),
    categorias: rotulosCategorias,
  };
}

function prepararFiltros(escopo: EscopoHistorico, filtros: FiltrosHistorico) {
  const valores: unknown[] = [];
  const condicoes: string[] = [];
  const parametro = (valor: unknown) => {
    valores.push(valor);
    return `$${valores.length}`;
  };

  if (escopo.plantaId) {
    const planta = parametro(escopo.plantaId);
    condicoes.push(`(evento.planta_id = ${planta} OR (
      evento.planta_id IS NULL AND evento.entidade_tipo IN ('modelos', 'catalogo_pecas')
    ))`);
  }

  if (filtros.setorId) {
    condicoes.push(`evento.setor_id = ${parametro(filtros.setorId)}`);
  }
  if (filtros.dataInicio) {
    condicoes.push(`evento.data_hora >= ${parametro(filtros.dataInicio)}::date`);
  }
  if (filtros.dataFim) {
    condicoes.push(`evento.data_hora < (${parametro(filtros.dataFim)}::date + INTERVAL '1 day')`);
  }
  if (filtros.categoria) {
    condicoes.push(`evento.categoria = ${parametro(filtros.categoria)}`);
  }
  if (filtros.busca) {
    const buscaLiteral = filtros.busca.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
    const busca = parametro(`%${buscaLiteral}%`);
    condicoes.push(`(
      evento.descricao ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.usuario_nome, '') ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.responsavel_nome, '') ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.codigo_ordem, '') ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.setor_nome, '') ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.planta_nome, '') ILIKE ${busca} ESCAPE '!'
      OR evento.entidade_id ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.dados_anteriores::text, '') ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.dados_novos::text, '') ILIKE ${busca} ESCAPE '!'
      OR COALESCE(evento.detalhes::text, '') ILIKE ${busca} ESCAPE '!'
    )`);
  }

  return { valores, where: condicoes.length ? condicoes.join(' AND ') : 'TRUE' };
}

function rotularAcao(acao: string): string {
  const rotulos: Record<string, string> = {
    ORDEM_CRIADA: 'Ordem criada',
    BIPAGEM_ENTRADA: 'Entrada bipada',
    BIPAGEM_SAIDA: 'Saída bipada',
    INSPECAO_REGISTRADA: 'Inspeção registrada',
    OCORRENCIA_REGISTRADA: 'Ocorrência registrada',
    OCORRENCIA_RESOLVIDA: 'Ocorrência resolvida',
    CHECKLIST_PREENCHIDO: 'Checklist preenchido',
    SETOR_VALIDADO: 'Validação de setor',
    APROVACAO_FINAL: 'Aprovação final',
    DIVERGENCIA_REGISTRADA: 'Divergência registrada',
    DIVERGENCIA_RESOLVIDA: 'Divergência resolvida',
    RETRABALHO_REGISTRADO: 'Retrabalho registrado',
    RETRABALHO_INICIADO: 'Retrabalho iniciado',
    RETRABALHO_CONCLUIDO: 'Retrabalho concluído',
    REVISAO_MAQUINA: 'Revisão de máquina',
    FECHAMENTO_LOTE: 'Fechamento de lote',
    ETAPA_APOIO_INICIADA: 'Etapa de Apoio iniciada',
    ETAPA_APOIO_CONCLUIDA: 'Etapa de Apoio concluída',
  };
  return rotulos[acao] ?? acao.toLocaleLowerCase('pt-BR').replace(/_/g, ' ');
}

export async function buscarMovimentacoes(
  escopo: EscopoHistorico,
  filtros: FiltrosHistorico,
) {
  const { valores, where } = prepararFiltros(escopo, filtros);
  const paginaSql = `${EVENTOS_SQL}
    SELECT evento.*, COUNT(*) OVER()::bigint AS total_linhas FROM eventos evento
    WHERE ${where}
    ORDER BY evento.data_hora DESC, evento.id DESC
    LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`;
  const paginaValores = [...valores, filtros.limite, (filtros.pagina - 1) * filtros.limite];

  const linhas = await AppDataSource.query(paginaSql, paginaValores) as LinhaEvento[];
  let total = Number(linhas[0]?.total_linhas ?? 0);
  if (linhas.length === 0 && filtros.pagina > 1) {
    const contagem = await AppDataSource.query(
      `${EVENTOS_SQL} SELECT COUNT(*)::bigint AS total FROM eventos evento WHERE ${where}`,
      valores,
    ) as Array<{ total: string | number }>;
    total = Number(contagem[0]?.total ?? 0);
  }

  return {
    itens: linhas.map((evento) => ({
      id: evento.id,
      dataHora: evento.data_hora,
      categoria: evento.categoria,
      acao: evento.acao,
      rotuloAcao: rotularAcao(evento.acao),
      descricao: evento.descricao,
      usuario: evento.usuario_id || evento.usuario_nome
        ? { id: evento.usuario_id, nome: evento.usuario_nome }
        : null,
      responsavel: evento.responsavel_nome,
      planta: evento.planta_id || evento.planta_nome
        ? { id: evento.planta_id, nome: evento.planta_nome }
        : null,
      setor: evento.setor_id || evento.setor_nome
        ? { id: evento.setor_id, nome: evento.setor_nome }
        : null,
      ordem: evento.ordem_id || evento.codigo_ordem
        ? { id: evento.ordem_id, codigoBarras: evento.codigo_ordem }
        : null,
      entidade: { tipo: evento.entidade_tipo, id: evento.entidade_id },
      dadosAnteriores: evento.dados_anteriores,
      dadosNovos: evento.dados_novos,
      detalhes: evento.dados_anteriores || evento.dados_novos || !evento.detalhes || Object.keys(evento.detalhes).length === 0
        ? null
        : evento.detalhes,
    })),
    pagina: filtros.pagina,
    limite: filtros.limite,
    total,
    totalPaginas: Math.ceil(total / filtros.limite),
  };
}

export async function buscarSetorHistorico(setorId: string) {
  return AppDataSource.getRepository(Setor).findOneBy({ id: setorId });
}

export async function buscarPlantaHistorico(plantaId: string) {
  return AppDataSource.getRepository(Planta).findOneBy({ id: plantaId });
}
