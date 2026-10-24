// Explicit browser-only fixture. Loaded by Playwright addInitScript, never by
// application code. No real accounts, keys, local files or imports are used.
(() => {
  const fixture = window.__MCS_FIXTURE__ = {requests: [], imports: [], unknown: [], connected: false, mode: 'normal', live: false};
  const uuid = index => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
  const item = (index, prefix = '回归测试蓝图') => ({
    id: uuid(index), slug: `fixture-${index}`, title: `${prefix} ${index}`, description: '仅用于界面回归：预览、分页、筛选和版本选择。',
    author: {id: uuid(9999), displayName: '测试作者'}, featured: index % 7 === 0,
    currentVersion: {number: 3, sourceFormat: index % 2 ? 'litematica' : 'bedrock_edition'},
    engagement: {downloadCount: index}, category: {name: '建筑'}, updatedAt: '2026-10-18T00:00:00Z',
  });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let callbacks = 0;
  const settings = new Map(Object.entries({locale: 'zh-CN', selectedTheme: 'blue', autoUpdate: false, opacity: 1}));
  window.__TAURI_INTERNALS__ = {
    metadata: {currentWindow: {label: 'main'}, currentWebview: {label: 'main'}},
    transformCallback(callback) { const id = ++callbacks; window[`_${id}`] = callback; return id; },
    convertFileSrc: path => `/src-tauri/${String(path).replaceAll('\\', '/').replace(/^.*?data\//, 'data/')}`,
    async invoke(command, args = {}) {
      if (command === 'mcs_api_get') {
        fixture.requests.push(JSON.parse(JSON.stringify(args)));
        const {path, query, authenticated} = args;
        if (fixture.live && !authenticated) return window.__mcsLiveGet(path, query);
        if (authenticated && !fixture.connected) throw {code: 'AUTH_REQUIRED', message: '请连接 API Key'};
        if (path.endsWith('/categories')) return {items: [{id: uuid(1000), slug: 'building', name: '建筑'}]};
        if (fixture.mode === 'rate') throw {code: 'RATE_LIMITED', message: '请求过于频繁', retryAfterSeconds: 1};
        if (query.q === 'slow') await delay(900);
        else await delay(60);
        if (path.endsWith('/versions')) return {items: [3, 2, 1].map(number => ({number, sourceFormat: number === 2 ? 'mcedit' : 'litematica', createdAt: '2026-10-18T00:00:00Z'}))};
        if (/\/versions\/\d+$/.test(path)) {
          const number = Number(path.split('/').at(-1));
          return {number, sourceFormat: number === 2 ? 'mcedit' : 'litematica', originalFilename: number === 2 ? '旧版本.schematic' : '最新版.litematic', originalSourceByteSize: 4096, createdAt: '2026-10-18T00:00:00Z', trustedAnalysis: {dimensions: {x: 16, y: 20, z: 16}, visibleBlockCount: 1000, paletteSize: 12}, changelog: `版本 ${number} 更新记录`};
        }
        if (path.endsWith('/favourites')) return {items: [{blueprintId: uuid(41), title: null, slug: null, favouritedAt: '2026-10-18T00:00:00Z'}]};
        const start = Number(query.cursor || 0);
        return {items: Array.from({length: 24}, (_, i) => item(start + i + 1, query.q || (authenticated ? '个人蓝图' : '回归测试蓝图'))), totalCount: 240, nextCursor: start < 216 ? String(start + 24) : undefined, totalPages: 10};
      }
      if (command === 'set_mcs_api_key') { fixture.connected = !!args.key; return; }
      if (command === 'import_mcs_blueprint') { fixture.imports.push(args); await delay(100); return {filename: '测试蓝图.schematic', bytes: 4096}; }
      if (command === 'mcs_api_preview') throw new Error('Fixture has no private thumbnails');
      if (command === 'get_map_arts') return (await fetch('/__fixture/map-art')).json();
      if (command === 'get_user_data') return {id: 1, nickname: '界面测试', schematics: 0, classification: '', cloud: 0};
      if (command === 'get_user_classification') return '';
      if (command === 'get_schematics') return {data: [], page: 1, page_size: 20, total: 0};
      if (command === 'count_schematics') return 0;
      if (['get_je_blocks', 'get_schematics', 'get_distinct_game_versions', 'get_logs', 'get_history', 'get_schematic_game_versions'].includes(command)) return [];
      if (command === 'get_config') return {};
      if (command === 'close_splashscreen') return;
      if (command === 'plugin:store|load') return 1;
      if (command === 'plugin:store|get') return [settings.get(args.key), settings.has(args.key)];
      if (command === 'plugin:store|set') { settings.set(args.key, args.value); return; }
      if (command === 'plugin:store|save') return;
      if (command === 'plugin:event|listen') return ++callbacks;
      if (command === 'plugin:event|unlisten') return;
      if (command === 'plugin:app|version' || command === 'plugin:app|name') return '1.3.0';
      if (command === 'plugin:window|is_dark_mode') return false;
      fixture.unknown.push(command);
      return null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}};
})();
