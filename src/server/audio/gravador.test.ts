import { describe, expect, it } from "vitest";
import { Gravador, TAXA, picos } from "./gravador";

const pcm = (n: number, v: number) => {
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(v, i * 2);
  return new Uint8Array(b);
};

describe("Gravador", () => {
  it("mistura cliente (relógio) e agente (fila), gera WAV PCM16 mono 16 kHz", () => {
    let t = 0;
    const g = new Gravador("pcm_16000", () => t);
    t = 500;
    g.entrada(pcm(TAXA / 2, 1000)); // 0.5 s of caller audio ending at t=0.5 s
    g.saida(pcm(TAXA, 2000)); // 1 s of TTS starting at t=0.5 s
    g.saida(pcm(TAXA, 2000)); // queued after the first second, not overlapping
    const { wav, picos: p } = g.finalizar(10);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(TAXA);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect((wav.length - 44) / 2).toBe(TAXA * 2.5);
    expect(wav.readInt16LE(44 + 10 * 2)).toBe(1000);
    expect(wav.readInt16LE(44 + (TAXA * 2) * 2)).toBe(2000);
    expect(p).toHaveLength(10);
    expect(Math.max(...p)).toBe(1);
  });

  it("interrupção corta o áudio do agente que ainda não tinha sido ouvido", () => {
    let t = 0;
    const g = new Gravador("pcm_16000", () => t);
    g.saida(pcm(TAXA * 3, 2000)); // 3 s queued at once
    t = 1000;
    g.interromper(); // caller talked over at 1 s
    expect(g.duracaoS).toBeCloseTo(1, 2);
  });

  it("decodifica μ-law 8 kHz (Twilio) para 16 kHz", () => {
    const g = new Gravador("ulaw_8000", () => 0);
    g.saida(new Uint8Array(8000).fill(0x00)); // max negative amplitude in μ-law
    const { wav } = g.finalizar();
    expect((wav.length - 44) / 2).toBe(16000);
    expect(wav.readInt16LE(44)).toBeLessThan(-30000);
  });

  it("envelope vazio para áudio vazio", () => {
    expect(picos(new Int16Array(0), 10)).toEqual([]);
  });
});
