import "server-only";

/**
 * Organizations without usage limits (the Recepta team's own accounts): test runs, trial minutes,
 * monthly cap and concurrency. Set RECEPTA_ORGS_ILIMITADAS = org ids, comma-separated.
 */
export function orgIlimitada(orgId: string): boolean {
  return (process.env.RECEPTA_ORGS_ILIMITADAS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(orgId);
}
