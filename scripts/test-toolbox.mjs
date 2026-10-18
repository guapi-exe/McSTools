import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const urls = new Map();
function moduleUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const source = readFileSync(new URL(`../src/modules/toolbox/${name}.ts`, import.meta.url), 'utf8');
  let {outputText} = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext}});
  outputText = outputText.replace(/from ['"]\.\/([\w-]+)(?:\.ts)?['"]/g, (_, file) => `from '${moduleUrl(file)}'`);
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  urls.set(name, url); return url;
}
const {generateMapArt, fitAspect} = await import(moduleUrl('map-art'));
const {generatedPayload} = await import(moduleUrl('generated-payload'));
const settings = {match:'oklab',brightness:1,contrast:1,saturation:1,gamma:1,dither:'none',adaptive:0,relief:false,maxHeight:2,axis:'y',alphaThreshold:127,backing:false,support:false,supportBlock:'minecraft:scaffolding'};
const block = (id, color=100) => ({id:'minecraft:'+id,label:id,group:'test',color:[color,color,color],normal:[100,100,100],low:[20,20,20],high:[200,200,200]});
const input = (values, extra={}) => ({width:2,height:values.length/2,rgba:Uint8ClampedArray.from(values.flatMap(v=>[v,v,v,255])),palette:[block('stone')],settings:{...settings,...extra}});
test('aspect fit obeys both pixel and edge budgets', () => {
  for (const [w,h] of [[10000,10000],[1,10000],[10000,1],[213,157]]) {
    const fitted=fitAspect(w,h,w,'width');
    assert.ok(fitted.width<=2048 && fitted.height<=2048 && fitted.width*fitted.height<=1024*1024);
  }
  assert.throws(()=>fitAspect(NaN,5,10,'width'));
  for(let w=1050;w<4096;w+=37) for(let h=500;h<4096;h+=43) {
    const fitted=fitAspect(w,h,w,'width'); assert.ok(fitted.width*fitted.height<=1024*1024);
  }
});
test('one palette-index result drives preview and dense YZX structure on all axes', () => {
  for (const axis of ['x','y','z']) {
    const source=input([30,80,130,180], {axis}); source.palette=[block('black_wool',0),block('white_wool',255)];
    const out=generateMapArt(source), [sx,sy,sz]=out.structure.size;
    assert.equal(out.structure.blockCount,4);
    for(let y=0;y<2;y++) for(let x=0;x<2;x++) {
      const pos=axis==='x'?[0,1-y,x]:axis==='z'?[x,1-y,0]:[x,0,y];
      const index=out.structure.blocks[(pos[1]*sz+pos[2])*sx+pos[0]];
      assert.equal(index,out.indices[y*2+x]);
      assert.equal(out.image[(y*2+x)*4],out.structure.colors[index][0]);
    }
    assert.equal(sx*sy*sz,4);
  }
});
test('height-boundary matching selects a realizable central shade, not a clipped high shade', () => {
  const source=input([200,200,200,200],{relief:true,maxHeight:1});
  const out=generateMapArt(source);
  assert.deepEqual(out.structure.size,[2,1,2]);
  assert.equal(out.image[0],100);
  assert.deepEqual([...out.structure.blocks],[1,1,1,1]);
});
test('scaffolding fills existing relief volume without an extra empty height span', () => {
  const out=generateMapArt(input([100,100,200,200],{relief:true,backing:true,support:true}));
  assert.deepEqual(out.structure.size,[2,3,2]);
  assert.equal(out.structure.counts['minecraft:stone'],4);
  assert.equal(out.structure.counts['minecraft:scaffolding'],6);
  assert.equal(out.structure.blockCount,10);
  for(let p=0;p<4;p++) assert.equal(out.structure.palette[out.structure.blocks[p]],'minecraft:scaffolding');
});
test('transparent pixels remain air through dithering and supports; fully transparent source errors', () => {
  for(const dither of ['none','floyd','atkinson','ordered']) {
    const source=input([100,100,200,200],{dither,relief:true,backing:true,support:true}); source.rgba[3]=0;
    const out=generateMapArt(source); assert.equal(out.indices[0],0); assert.equal(out.image[3],0);
    for(let y=0;y<out.structure.size[1];y++) assert.equal(out.structure.blocks[y*4],0);
    for(let i=3;i<source.rgba.length;i+=4) source.rgba[i]=0;
    assert.throws(()=>generateMapArt(source),/透明/);
  }
});
test('palette order and repeated runs do not change ties', () => {
  const source=input([100,100,100,100],{relief:true,dither:'floyd'});
  source.palette=[block('white_wool'),block('stone')]; const a=generateMapArt(source);
  source.palette.reverse(); const b=generateMapArt(source);
  assert.deepEqual(a,b); assert.equal(a.structure.palette[a.indices[0]],'minecraft:stone');
});
test('invalid dimensions, settings and palette fail before creating an output', () => {
  for(const bad of [{width:0},{width:2049},{rgba:new Uint8ClampedArray(1)},{palette:[]},{palette:[block('stone'),block('stone')]}]) assert.throws(()=>generateMapArt({...input([0,0]),...bad}));
  for(const bad of [{maxHeight:0},{gamma:NaN},{axis:'q'},{adaptive:2}]) assert.throws(()=>generateMapArt(input([0,0],bad)));
});
test('binary staging is exact little-endian with bounded metadata and no JSON voxel list', () => {
  const structure=generateMapArt(input([100,100,200,200],{relief:true})).structure;
  const data=generatedPayload(structure,'测试蓝图'); const view=new DataView(data.buffer);
  const length=view.getUint32(0,true), meta=JSON.parse(new TextDecoder().decode(data.slice(4,4+length)));
  assert.deepEqual(meta,{protocol:1,name:'测试蓝图',size:structure.size,palette:structure.palette});
  assert.equal(data.length,4+length+structure.blocks.length*2);
  for(let i=0;i<structure.blocks.length;i++) assert.equal(view.getUint16(4+length+i*2,true),structure.blocks[i]);
  assert.throws(()=>generatedPayload({...structure,blocks:new Uint16Array(0)},'test'));
});
test('all bundled map-art choices exist in the authoritative generated source version', () => {
  const palette=JSON.parse(readFileSync(new URL('../src-tauri/data/blocks_art.json',import.meta.url),'utf8'));
  const registry=new Set(JSON.parse(readFileSync(new URL('../src-tauri/data/java_blocks_1.21.1.json',import.meta.url),'utf8')).map(b=>b.name));
  for(const group of Object.values(palette)) for(const id of Object.keys(group)) assert.ok(registry.has(id.replace(/^minecraft:/,'')),id);
});
