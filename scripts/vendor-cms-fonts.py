"""Vendor only the pinned fonts referenced by the pinned Sveltia bundle."""
from pathlib import Path
import hashlib
import json
import urllib.request

root = Path(__file__).resolve().parents[1]
fonts = [
    ('source-sans-3', 'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3:vf@5.3.1/latin-wght-normal.woff2', 'https://cdn.jsdelivr.net/npm/@fontsource-variable/source-sans-3@5.3.1/LICENSE'),
    ('noto-mono', 'https://cdn.jsdelivr.net/fontsource/fonts/noto-mono@5.3.0/latin-400-normal.woff2', 'https://cdn.jsdelivr.net/npm/@fontsource/noto-mono@5.3.0/LICENSE'),
    ('material-symbols-outlined', 'https://cdn.jsdelivr.net/fontsource/fonts/material-symbols-outlined:vf@5.3.9/latin-wght-normal.woff2', 'https://cdn.jsdelivr.net/npm/@fontsource-variable/material-symbols-outlined@5.3.9/LICENSE'),
]
out = root / 'public/admin/fonts'
out.mkdir(parents=True, exist_ok=True)
manifest = []
for name, url, license_url in fonts:
    raw = urllib.request.urlopen(url, timeout=60).read()
    assert raw.startswith(b'wOF2')
    license_bytes = urllib.request.urlopen(license_url, timeout=60).read()
    assert b'OPEN FONT LICENSE' in license_bytes
    (out / (name+'.woff2')).write_bytes(raw)
    (out / (name+'-LICENSE.txt')).write_bytes(license_bytes)
    manifest.append(dict(name=name,url=url,local='./fonts/'+name+'.woff2',license_url=license_url,sha256=hashlib.sha256(raw).hexdigest(),size=len(raw)))
(root/'scripts/cms-fonts.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
