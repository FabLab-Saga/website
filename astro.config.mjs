import { defineConfig } from 'astro/config';
import remarkContent from './src/lib/remark-content.mjs';
import { unified } from '@astrojs/markdown-remark';

export default defineConfig({
  output: 'static',
  site: 'https://fablabsaga.hi.is', // Assumed hostname; no launch is configured.
  base: process.env.PREVIEW_BASE || '/',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  i18n: { defaultLocale: 'is', locales: ['is', 'en'], routing: { prefixDefaultLocale: false } },
  markdown: { syntaxHighlight: false, processor: unified({ remarkPlugins: [remarkContent] }) },
});
