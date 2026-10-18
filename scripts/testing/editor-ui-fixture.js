// Browser-only UI contract fixture; the real native edit rules are covered by
// Rust tests. This must be installed after desktop-ui-fixture.js.
(() => {
  const blocks = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 10; z++) {
    blocks.push(x, 0, z, 0);
    if (x === 0 || x === 11 || z === 0 || z === 9) for (let y = 1; y < 5; y++) blocks.push(x, y, z, 1);
  }
  const original = {size: {width: 12, height: 5, length: 10}, blocks,
    palette: [{id: 'minecraft:stone', properties: {}}, {id: 'minecraft:oak_planks', properties: {}}], materials: [], tile_entities_list: {elements: []}};
  const recount = data => {
    const counts = new Map();
    for (let i = 3; i < data.blocks.length; i += 4) { const id = data.palette[data.blocks[i]].id; counts.set(id, (counts.get(id) ?? 0) + 1); }
    data.materials = Array.from(counts, ([id, count]) => ({id, count}));
    return data;
  };
  recount(original);
  const fixture = window.__EDITOR_FIXTURE__ = {commands: [], current: structuredClone(original), history: [], pending: null,
    revision: 0, modified: false, failNextStage: false, failNextCommit: false, stageDelay: 0,
    exports: [], sourceDataVersion: 3578, failNextSave: false, cancelNextSave: false, exportPlanDelay: 0,
    source: {id: 42, name: '编辑回归夹具', description: '隔离测试，无真实文件', sizes: '12,5,10', schematic_type: 2, sub_type: -1,
      version: 0, game_version: '1.20.1', lm_version: 6, user: '', schematic_tags: '', classification: '', created_at: '', updated_at: '', version_list: ''}};
  const info = () => ({session_id: 1, source_id: 42, revision: fixture.revision, game_version: '1.20.1',
    source_data_version: fixture.sourceDataVersion, source_name: fixture.source.name, source_format: 2, source_subtype: 6,
    size: fixture.current.size, undo_steps: fixture.history.length, modified: fixture.modified});
  const originalInvoke = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command.includes('blueprint_edit') || command.includes('blueprint_export')) fixture.commands.push({command, args});
    if (command === 'get_blueprint_export_formats') {
      const modern = [{id: 1343, name: '1.12.2'}, {id: 3465, name: '1.20.1'}, {id: 4671, name: '1.21.11'}];
      return [
        {id: 2, name: 'Litematica', extension: 'litematic', subtypes: [{id: 6, name: 'v6', versions: modern}, {id: 7, name: 'v7', versions: modern}]},
        {id: 3, name: 'WorldEdit', extension: 'schem', subtypes: [{id: 0, name: 'Sponge v2', versions: modern}, {id: 1, name: 'Sponge v3', versions: modern}]},
        {id: 6, name: 'MCEdit', extension: 'schematic', subtypes: [{id: -1, name: 'MCEdit / Alpha', versions: [{id: 5, name: '1.7.10'}, {id: 1343, name: '1.12.2'}]}]},
        {id: 1, name: 'Create / Vanilla', extension: 'nbt', subtypes: [{id: -1, name: 'Java Structure', versions: modern}]},
        {id: 5, name: 'Bedrock', extension: 'mcstructure', subtypes: [{id: -1, name: 'BE Structure', versions: []}]},
      ];
    }
    if (command === 'plan_blueprint_export') {
      if (fixture.exportPlanDelay) await new Promise(resolve => setTimeout(resolve, fixture.exportPlanDelay));
      const o = args.options;
      if (o.format === 6 && !o.targetDataVersion) throw 'MCEdit requires an explicit Minecraft 1.7.10–1.12.2 target for a modern source';
      if (![4, 5].includes(o.format) && !o.targetDataVersion && fixture.sourceDataVersion === null) throw 'source DataVersion is unknown; select a target Java version';
      let size = fixture.current.size;
      if (args.source.scope === 'inside') {
        const d = args.source.region.max.map((n, a) => n - args.source.region.min[a] + 1);
        size = {width: d[0], height: d[1], length: d[2]};
      }
      const changes = o.targetDataVersion === 5 ? [{sourceId: 'minecraft:oak_planks', replacementId: 'minecraft:stone',
        count: 160, idChanged: true, propertiesChanged: false, error: null}] : [];
      return {sourceDataVersion: fixture.sourceDataVersion, outputDataVersion: o.format === 5 ? null : o.targetDataVersion ?? fixture.sourceDataVersion,
        size, warnings: [], compatibility: o.targetDataVersion ? {target: {name: o.targetDataVersion === 5 ? '1.7.10' : '1.20.1', id: o.targetDataVersion},
          changes, targetBlocks: ['minecraft:stone', 'minecraft:gold_block'], moddedBlockCount: 0} : null};
    }
    if (command === 'save_blueprint_export') {
      fixture.exports.push(structuredClone(args));
      if (fixture.failNextSave) { fixture.failNextSave = false; throw 'copy destination already exists; select a new filename'; }
      if (fixture.cancelNextSave) { fixture.cancelNextSave = false; return {canceled: true, filename: null, bytes: 0, destination: args.destination}; }
      return {canceled: false, filename: 'fixture_copy.' + ({2: 'litematic', 3: 'schem', 6: 'schematic', 1: 'nbt', 5: 'mcstructure'}[args.options.format]),
        bytes: 1234, destination: args.destination};
    }
    if (command === 'plugin:path|resolve_directory') return '/src-tauri/' + (args.path || '');
    if (command === 'plugin:path|join') return args.paths.join('/');
    if (command === 'plugin:fs|read_dir') return [{name: 'minecraft', isDirectory: true, isFile: false, isSymlink: false}];
    if (command === 'plugin:fs|read_file' || command === 'plugin:fs|read_text_file') return Array.from(new Uint8Array(await (await fetch(args.path)).arrayBuffer()));
    if (command === 'get_schematic') return fixture.source;
    if (command === 'get_schematic_preview_data') return structuredClone(original);
    if (command === 'get_je_blocks') return [{block_id: 'minecraft:stone', zh_cn: '石头'}, {block_id: 'minecraft:oak_planks', zh_cn: '橡木木板'}, {block_id: 'minecraft:gold_block', zh_cn: '金块'}];
    if (command === 'open_blueprint_editor') return {info: info(), preview: fixture.current, candidate_id: null};
    if (command === 'stage_blueprint_edit') {
      if (fixture.stageDelay) await new Promise(resolve => setTimeout(resolve, fixture.stageDelay));
      if (fixture.failNextStage) { fixture.failNextStage = false; throw 'selected region contains no matching blocks'; }
      const {action} = args;
      let next = structuredClone(fixture.current);
      if (action.action === 'undo') next = structuredClone(fixture.history.at(-1));
      else if (action.action === 'reset') next = structuredClone(original);
      else {
        const op = action.operation;
        const inside = p => !op.region || p.every((n, a) => n >= op.region.min[a] && n <= op.region.max[a]);
        if (op.kind === 'replace') {
          next.palette.push({id: op.replacement_id, properties: {}});
          for (let i = 0; i < next.blocks.length; i += 4) if (inside(next.blocks.slice(i, i + 3)) && next.palette[next.blocks[i + 3]].id === op.original_id) next.blocks[i + 3] = next.palette.length - 1;
        } else {
          const kept = [];
          for (let i = 0; i < next.blocks.length; i += 4) if (inside(next.blocks.slice(i, i + 3)) === (op.kind === 'crop')) {
            kept.push(...next.blocks.slice(i, i + 3).map((n, a) => n - (op.kind === 'crop' ? op.region.min[a] : 0)), next.blocks[i + 3]);
          }
          if (!kept.length) throw 'selected crop has no visible blocks';
          next.blocks = kept;
          if (op.kind === 'crop') { const d = op.region.max.map((n, a) => n - op.region.min[a] + 1); next.size = {width: d[0], height: d[1], length: d[2]}; }
        }
      }
      recount(next);
      fixture.pending = {action, next};
      return {info: info(), candidate_id: fixture.revision + 2, preview: next};
    }
    if (command === 'commit_blueprint_edit') {
      if (fixture.failNextCommit) { fixture.failNextCommit = false; throw 'fixture commit failed'; }
      const pending = fixture.pending;
      if (args.revision !== fixture.revision || !pending) throw 'stale editor revision';
      if (pending.action.action === 'edit') { fixture.history.push(fixture.current); fixture.history = fixture.history.slice(-3); }
      else if (pending.action.action === 'undo') fixture.history.pop();
      else fixture.history = [];
      fixture.current = pending.next; fixture.modified = pending.action.action !== 'reset'; fixture.pending = null; fixture.revision++;
      return info();
    }
    if (command === 'cancel_blueprint_edit') { fixture.pending = null; return; }
    if (command === 'close_blueprint_editor') { fixture.pending = null; return; }
    return originalInvoke(command, args);
  };
})();
