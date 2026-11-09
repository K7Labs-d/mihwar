"""Fetch Overture Maps features inside a bounding box, reading only the needed Parquet row groups over HTTPS range requests.
usage: python3 fetch_overture.py RELEASE TYPE_PATH MINLON MINLAT MAXLON MAXLAT OUT.json
  RELEASE    an Overture release folder, e.g. 2026-10-21.0 (list: https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/)
  TYPE_PATH  theme=buildings/type=building for footprints (theme=places/type=place for points of interest)
  the box is the same one used to download the OpenStreetMap extract; it is given at run time and never stored here.
Needs pyarrow and requests. Only the row groups whose bounding boxes touch the box are downloaded.
"""
import io, json, re, sys, threading
from concurrent.futures import ThreadPoolExecutor
import requests
import pyarrow.parquet as pq

BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com'
rel, tpath, x0, y0, x1, y1, out = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7]), sys.argv[7]
S = threading.local()
def sess():
    if not hasattr(S, 's'): S.s = requests.Session()
    return S.s

class HttpFile(io.RawIOBase):   # a seekable read-only file over HTTP range requests, with a small block cache
    def __init__(self, url, size):
        self.url, self.size, self.pos, self.cache = url, size, 0, {}
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        if n <= 0: return b''
        a, b = self.pos, min(self.size, self.pos + n) - 1
        key = (a, b)
        if key not in self.cache:
            r = sess().get(self.url, headers={'Range': f'bytes={a}-{b}'}, timeout=120); r.raise_for_status()
            self.cache[key] = r.content
        data = self.cache[key]; self.pos += len(data); return data
    def readinto(self, buf):
        d = self.read(len(buf)); buf[:len(d)] = d; return len(d)

lst = requests.get(f'{BASE}/?list-type=2&prefix=release/{rel}/{tpath}/', timeout=60).text
files = [(k, int(s)) for k, s in re.findall(r'<Key>([^<]+\.parquet)</Key>.*?<Size>(\d+)</Size>', lst)]
print(len(files), 'files', file=sys.stderr)

def groups(f):
    key, size = f
    pf = pq.ParquetFile(HttpFile(f'{BASE}/{key}', size))
    md, names = pf.metadata, pf.schema_arrow.names
    hits = []
    for g in range(md.num_row_groups):
        rg, st = md.row_group(g), {}
        for c in range(rg.num_columns):
            col = rg.column(c); p = col.path_in_schema
            if p in ('bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax') and col.statistics is not None and col.statistics.has_min_max:
                st[p] = (col.statistics.min, col.statistics.max)
        if len(st) < 4: hits.append(g); continue
        if st['bbox.xmin'][0] <= x1 and st['bbox.xmax'][1] >= x0 and st['bbox.ymin'][0] <= y1 and st['bbox.ymax'][1] >= y0: hits.append(g)
    return key, size, hits, names

with ThreadPoolExecutor(16) as ex: res = list(ex.map(groups, files))
todo = [(k, s, h, n) for k, s, h, n in res if h]
print('row groups to read:', sum(len(h) for _, _, h, _ in todo), 'in', len(todo), 'files', file=sys.stderr)

feats = []
for key, size, hits, names in todo:
    pf = pq.ParquetFile(HttpFile(f'{BASE}/{key}', size))
    cols = [c for c in names if c in ('id', 'geometry', 'bbox', 'height', 'num_floors', 'subtype', 'class', 'names', 'categories', 'confidence', 'sources', 'roof_shape', 'is_underground', 'basic_category', 'taxonomy', 'level')]
    for g in hits:
        t = pf.read_row_group(g, columns=cols).to_pylist()
        for r in t:
            b = r['bbox']
            if b['xmin'] <= x1 and b['xmax'] >= x0 and b['ymin'] <= y1 and b['ymax'] >= y0:
                r['geometry'] = r['geometry'].hex() if isinstance(r['geometry'], (bytes, bytearray)) else r['geometry']
                feats.append(r)
    print(key.split('/')[-1], len(feats), file=sys.stderr)
json.dump(feats, open(out, 'w'), default=str)
print('features:', len(feats), file=sys.stderr)
