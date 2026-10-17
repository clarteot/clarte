"""Rebuild the production payload from src/app.html without touching user data."""
from pathlib import Path
import base64, gzip, hashlib, json, re

root = Path(__file__).resolve().parent
app = (root / 'src/app.html').read_bytes()
encoded = base64.b64encode(gzip.compress(app, mtime=0)).decode()
payloads = []
for offset in range(0, len(encoded), 6000):
    name = f'payload-v26-6-{offset // 6000 + 1:02d}.txt'
    (root / name).write_text(encoded[offset:offset + 6000])
    payloads.append(name)
entry = (root / 'index.html').read_text()
entry = re.sub(r'const PAYLOADS=\[.*?\];', 'const PAYLOADS=' + json.dumps(payloads) + ';', entry)
entry = re.sub(r'const PAYLOAD_BASE64_LENGTH=\d+;', f'const PAYLOAD_BASE64_LENGTH={len(encoded)};', entry)
(root / 'index.html').write_text(entry)
path = root / 'deployment/v26.6-manifest.json'
manifest = json.loads(path.read_text())
manifest.update(app_sha256=hashlib.sha256(app).hexdigest(), base64_length=len(encoded), payloads=payloads)
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
assert gzip.decompress(base64.b64decode(encoded, validate=True)) == app
print(f'Built Clarte 26.6: {len(payloads)} payloads, {len(app)} source bytes')
