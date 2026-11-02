/**
 * Bun (≤ 1.3.14) doesn't implement `v8.startupSnapshot.isBuildingSnapshot`,
 * which bson's static initializer calls on load — crashing any mongoose/mongodb
 * import under Bun. Stub it so the driver loads. Use via `bun --preload`.
 */
import v8 from "node:v8";

try {
  const ss = (v8 as unknown as { startupSnapshot?: { isBuildingSnapshot?: () => boolean } }).startupSnapshot;
  if (ss) ss.isBuildingSnapshot = () => false;
} catch {
  /* best effort */
}
