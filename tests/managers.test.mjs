import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pkg from '@usebruno/lang';
import { createRequestBuilder } from '../dist/bruno/request.js';
import { createCollectionManager } from '../dist/bruno/collection.js';
import { createEnvironmentManager } from '../dist/bruno/environment.js';

const { bruToJsonV2 } = pkg;

let root;
const requests = createRequestBuilder();
const collections = createCollectionManager();
const environments = createEnvironmentManager();

before(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'bruno-test-'));
});
after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test('createRequest writes a .bru file inside the collection', async () => {
  const collectionPath = join(root, 'c1');
  const res = await requests.createRequest({
    collectionPath, name: 'My Req', method: 'GET', url: 'http://x'
  });
  assert.equal(res.success, true);
  assert.equal(res.path, join(collectionPath, 'my-req.bru'));
  const parsed = bruToJsonV2(await fs.readFile(res.path, 'utf-8'));
  assert.equal(parsed.meta.name, 'My Req');
});

test('SECURITY: createRequest with a traversal folder is rejected, no file written', async () => {
  const collectionPath = join(root, 'c2');
  await fs.mkdir(collectionPath, { recursive: true });
  const escapeTarget = join(root, 'ESCAPED.bru');

  const res = await requests.createRequest({
    collectionPath, name: 'Evil', method: 'GET', url: 'http://x',
    folder: '../../../../../../../../etc/cron.d'
  });

  assert.equal(res.success, false);
  assert.match(res.error, /escapes its parent directory/);
  // Nothing leaked outside the collection.
  await assert.rejects(fs.access(escapeTarget));
});

test('SECURITY: createCollection with traversal name is rejected', async () => {
  const res = await collections.createCollection({
    name: '../evil', outputPath: root
  });
  assert.equal(res.success, false);
});

test('SECURITY: environment name with ".." is rejected', async () => {
  const collectionPath = join(root, 'c3');
  await fs.mkdir(collectionPath, { recursive: true });
  const res = await environments.createEnvironment({
    collectionPath, name: '..', variables: { a: 1 }
  });
  assert.equal(res.success, false);
});

test('createEnvironment writes unquoted, parseable vars', async () => {
  const collectionPath = join(root, 'c4');
  await fs.mkdir(collectionPath, { recursive: true });
  const res = await environments.createEnvironment({
    collectionPath, name: 'dev',
    variables: { baseUrl: 'https://api.example.com', timeout: 5000, debug: true }
  });
  assert.equal(res.success, true);
  const content = await fs.readFile(res.path, 'utf-8');
  assert.doesNotMatch(content, /'https/); // not single-quoted
  assert.match(content, /baseUrl: https:\/\/api\.example\.com/);
});

test('addScript appends a tests block and keeps the file valid', async () => {
  const collectionPath = join(root, 'c5');
  const made = await requests.createRequest({
    collectionPath, name: 'WithTest', method: 'GET', url: 'http://x'
  });
  const res = await requests.addScript(made.path, 'tests', 'expect(1).to.equal(1)');
  assert.equal(res.success, true);
  const parsed = bruToJsonV2(await fs.readFile(made.path, 'utf-8'));
  assert.equal(parsed.tests, 'expect(1).to.equal(1)');
});

test('addScript preserves existing auth/body/headers when editing a complex request', async () => {
  const collectionPath = join(root, 'c5b');
  const made = await requests.createRequest({
    collectionPath, name: 'Complex', method: 'POST', url: 'https://api.example.com/x',
    headers: { 'Content-Type': 'application/json' },
    auth: { type: 'bearer', config: { token: '{{token}}' } },
    body: { type: 'json', content: '{\n  "a": 1\n}' }
  });
  const res = await requests.addScript(made.path, 'pre-request', "bru.setVar('t', 1)");
  assert.equal(res.success, true);

  const parsed = bruToJsonV2(await fs.readFile(made.path, 'utf-8'));
  // The new script landed...
  assert.equal(parsed.script.req, "bru.setVar('t', 1)");
  // ...and the pre-existing content survived the round-trip intact.
  assert.deepEqual(parsed.auth, { bearer: { token: '{{token}}' } });
  assert.equal(parsed.body.json, '{\n  "a": 1\n}');
  assert.equal(parsed.headers.find(h => h.name === 'Content-Type').value, 'application/json');
});

test('addScript rejects a non-.bru target', async () => {
  const res = await requests.addScript(join(root, 'nope.json'), 'tests', 'x');
  assert.equal(res.success, false);
  assert.match(res.error, /must be a \.bru file/);
});

test('listCollections finds collections by bruno.json', async () => {
  const base = join(root, 'workspace');
  await collections.createCollection({ name: 'alpha', outputPath: base });
  await collections.createCollection({ name: 'beta', outputPath: join(base, 'nested') });
  const found = await collections.listCollections(base);
  const names = found.map(c => c.name).sort();
  assert.deepEqual(names, ['alpha', 'beta']);
});

test('getCollectionStats counts requests by method', async () => {
  const collectionPath = join(root, 'stats');
  await collections.createCollection({ name: 's', outputPath: join(root, 'stats-parent') });
  const cp = join(root, 'stats-parent', 's');
  await requests.createRequest({ collectionPath: cp, name: 'a', method: 'GET', url: 'http://x' });
  await requests.createRequest({ collectionPath: cp, name: 'b', method: 'GET', url: 'http://x' });
  await requests.createRequest({ collectionPath: cp, name: 'c', method: 'POST', url: 'http://x' });
  const stats = await collections.getCollectionStats(cp);
  assert.equal(stats.totalRequests, 3);
  assert.equal(stats.requestsByMethod.GET, 2);
  assert.equal(stats.requestsByMethod.POST, 1);
});
