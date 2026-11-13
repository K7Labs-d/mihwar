"""Build street surfaces, real blocks and an illustrative plot split from an OpenStreetMap extract.

Usage: python3 build_plan.py OSM_JSON LAT LON OUT_JSON [BUILDINGS_JSON]
  OSM_JSON        output of https://api.openstreetmap.org/api/0.6/map.json?bbox=... around the point
  LAT LON         a point inside the residential area to draw; the landuse=residential polygon that holds it is used
  BUILDINGS_JSON  optional: building footprints from fetch_overture.py (Overture Maps, theme=buildings) for the same box.
                  With it, plot lines are moved into the gaps between existing buildings, each plot says whether it is
                  built on, and the buildings and mosques are written out for the 3D page.
Coordinates in the output are metres from LAT/LON (x = east, y = north). No location is stored in this repository.
"""
import json, math, sys
from shapely.geometry import LineString, Polygon, Point, MultiPolygon, box
from shapely.ops import unary_union
from shapely import affinity
OSM, LAT0, LON0, OUT = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
BLD = sys.argv[5] if len(sys.argv) > 5 else None
d = json.load(open(OSM))
kx = 111320 * math.cos(math.radians(LAT0)); ky = 110574
nodes = {e['id']: ((e['lon'] - LON0) * kx, (e['lat'] - LAT0) * ky) for e in d['elements'] if e['type'] == 'node'}
ways = {w['id']: w for w in d['elements'] if w['type'] == 'way'}
cands = [Polygon([nodes[n] for n in w['nodes'] if n in nodes]).buffer(0) for w in ways.values()
         if w.get('tags', {}).get('landuse') == 'residential' and len(w['nodes']) >= 4]
AREA = next((g for g in cands if g.contains(Point(0, 0))), None)
if AREA is None: sys.exit('no residential area polygon contains the point')
AOI = AREA.buffer(12, join_style=2)
WIDTH = {'tertiary': 30, 'residential': 15, 'living_street': 8, 'service': 6, 'construction': 15, 'proposed': 15, 'unclassified': 12}
streets, surf = [], []
for w in ways.values():
    t = w.get('tags', {}); hw = t.get('highway')
    if not hw or hw not in WIDTH: continue
    pts = [nodes[n] for n in w['nodes'] if n in nodes]
    if len(pts) < 2: continue
    line = LineString(pts)
    if not line.intersects(AREA.buffer(60)): continue
    width = WIDTH[hw]
    poly = line.buffer(width / 2, cap_style=2, join_style=2).intersection(AOI.buffer(30))
    if poly.is_empty: continue
    done = hw not in ('construction', 'proposed')
    streets.append({'id': w['id'], 'type': hw, 'name': t.get('name', ''), 'width': width, 'done': done, 'line': line, 'poly': poly})
    surf.append(line.buffer(width / 2, cap_style=2, join_style=2))
ROADS = unary_union(surf)
blocks_g = AOI.difference(ROADS)
blocks = [g for g in getattr(blocks_g, 'geoms', [blocks_g]) if g.area > 400]
print('streets', len(streets), 'blocks', len(blocks), 'area ha', round(AREA.area / 1e4, 1))

# ---- existing buildings (optional): footprints detected from imagery, in the same local metres
BLDS, MOSQUES = [], []
if BLD:
    import numpy as np, shapely
    from shapely import wkb
    to_local = lambda c: np.column_stack(((c[:, 0] - LON0) * kx, (c[:, 1] - LAT0) * ky))
    for r in json.load(open(BLD)):
        g = shapely.transform(wkb.loads(bytes.fromhex(r['geometry'])), to_local)
        BLDS += [q.buffer(0) for q in getattr(g, 'geoms', [g]) if q.geom_type == 'Polygon' and q.area > 12]
    # mosques mapped as points in OpenStreetMap; the footprint under each point becomes a mosque
    for e in d['elements']:
        t = e.get('tags', {})
        if e['type'] == 'node' and t.get('amenity') == 'place_of_worship' and t.get('religion') == 'muslim':
            pt = Point(nodes[e['id']])
            hit = next((i for i, b in enumerate(BLDS) if b.distance(pt) < 3), None)
            MOSQUES.append({'x': round(pt.x, 1), 'y': round(pt.y, 1), 'name': t.get('name', ''), 'bld': hit})
    print('buildings', len(BLDS), 'mosques', len(MOSQUES), 'on a footprint', sum(m['bld'] is not None for m in MOSQUES))

