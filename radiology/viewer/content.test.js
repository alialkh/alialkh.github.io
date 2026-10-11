import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validateCases, validateGrid, loadCases } from './content.js';

const base = () => [{
  id: 'ct-1', modality: 'CT', region: 'chest', title: 'T', summary: 'S', vignette: 'V',
  series: [{ id: 'ct', name: 'CT', url: 'ct-1/ct/', windows: [{ name: 'Soft', center: 40, width: 400 }, { name: 'Lung', center: -600, width: 1500 }], defaultWindow: 'Soft' }],
  labels: { url: 'ct-1/labels/', names: { 1: 'Body', 2: 'Rod' }, centroids: { 1: [4, 4, 2], 2: [4.5, 8, 2] } },
  findings: [{ id: 'f1', title: 'F', text: 'T.', plane: 'axial', index: 2, at: [0.5, 0.25], window: 'Lung' }],
  source: { author: 'A', license: 'CC0 1.0', licenseUrl: 'https://l', url: 'https://u', attribution: '', modified: '' },
}, {
  id: 'mr-1', modality: 'MR', region: 'abdomen', title: 'T', summary: 'S',
  series: [{ id: 't1', name: 'T1', url: 'mr-1/t1/', windows: [], defaultWindow: '' }, { id: 't2', name: 'T2', url: 'mr-1/t2/', windows: [] }],
  findings: [{ id: 'f1', title: 'F', text: 'T.', plane: 'sagittal', index: 1, at: [0, 1], series: 't2' }],
  source: { author: 'A', license: 'CC BY-SA 4.0', licenseUrl: 'https://l', url: 'https://u', attribution: 'X', modified: 'Y' },
}];
const after = mutate => {
  const t = base();
  mutate(t);
  return validateCases(t);
};

test('the baseline CT and MR cases are valid', () => {
  assert.deepEqual(validateCases(base()), []);
});

test('an empty manifest is valid and anything that is not a list is not', () => {
  assert.deepEqual(validateCases([]), []);
  assert.match(validateCases({}).join(), /must be a list/);
});

test('rejects a duplicate case id and a region that does not exist', () => {
  assert.match(after(t => { t[1].id = 'ct-1'; }).join(), /duplicate id/);
  assert.match(after(t => { t[0].region = 'tail'; }).join(), /region.*tail/);
});

test('rejects licenses that forbid republishing, with the allowed list in the message', () => {
  for (const license of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'All rights reserved']) {
    assert.match(after(t => { t[0].source.license = license; }).join(), /not allowed.*CC0 1\.0/);
  }
  assert.deepEqual(after(t => { t[0].source.license = 'Public domain'; }), []);
});

test('rejects a finding that names a series or window that does not exist', () => {
  assert.match(after(t => { t[1].findings[0].series = 't3'; }).join(), /series "t3"/);
  assert.match(after(t => { t[0].findings[0].window = 'Brain'; }).join(), /window "Brain" is not a window of series "ct"/);
});

test('a finding window must belong to the series the finding shows, not the first one', () => {
  const p = after(t => {
    t[0].series.push({ id: 'b', name: 'B', url: 'ct-1/b/', windows: [{ name: 'Bone', center: 300, width: 1500 }], defaultWindow: 'Bone' });
    t[0].findings[0].series = 'b';
  });
  assert.match(p.join(), /window "Lung" is not a window of series "b"/);
});

test('an MR series with no windows takes no finding window', () => {
  assert.match(after(t => { t[1].findings[0].window = 'Soft'; }).join(), /window "Soft"/);
});

