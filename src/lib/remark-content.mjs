// Editorial Markdown is prose, not another layout or executable surface.
export default function remarkContent() {
  const base=(process.env.PREVIEW_BASE || '/').replace(/\/$/,'');
  return function transform(tree) {
    function visit(node) {
      if(node.type==='html') throw new Error('Raw HTML is not allowed in editorial content.');
      if(node.type==='image' || node.type==='imageReference') throw new Error('Use the CMS image/alt fields, not inline Markdown images.');
      if(node.type==='table') throw new Error('Use short prose/lists; machine specifications have dedicated fields.');
      if(['link','definition'].includes(node.type)) {
        const href=node.url;
        if(!/^(\/(?!\/)|#[a-zA-Z]|https:\/\/|mailto:|tel:)/.test(href)) throw new Error(`Unsupported editorial link: ${href}`);
        if(href.startsWith('/')) node.url=base+href;
      }
      for(const child of node.children || [])visit(child);
    }
    visit(tree);
  };
}
