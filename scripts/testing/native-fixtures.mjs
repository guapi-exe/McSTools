// Small local files for real Tauri/WebView2 smoke tests. No application data,
// credentials, HTTP mocking or IPC replacements are used by this fixture.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import JSZip from 'jszip';

const out = resolve('output/playwright/native-integration');
await mkdir(out, {recursive: true});
const vertices = [-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1];
const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
const buffer = Buffer.alloc(vertices.length * 4 + indices.length * 2);
vertices.forEach((n,i) => buffer.writeFloatLE(n, i * 4));
indices.forEach((n,i) => buffer.writeUInt16LE(n, vertices.length * 4 + i * 2));
const gltf = {
  asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0}],
  buffers: [{uri: 'cube.bin', byteLength: buffer.length}],
  bufferViews: [{buffer: 0, byteOffset: 0, byteLength: vertices.length * 4}, {buffer: 0, byteOffset: vertices.length * 4, byteLength: indices.length * 2}],
  accessors: [{bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-1,-1,-1], max: [1,1,1]}, {bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR'}],
  materials: [{pbrMetallicRoughness: {baseColorFactor: [0.7,0.1,0.1,1], metallicFactor: 0, roughnessFactor: 1}}],
  meshes: [{primitives: [{attributes: {POSITION: 0}, indices: 1, material: 0}]}],
};
await writeFile(resolve(out, 'cube.gltf'), JSON.stringify(gltf), {flag: 'wx'});
await writeFile(resolve(out, 'cube.bin'), buffer, {flag: 'wx'});
const map = await readFile(resolve(out, 'native-map.litematic'));
const zip = new JSZip();
zip.file('first.litematic', map);
zip.file('folder/SECOND.litematic', map);
zip.file('invalid.litematic', Buffer.from('not an NBT file'));
zip.file('README.txt', 'This entry must be ignored.');
await writeFile(resolve(out, 'batch-input.zip'), await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}), {flag: 'wx'});
console.log('Created cube.gltf + cube.bin and batch-input.zip (2 valid blueprints, 1 invalid, 1 ignored text).');
