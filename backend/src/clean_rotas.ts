import { AppDataSource } from './config/database';
import { RotaModelo } from './entities/RotaModelo';
import { Setor } from './entities/Setor';
import { ConfigOpcao } from './entities/ConfigOpcao';

async function main() {
  await AppDataSource.initialize();
  const setorRepo = AppDataSource.getRepository(Setor);
  const rotaRepo = AppDataSource.getRepository(RotaModelo);
  const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);

  // Find the 'CORTE_SEPARACAO' config opcao
  const opcaoSeparacao = await configOpcaoRepo.findOne({ where: [ { valor: 'CORTE_SEPARACAO' }, { valor: 'SEPARACAO_CORTE' } ] });

  if (opcaoSeparacao) {
    console.log('Opção de separação encontrada:', opcaoSeparacao.id);
    const setoresSeparacao = await setorRepo.find({ where: { tipoOpcaoId: opcaoSeparacao.id } });
    
    for (const setor of setoresSeparacao) {
      console.log('Setor separação encontrado:', setor.id);
      const rotas = await rotaRepo.find({ where: { setorId: setor.id } });
      console.log('Rotas apontando para separação:', rotas.length);
      if (rotas.length > 0) {
        await rotaRepo.remove(rotas);
        console.log('Rotas órfãs removidas.');
      }
    }
  } else {
    console.log('Opção de separação não encontrada.');
  }

  // Check ordering
  const modelos = await rotaRepo.createQueryBuilder('r').select('r.modeloId').distinct(true).getRawMany();
  for (const row of modelos) {
    const modeloId = row.modeloId || row.r_modeloId;
    const rotasModelo = await rotaRepo.find({ where: { modeloId }, order: { ordem: 'ASC' } });
    let count = 1;
    for (const rm of rotasModelo) {
      if (rm.ordem !== count) {
         rm.ordem = count;
         await rotaRepo.save(rm);
      }
      count++;
    }
  }
  console.log('Ordenação linear atualizada.');
  await AppDataSource.destroy();
}
main().catch(console.error);
