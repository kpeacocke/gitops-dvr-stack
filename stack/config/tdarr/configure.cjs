// Run inside the pinned Tdarr container with this script and the flow JSON together.
// Default: configure libraries paused. Enable only after a successful pilot:
// node configure.cjs --enable-libraries
const fs = require('node:fs');
const path = require('node:path');
const defaults = require('/app/Tdarr_Server/srcug/commonModules/jobs/libraryDefaults.js').default;
const key = JSON.parse(fs.readFileSync('/app/configs/Tdarr_Node_Config.json')).apiKey;
const enabled = process.argv.includes('--enable-libraries');
const backlog = process.argv.includes('--backlog');
const flowId = 'ds920-sdr-hevc';
async function api(route, body) {
  const response = await fetch(`http://127.0.0.1:8266/api/v2/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tdarr ${route}: ${response.status} ${text.slice(0,200)}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function save(collection, id, settings) {
  const old = await api('cruddb', { data: { collection, mode: 'getById', docID: id } });
  await api('cruddb', { data: { collection, mode: old?._id ? 'update' : 'insert', docID: id,
    obj: { ...settings, _id: id } } });
}
async function main() {
  if (backlog && !enabled) throw new Error('--backlog requires --enable-libraries');
  if (!key) throw new Error('Configure the authenticated node API key first');
  const flow = JSON.parse(fs.readFileSync(path.join(__dirname, 'sdr-hevc-flow.json')));
  await save('FlowsJSONDB', flowId, flow);
  for (const [id, name, folder] of [
    ['ds920-tv', 'TV - SDR HEVC overnight', '/tv'],
    ['ds920-movies', 'Movies - SDR HEVC overnight', '/movies'],
  ]) {
    const library = structuredClone(defaults);
    Object.assign(library, { name, folder, cache: '/temp', flowId,
      containerFilter: 'mkv', pluginIDs: [], scannerThreadCount: 1,
      processLibrary: enabled, processTranscodes: true, processHealthChecks: false,
      folderWatching: enabled, folderWatchScanInterval: 3600, useFsEvents: false,
      scheduledScanFindNew: false, scanOnStart: enabled,
      holdNewFiles: true, holdFor: 86400, holdForDisplayUnit: 'hours' });
    library.decisionMaker.settingsPlugin = false;
    library.decisionMaker.settingsFlows = true;
    library.schedule = library.schedule.map(slot => ({ ...slot,
      checked: backlog || (Number(slot._id.split(':')[1].split('-')[0]) >= 1
        && Number(slot._id.split(':')[1].split('-')[0]) < 6) }));
    await save('LibrarySettingsJSONDB', id, library);
    console.log(`${name}: ${enabled ? (backlog ? 'enabled, 24/7 backlog mode' : 'enabled, 01:00–06:00 local time') : 'paused'}`);
  }
  const nodes = await api('get-nodes');
  for (const [id, node] of Object.entries(nodes)) {
    if (node.nodeName !== 'DS920-QSV') continue;
    await api('update-node', { data: { nodeID: id, nodeUpdates: {
      gpuSelect: 'qsv', maxGpuWorkers: 1,
      workerLimits: { transcodegpu: 1, transcodecpu: 0, healthcheckgpu: 0, healthcheckcpu: 0 },
    } } });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