def building_out(i, b, kind):
    """what the 3D page needs to draw a building: footprint, the roof inside the parapet, its main direction, and where roof items fit"""
    from shapely.geometry.polygon import orient
    g = b.simplify(0.25)
    g = orient(Polygon(g.exterior) if g.geom_type == 'Polygon' and g.is_valid and g.area > 12 else Polygon(b.exterior), 1)
    o = {'poly': rnd(g), 'a': round(g.area), 'k': kind}
    c = list(g.minimum_rotated_rectangle.exterior.coords)
    e1, e2 = (c[1][0] - c[0][0], c[1][1] - c[0][1]), (c[2][0] - c[1][0], c[2][1] - c[1][1])
    ax = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
    ang = math.atan2(ax[1], ax[0]); o['ang'] = round(math.degrees(ang), 1)
    inner = g.buffer(-0.3, join_style=2)
    if inner.geom_type == 'Polygon' and inner.area > 8 and not inner.interiors: o['in'] = rnd(orient(inner, 1))
    if kind == 'small': return o
    # roof items, placed only where they fit: a stair room (with the water tank on it) and one or two air-conditioning units
    eq, core = [], g.buffer(-0.5)
    deep = g.buffer(-2.4)
    if g.area >= 150 and not deep.is_empty:
        p = max(getattr(deep, 'geoms', [deep]), key=lambda q: q.area).representative_point()
        room = affinity.rotate(box(p.x - 2.1, p.y - 1.6, p.x + 2.1, p.y + 1.6), math.degrees(ang), origin=(p.x, p.y))
        if core.contains(room): eq.append([round(p.x, 2), round(p.y, 2), 's'])
    cen = g.representative_point()
    for k, d in enumerate((4.5, -5.5)):
        if k == 1 and g.area < 260: break
        q = Point(cen.x + math.cos(ang) * d + math.sin(ang) * (1.5 - 3 * ((i + k) % 2)), cen.y + math.sin(ang) * d - math.cos(ang) * (1.5 - 3 * ((i + k) % 2)))
        if g.buffer(-1.0).contains(q) and all(math.hypot(q.x - e[0], q.y - e[1]) > 3.4 for e in eq): eq.append([round(q.x, 2), round(q.y, 2), 'a'])
    if eq: o['eq'] = eq
    return o

def merged(iv):
    out = []
    for a, b in sorted(iv):
        if out and a <= out[-1][1]: out[-1][1] = max(out[-1][1], b)
        else: out.append([a, b])
    return out

def snap(t, occ, shift, m=0.6):
    """a cut position near t that does not pass through a building, or None"""
    hit = next((iv for iv in occ if iv[0] - m < t < iv[1] + m), None)
    if hit is None: return t
    c = min((hit[0] - m, hit[1] + m), key=lambda v: abs(v - t))
    return c if abs(c - t) <= shift else None

