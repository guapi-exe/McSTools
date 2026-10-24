import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {ref} from 'vue';

// Exercise the real shared store with controlled IPC completion ordering.
// Vue refs remain real; no app profile or library files are opened.
let sequence = 0;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
async function fixture() {
  const requests = [], histories = [];
  const deps = {
    ref,
    fetchSchematic: id => {const task = {...deferred(), id}; requests.push(task); return task.promise;},
    fetchConvertData: async id => ({id}),
    fetchRequirementsWithStats: async id => ({id}),
    fetchUniqueBlocks: async id => [{id}],
    fetchHistoryRecord: id => {const task = {...deferred(), id}; histories.push(task); return task.promise;},
    invoke: () => {throw new Error('Unexpected native command');},
    toast: {error: () => {}},
  };
  const key = '__tools_data_test_' + ++sequence;
  globalThis[key] = deps;
  const source = readFileSync(new URL('../src/modules/tools_data.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\s*$/gm, '');
  const code = `const {${Object.keys(deps).join(',')}} = globalThis[${JSON.stringify(key)}];\n` + source;
  const js = ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
  const store = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  delete globalThis[key];
  return {store, requests, histories};
}

test('same-source metadata and getters share one pending fetch', async () => {
  const {store, requests} = await fixture();
  const first = store.fetch_data(1);
  const again = store.fetch_data(1);
  const data = store.get_data(1);
  const requirements = store.get_requirements(1);
  assert.equal(requests.length, 1);
  requests[0].resolve({id: 1, sizes: '2,2,2'});
  await Promise.all([first, again]);
  assert.equal((await data).id, 1);
  assert.equal((await requirements).id, 1);
});

test('switching sources clears cached panels and ignores the slower old source', async () => {
  const {store, requests} = await fixture();
  const old = store.fetch_data(1);
  store.activeTools.value = 'data';
  const current = store.fetch_data(2);
  assert.equal(store.activeTools.value, 'schematic');
  assert.equal(store.schematicData.value, undefined);
  requests[1].resolve({id: 2});
  await current;
  requests[0].resolve({id: 1});
  await old;
  assert.equal(store.schematicData.value.id, 2);
});

test('clear and reselect of the same id cannot reuse or publish a stale request', async () => {
  const {store, requests} = await fixture();
  const old = store.fetch_data(1);
  store.clear_tools();
  const current = store.fetch_data(1);
  assert.equal(requests.length, 2);
  requests[0].resolve({id: 1, name: 'stale'});
  await old;
  assert.equal(store.schematicData.value, undefined);
  const duplicate = store.fetch_data(1);
  assert.equal(requests.length, 2, 'old finally must not clear the new in-flight handle');
  requests[1].resolve({id: 1, name: 'current'});
  await Promise.all([current, duplicate]);
  assert.equal(store.schematicData.value.name, 'current');
});

test('only the current load displays an error, and retry clears it', async () => {
  const {store, requests} = await fixture();
  const oldFailure = assert.rejects(store.fetch_data(1), /old failure/);
  store.clear_tools();
  const failure = assert.rejects(store.fetch_data(1), /current failure/);
  requests[0].reject(new Error('old failure'));
  await oldFailure;
  assert.equal(store.schematicLoadError.value, '');
  requests[1].reject(new Error('current failure'));
  await failure;
  assert.equal(store.schematicLoadError.value, 'current failure');
  const retry = store.fetch_data(1);
  assert.equal(store.schematicLoadError.value, '');
  requests[2].resolve({id: 1});
  await retry;
  assert.equal(store.schematicData.value.id, 1);
});

test('a late history request cannot restore data after clearing and reselecting', async () => {
  const {store, requests, histories} = await fixture();
  const initial = store.fetch_data(1);
  requests[0].resolve({id: 1});
  await initial;
  const oldHistory = store.fetch_history(1);
  store.clear_tools();
  const current = store.fetch_data(1);
  requests[1].resolve({id: 1});
  await current;
  histories[0].resolve({id: 1, old: true});
  await oldHistory;
  assert.equal(store.historyRecordData.value, undefined);
});
