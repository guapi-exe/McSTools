import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/modules/toolbox/batch-queue.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {batchFileAllowed,batchViewport,validateBatchFile,batchFilePayload,runBatchQueue,BATCH_INPUT_LIMIT,BATCH_ARCHIVE_LIMIT}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const item=(id,status='queued')=>({id,name:`${id}.schem`,origin:'file',archiveName:null,size:10,status,error:null,outputName:null,outputBytes:0,sourceDataVersion:null,outputDataVersion:null,warnings:[]});
const options=()=>({format:2,subtype:6,targetDataVersion:null,includeAir:false,overrides:[]});

test('fixed-height virtual window is bounded after search, scrolling, hiding and restoring a 1000-row queue',()=>{
  for(const count of [0,1,4,9,1000])for(const scroll of [0,1,106,10000,106000,NaN,-1]){
    const view=batchViewport(count,scroll);
    assert.ok(view.first>=0&&view.last<=count&&view.last>=view.first);
    assert.ok(view.last-view.first<=9);
    assert.equal(view.paddingTop+(view.last-view.first)*106+view.paddingBottom,count*106);
    assert.equal(view.height,Math.min(count*106,530));
  }
  const restored=batchViewport(1000,8000);
  assert.deepEqual(restored,batchViewport(1000,8000));
  assert.ok(restored.first>0);assert.equal(batchViewport(1,8000).first,0);
  assert.equal(batchViewport(1000,106000).last,1000);
});

test('batch inputs reject unsupported, oversized and malformed metadata before reading',async()=>{
  for(const name of ['x.litematic','x.SCHEM','x.schematic','x.nbt','x.mcstructure','x.json','x.ZIP'])assert.ok(batchFileAllowed(name));
  for(const value of [{name:'x.exe',size:1},{name:'x.nbt',size:BATCH_INPUT_LIMIT+1},{name:'x.zip',size:BATCH_ARCHIVE_LIMIT+1},{name:'x.nbt',size:NaN},{name:'x.nbt',size:-1},{name:'x.nbt',size:.5},{name:'x.nbt',size:11}]){
    let read=false;
    await assert.rejects(batchFilePayload(1,{...value,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0)}},10,new AbortController().signal));
    assert.equal(read,false);
  }
  validateBatchFile({name:'x.zip',size:100},0); // Native archive expansion enforces the remaining uncompressed budget.
  let read=false;
  await assert.rejects(batchFilePayload(1,{name:'字'.repeat(400)+'.nbt',size:0,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0)}},10,new AbortController().signal),/文件名/);
  assert.equal(read,false);
});

test('raw IPC metadata and bytes are exact, and aborted or changed reads never get published',async()=>{
  const file=new File([Uint8Array.from([0,255,12,9])],'蓝图.schem');
  const data=await batchFilePayload(17,file,10,new AbortController().signal);
  assert.ok(data instanceof Uint8Array);
  const size=new DataView(data.buffer).getUint32(0,true);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(data.slice(4,4+size))),{protocol:1,batch_id:17,name:file.name});
  assert.deepEqual([...data.slice(4+size)],[0,255,12,9]);
  const canceled=new AbortController();canceled.abort();
  await assert.rejects(batchFilePayload(17,file,10,canceled.signal));
  const mid=new AbortController();
  await assert.rejects(batchFilePayload(17,{name:'a.nbt',size:1,arrayBuffer:async()=>{mid.abort();return new ArrayBuffer(1)}},10,mid.signal));
  await assert.rejects(batchFilePayload(17,{name:'a.nbt',size:1,arrayBuffer:async()=>new ArrayBuffer(2)},10,new AbortController().signal),/大小不一致/);
});

test('serial queue captures input/options and isolates a failed item from later successes',async()=>{
  const initial=[item(1),item(2),item(3),item(4,'success')],config=options(),calls=[],updates=[];
  config.overrides=[{sourceId:'minecraft:a',replacementId:'minecraft:b'}];
  let live=0,max=0;
  await runBatchQueue(initial,config,new AbortController().signal,async(id,captured)=>{
    live++;max=Math.max(live,max);calls.push(id);
    assert.equal(captured.format,2);assert.equal(captured.overrides[0].replacementId,'minecraft:b');
    config.format=5;config.overrides[0].replacementId='minecraft:c';captured.overrides[0].replacementId='minecraft:d';
    initial.push(item(90));initial[2].name='mutated.nbt';
    await Promise.resolve();live--;
    if(id===2)throw new Error('broken source');
    return {...item(id),status:'success',outputName:`out${id}.litematic`,outputBytes:5};
  },value=>updates.push(value));
  assert.equal(max,1);assert.deepEqual(calls,[1,2,3]);
  assert.deepEqual(updates.map(row=>[row.id,row.status]),[[1,'processing'],[1,'success'],[2,'processing'],[2,'error'],[3,'processing'],[3,'success']]);
  assert.match(updates[3].error,/broken source/);assert.equal(updates[4].name,'3.schem');
});

test('retry processes only failed items; stop suppresses late success/error and subsequent work',async()=>{
  const calls=[];
  await runBatchQueue([item(1),item(2,'error'),item(3,'success')],options(),new AbortController().signal,async id=>{calls.push(id);return {...item(id),status:'success'}},()=>{},true);
  assert.deepEqual(calls,[2]);
  for(const rejects of [false,true]){
    const controller=new AbortController(),updates=[],called=[];
    await runBatchQueue([item(1),item(2)],options(),controller.signal,async id=>{
      called.push(id);controller.abort();await Promise.resolve();
      if(rejects)throw new Error('late error');return {...item(id),status:'success'};
    },value=>updates.push(value));
    assert.deepEqual(called,[1]);assert.deepEqual(updates.map(value=>value.status),['processing']);
  }
  const controller=new AbortController();controller.abort();
  await runBatchQueue([item(1)],options(),controller.signal,async()=>{assert.fail('pre-aborted queue must not start')},()=>assert.fail('no late UI publication'));
});
