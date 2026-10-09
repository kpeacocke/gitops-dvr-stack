// Patch known source-snapshot expressions without replacing customised flow graphs.
// Run inside Tdarr while every library and node is paused. Preview is the default.
const fs = require('node:fs');
const replacements = [
  ['args.variables.sourceSnapshot = { size: stat.size, mtimeMs: stat.mtimeMs };',
    "const exactStat = await fs.stat(file._id, { bigint: true });\n  args.variables.sourceSnapshot = { size: exactStat.size.toString(), mtimeNs: exactStat.mtimeNs.toString() };"],
  ['const stat = await fs.stat(before._id);', 'const stat = await fs.stat(before._id, { bigint: true });'],
  ['!snapshot || stat.size !== snapshot.size || stat.mtimeMs !== snapshot.mtimeMs',
    '!snapshot || stat.size.toString() !== snapshot.size || stat.mtimeNs.toString() !== snapshot.mtimeNs'],
  ['const stat = await fs.stat(source);', 'const stat = await fs.stat(source, { bigint: true });'],
  ['sourceSnapshot: { size: stat.size, mtimeMs: stat.mtimeMs }',
    'sourceSnapshot: { size: stat.size.toString(), mtimeNs: stat.mtimeNs.toString() }'],
];
function patch(flow) {
  const updated = structuredClone(flow);
  let count = 0;
  for (const node of updated.flowPlugins || []) {
    let code = node.inputsDB?.code;
    if (!code?.includes('sourceSnapshot')) continue;
    const before = code;
    for (const [old, replacement] of replacements) code = code.replaceAll(old, replacement);
    if (/sourceSnapshot[^\n]*mtimeMs|snapshot\.mtimeMs/.test(code)) {
      throw new Error(`Unrecognised timestamp snapshot in ${flow._id}/${node.id}`);
    }
    if (before !== code) { node.inputsDB.code = code; count++; }
  }
  return { updated, count };
}
module.exports = { patch };
async function main() {
  const key = JSON.parse(fs.readFileSync('/app/configs/Tdarr_Node_Config.json')).apiKey;
  async function api(route, body) {
    const response = await fetch(`http://127.0.0.1:8266/api/v2/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${route}: ${response.status}`);
    try { return JSON.parse(text); } catch { return text; }
  }
  const get = (collection, id) => api('cruddb', { data: { collection, mode: 'getById', docID: id } });
  const manifest = JSON.parse(fs.readFileSync(fs.readFileSync('/app/server/recovery-20261009/current-pilot-path.txt', 'utf8') + '/manifest.json'));
  for (const id of ['ds920-tv', 'ds920-movies', 'ds920-pilot', manifest.id]) {
    if ((await get('LibrarySettingsJSONDB', id)).processLibrary) throw new Error(`Pause library ${id} first`);
  }
  for (const node of Object.values(await api('get-nodes'))) {
    if (!node.nodePaused || Object.keys(node.workers || {}).length) throw new Error('Pause and drain every node first');
  }
  const plans = [];
  for (const id of ['ds920-sdr-hevc', 'tdarr-temp-hybrid', 'ds920-backlog-audit']) {
    const original = await get('FlowsJSONDB', id);
    if (!original?._id) throw new Error(`Missing flow ${id}`);
    const result = patch(original);
    plans.push({ id, original, ...result });
    console.log(id, 'functions to update:', result.count);
  }
  if (!process.argv.includes('--apply')) return;
  const backup = `/app/configs/source-timestamps-before-${Date.now()}.json`;
  fs.writeFileSync(backup, JSON.stringify(plans.map(p => p.original)), { flag: 'wx', mode: 0o600 });
  for (const plan of plans.filter(p => p.count)) {
    await api('cruddb', { data: { collection: 'FlowsJSONDB', mode: 'update', docID: plan.id, obj: plan.updated } });
    const saved = await get('FlowsJSONDB', plan.id);
    if (JSON.stringify(saved.flowPlugins) !== JSON.stringify(plan.updated.flowPlugins)
        || JSON.stringify(saved.flowEdges) !== JSON.stringify(plan.original.flowEdges)) {
      throw new Error(`Readback mismatch: ${plan.id}; retain pauses`);
    }
  }
  console.log('Exact timestamp snapshots verified; all processing remains paused. Backup:', backup);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
