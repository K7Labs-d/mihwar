#!/usr/bin/env python3
"""يجمع منصّة مِحور متعدّدة الصفحات في ملف HTML واحد قائم بذاته للنشر السحابي."""

import base64
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "mihwar")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "mihwar-cloud.html")
CACHE = os.path.join(ROOT, ".cache", "fonts")
FONT_CSS = os.path.join(CACHE, "fonts.css")
FONT_URL = ("https://fonts.googleapis.com/css2"
            "?family=Cairo:wght@400;600;700&family=Tajawal:wght@700;800&display=swap")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

PAGES = [
    "index.html",
    "equipment/detail.html",
    "equipment/excavator-cat-320.html",
    "admin/login.html",
    "admin/index.html",
    "admin/owner.html",
    "admin/equipment.html",
    "admin/order.html",
]


def read(path):
    with open(os.path.join(SRC, path), encoding="utf-8") as fh:
        return fh.read()


def norm(base, href):
    """يحلّ مساراً نسبياً مقابل صفحة، ويعيد المسار من جذر المشروع."""
    parts = base.split("/")[:-1] + href.split("/")
    stack = []
    for part in parts:
        if part in ("", "."):
            continue
        if part == "..":
            if stack:
                stack.pop()
        else:
            stack.append(part)
    return "/".join(stack)


# ---------------------------------------------------------------- الخطوط

def fetch(url, dest):
    """ينزّل ملفاً مرة واحدة ويخزّنه في ‎.cache‎ كي لا تتكرّر الطلبات."""
    if os.path.exists(dest):
        return open(dest, "rb").read()
    sys.stderr.write("fetching %s\n" % url.rsplit("/", 1)[-1])
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        blob = resp.read()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "wb").write(blob)
    return blob


def inline_fonts():
    """يحوّل خطوط Cairo و Tajawal إلى data URI — لا طلبات خارجية بعد النشر."""
    css = fetch(FONT_URL, FONT_CSS).decode("utf-8")
    urls = sorted(set(re.findall(r"url\((https://[^)]+\.woff2)\)", css)))
    for url in urls:
        blob = fetch(url, os.path.join(CACHE, url.rsplit("/", 1)[-1]))
        uri = "data:font/woff2;base64," + base64.b64encode(blob).decode("ascii")
        css = css.replace(url, uri)
    return css


# ---------------------------------------------------------------- التحليل

head_style_re = re.compile(r"<style>(.*?)</style>", re.S)
head_script_re = re.compile(r"<script>(.*?)</script>", re.S)
script_src_re = re.compile(r'<script src="([^"]+)"[^>]*></script>')
css_link_re = re.compile(r'<link rel="stylesheet" href="([^"]+)">')
body_re = re.compile(r"<body([^>]*)>(.*)</body>", re.S)
html_re = re.compile(r"<html([^>]*)>")
title_re = re.compile(r"<title>(.*?)</title>", re.S)


def parse(path):
    raw = read(path)
    head = raw.split("<body", 1)[0]
    body_m = body_re.search(raw)
    html_attrs = html_re.search(raw).group(1)

    css_files = []
    for href in css_link_re.findall(head):
        if href.startswith("http"):
            continue
        css_files.append(norm(path, href.split("?")[0]))

    scripts = [norm(path, s.split("?")[0]) for s in script_src_re.findall(head)
               if not s.startswith("http")]

    return {
        "path": path,
        "title": title_re.search(raw).group(1).strip(),
        "htmlClass": (re.search(r'class="([^"]*)"', html_attrs).group(1)
                      if 'class="' in html_attrs else ""),
        "bodyAttrs": body_m.group(1).strip(),
        "body": body_m.group(2),
        "headStyles": head_style_re.findall(head),
        "headScript": "\n".join(head_script_re.findall(head)),
        "css": css_files,
        "scripts": scripts,
    }


pages = [parse(p) for p in PAGES]

# ------------------------------------------------- تجميع الأنماط والوحدات

css_order = []
for page in pages:
    for f in page["css"]:
        if f not in css_order:
            css_order.append(f)

styles = []
for f in css_order:
    styles.append("/* ===== %s ===== */\n%s" % (f, read(f)))

