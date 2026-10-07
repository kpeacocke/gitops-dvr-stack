const fs = require('node:fs');
const key = JSON.parse(fs.readFileSync('/app/configs/Tdarr_Node_Config.json')).apiKey;
async function api(data) {
  const response = await fetch('http://127.0.0.1:8266/api/v2/cruddb', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'x-api-key': key},
    body: JSON.stringify({data}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Tdarr HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
(async () => {
  const backup = fs.mkdtempSync('/app/configs/metadata-exclusions-');
  for (const id of ['ds920-tv', 'ds920-movies']) {
    const query = {collection: 'LibrarySettingsJSONDB', mode: 'getById', docID: id};
    const old = await api(query);
    if (old?._id !== id) throw new Error(`Missing library ${id}`);
    fs.writeFileSync(`${backup}/${id}.json`, JSON.stringify(old, null, 2), {mode: 0o600});
    const filters = (old.foldersToIgnore || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!filters.includes('/@eaDir')) filters.push('/@eaDir');
    await api({...query, mode: 'update', obj: {...old, foldersToIgnore: filters.join(',')}});
    const saved = await api(query);
    for (const field of ['flowId', 'schedule', 'processLibrary', 'processTranscodes', 'folder']) {
      if (JSON.stringify(saved[field]) !== JSON.stringify(old[field])) throw new Error(`Unexpected ${field} change: ${id}`);
    }
    if (saved.foldersToIgnore !== filters.join(',')) throw new Error(`Filter verification failed: ${id}`);
    console.log(JSON.stringify({id, foldersToIgnore: saved.foldersToIgnore, flowId: saved.flowId, otherSettingsPreserved: true}));
  }
  console.log('BACKUP', backup);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
