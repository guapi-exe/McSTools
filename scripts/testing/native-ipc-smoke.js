// Pass this async function to Playwright CLI eval in the isolated native app.
// This calls the REAL bridge. It creates test library entries only after
// checking the exact integration identifier; never use it in a normal build.
async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  assert(await invoke('plugin:app|identifier') === 'mcSchematic.native-integration-20261018', 'Refusing to write a non-test library');
  const options = {format: 2, subtype: 6, targetDataVersion: null, includeAir: false, overrides: []};
  const name = `native-ipc-${Date.now()}`;
  const metadata = new TextEncoder().encode(JSON.stringify({protocol: 1, name, size: [2, 2, 2], palette: ['minecraft:air', 'minecraft:stone']}));
  const payload = new Uint8Array(4 + metadata.length + 16);
  const view = new DataView(payload.buffer);
  view.setUint32(0, metadata.length, true); payload.set(metadata, 4);
  for (let i = 0; i < 8; i++) view.setUint16(4 + metadata.length + i * 2, 1, true);
  let generation, info;
  const report = window.__NATIVE_IPC_SMOKE__ = {name, checks: []};
  try {
    generation = await invoke('stage_generated_blueprint', payload);
    const source = {kind: 'generated', generation_id: generation};
    const plan = await invoke('plan_blueprint_export', {source, options});
    assert(plan.sourceDataVersion === 3955 && plan.size.width === 2, 'binary snapshot mismatch');
    report.checks.push('raw binary staging / exact 3955 source');
    report.generated = await invoke('save_blueprint_export', {source, options, destination: 'library'});
    const list = await invoke('get_schematics', {filter: name, classificationFilter: '', page: 1, pageSize: 10, sortBy: null, sortOrder: null, schematicType: null, gameVersion: null});
    assert(list.data.length === 1, 'generated library entry missing or duplicated');
    report.sourceId = list.data[0].id;
    const original = await invoke('get_schematic_preview_data', {id: report.sourceId});
    assert(original.materials.some(m => m.id === 'minecraft:stone' && m.count === 8), 'generated blocks differ from input');
    report.checks.push('generated -> atomic file / SQLite library import');
    info = (await invoke('open_blueprint_editor', {id: report.sourceId})).info;
    const stage = action => invoke('stage_blueprint_edit', {sessionId: info.session_id, revision: info.revision, action});
    const commit = async candidate => {info = await invoke('commit_blueprint_edit', {sessionId: info.session_id, revision: info.revision, candidateId: candidate.candidate_id});};
    const replacement = {action: 'edit', operation: {kind: 'replace', original_id: 'minecraft:stone', replacement_id: 'minecraft:dirt', region: null, preserve_properties: false}};
    const canceled = await stage(replacement);
    await invoke('cancel_blueprint_edit', {sessionId: info.session_id, candidateId: canceled.candidate_id});
    await commit(await stage(replacement));
    assert(info.undo_steps === 1 && info.modified, 'replacement history not committed');
    await commit(await stage({action: 'edit', operation: {kind: 'crop', region: {min: [0,0,0], max: [0,1,1]}}}));
    assert(info.size.width === 1 && info.undo_steps === 2, 'crop was not committed');
    await commit(await stage({action: 'undo'}));
    assert(info.size.width === 2 && info.undo_steps === 1, 'undo failed');
    const beforeReset = info.revision;
    await commit(await stage({action: 'reset'}));
    assert(!info.modified && info.revision > beforeReset, 'reset failed');
    report.checks.push('editor stage / cancel / commit / crop / undo / reset');
    const editorSource = {kind: 'editor', session_id: info.session_id, revision: info.revision, scope: 'inside', region: {min: [0,0,0], max: [0,1,1]}};
    const legacy = {...options, format: 6, subtype: -1, targetDataVersion: 5};
    const legacyPlan = await invoke('plan_blueprint_export', {source: editorSource, options: legacy});
    assert(legacyPlan.outputDataVersion === 5 && legacyPlan.size.width === 1, 'legacy crop export plan mismatch');
    report.legacy = await invoke('save_blueprint_export', {source: editorSource, options: legacy, destination: 'library'});
    const unchanged = await invoke('get_schematic_preview_data', {id: report.sourceId});
    assert(JSON.stringify(unchanged) === JSON.stringify(original), 'editor changed the source library file');
    report.checks.push('selection -> 1.7.10 library copy; original unchanged');
    return report;
  } catch (error) {
    report.error = typeof error === 'string' ? error : error.message ?? error;
    return report;
  } finally {
    if (info) await invoke('close_blueprint_editor', {sessionId: info.session_id});
    if (generation !== undefined) await invoke('release_generated_blueprint', {generationId: generation});
  }
}
