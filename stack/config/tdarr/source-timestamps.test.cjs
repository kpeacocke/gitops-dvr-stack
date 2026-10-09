const test = require('node:test');
const assert = require('node:assert/strict');
const { patch } = require('./fix-source-timestamps.cjs');
test('migration preserves customised graph and rejects unknown snapshot code', () => {
  const flow = { _id: 'custom', flowEdges: [{ source: 'a', target: 'b' }],
    flowPlugins: [{ id: 'a', inputsDB: { code: 'args.variables.sourceSnapshot = { size: stat.size, mtimeMs: stat.mtimeMs };' } },
      { id: 'b', inputsDB: { code: 'keep customised remote branch' } }] };
  const result = patch(flow);
  assert.equal(result.count, 1);
  assert.deepEqual(result.updated.flowEdges, flow.flowEdges);
  assert.deepEqual(result.updated.flowPlugins[1], flow.flowPlugins[1]);
  assert.ok(flow.flowPlugins[0].inputsDB.code.includes('mtimeMs'));
  assert.equal(patch(result.updated).count, 0);
  flow.flowPlugins[0].inputsDB.code = 'args.variables.sourceSnapshot = {mtimeMs: other.time};';
  assert.throws(() => patch(flow), /Unrecognised/);
});
