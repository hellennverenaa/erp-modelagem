import { DataSource } from 'typeorm';
import { CatalogoItemChecklist } from '../../entities/CatalogoItemChecklist';
import { ConfigCategoria } from '../../entities/ConfigCategoria';
import { ConfigOpcao } from '../../entities/ConfigOpcao';
import * as fs from 'fs';
import * as path from 'path';

// Mapeamento dos nomes dos setores do CSV para os labels/valores cadastrados em config_opcoes (setor_tipo)
const SECTOR_MAP: Record<string, string> = {
  'APOIO': 'Apoio',
  'Pré Costura Costura': 'Costura',
  'Montagem': 'Montagem',
  'Pre-Fabricado': 'Pré-Fabricado',
};

export async function seedCatalogoChecklist(dataSource: DataSource): Promise<number> {
  const itemRepo = dataSource.getRepository(CatalogoItemChecklist);
  const categoriaRepo = dataSource.getRepository(ConfigCategoria);
  const opcaoRepo = dataSource.getRepository(ConfigOpcao);

  // Garantir categoria 'setor_tipo'
  let catSetor = await categoriaRepo.findOne({ where: { slug: 'setor_tipo' } });
  if (!catSetor) {
    catSetor = categoriaRepo.create({
      slug: 'setor_tipo',
      nomeExibicao: 'Tipo de Setor',
      descricao: 'Categorização principal dos setores na fábrica',
      ativo: true,
    });
    await categoriaRepo.save(catSetor);
  }

  // Garantir opções de setor em config_opcoes
  const opcoesMapeadas: Record<string, ConfigOpcao> = {};
  for (const label of ['Apoio', 'Costura', 'Montagem', 'Pré-Fabricado', 'Almoxarifado', 'Navalha', 'Telas', 'Corte', 'Acabamento']) {
    let opcao = await opcaoRepo.findOne({ where: { categoriaId: catSetor.id, valor: label } });
    if (!opcao) {
      opcao = opcaoRepo.create({
        categoria: catSetor,
        valor: label,
        label: label,
        ordem: Object.keys(opcoesMapeadas).length + 1,
        ativo: true,
      });
      await opcaoRepo.save(opcao);
    }
    opcoesMapeadas[label] = opcao;
  }

  // Caminho do arquivo CSV de Checklist
  const csvPath = path.resolve(__dirname, '../../../../docs/Checklist-Modelagem.xlsx-CópiadeTEMPLANTE.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn(`Arquivo ${csvPath} não encontrado para seeding de catalogo_itens_checklist.`);
    return 0;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  let currentSectorCsv = 'APOIO';
  let count = 0;

  // Pula o cabeçalho
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    
    // Se a coluna 0 tiver nome de setor, atualiza o setor corrente
    if (parts[0] && parts[0].length > 0) {
      currentSectorCsv = parts[0];
    }

    const itemNum = parseInt(parts[1], 10);
    const descricao = parts[2];

    if (isNaN(itemNum) || !descricao) continue;

    const sectorLabel = SECTOR_MAP[currentSectorCsv] || currentSectorCsv;
    const opcaoSetor = opcoesMapeadas[sectorLabel] || opcoesMapeadas['Apoio'];

    if (!opcaoSetor) continue;

    let item = await itemRepo.findOne({
      where: {
        setorTipoOpcaoId: opcaoSetor.id,
        numeroItem: itemNum,
      },
    });

    if (!item) {
      item = itemRepo.create({
        setorTipoOpcao: opcaoSetor,
        setorTipoOpcaoId: opcaoSetor.id,
        numeroItem: itemNum,
        descricao,
        tipoResposta: 'OK_NA_PENDENTE',
        obrigatorio: true,
        ordem: itemNum,
        ativo: true,
      });
      await itemRepo.save(item);
      count++;
    }
  }

  console.log(`Seeding CatalogoChecklist: ${count} itens de checklist cadastrados por setor.`);
  return count;
}
