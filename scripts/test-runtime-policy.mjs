import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('packaged WebView can fetch local model buffers without allowing remote fetch origins', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const policy = new Set(config.app.security.csp['connect-src'].split(/\s+/));
  for (const source of ["'self'", 'blob:', 'data:', 'ipc:', 'http://ipc.localhost']) assert.ok(policy.has(source));
  assert.deepEqual([...policy].sort(), ["'self'", 'blob:', 'data:', 'ipc:', 'http://ipc.localhost'].sort());
});
