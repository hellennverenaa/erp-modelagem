import { DataSource } from 'typeorm';
import { CatalogoPeca } from '../../entities/CatalogoPeca';
import * as fs from 'fs';
import * as path from 'path';

export async function seedCatalogoPecas(dataSource: DataSource): Promise<number> {
  console.log('[DEBUG] Iniciando Seeder do Catálogo de Peças via Raw Parsing (Dados.csv)...');
  const repo = dataSource.getRepository(CatalogoPeca);

  const defaultPath = path.join(process.cwd(), 'docs', 'Dados.csv');
  const parentPath = path.join(process.cwd(), '..', 'docs', 'Dados.csv');
  const csvPath = fs.existsSync(parentPath) ? parentPath : defaultPath;

  if (!fs.existsSync(csvPath)) {
    throw new Error('🛑 ERRO FATAL: ARQUIVO DADOS.CSV NÃO ENCONTRADO NO CAMINHO: ' + csvPath);
  }

  console.log(`[DEBUG] Arquivo Dados.csv localizado em: ${csvPath}`);

  // 1. Leitura do arquivo em string UTF-8 (Raw Parsing sem csv-parser)
  const fileContent = fs.readFileSync(csvPath, 'utf8');

  // 2. Quebra do arquivo em um array de linhas
  const lines = fileContent.split(/\r?\n/);

  let totalSalvos = 0;

  // 3. Loop por cada linha
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();

    // Ignore linhas totalmente em branco
    if (!rawLine) {
      continue;
    }

    // LOG DE VISIBILIDADE OBRIGATÓRIO (Linha Crua)
    console.log('🔍 Lendo linha: ', rawLine.substring(0, 50));

    // Suporta separador por ponto e vírgula ou vírgula (trator de dados)
    const delimiter = rawLine.includes(';') ? ';' : ',';
    const parts = rawLine.split(delimiter).map((p) => p.replace(/^"|"$/g, '').trim());

    if (parts.length < 3) {
      console.warn('⚠️ Ignorando linha por formato insuficiente (< 3 colunas): ', rawLine);
      continue;
    }

    // A informação vital está no índice 2 do array gerado (ex: 021BIQUEIRA ou 026GASPEA)
    const infoVital = parts[2];
    const matchNumero = infoVital ? infoVital.match(/^(\d+)/) : null;

    if (!infoVital || !matchNumero || !matchNumero[1]) {
      console.warn('⚠️ Ignorando linha por falha no Regex: ', rawLine);
      continue;
    }

    const numero = matchNumero[1]; // APENAS os dígitos (ex: 021, 026)

    // Extração do nome da peça
    const matchNomeRaw = infoVital.match(/^\d+(.+)$/);
    const rawTextName = matchNomeRaw ? matchNomeRaw[1].trim() : '';

    let nome = parts[4] && !parts[4].endsWith('_') && parts[4] !== `${numero}_` ? parts[4] : '';
    if (!nome && rawTextName) {
      nome = rawTextName;
    }
    if (!nome && parts[3] && !parts[3].endsWith('_')) {
      nome = parts[3];
    }
    if (!nome) {
      nome = `PECA-${numero}`;
    }

    const codigoOriginal = parts[3] || parts[1] || null;

    // LOG DE SALVAMENTO OBRIGATÓRIO
    console.log(`Salvando peça: ${numero} - ${nome}`);

    // Salvamento no banco de dados via repositório TypeORM
    let peca = await repo.findOne({ where: { numero } });
    if (!peca) {
      peca = repo.create({
        numero,
        nome,
        codigoOriginal,
        descricao: `Peça Técnica ${numero} - ${nome}`,
        ativo: true,
      });
    } else {
      peca.nome = nome;
      peca.codigoOriginal = codigoOriginal;
    }

    await repo.save(peca);
    totalSalvos++;
  }

  console.log(`[SUCESSO] Total de ${totalSalvos} peças técnicas salvas no banco de dados.`);
  return totalSalvos;
}
