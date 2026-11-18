"""Generates a seamless (tileable) Perlin noise texture used by the Orb shader (red channel)."""
import numpy as np
from PIL import Image

def perlin_tileavel(tam=512, periodo=8, oitavas=4, semente=11):
    rng = np.random.default_rng(semente)
    total = np.zeros((tam, tam))
    amp, soma_amp = 1.0, 0.0
    for o in range(oitavas):
        p = periodo * 2**o
        ang = rng.uniform(0, 2 * np.pi, (p + 1, p + 1))
        ang[-1, :] = ang[0, :]
        ang[:, -1] = ang[:, 0]
        g = np.stack([np.cos(ang), np.sin(ang)], -1)
        lin = np.linspace(0, p, tam, endpoint=False)
        x, y = np.meshgrid(lin, lin)
        x0, y0 = x.astype(int), y.astype(int)
        fx, fy = x - x0, y - y0
        def dot(ix, iy, dx, dy):
            v = g[iy % (p + 1), ix % (p + 1)]
            return v[..., 0] * dx + v[..., 1] * dy
        n00, n10 = dot(x0, y0, fx, fy), dot(x0 + 1, y0, fx - 1, fy)
        n01, n11 = dot(x0, y0 + 1, fx, fy - 1), dot(x0 + 1, y0 + 1, fx - 1, fy - 1)
        u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
        v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
        total += amp * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v)
        soma_amp += amp
        amp *= 0.5
    total /= soma_amp
    total = (total - total.min()) / (total.max() - total.min())
    # The shader sizes each colour oval from this value (a = 0.5 + 0.3n, b = 3.5n): a soft,
    # mid-range texture keeps the ovals overlapping (smooth orb) instead of separate lobes.
    total = LO + (HI - LO) * total
    return (total * 255).astype(np.uint8)

LO, HI = 0.42, 0.78
r = perlin_tileavel(periodo=4, oitavas=3)
Image.fromarray(np.stack([r, r, r], -1), "RGB").save("public/elevenlabs-ui/perlin-noise.png")
print("public/elevenlabs-ui/perlin-noise.png")
