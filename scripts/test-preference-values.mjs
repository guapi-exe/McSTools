import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/preference-values.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}});
const {storedFileSize} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('unset and corrupt persisted sizes remain safe for numeric rendering', () => {
  for (const value of [undefined, null, 'null', '', 'bad', NaN, Infinity, -1, '-2', {}, [], true]) {
    assert.equal(storedFileSize(value), 0);
    assert.equal(storedFileSize(value).toFixed(2), '0.00');
  }
});

test('numeric sizes and legacy numeric strings retain their value', () => {
  for (const value of [123.125, '123.125', ' 123.125 ']) assert.equal(storedFileSize(value), 123.125);
  assert.equal(storedFileSize(0), 0);
});
