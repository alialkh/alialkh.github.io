import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageText, locationText, spacingText, windowText, zoomText, valueText, creditShort, viewportTitle } from './annotate.js';

test('the image number counts from 1 out of the total', () => {
  assert.equal(imageText(86, 150), 'Im 87 / 150');
  assert.equal(imageText(0, 1), 'Im 1 / 1');
});

test('the location is millimetres from the first image, one decimal', () => {
  assert.equal(locationText(86, 1.5), 'Loc 129.0 mm');
  assert.equal(locationText(0, 5), 'Loc 0.0 mm');
  assert.equal(locationText(3, 0.625), 'Loc 1.9 mm');
});

test('the spacing drops trailing zeros and keeps two decimals', () => {
  assert.deepEqual([1.5, 5, 0.9766, 0.625, 10].map(spacingText), ['Sp 1.5 mm', 'Sp 5 mm', 'Sp 0.98 mm', 'Sp 0.63 mm', 'Sp 10 mm']);
});

test('window text rounds, and names the preset when there is one', () => {
  assert.equal(windowText({ center: 40.4, width: 79.6, name: 'Brain' }), 'WW 80 WL 40 · Brain');
  assert.equal(windowText({ center: -600, width: 1500, name: null }), 'WW 1500 WL -600');
});

test('zoom has one decimal', () => {
  assert.equal(zoomText(1), 'Zoom 1.0×');
  assert.equal(zoomText(2.449), 'Zoom 2.4×');
});

test('CT values read in HU and MR in intensity, with the structure name when given', () => {
  assert.equal(valueText('CT', -87), 'HU -87');
  assert.equal(valueText('MR', 412), 'Intensity 412');
  assert.equal(valueText('CT', 34, 'Liver'), 'HU 34 · Liver');
  assert.equal(valueText('CT', 34, ''), 'HU 34');
});

test('the short credit is the dataset short name and the license', () => {
  assert.equal(creditShort({ short: 'TotalSegmentator', author: 'Jakob Wasserthal, University Hospital Basel', license: 'CC BY 4.0' }), 'TotalSegmentator, CC BY 4.0');
  assert.equal(creditShort({ author: 'Medical Segmentation Decathlon (Simpson AL, Antonelli M), heart data', license: 'CC BY-SA 4.0' }), 'Medical Segmentation Decathlon, CC BY-SA 4.0');
  assert.equal(creditShort({ author: 'Jane Roe, University', license: 'CC0 1.0' }), 'Jane Roe, CC0 1.0');
});

test('the title bar says series and plane, then labels and a window preset when the viewport has them', () => {
  assert.equal(viewportTitle('CT angiogram', { plane: 'axial', win: null, labels: false }), 'CT angiogram · Axial');
  assert.equal(viewportTitle('CT angiogram', { plane: 'axial', win: null, labels: true }), 'CT angiogram · Axial · Labels');
  assert.equal(viewportTitle('Chest CT', { plane: 'coronal', win: { name: 'Mediastinum' }, labels: false }), 'Chest CT · Coronal · Mediastinum');
  assert.equal(viewportTitle('T1', { plane: 'sagittal', win: { center: 1, width: 2 }, labels: false }), 'T1 · Sagittal', 'a window set by hand adds nothing');
});
