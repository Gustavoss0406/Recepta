/**
 * After a deploy, a tab opened on the previous build calls Server Actions whose IDs no longer exist
 * ("Server Action … was not found on the server"). Reloading once picks up the new build.
 */
export function ehVersaoAntiga(error: unknown): boolean {
  const m = error instanceof Error ? error.message : String(error ?? "");
  return /Server Action .* was not found on the server|Failed to find Server Action|failed-to-find-server-action/i.test(m);
}

/** Reloads at most once per minute (avoids a loop if the error has another cause). */
export function recarregarUmaVez(): boolean {
  try {
    const ultimo = Number(sessionStorage.getItem("recepta_recarregou") ?? 0);
    if (Date.now() - ultimo < 60_000) return false;
    sessionStorage.setItem("recepta_recarregou", String(Date.now()));
  } catch {
    /* storage blocked: still reload */
  }
  window.location.reload();
  return true;
}
