import { readdir, readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { schemas, categoryIds } from '../src/lib/content-model.mjs';

const result = {};
function safeText(value) {
  if (typeof value === 'string') assert(!/<\/?[a-z]|javascript:|data:text\/html/i.test(value), 'Executable content is not allowed');
  else if (Array.isArray(value)) value.forEach(safeText);
  else if (value && typeof value === 'object') Object.values(value).forEach(safeText);
}
function images(value, all = []) {
  if (typeof value === 'string' && value.startsWith('/src/assets/')) all.push(value);
  else if (Array.isArray(value)) value.forEach(v => images(v, all));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => images(v, all));
  return all;
}
const entries = {};
for (const [name, schema] of Object.entries(schemas)) {
  const dir = name === 'site' ? 'src/content/site' : `src/content/${name}/is`;
  entries[name] = [];
  for (const file of await readdir(dir)) {
    const raw = await readFile(`${dir}/${file}`, 'utf8');
    const match = file.endsWith('.md') ? raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) : null;
    const data = match ? { ...parse(match[1]), body: match[2].trim() } : parse(raw);
    const parsed = schema.parse(data); safeText(data);
    for (const image of images(data)) assert((await stat('.' + image)).isFile(), image);
    entries[name].push({ id: file.replace(/\.(md|yaml)$/, ''), data: parsed });
  }
  result[name] = entries[name].length;
}
assert.deepEqual(entries.categories.map(x => x.id).sort(), [...categoryIds].sort());
const requiredPages = ['home','taeki','heimsokn','namskeid','smidad','frettir','um'];
assert.deepEqual(entries.pages.map(p=>p.id).sort(), [...requiredPages].sort());
for (const machine of entries.machines) {
  assert(machine.data.specs.length <= 4 && machine.data.checklist.length <= 5);
  for (const id of machine.data.related) assert(id !== machine.id && entries.machines.some(m=>m.id === id), `Unknown related machine: ${machine.id}/${id}`);
}
// Inventory provenance: SagaModel/MACHINES.md rows EasyPress and LOKLiK explicitly
// call generation/model unknown or assumed. Render stand-ins are not installation proof.
for(const [id,title,quantity] of [['easypress','Cricut EasyPress [gerð]',2],['loklik','LOKLiK hitapressa [gerð]',1]]) {
  const {data}=entries.machines.find(m=>m.id===id);
  assert.equal(data.modelConfirmed,false,`${id}: inventory marks exact model unconfirmed`);
  assert.equal(data.title,title);assert.equal(data.quantity,quantity);assert.equal(data.category,'hitapressur');
  assert.match(data.source,/óstaðfest/i);
}
for (const project of entries.projects) for (const id of project.data.machines) assert(entries.machines.some(m=>m.id===id), `Unknown project machine: ${id}`);
const exampleProject=entries.projects.find(p=>p.id==='verkefni').data;
for(const category of [undefined,null,''])assert.equal(schemas.projects.parse({...exampleProject,category}).category,undefined);
for(const category of categoryIds)assert.equal(schemas.projects.parse({...exampleProject,example:false,category}).category,category);
const uncategorized=schemas.projects.safeParse({...exampleProject,example:false,category:undefined});
assert.equal(uncategorized.success,false);
assert(uncategorized.error.issues.some(issue=>issue.path.join('.')==='category'));
assert.throws(()=>schemas.projects.parse({...exampleProject,category:'not-a-category'}));
const homepage = entries.pages.find(p => p.id === 'home').data;
for (const item of homepage.news.featured) assert(entries[item.collection].some(e => e.id === item.entry));
for (const c of ['hero', 'about', 'equipment', 'news', 'partners']) assert(homepage[c], `Missing homepage ${c}`);
for (const file of await readdir('src/assets/uploads')) {
  assert(/^[a-zA-Z0-9_-]+\.(png|webp|jpe?g)$/.test(file), `Unsafe upload: ${file}`);
  assert((await stat(`src/assets/uploads/${file}`)).size <= 2_000_000, `Oversize upload: ${file}`);
}
for (const mutation of [data => data.category = 'not-a-category', data => data.quantity = 0, data => data.policyDraft = false]) {
  const invalid = structuredClone(entries.machines[0].data);
  mutation(invalid); assert.throws(() => schemas.machines.parse(invalid));
}
// These are actual Sveltia serialization forms, not permission to drop required data.
const visit = entries.pages.find(p => p.id === 'heimsokn').data;
const savedVisit = schemas.pages.parse({ ...visit, hero: null, about: null, equipment: null, news: null, partners: null });
assert.equal(savedVisit.hero, undefined); assert.deepEqual(savedVisit.blocks, visit.blocks);
const course = entries.courses[0].data;
assert.equal(schemas.courses.parse({ ...course, signup: '' }).signup, undefined);
assert.throws(() => schemas.courses.parse({ ...course, signup: 'javascript:alert(1)' }));
const emptyMachine = schemas.machines.parse({ ...entries.machines[0].data, specs: null, related: null });
assert.deepEqual(emptyMachine.specs, []); assert.deepEqual(emptyMachine.related, []);
assert.throws(() => schemas.machines.parse({ ...emptyMachine, image: null }));
for(const src of ['photo.webp','../photo.webp','/src/assets/uploads/../photo.webp','https://example.com/photo.webp','/src/assets/uploads/photo.svg','blob:123']) {
  const result=schemas.machines.safeParse({...emptyMachine,image:{...emptyMachine.image,src}});
  assert.equal(result.success,false,`Unsafe committed image path: ${src}`);
  assert(result.error.issues.some(issue=>issue.path.join('.')==='image.src' && issue.code==='invalid_format'));
}
assert.throws(() => schemas.pages.parse({ ...visit, title: null }));
console.log('PASS: CMS null/empty normalization preserves required fields and unsafe-URL rejection.');
console.log('PASS: schema validation, image paths, media limits, no executable content, category IDs and featured references.', JSON.stringify(result));
