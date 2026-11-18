"""Render a REA inspect-web-page accessibility tree as an indented outline (headings, landmarks, controls, text)."""
import json, sys
KEEP = {"heading","link","button","navigation","main","contentinfo","banner","region","tab","tablist","combobox","textbox","img","StaticText","listitem","article","complementary","slider","switch","checkbox","menuitem","form","search","dialog"}
d = json.load(open(sys.argv[1]))["normalized_result"]["accessibility"]["nodes"]
by = {n["node_id"]: n for n in d}
kids = {}
for n in d:
    kids.setdefault(n["parent_id"], []).append(n["node_id"])
roots = [n["node_id"] for n in d if n["parent_id"] is None]
mode = sys.argv[2] if len(sys.argv) > 2 else "full"
out = []
def walk(nid, depth):
    n = by[nid]
    role, name = n["role"], (n.get("name") or "").strip()
    shown = False
    if not n.get("ignored") and role in KEEP and name:
        if mode == "full" or role != "StaticText":
            lvl = next((s["value"] for s in n["states"] if s["name"] == "level"), "")
            out.append("  " * min(depth, 12) + f"[{role}{lvl}] {name[:160]}")
            shown = True
    if role == "StaticText":
        return
    for k in kids.get(nid, []):
        walk(k, depth + (1 if shown else 0))
for r in roots:
    walk(r, 0)
print("\n".join(out))
