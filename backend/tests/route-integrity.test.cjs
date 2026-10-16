const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ConfigOpcao } = require('../dist/entities/ConfigOpcao');
const { Planta } = require('../dist/entities/Planta');
const { Setor } = require('../dist/entities/Setor');
const { RouteIntegrityError, validateRouteIntegrity } = require('../dist/services/route-integrity.service');

const plantaId = '00000000-0000-4000-8000-000000000001';
const tiposBase = [
  'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'CORTE_RECEBIMENTO', 'CORTE_SEPARACAO',
  'CORTE_DUBLAGEM', 'CORTE_PONTE', 'CORTE_LECTRA', 'APOIO', 'COSTURA',
  'MONTAGEM', 'LABORATORIO',
];

function criarManager(tiposDaRota) {
  const setores = tiposDaRota.map((tipo, index) => ({
    id: `setor-${index}`,
    plantaId,
    tipoOpcaoId: `tipo-${tipo}`,
    ativo: true,
  }));
  const opcoesDeSetor = tiposDaRota.map((tipo) => ({
    id: `tipo-${tipo}`,
    valor: tipo,
  }));
  const opcoesDeCorte = ['PONTE', 'LECTRA'].map((tipo) => ({
    id: `corte-${tipo}`,
    valor: tipo,
    categoria: { slug: 'subsetor_corte', ativo: true },
  }));

  return {
    getRepository(entity) {
      if (entity === ConfigOpcao) {
        return { find: async (query) => query.relations?.categoria ? opcoesDeCorte : opcoesDeSetor };
      }
      if (entity === Planta) return { findOne: async () => ({ id: plantaId }) };
      if (entity === Setor) return { find: async () => setores };
      throw new Error(`Repository inesperado: ${entity.name}`);
    },
  };
}

function criarRota(tiposDaRota) {
  return tiposDaRota.map((_, index) => ({ setorId: `setor-${index}`, ordem: index + 1 }));
}

const pecas = [
  { setorCorteOpcaoId: 'corte-PONTE' },
  { setorCorteOpcaoId: 'corte-LECTRA' },
];

test('Telas acompanha a ativação de Serigrafia nas novas rotas', async (t) => {
  await t.test('aceita ambos ausentes', async () => {
    const tiposDaRota = [...tiposBase];
    await assert.doesNotReject(() =>
      validateRouteIntegrity(criarManager(tiposDaRota), criarRota(tiposDaRota), pecas, plantaId),
    );
  });

  await t.test('aceita ambos presentes', async () => {
    const tiposDaRota = [...tiposBase, 'SERIGRAFIA', 'TELAS'];
    await assert.doesNotReject(() =>
      validateRouteIntegrity(criarManager(tiposDaRota), criarRota(tiposDaRota), pecas, plantaId),
    );
  });

  await t.test('rejeita Telas sem Serigrafia', async () => {
    const tiposDaRota = [...tiposBase, 'TELAS'];
    await assert.rejects(
      validateRouteIntegrity(criarManager(tiposDaRota), criarRota(tiposDaRota), pecas, plantaId),
      RouteIntegrityError,
    );
  });

  await t.test('rejeita Serigrafia sem Telas', async () => {
    const tiposDaRota = [...tiposBase, 'SERIGRAFIA'];
    await assert.rejects(
      validateRouteIntegrity(criarManager(tiposDaRota), criarRota(tiposDaRota), pecas, plantaId),
      RouteIntegrityError,
    );
  });

  await t.test('mantém compatibilidade ao validar versão histórica fixada na ordem', async () => {
    const tiposDaRota = [...tiposBase, 'TELAS'];
    await assert.doesNotReject(() =>
      validateRouteIntegrity(criarManager(tiposDaRota), criarRota(tiposDaRota), pecas, plantaId, {
        allowLegacyConditionalSectors: true,
      }),
    );
  });
});
