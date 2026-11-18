import { afterEach, describe, expect, it, vi } from "vitest";
import { wav } from "@/server/audio/gravador";
import { getTtsEngine, ttsConfigurado } from "./tts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Motores de voz por voz do catálogo", () => {
  it("cada voz usa o motor dela; motor próprio só fica disponível com URL configurada", () => {
    vi.stubEnv("VOICESTUDIO_URL", "");
    vi.stubEnv("TTS_API_KEY", "x");
    expect(getTtsEngine("lia").name).toBe("premium");
    expect(getTtsEngine("clara").name).toBe("voicestudio");
    expect(getTtsEngine("marina").name).toBe("drama");
    expect(ttsConfigurado("clara")).toBe(false);
    vi.stubEnv("VOICESTUDIO_URL", "http://vs.local:3900");
    expect(ttsConfigurado("clara")).toBe(true);
  });

  it("VoiceStudio: envia texto + design de voz e converte o WAV para μ-law em quadros de 40 ms", async () => {
    vi.stubEnv("VOICESTUDIO_URL", "http://vs.local:3900");
    let corpo: FormData | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        corpo = init.body as FormData;
        return new Response(new Uint8Array(wav(new Int16Array(24000), 24000)), { headers: { "content-type": "audio/wav" } });
      }),
    );
    const quadros: Uint8Array[] = [];
    for await (const q of getTtsEngine("clara").stream({ voiceId: "clara", text: "Bom dia!", formato: "ulaw_8000" })) quadros.push(q);
    expect(corpo?.get("text")).toBe("Bom dia!");
    expect(corpo?.get("language")).toBe("pt");
    expect(String(corpo?.get("instruct"))).toMatch(/feminina/);
    expect(quadros.reduce((a, q) => a + q.length, 0)).toBe(8000);
    expect(quadros[0].length).toBe(320);
  });
});