test('rejects bad window rules', () => {
  assert.match(after(t => { t[0].series[0].defaultWindow = 'Nope'; }).join(), /defaultWindow "Nope" is not one of its windows/);
  assert.match(after(t => { t[0].series[0].windows[1].name = 'Soft'; }).join(), /repeats the window name "Soft"/);
  assert.match(after(t => { t[0].series[0].windows[0].width = 0; }).join(), /width must be a positive number/);
  assert.match(after(t => { t[1].series[0].defaultWindow = 'Auto'; }).join(), /must be empty when windows is empty/);
  assert.match(after(t => { t[0].series[0].windows = []; t[0].series[0].defaultWindow = ''; }).join(), /is CT, so it needs windows/);
});

test('rejects duplicate ids inside a case and a case with no series', () => {
  assert.match(after(t => { t[1].series[1].id = 't1'; }).join(), /duplicate series id/);
  assert.match(after(t => { t[0].findings.push({ ...t[0].findings[0] }); }).join(), /duplicate finding id/);
  assert.match(after(t => { t[0].series = []; }).join(), /at least one series/);
});

test('rejects a volume url that is not a folder and a point outside the image', () => {
  assert.match(after(t => { t[0].series[0].url = 'ct-1/ct'; }).join(), /folder url ending in a slash/);
  assert.match(after(t => { t[0].findings[0].at = [1.2, 0.5]; }).join(), /\.at must be/);
  assert.match(after(t => { t[0].findings[0].index = -1; }).join(), /\.index must be a whole number/);
  assert.match(after(t => { t[0].findings[0].plane = 'oblique'; }).join(), /plane.*oblique/);
});

test('rejects label ids and centroids that do not line up', () => {
  assert.match(after(t => { t[0].labels.names.zero = 'Bad'; t[0].labels.centroids.zero = [0, 0, 0]; }).join(), /key "zero"/);
  assert.match(after(t => { t[0].labels.names[300] = 'Big'; t[0].labels.centroids[300] = [0, 0, 0]; }).join(), /1 to 255/);
  assert.match(after(t => { delete t[0].labels.centroids[2]; }).join(), /centroids\["2"\]/);
  assert.match(after(t => { t[0].labels.centroids[3] = [1, 1, 1]; }).join(), /centroids\["3"\] has no name/);
  assert.match(after(t => { t[0].labels.centroids[2] = [1, 1]; }).join(), /\[x, y, z\]/);
});

const meta = (dims, over = {}) => ({ dtype: 'int16', dims, spacing: [1, 1, 2], chunks: [{ file: 'c0000.gz', z0: 0, z1: dims[2] }], chunkSlices: 16, ...over });
const grid = (c, over = {}) => ({ [c.series[0].id]: meta([10, 12, 5]), ...(c.labels ? { labels: meta([10, 12, 5], { dtype: 'uint8' }) } : {}), ...over });

test('series and labels on one grid pass the grid check', () => {
  const [c] = base();
  assert.deepEqual(validateGrid(c, grid(c)), []);
});

test('series and labels must share dims and spacing, and have the right dtype', () => {
  const [c] = base();
  assert.match(validateGrid(c, grid(c, { labels: meta([10, 12, 6], { dtype: 'uint8' }) })).join(), /labels dims 10x12x6 differ from series "ct" 10x12x5/);
  assert.match(validateGrid(c, grid(c, { labels: meta([10, 12, 5], { dtype: 'uint8', spacing: [1, 1, 3] }) })).join(), /labels spacing/);
  assert.match(validateGrid(c, grid(c, { labels: meta([10, 12, 5]) })).join(), /labels dtype int16 must be uint8/);
  const mr = base()[1];
  assert.match(validateGrid(mr, { t1: meta([10, 12, 5]), t2: meta([10, 11, 5]) }).join(), /series "t2" dims 10x11x5/);
});

test('a broken vol.json is reported with its case and series', () => {
  const [c] = base();
  assert.match(validateGrid(c, grid(c, { ct: meta([10, 12, 5], { chunks: [] }) })).join(), /cases\["ct-1"\] series "ct" vol\.json chunks/);
});

