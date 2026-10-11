import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entryAngle, describeAngle, matchProjection, segmentRoles, isLateral, angleDistance, caseSystem, TOLERANCE } from './views.js';

const projections = JSON.parse(readFileSync(new URL('./content/projections.json', import.meta.url), 'utf8'));
const entry = id => projections.find(p => p.id === id);

test('RAO and caudal are negative, LAO and cranial positive, AP and no tilt are zero', () => {
  assert.deepEqual(entryAngle(entry('rao-caudal')), { rot: -30, tilt: -30 });
  assert.deepEqual(entryAngle(entry('lao-cranial')), { rot: 45, tilt: 20 });
  assert.deepEqual(entryAngle(entry('ap-caudal')), { rot: 0, tilt: -30 });
  assert.deepEqual(entryAngle(entry('rca-lateral')), { rot: 90, tilt: 0 });
});

test('describeAngle names side and tilt', () => {
  assert.equal(describeAngle({ rot: 40, tilt: 25 }), 'LAO 40, cranial 25');
  assert.equal(describeAngle({ rot: -30, tilt: 0 }), 'RAO 30');
  assert.equal(describeAngle({ rot: 0, tilt: -30 }), 'AP, caudal 30');
  assert.equal(describeAngle({ rot: 0, tilt: 0 }), 'AP');
});

test('every listed view is the match for its own typical angle in its own system', () => {
  for (const p of projections) {
    assert.equal(matchProjection(entryAngle(p), projections, p.system)?.entry.id, p.id, p.id);
  }
});

test('the same angle gives the left view or the right view by system', () => {
  const angle = { rot: 45, tilt: 20 };
  assert.equal(matchProjection(angle, projections, 'left').entry.id, 'lao-cranial');
  assert.equal(matchProjection(angle, projections, 'right').entry.id, 'rca-lao-cranial');
});

test('a source range around the typical angle still matches, and beyond the tolerance nothing does', () => {
  // Naber shows the left LAO cranial view at LAO 60 with 30 cranial.
  assert.equal(matchProjection({ rot: 60, tilt: 30 }, projections, 'left').entry.id, 'lao-cranial');
  assert.equal(matchProjection({ rot: 45 + TOLERANCE + 1, tilt: 20 }, projections, 'left'), null);
  assert.equal(matchProjection({ rot: 0, tilt: 0 }, projections, 'left'), null);
});

test('where two views are both in range the nearer one wins', () => {
  // rca-lao is at tilt 0 and rca-lao-cranial at tilt 20, so tilt 7 and 12 are in range of both.
  assert.equal(matchProjection({ rot: 45, tilt: 7 }, projections, 'right').entry.id, 'rca-lao');
  assert.equal(matchProjection({ rot: 45, tilt: 12 }, projections, 'right').entry.id, 'rca-lao-cranial');
  assert.equal(matchProjection({ rot: 45, tilt: 7 }, projections, 'right').distance, 7);
});

test('segment roles come from the table and nothing else', () => {
  const roles = segmentRoles(entry('lao-caudal'));
  assert.deepEqual(roles.get('seg-7'), ['foreshortened']);
  assert.deepEqual(roles.get('seg-5'), ['best']);
  assert.equal(roles.has('seg-8'), false);
  assert.deepEqual([...segmentRoles(entry('rao-cranial')).get('seg-11')], ['foreshortened', 'overlapped']);
  assert.equal(segmentRoles(null).size, 0);
  assert.equal(segmentRoles(entry('lateral-left')).size, 2);
});

test('only the two lateral views are marked as stored by convention', () => {
  assert.deepEqual(projections.filter(isLateral).map(p => p.id), ['lateral-left', 'rca-lateral']);
});

test('the distance between two angles is the larger of the two axis gaps', () => {
  assert.equal(angleDistance({ rot: 0, tilt: 0 }, { rot: 3, tilt: -4 }), 4);
  assert.equal(angleDistance({ rot: -30, tilt: 10 }, { rot: 30, tilt: 10 }), 60);
});

test('stated angles with decimals keep their decimals and keep their side', () => {
  const angles = { primary: { side: 'RAO', angle: 2.7 }, secondary: { direction: 'cranial', angle: 28.7 } };
  assert.deepEqual(entryAngle(angles), { rot: -2.7, tilt: 28.7 });
  assert.equal(describeAngle(entryAngle(angles)), 'RAO 2.7, cranial 28.7');
  assert.equal(matchProjection(entryAngle(angles), projections, 'left').entry.id, 'ap-cranial');
});

test('a case belongs to the system its named view or its outlines say', () => {
  const content = {
    projection: new Map(projections.map(p => [p.id, p])),
    segment: new Map([['seg-1', { artery: 'rca' }], ['seg-2', { artery: 'rca' }], ['seg-6', { artery: 'lad' }], ['seg-11', { artery: 'lcx' }]]),
  };
  const regions = ids => ids.map(segment => ({ segment }));
  assert.equal(caseSystem({ projection: 'rca-lao' }, content), 'right');
  assert.equal(caseSystem({ projection: 'lao-caudal', regions: regions(['seg-1', 'seg-2']) }, content), 'left', 'a named view for one system wins over the outlines');
  assert.equal(caseSystem({ regions: regions(['seg-1', 'seg-2', 'seg-6']) }, content), 'right');
  assert.equal(caseSystem({ regions: regions(['seg-6', 'seg-11', 'seg-1']) }, content), 'left');
  assert.equal(caseSystem({ regions: regions(['seg-1', 'seg-6']) }, content), 'left', 'a tie is not a right coronary image');
  assert.equal(caseSystem({}, content), null);
  assert.equal(caseSystem({ regions: [] }, content), null);
});
