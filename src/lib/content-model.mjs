import { z } from 'zod';

// The content contract also supplies editor labels. Layout never lives in content.
const text = (label) => z.string().min(1).meta({ label });
// Sveltia serializes unused object/list widgets as null. Normalize only optional fields.
/** @template {z.ZodType} T @param {T} schema */
const optional = (schema) => schema.nullable().optional().transform(value => value ?? undefined);
const optionalText = (label) => optional(z.string().meta({ label }));
const prose = (label) => text(label).meta({ label, widget: 'text' });
const flag = (label) => z.boolean().meta({ label });
/** @template {z.ZodType} T @param {string} label @param {T} item @param {number} [max] */
const list = (label, item, max) => (max ? z.array(item).max(max) : z.array(item)).meta({ label });
/** @template {z.ZodRawShape} T @param {string} label @param {T} fields */
const object = (label, fields) => z.object(fields).strict().meta({ label });
const href = z.string().regex(/^(\/(?!\/)|#[a-zA-Z]|https:\/\/|mailto:|tel:)/).meta({ label: 'Slóð' });
const source = z.url({ protocol: /^https$/ }).meta({ label: 'Heimild' });
// Sveltia validates unsaved uploads by filename, existing media by committed path.
// Only the editor accepts the bare filename; the build contract remains absolute.
const imagePath = z.string().regex(/^\/src\/assets\/uploads\/[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/).meta({
  label: 'Mynd', widget: 'image',
  editorPattern: '^(?:/src/assets/uploads/)?[a-zA-Z0-9_-]+\\.(webp|png|jpe?g)$',
});
export const categoryIds = ['laser', 'fraesi', 'prent', 'rafeinda', 'skurdur', 'formmotun', 'textill', 'hitapressur', 'skanni'];
const category = z.enum(categoryIds).meta({ label: 'Flokkur' });
// Marks a stand-in image to replace before launch. The site never renders it.
const placeholderFlag = optional(z.boolean().meta({ label: 'Bráðabirgðamynd', default: false })).transform(value => value ?? false);
const picture = object('Mynd', { src: imagePath, alt: text('Myndlýsing'), placeholder: placeholderFlag });
const link = object('Tengill', { label: text('Texti tengils'), href });
const base = { title: text('Titill'), description: prose('Lýsing'), published: flag('Birta') };
const policy = { policy: prose('Reglur og aðgangur'), policyDraft: z.literal(true).meta({ label: 'Drög að reglum', widget: 'hidden', default: true }) };
const article = { ...base, date: text('Dagsetning'), image: picture, imageCaption: optionalText('Myndatexti'), category, body: optionalText('Meginmál') };

export const schemas = {
  site: z.object({
    name: text('Heiti smiðju'), nav: list('Aðalvalmynd', link),
    labels: object('Sameiginlegir textar', {
      skip: text('Hoppa í efni'), nav: text('Heiti valmyndar'), menu: text('Opna valmynd'), logo: text('Heiti merkistengils'),
      visit: text('Heimsókn'), hours: text('Opnunartími'), where: text('Hvar'), access: text('Aðgangur'),
      contact: text('Hafa samband'), email: text('Netfang'), phone: text('Sími'), opens: text('Opnar'), draft: text('Drög'),
      newsKind: text('Frétt'), courseKind: text('Námskeið'), eventKind: text('Viðburður'),
      notFound: text('Síða fannst ekki'), notFoundText: prose('Texti villusíðu'), homeLink: text('Tengill á forsíðu'),
      categories: text('Flokkar'), inventory: text('Tækjalisti'),
      specs: text('Tæknilegar upplýsingar'), quantity: text('Fjöldi'), location: text('Rými'),
      suitable: text('Hentar fyrir'), before: text('Áður en þú byrjar'), courses: text('Námskeið'),
      courseLink: text('Tengill á námskeið'), related: text('Tengd tæki'), allEquipment: text('Allur búnaður'),
      factsPending: text('Óstaðfestar tæknilýsingar'), modelPending: text('Óstaðfest gerð'),
      projectCategoryPending: text('Óskráður verkefnisflokkur'), example: text('Dæmi'), maker: text('Höfundur'), projectMachines: text('Tæki í verkefni'), projectMachinesEmpty: text('Óskráð tæki í verkefni'),
      projectBack: text('Tengill á verkefnasafn'), newsBack: text('Til baka í fréttir'),
      date: text('Dagsetning'), time: text('Tími'), seats: text('Pláss'), language: text('Tungumál'),
      signup: text('Skráning'), requirements: text('Forkröfur'), courseBack: text('Til baka í námskeið'),
    }),
    visit: object('Upplýsingar fyrir heimsókn', {
      hours: text('Opnunartími smiðjunnar'), location: text('Staðsetning'),
      access: text('Aðgangur'), accessDraft: flag('Aðgangsreglur eru drög'),
      email: text('Netfang'), phone: text('Sími'), more: link,
    }),
    footer: object('Síðufótur', { institution: text('Stofnun'), imageNote: prose('Upplýsingar um myndir') }),
    partners: list('Samstarfsaðilar', object('Samstarfsaðili', { name: text('Heiti') })),
  }).strict(),
  pages: z.object({
    ...base,
    hero: optional(object('Upphaf forsíðu', { lead: prose('Inngangur'), opening: text('Opnunardagur') })),
    about: optional(object('Um smiðjuna', {
      title: text('Fyrirsögn'), paragraphs: list('Málsgreinar', prose('Texti')),
      usersTitle: text('Fyrirsögn um notendur'), usersText: prose('Texti um notendur'), image: picture,
    })),
    equipment: optional(object('Búnaður', { title: text('Fyrirsögn'), summary: text('Samantekt með {units} og {categories}'), more: link })),
    news: optional(object('Fréttir á forsíðu', {
      title: text('Fyrirsögn'), more: link,
      featured: list('Valdar færslur', object('Færsla', { collection: z.enum(['news', 'courses']).meta({ label: 'Safn' }), entry: text('Auðkenni færslu') })),
    })),
    partners: optional(object('Samstarf', { title: text('Fyrirsögn'), text: prose('Texti') })),
    image: optional(picture), imageCaption: optionalText('Myndatexti'),
    listTitle: optionalText('Fyrirsögn lista'), emptyText: optionalText('Texti þegar safn er tómt'),
    blocks: optional(list('Upplýsingar', object('Textahluti', { title: optionalText('Fyrirsögn'), text: prose('Texti'), draft: flag('Drög') }), 5)),
    links: optional(list('Tenglar', link)),
    body: optionalText('Meginmál'),
  }).strict(),
  machines: z.object({
    ...base, category,
    quantity: z.number().int().min(1).meta({ label: 'Fjöldi', widget: 'number', value_type: 'int', min: 1 }),
    modelConfirmed: flag('Gerð staðfest'), location: text('Rými'),
    image: picture, imageCaption: optionalText('Myndatexti'),
    specs: optional(list('Staðfestar tæknilýsingar', object('Tæknilýsing', { label: text('Heiti'), value: text('Gildi'), source, note: optionalText('Skýring við gildi') }), 4)).transform(value => value ?? []),
    source: prose('Heimildir og athugasemdir ritstjóra'),
    uses: list('Hentar fyrir', text('Efni eða notkun'), 4),
    checklist: list('Áður en þú byrjar', prose('Atriði'), 5),
    related: optional(list('Tengd tæki', text('Auðkenni tækis'), 3)).transform(value => value ?? []),
    ...policy, body: optionalText('Meginmál'),
  }).strict(),
  categories: z.object({ title: text('Heiti flokks'), description: prose('Lýsing'), image: optional(picture), body: optionalText('Meginmál') }).strict(),
  courses: z.object({ ...article, time: text('Tími'), seats: text('Pláss'), language: text('Tungumál'), signup: optional(href.or(z.literal(''))).transform(value => value || undefined), signupText: text('Staða skráningar'), ...policy }).strict(),
  projects: z.object({ ...article, category: optional(category.or(z.literal(''))).transform(value => value || undefined), maker: text('Höfundur'), example: flag('Dæmi, ekki raunverulegt verkefni'), machines: optional(list('Tæki', text('Auðkenni tækis'))).transform(value => value ?? []), sections: list('Verkefnalýsing', object('Textahluti', { title: text('Fyrirsögn'), text: prose('Texti') }), 3) }).strict().superRefine((data, ctx) => {
    if (!data.example && !data.category) ctx.addIssue({ code: 'custom', path: ['category'], message: 'A real project must have a category.' });
  }),
  news: z.object({ ...article, kind: z.enum(['news', 'events']).meta({ label: 'Tegund færslu' }) }).strict(),
};

export const collectionLabels = { site: 'Vefurinn', pages: 'Síður', machines: 'Tæki', categories: 'Flokkar', courses: 'Námskeið', projects: 'Smíðað í Sögu', news: 'Fréttir' };
export const jsonSchemas = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input' })]));
