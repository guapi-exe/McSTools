import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createI18n} from 'vue-i18n';
import {computed} from 'vue';
import {parse} from '@vue/compiler-sfc';
import {baseCompile} from '@intlify/message-compiler';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText).toString('base64');
const catalogUrl = moduleUrl(read('src/i18n/desktop.ts'));
const {desktopTranslations, desktopMessages} = await import(catalogUrl);
const {normalizeAppLocale} = await import(moduleUrl(read('src/i18n/locale.ts')));
const placeholders = value => [...new Set([...value.matchAll(/\{([A-Za-z]\w*)\}/g)].map(match => match[1]))].sort();

test('all four desktop languages compile and preserve every placeholder', () => {
  const seen = new Set();
  for (const [key, values] of Object.entries(desktopTranslations)) {
    assert.equal(values.length, 4, key);
    assert.ok(!seen.has(values[0]), 'Duplicate source message: ' + key);
    seen.add(values[0]);
    for (const message of values) {
      assert.ok(message.trim(), key);
      assert.deepEqual(placeholders(message), placeholders(values[0]), key);
      baseCompile(message, {onError: error => {throw new Error(key + ': ' + error.message);}});
    }
    assert.ok(!/\p{Script=Han}/u.test(values[1]), 'Untranslated English: ' + key);
  }
});

const components = [
  'tools/BlueprintEditor.vue', 'tools/BlueprintExportPanel.vue', 'tools/BlueprintFormatFields.vue',
  'others/GeneratedBlueprintExport.vue', 'others/ToolPalettePicker.vue', 'others/mapImage2d.vue',
  'others/modelToSchem.vue', 'others/ToolModelPreview.vue', 'others/BlueprintBatchConverter.vue',
];
test('new desktop templates have no hardcoded Chinese and reference real message keys', () => {
  for (const file of components) {
    const source = read('src/units/' + file);
    const {descriptor, errors} = parse(source);
    assert.deepEqual(errors, [], file);
    const template = descriptor.template.content.replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!/\p{Script=Han}/u.test(template), 'Hardcoded template: ' + file);
    for (const [, key] of source.matchAll(/\$t\(['"]desktop\.([\w]+)['"]/g)) {
      assert.ok(Object.hasOwn(desktopTranslations, key), file + ': ' + key);
    }
  }
});

test('locale changes update dynamic group, count and version labels without remount', () => {
  const i18n = createI18n({legacy: false, locale: 'zh', fallbackLocale: 'en', messages: Object.fromEntries(
    Object.entries(desktopMessages).map(([locale, desktop]) => [locale, {desktop}]),
  )});
  const label = computed(() => i18n.global.t('desktop.group_wool'));
  assert.equal(label.value, '羊毛');
  i18n.global.locale.value = 'en';
  assert.equal(label.value, 'Wool');
  assert.equal(i18n.global.t('desktop.blockCount', {count: 512}), '512 blocks');
  i18n.global.locale.value = 'ja';
  assert.equal(i18n.global.t('desktop.gameVersion'), '対象ゲームバージョン');
  i18n.global.locale.value = 'zh_tw';
  assert.equal(i18n.global.t('desktop.color_red'), '紅色');
  i18n.dispose();
});

test('saved and historical locale codes restore a registered language and select value', () => {
  for (const code of ['zh_tw', 'zh-TW', 'zh-Hant', 'zh_HK', 'zh-MO']) assert.equal(normalizeAppLocale(code), 'zh_tw');
  for (const code of ['zh', 'zh-CN', 'zh-Hans', 'zh_cn', '', null, undefined, {}]) assert.equal(normalizeAppLocale(code), 'zh');
  assert.equal(normalizeAppLocale('en-US'), 'en');
  assert.equal(normalizeAppLocale('ja-JP'), 'ja');
  for (const locale of Object.keys(desktopMessages)) assert.equal(normalizeAppLocale(locale), locale);
});

test('the backported batch tool has a tab label in every existing language', async () => {
  for (const file of ['zh_cn', 'zh_tw', 'en', 'ja']) {
    const {default: messages} = await import(moduleUrl(read(`src/i18n/${file}.ts`)));
    assert.ok(messages.others.tabs.batchConvert, file);
  }
});

test('native safety warnings localize while unknown diagnostics remain intact', async () => {
  const source = read('src/modules/blueprint_export.ts')
    .replace("import {invoke} from '@tauri-apps/api/core'", 'const invoke = () => {throw new Error("IPC is not used in this test")};')
    .replace("'../i18n/desktop'", JSON.stringify(catalogUrl));
  const {exportError, exportWarning} = await import(moduleUrl(source));
  const t = key => desktopMessages.en[key.replace('desktop.', '')];
  assert.equal(exportError('copy destination already exists', t), desktopMessages.en.existingFileError);
  assert.equal(exportError('MCEdit requires an explicit target', t), desktopMessages.en.legacyVersionError);
  assert.equal(exportWarning(desktopMessages.zh.bedrockWarning, t), desktopMessages.en.bedrockWarning);
  assert.equal(exportError('Error: ' + desktopMessages.zh.chooseBlocks, t), desktopMessages.en.chooseBlocks);
  assert.equal(exportError('invalid gzip header at byte 7', t), 'invalid gzip header at byte 7');
});
