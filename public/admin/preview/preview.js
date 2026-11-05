// Fab Lab SAGA · CMS preview templates.
//
// Each template mirrors a page in src/pages/ (same elements, same class names),
// and the pane loads the site's stylesheet, so an entry previews as it will look
// on the site. Content only: no header, navigation or footer.
// When a page layout changes in src/pages/ or src/components/, change its
// template here too (see CMS.md, "Preview").
(() => {
  const { CMS, html } = window;
  const { useState, useEffect } = CMS.React;

  CMS.registerPreviewStyle(new URL('site.css', document.currentScript.src).href);

  // Locked identity, copied from src/lib/identity.ts and the palette in
  // src/styles/a.css. scripts/check-cms-preview.mjs fails if they drift.
  const categoryOrder = ['laser', 'fraesi', 'prent', 'rafeinda', 'skurdur', 'formmotun', 'textill', 'hitapressur', 'skanni'];
  const categoryStyle = {
    laser: ['r-tl', 'pink'], fraesi: ['sq', 'orange'], prent: ['half-up', 'red'], rafeinda: ['circle', 'red'],
    skurdur: ['r-tr', 'yellow'], formmotun: ['half', 'blue'], textill: ['r-bl', 'pink'], hitapressur: ['arch', 'green'],
    skanni: ['r-br', 'blue'],
  };
  const palette = { ink: '#111111', bg: '#EDEBE6', red: '#E03A3F', green: '#009967', blue: '#1245DE', orange: '#FFA13D', yellow: '#F2C200', pink: '#E099AB' };

  // Site links open the built site in a new tab (the pane's <base> targets _blank).
  const siteRoot = new URL('../', location.href).pathname;
  const url = (path) => (path?.startsWith('/') && !path.startsWith('//') ? siteRoot + path.slice(1) : path);
  const cx = (...names) => names.filter(Boolean).join(' ');

  // Other entries (site labels, category names, machine titles), read through
  // Sveltia's getCollection. Cached per page load and refreshed on each mount.
  let cache;
  const toJS = (value) => (value?.toJS ? value.toJS() : value);
  async function loadAll(getCollection) {
    const names = ['site', 'categories', 'machines', 'news', 'courses', 'projects'];
    const lists = await Promise.all(names.map((name) => getCollection(name).catch(() => [])));
    const out = {};
    names.forEach((name, i) => {
      out[name] = Object.fromEntries((lists[i] || []).map((e) => [e.get('slug'), toJS(e.get('data'))]).sort(([a], [b]) => a.localeCompare(b)));
    });
    out.site = Object.values(out.site)[0];
    return out;
  }
  function useSite(getCollection) {
    const [data, setData] = useState(cache);
    useEffect(() => {
      let live = true;
      loadAll(getCollection).then((d) => { cache = d; if (live) setData(d); }, console.error);
      return () => { live = false; };
    }, []);
    return data;
  }

  // Wraps a template: entry data as a plain object, shared data when loaded.
  const page = (render) => (props) => {
    const ctx = useSite(props.getCollection);
    if (!ctx?.site) return null;
    const p = toJS(props.entry.get('data')) || {};
    // getAsset gives a blob URL (also for a new, unsaved upload); before the file
    // is read it gives the repository path, which 404s on the site: leave src empty.
    const src = (image) => {
      const asset = image?.src && String(props.getAsset(image.src) ?? '');
      return /^(blob:|data:|https?:)/.test(asset) || (asset && asset !== image.src) ? asset : undefined;
    };
    const body = (p.body || '').trim() ? props.widgetFor('body') : null;
    return html`<main id="efni">${render({ ...ctx, s: ctx.site, p, slug: props.entry.get('slug'), src, body })}</main>`;
  };

  // Components (src/components/*.astro)
  const Photo = ({ image, src, eager }) =>
    image?.src ? html`<img src=${src(image)} alt=${image.alt || ''} loading=${eager ? 'eager' : 'lazy'} decoding="async" />` : null;
  const Arrow = () => html`<span aria-hidden="true">→</span>`;
  const More = ({ href, label }) => html`<a className="more" href=${url(href)}>${label} <${Arrow} /></a>`;
  const Marker = ({ category }) => {
    const [shape, colour] = categoryStyle[category] || [];
    return shape ? html`<span className=${cx('mk', shape, `c-${colour}`)} aria-hidden="true" />` : null;
  };
  const PageIntro = ({ p, src, image = p.image, caption = p.imageCaption, composition, meta, children }) => html`
    <header className=${cx('page-intro', (image?.src || composition) && 'has-art')}>
      <div className="intro-text">${meta}<h1>${p.title}</h1><p className="lede">${p.description}</p>${children}</div>
      ${image?.src && html`<figure className="intro-figure"><div className="intro-mask"><${Photo} image=${image} src=${src} eager /></div>${caption && html`<figcaption>${caption}</figcaption>`}</figure>`}
      ${composition && html`<div className="inner-wall" aria-hidden="true"><span className="deco half c-blue span2" /><span className="deco r-br c-yellow" /><span className="deco r-tl c-pink" /><span className="deco sq c-orange" /><span className="deco circle c-green" /></div>`}
    </header>`;
  const SectionTitle = ({ title, children }) => html`<div className="section-title"><h2>${title}</h2>${children}</div>`;
  const Draft = ({ s }) => html`<span className="meta inline-draft"> · ${s.labels.draft}</span>`;
  const VisitInfo = ({ s, more }) => html`
    <dl className="info">
      <div><dt>${s.labels.hours}</dt><dd>${s.visit.hours}</dd></div>
      <div><dt>${s.labels.where}</dt><dd>${s.visit.location}</dd></div>
      <div><dt>${s.labels.access}${s.visit.accessDraft && html`<${Draft} s=${s} />`}</dt><dd>${s.visit.access}</dd></div>
      <div><dt>${s.labels.contact}</dt><dd>${s.visit.email}<br />${s.visit.phone}</dd>${more && html`<dd className="visit-more"><${More} href=${s.visit.more.href} label=${s.visit.more.label} /></dd>`}</div>
    </dl>`;
  const CategoryTiles = ({ categories, machines, descriptions, only = categoryOrder }) => html`
    <ul className=${cx('cats', descriptions && 'category-tiles')}>${only.map((id) => html`<li key=${id}><a href=${url(`/taeki/#${id}`)}>
      <${Marker} category=${id} /><span className="cn">${categories[id]?.title}</span>
      <span className="cq">${Object.values(machines).filter((m) => m.category === id).reduce((n, m) => n + (m.quantity || 0), 0)}</span>
      ${descriptions && html`<span className="category-description">${categories[id]?.description}</span>`}
    </a></li>`)}</ul>`;
  const LightCard = ({ title, image, meta, href, index, src }) => html`
    <article className="card"><div className=${cx('card-image-link', index % 2 === 0 ? 'r-tl' : 'r-tr')}><${Photo} image=${image} src=${src} /></div>
      <p className="meta">${meta}</p><h3><a href=${url(href)}>${title}</a></h3></article>`;
  const kindLabel = (s, n) => (n.kind === 'events' ? s.labels.eventKind : s.labels.newsKind);
  const byTitle = (entries) => Object.entries(entries).sort(([, a], [, b]) => (a.title || '').localeCompare(b.title || '', 'is'));

  // news · src/pages/frettir/[news].astro
  CMS.registerPreviewTemplate('news', page(({ s, p, src, body }) => html`
    <article className="article"><p className="meta">${kindLabel(s, p)} · ${p.date}${!p.published && ` · ${s.labels.draft}`}</p><h1>${p.title}</h1><p className="lede">${p.description}</p>
      <figure className="art-fig r-tl"><${Photo} image=${p.image} src=${src} eager />${p.imageCaption && html`<figcaption>${p.imageCaption}</figcaption>`}</figure>
      <div className="art-body prose">${body}</div><p><${More} href="/frettir/" label=${s.labels.newsBack} /></p>
    </article>`));

  // machines · src/pages/taeki/[machine].astro
  CMS.registerPreviewTemplate('machines', page(({ s, p, slug, src, body, categories, machines }) => {
    const specs = p.specs || [];
    const related = (p.related?.length
      ? p.related.map((id) => [id, machines[id]]).filter(([, m]) => m)
      : Object.entries(machines).filter(([id, m]) => id !== slug && m.category === p.category)).slice(0, 3);
    return html`
      <${PageIntro} p=${p} src=${src} meta=${html`<p className="category-name"><${Marker} category=${p.category} /><a href=${url(`/taeki/#${p.category}`)}>${categories[p.category]?.title}</a></p>`}>
        ${!p.modelConfirmed && html`<p className="meta">${s.labels.modelPending}</p>`}
      </${PageIntro}>
      <section className="content-section detail-pair">
        <div><${SectionTitle} title=${s.labels.specs} /><dl className="specs"><div><dt>${s.labels.quantity}</dt><dd>${p.quantity}</dd></div><div><dt>${s.labels.location}</dt><dd>${p.location}</dd></div>${specs.map((row, i) => html`<div key=${i}><dt>${row.label}</dt><dd>${row.value}${row.note && html`<span className="spec-note">${row.note}</span>`}</dd></div>`)}</dl>${!specs.length && html`<p className="note">${s.labels.factsPending}</p>`}</div>
        <div><${SectionTitle} title=${s.labels.suitable} /><ul className="plain-list">${(p.uses || []).map((use, i) => html`<li key=${i}>${use}</li>`)}</ul><div className="prose">${body}</div></div>
      </section>
      <section className="content-section detail-pair">
        <div><${SectionTitle} title=${s.labels.before}><span className="meta">${s.labels.draft}</span></${SectionTitle}><ul className="checklist">${(p.checklist || []).map((item, i) => html`<li key=${i}>${item}</li>`)}</ul><p className="note">${p.policy}</p></div>
        <div><${SectionTitle} title=${s.labels.courses} /><${More} href="/namskeid/" label=${s.labels.courseLink} /></div>
      </section>
      <section className="content-section"><${SectionTitle} title=${s.labels.related}><${More} href="/taeki/" label=${s.labels.allEquipment} /></${SectionTitle}><ul className="related-list">${related.map(([id, m]) => html`<li key=${id}><a href=${url(`/taeki/${id}/`)}>${m.title}</a></li>`)}</ul></section>`;
  }));

  // projects · src/pages/smidad/[project].astro
  CMS.registerPreviewTemplate('projects', page(({ s, p, src, body, categories, machines }) => {
    const used = byTitle(machines).filter(([id]) => (p.machines || []).includes(id));
    return html`
      <${PageIntro} p=${p} src=${src} meta=${html`<p className="meta">${p.example && `${s.labels.example} · `}${categories[p.category]?.title ?? s.labels.projectCategoryPending}</p>`}><p>${p.maker} · ${p.date}</p></${PageIntro}>
      <section className="content-section detail-pair">${(p.sections || []).map((section, i) => html`<div key=${i}><${SectionTitle} title=${section.title} /><p>${section.text}</p></div>`)}</section>
      ${body && html`<div className="content-section prose">${body}</div>`}
      <section className="content-section"><${SectionTitle} title=${s.labels.projectMachines} />${!used.length && html`<p>${s.labels.projectMachinesEmpty}</p>`}<ul className="related-list">${used.map(([id, m]) => html`<li key=${id}><a href=${url(`/taeki/${id}/`)}>${m.title}</a></li>`)}</ul><p><${More} href="/smidad/" label=${s.labels.projectBack} /></p></section>`;
  }));

  // courses · src/pages/namskeid/[course].astro
  CMS.registerPreviewTemplate('courses', page(({ s, p, src, body, categories }) => html`
    <${PageIntro} p=${p} src=${src} meta=${html`<p className="category-name"><${Marker} category=${p.category} /><span>${categories[p.category]?.title}</span></p>`}>${!p.published && html`<p className="meta">${s.labels.draft}</p>`}</${PageIntro}>
    <section className="content-section detail-pair"><div><dl className="specs"><div><dt>${s.labels.date}</dt><dd>${p.date}</dd></div><div><dt>${s.labels.time}</dt><dd>${p.time}</dd></div><div><dt>${s.labels.seats}</dt><dd>${p.seats}</dd></div><div><dt>${s.labels.language}</dt><dd>${p.language}</dd></div></dl></div>
      <div><${SectionTitle} title=${s.labels.signup} />${p.signup ? html`<a href=${url(p.signup)}>${p.signupText}</a>` : html`<p>${p.signupText}</p>`}<div className="prose">${body}</div></div></section>
    <section className="content-section"><${SectionTitle} title=${s.labels.requirements}><span className="meta">${s.labels.draft}</span></${SectionTitle}><p>${p.policy}</p><p><${More} href="/namskeid/" label=${s.labels.courseBack} /></p></section>`));

  // categories · the category's tile and machine group on /taeki/, and (for the four
  // categories on the homepage wall) its photo as that wall tile
  const heroTiles = { laser: ['r-tl', ''], prent: ['half', 'w2'], fraesi: ['r-tr', 'w2 h2'], textill: ['circle', ''] };
  CMS.registerPreviewTemplate('categories', page(({ p, slug, src, categories, machines }) => {
    const own = byTitle(machines).filter(([, m]) => m.category === slug);
    return html`
      <section className="content-section"><${CategoryTiles} categories=${{ ...categories, [slug]: p }} machines=${machines} descriptions only=${[slug]} /></section>
      <section className="content-section"><div className="inventory-grid"><article className="inventory-group"><h3>${p.title}</h3><ul className="machine-list">${own.map(([id, m]) => html`<li key=${id}><a href=${url(`/taeki/${id}/`)}>${m.title}</a><span className="quantity">×${m.quantity}</span></li>`)}</ul></article></div></section>
      ${p.image?.src && heroTiles[slug] && html`<${ToneFilters} /><section className="wall band-info"><${HeroTile} id=${slug} shape=${heroTiles[slug][0]} span=${heroTiles[slug][1]} categories=${{ [slug]: p }} src=${src} /></section>`}`;
  }));

  // pages · src/pages/{index,um,heimsokn}.astro and the list pages
  CMS.registerPreviewTemplate('pages', page((ctx) => {
    const { s, p, slug, src, body, categories, machines } = ctx;
    if (slug === 'home') return home(ctx);
    const blocks = p.blocks || [];
    if (slug === 'um') return html`
      <${PageIntro} p=${p} src=${src} />
      <div className="content-section detail-pair about-copy">${blocks.map((b, i) => html`<div key=${i}>${b.title && html`<div className="section-title"><h2>${b.title}</h2></div>`}<p className="reading-text">${b.text}</p></div>`)}</div>
      ${p.partners && html`<section className="content-section"><${SectionTitle} title=${p.partners.title} /><p className="reading-text">${p.partners.text}</p><ul className="partner-list">${s.partners.map((x, i) => html`<li key=${i}>${x.name}</li>`)}</ul><ul className="text-links">${(p.links || []).map((link, i) => html`<li key=${i}><${More} href=${link.href} label=${link.label} /></li>`)}</ul></section>`}`;
    if (slug === 'heimsokn') return html`
      <${PageIntro} p=${p} src=${src} />
      <section className="content-section"><h2 className="vh">${s.labels.visit}</h2><${VisitInfo} s=${s} /></section>
      <section className="content-section visit-blocks">${blocks.map((b, i) => html`<div key=${i}><h2>${b.title}${b.draft && html`<${Draft} s=${s} />`}</h2><p>${b.text}</p></div>`)}</section>`;
    if (slug === 'taeki') return html`
      <${PageIntro} p=${p} src=${src} image=${null} composition />
      <section className="content-section"><h2 className="vh">${s.labels.categories}</h2><${CategoryTiles} categories=${categories} machines=${machines} descriptions /></section>
      <section className="content-section"><${SectionTitle} title=${p.listTitle} /><div className="inventory-grid">${categoryOrder.map((id) => html`<article key=${id} className="inventory-group"><h3>${categories[id]?.title}</h3><ul className="machine-list">${byTitle(machines).filter(([, m]) => m.category === id).map(([mid, m]) => html`<li key=${mid}>${m.published ? html`<a href=${url(`/taeki/${mid}/`)}>${m.title}</a>` : html`<span>${m.title}</span>`}<span className="quantity">×${m.quantity}</span></li>`)}</ul></article>`)}</div></section>`;
    const list = listPages[slug];
    if (list) return html`
      <${PageIntro} p=${p} src=${src} image=${null} composition />
      <section className="content-section"><${SectionTitle} title=${p.listTitle} />${list(ctx)}</section>`;
    // A page without its own layout: heading, introduction, image and body.
    return html`<${PageIntro} p=${p} src=${src} />${body && html`<div className="content-section prose">${body}</div>`}`;
  }));

  // Layouts used by the pages template (index.astro and the list pages).
  const listPages = {
    frettir: ({ s, p, src, news }) => html`
      ${!Object.values(news).some((n) => n.published) && html`<p className="empty-state">${p.emptyText}</p>`}
      <div className="cards">${Object.entries(news).map(([id, n], i) => html`<${LightCard} key=${id} title=${n.title} image=${n.image} index=${i} src=${src} href=${`/frettir/${id}/`} meta=${`${kindLabel(s, n)} · ${n.date}${!n.published ? ` · ${s.labels.draft}` : ''}`} />`)}</div>`,
    smidad: ({ s, p, src, projects, categories }) => html`
      ${!Object.values(projects).some((x) => !x.example) && html`<p className="empty-state">${p.emptyText}</p>`}
      <div className="cards">${Object.entries(projects).map(([id, x], i) => html`<${LightCard} key=${id} title=${x.title} image=${x.image} index=${i} src=${src} href=${`/smidad/${id}/`} meta=${`${x.example ? `${s.labels.example} · ` : ''}${x.maker} · ${categories[x.category]?.title ?? s.labels.projectCategoryPending}`} />`)}</div>`,
    namskeid: ({ s, p, courses, categories }) => html`
      ${!Object.values(courses).some((c) => c.published) && html`<p className="empty-state">${p.emptyText}</p>`}
      <div className="course-list">${Object.entries(courses).map(([id, c]) => html`<article key=${id} className="course-row"><h3><a href=${url(`/namskeid/${id}/`)}>${c.title}</a></h3>
        <p className="course-meta">${c.date} · ${categories[c.category]?.title} · ${c.seats} · ${c.language}</p>${!c.published && html`<p className="meta">${s.labels.draft}</p>`}</article>`)}</div>`,
  };
  const tone = (hex) => {
    // Gradient map ink → colour → paper, the same stops as scripts/mural-tone.mjs.
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const L = (c) => { const Y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); return (Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y) / 100; };
    const [ink, c, paper] = [palette.ink, hex, palette.bg].map(rgb);
    const t0 = Math.min(0.8, Math.max(0.25, (L(c) - L(ink)) / (L(paper) - L(ink))));
    const at = (t, k) => (t < t0 ? ink[k] + (c[k] - ink[k]) * (t / t0) : c[k] + (paper[k] - c[k]) * ((t - t0) / (1 - t0))) / 255;
    return [0, 1, 2].map((k) => Array.from({ length: 33 }, (_, i) => at(i / 32, k).toFixed(3)).join(' '));
  };
  const ToneFilters = () => html`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${['red', 'green', 'blue', 'orange', 'yellow', 'pink'].map((colour) => {
    const [r, g, b] = tone(palette[colour]);
    return html`<filter key=${colour} id=${`tone-${colour}`} colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncR type="table" tableValues=${r} /><feFuncG type="table" tableValues=${g} /><feFuncB type="table" tableValues=${b} /></feComponentTransfer></filter>`;
  })}</defs></svg>`;
  const HeroTile = ({ id, shape, span, categories, src }) => {
    const colour = categoryStyle[id][1];
    const image = categories[id]?.image;
    return html`<a className=${cx('tile', shape, span, `c-${colour}`)} href=${url(`/taeki/#${id}`)}>${image?.src && html`<img src=${src(image)} alt=${image.alt} style=${`filter:url(#tone-${colour})`} />`}<span className="lbl">${categories[id]?.title}</span></a>`;
  };
  const home = ({ s, p, src, categories, machines, news, courses }) => {
    const tile = (id) => html`<${HeroTile} id=${id} shape=${heroTiles[id][0]} span=${heroTiles[id][1]} categories=${categories} src=${src} />`;
    const units = Object.values(machines).reduce((n, m) => n + (m.quantity || 0), 0);
    const featured = (p.news?.featured || []).map((item) => {
      const course = item.collection === 'courses';
      const data = (course ? courses : news)[item.entry];
      return data && { data, key: item.collection + item.entry, href: `/${course ? 'namskeid' : 'frettir'}/${item.entry}/`, label: course ? s.labels.courseKind : s.labels.newsKind };
    }).filter(Boolean);
    return html`<${ToneFilters} />
      <section className="wall">
        <span className="deco half c-blue w2" aria-hidden="true" />${tile('laser')}<span className="deco sq c-orange" aria-hidden="true" />${tile('prent')}
        <span className="deco r-br c-yellow" aria-hidden="true" /><span className="deco r-bl c-green" aria-hidden="true" />
        <div className="wall-text"><h1>${p.title}</h1><p className="lede">${p.hero?.lead}</p><p className="opens">${s.labels.opens} ${p.hero?.opening} · ${s.visit.location}</p></div>
        ${tile('fraesi')}<span className="deco circle c-blue" aria-hidden="true" /><span className="deco r-tl c-yellow" aria-hidden="true" />${tile('textill')}<span className="deco sq c-red" aria-hidden="true" />
      </section>
      <section className="band-info"><${VisitInfo} s=${s} more /></section>
      ${p.about && html`<section className="about"><div className="about-img arch"><${Photo} image=${p.about.image} src=${src} /></div><div className="about-text"><h2>${p.about.title}</h2>${(p.about.paragraphs || []).map((text, i) => html`<p key=${i}>${text}</p>`)}<h3>${p.about.usersTitle}</h3><p>${p.about.usersText}</p></div></section>`}
      ${p.equipment && html`<section className="machines"><div className="sec-head"><h2>${p.equipment.title}</h2><p>${(p.equipment.summary || '').replace('{units}', units).replace('{categories}', categoryOrder.length)}</p><${More} href=${p.equipment.more?.href} label=${p.equipment.more?.label} /></div><${CategoryTiles} categories=${categories} machines=${machines} /></section>`}
      ${p.news && html`<section className="news"><div className="sec-head"><h2>${p.news.title}</h2><${More} href=${p.news.more?.href} label=${p.news.more?.label} /></div><div className="cards">${featured.map((item, i) => html`<article key=${item.key} className="card"><div className=${cx('card-img', i % 2 === 0 ? 'r-tl' : 'r-tr')}><${Photo} image=${item.data.image} src=${src} /></div><p className="meta">${item.label} · ${item.data.date}</p><h3><a href=${url(item.href)}>${item.data.title}</a></h3></article>`)}</div></section>`}
      ${p.partners && html`<section className="partners"><h2>${p.partners.title}</h2><p>${p.partners.text}</p><ul>${s.partners.map((x, i) => html`<li key=${i}>${x.name}</li>`)}</ul></section>`}`;
  };
  // site · shared texts as they appear around every page. A file collection's
  // template is registered under the file's name (scripts/cms-config.mjs: 'is').
  CMS.registerPreviewTemplate('is', page(({ p }) => html`
    <header className="top"><a className="mark" href=${url('/')} aria-label=${p.labels?.logo}><span aria-hidden="true"><img src=${url('/brand/fablab-saga.svg')} alt="" style="width:130px;height:auto" /></span></a>
      <nav className="nav" aria-label=${p.labels?.nav}><ul>${(p.nav || []).map((item, i) => html`<li key=${i}><a href=${url(item.href)}>${item.label}</a></li>`)}</ul></nav></header>
    <section className="band-info"><${VisitInfo} s=${p} more /></section>
    <footer className="foot"><div className="foot-grid">
      <div className="foot-brand"><p className="foot-name">${p.visit?.location}<br />${p.footer?.institution}</p></div>
      <p>${p.labels?.email}: ${p.visit?.email}<br />${p.labels?.phone}: ${p.visit?.phone}</p>
      <ul className="foot-partners">${(p.partners || []).map((x, i) => html`<li key=${i}>${x.name}</li>`)}</ul>
      <p className="foot-note">${p.footer?.imageNote}</p>
    </div></footer>`));
})();
