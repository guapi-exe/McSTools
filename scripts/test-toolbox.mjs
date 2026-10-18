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
const {voxelizeModel} = await import(moduleUrl('voxelize'));
const {buildVoxelSurface} = await import(moduleUrl('voxel-surface'));
const {validateModelFiles, checkMeshText, checkStl, checkGltf, modelPath, abortable} = await import(moduleUrl('model-input'));
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

const voxelSettings = {match:'oklab',brightness:1,contrast:1,saturation:1,gamma:1,resolution:8,solid:false,useColors:false,blockId:'minecraft:stone',rotateX:0,rotateY:0,rotateZ:0};
const mesh = vertices => ({positions:Float32Array.from(vertices.flat(Infinity)), colors:new Uint8Array(vertices.flat(Infinity).length).fill(255)});
function cube(open=false, dimensions=[1,1,1]) {
  const vertices=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(p=>p.map((n,i)=>n*dimensions[i]));
  const faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]];
  return mesh(faces.slice(open?1:0).flatMap(f=>[f[0],f[1],f[2],f[0],f[2],f[3]].map(i=>vertices[i])));
}
test('voxel shell and enclosed fill use exact dense YZX positions, fixed mode works with no palette', () => {
  const shell=voxelizeModel(cube(),voxelSettings,[]), filled=voxelizeModel(cube(),{...voxelSettings,solid:true},[]);
  assert.deepEqual(shell.size,[8,8,8]); assert.equal(shell.blockCount,512-216);
  assert.equal(filled.blockCount,512); assert.equal(filled.counts['minecraft:stone'],512);
  assert.equal(shell.blocks[(3*8+3)*8+3],0); assert.equal(filled.blocks[(3*8+3)*8+3],1);
  const open=voxelizeModel(cube(true),{...voxelSettings,solid:true},[]);
  assert.equal(open.blocks[(3*8+3)*8+3],0,'open model must not be box-filled');
});
test('three-axis rotation is X then Y then Z and keeps proportional dimensions', () => {
  const source=cube(false,[3,2,1]);
  assert.deepEqual(voxelizeModel(source,voxelSettings,[]).size,[8,6,3]);
  const rotated=voxelizeModel(source,{...voxelSettings,rotateX:90,rotateY:90,rotateZ:90},[]);
  assert.deepEqual(rotated.size,[3,6,8]);
  const transformed=mesh(Array.from({length:source.positions.length/3},(_,i)=>{
    const [x,y,z]=source.positions.slice(i*3,i*3+3);return [z,y,-x];
  }));
  assert.deepEqual([...rotated.blocks],[...voxelizeModel(transformed,voxelSettings,[]).blocks]);
});
test('model texture sampling respects repeat/mirror/clamp and flipY, uses stable material matching', () => {
  const source=mesh([[0,0,0],[1,0,0],[0,1,0]]);
  const palette=[['red_wool',[255,0,0]],['lime_wool',[0,255,0]],['blue_wool',[0,0,255]],['white_wool',[255,255,255]]].map(([id,color])=>({...block(id),color}));
  const sample=(u,v,wrapS,flipY)=>{
    const model={...source,uvs:Float32Array.from([u,v,u,v,u,v]),textureIndices:Int16Array.of(0),textures:[{width:2,height:2,wrapS,wrapT:1001,flipY,rgba:Uint8ClampedArray.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])}]};
    return Object.keys(voxelizeModel(model,{...voxelSettings,useColors:true},palette).counts);
  };
  assert.deepEqual(sample(.25,.25,1001,false),['minecraft:red_wool']);
  assert.deepEqual(sample(.25,.25,1001,true),['minecraft:blue_wool']);
  assert.deepEqual(sample(1.25,.25,1000,false),['minecraft:red_wool']);
  assert.deepEqual(sample(1.25,.25,1002,false),['minecraft:lime_wool']);
  assert.deepEqual(sample(1.25,.25,1001,false),['minecraft:lime_wool']);
});
test('invalid model, settings, UVs and textures fail explicitly', () => {
  const source=cube();
  for (const extra of [{resolution:0},{resolution:129},{gamma:0},{rotateX:NaN},{blockId:'minecraft:air'},{match:'unknown'}]) assert.throws(()=>voxelizeModel(source,{...voxelSettings,...extra},[]));
  for (const extra of [{positions:Float32Array.of(NaN)},{uvs:Float32Array.of(0)},{textureIndices:new Int16Array(12)},{textures:[{width:1025,height:1,rgba:new Uint8ClampedArray(4100)}]}]) assert.throws(()=>voxelizeModel({...source,...extra},voxelSettings,[]));
  assert.throws(()=>voxelizeModel(source,{...voxelSettings,useColors:true},[]));
});
test('fill color does not add a candidate to surface color matching', () => {
  const generated=voxelizeModel(cube(),{...voxelSettings,useColors:true,solid:true,blockId:'minecraft:gold_block',fillColor:[255,220,0]},[block('stone',100)]);
  const fill=generated.palette.indexOf('minecraft:gold_block');
  assert.deepEqual(generated.colors[fill],[255,220,0]);assert.equal(generated.counts['minecraft:gold_block'],216);
  assert.equal(generated.counts['minecraft:stone'],296);
});
test('oversubscribed model sampling is rejected before processing any triangle', () => {
  const original=cube(), positions=new Float32Array(original.positions.length*100);
  for(let i=0;i<100;i++)positions.set(original.positions,i*original.positions.length);
  let callbacks=0;
  assert.throws(()=>voxelizeModel({positions,colors:new Uint8Array(positions.length).fill(255)},{...voxelSettings,resolution:128},[],()=>callbacks++),/采样量过大/);
  assert.equal(callbacks,0);
});
test('surface builder culls shared faces, preserves winding/linear colors, never truncates output', () => {
  const structure={size:[2,1,1],palette:['minecraft:air','minecraft:stone'],colors:[[0,0,0],[128,128,128]],blocks:Uint16Array.of(1,1),blockCount:2,counts:{'minecraft:stone':2}};
  const out=buildVoxelSurface(structure); assert.equal(out.faces,10); assert.equal(out.positions.length,180);
  assert.ok(Math.abs(out.colors[0]-.21586)<.00001);
  for(let i=0;i<out.positions.length;i+=9) {
    const p=out.positions.slice(i,i+9), a=[p[3]-p[0],p[4]-p[1],p[5]-p[2]], b=[p[6]-p[0],p[7]-p[1],p[8]-p[2]];
    const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    assert.ok(cross.reduce((n,c,j)=>n+c*out.normals[i+j],0)>0);
  }
  assert.throws(()=>buildVoxelSurface(structure,9),/完整生成结果仍可导出/);
  assert.deepEqual([...structure.blocks],[1,1]); assert.equal(structure.blockCount,2);
  assert.throws(()=>buildVoxelSurface({...structure,blocks:Uint16Array.of(1,2)}));
});
test('model input preflight rejects oversized expanded meshes, malformed headers and node cycles', () => {
  validateModelFiles([{name:'test.gltf',size:10},{name:'buffer.bin',size:20}]);
  for(const files of [[],[{name:'a.obj',size:33*1024*1024}],[{name:'a.obj',size:10},{name:'b.stl',size:20}],[{name:'a.glb',size:-1}]]) assert.throws(()=>validateModelFiles(files));
  assert.equal(modelPath('./texture%20one.png',true),'texture one.png'); assert.equal(modelPath('100%real.png'),'100%real.png'); assert.throws(()=>modelPath('%zz',true));
  checkMeshText('v 0 0 0\nf 1 2 3 4 # quad','obj');
  assert.throws(()=>checkMeshText('f 1 2 3\n'.repeat(200001),'obj'),/20 万/);
  const binary=new ArrayBuffer(134);new DataView(binary).setUint32(80,1,true);checkStl(binary);
  assert.throws(()=>checkStl(new ArrayBuffer(30)));
  const gltf=value=>new TextEncoder().encode(JSON.stringify(value)).buffer;
  checkGltf(gltf({asset:{version:'2.0'}}));
  for(const bad of [{asset:{version:'1.0'}},{asset:{version:'2.0'},accessors:[{type:'VEC3',count:1e9}]},{asset:{version:'2.0'},nodes:[{children:[0]}]},{asset:{version:'2.0'},buffers:[{byteLength:1e9}]}]) assert.throws(()=>checkGltf(gltf(bad)));
});
test('abortable model reads reject on cancellation without consuming late results', async () => {
  const controller=new AbortController();let complete;
  const read=abortable(new Promise(resolve=>{complete=resolve}),controller.signal);controller.abort();
  await assert.rejects(read,{name:'AbortError'});complete('late');
  assert.equal(await abortable(Promise.resolve('ok'),new AbortController().signal),'ok');
});
