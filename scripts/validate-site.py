"""Validate the portable publication without accessing private source documents."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re

DIST = Path(__file__).resolve().parents[1] / 'dist'
errors = []

class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = []
        self.titles = 0
        self.headings = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.links.extend(attrs[key] for key in ('href', 'src') if attrs.get(key))
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        self.titles += tag == 'title'
        self.headings += tag == 'h1'

documents = {}
for path in DIST.rglob('*.html'):
    raw = path.read_text(encoding='utf-8')
    doc = Document()
    doc.feed(raw)
    documents[path.resolve()] = doc
    if doc.titles != 1 or doc.headings != 1:
        errors.append(f'{path.relative_to(DIST)}: expected one title and h1')
    if len(doc.ids) != len(set(doc.ids)):
        errors.append(f'{path.relative_to(DIST)}: duplicate ID')
    if '/i18n.js' not in doc.links or '/i18n.css' not in doc.links:
        errors.append(f'{path.relative_to(DIST)}: language switch missing')
    if 'chatgpt.site' in raw or re.search(r'[CDF]:[/\\]', raw):
        errors.append(f'{path.relative_to(DIST)}: old hosting URL or local path')

checked_links = 0
for path, doc in documents.items():
    for link in doc.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        if not url.path:
            target = path
        elif url.path.startswith('/'):
            target = (DIST / unquote(url.path).lstrip('/')).resolve()
        else:
            target = (path.parent / unquote(url.path)).resolve()
        if target.is_dir():
            target = target / 'index.html'
        if not target.is_file():
            errors.append(f'{path.relative_to(DIST)}: missing {link}')
        elif url.fragment and target in documents:
            if unquote(url.fragment) not in documents[target].ids:
                errors.append(f'{path.relative_to(DIST)}: missing anchor {link}')
        checked_links += 1

catalog = json.loads((DIST / 'music-catalog.js').read_text(encoding='utf-8')
                     .removeprefix('export const tracks = ').rstrip(';\n'))
for track in catalog:
    audio = DIST / track['src'].lstrip('/')
    if not audio.is_file() or audio.stat().st_size == 0:
        errors.append(f'Missing audio: {track["id"]}')
if len(catalog) != 27 or len({track['id'] for track in catalog}) != 27:
    errors.append('Expected 27 distinct audio recordings')
if len(documents) != 34:
    errors.append('Expected 34 published HTML pages')
if not (DIST / '.nojekyll').is_file():
    errors.append('Missing .nojekyll')
for path in DIST.rglob('*'):
    if path.is_symlink():
        errors.append(f'Unexpected symbolic link: {path.relative_to(DIST)}')
    if path.is_file() and path.stat().st_size > 100 * 1024 * 1024:
        errors.append(f'File exceeds GitHub limit: {path.relative_to(DIST)}')

print(json.dumps({'html_pages': len(documents), 'internal_links': checked_links,
                  'audio_files': len(catalog), 'errors': errors}, ensure_ascii=False))
raise SystemExit(bool(errors))
