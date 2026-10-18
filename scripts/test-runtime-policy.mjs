import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('packaged WebView can fetch local model buffers without allowing remote fetch origins', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const policy = new Set(config.app.security.csp['connect-src'].split(/\s+/));
  for (const source of ["'self'", 'blob:', 'data:', 'ipc:', 'http://ipc.localhost']) assert.ok(policy.has(source));
  assert.deepEqual([...policy].sort(), ["'self'", 'blob:', 'data:', 'ipc:', 'http://ipc.localhost'].sort());
});

test('packaged JSON editor and bundled generators may start only local workers', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.app.security.csp['worker-src'].split(/\s+/).sort(), ["'self'", 'blob:'].sort());
});

test('JSON validation uses the existing editor instance and a non-inline local worker asset', async () => {
  const source = readFileSync(new URL('../src/modules/json_editor_runtime.ts', import.meta.url), 'utf8');
  assert.match(source, /worker-json\.js\?url&no-inline/);
  const code = source
    .replace("import JSONEditor from 'jsoneditor'", 'const calls = []; const JSONEditor = {ace:{config:{setModuleUrl:(...args)=>calls.push(args),set:(...args)=>calls.push(args)}}}; export {calls};')
    .replace(/import jsonWorkerUrl from '[^']*'/, 'const jsonWorkerUrl = "/assets/worker-json-test.js";');
  const js = ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText;
  const {calls} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  assert.deepEqual(calls, [['ace/mode/json_worker', '/assets/worker-json-test.js'], ['loadWorkerFromBlob', false]]);
});
