import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entryAngle, describeAngle, matchProjection, segmentRoles, isLateral, TOLERANCE } from './views.js';

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
