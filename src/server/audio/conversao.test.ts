import { describe, expect, it } from "vitest";
import { wav } from "./gravador";
import { converter, lerWav, linearParaUlaw, reamostrar } from "./conversao";

function wavFloat32Estereo(taxa: number, n: number): Uint8Array {
  const b = Buffer.alloc(44 + n * 8);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 8, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(taxa, 24);
  b.writeUInt32LE(taxa * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write("data", 36); b.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { b.writeFloatLE(0.5, 44 + i * 8); b.writeFloatLE(0.1, 48 + i * 8); }
  return new Uint8Array(b);
}

describe("Conversão de áudio", () => {
  it("lê PCM16 mono e float32 estéreo (mixa para mono)", () => {
    const p = lerWav(new Uint8Array(wav(new Int16Array([16384, -16384]), 24000)));
    expect(p.taxa).toBe(24000);
    expect([...p.amostras]).toEqual([0.5, -0.5]);
    const f = lerWav(wavFloat32Estereo(48000, 4));
    expect(f.amostras[0]).toBeCloseTo(0.3, 5);
  });

  it("reamostra 48 kHz → 16 kHz e 8 kHz com a duração certa", () => {
    const p = { amostras: new Float32Array(48000).fill(0.25), taxa: 48000 };
    expect(reamostrar(p, 16000).length).toBe(16000);
    expect(reamostrar(p, 8000)[4000]).toBeCloseTo(0.25, 3);
  });

  it("μ-law G.711: silêncio = 0xFF, extremos = 0x80 / 0x00", () => {
    expect(linearParaUlaw(0)).toBe(0xff);
    expect(linearParaUlaw(1)).toBe(0x80);
    expect(linearParaUlaw(-1)).toBe(0x00);
  });

  it("WAV 24 kHz → PCM16 16 kHz (2 bytes/amostra) e μ-law 8 kHz (1 byte/amostra)", () => {
    const w = new Uint8Array(wav(new Int16Array(24000), 24000)); // 1 s
    expect(converter(w, "pcm_16000").length).toBe(32000);
    expect(converter(w, "ulaw_8000").length).toBe(8000);
  });
});
