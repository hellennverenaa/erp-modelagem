import { AppDataSource } from './config/database';
import { RotaModelo } from './entities/RotaModelo';

async function main() {
  await AppDataSource.initialize();
  const rotaRepo = AppDataSource.getRepository(RotaModelo);
  
  // Get all unique model IDs
  const distinctModelos = await rotaRepo
    .createQueryBuilder('rm')
    .select('DISTINCT rm.modeloId', 'modeloId')
    .getRawMany();

  let affectedCount = 0;
  for (const row of distinctModelos) {
    const modeloId = row.modeloId;
    if (!modeloId) continue;
    
    // Sort rotas of this model by existing ordem
    const rotasModelo = await rotaRepo.find({ 
      where: { modeloId }, 
      order: { ordem: 'ASC' } 
    });
    
    let count = 1;
    for (const rm of rotasModelo) {
      if (rm.ordem !== count) {
         rm.ordem = count;
         await rotaRepo.save(rm);
         affectedCount++;
      }
      count++;
    }
  }
  console.log('Ordenação linear atualizada. Total de reordenações:', affectedCount);
  await AppDataSource.destroy();
}
main().catch(console.error);
