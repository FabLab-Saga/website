import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist');
const prefix = process.env.PREVIEW_BASE || '/fablab-saga/v3/';
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.yml':'text/yaml', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.txt':'text/plain' };
createServer(async(req,res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(prefix)) { res.writeHead(404); return res.end(); }
    path = resolve(root, './' + path.slice(prefix.length));
    if (!path.startsWith(root + '/') && path !== root) { res.writeHead(403); return res.end(); }
    if ((await stat(path)).isDirectory()) path += '/index.html';
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(await readFile(root + '/404.html')); }
}).listen(4327, '127.0.0.1', () => console.log(`Built preview at http://127.0.0.1:4327${prefix}`));
