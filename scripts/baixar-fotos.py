"""Downloads CC0 / public-domain photos (Openverse) for the interface. Respects the anonymous
rate limit by waiting when throttled. Writes public/fotos/<slug>.jpg and public/fotos/creditos.json."""
import json, os, re, sys, time, urllib.request, urllib.parse

DEST = os.path.join(os.path.dirname(__file__), "..", "public", "fotos")
BUSCAS = {
    "clinica": "dentist clinic patient",
    "imobiliaria": "house keys real estate",
    "restaurante": "restaurant dining table",
    "oficina": "car mechanic garage",
    "petshop": "dog grooming",
    "salao": "hair salon",
    "advocacia": "lawyer office desk",
    "academia": "gym fitness",
    "veterinaria": "veterinarian dog",
    "escola": "classroom students",
    "atendimento": "woman smiling phone call",
    "headset": "customer service headset",
    "recepcao": "office reception desk",
    "cidade-noite": "city night lights",
    "equipe": "team meeting office",
}
creditos_path = os.path.join(DEST, "creditos-cc0.json")
creditos = json.load(open(creditos_path)) if os.path.exists(creditos_path) else {}

def get(url):
    req = urllib.request.Request(url, headers={"user-agent": "recepta-assets/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

for slug, q in BUSCAS.items():
    if slug in creditos or os.path.exists(os.path.join(DEST, f"{slug}.jpg")):
        continue  # never overwrite a photo already in the project
    while True:
        u = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({"q": q, "license": "cc0,pdm", "page_size": 20, "size": "large", "aspect_ratio": "wide,square"})
        try:
            j = json.loads(get(u))
        except urllib.error.HTTPError as e:
            j = json.loads(e.read() or b"{}")
        if "throttled" in str(j.get("detail", "")):
            espera = int(re.search(r"(\d+) seconds", j["detail"]).group(1)) + 5
            print(f"aguardando {espera}s ({slug})", flush=True)
            time.sleep(espera)
            continue
        break
    ok = False
    for r in j.get("results", []):
        if (r.get("width") or 0) < 1000:
            continue
        try:
            dados = get(r["url"])
        except Exception:
            continue
        if len(dados) < 30_000:
            continue
        open(os.path.join(DEST, f"{slug}.jpg"), "wb").write(dados)
        creditos[slug] = {"titulo": r.get("title"), "fonte": r.get("source"), "licenca": r.get("license"), "pagina": r.get("foreign_landing_url"), "autor": r.get("creator")}
        json.dump(creditos, open(creditos_path, "w"), ensure_ascii=False, indent=1)
        print("ok", slug, r.get("source"), flush=True)
        ok = True
        break
    if not ok:
        print("sem foto", slug, flush=True)
    time.sleep(20)
print("FIM", flush=True)
