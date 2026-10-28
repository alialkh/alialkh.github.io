import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreView, imbalance } from './visibility.js';

const view = (areas, left) => ({ areas: new Map(Object.entries(areas)), leftAreas: new Map(Object.entries(left)) });

test('a view scores by how much of each wanted structure it shows, up to the need', () => {
  const v = view({ lv: 1800, rv: 300 }, {});
  assert.equal(scoreView(v, { lv: 900, rv: 600 }), 0.75);
  assert.equal(scoreView(v, { lv: 900 }), 1);
  assert.equal(scoreView(v, { liver: 100 }), 0);
});

test('imbalance is 0 when the wanted structures are centred and 1 when they all lie on one side', () => {
  assert.equal(imbalance(view({ lv: 1000, rv: 500 }, { lv: 500, rv: 250 }), { lv: 1, rv: 1 }), 0);
  assert.equal(imbalance(view({ lv: 1000 }, { lv: 1000 }), { lv: 1 }), 1);
  assert.equal(imbalance(view({ lv: 1000 }, {}), { lv: 1 }), 1);
  assert.equal(imbalance(view({}, {}), { lv: 1 }), 1);
});
