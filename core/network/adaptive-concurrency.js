export function createAdaptiveConcurrency(maximum = 4) {
  let limit = Math.min(8, Math.max(1, Math.floor(maximum))), successes = 0;
  return {
    get limit() { return limit; },
    observe(failed, elapsedMs) {
      if (failed || elapsedMs > 10000) { limit = Math.max(1, Math.ceil(limit / 2)); successes = 0; }
      else if (++successes >= 8) { limit = Math.min(maximum, limit + 1); successes = 0; }
    }
  };
}
