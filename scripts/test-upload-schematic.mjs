import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/upload_schematic.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const {outputText} = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}});
function fixture(invoke = async () => {}) {
  const state = {value: {schematics: 10}};
  const intervals = new Map();
  let next = 0;
  const window = {setInterval: fn => { intervals.set(++next, fn); return next; }, clearInterval: id => intervals.delete(id)};
  const result = {};
  new Function('exports', 'ref', 'invoke', 'userData', 'toast', 'fetch_data', 'window', 'console', outputText)(
    result, value => ({value}), invoke, state, {info() {}, error() {}, success() {}}, async () => {}, window, {error() {}},
  );
  return {...result, state, intervals};
}
const file = name => ({name, size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer});

test('oversized inputs fail before File.arrayBuffer or native IPC is called', async () => {
  let reads = 0, calls = 0;
  const f = fixture(async () => { calls++; });
  f.files.value = [{name: 'large.schematic', size: 256 * 1024 * 1024 + 1, arrayBuffer: async () => { reads++; }}];
  await f.handleUpload(-1);
  assert.equal(reads, 0); assert.equal(calls, 0);
  assert.equal(f.uploadStatus.value, 'error');
  assert.match(f.uploadError.value, /256 MiB/);
  assert.equal(f.state.value.schematics, 10);
});

test('a failed batch keeps successful imports counted and the library invalidated', async () => {
  let calls = 0;
  const f = fixture(async () => { if (++calls === 2) throw 'Invalid NBT structure'; });
  f.files.value = [file('a.nbt'), file('broken.nbt')];
  await f.handleUpload(-1);
  assert.equal(calls, 2);
  assert.equal(f.state.value.schematics, 11);
  assert.equal(f.localSchematicsRefreshVersion.value, 1);
  assert.equal(f.uploadError.value, 'Invalid NBT structure');
});

test('updates do not count as new blueprints and retry clears old reset timers', async () => {
  const f = fixture();
  f.files.value = [file('a.nbt')];
  await f.handleUpload(42);
  assert.equal(f.state.value.schematics, 10);
  const old = f.progressTimer.value;
  await f.handleUpload(42);
  assert.equal(f.intervals.has(old), false);
  assert.equal(f.intervals.size, 1);
  assert.equal(f.state.value.schematics, 10);
});

test('upload snapshots its queue and ignores duplicate submissions while busy', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const names = [];
  const f = fixture(async (_command, args) => { names.push(args.fileName); if (names.length === 1) await gate; });
  f.files.value = [file('a.nbt'), file('b.nbt')];
  const running = f.handleUpload(-1);
  await Promise.resolve();
  f.files.value = [file('replacement.nbt')];
  await f.handleUpload(-1);
  release(); await running;
  assert.deepEqual(names, ['a.nbt', 'b.nbt']);
  assert.equal(f.state.value.schematics, 12);
});
