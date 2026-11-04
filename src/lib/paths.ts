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
