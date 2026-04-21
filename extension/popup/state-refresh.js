export function createStateRefreshController({ refreshState, delayMs = 120 }) {
  let timerId = 0;
  let refreshInFlight = null;
  let refreshQueued = false;

  async function runRefresh() {
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      try {
        await refreshState();
      } finally {
        refreshInFlight = null;
        if (refreshQueued) {
          refreshQueued = false;
          await runRefresh();
        }
      }
    })();

    return refreshInFlight;
  }

  function schedule() {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = 0;
      runRefresh().catch((error) => console.error(error));
    }, delayMs);
  }

  function flush() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = 0;
    }
    return runRefresh();
  }

  return {
    schedule,
    flush
  };
}
