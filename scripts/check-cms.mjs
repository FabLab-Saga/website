import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { jsonSchemas } from '../src/lib/content-model.mjs';

// Independent comparison: introspect the actual Zod schemas used by Astro,
// then read the emitted YAML. Do not compare the generator with itself.
const config = parse(await readFile('public/admin/config.yml', 'utf8'));
let checkedFields = 0;
function compare(schema, fields, path) {
  assert.deepEqual(fields.map(f => f.name).sort(), Object.keys(schema.properties).sort(), `${path}: fields`);
  for (const [name, raw] of Object.entries(schema.properties)) {
    let def = raw;
    while (def.anyOf) def = def.anyOf.filter(part => part.type !== 'null')[0];
    checkedFields++;
    const field = fields.find(f => f.name === name);
    const key = `${path}.${name}`;
    assert.equal(field.label, def.label, `${key}: Icelandic label`);
    assert.equal(field.required, schema.required?.includes(name) || false, `${key}: required`);
    if (def.const !== undefined) { assert.equal(field.default, def.const, `${key}: constant`); continue; }
    if (def.enum) { assert.equal(field.widget, 'select', key); assert.deepEqual(field.options, def.enum, key); continue; }
    const widget = { object: 'object', array: 'list', boolean: 'boolean', integer: 'number', number: 'number', string: name === 'body' ? 'markdown' : (def.widget || 'string') }[def.type];
    assert.equal(field.widget, widget, `${key}: widget type`);
    if (def.pattern) assert.equal(field.pattern?.[0], def.widget === 'image' ? def.editorPattern : def.pattern, `${key}: pattern`);
    if (def.type === 'object') compare(def, field.fields, key);
    if (def.type === 'number' || def.type === 'integer') assert.equal(field.min, def.minimum, `${key}: minimum`);
    if (def.type === 'array') {
      assert.equal(field.max, def.maxItems, `${key}: maximum list length`);
      if (def.items.type === 'object') compare(def.items, field.fields, key + '[]');
      else assert.equal(field.field.widget, def.items.widget || 'string', `${key}: item widget`);
    }
  }
}
function validate(c) {
  assert.deepEqual(c.collections.map(x => x.name).sort(), Object.keys(jsonSchemas).sort());
  for (const collection of c.collections) {
    if (collection.name === 'site') assert.equal(collection.files[0].file, 'src/content/site/is.yaml');
    else assert.equal(collection.folder, `src/content/${collection.name}/is`);
    compare(jsonSchemas[collection.name], collection.fields || collection.files[0].fields, collection.name);
  }
  assert.equal(c.backend.repo, 'FabLab-Saga/website');
  assert.equal(c.backend.branch, 'main');
  assert.equal(c.backend.base_url, 'https://auth-not-configured.invalid');
  assert.equal(c.media_folder, 'src/assets/uploads');
  assert.equal(c.public_folder, '/src/assets/uploads');
}
validate(config);
const count = checkedFields;
// Prove the checker detects omissions, nested drift and incompatible widgets.
for (const mutate of [
  c => c.collections.pop(),
  c => c.collections.find(x => x.name === 'machines').fields.find(f => f.name === 'specs').max = 30,
  c => c.collections.find(x => x.name === 'machines').fields.find(f => f.name === 'checklist').max = 30,
  c => c.collections.find(x => x.name === 'machines').fields.find(f => f.name === 'image').fields.pop(),
  c => c.collections[0].files[0].fields.pop(),
  c => c.collections[0].files[0].fields.find(f => f.name === 'labels').fields.pop(),
  c => c.collections.find(x => x.name === 'machines').fields.find(f => f.name === 'quantity').widget = 'string',
]) { const bad = structuredClone(config); mutate(bad); assert.throws(() => validate(bad)); }
// Reject a regression to committed-path-only validation and accidental removal.
for (const pattern of [jsonSchemas.machines.properties.image.properties.src.pattern, undefined]) {
  const bad=structuredClone(config);
  const field=bad.collections.find(c=>c.name==='machines').fields.find(f=>f.name==='image').fields.find(f=>f.name==='src');
  field.pattern=pattern?[pattern,'Invalid']:undefined;
  assert.throws(()=>validate(bad),/machines.image.src: pattern/);
}
const widget=config.collections.find(c=>c.name==='machines').fields.find(f=>f.name==='image').fields.find(f=>f.name==='src');
const pattern=new RegExp(widget.pattern[0]);
for(const value of ['photo.webp','photo-2.png','/src/assets/uploads/photo.webp'])assert(pattern.test(value),value);
for(const value of ['../photo.webp','/elsewhere/photo.webp','https://example.com/photo.webp','blob:123','photo.svg','photo.exe','photo webp'])assert(!pattern.test(value),value);
console.log(`PASS: ${config.collections.length} collections, ${count} fields; 9 schema-drift mutations rejected; temporary upload filenames accepted, unsafe paths rejected.`);
