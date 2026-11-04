// Build-time "mural tone" for the homepage wall photos.
//
// For every category that has a wall photo, the photo is grey-scaled,
// normalised and mapped ink -> category colour -> paper. The colour comes from
// the locked category identity (src/lib/identity.ts) and the hex value from the
// palette tokens in src/styles/a.css, so nothing here adds a colour. Editors do
// nothing: replace a category's image in the CMS and the next build tones it.
//
// Output: src/assets/toned/<upload-basename>--<colour>.png (lossless; Astro's
// image pipeline then makes the WebP widths). Generated, never committed.
import { readFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import sharp from 'sharp';
import { parse } from 'yaml';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'src/assets/toned');

const css = await readFile(join(root, 'src/styles/a.css'), 'utf8');
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b`));
  if (!m) throw new Error(`palette token --${name} not found in a.css`);
  return '#' + (m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]);
};
const identity = await readFile(join(root, 'src/lib/identity.ts'), 'utf8');
const colourOf = (cat) => {
  const m = identity.match(new RegExp(`\\b${cat}:\\s*\\{[^}]*colour:\\s*'([a-z]+)'`));
  if (!m) throw new Error(`category ${cat} has no colour in identity.ts`);
  return m[1];
};

const INK = rgb(token('ink'));
const PAPER = rgb(token('bg'));
function rgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y) / 100;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

async function tone(input, output, hex) {
  const C = rgb(hex);
  // the colour stop sits at the colour's own lightness, so the map is
  // monotonic for light (pink, yellow) and dark (blue) inks alike
  const t0 = Math.min(0.8, Math.max(0.25, (Lstar(lum(C)) - Lstar(lum(INK))) / (Lstar(lum(PAPER)) - Lstar(lum(INK)))));
  const lut = Array.from({ length: 256 }, (_, v) => {
    const t = v / 255;
    return t < t0 ? mix(INK, C, t / t0) : mix(C, PAPER, (t - t0) / (1 - t0));
  });
  const { data, info } = await sharp(input).resize({ width: 1600, withoutEnlargement: true })
    .grayscale().normalise({ lower: 2, upper: 98 }).raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) px.set(lut[data[i]], i * 3);
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(output);
  return `${info.width}x${info.height} stop ${t0.toFixed(2)}`;
}

await mkdir(out, { recursive: true });
const wanted = new Set();
const catDir = join(root, 'src/content/categories/is');
for (const file of (await readdir(catDir)).filter((f) => f.endsWith('.md'))) {
  const cat = basename(file, '.md');
  const fm = (await readFile(join(catDir, file), 'utf8')).match(/^---\n([\s\S]*?)\n---/);
  const data = fm ? parse(fm[1]) : {};
  if (!data?.image?.src) continue;
  const src = join(root, data.image.src.replace(/^\//, ''));
  const colour = colourOf(cat);
  const name = `${basename(src, extname(src))}--${colour}.png`;
  const dest = join(out, name);
  wanted.add(name);
  if (existsSync(dest) && (await stat(dest)).mtimeMs >= (await stat(src)).mtimeMs) { console.log('tone (cached)', cat, name); continue; }
  console.log('tone', cat, name, await tone(src, dest, token(colour)));
}
for (const f of await readdir(out)) if (!wanted.has(f)) await rm(join(out, f));
