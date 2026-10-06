import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource } from '../config/database';
import { CatalogoPeca } from '../entities/CatalogoPeca';

const EXPECTED_HEADER = ['col1', 'col2', 'col3', 'col4', 'col5'];
const TARGET_SCHEMA = 'erp_modelagem';
const TARGET_TABLE = 'catalogo_pecas';

interface ImportRow {
  line: number;
  numero: string;
  nome: string;
  codigoOriginal: string | null;
  descricao: string;
}

interface RejectedRow {
  line: number;
  reason: string;
}

interface ParsedFile {
  rows: ImportRow[];
  rejected: RejectedRow[];
  dataRows: number;
}

interface ImportPlan {
  inserts: ImportRow[];
  updates: CatalogoPeca[];
  unchanged: number;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index++;
      } else if (quoted) {
        quoted = false;
      } else if (field.length === 0) {
        quoted = true;
      } else {
        field += char;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      fields.push(field.trim());
      field = '';
      continue;
    }

    field += char;
  }

  if (quoted) {
    throw new Error('Campo entre aspas sem fechamento.');
  }

  fields.push(field.trim());
  return fields;
}

function detectarDelimitador(headerLine: string): string {
  return (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';
}

function parseCsv(filePath: string): ParsedFile {
  const contents = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = contents.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);

  if (headerIndex < 0) {
    throw new Error('O CSV está vazio.');
  }

  const delimiter = detectarDelimitador(lines[headerIndex]);
  const header = parseCsvLine(lines[headerIndex], delimiter).map((field) => field.toLowerCase());
  if (header.length !== EXPECTED_HEADER.length || header.some((field, index) => field !== EXPECTED_HEADER[index])) {
    throw new Error(`Cabeçalho inválido. Esperado: ${EXPECTED_HEADER.join(delimiter)}.`);
  }

  const rows: ImportRow[] = [];
  const rejected: RejectedRow[] = [];
  const seenNumbers = new Set<string>();
  let dataRows = 0;

  for (let index = headerIndex + 1; index < lines.length; index++) {
    const rawLine = lines[index];
    if (!rawLine.trim()) continue;
    dataRows++;

    let fields: string[];
    try {
      fields = parseCsvLine(rawLine, delimiter);
    } catch (error: any) {
      rejected.push({ line: index + 1, reason: error.message || 'Linha CSV inválida.' });
      continue;
    }

    if (fields.length !== EXPECTED_HEADER.length) {
      rejected.push({ line: index + 1, reason: `Esperadas 5 colunas; encontradas ${fields.length}.` });
      continue;
    }

    const infoVital = fields[2];
    const matchNumero = infoVital.match(/^(\d+)(.*)$/);
    if (!matchNumero) {
      rejected.push({ line: index + 1, reason: 'A coluna col3 não começa com o número da peça.' });
      continue;
    }

    const numero = matchNumero[1];
    const nomePorGrupo = matchNumero[2].trim();
    let nome = fields[4] && !fields[4].endsWith('_') && fields[4] !== `${numero}_` ? fields[4] : '';
    if (!nome && nomePorGrupo) nome = nomePorGrupo;
    if (!nome && fields[3] && !fields[3].endsWith('_')) nome = fields[3];
    if (!nome) nome = `PECA-${numero}`;

    const codigoOriginal = fields[3] || fields[1] || null;
    if (numero.length > 50 || nome.length > 200 || (codigoOriginal && codigoOriginal.length > 100)) {
      rejected.push({ line: index + 1, reason: 'Número, nome ou código excede o limite suportado pelo catálogo.' });
      continue;
    }

    if (seenNumbers.has(numero)) {
      rejected.push({ line: index + 1, reason: `Número ${numero} aparece mais de uma vez no CSV.` });
      continue;
    }
    seenNumbers.add(numero);

    rows.push({
      line: index + 1,
      numero,
      nome,
      codigoOriginal,
      descricao: `Peça Técnica ${numero} - ${nome}`,
    });
  }

  return { rows, rejected, dataRows };
}