def split_block(B):
    """two rows back to back along the long side when deep enough, ~20 m frontage; cuts avoid existing buildings"""
    mrr = B.minimum_rotated_rectangle
    c = list(mrr.exterior.coords)[:4]
    e1 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e2 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
    L1, L2 = math.hypot(*e1), math.hypot(*e2)
    along, across, La, Lb = (e1, e2, L1, L2) if L1 >= L2 else (e2, e1, L2, L1)
    ang = math.degrees(math.atan2(along[1], along[0]))
    ctr = B.centroid
    R = affinity.rotate(B, -ang, origin=ctr)
    x0, y0, x1, y1 = R.bounds
    RB = [affinity.rotate(b, -ang, origin=ctr) for b in BLDS if b.intersects(B)]
    rows = 2 if (y1 - y0) >= 44 else 1
    ys = [y0, y1]
    if rows == 2:
        # the back-to-back line: near the middle, crossing as few buildings as possible
        cost = lambda y: sum(b.intersection(LineString([(x0 - 1, y), (x1 + 1, y)])).length for b in RB) + abs(y - (y0 + y1) / 2) * 0.05
        ym = min((y0 + (y1 - y0) * (0.3 + 0.4 * k / 80) for k in range(81)), key=cost) if RB else (y0 + y1) / 2
        ys = [y0, ym, y1]
    n = max(1, round((x1 - x0) / 20))
    out = []
    for r in range(rows):
        ya, yb = ys[r], ys[r + 1]
        band = box(x0 - 1, ya + 0.5, x1 + 1, yb - 0.5)
        occ = merged([g.bounds[0::2] for g in (b.intersection(band) for b in RB) if not g.is_empty and g.area > 4])
        xs = [x0]
        for k in range(1, n):
            c = snap(x0 + (x1 - x0) * k / n, occ, 9)
            if c is not None and c - xs[-1] >= 11 and x1 - c >= 11: xs.append(c)   # narrower than 11 m: merge with the neighbour
        xs.append(x1)
        for k in range(len(xs) - 1):
            xa, xb = xs[k], xs[k + 1]
            cell = box(xa, ya, xb, yb).intersection(R)
            if cell.is_empty: continue
            for g in getattr(cell, 'geoms', [cell]):
                if g.geom_type == 'Polygon' and g.area > 150:
                    out.append(affinity.rotate(g, ang, origin=ctr))
    return out, ang

def rnd(geom):
    return [[round(x, 2), round(y, 2)] for x, y in list(geom.exterior.coords)[:-1]]

plots, bl_out = [], []
pid = 1
for bi, B in enumerate(sorted(blocks, key=lambda g: (-round(g.centroid.y / 40), g.centroid.x))):
    cells, ang = split_block(B)
    bl_out.append({'id': bi + 1, 'poly': rnd(B), 'area': round(B.area), 'angle': round(ang, 2)})
    for g in cells:
        # which street does the plot front? nearest street edge, and its name/width
        best, bd = None, 1e9
        for s in streets:
            dd = g.distance(s['poly'])
            if dd < bd: bd, best = dd, s
        cp = g.centroid
        np_ = best['line'].interpolate(best['line'].project(cp))
        face_ang = math.degrees(math.atan2(np_.y - cp.y, np_.x - cp.x))   # direction from plot to street, 0 = east, 90 = north
        plots.append({'id': pid, 'block': bi + 1, 'poly': rnd(g), 'area': round(g.area, 1), 'face': round(face_ang, 1),
                      'street': best['name'], 'streetW': best['width'], 'streetType': best['type'], 'corner': False})
        pid += 1
# corner plots: touching two or more streets within 1.5 m
for p in plots:
    g = Polygon(p['poly'])
    near = {s['id'] for s in streets if g.distance(s['poly']) < 1.5}
    p['corner'] = len(near) >= 2
out = {
    'origin': {'lat': LAT0, 'lon': LON0},
    'area': rnd(AREA), 'areaHa': round(AREA.area / 1e4, 2),
    'streets': [{'id': s['id'], 'type': s['type'], 'name': s['name'], 'width': s['width'], 'done': s['done'],
                 'polys': [rnd(g) for g in getattr(s['poly'], 'geoms', [s['poly']]) if g.geom_type == 'Polygon' and g.area > 5],
                 'line': [[round(x, 2), round(y, 2)] for x, y in s['line'].coords]} for s in streets],
    'blocks': bl_out, 'plots': plots,
    'source': 'OpenStreetMap contributors (ODbL), downloaded via api.openstreetmap.org',
}

