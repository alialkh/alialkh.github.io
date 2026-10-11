import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplify, regionsFromCoco, anglesFromDicom } from './cath-lib.mjs';

test('simplify drops points on a straight line and keeps the corners', () => {
  const line = [[0, 0], [1, 0.1], [2, 0], [3, 0.05], [4, 0]];
  assert.deepEqual(simplify(line, 0.5), [[0, 0], [4, 0]]);
  const corner = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]];
  assert.deepEqual(simplify(corner, 0.5), [[0, 0], [10, 0], [10, 10]]);
});

const coco = () => ({
  images: [{ id: 7, file_name: '14.png', width: 512, height: 512 }, { id: 8, file_name: '15.png', width: 512, height: 512 }],
  categories: [{ id: 1, name: '1' }, { id: 10, name: '9a' }, { id: 24, name: '12b' }, { id: 26, name: 'stenosis' }, { id: 27, name: '99' }],
  annotations: [
    { image_id: 7, category_id: 10, segmentation: [[0, 0, 256, 0, 256, 256, 0, 256]] },
    { image_id: 7, category_id: 24, segmentation: [[512, 512, 512, 256, 256, 256]] },
    { image_id: 7, category_id: 26, segmentation: [[0, 0, 10, 0, 10, 10]] },
    { image_id: 7, category_id: 27, segmentation: [[0, 0, 10, 0, 10, 10]] },
    { image_id: 7, category_id: 1, segmentation: [[0, 0, 100, 0]] },
    { image_id: 8, category_id: 1, segmentation: [[0, 0, 10, 0, 10, 10]] },
  ],
});
const ids = new Set(['seg-1', 'seg-9a', 'seg-12b']);

test('regionsFromCoco maps names to segment ids and scales pixels to fractions of the image', () => {
  const { regions } = regionsFromCoco(coco(), '14.png', ids, 0);
  assert.deepEqual(regions[0], { segment: 'seg-9a', polygon: [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]] });
  assert.deepEqual(regions[1], { segment: 'seg-12b', polygon: [[1, 1], [1, 0.5], [0.5, 0.5]] });
});

test('a name the table lacks, and a polygon with fewer than three points, are dropped and reported', () => {
  const { regions, dropped } = regionsFromCoco(coco(), '14.png', ids, 0);
  assert.deepEqual(regions.map(r => r.segment), ['seg-9a', 'seg-12b']);
  assert.deepEqual(dropped, ['stenosis', '99', '1']);
});

test('only the named image is read, and an unknown image is an error', () => {
  assert.equal(regionsFromCoco(coco(), '15.png', ids).regions.length, 1);
  assert.throws(() => regionsFromCoco(coco(), '16.png', ids), /16\.png is not in the annotation file/);
});

test('coordinates outside the image are clamped to 0 and 1', () => {
  const c = coco();
  c.annotations = [{ image_id: 7, category_id: 1, segmentation: [[-5, 0, 520, 0, 520, 520]] }];
  const [r] = regionsFromCoco(c, '14.png', ids, 0).regions;
  assert.deepEqual(r.polygon, [[0, 0], [1, 0], [1, 1]]);
});

test('DICOM angles are LAO and cranial when positive, RAO and caudal when negative, and keep their decimals', () => {
  assert.deepEqual(anglesFromDicom('40.3,25.1'), { primary: { side: 'LAO', angle: 40.3 }, secondary: { direction: 'cranial', angle: 25.1 } });
  assert.deepEqual(anglesFromDicom('-2.7,-28.7'), { primary: { side: 'RAO', angle: 2.7 }, secondary: { direction: 'caudal', angle: 28.7 } });
  assert.deepEqual(anglesFromDicom(' -30 , 0 '), { primary: { side: 'RAO', angle: 30 }, secondary: { direction: 'none', angle: 0 } });
});

test('a primary angle of exactly zero is AP and a secondary of exactly zero has no tilt', () => {
  assert.deepEqual(anglesFromDicom('0,0'), { primary: { side: 'AP', angle: 0 }, secondary: { direction: 'none', angle: 0 } });
  assert.deepEqual(anglesFromDicom('0.0,-0.4').primary, { side: 'AP', angle: 0 });
  assert.equal(anglesFromDicom('0.1,0').primary.side, 'LAO', 'a small angle is still a side');
});

test('text that is not two numbers is an error', () => {
  for (const bad of ['', '40', '40,', ',25', '40,25,3', 'a,b', 'NaN,1', '40;25']) assert.throws(() => anglesFromDicom(bad), /expected "primary,secondary" as two numbers/, bad);
});
