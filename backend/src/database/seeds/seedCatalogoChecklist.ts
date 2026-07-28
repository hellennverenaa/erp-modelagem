import { DataSource } from 'typeorm';
import { CatalogoItemChecklist } from '../../entities/CatalogoItemChecklist';
import { ConfigCategoria } from '../../entities/ConfigCategoria';
import { ConfigOpcao } from '../../entities/ConfigOpcao';
import * as fs from 'fs';
import * as path from 'path';

// Função para higienizar e padronizar os nomes de setores lidos da planilha
function normalizarNomeSetor(raw: string): string {
  const limpo = raw.trim();
  if (/apoio/i.test(limpo)) return 'Apoio';
  if (/costura/i.test(limpo)) return 'Costura';
  if (/montagem/i.test(limpo)) return 'Montagem';
  if (/pre-fabricado|pré-fabricado|pre fabricado/i.test(limpo)) return 'Pré-Fabricado';
  if (/almoxarifado/i.test(limpo)) return 'Almoxarifado';
  if (/corte/i.test(limpo)) return 'Corte';
  if (/navalha/i.test(limpo)) return 'Navalha';
  if (/telas/i.test(limpo)) return 'Telas';
  if (/acabamento/i.test(limpo)) return 'Acabamento';
  return limpo;
}

export async function seedCatalogoChecklist(dataSource: DataSource): Promise<number> {
  console.log('[DEBUG] Iniciando Seeder do Catálogo de Checklist (Checklist-Modelagem.csv)...');
  const itemRepo = dataSource.getRepository(CatalogoItemChecklist);
  const categoriaRepo = dataSource.getRepository(ConfigCategoria);
  const opcaoRepo = dataSource.getRepository(ConfigOpcao);

  // 1. Garantir que a categoria 'setor_tipo' existe em config_categorias
  let catSetor = await categoriaRepo.findOne({ where: { slug: 'setor_tipo' } });
  if (!catSetor) {
    catSetor = categoriaRepo.create({
      slug: 'setor_tipo',
      nomeExibicao: 'Tipo de Setor',
      descricao: 'Categorização principal dos setores na fábrica',
      ativo: true,
    });
    await categoriaRepo.save(catSetor);
    console.log("[DEBUG] Categoria 'setor_tipo' criada em config_categorias.");
  }

  // Caminho do arquivo CSV de Checklist
  const candidatePaths = [
    path.resolve(__dirname, '../../../../docs/Checklist-Modelagem.xlsx-CópiadeTEMPLANTE.csv'),
    path.resolve(process.cwd(), '../docs/Checklist-Modelagem.xlsx-CópiadeTEMPLANTE.csv'),
    path.resolve(process.cwd(), 'docs/Checklist-Modelagem.xlsx-CópiadeTEMPLANTE.csv'),
    path.resolve(__dirname, '../../../docs/Checklist-Modelagem.xlsx-CópiadeTEMPLANTE.csv'),
  ];
  const csvPath = candidatePaths.find((p) => fs.existsSync(p));

  if (!csvPath) {
    console.warn(`[WARN] Arquivo Checklist CSV não encontrado em nenhuma das rotas buscadas:`, candidatePaths);
    return 0;
  }

  console.log(`[DEBUG] Arquivo Checklist CSV localizado em: ${csvPath}`);

  const content = fs.readFileSync(csvPath, 'utf8');
  const rawLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  console.log(`[DEBUG] Checklist CSV lido. Total de linhas não-vazias: ${rawLines.length}`);

  let currentSectorName = 'Apoio';
  let countInserted = 0;
  let countUpdated = 0;
  let lineIndex = 0;

  for (const line of rawLines) {
    lineIndex++;

    // Ignorar cabeçalho inicial sujo se contiver "Check List Modelagem"
    if (line.includes('Check List Modelagem') && lineIndex === 1) {
      console.log(`[DEBUG Linha ${lineIndex}] Pulando cabeçalho principal da planilha.`);
      continue;
    }

    // Detectar delimitador (; ou ,)
    const delimiter = line.includes(';') ? ';' : ',';
    const parts = line.split(delimiter).map((p) => p.replace(/^"|"$/g, '').trim());

    // Se a coluna 0 tiver um nome de setor válido (texto não numérico), atualiza o setor corrente
    if (parts[0] && parts[0].length > 0 && isNaN(Number(parts[0]))) {
      currentSectorName = normalizarNomeSetor(parts[0]);
      console.log(`[DEBUG Linha ${lineIndex}] Setor detectado na Coluna 0: '${parts[0]}' => Setor Normalizado: '${currentSectorName}'`);
    }

    const itemNum = parseInt(parts[1], 10);
    const descricao = parts[2] ? parts[2].trim() : '';

    // Ignorar linhas sem número de item ordinal ou sem descrição
    if (isNaN(itemNum) || !descricao) {
      continue;
    }

    // Upsert dinâmico da ConfigOpcao para o setor no banco de dados
    let opcaoSetor = await opcaoRepo.findOne({
      where: { categoriaId: catSetor.id, valor: currentSectorName },
    });

    if (!opcaoSetor) {
      const countOpcoes = await opcaoRepo.count({ where: { categoriaId: catSetor.id } });
      opcaoSetor = opcaoRepo.create({
        categoria: catSetor,
        valor: currentSectorName,
        label: currentSectorName,
        ordem: countOpcoes + 1,
        ativo: true,
      });
      await opcaoRepo.save(opcaoSetor);
      console.log(`[DEBUG] ConfigOpcao criada dinamicamente: '${currentSectorName}' na categoria 'setor_tipo'`);
    }

    if (itemNum <= 5 || itemNum % 25 === 0 || itemNum === 153) {
      console.log(`[DEBUG Linha ${lineIndex}] Item #${itemNum} [Setor: ${currentSectorName}] => '${descricao}'`);
    }

    // Inserir / atualizar item em catalogo_itens_checklist
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
      countInserted++;
    } else {
      item.descricao = descricao;
      item.ordem = itemNum;
      await itemRepo.save(item);
      countUpdated++;
    }
  }

  console.log(`[DEBUG] Finalizado Seeder CatalogoChecklist. Novos: ${countInserted}, Atualizados: ${countUpdated}`);
  return countInserted + countUpdated;
}
