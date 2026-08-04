import { AppDataSource } from '../config/database';
import { Marca } from '../entities/Marca';
import { Planta } from '../entities/Planta';
import { Modelo, ModeloStatus } from '../entities/Modelo';
import { ConfigCategoria } from '../entities/ConfigCategoria';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { seedCatalogoPecas } from './seeds/seedCatalogoPecas';
import { seedCatalogoChecklist } from './seeds/seedCatalogoChecklist';

async function runSeed() {
  console.log('==================================================');
  console.log('       INICIANDO DATABASE SEEDING GERAL           ');
  console.log('==================================================');
  
  await AppDataSource.initialize();
  console.log('[OK] Conexão com o banco de dados estabelecida.\n');

  try {
    // 1. Inserir Planta Principal
    console.log('--- [PASSO 1/6] Seeding Planta Principal ---');
    const plantaRepo = AppDataSource.getRepository(Planta);
    let plantaPrincipal = await plantaRepo.findOne({ where: { nome: 'Planta Principal' } });
    if (!plantaPrincipal) {
      plantaPrincipal = plantaRepo.create({
        nome: 'Planta Principal',
        cidade: 'Matriz',
        ativo: true
      });
      await plantaRepo.save(plantaPrincipal);
      console.log('[OK] Planta Principal inserida.');
    } else {
      console.log('[OK] Planta Principal já existe.');
    }

    // 2. Inserir Marcas
    console.log('\n--- [PASSO 2/6] Seeding Marcas ---');
    const marcaRepo = AppDataSource.getRepository(Marca);
    const marcasNomes = ['Nike', 'Fila', 'Osklen'];
    const marcasCriadas: Record<string, Marca> = {};
    for (const nome of marcasNomes) {
      let marca = await marcaRepo.findOne({ where: { nome } });
      if (!marca) {
        marca = marcaRepo.create({ nome, ativo: true });
        await marcaRepo.save(marca);
        console.log(`[OK] Marca '${nome}' inserida.`);
      } else {
        console.log(`[OK] Marca '${nome}' já existe.`);
      }
      marcasCriadas[nome] = marca;
    }

    // 3. Inserir ConfigCategoria e ConfigOpcoes
    console.log('\n--- [PASSO 3/6] Seeding Categorias e Opções de Configuração ---');
    const categoriaRepo = AppDataSource.getRepository(ConfigCategoria);
    const opcaoRepo = AppDataSource.getRepository(ConfigOpcao);

    const categoriasData = [
      {
        slug: 'setor_tipo',
        nomeExibicao: 'Tipo de Setor',
        descricao: 'Categorização principal dos setores na fábrica',
        opcoes: ['Almoxarifado', 'Navalha', 'Telas', 'Corte', 'Apoio', 'Costura', 'Pré-Fabricado', 'Montagem', 'Acabamento']
      },
      {
        slug: 'subsetor_corte',
        nomeExibicao: 'Subtipo de Corte',
        descricao: 'Máquinas e tipos específicos de corte',
        opcoes: ['Lectra', 'Atom', 'Ponte', 'Laser', 'Balancim']
      }
    ];

    for (const catData of categoriasData) {
      let categoria = await categoriaRepo.findOne({ where: { slug: catData.slug } });
      if (!categoria) {
        categoria = categoriaRepo.create({
          slug: catData.slug,
          nomeExibicao: catData.nomeExibicao,
          descricao: catData.descricao,
          ativo: true
        });
        await categoriaRepo.save(categoria);
        console.log(`[OK] Categoria '${catData.slug}' inserida.`);
      } else {
        console.log(`[OK] Categoria '${catData.slug}' já existe.`);
      }

      for (let i = 0; i < catData.opcoes.length; i++) {
        const valorOpcao = catData.opcoes[i];
        let opcao = await opcaoRepo.findOne({ where: { categoriaId: categoria.id, valor: valorOpcao } });
        if (!opcao) {
          opcao = opcaoRepo.create({
            categoria,
            valor: valorOpcao,
            label: valorOpcao,
            ordem: i + 1,
            ativo: true
          });
          await opcaoRepo.save(opcao);
          console.log(`  └─ [OK] Opção '${valorOpcao}' inserida em '${catData.slug}'.`);
        } else {
          console.log(`  └─ [OK] Opção '${valorOpcao}' já existe em '${catData.slug}'.`);
        }
      }
    }

    // 4. Inserir Modelos
    console.log('\n--- [PASSO 4/6] Seeding Modelos Iniciais ---');
    const modeloRepo = AppDataSource.getRepository(Modelo);
    const modelosData = [
      { nome: 'Air Max 90', codigoProduto: 'NK-AM90', marcaNome: 'Nike' },
      { nome: 'Disruptor', codigoProduto: 'FL-DISR', marcaNome: 'Fila' },
      { nome: 'Riva', codigoProduto: 'OS-RIVA', marcaNome: 'Osklen' }
    ];

    for (const modData of modelosData) {
      const marca = marcasCriadas[modData.marcaNome];
      if (!marca) continue;

      let modelo = await modeloRepo.findOne({ where: { codigoProduto: modData.codigoProduto } });
      if (!modelo) {
        modelo = modeloRepo.create({
          nome: modData.nome,
          codigoProduto: modData.codigoProduto,
          marca,
          status: ModeloStatus.CADASTRADO,
          ativo: true
        });
        await modeloRepo.save(modelo);
        console.log(`[OK] Modelo '${modData.nome}' inserido.`);
      } else {
        console.log(`[OK] Modelo '${modData.nome}' já existe.`);
      }
    }

    // 5. Inserir Catálogo de Peças (Dados.csv)
    console.log('\n==================================================');
    console.log('--- [PASSO 5/6] EXECUTANDO SEEDER DE PEÇAS (Dados.csv) ---');
    console.log('==================================================');
    const totalPecas = await seedCatalogoPecas(AppDataSource);
    console.log(`[SUCESSO] Passo 5 concluído: ${totalPecas} peças salvas.\n`);

    // 6. Inserir Catálogo de Itens de Checklist (Checklist-Modelagem.csv)
    console.log('==================================================');
    console.log('--- [PASSO 6/6] EXECUTANDO SEEDER DE CHECKLIST ---');
    console.log('==================================================');
    const totalChecklist = await seedCatalogoChecklist(AppDataSource);
    console.log(`[SUCESSO] Passo 6 concluído: ${totalChecklist} itens de checklist salvos.\n`);

    console.log('==================================================');
    console.log('    DATABASE SEEDING CONCLUÍDO COM SUCESSO!       ');
    console.log('==================================================');
  } catch (error) {
    console.error('ERRO CRÍTICO DURANTE O SEEDING:', error);
  } finally {
    await AppDataSource.destroy();
    console.log('[OK] Conexão com o banco encerrada.');
  }
}

runSeed();
