#!/usr/bin/env python3
"""تجهيز هوية قروب جديد في خطوة واحدة.

يحدّث: قسم brand ومركز الخريطة في config.js، ملف manifest.webmanifest، عناوين index.html،
عنوان الإشعار الافتراضي في sw.js، واللوقو والأيقونات (إذا أُعطي --logo).

مثال:
  python3 tools/brand.py --name "Riyadh Riders" --word1 "Riyadh " --word2 "Riders" \\
      --city "الرياض" --lat 24.7136 --lng 46.6753 \\
      --from "#ff6b2f" --to "#ff2f6b" --accent "#ff5a3d" --highlight "#ffc229" \\
      --logo ~/logo.png [--mark ~/mark.png]

كل الخيارات اختيارية: ما لا تذكره يبقى كما هو.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def read(p):
    with open(p, encoding='utf-8') as f: return f.read()
def write(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def js(s): return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main():
    ap = argparse.ArgumentParser(description='تجهيز هوية قروب جديد')
    ap.add_argument('--name'); ap.add_argument('--word1'); ap.add_argument('--word2')
    ap.add_argument('--city'); ap.add_argument('--lat', type=float); ap.add_argument('--lng', type=float)
    ap.add_argument('--zoom', type=int)
    ap.add_argument('--from', dest='c_from'); ap.add_argument('--to', dest='c_to')
    ap.add_argument('--accent'); ap.add_argument('--highlight')
    ap.add_argument('--logo', help='اللوقو الكامل PNG (يفضّل بخلفية شفافة)')
    ap.add_argument('--mark', help='الرمز الصغير PNG (اختياري؛ الافتراضي: اللوقو نفسه)')
    ap.add_argument('--bg', default='#07080d', help='خلفية الأيقونة')
    a = ap.parse_args()

    for k in ('c_from', 'c_to', 'accent', 'highlight', 'bg'):
        v = getattr(a, k)
        if v and not HEX.match(v): sys.exit(f'لون غير صالح: {v} (الصيغة #rrggbb)')
    if (a.lat is None) != (a.lng is None): sys.exit('أعطِ --lat و --lng معًا')

    cfg_p = P('config.js')
    cfg = read(cfg_p)
    m = re.search(r"brand:\s*\{.*?\n  \},", cfg, re.S)
    if not m: sys.exit('لم أجد قسم brand في config.js')
    block = m.group(0)
    old_name = re.search(r"name:\s*'((?:[^'\\]|\\.)*)'", block).group(1)

    def setk(b, key, val):
        return re.sub(rf"({key}:\s*)'(?:[^'\\]|\\.)*'", lambda mm: mm.group(1) + js(val), b, count=1)
    nb = block
    if a.name: nb = setk(nb, 'name', a.name)
    if a.city: nb = setk(nb, 'city', a.city)
    if a.word1 is not None or a.word2 is not None:
        cur = re.search(r"wordmark:\s*\['((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'\]", nb)
        w1 = a.word1 if a.word1 is not None else cur.group(1)
        w2 = a.word2 if a.word2 is not None else cur.group(2)
        nb = re.sub(r"wordmark:\s*\[[^\]]*\]", lambda _: f"wordmark: [{js(w1)}, {js(w2)}]", nb, count=1)
    for key, val in (('from', a.c_from), ('to', a.c_to), ('accent', a.accent), ('highlight', a.highlight)):
        if val: nb = re.sub(rf"(\b{key}:\s*)'#[0-9a-fA-F]{{6}}'", lambda mm: mm.group(1) + js(val.lower()), nb, count=1)
    cfg = cfg.replace(block, nb)
    if a.lat is not None:
        cfg = re.sub(r"defaultCenter:\s*\[[^\]]*\]", f"defaultCenter: [{a.lat}, {a.lng}]", cfg, count=1)
    if a.zoom: cfg = re.sub(r"defaultZoom:\s*\d+", f"defaultZoom: {a.zoom}", cfg, count=1)
    write(cfg_p, cfg)
    done = ['config.js']

    name = a.name or old_name
    if a.name and a.name != old_name:
        mf = json.loads(read(P('manifest.webmanifest')))
        mf['name'] = name; mf['short_name'] = name[:12] if len(name) > 12 and ' ' not in name else name
        mf['description'] = f'تطبيق قروب {name} الخاص'
        write(P('manifest.webmanifest'), json.dumps(mf, ensure_ascii=False, indent=2) + '\n')
        html = read(P('index.html'))
        html = re.sub(r'<title>.*?</title>', f'<title>{name}</title>', html, count=1)
        html = re.sub(r'(<meta name="description" content=")[^"]*', lambda mm: mm.group(1) + f'تطبيق قروب {name} الخاص', html, count=1)
        html = re.sub(r'(<meta name="apple-mobile-web-app-title" content=")[^"]*', lambda mm: mm.group(1) + name, html, count=1)
        html = re.sub(r'(<img class="brand-logo"[^>]*alt=")[^"]*', lambda mm: mm.group(1) + name, html, count=1)
        write(P('index.html'), html)
        sw = read(P('sw.js')).replace(js(old_name), js(name))
        write(P('sw.js'), sw)
        done += ['manifest.webmanifest', 'index.html', 'sw.js']

    if a.logo:
        from PIL import Image
        logo = Image.open(os.path.expanduser(a.logo)).convert('RGBA')
        mark = Image.open(os.path.expanduser(a.mark)).convert('RGBA') if a.mark else logo
        bg = tuple(int(a.bg[i:i + 2], 16) for i in (1, 3, 5))

        def fit(im, w, h):
            im = im.copy(); im.thumbnail((w, h), Image.LANCZOS); return im
        def icon(size, pad):
            c = Image.new('RGB', (size, size), bg)
            inner = int(size * (1 - 2 * pad))
            im = fit(mark, inner, inner)
            c.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
            return c
        fit(logo, 640, 640).save(P('assets', 'img', 'logo-full.png'), optimize=True)
        fit(mark, 256, 256).save(P('assets', 'img', 'logo-mark.png'), optimize=True)
        icon(192, .08).save(P('assets', 'icons', 'icon-192-v2.png'), optimize=True)
        icon(512, .08).save(P('assets', 'icons', 'icon-512-v2.png'), optimize=True)
        icon(512, .2).save(P('assets', 'icons', 'maskable-512-v2.png'), optimize=True)   # منطقة آمنة للأيقونات الدائرية
        icon(180, .1).save(P('assets', 'icons', 'apple-touch-icon-v2.png'), optimize=True)
        done += ['assets/img/logo-*.png', 'assets/icons/*.png']

    # نسخة جديدة من الكاش عشان التغييرات توصل للأجهزة
    sw = read(P('sw.js'))
    mv = re.search(r"const VERSION = 'nr-v(\d+)\.(\d+)\.(\d+)'", sw)
    if mv:
        nv = f"nr-v{mv.group(1)}.{mv.group(2)}.{int(mv.group(3)) + 1}"
        write(P('sw.js'), sw.replace(mv.group(0), f"const VERSION = '{nv}'"))
    print('تم التحديث:', '، '.join(done))
    print(f'الاسم: {name}')


if __name__ == '__main__':
    main()