function buildImportPlan(rows: ImportRow[], existing: CatalogoPeca[]): ImportPlan {
  const existingByNumber = new Map(existing.map((record) => [record.numero, record]));
  const inserts: ImportRow[] = [];
  const updates: CatalogoPeca[] = [];
  let unchanged = 0;

  for (const row of rows) {
    const current = existingByNumber.get(row.numero);
    if (!current) {
      inserts.push(row);
      continue;
    }

    const changed = current.nome !== row.nome
      || current.codigoOriginal !== row.codigoOriginal
      || current.descricao !== row.descricao;
    if (!changed) {
      unchanged++;
      continue;
    }

    current.nome = row.nome;
    current.codigoOriginal = row.codigoOriginal;
    current.descricao = row.descricao;
    // A importação não reativa registros que alguém desativou manualmente.
    updates.push(current);
  }

  return { inserts, updates, unchanged };
}

function printReport(input: {
  mode: 'prévia' | 'importação';
  source: string;
  dataRows: number;
  plan: ImportPlan;
  rejected: RejectedRow[];
  inserted?: number;
  updated?: number;
}) {
  const report = {
    modo: input.mode,
    arquivo: input.source,
    destino: `${TARGET_SCHEMA}.${TARGET_TABLE}`,
    linhasDeDados: input.dataRows,
    validas: input.dataRows - input.rejected.length,
    inseridas: input.inserted ?? input.plan.inserts.length,
    atualizadas: input.updated ?? input.plan.updates.length,
    semAlteracao: input.plan.unchanged,
    rejeitadas: input.rejected.length,
    detalhesRejeicao: input.rejected.slice(0, 20),
  };
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== '--apply' && arg !== '--dry-run');
  if (unknownArgs.length > 0) {
    throw new Error('Uso: npm run import:catalogo-pecas [-- --dry-run|--apply]');
  }

  const applyChanges = args.includes('--apply');
  const sourcePath = path.resolve(__dirname, '../../../docs/Dados.csv');
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Arquivo canônico não encontrado: ${sourcePath}`);
  }

  const parsed = parseCsv(sourcePath);
  await AppDataSource.initialize();
  try {
    if (!applyChanges) {
      const existing = await AppDataSource.getRepository(CatalogoPeca).find();
      const plan = buildImportPlan(parsed.rows, existing);
      printReport({ mode: 'prévia', source: 'docs/Dados.csv', dataRows: parsed.dataRows, plan, rejected: parsed.rejected });
      console.log('Prévia somente leitura. Para gravar, execute: npm run import:catalogo-pecas -- --apply');
      return;
    }

    if (parsed.rejected.length > 0) {
      const existing = await AppDataSource.getRepository(CatalogoPeca).find();
      const plan = buildImportPlan(parsed.rows, existing);
      printReport({ mode: 'prévia', source: 'docs/Dados.csv', dataRows: parsed.dataRows, plan, rejected: parsed.rejected });
      throw new Error('Importação cancelada sem gravações: corrija as linhas rejeitadas e rode a prévia novamente.');
    }

    const result = await AppDataSource.transaction(async (manager) => {
      // Serializa importações simultâneas sem bloquear leituras do catálogo.
      await manager.query('LOCK TABLE "erp_modelagem"."catalogo_pecas" IN SHARE ROW EXCLUSIVE MODE');
      const repository = manager.getRepository(CatalogoPeca);
      const existing = await repository.find();
      const plan = buildImportPlan(parsed.rows, existing);

      const newRecords = plan.inserts.map(({ numero, nome, codigoOriginal, descricao }) =>
        repository.create({ numero, nome, codigoOriginal, descricao, ativo: true })
      );
      if (newRecords.length > 0) {
        await repository.save(newRecords, { chunk: 100 });
      }
      if (plan.updates.length > 0) {
        await repository.save(plan.updates, { chunk: 100 });
      }

      return { plan, inserted: newRecords.length, updated: plan.updates.length };
    });

    printReport({
      mode: 'importação',
      source: 'docs/Dados.csv',
      dataRows: parsed.dataRows,
      plan: result.plan,
      rejected: parsed.rejected,
      inserted: result.inserted,
      updated: result.updated,
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`[Importador de catálogo] ${error.message || error}`);
  process.exitCode = 1;
});
