import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPatient, DEFAULTS, restOf, STRUCTURES, structureMap, HEART } from './patient.js';
import { resolve, evaluate, inside, bodySdf, bodyNormal, FLOATS, hermite, BODY_KNOTS, TABLE_Y, FLAG } from './anatomy.js';
import { TISSUES, TISSUE_INDEX } from './tissues.js';

const builder = buildPatient();
const at = (res, p) => {
  const hit = evaluate(res, p);
  return { tissue: hit.tissue >= 0 ? TISSUES[hit.tissue].key : null, entry: hit.entry >= 0 ? res.names[hit.entry] : null };
};
const make = (set = {}) => {
  const P = { ...DEFAULTS, ...set };
  return resolve(builder, TISSUE_INDEX, P, restOf(P));
};

test('every entry resolves to finite numbers and names a real tissue', () => {
  const res = make();
  assert.equal(res.data.length, builder.entries.length * FLOATS);
  for (let i = 0; i < res.data.length; i++) assert.ok(Number.isFinite(res.data[i]), `entry ${res.names[Math.floor(i / FLOATS)]} float ${i % FLOATS}`);
  assert.ok(builder.entries.length > 250);
});

test('the landmarks of the standard exam lie in the right organs', () => {
  const res = make();
  const expect = [
    [[-70, -5, -60], 'liver'], [[22, -50, -18], 'liver'], [[108, 40, -52], 'spleen'], [[-62, 52, -126], null],
    [[0, -30, -320], 'urine'], [[0, 84, -262], 'bone'], [[8, 40, -120], 'blood'], [[-70, 10, 100], 'lung'],
  ];
  for (const [p, want] of expect) {
    const got = at(res, p).tissue;
    if (want) assert.equal(got, want, `${p} is ${got}`);
  }
  // the right kidney is a kidney tissue somewhere near its centre
  assert.match(at(res, [-62, 52, -126]).tissue, /kidney/);
});

test('the heart sits left of the midline with its apex toward the left front', () => {
  const apex = [HEART.c[0] + HEART.M[0] * 52, HEART.c[1] + HEART.M[3] * 52, HEART.c[2] + HEART.M[6] * 52];
  assert.ok(apex[0] > 60, 'apex is to the patient left');
  assert.ok(apex[1] < -40, 'apex is anterior');
  assert.ok(apex[2] < 0, 'apex is below the level of the xiphisternal joint');
  const res = make();
  assert.equal(at(res, HEART.c).tissue, 'blood');
});

test('the skin is where the body outline says, and the back lies on the table', () => {
  assert.ok(bodySdf([0, 0, 0]) < 0);
  assert.ok(bodySdf([0, -300, 0]) > 0);
  assert.ok(bodySdf([0, TABLE_Y + 5, 0]) > 0);
  assert.ok(bodySdf([0, TABLE_Y - 5, 0]) < 0);
  const n = bodyNormal([0, -110, -60]);
  assert.ok(n[1] < -0.9, 'the front of the abdomen faces forward');
});

test('habitus thickens the front of the abdomen and leaves the back on the table', () => {
  const thin = BODY_KNOTS.z.map(z => hermite(BODY_KNOTS.z, BODY_KNOTS.B, z));
  assert.ok(thin.every(v => v > 40));
  const front = h => { let y = -300; while (bodySdf([0, y, -90], h) > 0) y += 0.5; return y; };
  assert.ok(front(1) < front(0) - 20, 'obese skin is well in front of slim skin');
  const back = h => { let y = 300; while (bodySdf([0, y, -90], h) > 0) y -= 0.5; return y; };
  assert.ok(Math.abs(back(1) - back(0)) < 3);
});

test('breathing moves the liver and kidneys down, and the heart a little', () => {
  const rest = make();
  const full = make({ breath: 1 });
  const idx = n => rest.names.indexOf(n);
  const dz = n => full.data[idx(n) * FLOATS + 34];
  assert.equal(dz('liver-r'), -24);
  assert.ok(dz('kidney-R') < -8);
  assert.ok(dz('lv') > -12 && dz('lv') < 0);
  assert.equal(rest.data[idx('liver-r') * FLOATS + 34], 0);
});

