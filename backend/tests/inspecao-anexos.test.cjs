const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { AppDataSource } = require('../dist/config/database');
const { Inspecao } = require('../dist/entities/Inspecao');
const { Anexo } = require('../dist/entities/Anexo');
const rbac = require('../dist/services/rbac.service');
const uploads = require('../dist/config/uploads');
const inspectionId = '00000000-0000-4000-8000-000000000001';
const user = { userId: 'operator', perfilId: 'profile', plantaId: 'plant' };
let tempDir;
let router;
let permissions;
let saved;
let exists;
let failSave;
let lookup;

async function setup() {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'erp-inspecao-anexos-'));
  uploads.uploadDir = tempDir;
  rbac.perfilPossuiPermissao = async (_, action) => permissions.includes(action);
  AppDataSource.getRepository = entity => entity === Inspecao ? {
    findOne: async options => { lookup = options; return exists ? { id: inspectionId } : null; }
  } : entity === Anexo ? {
    create: value => value,
    save: async value => { if (failSave) throw new Error('simulated persistence failure'); saved.push(value); return value; },
    find: async options => saved.filter(a => a.entidadeTipo === options.where.entidadeTipo && a.entidadeId === options.where.entidadeId)
  } : (() => { throw new Error('Unexpected repository'); })();
  router = require('../dist/routes/inspecoes.routes').default;
}
function request(method, { id = inspectionId, currentUser = user, mime = 'image/png', field = 'file', content = Buffer.from('image'), file = true } = {}) {
  const boundary = 'test-boundary';
  const body = file ? Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="photo.png"\r\nContent-Type: ${mime}\r\n\r\n`),
    content, Buffer.from(`\r\n--${boundary}--\r\n`)
  ]) : Buffer.from(`--${boundary}--\r\n`);
  const req = Readable.from([body]);
  Object.assign(req, { params: {id}, user: currentUser, method, headers: {'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length)} });
  const route = router.stack.find(layer => layer.route?.path === '/:id/anexos' && layer.route.methods[method.toLowerCase()]).route;
  return new Promise((resolve, reject) => {
    const res = { code: 200, status(code) {this.code = code; return this}, json(value) {resolve({status: this.code, value}); return this} };
    let index = 0;
    const next = error => {
      if (error) return reject(error);
      const handler = route.stack[index++]?.handle;
      if (!handler) return reject(new Error('No response'));
      try { Promise.resolve(handler(req, res, next)).catch(reject); } catch (e) { reject(e); }
    };
    next();
  });
}

test('contrato de anexos, autorização, multipart e limpeza sem banco', async t => {
  await setup();
  permissions = ['EDITAR_TELA_INSPECAO_QUALIDADE']; saved = []; exists = true; failSave = false;
  await t.test('sem sessão', async () => assert.equal((await request('POST', {currentUser: null})).status, 401));
  await t.test('sem edição', async () => { permissions = []; assert.equal((await request('POST')).status, 403); permissions = ['EDITAR_TELA_INSPECAO_QUALIDADE']; });
  await t.test('id inválido', async () => assert.equal((await request('POST', {id:'invalid'})).status, 400));
  await t.test('sem planta', async () => assert.equal((await request('POST', {currentUser:{...user, plantaId:undefined}})).status, 403));
  await t.test('inspeção fora do escopo', async () => {exists = false; assert.equal((await request('POST')).status, 404); assert.deepEqual(lookup.where, {id:inspectionId, ordemTeste:{plantaId:'plant'}}); exists = true; assert.deepEqual(await fs.readdir(tempDir), []);});
  await t.test('arquivo ausente', async () => assert.equal((await request('POST', {file:false})).value.code, 'FILE_MISSING'));
  await t.test('tipo não suportado', async () => assert.equal((await request('POST', {mime:'application/pdf'})).status, 400));
  await t.test('campo incorreto', async () => assert.equal((await request('POST', {field:'foto'})).status, 400));
  await t.test('limite de 10 MB', async () => assert.equal((await request('POST', {content:Buffer.alloc(10 * 1024 * 1024 + 1)})).status, 413));
  await t.test('upload e vínculo', async () => { const r = await request('POST'); assert.equal(r.status, 201); assert.equal(r.value.entidadeTipo, 'inspecoes'); assert.equal(r.value.entidadeId, inspectionId); assert.equal(r.value.uploadedPorId, user.userId); assert.equal((await fs.readdir(tempDir)).length, 1); });
  await t.test('listagem isolada por inspeção', async () => {assert.equal((await request('GET')).value.length, 1); assert.equal((await request('GET', {id:'00000000-0000-4000-8000-000000000002'})).value.length, 0);});
  await t.test('acesso todas plantas', async () => {permissions.push('ACESSAR_TODAS_PLANTAS'); assert.equal((await request('GET', {currentUser:{...user, plantaId:undefined}})).status, 200); assert.deepEqual(lookup.where, {id:inspectionId});});
  await t.test('falha no banco remove arquivo novo', async () => {failSave = true; assert.equal((await request('POST')).status, 500); assert.equal((await fs.readdir(tempDir)).length, 1); assert.equal(saved.length, 1);});
});
after(async () => { if (tempDir) await fs.rm(tempDir, {recursive:true, force:true}); });
