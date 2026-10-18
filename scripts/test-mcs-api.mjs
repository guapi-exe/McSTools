import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Test the real adapter without starting a WebView or persisting credentials.
const source = readFileSync(new URL('../src/modules/web_schematic/mcs_api_contract.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext}});
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const filters = {keyword: '', sort: 'latest', featured: false, category: '', format: '', gameVersion: ''};
const id = '01a14549-a8f5-7c10-810f-591eee61f175';
const summary = {id, slug: 'a-castle', title: '城堡', description: '简介', author: {displayName: '作者'}, currentVersion: {number: 3, sourceFormat: 'litematica'}, previewUrl: `/api/v1/blueprints/${id}/versions/3/preview`, engagement: {downloadCount: 4}, updatedAt: '2026-10-18T00:00:00Z'};

test('public discovery is anonymous and cannot mix private works or page with cursor', () => {
  const result = api.buildLibraryRequest('public', {...filters, keyword: ' 城堡 ', featured: true}, 'opaque/+=', 4);
  assert.equal(result.path, '/api/v1/blueprints');
  assert.equal(result.authenticated, false);
  assert.deepEqual(result.query, {limit: '24', q: '城堡', extra: 'none', sort: 'latest', featured: 'true', cursor: 'opaque/+='});
});

test('owned library uses one-based filtered pagination, not a stale public cursor', () => {
  const result = api.buildLibraryRequest('mine', {...filters, format: 'mcedit', gameVersion: 'java-1.7.10'}, 'old-cursor', 2);
  assert.equal(result.authenticated, true);
  assert.equal(result.query.page, '2');
  assert.equal(result.query.format, 'mcedit');
  assert.equal(result.query.gameVersion, 'java-1.7.10');
  assert.equal(result.query.cursor, undefined);
  assert.equal(result.query.extra, undefined);
});

test('favourites do not pretend to support discovery filters', () => {
  const result = api.buildLibraryRequest('favourites', {...filters, keyword: 'ignored', format: 'world_edit'}, 'next');
  assert.equal(result.path, '/api/v1/account/favourites');
  assert.deepEqual(result.query, {limit: '24', cursor: 'next'});
});

test('response cursor and count are authoritative, not inferred from page size', () => {
  const page = api.normalizeLibraryPage({items: [summary], totalCount: 100, nextCursor: 'next'}, 'public');
  assert.equal(page.nextCursor, 'next');
  assert.equal(page.totalCount, 100);
  assert.equal(page.items[0].version, 3);
  assert.equal(page.items[0].author, '作者');
  assert.equal(page.items[0].downloads, 4);
  assert.equal(page.items[0].available, true);
  assert.equal(page.items[0].previewUrl, api.MCS_ORIGIN + summary.previewUrl);
});

test('an unavailable favourite is neutral and cannot be imported', () => {
  const item = api.normalizeLibraryPage({items: [{blueprintId: id, title: null, slug: null}]}, 'favourites').items[0];
  assert.equal(item.title, '此收藏当前不可访问');
  assert.equal(item.available, false);
  assert.equal(item.version, 0);
});

test('unknown formats and invalid versions are not imported under a guessed extension', () => {
  for (const currentVersion of [{number: 0, sourceFormat: 'mcedit'}, {number: 1, sourceFormat: 'future_format'}]) {
    const item = api.normalizeLibraryPage({items: [{...summary, currentVersion}]}, 'public').items[0];
    assert.equal(item.available, false);
  }
  assert.equal(api.sourceFormats.find(item => item.value === 'bedrock_edition').extension, 'mcstructure');
});

test('bad responses remain errors instead of looking like an empty catalogue', () => {
  assert.throws(() => api.normalizeLibraryPage([], 'public'));
  assert.throws(() => api.normalizeLibraryPage({items: [{...summary, id: '../private'}]}, 'public'));
  assert.equal(api.normalizeLibraryPage({items: [], totalCount: 0}, 'public').totalCount, 0);
});

test('images and website URLs cannot introduce executable or credential URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,evil', 'file:///secret', 'https://key@evil.test/a']) assert.equal(api.safeMcsImageUrl(url), undefined);
  assert.equal(api.blueprintWebUrl({id, slug: '城堡 /?' }), `${api.MCS_ORIGIN}/blueprints/${id}/${encodeURIComponent('城堡 /?')}`);
});

test('cursor overlap updates one card instead of duplicating it', () => {
  const old = api.normalizeLibraryPage({items: [summary]}, 'public').items;
  const incoming = api.normalizeLibraryPage({items: [{...summary, title: '新标题'}]}, 'public').items;
  const merged = api.mergeLibraryItems(old, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, '新标题');
});
