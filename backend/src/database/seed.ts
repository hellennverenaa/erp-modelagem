import { AppDataSource } from '../config/database';
import { Marca } from '../entities/Marca';
import { Planta } from '../entities/Planta';
import { Modelo, ModeloStatus } from '../entities/Modelo';
import { ConfigCategoria } from '../entities/ConfigCategoria';
import { ConfigOpcao } from '../entities/ConfigOpcao';

async function runSeed() {
  console.log('Iniciando o Database Seeding...');
  await AppDataSource.initialize();
  console.log('Conexão com o banco estabelecida.');

  try {
    // 1. Inserir Planta Principal
    const plantaRepo = AppDataSource.getRepository(Planta);
    let plantaPrincipal = await plantaRepo.findOne({ where: { nome: 'Planta Principal' } });
    if (!plantaPrincipal) {
      plantaPrincipal = plantaRepo.create({
        nome: 'Planta Principal',
        cidade: 'Matriz',
        ativo: true
      });
      await plantaRepo.save(plantaPrincipal);
      console.log('Planta Principal inserida.');
    } else {
      console.log('Planta Principal já existe.');
    }

    // 2. Inserir Marcas
    const marcaRepo = AppDataSource.getRepository(Marca);
    const marcasNomes = ['Nike', 'Fila', 'Osklen'];
    const marcasCriadas: Record<string, Marca> = {};
    for (const nome of marcasNomes) {
      let marca = await marcaRepo.findOne({ where: { nome } });
      if (!marca) {
        marca = marcaRepo.create({ nome, ativo: true });
        await marcaRepo.save(marca);
        console.log(`Marca '${nome}' inserida.`);
      } else {
        console.log(`Marca '${nome}' já existe.`);
      }
      marcasCriadas[nome] = marca;
    }

    // 3. Inserir ConfigCategoria e ConfigOpcoes
    const categoriaRepo = AppDataSource.getRepository(ConfigCategoria);
    const opcaoRepo = AppDataSource.getRepository(ConfigOpcao);

    const categoriasData = [
      {
        slug: 'setor_tipo',
        nomeExibicao: 'Tipo de Setor',
        descricao: 'Categorização principal dos setores na fábrica',
        opcoes: ['Almoxarifado', 'Navalha', 'Telas', 'Corte', 'Costura', 'Montagem', 'Acabamento']
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
        console.log(`Categoria '${catData.slug}' inserida.`);
      } else {
        console.log(`Categoria '${catData.slug}' já existe.`);
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
          console.log(`Opção '${valorOpcao}' inserida na categoria '${catData.slug}'.`);
        } else {
          console.log(`Opção '${valorOpcao}' já existe na categoria '${catData.slug}'.`);
        }
      }
    }

    // 4. Inserir Modelos
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
        console.log(`Modelo '${modData.nome}' inserido.`);
      } else {
        console.log(`Modelo '${modData.nome}' já existe.`);
      }
    }

    console.log('Database Seeding concluído com sucesso!');
  } catch (error) {
    console.error('Erro durante o Seeding:', error);
  } finally {
    await AppDataSource.destroy();
    console.log('Conexão encerrada.');
  }
}

runSeed();
