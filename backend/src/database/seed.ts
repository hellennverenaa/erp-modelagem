import { AppDataSource } from '../config/database';
import { Planta } from '../entities/Planta';
import { Marca } from '../entities/Marca';
import { Setor } from '../entities/Setor';
import { ConfigCategoria } from '../entities/ConfigCategoria';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { EstacaoTrabalho } from '../entities/EstacaoTrabalho';
import { Perfil } from '../entities/Perfil';
import { Usuario } from '../entities/Usuario';
import { Modelo, ModeloStatus } from '../entities/Modelo';
import { Peca } from '../entities/Peca';
import { CatalogoPeca } from '../entities/CatalogoPeca';
import { RotaModelo, TipoExecucao } from '../entities/RotaModelo';
import { OrdemTeste, OrdemTesteStatus } from '../entities/OrdemTeste';
import { Rastreamento, RastreamentoStatus, TipoLote } from '../entities/Rastreamento';
import { OcorrenciaProducao, TipoOcorrencia, GravidadeOcorrencia, StatusOcorrencia } from '../entities/OcorrenciaProducao';
import { Inspecao, TipoInspecao, ResultadoInspecao } from '../entities/Inspecao';
import { Divergencia } from '../entities/Divergencia';
import { Retrabalho } from '../entities/Retrabalho';
import { CatalogoItemChecklist } from '../entities/CatalogoItemChecklist';
import { ChecklistTemplate } from '../entities/ChecklistTemplate';
import { ChecklistTemplateItem } from '../entities/ChecklistTemplateItem';
import { seedCatalogoPecas } from './seeds/seedCatalogoPecas';
import { garantirTicketsSetorDaOrdem } from '../services/ticket-setor.service';

const SETORES_CONFIG = [
  { nome: 'Almoxarifado da Modelagem', tipo: 'ALMOXARIFADO_MODELAGEM', ordem: 1, condicional: false, slaPadrao: 60 },
  { nome: 'Navalha', tipo: 'NAVALHA', ordem: 1, condicional: false, slaPadrao: 60 },
  { nome: 'Telas', tipo: 'TELAS', ordem: 1, condicional: true, slaPadrao: 60 },
  { nome: 'Corte Dublagem', tipo: 'CORTE_DUBLAGEM', ordem: 4, condicional: false, slaPadrao: 60 },
  { nome: 'Corte Ponte', tipo: 'CORTE_PONTE', ordem: 5, condicional: false, slaPadrao: 90 },
  { nome: 'Corte Lectra', tipo: 'CORTE_LECTRA', ordem: 5, condicional: false, slaPadrao: 90 },
  { nome: 'Corte Atom', tipo: 'CORTE_ATOM', ordem: 5, condicional: true, slaPadrao: 60 },
  { nome: 'Corte CN', tipo: 'CORTE_CN', ordem: 5, condicional: true, slaPadrao: 60 },
  { nome: 'Corte Couro', tipo: 'CORTE_COURO', ordem: 5, condicional: true, slaPadrao: 60 },
  { nome: 'Corte Laser', tipo: 'CORTE_LASER', ordem: 5, condicional: true, slaPadrao: 60 },
  { nome: 'Serigrafia', tipo: 'SERIGRAFIA', ordem: 6, condicional: true, slaPadrao: 90 },
  { nome: 'Apoio', tipo: 'APOIO', ordem: 7, condicional: false, slaPadrao: 120 },
  { nome: 'Bordado', tipo: 'BORDADO', ordem: 8, condicional: true, slaPadrao: 90 },
  { nome: 'Costura Programada', tipo: 'COSTURA_PROGRAMADA', ordem: 8, condicional: true, slaPadrao: 90 },
  { nome: 'Costura', tipo: 'COSTURA', ordem: 9, condicional: false, slaPadrao: 180 },
  { nome: 'Pré-Fabricado', tipo: 'PRE_FABRICADO', ordem: 10, condicional: true, slaPadrao: 120 },
  { nome: 'Montagem', tipo: 'MONTAGEM', ordem: 11, condicional: false, slaPadrao: 180 },
  { nome: 'Vulcanizado', tipo: 'VULCANIZADO', ordem: 11, condicional: true, slaPadrao: 120 },
  { nome: 'Laboratório', tipo: 'LABORATORIO', ordem: 12, condicional: false, slaPadrao: 120 },
];