for page in pages:
    for block in page["headStyles"]:
        block = block.strip()
        if block and block not in styles:
            styles.append("/* ===== %s (inline) ===== */\n%s" % (page["path"], block))

modules = []
seen = set()
for page in pages:
    if page["headScript"].strip():
        modules.append(("head:" + page["path"], page["headScript"]))
    for f in page["scripts"]:
        if f not in seen:
            seen.add(f)
            modules.append((f, read(f)))

for name, src in modules:
    assert "</script" not in src, name

module_js = "\n".join(
    'MOD[%s] = function (location, history, localStorage, sessionStorage) {\n%s\n};'
    % (json.dumps(name), src)
    for name, src in modules
)

routes = {
    p["path"]: {
        "title": p["title"],
        "htmlClass": p["htmlClass"],
        "bodyAttrs": p["bodyAttrs"],
        "head": ("head:" + p["path"]) if p["headScript"].strip() else None,
        "scripts": p["scripts"],
    }
    for p in pages
}

templates = "\n".join(
    '<template data-route="%s">%s</template>' % (p["path"], p["body"]) for p in pages
)

fonts_css = inline_fonts()

RUNTIME = r"""
(function () {
  'use strict';

  var ROUTES = __ROUTES__;
  var HOME = 'index.html';
  var MOD = {};

  /* ------------------------------------------------ تخزين لا ينهار أبداً */

  function safeStorage(real) {
    var mem = {};
    var ok = false;
    try {
      real.setItem('__mihwar_probe__', '1');
      real.removeItem('__mihwar_probe__');
      ok = true;
    } catch (e) { ok = false; }
    if (ok) return real;
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; }
    };
  }

  var store = safeStorage((function () {
    try { return window.localStorage; } catch (e) { return {}; }
  })());
  var session = safeStorage((function () {
    try { return window.sessionStorage; } catch (e) { return {}; }
  })());

  /* --------------------------------------------- حلّ المسارات النسبية */

  function resolve(base, href) {
    var parts = base.split('/').slice(0, -1).concat(href.split('/'));
    var stack = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part === '' || part === '.') continue;
      if (part === '..') { stack.pop(); continue; }
      stack.push(part);
    }
    return stack.join('/');
  }

  function splitUrl(base, url) {
    var hash = '';
    var search = '';
    var rest = url;
    var hi = rest.indexOf('#');
    if (hi !== -1) { hash = rest.slice(hi); rest = rest.slice(0, hi); }
    var qi = rest.indexOf('?');
    if (qi !== -1) { search = rest.slice(qi); rest = rest.slice(0, qi); }
    var path = rest ? resolve(base, rest) : base;
    return { path: path, search: search, hash: hash };
  }

  /* --------------------------------------------------- موقع وهمي لكل صفحة */

  var current = { path: HOME, search: '', hash: '' };
  var pending = null;

  function makeLocation() {
    var route = current;
    var loc = {
      get pathname() { return '/' + route.path; },
      get search() { return route.search; },
      get hash() {
        return route.hash;
      },
      set hash(value) {
        var h = String(value);
        if (h.charAt(0) !== '#') h = '#' + h;
        route.hash = h;
        scrollToHash(h);
      },
      get host() { return window.location.host; },
      get hostname() { return window.location.hostname; },
      get protocol() { return window.location.protocol; },
      get origin() { return window.location.origin; },
      get href() { return '/' + route.path + route.search + route.hash; },
      set href(value) { navigate(splitUrl(route.path, String(value))); },
      assign: function (url) { navigate(splitUrl(route.path, String(url))); },
      replace: function (url) { navigate(splitUrl(route.path, String(url)), true); },
      reload: function () { render(current); },
      toString: function () { return loc.href; }
    };
    return loc;
  }

  function makeHistory() {
    return {
      get length() { return 1; },
      get state() { return null; },
      replaceState: function (state, title, url) {
        if (typeof url === 'string' && url) {
          var next = splitUrl(current.path, url);
          if (next.path === current.path) {
            current.search = next.search;
            current.hash = next.hash;
          }
        }
      },
      pushState: function (state, title, url) {
        this.replaceState(state, title, url);
      },
      back: function () { goBack(); },
      forward: function () {},
      go: function (delta) { if (delta < 0) goBack(); }
    };
  }

  /* --------------------------------------------------------- سجل التصفّح */

  var stack = [];

  function goBack() {
    var prev = stack.pop();
    render(prev || { path: HOME, search: '', hash: '' });
  }

  function navigate(next, replaceEntry) {
    if (!ROUTES[next.path]) {
      window.alert('هذه الصفحة غير متاحة في النسخة السحابية:\n' + next.path);
      return;
    }
    if (!replaceEntry) stack.push({ path: current.path, search: current.search, hash: current.hash });
    render(next);
  }

  function scrollToHash(hash) {
    if (!hash || hash === '#') return;
    var id = decodeURIComponent(hash.slice(1));
    var el = document.getElementById(id) || document.querySelector('[name="' + id + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* -------------------------------------------------------------- الرسم */

  var templates = {};

  function render(route) {
    current = { path: route.path, search: route.search || '', hash: route.hash || '' };
    var def = ROUTES[current.path];
    var root = document.documentElement;

    root.className = def.htmlClass || '';
    document.title = def.title;

    var body = document.body;
    body.removeAttribute('class');
    body.removeAttribute('style');
    var attrs = def.bodyAttrs || '';
    var cls = /class="([^"]*)"/.exec(attrs);
    if (cls) body.className = cls[1];
    body.innerHTML = templates[current.path];
    window.scrollTo(0, 0);

    var loc = makeLocation();
    var hist = makeHistory();
    var order = def.head ? [def.head].concat(def.scripts) : def.scripts.slice();

    for (var i = 0; i < order.length; i++) {
      var mod = MOD[order[i]];
      if (!mod) continue;
      try {
        mod(loc, hist, store, session);
      } catch (err) {
        if (err && err.__mihwarRedirect) return;
        window.console.error('[mihwar] ' + order[i], err);
      }
      if (current.path !== route.path) return;   // أعادت الصفحة التوجيه
    }

    decorate();
    if (current.hash) window.setTimeout(function () { scrollToHash(current.hash); }, 60);
  }

  /* -------------------------------------------- اعتراض الروابط الداخلية */

  function decorate() {
    document.body.setAttribute('data-cloud-route', current.path);
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    var link = event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href) return;
    if (/^(https?:|mailto:|tel:|data:|blob:)/i.test(href)) return;
    if (link.target && link.target !== '_self') return;

    event.preventDefault();
    var next = splitUrl(current.path, href);
    if (next.path === current.path && next.hash) {
      current.hash = next.hash;
      scrollToHash(next.hash);
      return;
    }
    navigate(next);
  }, true);

  /* ------------------------------------------------------------ الإقلاع */

  function boot() {
    document.documentElement.setAttribute('lang', 'ar');
    document.documentElement.setAttribute('dir', 'rtl');

    // الأنماط تصل داخل <body>، والموجّه يمسح الجسم عند كل انتقال — فتُنقل إلى <head> أولاً
    var styles = document.body.querySelectorAll('style, link[rel="stylesheet"]');
    for (var s = 0; s < styles.length; s++) document.head.appendChild(styles[s]);

    var nodes = document.querySelectorAll('template[data-route]');
    for (var i = 0; i < nodes.length; i++) {
      templates[nodes[i].getAttribute('data-route')] = nodes[i].innerHTML;
    }
    render({ path: HOME, search: '', hash: '' });
  }

  window.MihwarCloud = {
    go: function (path) { navigate(splitUrl(HOME, path)); },
    routes: Object.keys(ROUTES)
  };

  __MODULES__

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
"""

runtime = RUNTIME.replace("__ROUTES__", json.dumps(routes, ensure_ascii=False))
runtime = runtime.replace("__MODULES__", module_js)

html = """<title>مِحور — منصّة تأجير المعدات</title>
<meta name="description" content="مِحور: منصّة وساطة تربط مستأجري معدات الإنشاءات بمالكيها في السعودية — الموقع العام ولوحة الإدارة في تجربة واحدة.">
<style>
%s
</style>
<style>
%s
</style>
%s
<script>
%s
</script>
""" % (fonts_css, "\n\n".join(styles), templates, runtime)

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(html)

print("wrote %s (%.1f KB)" % (OUT, os.path.getsize(OUT) / 1024.0))
