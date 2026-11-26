"""CC0 / public-domain (or CC BY, with credit) photos from Wikimedia Commons for the interface.
Never overwrites a photo already in public/fotos. Credits in public/fotos/creditos-commons.json."""
import json, os, re, sys, urllib.parse, urllib.request

DEST = os.path.join(os.path.dirname(__file__), "..", "public", "fotos")
BUSCAS = {
    "oficina": ["car mechanic repairing engine", "auto repair shop mechanic"],
    "petshop": ["dog grooming salon", "dog being groomed"],
    "advocacia": ["lawyer office meeting", "law office desk books"],
    "academia": ["gym fitness training weights", "fitness gym interior"],
    "veterinaria": ["veterinarian examining dog", "veterinary clinic dog"],
    "escola": ["classroom students teacher", "students classroom"],
    "atendimento": ["woman talking on phone smiling", "receptionist telephone"],
    "headset": ["call center headset woman", "customer service headset"],
    "recepcao": ["office reception desk", "hotel reception desk"],
    "cidade-noite": ["city skyline night lights", "São Paulo at night"],
    "equipe": ["business team meeting office", "office meeting colleagues"],
}
LIVRE = re.compile(r"^(cc0|public domain|pd)", re.I)
COM_CREDITO = re.compile(r"^cc by(-sa)? [0-9.]+$", re.I)
cred_path = os.path.join(DEST, "creditos-commons.json")
creditos = json.load(open(cred_path)) if os.path.exists(cred_path) else {}

import time
def get(url, tentativa=0):
    time.sleep(1.5)
    try:
        return _get(url)
    except urllib.error.HTTPError as e:
        if e.code == 429 and tentativa < 4:
            time.sleep(20 * (tentativa + 1))
            return get(url, tentativa + 1)
        raise

def _get(url):
    req = urllib.request.Request(url, headers={"user-agent": "ReceptaAssets/1.0 (https://recepta-cg4o.onrender.com)"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

def limpar(h):
    return re.sub(r"<[^>]+>", "", h or "").strip()

def candidatos(q):
    p = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrsearch": f"{q} filetype:bitmap", "gsrlimit": 30,
         "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 1600}
    j = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(p)))
    pages = sorted(j.get("query", {}).get("pages", {}).values(), key=lambda x: x.get("index", 99))
    for pg in pages:
        ii = (pg.get("imageinfo") or [{}])[0]
        if ii.get("mime") != "image/jpeg" or ii.get("width", 0) < 1200 or ii.get("width", 0) < ii.get("height", 0):
            continue
        m = ii.get("extmetadata", {})
        lic = limpar(m.get("LicenseShortName", {}).get("value"))
        yield pg["title"], ii, lic, limpar(m.get("Artist", {}).get("value"))

for slug, qs in BUSCAS.items():
    if os.path.exists(os.path.join(DEST, f"{slug}.jpg")):
        continue
    escolhido = None
    for q in qs:
        cs = list(candidatos(q))
        escolhido = next((c for c in cs if LIVRE.match(c[2])), None) or next((c for c in cs if COM_CREDITO.match(c[2])), None)
        if escolhido:
            break
    if not escolhido:
        print("sem foto", slug, flush=True)
        continue
    titulo, ii, lic, autor = escolhido
    open(os.path.join(DEST, f"{slug}.jpg"), "wb").write(get(ii.get("thumburl") or ii["url"]))
    creditos[slug] = {"arquivo": titulo, "licenca": lic, "autor": autor, "pagina": ii.get("descriptionurl")}
    json.dump(creditos, open(cred_path, "w"), ensure_ascii=False, indent=1)
    print("ok", slug, lic, "|", titulo[:70], flush=True)
print("FIM", flush=True)
