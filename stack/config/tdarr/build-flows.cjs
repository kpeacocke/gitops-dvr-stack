const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const flow = JSON.parse(read('sdr-hevc-flow.json'));
for (const [id, name] of [['eligible','eligibility'],['encode','encode'],['validate','validate'],['health','health']])
  flow.flowPlugins.find(p => p.id === id).inputsDB.code = read(`${name}.js`);
fs.writeFileSync(path.join(__dirname, 'sdr-hevc-flow.json'), JSON.stringify(flow, null, 2) + '\n');
let code = read('backlog-audit.js');
for (const name of ['eligibility', 'encode', 'validate', 'health'])
  code = code.replace(`/* EMBED_${name.toUpperCase()} */ null`,
    `(() => { const module = { exports: {} };\n${read(`${name}.js`)}\nreturn module.exports; })()`);
const audit = { name: 'DS920 backlog audit and disposition regression',
  description: 'Pilot only. Read-only inventory classification and short QSV regression outputs in cache. Never replaces originals or mutates production queues.',
  tags: 'DS920,audit', flowPlugins: [
    { name: 'Input file', sourceRepo: 'Community', pluginName: 'inputFile', version: '1.0.0', id: 'input', position: {x:300,y:100}, inputsDB: {} },
    { name: 'Assess backlog and verify dispositions', sourceRepo: 'Community', pluginName: 'customFunction', version: '1.0.0', id: 'audit', position: {x:300,y:250}, inputsDB: {code} }
  ], flowEdges: [{source:'input',sourceHandle:'1',target:'audit',targetHandle:null,id:'audit-edge'}] };
fs.writeFileSync(path.join(__dirname, 'backlog-audit-flow.json'), JSON.stringify(audit, null, 2) + '\n');