test('a finding index must be inside the slice count of its own plane', () => {
  const [c] = base();
  c.findings[0] = { ...c.findings[0], plane: 'coronal', index: 12 };
  assert.match(validateGrid(c, grid(c)).join(), /index 12 is outside the 12 coronal slices/);
  c.findings[0].index = 11;
  assert.deepEqual(validateGrid(c, grid(c)), []);
  c.findings[0] = { ...c.findings[0], plane: 'sagittal', index: 10 };
  assert.match(validateGrid(c, grid(c)).join(), /outside the 10 sagittal slices/);
});

test('a centroid outside the volume is reported', () => {
  const [c] = base();
  c.labels.centroids[2] = [4, 12, 2];
  assert.match(validateGrid(c, grid(c)).join(), /centroids\["2"\] is outside the volume/);
});

const stubFetch = (files, log = []) => async url => {
  log.push(String(url));
  const body = files[new URL(url).pathname];
  return body === undefined ? new Response('', { status: 404, statusText: 'Not Found' }) : new Response(JSON.stringify(body));
};

test('loadCases resolves every volume url against the manifest', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubFetch({ '/v/cases/m.json': base() });
  try {
    const cases = await loadCases('http://x.test/v/index.html?cases=cases/m.json');
    assert.equal(cases[0].series[0].url, 'http://x.test/v/cases/ct-1/ct/');
    assert.equal(cases[0].labels.url, 'http://x.test/v/cases/ct-1/labels/');
    assert.equal(cases[1].labels, undefined);
  } finally {
    globalThis.fetch = real;
  }
});

test('a missing default manifest means zero cases, a missing dev manifest stops loudly', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubFetch({});
  try {
    assert.deepEqual(await loadCases('http://x.test/v/index.html'), []);
    await assert.rejects(loadCases('http://x.test/v/index.html?cases=nope.json'), e => e.problems.length === 1 && /HTTP 404/.test(e.problems[0]));
  } finally {
    globalThis.fetch = real;
  }
});

test('an invalid manifest stops with every problem listed', async () => {
  const real = globalThis.fetch;
  const bad = base();
  bad[0].region = 'tail';
  bad[1].source.license = 'CC BY-NC 4.0';
  globalThis.fetch = stubFetch({ '/v/m.json': bad });
  try {
    await assert.rejects(loadCases('http://x.test/v/index.html?cases=m.json'), e => e.problems.length === 2);
  } finally {
    globalThis.fetch = real;
  }
});

const FIXTURE = new URL('./test-fixtures/cases/manifest.json', import.meta.url);
const REAL = new URL('../../data/cases/manifest.json', import.meta.url);

// The table rules, then the grid rules against every vol.json on disk, the way the page checks them at load.
function problemsOf(manifest) {
  const cases = JSON.parse(readFileSync(manifest, 'utf8'));
  const problems = validateCases(cases);
  if (problems.length) return { cases, problems };
  for (const c of cases) {
    const parts = [...c.series.map(s => [s.id, s.url]), ...(c.labels ? [['labels', c.labels.url]] : [])];
    const metas = Object.fromEntries(parts.map(([key, url]) => [key, JSON.parse(readFileSync(new URL(`${url}vol.json`, manifest), 'utf8'))]));
    problems.push(...validateGrid(c, metas));
  }
  return { cases, problems };
}

test('the fixture cases are valid, on one grid, licensed and plainly synthetic', { skip: !existsSync(FIXTURE) }, () => {
  const { cases, problems } = problemsOf(FIXTURE);
  assert.deepEqual(problems, []);
  assert.ok(cases.length >= 3);
  for (const c of cases) {
    assert.match(c.title, /synthetic/i);
    assert.match(c.title, /not a patient/i);
    assert.match(c.source.attribution, /not a patient/i);
  }
});

test('the real case manifest, once it exists, is valid down to its volume files', { skip: !existsSync(REAL) }, () => {
  assert.deepEqual(problemsOf(REAL).problems, []);
});
