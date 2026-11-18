/**
 * Voice gateway + background worker in one process (saves ~100 MB on small hosts).
 * Used by scripts/servidor-unico.mjs; the gateway starts listening before the worker loop begins.
 */
import "./voice-gateway/server";
import "./server/jobs/worker";
