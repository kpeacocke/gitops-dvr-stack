// Run beside encode.js and health.js inside Tdarr. Preview unless --apply.
// Discover the assigned production flows; never replace a library's whole flow.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const apply = process.argv.includes('--apply');
const key = JSON.parse(fs.readFileSync('/app/configs/Tdarr_Node_Config.json')).apiKey;
async function read(collection, docID) {
  return api({ collection, mode: docID ? 'getById' : 'getAll', ...(docID ? { docID } : {}) });
}
async function api(data) {
  const response = await fetch('http://127.0.0.1:8266/api/v2/cruddb', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) throw new Error(`Tdarr HTTP ${response.status}`);
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const originalHashes = {
  encode: '20fd321e5a4fb49a1220c2e7d8a4cd350d81f904efa9ab21dec455e230dff475',
  health: 'a9f5247053cd0c827b785df2ff293c8a69002d7d4c1cc1262abc447b7483616b',
};
async function main() {
  const libraries = Object.values(await read('LibrarySettingsJSONDB'))
    .filter(l => ['/tv', '/movies'].includes(l.folder));
  if (libraries.length !== 2 || new Set(libraries.map(l => l.folder)).size !== 2
      || libraries.some(l => !l.flowId)) throw new Error('Unexpected production libraries');
  const plans = [];
  for (const id of new Set(libraries.map(l => l.flowId))) {
    const before = await read('FlowsJSONDB', id);
    const after = structuredClone(before);
    for (const name of ['encode', 'health']) {
      const matches = after.flowPlugins.filter(p => p.id === name);
      if (matches.length !== 1 || matches[0].pluginName !== 'customFunction')
        throw new Error(`Unexpected ${id}/${name} plugin`);
      const desired = fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8');
      const current = matches[0].inputsDB.code;
      if (current !== desired && hash(current) !== originalHashes[name])
        throw new Error(`Unrecognised live code: ${id}/${name}; review before changing`);
      matches[0].inputsDB.code = desired;
    }
    plans.push({ id, before, after });
  }
  for (const { id, before, after } of plans) {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      console.log(`${id}: already paced`); continue;
    }
    console.log(`${id}: pace encoding and full decode at 0.25; preserve other flow fields`);
    if (!apply) continue;
    // Refuse an operator change between planning and writing.
    if (JSON.stringify(await read('FlowsJSONDB', id)) !== JSON.stringify(before))
      throw new Error(`${id}: flow changed during review`);
    const backup = `/app/configs/pacing-backup-${Date.now()}-${crypto.randomUUID()}.json`;
    fs.writeFileSync(backup, JSON.stringify({ libraries, flow: before }, null, 2), { mode: 0o600, flag: 'wx' });
    await api({ collection: 'FlowsJSONDB', mode: 'update', docID: id, obj: after });
    if (JSON.stringify(await read('FlowsJSONDB', id)) !== JSON.stringify(after))
      throw new Error(`${id}: readback differs; backup ${backup}`);
    console.log(`${id}: verified; backup ${backup}`);
  }
  console.log('Existing workers retain their current command; verify the next worker and concurrent Plex playback.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
