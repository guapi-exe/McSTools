import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';

const build = buildSync({entryPoints: ['src/modules/nbt/source_document.ts'], bundle: true, write: false, format: 'esm', platform: 'node'});
const {SourceDocument} = await import('data:text/javascript;base64,' + Buffer.from(build.outputFiles[0].text).toString('base64'));

test('large arrays send only 100 summaries; unvisited values survive save', () => {
  const doc = new SourceDocument();
  const initial = doc.load(`{Schematic:{Width:82s,Height:72s,Length:70s,Blocks:{Data:[B;${Array(413280).fill('1b').join(',')}]}}}`);
  assert.equal(initial.items.length, 1);
  const page = doc.page(['Schematic', 'Blocks', 'Data']);
  assert.equal(page.node.size, 413280);
  assert.equal(page.items.length, 100);
  assert.equal(page.next, 100);
  assert.ok(JSON.stringify(page).length < 20000);
  assert.equal(doc.page(['Schematic', 'Blocks', 'Data'], 413200).items.length, 80);
  assert.throws(() => doc.editText(['Schematic']), /过大/);
  doc.update(['Schematic', 'Width'], '83s');
  const restored = new SourceDocument(); restored.load(doc.save());
  assert.equal(restored.page(['Schematic']).items[0].preview, '83s');
  assert.equal(restored.page(['Schematic', 'Blocks', 'Data'], 413279).items[0].preview, '1b');
});

test('typed numbers, signed bytes, long precision and long-looking strings round trip', () => {
  const text = '{byte:-128b,short:32767s,int:2147483647,long:9223372036854775807l,float:1.25e-7f,double:1e30d,string:"123l",bytes:[B;-128b,-1b,0b,127b],ints:[I;-2147483648,2147483647],longs:[L;-9223372036854775808,9223372036854775807l]}';
  const doc = new SourceDocument(); doc.load(text);
  const saved = doc.save();
  assert.match(saved, /"string":"123l"/);
  assert.match(saved, /-9223372036854775808/);
  const again = new SourceDocument(); again.load(saved);
  assert.deepEqual(again.page([]), doc.page([]));
  assert.deepEqual(again.page(['bytes']), doc.page(['bytes']));
  doc.update(['longs', 1], '9007199254740993l');
  assert.equal(doc.page(['longs']).items[1].preview, '9007199254740993l');
});

test('bad edits fail without changing the existing document', () => {
  const doc = new SourceDocument(); doc.load('{values:[B;1b],count:1}');
  const before = doc.save();
  for (const text of ['200b', '1 trailing', '{broken:', '[L;9223372036854775808l]', '[B;-]']) {
    assert.throws(() => doc.update(['count'], text));
    assert.equal(doc.save(), before);
  }
  assert.throws(() => doc.update(['values', 0], '"string"'));
  assert.equal(doc.save(), before);
});

test('compound keys named value and __proto__ are data, not type/prototype metadata', () => {
  const doc = new SourceDocument(); doc.load('{value:{value:2},"__proto__":{safe:1}}');
  assert.equal(doc.page(['value']).items[0].name, 'value');
  doc.update(['__proto__'], '{safe:2}');
  assert.equal(doc.page(['__proto__']).items[0].preview, '2');
  assert.match(doc.save(), /"__proto__":/);
  assert.equal({}.safe, undefined);
});

test('empty compounds and consecutive empty list entries survive viewing and editing', () => {
  const doc = new SourceDocument();
  doc.load('{Schematic:{Metadata:{},Blocks:{Palette:{},Data:[B;]},Entities:[{},{},{Data:{}}],Tail:1}}');
  assert.equal(doc.page(['Schematic', 'Metadata']).node.type, 'Compound');
  assert.equal(doc.page(['Schematic', 'Metadata']).node.preview, '{}');
  assert.equal(doc.page(['Schematic', 'Entities']).node.size, 3);
  assert.deepEqual(doc.page(['Schematic', 'Entities']).items.map(node => node.type), ['Compound', 'Compound', 'Compound']);
  doc.update(['Schematic', 'Tail'], '2');
  const again = new SourceDocument();
  again.load(doc.save());
  assert.deepEqual(again.page(['Schematic']), doc.page(['Schematic']));
  assert.deepEqual(again.page(['Schematic', 'Entities']), doc.page(['Schematic', 'Entities']));
  assert.match(again.editText(['Schematic', 'Metadata']), /^\{\s*\}$/);
  // Do not work around malformed backend output by silently deleting fields.
  assert.throws(() => again.load('{Schematic:{Metadata:,Tail:1}}'), /Unexpected character/);
});

test('saved SNBT is native-compatible: compact lists, quoted keys and explicit numeric types', () => {
  const doc = new SourceDocument();
  doc.load('{"123":1,"true":2,zero:0.0d,negativeZero:-0.0f,float:1.0f,longs:[L;9223372036854775807l],bytes:[B;-128b],list:[{longName:"a long string that exceeds the old automatic line breaking length"},{empty:{}}]}');
  const saved = doc.save();
  assert.ok(!saved.includes('\n'), 'compact mode must not insert newlines in long lists');
  assert.match(saved, /"123":1/);
  assert.match(saved, /"true":2/);
  assert.match(saved, /"zero":0\.0d/);
  assert.match(saved, /"negativeZero":-0\.0f/);
  assert.match(saved, /"float":1\.0f/);
  assert.match(saved, /\[L;9223372036854775807l\]/);
  assert.match(saved, /\[B;-128b\]/);
  const restored = new SourceDocument();
  restored.load(saved);
  assert.deepEqual(restored.page([]), doc.page([]));
});
