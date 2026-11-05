# Content and CMS

Every piece of visitor-facing text, every image, fact and list comes from content files under `src/content/`. Colleagues edit them in [Sveltia CMS](https://sveltiacms.app/) at `/admin/`, and layout stays in code.

## Collections

| Collection | Editors control |
|---|---|
| `site` · Vefurinn | Navigation, shared labels, visiting facts, contact details, footer and partner names |
| `pages` · Síður | Page headings and introductions, homepage sections, images with alt text, visiting and about text |
| `machines` · Tæki | Name, description, category, quantity, room, image, sourced specs, uses, draft checklist, related machines |
| `categories` · Flokkar | Display name, short description, image (the nine identifiers are fixed) |
| `courses` · Námskeið | Title, description, date and time, seats, language, category, registration, prerequisites |
| `projects` · Smíðað í Sögu | Title, description, maker, category, date, image, machines used, project sections |
| `news` · Fréttir | Title, description, date, image, category, article text |

Editors choose a **category**, not a shape or colour. The sublogo, category shapes and colours, page composition, typography, spacing and footer band are fixed in components and CSS.

Some limits keep pages calm:
- Machine pages show at most six short spec rows, five checklist items and three related machines.
- Policies stay visibly marked **Drög** (draft) until lab policy is approved.
- Uploads are raster images in `src/assets/uploads/`, converted to WebP, at most 2048 × 2048 px and 2 MB, and each needs alt text.
- Category photos on the homepage wall are toned automatically at build time (`npm run tone`, `scripts/mural-tone.mjs`): ink → the category's existing colour → paper. Replacing a category photo is enough. There's no extra field, and other uses of the photo keep the original.
- Markdown is limited to prose, headings, lists, emphasis and links. Raw HTML, tables and inline images fail the build.

## Schema → CMS config

`src/lib/content-model.mjs` defines the schemas, which also carry the Icelandic field labels. `public/admin/config.yml` is generated from it, so don't edit the YAML by hand:

```sh
npm run cms:sync   # regenerate config.yml
npm run cms:check  # verify config.yml matches the schemas
```

## Preview

The pane beside the editor shows the entry as it will look on the site: same stylesheet, font and page markup, content only (no header, menu or footer). It updates as you type, and new uploads show straight away.

- `public/admin/preview/preview.js` holds one template per collection, plain JavaScript using Sveltia's `CMS.registerPreviewTemplate` and the `html` tagged template. It's loaded after `sveltia-cms.js` in `public/admin/index.html`.
- `src/pages/admin/preview/site.css.ts` serves `src/styles/a.css` at the stable URL `admin/preview/site.css`, with the font URL resolved by the build, so hashed asset names and the base path (`/`, `/website/`, `/fablab-saga/v3/`) don't matter.
- Labels, category names and machine titles come from the other entries through Sveltia's `getCollection`, so the preview uses the same copy as the site.

Each template names the page it copies (`news · src/pages/frettir/[news].astro`). **When you change a page's markup or classes, make the same change in its template.** `npm test` runs `scripts/check-cms-preview.mjs`, which fails if a collection has no template, a template reads a field the schema doesn't have, a site label is missing, or the copied category identity or palette drifts from `src/lib/identity.ts` and `a.css`. It can't see layout drift; compare the preview with the built page after a layout change.

Two places are approximations: the homepage wall photos are toned in the browser with an SVG filter (the site uses build-time tones from `scripts/mural-tone.mjs`), and the wall shows its as-built arrangement. The pane is narrower than a desktop window, so it shows the site's narrow-screen layout.

## Editing locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4321/admin/` in Chrome or Edge, choose **Work with Local Repository** and select this repository's folder. Edits save to the files and the dev server reloads. Nothing is committed for you. (Local mode needs the File System Access API, which Firefox does not provide. The hosted GitHub sign-in works in any modern browser.)

## Editing online

The CMS signs editors in with their GitHub accounts. Write access to this repository is the permission. Because the site is static, a small authentication Worker (Sveltia CMS Authenticator on Cloudflare Workers) exchanges the GitHub OAuth code. Its URL is `backend.base_url` in the CMS config.

## Build

```sh
npm run check   # astro check
npm test        # content, CMS and Markdown checks
npm run build   # static output in dist/
```
