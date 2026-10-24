import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {computed, ref} from 'vue';

let sequence = 0;
function deferred() { let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b}); return {resolve, reject, promise}; }
async function fixture() {
  const requests = [];
  const key = '__connection_test_' + ++sequence;
  globalThis[key] = {computed, ref, buildLibraryRequest: () => {}, normalizeLibraryPage: () => {}, invoke: (command, args) => {const task = {...deferred(), command, args}; requests.push(task); return task.promise}};
  const source = readFileSync('src/modules/web_schematic/mcs_api.ts', 'utf8').replace(/^import .*;\s*$/gm, '');
  const code = `const {computed,ref,invoke,buildLibraryRequest,normalizeLibraryPage}=globalThis[${JSON.stringify(key)}];\n` + source;
  const js = ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
  const store = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  delete globalThis[key];
  return {store, requests};
}
test('restore is shared and verifies saved account without returning a key to JS', async () => {
  const {store, requests} = await fixture();
  const restore = store.restoreMcsConnection();
  assert.equal(store.restoreMcsConnection(), restore);
  requests[0].resolve({connected: true, persisted: true});
  await Promise.resolve();
  assert.equal(requests[1].command, 'mcs_api_get');
  assert.deepEqual(requests[1].args.query, {page: '1', limit: '1'}, 'owner totalCount requires offset pagination');
  requests[1].resolve({items: [], totalCount: 12}); await restore;
  assert.equal(store.mcsStatus.value, 'connected');
  assert.equal(store.mcsBlueprintCount.value, 12);
});
test('a slow restore cannot overwrite a newer explicit disconnect', async () => {
  const {store, requests} = await fixture();
  const restoring = store.restoreMcsConnection(), disconnect = store.connectMcsApi('');
  requests[1].resolve({connected: false, persisted: false}); await disconnect;
  requests[0].resolve({connected: true, persisted: true}); await restoring;
  assert.equal(store.mcsSaved.value, false); assert.equal(store.mcsConnected.value, false);
});
test('offline retains credentials; revoked key is not shown as connected', async () => {
  const {store, requests} = await fixture();
  const connect = store.connectMcsApi('mcs_live_fake');
  requests[0].resolve({connected: true, persisted: true, blueprintCount: 9}); await connect;
  const offline = store.refreshMcsConnection(); requests[1].reject({code: 'NETWORK', message: 'offline'}); await offline;
  assert.equal(store.mcsStatus.value, 'offline'); assert.equal(store.mcsSaved.value, true);
  const revoked = store.refreshMcsConnection(); requests[2].reject({code: 'AUTH_REQUIRED', message: 'revoked'}); await revoked;
  assert.equal(store.mcsStatus.value, 'invalid'); assert.equal(store.mcsConnected.value, false); assert.equal(store.mcsSaved.value, true);
});
test('failed replacement preserves the connected account', async () => {
  const {store, requests} = await fixture();
  const first = store.connectMcsApi('mcs_live_fake'); requests[0].resolve({connected: true, persisted: true, blueprintCount: 9}); await first;
  const failure = assert.rejects(store.connectMcsApi('mcs_live_fake_invalid'));
  requests[1].reject(new Error('invalid')); await failure;
  assert.equal(store.mcsConnected.value, true); assert.equal(store.mcsBlueprintCount.value, 9);
});

test('database restore failure can be retried without a key in JS', async () => {
  const {store, requests} = await fixture();
  const restoring = store.restoreMcsConnection();
  requests[0].reject({code: 'CREDENTIAL_STORE', message: '无法读取保存的连接，请稍后重试'});
  await restoring;
  assert.equal(store.mcsStatus.value, 'disconnected');
  assert.ok(store.mcsConnectionError.value);
  const retry = store.refreshMcsConnection();
  assert.equal(requests[1].command, 'restore_mcs_connection');
  assert.equal(requests[1].args, undefined);
  requests[1].resolve({connected: true, persisted: true});
  await Promise.resolve();
  requests[2].resolve({items: [], totalCount: 7});
  await retry;
  assert.equal(store.mcsStatus.value, 'connected');
  assert.equal(store.mcsConnectionError.value, '');
  assert.equal(store.mcsBlueprintCount.value, 7);
});

test('failed database logout keeps the account until deletion succeeds', async () => {
  const {store, requests} = await fixture();
  const connect = store.connectMcsApi('mcs_live_fake');
  requests[0].resolve({connected: true, persisted: true, blueprintCount: 9});
  await connect;
  const failure = assert.rejects(store.connectMcsApi(''));
  requests[1].reject({code: 'CREDENTIAL_STORE', message: '无法保存连接，原连接保持不变'});
  await failure;
  assert.equal(store.mcsSaved.value, true);
  assert.equal(store.mcsConnected.value, true);
  assert.equal(store.mcsBlueprintCount.value, 9);
  assert.equal(store.mcsConnectionBusy.value, false);
  const disconnect = store.connectMcsApi('');
  requests[2].resolve({connected: false, persisted: false});
  await disconnect;
  assert.equal(store.mcsSaved.value, false);
  assert.equal(store.mcsConnected.value, false);
  assert.equal(store.mcsBlueprintCount.value, undefined);
});
