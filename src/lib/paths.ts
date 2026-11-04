import type { ImageMetadata } from 'astro';
const uploads = import.meta.glob<{ default: ImageMetadata }>('/src/assets/uploads/*.{png,jpg,jpeg,webp}', { eager: true });
export function imageSource(path: string): ImageMetadata {
  const asset = uploads[path]?.default;
  if (!asset) throw new Error(`Unknown editorial image: ${path}`);
  return asset;
}
export function url(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}
// Mural tone: build-time toned copies of category photos (scripts/mural-tone.mjs).
const toned = import.meta.glob<{ default: ImageMetadata }>('/src/assets/toned/*.png', { eager: true });
export function tonedSource(path: string, colour: string): ImageMetadata {
  const name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  const asset = toned[`/src/assets/toned/${name}--${colour}.png`]?.default;
  if (!asset) throw new Error(`Missing mural tone for ${path} (${colour}); run scripts/mural-tone.mjs`);
  return asset;
}
