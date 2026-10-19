export function createTransferRateTracker(now = Date.now) {
  let previous = { bytes: 0, time: now() };
  return (bytes, done, total) => {
    const time = now(), elapsed = Math.max(0.001, (time - previous.time) / 1000);
    const speed = Math.max(0, (bytes - previous.bytes) / elapsed);
    previous = { bytes, time };
    return { bytesReceived: bytes, speed, eta: speed && done ? (total - done) * (bytes / done) / speed : null };
  };
}
