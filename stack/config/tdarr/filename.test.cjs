const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const preserve = require('./preserve-filename');

test('two episodes with output.mkv caches retain distinct replacement destinations', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdarr-filename-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = path.join(root, 'Season 1');
  await fs.mkdir(library);
  for (const episode of ['S01E01', 'S01E02']) {
    const original = path.join(library, `Show - ${episode}.mkv`);
    const cache = path.join(root, episode);
    await fs.mkdir(cache);
    await fs.writeFile(original, `original-${episode}`);
    const current = path.join(cache, 'output.mkv');
    await fs.writeFile(current, `encoded-${episode}`);
    const args = { originalLibraryFile: { _id: original }, inputFileObj: { _id: current },
      variables: {}, jobLog() {} };
    const result = await preserve(args);
    const replacement = path.join(path.dirname(original), path.basename(result.outputFileObj._id));
    assert.equal(replacement, original);
    assert.equal((await fs.stat(current)).ino, (await fs.stat(result.outputFileObj._id)).ino);
    assert.equal(await fs.readFile(original, 'utf8'), `original-${episode}`);
    assert.equal((await preserve(args)).outputFileObj._id, result.outputFileObj._id);
  }
});

test('cache collision and unidentified originals fail without overwriting files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdarr-collision-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const current = path.join(root, 'output.mkv');
  const target = path.join(root, 'Show.mkv');
  await fs.writeFile(current, 'new-output');
  await fs.writeFile(target, 'must-survive');
  const args = { originalLibraryFile: { _id: '/library/Show.mkv' },
    inputFileObj: { _id: current }, variables: {}, jobLog() {} };
  await assert.rejects(preserve(args), /collision/);
  assert.equal(await fs.readFile(target, 'utf8'), 'must-survive');
  assert.equal(await fs.readFile(current, 'utf8'), 'new-output');
  args.originalLibraryFile._id = '/library/output.mkv';
  await assert.rejects(preserve(args), /Unidentified/);
});

test('every replacement edge in the production flow passes the filename guard', () => {
  const flow = require('./sdr-hevc-flow.json');
  const edges = flow.flowEdges.filter(e => e.target === 'replace');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source, 'preserve-filename');
});