print('plots', len(plots), 'corner', sum(p['corner'] for p in plots), 'median area', sorted(p['area'] for p in plots)[len(plots) // 2])
print('json KB', round(len(json.dumps(out, ensure_ascii=False)) / 1024))

# ---- extra layers for the 3D page: merged road surfaces, sidewalks, street labels
def poly_out(g):
    gs = [x for x in getattr(g, 'geoms', [g]) if x.geom_type == 'Polygon' and x.area > 4]
    return [{'outer': rnd(x), 'holes': [[[round(a, 2), round(b, 2)] for a, b in list(h.coords)[:-1]] for h in x.interiors]} for x in gs]
done_u = unary_union([s['poly'] for s in streets if s['done']])
todo_u = unary_union([s['poly'] for s in streets if not s['done']]).difference(done_u)
walk_u = unary_union([B.buffer(2.0, join_style=2).difference(B) for B in blocks]).intersection(done_u)
labels = []
for s in streets:
    if not s['name']: continue
    seg = s['line'].intersection(AOI)
    if seg.is_empty: continue
    seg = max(getattr(seg, 'geoms', [seg]), key=lambda g: g.length)
    if seg.length < 60: continue
    m = seg.interpolate(0.5, normalized=True)
    labels.append({'name': s['name'], 'x': round(m.x, 1), 'y': round(m.y, 1), 'len': round(seg.length)})
for p in plots:
    c = Polygon(p['poly']).centroid; p['c'] = [round(c.x, 1), round(c.y, 1)]
out['roadsDone'] = poly_out(done_u); out['roadsTodo'] = poly_out(todo_u); out['walks'] = poly_out(walk_u)
out['labels'] = labels
if BLD:
    from shapely.strtree import STRtree
    bt = STRtree(BLDS)
    for p in plots:
        g = Polygon(p['poly'])
        p['bld'] = sum(1 for j in bt.query(g) if g.contains(BLDS[int(j)].representative_point()))
    mosque_ids = {m['bld'] for m in MOSQUES if m['bld'] is not None}
    out['buildings'] = [building_out(i, b, 'mosque' if i in mosque_ids else 'small' if b.area < 60 else 'bld')
                        for i, b in enumerate(BLDS) if b.intersects(AOI.buffer(700))]
    out['mosques'] = [{'x': m['x'], 'y': m['y'], 'name': m['name']} for m in MOSQUES if Point(m['x'], m['y']).distance(AOI) < 700]
    out['bldSource'] = 'Microsoft ML Building Footprints (ODbL) via Overture Maps'
    inside = [b for b in BLDS if b.intersects(AREA)]
    out['bldInArea'] = len(inside)
    cross = sum(1 for b in inside if sum(1 for p in plots if Polygon(p['poly']).intersection(b).area > 0.15 * b.area) > 1)
    print('buildings in the area', len(inside), 'crossing two or more plots', cross, 'plots built on', sum(p['bld'] > 0 for p in plots), 'of', len(plots))
out['streetLen'] = round(sum(s['line'].intersection(AOI).length for s in streets))
out['streetLenDone'] = round(sum(s['line'].intersection(AOI).length for s in streets if s['done']))
for s in out['streets']: s.pop('polys', None)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('final KB', round(len(json.dumps(out, ensure_ascii=False, separators=(',', ':'))) / 1024), 'labels', len(labels), 'streetLen', out['streetLen'], 'done', out['streetLenDone'])

# ---- neighbours (shared boundary of 3 m or more) and perimeter for each plot
from shapely.strtree import STRtree
pg = [Polygon(p['poly']) for p in plots]
tree = STRtree(pg)
for i, g in enumerate(pg):
    near = []
    for j in tree.query(g.buffer(0.05)):
        j = int(j)
        if j == i: continue
        if g.boundary.intersection(pg[j].boundary).length >= 3: near.append(plots[j]['id'])
    plots[i]['near'] = near[:8]
    plots[i]['perim'] = round(g.length, 1)
out['plots'] = plots
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('with neighbours KB', round(len(json.dumps(out, ensure_ascii=False, separators=(',', ':'))) / 1024), 'avg near', round(sum(len(p['near']) for p in plots) / len(plots), 2))
