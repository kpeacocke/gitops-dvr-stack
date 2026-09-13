const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sourceStat = { size: 1000000, mtimeMs: 1, nlink: 1 };
function plugin(name, stat = sourceStat, available = 1000 * 1024 ** 3) {
  const context = { module: { exports: {} }, require: (name) => name === 'fs'
    ? { promises: { stat: async () => stat, statfs: async () => ({ bavail: available, bsize: 1 }) } }
    : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8'), context);
  return context.module.exports;
}
function args() {
  return { inputFileObj: { _id: '/tv/test.mkv', ffProbeData: { streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, color_transfer: 'bt709' },
    { codec_type: 'audio', codec_name: 'aac', channels: 2, tags: { language: 'eng' } },
  ] } }, variables: {}, jobLog: () => {} };
}
test('eligible SDR passes; unsafe sources are skipped', async () => {
  assert.equal((await plugin('eligibility')(args())).outputNumber, 1);
  for (const override of [{ color_transfer: 'smpte2084' }, { color_transfer: undefined },
    { codec_name: 'hevc' }, { height: 2160 }, { field_order: 'tt' },
    { side_data_list: [{ side_data_type: 'DOVI configuration record' }] }]) {
    const a = args(); Object.assign(a.inputFileObj.ffProbeData.streams[0], override);
    assert.equal((await plugin('eligibility')(a)).outputNumber, 2);
  }
  for (const stat of [{ ...sourceStat, nlink: 2 }, { ...sourceStat, mtimeMs: Date.now() }]) {
    assert.equal((await plugin('eligibility', stat)(args())).outputNumber, 2);
  }
  await assert.rejects(plugin('eligibility', sourceStat, 100)(args()), /headroom/);
});
function validationArgs() {
  const a = args();
  a.originalLibraryFile = structuredClone(a.inputFileObj);
  a.variables.sourceSnapshot = { ...sourceStat };
  Object.assign(a.inputFileObj.ffProbeData.streams[0], { codec_name: 'hevc', pix_fmt: 'yuv420p10le' });
  return a;
}
test('validation rejects source mutation, missing tracks and changed output', async () => {
  assert.equal((await plugin('validate')(validationArgs())).outputNumber, 1);
  await assert.rejects(plugin('validate', { ...sourceStat, size: 10 })(validationArgs()), /Source changed/);
  for (const change of [a => a.inputFileObj.ffProbeData.streams.pop(),
    a => a.inputFileObj.ffProbeData.streams[0].width = 1280,
    a => a.inputFileObj.ffProbeData.streams[0].pix_fmt = 'yuv420p',
    a => a.inputFileObj.ffProbeData.streams[1].tags.language = 'fra',
    a => a.inputFileObj.ffProbeData.streams[1].disposition = { forced: 1 }]) {
    const a = validationArgs(); change(a); await assert.rejects(plugin('validate')(a));
  }
});
test('flow embeds current scripts and only validated success reaches replacement', () => {
  const flow = require('./sdr-hevc-flow.json');
  for (const [id, file] of [['eligible', 'eligibility'], ['encode', 'encode'], ['validate', 'validate']]) {
    assert.equal(flow.flowPlugins.find(p => p.id === id).inputsDB.code.replace(/\r/g, ''),
      fs.readFileSync(path.join(__dirname, `${file}.js`), 'utf8').replace(/\r/g, ''));
  }
  assert.equal(flow.flowEdges.filter(e => e.target === 'replace').length, 1);
  assert.equal(flow.flowEdges.find(e => e.target === 'replace').source, 'validate');
  assert.ok(flow.flowEdges.every(e => e.sourceHandle === '1'));
});
