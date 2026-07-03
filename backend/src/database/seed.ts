import 'reflect-metadata';
import { IsNull, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Planta } from '../entities/Planta';
import { ConfigCategoria } from '../entities/ConfigCategoria';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Setor } from '../entities/Setor';
import { Perfil } from '../entities/Perfil';
import { PerfilPermissao, AcaoSetor } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';

async function seed() {
  console.log('🌱 Iniciando o Seed do Banco de Dados...');

  // Inicializa a conexão se não estiver inicializada
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const plantaRepo = AppDataSource.getRepository(Planta);
  const configCategoriaRepo = AppDataSource.getRepository(ConfigCategoria);
  const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);
  const setorRepo = AppDataSource.getRepository(Setor);
  const perfilRepo = AppDataSource.getRepository(Perfil);
  const perfilPermissaoRepo = AppDataSource.getRepository(PerfilPermissao);
  const usuarioRepo = AppDataSource.getRepository(Usuario);

  // 1. Planta
  let planta = await plantaRepo.findOne({ where: { ativo: true } });
  if (!planta) {
    planta = plantaRepo.create({
      nome: 'Planta Padrão',
      endereco: 'Avenida Principal, 1000',
      cidade: 'Parobé',
      estado: 'RS',
      ativo: true
    });
    planta = await plantaRepo.save(planta);
    console.log(`✅ Planta criada: ${planta.nome}`);
  } else {
    console.log(`ℹ️ Planta existente utilizada: ${planta.nome}`);
  }

  // 2. Config Categories
  let catSetorTipo = await configCategoriaRepo.findOne({ where: { slug: 'setor_tipo' } });
  if (!catSetorTipo) {
    catSetorTipo = configCategoriaRepo.create({
      slug: 'setor_tipo',
      nomeExibicao: 'Tipo de Setor',
      descricao: 'Tipagem dinâmica para controle de regras dos setores',
      ativo: true
    });
    catSetorTipo = await configCategoriaRepo.save(catSetorTipo);
    console.log(`✅ Categoria 'setor_tipo' criada.`);
  }

  let catSubsetorCorte = await configCategoriaRepo.findOne({ where: { slug: 'subsetor_corte' } });
  if (!catSubsetorCorte) {
    catSubsetorCorte = configCategoriaRepo.create({
      slug: 'subsetor_corte',
      nomeExibicao: 'Subsetor de Corte',
      descricao: 'Tipos de máquina ou sub-processos do Corte Automático',
      ativo: true
    });
    catSubsetorCorte = await configCategoriaRepo.save(catSubsetorCorte);
    console.log(`✅ Categoria 'subsetor_corte' criada.`);
  }

  // 3. Config Options for setor_tipo
  const setorTipoOptions = [
    { valor: 'ALMOXARIFADO', label: 'Almoxarifado da Modelagem', ordem: 1 },
    { valor: 'NAVALHA', label: 'Navalha', ordem: 2 },
    { valor: 'TELAS', label: 'Telas', ordem: 3 },
    { valor: 'RECEBIMENTO_CORTE', label: 'Corte Recebimento', ordem: 4 },
    { valor: 'SEPARACAO_CORTE', label: 'Corte Separação', ordem: 5 },
    { valor: 'DUBLAGEM_CORTE', label: 'Corte Dublagem', ordem: 6 },
    { valor: 'CORTE_PONTE', label: 'Corte Ponte', ordem: 7 },
    { valor: 'CORTE_LECTRA', label: 'Corte Lectra', ordem: 8 },
    { valor: 'CORTE_ATOM', label: 'Corte Atom', ordem: 9 },
    { valor: 'CORTE_CN', label: 'Corte CN', ordem: 10 },
    { valor: 'CORTE_COURO', label: 'Corte Couro', ordem: 11 },
    { valor: 'CORTE_LASER', label: 'Corte Laser', ordem: 12 },
    { valor: 'SERIGRAFIA', label: 'Serigrafia', ordem: 13 },
    { valor: 'APOIO', label: 'Apoio', ordem: 14 },
    { valor: 'BORDADO', label: 'Bordado', ordem: 15 },
    { valor: 'COSTURA_PROGRAMADA', label: 'Costura Programada', ordem: 16 },
    { valor: 'COSTURA', label: 'Costura', ordem: 17 },
    { valor: 'PRE_FABRICADO', label: 'Pré-Fabricado', ordem: 18 },
    { valor: 'MONTAGEM', label: 'Montagem', ordem: 19 },
    { valor: 'VULCANIZADO', label: 'Vulcanizado', ordem: 20 },
    { valor: 'LABORATORIO', label: 'Laboratório', ordem: 21 },
  ];

  for (const opt of setorTipoOptions) {
    const existing = await configOpcaoRepo.findOne({
      where: { categoriaId: catSetorTipo.id, valor: opt.valor }
    });
    if (!existing) {
      const newOpt = configOpcaoRepo.create({
        categoriaId: catSetorTipo.id,
        valor: opt.valor,
        label: opt.label,
        ordem: opt.ordem,
        ativo: true
      });
      await configOpcaoRepo.save(newOpt);
    }
  }
  console.log(`✅ Opções de 'setor_tipo' semeadas.`);

  // Config Options for subsetor_corte
  const subsetorCorteOptions = [
    { valor: 'CORTE_PONTE', label: 'Corte Ponte', ordem: 1 },
    { valor: 'CORTE_LECTRA', label: 'Corte Lectra', ordem: 2 },
    { valor: 'CORTE_ATOM', label: 'Corte Atom', ordem: 3 },
    { valor: 'CORTE_CN', label: 'Corte CN', ordem: 4 },
    { valor: 'CORTE_COURO', label: 'Corte Couro', ordem: 5 },
    { valor: 'CORTE_LASER', label: 'Corte Laser', ordem: 6 },
  ];

  for (const opt of subsetorCorteOptions) {
    const existing = await configOpcaoRepo.findOne({
      where: { categoriaId: catSubsetorCorte.id, valor: opt.valor }
    });
    if (!existing) {
      const newOpt = configOpcaoRepo.create({
        categoriaId: catSubsetorCorte.id,
        valor: opt.valor,
        label: opt.label,
        ordem: opt.ordem,
        ativo: true
      });
      await configOpcaoRepo.save(newOpt);
    }
  }
  console.log(`✅ Opções de 'subsetor_corte' semeadas.`);

  // 4. Sectors
  const sectorsToSeed = [
    { nome: 'Almoxarifado da Modelagem', tipoValor: 'ALMOXARIFADO', ordemFluxo: 1, isCondicional: false },
    { nome: 'Navalha', tipoValor: 'NAVALHA', ordemFluxo: 2, isCondicional: false },
    { nome: 'Telas', tipoValor: 'TELAS', ordemFluxo: 3, isCondicional: false },
    { nome: 'Corte Recebimento', tipoValor: 'RECEBIMENTO_CORTE', ordemFluxo: 4, isCondicional: false },
    { nome: 'Corte Separação', tipoValor: 'SEPARACAO_CORTE', ordemFluxo: 5, isCondicional: false },
    { nome: 'Corte Dublagem', tipoValor: 'DUBLAGEM_CORTE', ordemFluxo: 6, isCondicional: false },
    { nome: 'Corte Ponte', tipoValor: 'CORTE_PONTE', ordemFluxo: 7, isCondicional: false },
    { nome: 'Corte Lectra', tipoValor: 'CORTE_LECTRA', ordemFluxo: 8, isCondicional: false },
    { nome: 'Corte Atom', tipoValor: 'CORTE_ATOM', ordemFluxo: 9, isCondicional: false },
    { nome: 'Corte CN', tipoValor: 'CORTE_CN', ordemFluxo: 10, isCondicional: false },
    { nome: 'Corte Couro', tipoValor: 'CORTE_COURO', ordemFluxo: 11, isCondicional: false },
    { nome: 'Corte Laser', tipoValor: 'CORTE_LASER', ordemFluxo: 12, isCondicional: false },
    { nome: 'Serigrafia', tipoValor: 'SERIGRAFIA', ordemFluxo: 13, isCondicional: true },
    { nome: 'Apoio', tipoValor: 'APOIO', ordemFluxo: 14, isCondicional: false },
    { nome: 'Bordado', tipoValor: 'BORDADO', ordemFluxo: 15, isCondicional: true },
    { nome: 'Costura Programada', tipoValor: 'COSTURA_PROGRAMADA', ordemFluxo: 16, isCondicional: false },
    { nome: 'Costura', tipoValor: 'COSTURA', ordemFluxo: 17, isCondicional: false },
    { nome: 'Pré-Fabricado', tipoValor: 'PRE_FABRICADO', ordemFluxo: 18, isCondicional: false },
    { nome: 'Montagem', tipoValor: 'MONTAGEM', ordemFluxo: 19, isCondicional: false },
    { nome: 'Vulcanizado', tipoValor: 'VULCANIZADO', ordemFluxo: 20, isCondicional: true },
    { nome: 'Laboratório', tipoValor: 'LABORATORIO', ordemFluxo: 21, isCondicional: false },
  ];

  for (const s of sectorsToSeed) {
    const existingSector = await setorRepo.findOne({ where: { nome: s.nome } });
    if (!existingSector) {
      const tipoOpcao = await configOpcaoRepo.findOne({
        where: { categoriaId: catSetorTipo.id, valor: s.tipoValor }
      });
      if (!tipoOpcao) {
        throw new Error(`ConfigOpcao para ${s.tipoValor} não encontrada.`);
      }
      const newSector = setorRepo.create({
        plantaId: planta.id,
        nome: s.nome,
        tipoOpcaoId: tipoOpcao.id,
        ordemFluxo: s.ordemFluxo,
        isCondicional: s.isCondicional,
        ativo: true
      });
      await setorRepo.save(newSector);
    }
  }
  console.log(`✅ Setores semeados.`);

  // 5. Profiles (perfis)
  const profileNames = [
    { nome: 'ADMIN', descricao: 'Administrador do Sistema' },
    { nome: 'GERENTE_MODELAGEM', descricao: 'Gerente da Modelagem' },
    { nome: 'COORDENADOR_SETOR', descricao: 'Coordenador de Setor' },
    { nome: 'REVISORA', descricao: 'Revisora de Máquinas de Corte' },
    { nome: 'INSPETOR_QUALIDADE', descricao: 'Inspetor de Qualidade' },
    { nome: 'MODELISTA', descricao: 'Modelista de Calçados' },
    { nome: 'OPERADOR', descricao: 'Operador de Fábrica Padrão' }
  ];

  const profilesMap: Record<string, Perfil> = {};
  for (const p of profileNames) {
    let profile = await perfilRepo.findOne({ where: { nome: p.nome } });
    if (!profile) {
      profile = perfilRepo.create({
        nome: p.nome,
        descricao: p.descricao,
        permissoes: {},
        ativo: true
      });
      profile = await perfilRepo.save(profile);
    }
    profilesMap[p.nome] = profile;
  }
  console.log(`✅ Perfis criados/verificados.`);

  // Helper function to insert permissions cleanly without duplicates
  async function grantPermission(perfilId: string, acao: string, permitido: boolean, setorId: string | null = null) {
    const existing = await perfilPermissaoRepo.findOne({
      where: {
        perfilId,
        acao,
        setorId: setorId === null ? IsNull() : setorId
      }
    });

    if (!existing) {
      const newPerm = perfilPermissaoRepo.create({
        perfilId,
        acao,
        setorId,
        permitido
      });
      await perfilPermissaoRepo.save(newPerm);
    } else if (existing.permitido !== permitido) {
      existing.permitido = permitido;
      await perfilPermissaoRepo.save(existing);
    }
  }

  // 6. Seed perfil_permissoes (Permissions Matrix)
  
  // A. ADMIN gets all permissions globally
  for (const acao of Object.values(AcaoSetor)) {
    await grantPermission(profilesMap['ADMIN'].id, acao, true, null);
  }
  console.log(`✅ Permissões de ADMIN concedidas (Global).`);

  // B. MODELISTA gets EDITAR_ROTA and general bipagem globally
  await grantPermission(profilesMap['MODELISTA'].id, AcaoSetor.EDITAR_ROTA, true, null);
  await grantPermission(profilesMap['MODELISTA'].id, AcaoSetor.BIPAR_ENTRADA, true, null);
  await grantPermission(profilesMap['MODELISTA'].id, AcaoSetor.BIPAR_SAIDA, true, null);

  // C. GERENTE_MODELAGEM gets REGISTRAR_VEREDICTO_FINAL and general bipagem globally
  await grantPermission(profilesMap['GERENTE_MODELAGEM'].id, AcaoSetor.REGISTRAR_VEREDICTO_FINAL, true, null);
  await grantPermission(profilesMap['GERENTE_MODELAGEM'].id, AcaoSetor.BIPAR_ENTRADA, true, null);
  await grantPermission(profilesMap['GERENTE_MODELAGEM'].id, AcaoSetor.BIPAR_SAIDA, true, null);

  // D. INSPETOR_QUALIDADE gets INSPECIONAR_SETOR and general bipagem globally
  await grantPermission(profilesMap['INSPETOR_QUALIDADE'].id, AcaoSetor.INSPECIONAR_SETOR, true, null);
  await grantPermission(profilesMap['INSPETOR_QUALIDADE'].id, AcaoSetor.BIPAR_ENTRADA, true, null);
  await grantPermission(profilesMap['INSPETOR_QUALIDADE'].id, AcaoSetor.BIPAR_SAIDA, true, null);

  // E. OPERADOR gets general bipagem and preencher checklist globally
  await grantPermission(profilesMap['OPERADOR'].id, AcaoSetor.BIPAR_ENTRADA, true, null);
  await grantPermission(profilesMap['OPERADOR'].id, AcaoSetor.BIPAR_SAIDA, true, null);
  await grantPermission(profilesMap['OPERADOR'].id, AcaoSetor.PREENCHER_CHECKLIST, true, null);

  // F. REVISORA gets REVISAO_MAQUINA on specific machine cutting sectors, plus general bipagem globally
  await grantPermission(profilesMap['REVISORA'].id, AcaoSetor.BIPAR_ENTRADA, true, null);
  await grantPermission(profilesMap['REVISORA'].id, AcaoSetor.BIPAR_SAIDA, true, null);
  
  const targetCorteSectors = await setorRepo.find({
    where: {
      nome: In(['Corte Ponte', 'Corte Lectra', 'Corte Atom', 'Corte CN', 'Corte Couro', 'Corte Laser'])
    }
  });

  for (const sec of targetCorteSectors) {
    await grantPermission(profilesMap['REVISORA'].id, AcaoSetor.REVISAO_MAQUINA, true, sec.id);
  }

  // G. COORDENADOR_SETOR gets FECHAMENTO_LOTE on machine cutting sectors, plus general bipagem globally
  await grantPermission(profilesMap['COORDENADOR_SETOR'].id, AcaoSetor.BIPAR_ENTRADA, true, null);
  await grantPermission(profilesMap['COORDENADOR_SETOR'].id, AcaoSetor.BIPAR_SAIDA, true, null);
  await grantPermission(profilesMap['COORDENADOR_SETOR'].id, AcaoSetor.PREENCHER_CHECKLIST, true, null);

  for (const sec of targetCorteSectors) {
    await grantPermission(profilesMap['COORDENADOR_SETOR'].id, AcaoSetor.FECHAMENTO_LOTE, true, sec.id);
  }
  console.log(`✅ Permissões dos demais perfis (MODELISTA, GERENTE, INSPETOR, OPERADOR, REVISORA, COORDENADOR) semeadas.`);

  // 7. Promotion of HELLEN.MAGALHAES to ADMIN
  const userHellen = await usuarioRepo.findOne({ where: { usuario: 'HELLEN.MAGALHAES' } });
  if (userHellen) {
    userHellen.perfilId = profilesMap['ADMIN'].id;
    await usuarioRepo.save(userHellen);
    console.log(`⭐ Promoção: Usuário 'HELLEN.MAGALHAES' promovido a ADMIN com sucesso.`);
  } else {
    console.warn(`⚠️ Promoção: Usuário 'HELLEN.MAGALHAES' não encontrado no banco de dados.`);
  }

  console.log('✨ Seed finalizado com sucesso!');
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro durante a execução do seed:', error);
    process.exit(1);
  });
