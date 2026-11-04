import { rm } from 'node:fs/promises';
for (const path of ['dist', '.astro', 'node_modules/.astro']) await rm(path, { recursive: true, force: true });
