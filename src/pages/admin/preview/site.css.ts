// The CMS preview pane loads the site's own stylesheet from a stable URL
// (admin/preview/site.css), so Astro's hashed CSS names never matter.
// The font URL is resolved by Vite, base path included.
import css from '../../../styles/a.css?raw';
import font from '../../../assets/fonts/Bricolage.woff2?url';

const fontRef = 'url(../assets/fonts/Bricolage.woff2)';
if (!css.includes(fontRef)) throw new Error('CMS preview: the @font-face URL in a.css changed; update site.css.ts');

export function GET() {
  return new Response(css.replace(fontRef, `url(${font})`), { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
}
