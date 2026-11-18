/**
 * Call recorder: builds one mono 16 kHz track from the caller's audio (placed by wall clock)
 * and the receptionist's TTS (queued from when it starts playing, since TTS streams faster
 * than real time). Barge-in truncates whatever agent audio had not been heard yet.
 */
export const TAXA = 16_000;

/** μ-law byte → linear PCM16 (ITU-T G.711). */
function ulawParaPcm(u: number): number {
  u = ~u & 0xff;
  const sinal = u & 0x80;
  const exp = (u >> 4) & 0x07;
  const mant = u & 0x0f;
  let s = ((mant << 3) + 0x84) << exp;
  s -= 0x84;
  return sinal ? -s : s;
}

class Trilha {
  dados = new Int16Array(TAXA * 60);
  tamanho = 0;
  escrever(pos: number, amostras: Int16Array) {
    const fim = pos + amostras.length;
    if (fim > this.dados.length) {
      const n = new Int16Array(Math.max(fim, this.dados.length * 2));
      n.set(this.dados.subarray(0, this.tamanho));
      this.dados = n;
    }
    this.dados.set(amostras, pos);
    this.tamanho = Math.max(this.tamanho, fim);
  }
  truncar(pos: number) {
    if (pos < this.tamanho) {
      this.dados.fill(0, pos, this.tamanho);
      this.tamanho = pos;
    }
  }
}

export type FormatoGravacao = "pcm_16000" | "ulaw_8000";

export class Gravador {
  private inicio = Date.now();
  private cliente = new Trilha();
  private agente = new Trilha();
  private cursorAgente = 0;
  private cursorCliente = 0;

  constructor(
    private formato: FormatoGravacao,
    private agora: () => number = Date.now,
  ) {
    this.inicio = this.agora();
  }

  private posAgora() {
    return Math.floor(((this.agora() - this.inicio) / 1000) * TAXA);
  }

  private decodificar(chunk: Uint8Array): Int16Array {
    if (this.formato === "pcm_16000") {
      const b = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength - (chunk.byteLength % 2));
      const out = new Int16Array(b.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(i * 2);
      return out;
    }
    // μ-law 8 kHz → PCM16 16 kHz (sample doubling is enough for speech playback)
    const out = new Int16Array(chunk.length * 2);
    for (let i = 0; i < chunk.length; i++) out[2 * i] = out[2 * i + 1] = ulawParaPcm(chunk[i]);
    return out;
  }

  /** Caller audio arrives in real time: place it at the wall-clock position (never overlapping itself). */
  entrada(chunk: Uint8Array) {
    const a = this.decodificar(chunk);
    const pos = Math.max(this.cursorCliente, this.posAgora() - a.length);
    this.cliente.escrever(pos, a);
    this.cursorCliente = pos + a.length;
  }

  /** Agent TTS: queued after whatever the agent is still saying, starting no earlier than now. */
  saida(chunk: Uint8Array) {
    const a = this.decodificar(chunk);
    const pos = Math.max(this.cursorAgente, this.posAgora());
    this.agente.escrever(pos, a);
    this.cursorAgente = pos + a.length;
  }

  /** Barge-in: the caller interrupted, so agent audio after this instant was never played. */
  interromper() {
    const p = this.posAgora();
    this.agente.truncar(p);
    this.cursorAgente = Math.min(this.cursorAgente, p);
  }

  get duracaoS() {
    return Math.max(this.cliente.tamanho, this.agente.tamanho) / TAXA;
  }

  /** Mixes both tracks into a 16-bit mono WAV and returns it with a peak envelope for the waveform. */
  finalizar(picosN = 160): { wav: Buffer; picos: number[] } {
    const n = Math.max(this.cliente.tamanho, this.agente.tamanho);
    const mix = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const v = (i < this.cliente.tamanho ? this.cliente.dados[i] : 0) + (i < this.agente.tamanho ? this.agente.dados[i] : 0);
      mix[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
    return { wav: wav(mix), picos: picos(mix, picosN) };
  }
}

export function wav(pcm: Int16Array, taxa = TAXA): Buffer {
  const dados = pcm.length * 2;
  const b = Buffer.alloc(44 + dados);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dados, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(taxa, 24);
  b.writeUInt32LE(taxa * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(dados, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(pcm[i], 44 + i * 2);
  return b;
}

/** RMS per bucket, normalized to 0..1 (sqrt curve so quiet speech is still visible). */
export function picos(pcm: Int16Array, n: number): number[] {
  if (!pcm.length) return [];
  const tam = Math.max(1, Math.floor(pcm.length / n));
  const out: number[] = [];
  for (let i = 0; i < n && i * tam < pcm.length; i++) {
    let soma = 0;
    const fim = Math.min(pcm.length, (i + 1) * tam);
    for (let j = i * tam; j < fim; j++) soma += pcm[j] * pcm[j];
    out.push(Math.sqrt(soma / (fim - i * tam)) / 32768);
  }
  const max = Math.max(...out, 1e-6);
  return out.map((v) => Math.round(Math.sqrt(v / max) * 1000) / 1000);
}
