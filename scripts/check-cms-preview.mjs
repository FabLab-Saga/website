// The CMS preview templates (public/admin/preview/preview.js) copy layout from
// src/pages/ and a few identity constants. Catch the drift a code change can cause.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { jsonSchemas } from '../src/lib/content-model.mjs';

const js = await readFile('public/admin/preview/preview.js', 'utf8');
const html = await readFile('public/admin/index.html', 'utf8');
const css = await readFile('src/styles/a.css', 'utf8');
const identity = await readFile('src/lib/identity.ts', 'utf8');
const props = (schema) => Object.keys(schema.properties);

// Loaded after Sveltia, from a relative URL (works under any base path).
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(scripts, ['./sveltia-cms.js', './preview/preview.js'], 'admin/index.html script order');
assert.match(js, /registerPreviewStyle\(new URL\('site\.css', document\.currentScript\.src\)/, 'preview stylesheet URL');

// Every collection has a template, and each template reads only fields its schema has.
const parts = js.split("CMS.registerPreviewTemplate('").slice(1);
// The site collection is a file collection; its template is keyed by the file name.
const siteFile = (await readFile('public/admin/config.yml', 'utf8')).match(/- name: site\n(?:.*\n)*?\s+files:\n\s+- name: (\w+)/)[1];
const templates = parts.map(part => part.slice(0, part.indexOf("'"))).map(name => (name === siteFile ? 'site' : name));
assert.deepEqual([...templates].sort(), Object.keys(jsonSchemas).sort(), 'one preview template per collection');
let fields = 0;
parts.forEach((part, i) => {
  const known = props(jsonSchemas[templates[i]]);
  for (const [, name] of part.matchAll(/\bp\.(\w+)/g)) { fields++; assert(known.includes(name), `${templates[i]} preview reads unknown field p.${name}`); }
});
const labels = props(jsonSchemas.site.properties.labels);
const used = new Set([...js.matchAll(/labels\??\.(\w+)/g)].map(m => m[1]));
for (const name of used) assert(labels.includes(name), `preview uses unknown site label ${name}`);

// Identity and palette copies.
const order = JSON.parse(identity.match(/categoryOrder = (\[[^\]]+\])/)[1].replaceAll("'", '"'));
assert.deepEqual(JSON.parse(js.match(/categoryOrder = (\[[^\]]+\])/)[1].replaceAll("'", '"')), order, 'categoryOrder');
for (const id of order) {
  const [, shape, colour] = identity.match(new RegExp(`\\b${id}: \\{ shape: '([\\w-]+)', colour: '(\\w+)' \\}`));
  assert.match(js, new RegExp(`\\b${id}: \\['${shape}', '${colour}'\\]`), `categoryStyle.${id}`);
}
for (const [, name, hex] of js.match(/palette = \{([^}]+)\}/)[1].matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,6})\\b`));
  const token = m[1].length === 4 ? '#' + [...m[1].slice(1)].map(c => c + c).join('') : m[1];
  assert.equal(hex.toLowerCase(), token.toLowerCase(), `palette.${name}`);
}
console.log(`PASS: ${templates.length} preview templates, ${fields} field reads, ${used.size} site labels, identity and palette match.`);
