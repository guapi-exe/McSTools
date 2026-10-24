// Browser-only native-command substitute. No credentials or real database.
// Install after desktop-ui-fixture.js and editor-ui-fixture.js.
(() => {
  const fixture = window.__SOURCE_CONNECTION_FIXTURE__ = {loads: 0, saves: [], mode: 'normal', restoreDelay: 0};
  const base = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'get_schematic_requirements') return '{}';
    if (command === 'get_unique_block') return '{}';
    if (command === 'restore_mcs_connection') {
      if (fixture.restoreDelay) await new Promise(resolve => setTimeout(resolve, fixture.restoreDelay));
      const connected = sessionStorage.getItem('__test_only_connection_flag') === 'yes';
      window.__MCS_FIXTURE__.connected = connected;
      return {connected, persisted: connected};
    }
    if (command === 'set_mcs_api_key') {
      if (args.key === 'mcs_live_fake_invalid') throw {code: 'AUTH_REQUIRED', message: '测试密钥失效'};
      const connected = !!args.key;
      // Store only a test boolean, never the password typed into the app.
      sessionStorage.setItem('__test_only_connection_flag', connected ? 'yes' : 'no');
      window.__MCS_FIXTURE__.connected = connected;
      return {connected, persisted: connected, blueprintCount: connected ? 240 : null};
    }
    if (command === 'mcs_api_get' && args.authenticated && fixture.mode === 'offline') throw {code: 'NETWORK', message: '测试：站点暂不可用'};
    if (command === 'mcs_api_get' && args.authenticated && fixture.mode === 'invalid') throw {code: 'AUTH_REQUIRED', message: '测试：密钥已撤销'};
    if (command === 'get_schematic_str') {
      fixture.loads++;
      // Same volume as the user's screenshot; typed array is intentionally huge.
      return `{Schematic:{Width:82s,Height:72s,Length:70s,Metadata:{Software:"Source performance fixture",Date:9223372036854775807l,Extra:{}},Entities:[{},{},{Data:{}}],Blocks:{Palette:{"minecraft:stone":0},Data:[B;${'1b,'.repeat(413279)}1b]}}}`;
    }
    if (command === 'save_snbt') { fixture.saves.push(args); return; }
    return base(command, args);
  };
})();
