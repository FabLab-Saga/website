// Exercise the actual prebuild against an isolated category with a generated upload image.
import { mkdtemp, mkdir, copyFile, readFile, writeFile, readdir, rm, utimes } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import sharp from 'sharp';
const root=new URL('..',import.meta.url).pathname;
await mkdir(join(root,'private-assets'),{recursive:true});
const fixture=await mkdtemp(join(root,'private-assets/tone-test-'));
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 for(const dir of ['scripts','src/styles','src/lib','src/content/categories/is','src/assets/uploads'])await mkdir(join(fixture,dir),{recursive:true});
 for(const file of ['scripts/mural-tone.mjs','src/styles/a.css','src/lib/identity.ts'])await copyFile(join(root,file),join(fixture,file));
 const upload=join(fixture,'src/assets/uploads/cms-upload-regression.webp');
 const bytes=await sharp({create:{width:64,height:48,channels:3,background:{r:0,g:0,b:0}}})
  .composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="64" height="48" fill="url(#g)"/><circle cx="20" cy="24" r="12" fill="#888"/></svg>')}])
  .webp().toBuffer();
 await writeFile(upload,bytes);
 const category='---\ntitle: Fixture\nimage:\n  src: /src/assets/uploads/cms-upload-regression.webp\n  alt: Fixture\n---\n';
 await writeFile(join(fixture,'src/content/categories/is/laser.md'),category);
 const run=()=>execFileSync(process.execPath,[join(fixture,'scripts/mural-tone.mjs')],{encoding:'utf8'});
 const first=run();const output=join(fixture,'src/assets/toned/cms-upload-regression--pink.png');
 const toned=await readFile(output);assert.notEqual(hash(toned),hash(bytes));assert.ok(first.includes('tone laser'));assert.ok(run().includes('cached'));
 // Same upload mapped by a different category requires no editorial colour/shape input.
 await writeFile(join(fixture,'src/content/categories/is/prent.md'),category);run();
 const red=await readFile(join(fixture,'src/assets/toned/cms-upload-regression--red.png'));assert.notEqual(hash(red),hash(toned));
 const altered=await sharp(bytes).flop().webp().toBuffer();await writeFile(upload,altered);
 const future=new Date(Date.now()+2000);await utimes(upload,future,future);run();
 const replaced=await readFile(output);assert.notEqual(hash(replaced),hash(toned));
 await rm(join(fixture,'src/content/categories/is/prent.md'));run();
 assert.deepEqual(await readdir(join(fixture,'src/assets/toned')),['cms-upload-regression--pink.png']);
 console.log('PASS: mural tone applies by category, regenerates on replacement, caches, and removes obsolete tones.');
}finally{await rm(fixture,{recursive:true,force:true});}
