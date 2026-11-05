import { writeFile, readFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { stringify } from 'yaml';
import { jsonSchemas, collectionLabels } from '../src/lib/content-model.mjs';

function field(name, s, required = true) {
  while (s.anyOf) s = s.anyOf.find(part => part.type !== 'null');
  const f = { name, label: s.label || name, required, ...(s.maxItems !== undefined ? { max: s.maxItems } : {}) };
  if (s.const !== undefined) return { ...f, widget: 'hidden', default: s.const };
  if (s.enum) return { ...f, widget: 'select', options: s.enum };
  if (s.type === 'object') return { ...f, widget: 'object', fields: fields(s) };
  if (s.type === 'array') {
    if (s.items.type === 'object') return { ...f, widget: 'list', fields: fields(s.items) };
    return { ...f, widget: 'list', field: field('value', s.items) };
  }
  if (s.type === 'boolean') return { ...f, widget: 'boolean' };
  if (s.type === 'integer' || s.type === 'number') return { ...f, widget: 'number', value_type: s.type === 'integer' ? 'int' : 'float', min: s.minimum };
  if (name === 'body') return { ...f, widget: 'markdown' };
  if (s.widget === 'image') return { ...f, widget: 'image', pattern: [s.editorPattern, 'Veldu mynd úr myndasafninu.'], media_library: { config: { max_file_size: 2000000 } } };
  return { ...f, widget: s.widget || 'string', ...(s.pattern ? { pattern: [s.pattern, 'Athugaðu snið gildisins.'] } : {}) };
}
function fields(s) { return Object.entries(s.properties).map(([name, value]) => field(name, value, s.required?.includes(name) || false)); }
const config = {
  backend: { name: 'github', repo: 'FabLab-Saga/website', branch: 'main', base_url: 'https://sveltia-cms-auth.magnus-588.workers.dev' },
  publish_mode: 'editorial_workflow',
  logo: { src: '../favicon.svg' },
  media_folder: 'src/assets/uploads',
  public_folder: '/src/assets/uploads',
  media_libraries: { default: { config: { max_file_size: 2000000, transformations: { raster_image: { format: 'webp', width: 2048, height: 2048, quality: 85 } } } } },
  collections: Object.entries(jsonSchemas).map(([name, schema]) => name === 'site' ? {
    name, label: collectionLabels[name], files: [{ name: 'is', label: 'Íslenska', file: 'src/content/site/is.yaml', fields: fields(schema) }],
  } : {
    name, label: collectionLabels[name], folder: `src/content/${name}/is`,
    create: !['categories','pages'].includes(name), delete: !['categories','pages'].includes(name),
    extension: 'md', format: 'yaml-frontmatter', slug: '{{slug}}',
    fields: fields(schema),
  }),
};
await mkdir('public/admin', { recursive: true });
await writeFile('public/admin/config.yml', `# Generated from src/lib/content-model.mjs by npm run cms:sync.
# Sign-in goes through the sveltia-cms-auth Worker (Cloudflare).
# Sveltia uses its native local-repository picker, not Decap local_backend.
` + stringify(config));
let bundle = await readFile('node_modules/@sveltia/cms/dist/sveltia-cms.js', 'utf8');
for (const font of JSON.parse(await readFile('scripts/cms-fonts.json','utf8'))) {
  if (!bundle.includes(font.url)) throw new Error(`Pinned CMS font URL changed: ${font.name}`);
  bundle = bundle.replaceAll(font.url,font.local);
}
await writeFile('public/admin/sveltia-cms.js',bundle);
await cp('node_modules/@sveltia/cms/dist/chunks', 'public/admin/chunks', { recursive: true });
await copyFile('node_modules/@sveltia/cms/LICENSE.txt', 'public/admin/LICENSE.txt');
console.log(`Generated ${config.collections.length} collections; copied pinned Sveltia bundle.`);