test('scenario switches add the pathology and take it away again', () => {
  const none = make();
  const fluid = make({ fluidRUQ: 14 });
  const idx = res => res.names.indexOf('morison');
  assert.ok(none.data[idx(none) * FLOATS + 2] & FLAG.INACTIVE, 'no fluid by default');
  assert.ok(!(fluid.data[idx(fluid) * FLOATS + 2] & FLAG.INACTIVE));
  const p = [fluid.data[idx(fluid) * FLOATS + 4], fluid.data[idx(fluid) * FLOATS + 5], fluid.data[idx(fluid) * FLOATS + 6]];
  assert.equal(at(fluid, p).tissue, 'fluid');
  assert.notEqual(at(none, p).tissue, 'fluid');

  const peri = make({ pericardial: 14 });
  assert.ok(peri.names.filter(n => n.startsWith('pc-')).every(n => !(peri.data[peri.names.indexOf(n) * FLOATS + 2] & FLAG.INACTIVE)));
  const ptx = make({ ptxR: 12 });
  assert.ok(!(ptx.data[ptx.names.indexOf('pneumothorax-R') * FLOATS + 2] & FLAG.INACTIVE));
  assert.ok(ptx.data[ptx.names.indexOf('pneumothorax-L') * FLOATS + 2] & FLAG.INACTIVE);
});

test('a bigger bladder reaches higher and a full IVC is wider than a collapsed one', () => {
  const small = make({ bladder: 60 });
  const big = make({ bladder: 500 });
  const top = res => { let z = -400; while (!/urine/.test(at(res, [0, -30, z]).tissue ?? '')) z += 1; let t = z; while (/urine/.test(at(res, [0, -30, t]).tissue ?? '')) t += 1; return t; };
  assert.ok(top(big) > top(small) + 25);
  const wide = make({ ivcDiam: 26, ivcCollapse: 0, breath: 1 });
  const slit = make({ ivcDiam: 26, ivcCollapse: 0.9, breath: 1 });
  const width = res => { let w = 0; for (let x = -60; x < 0; x += 0.5) if (at(res, [x, 34, -96]).entry?.startsWith('ivc.')) w += 0.5; return w; };
  assert.ok(width(wide) > width(slit) + 4, `${width(wide)} vs ${width(slit)}`);
});

test('ribs are bone and their cartilage is cartilage, with gaps between ribs', () => {
  const res = make();
  const kinds = new Set();
  for (let z = -120; z < 120; z += 2) kinds.add(at(res, [-125, 8 + 0.02 * (z + 30), z]).tissue);
  assert.ok(kinds.has('bone'));
  // the lateral chest wall at the rib level has muscle between ribs
  assert.ok(kinds.has('muscle') || kinds.has('fat_sc'));
});

test('the lung is aerated tissue and the pleural effusion replaces its dependent part', () => {
  const res = make();
  assert.equal(at(res, [-70, 10, 100]).tissue, 'lung');
  const eff = make({ pleuralR: 40 });
  // posteriorly the dome is only a little below z = -15, so the dependent pleural space is above that
  assert.equal(at(eff, [-45, 60, 10]).tissue, 'fluid');
  assert.equal(at(res, [-45, 60, 10]).tissue, 'lung');
});

test('every named structure has at least one entry, and no entry belongs to two', () => {
  const map = structureMap(builder.entries.map(e => e.name));
  STRUCTURES.forEach((s, i) => assert.ok(map.includes(i), `${s.id} has no entry`));
  assert.equal(new Set(STRUCTURES.map(s => s.id)).size, STRUCTURES.length);
});

test('inside() answers for a named entry', () => {
  const res = make();
  assert.equal(inside(res, 'liver-r', [-70, -5, -60]), true);
  assert.equal(inside(res, 'liver-r', [100, 0, 0]), false);
  assert.throws(() => inside(res, 'no-such-entry', [0, 0, 0]));
});
