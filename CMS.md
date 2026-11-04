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
- Markdown is limited to prose, headings, lists, emphasis and links. Raw HTML, tables and inline images fail the build.

## Schema → CMS config

`src/lib/content-model.mjs` defines the schemas, which also carry the Icelandic field labels. `public/admin/config.yml` is generated from it, so don't edit the YAML by hand:

```sh
npm run cms:sync   # regenerate config.yml
npm run cms:check  # verify config.yml matches the schemas
```

## Editing locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4321/admin/` in Chrome or Edge, choose **Work with Local Repository** and select this repository's folder. Edits save to the files and the dev server reloads. Nothing is committed for you. (Local mode needs the File System Access API, which Firefox does not provide. The hosted GitHub sign-in works in any modern browser.)

## Editing online

The CMS signs editors in with their GitHub accounts. Write access to this repository is the permission. Because the site is static, a small authentication Worker (Sveltia CMS Authenticator on Cloudflare Workers) exchanges the GitHub OAuth code. Its URL is `backend.base_url` in the CMS config, and the setup is still being completed.

## Build

```sh
npm run check   # astro check
npm test        # content, CMS and Markdown checks
npm run build   # static output in dist/
```
