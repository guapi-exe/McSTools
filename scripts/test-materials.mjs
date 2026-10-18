import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const modules = new Map();
function sourceUrl(path) {
  if (modules.has(path)) return modules.get(path);
  let source = readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [specifier, file] of Object.entries({
    './vanilla-block-names.generated': '../src/modules/materials/vanilla-block-names.generated.ts',
    './block_names': '../src/modules/materials/block_names.ts',
  })) {
    if (source.includes(`from '${specifier}'`)) source = source.replace(`from '${specifier}'`, `from '${sourceUrl(file)}'`);
  }
  const {outputText} = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}});
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  modules.set(path, url);
  return url;
}
const {materialName} = await import(sourceUrl('../src/modules/materials/block_names.ts'));
const {materialsCsv, csvCell} = await import(sourceUrl('../src/modules/materials/materials_csv.ts'));
const {vanillaBlockNames, vanillaBlockTraditionalNames} = await import(sourceUrl('../src/modules/materials/vanilla-block-names.generated.ts'));
const item = (id, count = 65) => ({id, zh_cn: 'outdated stored label', num: count, count, percentage: 25.125});

test('website name catalogue contains every 1.21.11 vanilla block in both Chinese locales', () => {
  assert.equal(Object.keys(vanillaBlockNames).length, 1166);
  assert.deepEqual(Object.keys(vanillaBlockNames), Object.keys(vanillaBlockTraditionalNames));
  for (const [id, name] of Object.entries(vanillaBlockNames)) {
    assert.equal(materialName(id, 'zh'), name);
    assert.equal(materialName(id, 'zh_tw'), vanillaBlockTraditionalNames[id]);
  }
});
test('legacy aliases and state suffixes translate without stealing a mod namespace', () => {
  assert.equal(materialName('minecraft:grass'), materialName('minecraft:short_grass'));
  assert.equal(materialName('minecraft:grass_path'), materialName('minecraft:dirt_path'));
  assert.equal(materialName('block:Minecraft:Stone[axis=x]'), '石头');
  assert.equal(materialName('othermod:stone'), 'othermod:stone');
  assert.equal(materialName('minecraft:not_a_known_block'), 'minecraft:not_a_known_block');
  assert.equal(materialName('minecraft:stone', 'en'), 'stone');
});
test('CSV uses BOM, CRLF, current names, original IDs, stack/remainder and stable percentage', () => {
  const csv = materialsCsv([item('minecraft:stone'), item('my_mod:stone')], 'zh');
  assert.ok(csv.startsWith('\uFEFF"方块 ID"'));
  assert.equal(csv.split('\r\n').length, 3);
  assert.ok(csv.includes('"minecraft:stone","石头","65","1","1","25.125"'));
  assert.ok(csv.includes('"my_mod:stone","my_mod:stone"'));
  assert.ok(!csv.includes('outdated stored label'));
  assert.ok(materialsCsv([], 'en').includes('"Block ID","Name"'));
  assert.ok(materialsCsv([], 'ja').includes('"素材名"'));
  assert.ok(materialsCsv([], 'zh_tw').includes('"材料名稱"'));
});
test('CSV quotes every field and neutralizes spreadsheet formulas after leading controls', () => {
  for (const value of ['=1+1', '+SUM(1)', '-2', '@SUM(1)', '\t =cmd()', '\r\n-3', '\u0000+1']) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell('mod:a,"b"\nc'), '"mod:a,""b""\nc"');
  assert.equal(csvCell('minecraft:oak_planks'), '"minecraft:oak_planks"');
  assert.ok(materialsCsv([item('=cmd()')]).includes('"\'=cmd()","\'=cmd()"'));
});
