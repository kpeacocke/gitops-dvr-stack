const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'pace-production.cjs'), 'utf8');
const code = name => fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8');
function flow(old = true) {
  const encode = code('encode').replace('  // Pace background work so the shared NAS GPU retains playback headroom.\n', '')
    .replace("'-readrate', '0.25', ", '');
  const health = code('health').replace("'-readrate', '0.25', ", '');
  return { _id: 'production-hybrid', flowEdges: [{ source: 'remote', target: 'guard' }],
    flowPlugins: ['encode', 'health'].map(id => ({ id, pluginName: 'customFunction',
      inputsDB: { code: old ? ({ encode, health })[id] : code(id) } }))
      .concat([{ id: 'remote', inputsDB: { code: 'preserve remote branch' } }]) };
}
async function run(initial, apply) {
  let current = structuredClone(initial);
  const writes = [], backups = [], errors = [];
  const context = { __dirname, structuredClone, process: { argv: apply ? ['--apply'] : [] },
    console: { log() {}, error: x => errors.push(x) },
    require: name => name === 'node:fs' ? {
      readFileSync: (p, ...a) => p.includes('Tdarr_Node_Config') ? '{"apiKey":"test"}' : fs.readFileSync(p, ...a),
      writeFileSync: (p, data, opts) => backups.push({ p, data: JSON.parse(data), opts }),
    } : require(name),
    fetch: async (_, options) => {
      const { data } = JSON.parse(options.body);
      let result;
      if (data.collection === 'LibrarySettingsJSONDB') result = [
        { folder: '/tv', flowId: initial._id, schedule: ['unchanged'] },
        { folder: '/movies', flowId: initial._id, schedule: ['unchanged'] },
      ];
      else if (data.mode === 'getById') result = current;
      else { writes.push(data); current = structuredClone(data.obj); result = {}; }
      return { ok: true, text: async () => JSON.stringify(result) };
    },
  };
  await vm.runInNewContext(source, context);
  return { current, writes, backups, errors };
}
test('preview reads production flow but writes nothing', async () => {
  const result = await run(flow(), false);
  assert.deepEqual(result.errors, []);
  assert.equal(result.writes.length, 0);
  assert.equal(result.backups.length, 0);
});
test('apply backs up and preserves custom branches and graph, then is idempotent', async () => {
  const original = flow();
  const result = await run(original, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.writes.length, 1);
  assert.equal(result.backups.length, 1);
  assert.deepEqual(result.backups[0].data.flow, original);
  assert.deepEqual(result.current.flowEdges, original.flowEdges);
  assert.deepEqual(result.current.flowPlugins[2], original.flowPlugins[2]);
  assert.equal(result.current.flowPlugins[0].inputsDB.code, code('encode'));
  assert.equal(result.current.flowPlugins[1].inputsDB.code, code('health'));
  const again = await run(result.current, true);
  assert.deepEqual(again.errors, []);
  assert.equal(again.writes.length, 0);
});
test('unrecognised live code fails before any backup or write', async () => {
  const initial = flow(); initial.flowPlugins[1].inputsDB.code += '// operator change';
  const result = await run(initial, true);
  assert.match(result.errors.join(), /Unrecognised live code/);
  assert.equal(result.writes.length, 0);
  assert.equal(result.backups.length, 0);
});
