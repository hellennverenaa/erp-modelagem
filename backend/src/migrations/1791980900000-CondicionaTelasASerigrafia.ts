import { MigrationInterface, QueryRunner } from 'typeorm';

interface RotaAtual {
  modeloId: string;
  plantaId: string;
  versao: number;
  possuiSerigrafia: boolean;
  possuiTelas: boolean;
}

interface EtapaRota {
  setorId: string;
  ordem: number;
  obrigatorio: boolean;
  tipoExecucao: string;
  bipagemApenasSaida: boolean;
  tipo: string;
}

/** Cria uma nova versão corrigida sem reescrever versões ligadas a snapshots existentes. */
export class CondicionaTelasASerigrafia1791980900000 implements MigrationInterface {
  name = 'CondicionaTelasASerigrafia1791980900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.normalizarUltimasRotas(queryRunner, false);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A versão anterior do construtor incluía Telas em toda rota.
    await this.normalizarUltimasRotas(queryRunner, true);
  }

  private async normalizarUltimasRotas(queryRunner: QueryRunner, sempreIncluirTelas: boolean): Promise<void> {
    const schema = String((queryRunner.connection.options as { schema?: string }).schema || 'erp_modelagem')
      .replace(/"/g, '""');
    const table = (name: string) => `"${schema}"."${name}"`;

    const rotasAtuais = await queryRunner.query(
      `WITH ultima_versao AS (
         SELECT modelo_id, planta_id, MAX(versao) AS versao
         FROM ${table('rota_modelo')}
         GROUP BY modelo_id, planta_id
       )
       SELECT rota.modelo_id AS "modeloId",
              rota.planta_id AS "plantaId",
              rota.versao AS "versao",
              BOOL_OR(UPPER(TRIM(opcao.valor)) = 'SERIGRAFIA') AS "possuiSerigrafia",
              BOOL_OR(UPPER(TRIM(opcao.valor)) = 'TELAS') AS "possuiTelas"
       FROM ${table('rota_modelo')} rota
       INNER JOIN ultima_versao atual
         ON atual.modelo_id = rota.modelo_id
        AND atual.planta_id = rota.planta_id
        AND atual.versao = rota.versao
       INNER JOIN ${table('setores')} setor ON setor.id = rota.setor_id
       INNER JOIN ${table('config_opcoes')} opcao ON opcao.id = setor.tipo_opcao_id
       INNER JOIN ${table('config_categorias')} categoria
         ON categoria.id = opcao.categoria_id AND categoria.slug = 'setor_tipo'
       GROUP BY rota.modelo_id, rota.planta_id, rota.versao`,
    ) as RotaAtual[];

    for (const rotaAtual of rotasAtuais) {
      const deveIncluirTelas = sempreIncluirTelas || rotaAtual.possuiSerigrafia;
      if (rotaAtual.possuiTelas === deveIncluirTelas) continue;

      const etapasAtuais = await queryRunner.query(
        `SELECT rota.setor_id AS "setorId",
                rota.ordem AS "ordem",
                rota.obrigatorio AS "obrigatorio",
                rota."tipoExecucao" AS "tipoExecucao",
                rota.bipagem_apenas_saida AS "bipagemApenasSaida",
                UPPER(TRIM(opcao.valor)) AS "tipo"
         FROM ${table('rota_modelo')} rota
         INNER JOIN ${table('setores')} setor ON setor.id = rota.setor_id
         INNER JOIN ${table('config_opcoes')} opcao ON opcao.id = setor.tipo_opcao_id
         INNER JOIN ${table('config_categorias')} categoria
           ON categoria.id = opcao.categoria_id AND categoria.slug = 'setor_tipo'
         WHERE rota.modelo_id = $1 AND rota.planta_id = $2 AND rota.versao = $3
         ORDER BY rota.ordem, rota.setor_id`,
        [rotaAtual.modeloId, rotaAtual.plantaId, rotaAtual.versao],
      ) as EtapaRota[];

      let etapasNovas = etapasAtuais.filter((etapa) => deveIncluirTelas || etapa.tipo !== 'TELAS');
      if (deveIncluirTelas && !rotaAtual.possuiTelas) {
        const conferenciaInicial = etapasAtuais.find((etapa) =>
          etapa.tipo === 'ALMOXARIFADO_MODELAGEM' || etapa.tipo === 'NAVALHA',
        );
        if (!conferenciaInicial) {
          throw new Error(
            `Não foi possível normalizar a rota ${rotaAtual.modeloId} da planta ${rotaAtual.plantaId}: falta um setor da Conferência Inicial.`,
          );
        }

        const setoresTelas = await queryRunner.query(
          `SELECT setor.id
           FROM ${table('setores')} setor
           INNER JOIN ${table('config_opcoes')} opcao ON opcao.id = setor.tipo_opcao_id
           INNER JOIN ${table('config_categorias')} categoria
             ON categoria.id = opcao.categoria_id AND categoria.slug = 'setor_tipo'
           WHERE setor.planta_id = $1
             AND setor.ativo = TRUE
             AND opcao.ativo = TRUE
             AND UPPER(TRIM(opcao.valor)) = 'TELAS'
           ORDER BY setor.id
           LIMIT 1`,
          [rotaAtual.plantaId],
        ) as Array<{ id: string }>;
        if (!setoresTelas[0]) {
          throw new Error(
            `Não existe setor Telas ativo na planta ${rotaAtual.plantaId}, exigido por uma rota com Serigrafia.`,
          );
        }

        etapasNovas.push({
          setorId: setoresTelas[0].id,
          ordem: conferenciaInicial.ordem,
          obrigatorio: true,
          tipoExecucao: 'PARALELO',
          bipagemApenasSaida: false,
          tipo: 'TELAS',
        });
      }

      const novaVersao = Number(rotaAtual.versao) + 1;
      for (const etapa of etapasNovas) {
        await queryRunner.query(
          `INSERT INTO ${table('rota_modelo')}
             (modelo_id, planta_id, setor_id, ordem, versao, obrigatorio, "tipoExecucao", bipagem_apenas_saida)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            rotaAtual.modeloId,
            rotaAtual.plantaId,
            etapa.setorId,
            etapa.ordem,
            novaVersao,
            etapa.obrigatorio,
            etapa.tipoExecucao,
            etapa.bipagemApenasSaida,
          ],
        );
      }
    }
  }
}