async function runSeed() {
  console.log('==================================================');
  console.log('       INICIANDO DATABASE SEEDING COMPLETO        ');
  console.log('==================================================');

  await AppDataSource.initialize();
  console.log('[OK] Conexão com o banco de dados estabelecida.\n');

  try {
    // ------------------------------------------------------------------
    // PASSO 1: Configuração de Categorias e Opções
    // ------------------------------------------------------------------
    console.log('--- [PASSO 1/11] Configurações de Categorias e Opções ---');
    const categoriaRepo = AppDataSource.getRepository(ConfigCategoria);
    const opcaoRepo = AppDataSource.getRepository(ConfigOpcao);

    let catSetorTipo = await categoriaRepo.findOne({ where: { slug: 'setor_tipo' } });
    if (!catSetorTipo) {
      catSetorTipo = await categoriaRepo.save(
        categoriaRepo.create({
          slug: 'setor_tipo',
          nomeExibicao: 'Tipo de Setor',
          descricao: 'Categorização principal dos setores na fábrica',
          ativo: true,
        }),
      );
    }

    let catSubsetorCorte = await categoriaRepo.findOne({ where: { slug: 'subsetor_corte' } });
    if (!catSubsetorCorte) {
      catSubsetorCorte = await categoriaRepo.save(
        categoriaRepo.create({
          slug: 'subsetor_corte',
          nomeExibicao: 'Subtipo de Corte',
          descricao: 'Máquinas e tipos específicos de corte',
          ativo: true,
        }),
      );
    }

    const opcoesSetorTipoMap = new Map<string, ConfigOpcao>();
    for (let i = 0; i < SETORES_CONFIG.length; i++) {
      const s = SETORES_CONFIG[i];
      let opc = await opcaoRepo.findOne({
        where: { categoriaId: catSetorTipo.id, valor: s.tipo },
      });
      if (!opc) {
        opc = await opcaoRepo.save(
          opcaoRepo.create({
            categoria: catSetorTipo,
            valor: s.tipo,
            label: s.nome,
            ordem: s.ordem,
            ativo: true,
          }),
        );
      }
      opcoesSetorTipoMap.set(s.tipo, opc);
    }

    const subsetoresCorteData = ['Lectra', 'Atom', 'Ponte', 'CN', 'Couro', 'Laser', 'Balancim'];
    const opcoesCorteMap = new Map<string, ConfigOpcao>();
    for (let i = 0; i < subsetoresCorteData.length; i++) {
      const valor = subsetoresCorteData[i];
      let opc = await opcaoRepo.findOne({
        where: { categoriaId: catSubsetorCorte.id, valor },
      });
      if (!opc) {
        opc = await opcaoRepo.save(
          opcaoRepo.create({
            categoria: catSubsetorCorte,
            valor,
            label: valor,
            ordem: i + 1,
            ativo: true,
          }),
        );
      }
      opcoesCorteMap.set(valor.toLowerCase(), opc);
    }
    console.log('[OK] Categorias e opções de configuração sincronizadas.');

    // ------------------------------------------------------------------
    // PASSO 2: Plantas e Setores
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 2/11] Plantas e Setores Operacionais ---');
    const plantaRepo = AppDataSource.getRepository(Planta);
    const setorRepo = AppDataSource.getRepository(Setor);

    let plantaPadrao = await plantaRepo.findOne({ where: { nome: 'Planta Padrão' } });
    if (!plantaPadrao) {
      plantaPadrao = await plantaRepo.save(
        plantaRepo.create({
          nome: 'Planta Padrão',
          endereco: 'Endereço Padrão',
          cidade: 'Cidade Padrão',
          estado: 'EX',
          ativo: true,
        }),
      );
    }

    let plantaPrincipal = await plantaRepo.findOne({ where: { nome: 'Planta Principal' } });
    if (!plantaPrincipal) {
      plantaPrincipal = await plantaRepo.save(
        plantaRepo.create({
          nome: 'Planta Principal',
          endereco: 'Av. Industrial, 1000',
          cidade: 'Matriz',
          estado: 'SP',
          ativo: true,
        }),
      );
    }

    const plantas = [plantaPadrao, plantaPrincipal];
    const setoresPadraoMap = new Map<string, Setor>();

    for (const planta of plantas) {
      for (const s of SETORES_CONFIG) {
        const opcaoTipo = opcoesSetorTipoMap.get(s.tipo);
        if (!opcaoTipo) continue;

        let setor = await setorRepo.findOne({
          where: { plantaId: planta.id, nome: s.nome },
        });

        if (!setor) {
          setor = await setorRepo.save(
            setorRepo.create({
              planta,
              nome: s.nome,
              tipoOpcaoId: opcaoTipo.id,
              ordemFluxo: s.ordem,
              isCondicional: s.condicional,
              ativo: true,
            }),
          );
        } else if (!setor.tipoOpcaoId || setor.ordemFluxo !== s.ordem) {
          setor.tipoOpcaoId = opcaoTipo.id;
          setor.ordemFluxo = s.ordem;
          setor.isCondicional = s.condicional;
          await setorRepo.save(setor);
        }

        if (planta.id === plantaPadrao.id) {
          setoresPadraoMap.set(s.tipo, setor);
        }
      }
    }
    console.log(`[OK] 19 setores provisionados para cada planta (${plantas.length} plantas).`);

    // ------------------------------------------------------------------
    // PASSO 3: Marcas
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 3/11] Marcas ---');
    const marcaRepo = AppDataSource.getRepository(Marca);
    const marcasNomes = ['Nike', 'Fila', 'Osklen', 'Olympikus', 'Mizuno', 'Adidas'];
    const marcasMap = new Map<string, Marca>();

    for (const nome of marcasNomes) {
      let marca = await marcaRepo.findOne({ where: { nome } });
      if (!marca) {
        marca = await marcaRepo.save(marcaRepo.create({ nome, ativo: true }));
        console.log(`  └─ [OK] Marca '${nome}' criada.`);
      }
      marcasMap.set(nome, marca);
    }

    // ------------------------------------------------------------------
    // PASSO 4: Catálogo de Peças (Dados.csv)
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 4/11] Catálogo de Peças Técnicas (Dados.csv) ---');
    const totalPecas = await seedCatalogoPecas(AppDataSource);
    console.log(`[OK] Catálogo de peças disponível (${totalPecas} peças).`);

    // ------------------------------------------------------------------
    // PASSO 5: Estações de Trabalho
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 5/11] Estações de Trabalho e Máquinas ---');
    const estacaoRepo = AppDataSource.getRepository(EstacaoTrabalho);
    const estacoesData = [
      { codigo: 'LEC-01', tipo: 'CORTE_LECTRA', desc: 'Lectra Vector Fashion iX', equipamento: 'Mesa de Corte Automático' },
      { codigo: 'PON-01', tipo: 'CORTE_PONTE', desc: 'Prensa Ponte S530 Atom', equipamento: 'Prensa Balancim Ponte' },
      { codigo: 'ATM-01', tipo: 'CORTE_ATOM', desc: 'Atom FlashCut 888', equipamento: 'Mesa Faca Oscilante' },
      { codigo: 'LAS-01', tipo: 'CORTE_LASER', desc: 'Laser Sei Mercury 600', equipamento: 'Corte a Laser CO2' },
      { codigo: 'SER-01', tipo: 'SERIGRAFIA', desc: 'Carrossel M&R Diamondback', equipamento: 'Carrossel Serigráfico Automático' },
      { codigo: 'APO-01', tipo: 'APOIO', desc: 'Prensa Térmica Transfer 40x50', equipamento: 'Prensa Térmica Pneumática' },
      { codigo: 'COS-01', tipo: 'COSTURA', desc: 'Brother S-7300A Transporte Triplo', equipamento: 'Máquina Reta Transporte Triplo' },
      { codigo: 'COS-02', tipo: 'COSTURA', desc: 'Pfaff 1295 Pesponto Duplo', equipamento: 'Pesponto Duplo Eletrônica' },
      { codigo: 'MON-01', tipo: 'MONTAGEM', desc: 'Conformadeira de Bico Iron Fox', equipamento: 'Conformadeira Hidráulica' },
      { codigo: 'MON-02', tipo: 'MONTAGEM', desc: 'Estufa Reativadora Flash', equipamento: 'Estufa Infravermelho' },
      { codigo: 'LAB-01', tipo: 'LABORATORIO', desc: 'Dinamômetro Tensil Kratos 500kg', equipamento: 'Ensaio de Tração/Adesão' },
    ];

    const estacoesMap = new Map<string, EstacaoTrabalho>();
    for (const est of estacoesData) {
      const setor = setoresPadraoMap.get(est.tipo);
      if (!setor) continue;

      let estacao = await estacaoRepo.findOne({ where: { codigo: est.codigo } });
      if (!estacao) {
        estacao = await estacaoRepo.save(
          estacaoRepo.create({
            setor,
            codigo: est.codigo,
            descricao: est.desc,
            tipoEquipamento: est.equipamento,
            ativo: true,
          }),
        );
      }
      estacoesMap.set(est.codigo, estacao);
    }
    console.log(`[OK] ${estacoesMap.size} estações de trabalho sincronizadas.`);

    // ------------------------------------------------------------------
    // PASSO 6: Perfis e Usuários / Crachás
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 6/11] Perfis e Usuários para Bipagem ---');
    const perfilRepo = AppDataSource.getRepository(Perfil);
    const usuarioRepo = AppDataSource.getRepository(Usuario);

    const perfilAdmin = await perfilRepo.findOne({ where: { nome: 'ADMIN_AUTOMACAO' } });
    let perfilVisualizador = await perfilRepo.findOne({ where: { nome: 'VISUALIZADOR' } });
    if (!perfilVisualizador) {
      perfilVisualizador = await perfilRepo.save(
        perfilRepo.create({
          nome: 'VISUALIZADOR',
          descricao: 'Acesso de leitura às telas liberadas para o perfil.',
          permissoes: {},
          ativo: true,
        }),
      );
    }

    const perfilEfetivo = perfilAdmin || perfilVisualizador;

    const usuariosData = [
      {
        usuario: 'carlos.corte',
        nomeCompleto: 'Carlos Eduardo Oliveira',
        cargo: 'Operador de Corte',
        tipoSetor: 'CORTE_LECTRA',
        cracha: '4819289288001',
        rfid: '2629318001',
        podeInterromperSla: false,
      },
      {
        usuario: 'mariana.costura',
        nomeCompleto: 'Mariana Souza Santos',
        cargo: 'Costureira Especialista',
        tipoSetor: 'COSTURA',
        cracha: '4819289288002',
        rfid: '2629318002',
        podeInterromperSla: false,
      },
      {
        usuario: 'roberto.montagem',
        nomeCompleto: 'Roberto Alves Ribeiro',
        cargo: 'Montador Técnico de Protótipos',
        tipoSetor: 'MONTAGEM',
        cracha: '4819289288003',
        rfid: '2629318003',
        podeInterromperSla: false,
      },
      {
        usuario: 'patricia.qualidade',
        nomeCompleto: 'Patrícia Lima Mendes',
        cargo: 'Inspetora de Qualidade',
        tipoSetor: 'LABORATORIO',
        cracha: '4819289288004',
        rfid: '2629318004',
        podeInterromperSla: true,
      },
      {
        usuario: 'lucas.pcp',
        nomeCompleto: 'Lucas Fernandes Ramos',
        cargo: 'Analista de Planejamento e Controle (PCP)',
        tipoSetor: 'ALMOXARIFADO_MODELAGEM',
        cracha: '4819289288005',
        rfid: '2629318005',
        podeInterromperSla: true,
      },
    ];

    const usuariosMap = new Map<string, Usuario>();
    const adminUser = await usuarioRepo.findOne({ where: { usuario: 'jose.falcao' } });
    if (adminUser) usuariosMap.set('jose.falcao', adminUser);

    for (const u of usuariosData) {
      let user = await usuarioRepo.findOne({ where: { usuario: u.usuario } });
      const setor = setoresPadraoMap.get(u.tipoSetor);
      if (!user) {
        user = await usuarioRepo.save(
          usuarioRepo.create({
            usuario: u.usuario,
            nomeCompleto: u.nomeCompleto,
            cargo: u.cargo,
            email: `${u.usuario}@calcadosdass.com.br`,
            setor: setor || undefined,
            planta: plantaPadrao,
            perfil: perfilEfetivo,
            codigoCracha: u.cracha,
            codigoCrachao: u.cracha,
            codigoBarrasCracha: u.cracha,
            rfid: u.rfid,
            podeInterromperSla: u.podeInterromperSla,
            senhaHash: 'EXTERNAL_AUTH_ONLY',
            ativo: true,
            ultimoAcesso: new Date(),
          }),
        );
      }
      usuariosMap.set(u.usuario, user);
    }
    console.log(`[OK] Usuários operacionais e crachás cadastrados com sucesso.`);

    // ------------------------------------------------------------------
    // PASSO 7: Catálogo de Itens de Checklist e Templates de Inspeção
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 7/11] Itens de Checklist de Qualidade ---');
    const checklistCatRepo = AppDataSource.getRepository(CatalogoItemChecklist);
    const templateRepo = AppDataSource.getRepository(ChecklistTemplate);
    const templateItemRepo = AppDataSource.getRepository(ChecklistTemplateItem);

    const checklistItensSetor = [
      { tipo: 'CORTE_LECTRA', desc: 'Inspeção do sentido do fio e ausência de desvio angular no corte' },
      { tipo: 'CORTE_PONTE', desc: 'Verificação do corte de biqueiras e contrafortes (sem rebarbas)' },
      { tipo: 'CORTE_DUBLAGEM', desc: 'Aderência perfeita da dublagem sem formação de bolhas' },
      { tipo: 'SERIGRAFIA', desc: 'Registro de cor e definição dos traços de serigrafia sem borrões' },
      { tipo: 'APOIO', desc: 'Temperatura calibrada e aderência de transfers térmicos' },
      { tipo: 'COSTURA', desc: 'Tensão balanceada dos fios, simetria nas laterais e ausência de pontos soltos' },
      { tipo: 'MONTAGEM', desc: 'Centralização perfeita do cabedal na forma e alinhamento do bico' },
      { tipo: 'MONTAGEM', desc: 'Adesão estrutural solado-cabedal sem resíduos aparentes de adesivo' },
      { tipo: 'LABORATORIO', desc: 'Ensaio de descolagem / tração conforme norma técnica' },
    ];

    let itemIndex = 1;
    for (const item of checklistItensSetor) {
      const opcao = opcoesSetorTipoMap.get(item.tipo);
      if (!opcao) continue;

      let itemCat = await checklistCatRepo.findOne({
        where: { setorTipoOpcaoId: opcao.id, descricao: item.desc },
      });
      if (!itemCat) {
        await checklistCatRepo.save(
          checklistCatRepo.create({
            setorTipoOpcaoId: opcao.id,
            numeroItem: itemIndex++,
            descricao: item.desc,
            tipoResposta: 'OK_NA_PENDENTE',
            obrigatorio: true,
            ordem: itemIndex,
            ativo: true,
          }),
        );
      }
    }

    // Template para Marca Nike no setor de Montagem
    const marcaNike = marcasMap.get('Nike');
    const opcaoMontagem = opcoesSetorTipoMap.get('MONTAGEM');
    if (marcaNike && opcaoMontagem) {
      let templateNike = await templateRepo.findOne({
        where: { marcaId: marcaNike.id, setorTipoOpcaoId: opcaoMontagem.id },
      });
      if (!templateNike) {
        templateNike = await templateRepo.save(
          templateRepo.create({
            marca: marcaNike,
            setorTipoOpcaoId: opcaoMontagem.id,
            nome: 'Checklist Padrão Montagem - Nike',
            descricao: 'Critérios mandatórios de liberação da montagem para calçados esportivos Nike.',
            versao: 1,
            ativo: true,
          }),
        );

        await templateItemRepo.save([
          templateItemRepo.create({
            template: templateNike,
            descricao: 'Conformação de bico uniforme entre pé direito e esquerdo',
            tipoResposta: 'OK_NA_PENDENTE',
            obrigatorio: true,
            ordem: 1,
          }),
          templateItemRepo.create({
            template: templateNike,
            descricao: 'Colagem de sola 100% selada em toda a extensão do vira',
            tipoResposta: 'OK_NA_PENDENTE',
            obrigatorio: true,
            ordem: 2,
          }),
        ]);
      }
    }
    console.log('[OK] Itens de checklist e templates de inspeção configurados.');

    // ------------------------------------------------------------------
    // PASSO 8: Modelos (códigos 100% numéricos)
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 8/11] Modelos de Calçados ---');
    const modeloRepo = AppDataSource.getRepository(Modelo);

    const modelosData = [
      {
        nome: 'Air Max 90 Essential',
        codigoProduto: '3080910',
        marcaNome: 'Nike',
        temporada: '2026/1',
        status: ModeloStatus.EM_TESTE,
      },
      {
        nome: 'Pegasus 40 Road',
        codigoProduto: '3080920',
        marcaNome: 'Nike',
        temporada: '2026/1',
        status: ModeloStatus.LIBERADO,
      },
      {
        nome: 'Disruptor II Heritage',
        codigoProduto: '3060908',
        marcaNome: 'Fila',
        temporada: '2026/2',
        status: ModeloStatus.EM_TESTE,
      },
      {
        nome: 'KR6 Speed Pro',
        codigoProduto: '3060918',
        marcaNome: 'Fila',
        temporada: '2026/2',
        status: ModeloStatus.CADASTRADO,
      },
      {
        nome: 'Riva Couro Nobre',
        codigoProduto: '3060400',
        marcaNome: 'Osklen',
        temporada: '2026/1',
        status: ModeloStatus.EM_TESTE,
      },
      {
        nome: 'Soho Soft Leather',
        codigoProduto: '3060410',
        marcaNome: 'Osklen',
        temporada: '2026/2',
        status: ModeloStatus.EM_TESTE,
      },
      {
        nome: 'Wave Rider Pro 27',
        codigoProduto: '3060420',
        marcaNome: 'Mizuno',
        temporada: '2026/2',
        status: ModeloStatus.CADASTRADO,
      },
      {
        nome: 'Corre Vento 3',
        codigoProduto: '3060430',
        marcaNome: 'Olympikus',
        temporada: '2026/2',
        status: ModeloStatus.CADASTRADO,
      },
    ];

    const modelosMap = new Map<string, Modelo>();
    for (const m of modelosData) {
      const marca = marcasMap.get(m.marcaNome);
      if (!marca) continue;

      let mod = await modeloRepo.findOne({ where: { codigoProduto: m.codigoProduto } });
      if (!mod) {
        mod = await modeloRepo.save(
          modeloRepo.create({
            nome: m.nome,
            codigoProduto: m.codigoProduto,
            marca,
            temporada: m.temporada,
            dataCorte: new Date(),
            status: m.status,
            ativo: true,
          }),
        );
        console.log(`  └─ [OK] Modelo '${m.nome}' (${m.codigoProduto}) inserido.`);
      } else {
        mod.nome = m.nome;
        mod.status = m.status;
        mod.marca = marca;
        await modeloRepo.save(mod);
      }
      modelosMap.set(m.codigoProduto, mod);
    }

    // ------------------------------------------------------------------
    // PASSO 9: Peças e Rotas dos Modelos
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 9/11] Peças Técnicas e Rotas dos Modelos ---');
    const pecaRepo = AppDataSource.getRepository(Peca);
    const rotaRepo = AppDataSource.getRepository(RotaModelo);
    const catalogoRepo = AppDataSource.getRepository(CatalogoPeca);

    const catalogoSample = await catalogoRepo.find({ take: 30, order: { numero: 'ASC' } });
    const opcLectra = opcoesCorteMap.get('lectra')!;
    const opcPonte = opcoesCorteMap.get('ponte')!;
    const opcAtom = opcoesCorteMap.get('atom')!;
    const opcLaser = opcoesCorteMap.get('laser')!;

    // Definição das peças por modelo (sempre garantindo ao menos 1 Lectra e 1 Ponte)
    const pecasConfigPorModelo = [
      { nome: 'Gáspea Principal', corte: opcLectra, catOffset: 5 },
      { nome: 'Lingueta Frontal', corte: opcLectra, catOffset: 14 },
      { nome: 'Traseiro Reforçado', corte: opcLectra, catOffset: 23 },
      { nome: 'Biqueira Termoformada', corte: opcPonte, catOffset: 0 },
      { nome: 'Contraforte Calcanhar', corte: opcPonte, catOffset: 1 },
      { nome: 'Palmilha Estrutural', corte: opcPonte, catOffset: 2 },
      { nome: 'Forro Interno Respirável', corte: opcAtom, catOffset: 6 },
      { nome: 'Aplique Laser Lateral', corte: opcLaser, catOffset: 7 },
    ];

    for (const [codigo, modelo] of modelosMap.entries()) {
      const pecasExistentes = await pecaRepo.count({ where: { modeloId: modelo.id } });
      if (pecasExistentes === 0) {
        const pecasNovas: Peca[] = [];
        for (let i = 0; i < pecasConfigPorModelo.length; i++) {
          const cfg = pecasConfigPorModelo[i];
          const itemCat = catalogoSample[cfg.catOffset % catalogoSample.length];

          pecasNovas.push(
            pecaRepo.create({
              modeloId: modelo.id,
              catalogoPecaId: itemCat ? itemCat.id : null,
              nome: `${cfg.nome} - ${modelo.nome}`,
              setorCorteOpcaoId: cfg.corte.id,
              descricao: `Peça de prototipagem para ${modelo.nome}`,
              codigoBarras: `PEC-${codigo}-${i + 1}`,
            }),
          );
        }
        await pecaRepo.save(pecasNovas);
      }

      // Rota do modelo na Planta Padrão
      const rotasExistentes = await rotaRepo.count({ where: { modeloId: modelo.id, plantaId: plantaPadrao.id } });
      if (rotasExistentes === 0) {
        // Inclui setores necessários e setores de corte usados pelas peças: Lectra, Ponte, Atom, Laser
        // Telas e Serigrafia ativas em conjunto
        const etapasRota = [
          { tipo: 'ALMOXARIFADO_MODELAGEM', ordem: 1, sla: 60, apenasSaida: false },
          { tipo: 'NAVALHA', ordem: 2, sla: 60, apenasSaida: false },
          { tipo: 'CORTE_DUBLAGEM', ordem: 3, sla: 60, apenasSaida: false },
          { tipo: 'CORTE_PONTE', ordem: 4, sla: 90, apenasSaida: false },
          { tipo: 'CORTE_LECTRA', ordem: 5, sla: 90, apenasSaida: false },
          { tipo: 'CORTE_ATOM', ordem: 6, sla: 60, apenasSaida: false },
          { tipo: 'CORTE_LASER', ordem: 7, sla: 60, apenasSaida: false },
          { tipo: 'TELAS', ordem: 8, sla: 60, apenasSaida: false },
          { tipo: 'SERIGRAFIA', ordem: 9, sla: 90, apenasSaida: false },
          { tipo: 'APOIO', ordem: 10, sla: 120, apenasSaida: false },
          { tipo: 'COSTURA', ordem: 11, sla: 180, apenasSaida: false },
          { tipo: 'MONTAGEM', ordem: 12, sla: 180, apenasSaida: false },
          { tipo: 'LABORATORIO', ordem: 13, sla: 120, apenasSaida: false },
        ];

        const rotasSalvas: RotaModelo[] = [];
        for (const etapa of etapasRota) {
          const setor = setoresPadraoMap.get(etapa.tipo);
          if (!setor) continue;

          rotasSalvas.push(
            rotaRepo.create({
              modeloId: modelo.id,
              plantaId: plantaPadrao.id,
              setorId: setor.id,
              ordem: etapa.ordem,
              slaAlvoMin: etapa.sla,
              versao: 1,
              obrigatorio: true,
              tipoExecucao: TipoExecucao.SEQUENCIAL,
              bipagemApenasSaida: etapa.apenasSaida,
            }),
          );
        }
        await rotaRepo.save(rotasSalvas);
      }
    }
    console.log('[OK] Peças e rotas vinculadas a todos os modelos com integridade de fluxo.');

    // ------------------------------------------------------------------
    // PASSO 10: Ordens de Teste, Tickets de Setor e Rastreamentos
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 10/11] Ordens de Teste, Tickets e Rastreamento Operacional ---');
    const ordemRepo = AppDataSource.getRepository(OrdemTeste);
    const rastreamentoRepo = AppDataSource.getRepository(Rastreamento);

    const operadorCorte = usuariosMap.get('carlos.corte') || adminUser!;
    const operadorCostura = usuariosMap.get('mariana.costura') || adminUser!;
    const operadorMontagem = usuariosMap.get('roberto.montagem') || adminUser!;
    const inspetoraQualidade = usuariosMap.get('patricia.qualidade') || adminUser!;
    const criadorPcp = usuariosMap.get('lucas.pcp') || adminUser!;

    const ordensConfig = [
      {
        modeloCodigo: '3080910', // Air Max 90 Essential
        codigoBarras: 'OT-20261001-001',
        prioridade: 'ALTA',
        status: OrdemTesteStatus.MONTAGEM,
        possuiCaixaTeste: true,
        diasAtras: 3,
        setorAtualTipo: 'MONTAGEM',
        setoresCompletos: [
          'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'CORTE_DUBLAGEM', 'CORTE_PONTE',
          'CORTE_LECTRA', 'CORTE_ATOM', 'CORTE_LASER',
          'TELAS', 'SERIGRAFIA', 'APOIO', 'COSTURA',
        ],
        liberado: true,
      },
      {
        modeloCodigo: '3080920', // Pegasus 40 Road
        codigoBarras: 'OT-20261002-002',
        prioridade: 'MEDIA',
        status: OrdemTesteStatus.LIBERADO_PRODUCAO,
        possuiCaixaTeste: true,
        diasAtras: 5,
        setorAtualTipo: null,
        setoresCompletos: [
          'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'CORTE_DUBLAGEM', 'CORTE_PONTE',
          'CORTE_LECTRA', 'CORTE_ATOM', 'CORTE_LASER',
          'TELAS', 'SERIGRAFIA', 'APOIO', 'COSTURA',
          'MONTAGEM', 'LABORATORIO',
        ],
        liberado: true,
      },
      {
        modeloCodigo: '3060908', // Disruptor II Heritage
        codigoBarras: 'OT-20261003-003',
        prioridade: 'URGENTE',
        status: OrdemTesteStatus.EM_CORTE,
        possuiCaixaTeste: false,
        diasAtras: 2,
        setorAtualTipo: 'CORTE_LECTRA',
        setoresCompletos: [
          'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'CORTE_DUBLAGEM',
        ],
        liberado: true,
      },
      {
        modeloCodigo: '3060400', // Riva Couro Nobre
        codigoBarras: 'OT-20261004-004',
        prioridade: 'MEDIA',
        status: OrdemTesteStatus.EM_RETRABALHO,
        possuiCaixaTeste: true,
        diasAtras: 4,
        setorAtualTipo: 'COSTURA',
        setoresCompletos: [
          'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'CORTE_DUBLAGEM', 'CORTE_PONTE',
          'CORTE_LECTRA', 'APOIO',
        ],
        liberado: true,
      },
      {
        modeloCodigo: '3060410', // Soho Soft Leather
        codigoBarras: 'OT-20261005-005',
        prioridade: 'ALTA',
        status: OrdemTesteStatus.INSPECAO_QUALIDADE,
        possuiCaixaTeste: true,
        diasAtras: 3,
        setorAtualTipo: 'LABORATORIO',
        setoresCompletos: [
          'ALMOXARIFADO_MODELAGEM', 'NAVALHA', 'CORTE_DUBLAGEM', 'CORTE_PONTE',
          'CORTE_LECTRA', 'APOIO', 'COSTURA', 'MONTAGEM',
        ],
        liberado: true,
      },
      {
        modeloCodigo: '3060918', // KR6 Speed Pro
        codigoBarras: 'OT-20261006-006',
        prioridade: 'BAIXA',
        status: OrdemTesteStatus.AGUARDANDO_MATERIAL,
        possuiCaixaTeste: false,
        diasAtras: 1,
        setorAtualTipo: null,
        setoresCompletos: [],
        liberado: false,
      },
    ];

    const ordensSalvasMap = new Map<string, OrdemTeste>();

    for (const cfg of ordensConfig) {
      const modelo = modelosMap.get(cfg.modeloCodigo);
      if (!modelo) continue;

      let ordem = await ordemRepo.findOne({ where: { modeloId: modelo.id } });
      const rotasModelo = await rotaRepo.find({
        where: { modeloId: modelo.id, plantaId: plantaPadrao.id },
        relations: { setor: true },
        order: { ordem: 'ASC' },
      });

      const slasPorSetor: Record<string, number> = {};
      const etapasSnapshot = rotasModelo.map((r) => {
        slasPorSetor[r.setorId] = r.slaAlvoMin;
        return {
          setorId: r.setorId,
          nome: r.setor?.nome || 'Setor',
          ordem: r.ordem,
          obrigatorio: r.obrigatorio,
          tipoExecucao: r.tipoExecucao,
          bipagemApenasSaida: r.bipagemApenasSaida,
        };
      });

      const rotaSnapshot = {
        versao: 1,
        plantaId: plantaPadrao.id,
        etapas: etapasSnapshot,
        slasPorSetor,
      };

      const dataInicio = new Date(Date.now() - cfg.diasAtras * 24 * 3600 * 1000);
      const dataFimReal = cfg.status === OrdemTesteStatus.LIBERADO_PRODUCAO
        ? new Date(dataInicio.getTime() + 18 * 3600 * 1000)
        : null;

      if (!ordem) {
        ordem = await ordemRepo.save(
          ordemRepo.create({
            modeloId: modelo.id,
            plantaId: plantaPadrao.id,
            criadoPorId: criadorPcp.id,
            codigoBarras: cfg.codigoBarras,
            dataInicio,
            dataFimReal,
            prioridadePcp: cfg.prioridade,
            status: cfg.status,
            liberadoProducao: cfg.liberado,
            possuiCaixaTeste: cfg.possuiCaixaTeste,
            slasPorSetor,
            rotaVersao: 1,
            rotaSnapshot,
            observacoes: `Lote piloto de testes para ${modelo.nome}`,
          }),
        );
      } else {
        ordem.status = cfg.status;
        ordem.liberadoProducao = cfg.liberado;
        ordem.possuiCaixaTeste = cfg.possuiCaixaTeste;
        ordem.rotaSnapshot = rotaSnapshot;
        ordem.slasPorSetor = slasPorSetor;
        ordem.dataInicio = dataInicio;
        ordem.dataFimReal = dataFimReal;
        await ordemRepo.save(ordem);
      }

      // Gera os Tickets por setor para Lote Principal e Caixa Teste
      await AppDataSource.transaction(async (manager) => {
        await garantirTicketsSetorDaOrdem(manager, ordem!);
      });

      ordensSalvasMap.set(cfg.codigoBarras, ordem);

      // Limpa e recria rastreamentos históricos realistas
      await rastreamentoRepo.delete({ ordemTesteId: ordem.id });

      const tiposLote = cfg.possuiCaixaTeste ? [TipoLote.LOTE_PRINCIPAL, TipoLote.CAIXA_TESTE] : [TipoLote.LOTE_PRINCIPAL];
      let tempoAcumuladoMin = 0;

      for (const setorTipo of cfg.setoresCompletos) {
        const setor = setoresPadraoMap.get(setorTipo);
        if (!setor) continue;

        const duracaoMin = SETORES_CONFIG.find((sc) => sc.tipo === setorTipo)?.slaPadrao || 60;

        for (const tipoLote of tiposLote) {
          const entrada = new Date(dataInicio.getTime() + tempoAcumuladoMin * 60 * 1000);
          const saida = new Date(entrada.getTime() + (duracaoMin - 5) * 60 * 1000);

          let opEntrada = operadorCorte;
          let opSaida = operadorCorte;
          if (setorTipo.includes('COSTURA')) {
            opEntrada = operadorCostura;
            opSaida = operadorCostura;
          } else if (setorTipo.includes('MONTAGEM')) {
            opEntrada = operadorMontagem;
            opSaida = operadorMontagem;
          } else if (setorTipo.includes('LABORATORIO')) {
            opEntrada = inspetoraQualidade;
            opSaida = inspetoraQualidade;
          }

          await rastreamentoRepo.save(
            rastreamentoRepo.create({
              ordemTesteId: ordem.id,
              setorId: setor.id,
              tipoLote,
              operadorEntradaId: opEntrada.id,
              operadorSaidaId: opSaida.id,
              dataEntrada: entrada,
              dataSaida: saida,
              tempoPermanenciaMin: duracaoMin - 5,
              tempoPausadoMin: 0,
              status: RastreamentoStatus.CONCLUIDO,
            }),
          );
        }
        tempoAcumuladoMin += duracaoMin;
      }

      // Adiciona o rastreamento em andamento se houver setor atual
      if (cfg.setorAtualTipo) {
        const setorAtual = setoresPadraoMap.get(cfg.setorAtualTipo);
        if (setorAtual) {
          const entradaAtual = new Date(dataInicio.getTime() + tempoAcumuladoMin * 60 * 1000);
          for (const tipoLote of tiposLote) {
            await rastreamentoRepo.save(
              rastreamentoRepo.create({
                ordemTesteId: ordem.id,
                setorId: setorAtual.id,
                tipoLote,
                operadorEntradaId: operadorMontagem.id,
                dataEntrada: entradaAtual,
                dataSaida: null,
                tempoPermanenciaMin: null,
                tempoPausadoMin: 0,
                status: RastreamentoStatus.EM_PROCESSO,
              }),
            );
          }
        }
      }
    }
    console.log('[OK] Ordens de teste, tickets de lote e rastreamentos históricos gravados.');

    // ------------------------------------------------------------------
    // PASSO 11: Ocorrências de Produção, Inspeções e Retrabalhos
    // ------------------------------------------------------------------
    console.log('\n--- [PASSO 11/11] Ocorrências de Produção, Inspeções e Retrabalhos ---');
    const ocorrenciaRepo = AppDataSource.getRepository(OcorrenciaProducao);
    const inspecaoRepo = AppDataSource.getRepository(Inspecao);
    const divergenciaRepo = AppDataSource.getRepository(Divergencia);
    const retrabalhoRepo = AppDataSource.getRepository(Retrabalho);

    const ordemDisruptor = ordensSalvasMap.get('OT-20261003-003');
    const setorCorteLectra = setoresPadraoMap.get('CORTE_LECTRA')!;
    if (ordemDisruptor && setorCorteLectra) {
      await ocorrenciaRepo.delete({ ordemTesteId: ordemDisruptor.id });
      await ocorrenciaRepo.save(
        ocorrenciaRepo.create({
          ordemTesteId: ordemDisruptor.id,
          setorId: setorCorteLectra.id,
          reportadoPorId: operadorCorte.id,
          titulo: 'Alinhamento óptico do cabeçote Lectra Vector',
          descricao: 'Feixe de laser guia com desvio de 0.8mm detectado no início do enfesto.',
          tipoOcorrencia: TipoOcorrencia.GARGALO_MAQUINA,
          gravidade: GravidadeOcorrencia.MEDIA,
          status: StatusOcorrencia.ABERTA,
          interrompeSla: true,
          dataOcorrencia: new Date(Date.now() - 4 * 3600 * 1000),
        }),
      );
    }

    const ordemAirMax = ordensSalvasMap.get('OT-20261001-001');
    const setorMontagem = setoresPadraoMap.get('MONTAGEM')!;
    if (ordemAirMax && setorMontagem) {
      await ocorrenciaRepo.delete({ ordemTesteId: ordemAirMax.id });
      await ocorrenciaRepo.save(
        ocorrenciaRepo.create({
          ordemTesteId: ordemAirMax.id,
          setorId: setorMontagem.id,
          reportadoPorId: operadorMontagem.id,
          titulo: 'Atraso na chegada de adesivo base água',
          descricao: 'Aguardando lote de adesivo poliuretano homologado pela matriz.',
          tipoOcorrencia: TipoOcorrencia.FALTA_MATERIAL,
          gravidade: GravidadeOcorrencia.BAIXA,
          status: StatusOcorrencia.EM_ANALISE,
          interrompeSla: false,
          dataOcorrencia: new Date(Date.now() - 2 * 3600 * 1000),
        }),
      );
    }

    const ordemPegasus = ordensSalvasMap.get('OT-20261002-002');
    const setorLaboratorio = setoresPadraoMap.get('LABORATORIO')!;
    if (ordemPegasus && setorLaboratorio) {
      await inspecaoRepo.delete({ ordemTesteId: ordemPegasus.id });
      await inspecaoRepo.save(
        inspecaoRepo.create({
          ordemTesteId: ordemPegasus.id,
          inspetorId: inspetoraQualidade.id,
          setorId: setorLaboratorio.id,
          tipoInspecao: TipoInspecao.SAIDA_SETOR,
          tipoLote: TipoLote.LOTE_PRINCIPAL,
          dataInspecao: new Date(Date.now() - 12 * 3600 * 1000),
          resultado: ResultadoInspecao.APROVADO,
          observacoes: 'Aprovado em todos os testes dimensionais e de flexão contínua (50.000 ciclos).',
        }),
      );
    }

    const ordemRiva = ordensSalvasMap.get('OT-20261004-004');
    const setorCostura = setoresPadraoMap.get('COSTURA')!;
    if (ordemRiva && setorCostura) {
      await inspecaoRepo.delete({ ordemTesteId: ordemRiva.id });
      await divergenciaRepo.delete({ ordemTesteId: ordemRiva.id });
      await retrabalhoRepo.delete({ ordemTesteId: ordemRiva.id });

      const inspecaoFalha = await inspecaoRepo.save(
        inspecaoRepo.create({
          ordemTesteId: ordemRiva.id,
          inspetorId: inspetoraQualidade.id,
          setorId: setorCostura.id,
          tipoInspecao: TipoInspecao.SAIDA_SETOR,
          tipoLote: TipoLote.LOTE_PRINCIPAL,
          dataInspecao: new Date(Date.now() - 8 * 3600 * 1000),
          resultado: ResultadoInspecao.REPROVADO,
          observacoes: 'Desvio de paralelismo visível no pesponto externo da gáspea.',
        }),
      );

      const pecasRiva = await pecaRepo.find({ where: { modeloId: ordemRiva.modeloId } });
      const pecaAfetada = pecasRiva[0];

      const divergencia = await divergenciaRepo.save(
        divergenciaRepo.create({
          ordemTesteId: ordemRiva.id,
          inspecaoId: inspecaoFalha.id,
          pecaId: pecaAfetada ? pecaAfetada.id : null,
          setorId: setorCostura.id,
          reportadoPorId: inspetoraQualidade.id,
          descricao: 'Desvio de 1.5mm no pesponto decorativo externo da gáspea.',
          tipoDivergencia: 'DIMENSIONAL',
          gravidade: 'MEDIA',
          resolvido: false,
        }),
      );

      if (pecaAfetada) {
        await retrabalhoRepo.save(
          retrabalhoRepo.create({
            divergenciaId: divergencia.id,
            ordemTesteId: ordemRiva.id,
            pecaId: pecaAfetada.id,
            setorOrigemId: setorCostura.id,
            setorDestinoId: setorCostura.id,
            responsavelId: operadorCostura.id,
            descricao: 'Desmanche e recostura com gabarito de pesponto ajustado.',
            status: 'EM_ANDAMENTO',
            dataInicio: new Date(Date.now() - 3 * 3600 * 1000),
          }),
        );
      }
    }
    console.log('[OK] Ocorrências de chão de fábrica, inspeções e retrabalhos gravados.');

    console.log('\n==================================================');
    console.log('    DATABASE SEEDING CONCLUÍDO COM SUCESSO!       ');
    console.log('==================================================');
  } catch (error) {
    console.error('ERRO CRÍTICO DURANTE O SEEDING:', error);
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
    console.log('[OK] Conexão com o banco encerrada.');
  }
}

runSeed();
