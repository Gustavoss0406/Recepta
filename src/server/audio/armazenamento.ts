import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Call recordings storage. Local folder in development (RECEPTA_AUDIO_DIR, default .data/audio);
 * any S3-compatible bucket in production when S3_BUCKET is set (AWS, R2, MinIO via S3_ENDPOINT).
 * Credentials come from the standard AWS environment variables / instance role.
 */
const DIR = process.env.RECEPTA_AUDIO_DIR ?? path.join(process.cwd(), ".data", "audio");
const BUCKET = process.env.S3_BUCKET;
/** Supabase Storage (private bucket "gravacoes"), used when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set. */
const SUPA = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? { url: process.env.SUPABASE_URL.replace(/\/$/, ""), chave: process.env.SUPABASE_SERVICE_ROLE_KEY } : null;
const SUPA_BUCKET = process.env.SUPABASE_BUCKET_GRAVACOES ?? "gravacoes";
const supaHeaders = () => ({ authorization: `Bearer ${SUPA!.chave}`, apikey: SUPA!.chave });

function chaveSegura(chave: string) {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+\.wav$/i.test(chave)) throw new Error("Chave de áudio inválida");
  return chave;
}

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({ region: process.env.S3_REGION ?? "auto", endpoint: process.env.S3_ENDPOINT, forcePathStyle: Boolean(process.env.S3_ENDPOINT) });
}

export async function salvarAudio(chave: string, dados: Buffer) {
  chaveSegura(chave);
  if (SUPA) {
    const r = await fetch(`${SUPA.url}/storage/v1/object/${SUPA_BUCKET}/${chave}`, {
      method: "POST",
      headers: { ...supaHeaders(), "content-type": "audio/wav", "x-upsert": "true" },
      body: new Uint8Array(dados),
    });
    if (!r.ok) throw new Error(`Supabase Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (BUCKET) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: BUCKET, Key: chave, Body: dados, ContentType: "audio/wav" }));
    return;
  }
  const arq = path.join(DIR, chave);
  await mkdir(path.dirname(arq), { recursive: true });
  await writeFile(arq, dados);
}

export async function lerAudio(chave: string): Promise<Buffer | null> {
  chaveSegura(chave);
  try {
    if (SUPA) {
      const r = await fetch(`${SUPA.url}/storage/v1/object/authenticated/${SUPA_BUCKET}/${chave}`, { headers: supaHeaders() });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    }
    if (BUCKET) {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const r = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return await readFile(path.join(DIR, chave));
  } catch {
    return null;
  }
}

export async function apagarAudio(chave: string) {
  chaveSegura(chave);
  if (SUPA) {
    await fetch(`${SUPA.url}/storage/v1/object/${SUPA_BUCKET}`, { method: "DELETE", headers: { ...supaHeaders(), "content-type": "application/json" }, body: JSON.stringify({ prefixes: [chave] }) });
    return;
  }
  if (BUCKET) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chave }));
    return;
  }
  await rm(path.join(DIR, chave), { force: true });
}
