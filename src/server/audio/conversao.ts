/**
 * WAV → telephony formats. Self-hosted voice engines return WAV at their native rate
 * (24–48 kHz, PCM16 or float32); calls need PCM16 16 kHz (browser) or μ-law 8 kHz (Twilio).
 */
export interface Pcm {
  amostras: Float32Array; // mono, -1..1
  taxa: number;
}

export function lerWav(buf: Uint8Array): Pcm {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Áudio não é WAV");
  let fmt = { formato: 1, canais: 1, taxa: 16000, bits: 16 };
  let dados: { ini: number; tam: number } | null = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = tag(o);
    const tam = dv.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { formato: dv.getUint16(o + 8, true), canais: dv.getUint16(o + 10, true), taxa: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
    if (id === "data") {
      dados = { ini: o + 8, tam: Math.min(tam, buf.length - o - 8) };
      break;
    }
    o += 8 + tam + (tam % 2);
  }
  if (!dados) throw new Error("WAV sem dados");
  const formato = fmt.formato === 0xfffe ? (fmt.bits === 32 ? 3 : 1) : fmt.formato; // WAVE_FORMAT_EXTENSIBLE
  const bytes = fmt.bits / 8;
  const n = Math.floor(dados.tam / (bytes * fmt.canais));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let soma = 0;
    for (let c = 0; c < fmt.canais; c++) {
      const o = dados.ini + (i * fmt.canais + c) * bytes;
      soma += formato === 3 ? (fmt.bits === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true)) : fmt.bits === 16 ? dv.getInt16(o, true) / 32768 : fmt.bits === 24 ? ((dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16)) / 8388608) : fmt.bits === 8 ? (dv.getUint8(o) - 128) / 128 : dv.getInt32(o, true) / 2147483648;
    }
    out[i] = soma / fmt.canais;
  }
  return { amostras: out, taxa: fmt.taxa };
}

/** Linear resampling with a simple box pre-filter when downsampling (enough for speech). */
export function reamostrar(p: Pcm, taxa: number): Float32Array {
  if (p.taxa === taxa) return p.amostras;
  const razao = p.taxa / taxa;
  let src = p.amostras;
  if (razao > 1.5) {
    const k = Math.floor(razao);
    const f = new Float32Array(src.length);
    let acc = 0;
    for (let i = 0; i < src.length; i++) {
      acc += src[i] - (i >= k ? src[i - k] : 0);
      f[i] = acc / Math.min(k, i + 1);
    }
    src = f;
  }
  const n = Math.floor(src.length / razao);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * razao;
    const a = Math.floor(x);
    const t = x - a;
    out[i] = (src[a] ?? 0) * (1 - t) + (src[a + 1] ?? src[a] ?? 0) * t;
  }
  return out;
}

export function paraPcm16(a: Float32Array): Uint8Array {
  const b = new Uint8Array(a.length * 2);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < a.length; i++) dv.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(a[i] * 32767))), true);
  return b;
}

/** Linear PCM sample → G.711 μ-law byte. */
export function linearParaUlaw(s: number): number {
  const BIAS = 0x84;
  let v = Math.max(-32635, Math.min(32635, Math.round(s * 32767)));
  const sinal = v < 0 ? 0x80 : 0;
  if (v < 0) v = -v;
  v += BIAS;
  let exp = 7;
  for (let m = 0x4000; (v & m) === 0 && exp > 0; m >>= 1) exp--;
  const mant = (v >> (exp + 3)) & 0x0f;
  return ~(sinal | (exp << 4) | mant) & 0xff;
}

export function paraUlaw(a: Float32Array): Uint8Array {
  const b = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) b[i] = linearParaUlaw(a[i]);
  return b;
}

export function converter(wav: Uint8Array, formato: "pcm_16000" | "ulaw_8000"): Uint8Array {
  const p = lerWav(wav);
  return formato === "pcm_16000" ? paraPcm16(reamostrar(p, 16000)) : paraUlaw(reamostrar(p, 8000));
}
