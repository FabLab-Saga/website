// Pre-launch report: images flagged as placeholders and [bracketed] stand-in text.
// Always exits 0; it lists what remains to be replaced.
import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { collectionLabels } from '../src/lib/content-model.mjs';

const bracket = /\[([^\]\n]+)\](?!\()/g;
const label = (path) => path.join('.').replace(/\.(\d+)(?=\.|$)/g, '[$1]');

function walk(value, path, found) {
  if (Array.isArray(value)) value.forEach((item, i) => walk(item, [...path, i], found));
  else if (value && typeof value === 'object') {
    if (typeof value.src === 'string' && value.placeholder === true) found.images.push(`${label(path)}: ${value.src.split('/').pop()}`);
    for (const [key, item] of Object.entries(value)) if (key !== 'placeholder') walk(item, [...path, key], found);
  } else if (typeof value === 'string') {
    for (const [match] of value.matchAll(bracket)) found.text.push(`${label(path)}: ${match}`);
  }
}

const totals = { images: 0, text: 0 };
const out = [];
for (const name of Object.keys(collectionLabels)) {
  const dir = name === 'site' ? 'src/content/site' : `src/content/${name}/is`;
  const section = [];
  for (const file of (await readdir(dir)).sort()) {
    const raw = await readFile(`${dir}/${file}`, 'utf8');
    const match = file.endsWith('.md') ? raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/) : null;
    const data = match ? { ...parse(match[1]), body: match[2] } : parse(raw);
    const found = { images: [], text: [] };
    walk(data, [], found);
    if (!found.images.length && !found.text.length) continue;
    totals.images += found.images.length; totals.text += found.text.length;
    section.push(`  ${file.replace(/\.(md|yaml)$/, '')}${data.title ? ` · ${data.title}` : ''}`);
    for (const line of found.images) section.push(`    mynd   ${line}`);
    for (const line of found.text) section.push(`    texti  ${line}`);
  }
  if (section.length) out.push(`${collectionLabels[name]} (${name})`, ...section, '');
}
out.push(`Bráðabirgðamyndir: ${totals.images}`, `Textar í hornklofum: ${totals.text}`);
console.log(out.join('\n'));
