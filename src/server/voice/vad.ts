/** Energy-based voice activity detection on 16-bit PCM, with an adaptive noise floor. */

const MULAW_TABELA = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff;
    const sinal = u & 0x80 ? -1 : 1;
    const exp = (u >> 4) & 0x07;
    const mant = u & 0x0f;
    t[i] = sinal * (((mant << 3) + 0x84) << exp) - sinal * 0x84;
  }
  return t;
})();

export function mulawParaPcm16(mulaw: Buffer): Buffer {
  const out = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) out.writeInt16LE(MULAW_TABELA[mulaw[i]], i * 2);
  return out;
}

export function rms(pcm: Buffer): number {
  let soma = 0;
  const n = Math.floor(pcm.length / 2);
  for (let i = 0; i < n; i++) {
    const s = pcm.readInt16LE(i * 2);
    soma += s * s;
  }
  return n ? Math.sqrt(soma / n) : 0;
}

export interface EventosVad {
  aoComecar: () => void;
  aoTerminar: (utterance: Buffer) => void;
}

/**
 * Segments a PCM16 stream into utterances: speech starts when energy exceeds the noise floor
 * by a margin for `inicioMs`, and ends after `silencioMs` of quiet.
 */
export class Vad {
  private piso = 300;
  private falando = false;
  private msVoz = 0;
  private msSilencio = 0;
  private atual: Buffer[] = [];
  private preRoll: Buffer[] = [];

  constructor(
    private ev: EventosVad,
    private opts: { sampleRate: number; inicioMs?: number; silencioMs?: number; margem?: number } = { sampleRate: 16000 },
  ) {}

  processar(pcm: Buffer) {
    const frameBytes = Math.round(this.opts.sampleRate * 0.02) * 2; // 20 ms frames
    for (let i = 0; i + frameBytes <= pcm.length; i += frameBytes) this.frame(pcm.subarray(i, i + frameBytes));
  }

  private frame(f: Buffer) {
    const e = rms(f);
    const voz = e > Math.max(this.piso * (this.opts.margem ?? 2.5), 450);
    if (!this.falando) {
      this.preRoll.push(f);
      if (this.preRoll.length > 15) this.preRoll.shift();
      if (!voz) this.piso = this.piso * 0.95 + e * 0.05;
      this.msVoz = voz ? this.msVoz + 20 : 0;
      if (this.msVoz >= (this.opts.inicioMs ?? 120)) {
        this.falando = true;
        this.atual = [...this.preRoll];
        this.preRoll = [];
        this.msSilencio = 0;
        this.ev.aoComecar();
      }
      return;
    }
    this.atual.push(f);
    this.msSilencio = voz ? 0 : this.msSilencio + 20;
    if (this.msSilencio >= (this.opts.silencioMs ?? 700) || this.atual.length * 20 > 30_000) {
      this.falando = false;
      this.msVoz = 0;
      const u = Buffer.concat(this.atual);
      this.atual = [];
      this.ev.aoTerminar(u);
    }
  }
}
