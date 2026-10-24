import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const {outputText} = ts.transpileModule(readFileSync(new URL('../src/modules/editor_geometry.ts', import.meta.url), 'utf8'),
  {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext}});
const {validRegion, pickWorkPlane, hitRegionFace, rayAxisParameter, moveRegionFace} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const region = {min: [0, 0, 0], max: [9, 9, 9]};
test('inclusive selection bounds reject nonintegers, NaN, reversed and out-of-range coordinates', () => {
  assert.ok(validRegion(region, [10, 10, 10]));
  for (const x of [-1, .5, NaN, Infinity, 10]) assert.equal(validRegion({min: [x, 0, 0], max: [9, 9, 9]}, [10, 10, 10]), false);
  assert.equal(validRegion({min: [4, 0, 0], max: [3, 0, 0]}, [10, 10, 10]), false);
});
test('work plane supports selecting empty space, but not behind the camera or outside the structure', () => {
  const ray = {rayOrigin: [3.4, 20, 6.8], rayDir: [0, -1, 0]};
  assert.deepEqual(pickWorkPlane(ray, {axis: 1, coordinate: 2}, [10, 10, 10]), [3, 2, 6]);
  assert.equal(pickWorkPlane(ray, {axis: 0, coordinate: 2}, [10, 10, 10]), null);
  assert.equal(pickWorkPlane({...ray, rayDir: [0, 1, 0]}, {axis: 1, coordinate: 2}, [10, 10, 10]), null);
  assert.equal(pickWorkPlane(ray, {axis: 1, coordinate: 10}, [10, 10, 10]), null);
});
test('face picking uses the nearest visible inclusive cuboid surface', () => {
  assert.deepEqual(hitRegionFace({rayOrigin: [20, 5, 5], rayDir: [-1, 0, 0]}, region), {axis: 0, edge: 'max', center: [10, 5, 5]});
  assert.equal(hitRegionFace({rayOrigin: [20, 15, 5], rayDir: [-1, 0, 0]}, region), null);
  assert.equal(hitRegionFace({rayOrigin: [20, 5, 5], rayDir: [1, 0, 0]}, region), null);
});
test('face dragging is bounded, immutable and rejects ambiguous parallel views', () => {
  const face = {axis: 0, edge: 'min', center: [0, 5, 5]};
  assert.deepEqual(moveRegionFace(region, face, 30, [10, 10, 10]).min, [9, 0, 0]);
  assert.deepEqual(region.min, [0, 0, 0]);
  assert.equal(rayAxisParameter({rayOrigin: [20, 5, 5], rayDir: [-1, 0, 0]}, face.center, 0), null);
  assert.equal(rayAxisParameter({rayOrigin: [3, 20, 5], rayDir: [0, -2, 0]}, face.center, 0), 3);
});
