import { DataSource } from 'typeorm';
import { CatalogoPeca } from '../../entities/CatalogoPeca';
import * as fs from 'fs';
import * as path from 'path';

export async function seedCatalogoPecas(dataSource: DataSource): Promise<number> {
  const repo = dataSource.getRepository(CatalogoPeca);
  
  // Caminho do arquivo CSV de Peças
  const csvPath = path.resolve(__dirname, '../../../../docs/Dados.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn(`Arquivo ${csvPath} não encontrado para seeding de catalogo_pecas.`);
    return 0;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  let count = 0;
  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 3) continue;

    const rawNum = parts[2] || '';
    const match = rawNum.match(/^(\d+)(.*)$/);
    if (!match) continue;

    const numero = match[1];
    const rawName = match[2] || '';
    
    let nome = parts[4] || '';
    if (!nome || nome.endsWith('_') || nome === `${numero}_`) {
      nome = rawName || parts[3] || `PECA-${numero}`;
    }

    const codigoOriginal = parts[3] || parts[1] || null;

    let peca = await repo.findOne({ where: { numero } });
    if (!peca) {
      peca = repo.create({
        numero,
        nome,
        codigoOriginal,
        descricao: `Peça Técnica ${numero} - ${nome}`,
        ativo: true,
      });
      await repo.save(peca);
      count++;
    }
  }

  console.log(`Seeding CatalogoPecas: ${count} peças técnicas inseridas/atualizadas.`);
  return count;
}
