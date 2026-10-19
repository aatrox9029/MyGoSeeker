export function parseIsoDuration(value = "") {
  const match = value.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : 0;
}
export function resolvePeriodTiming(periods, totalDuration, dynamicEnd = 0) {
  let nextStart = 0;
  return periods.map((period, index) => {
    const start = period.attrs.start === undefined ? nextStart : parseIsoDuration(period.attrs.start);
    const end = periods[index + 1]?.attrs.start;
    const duration = period.attrs.duration ? parseIsoDuration(period.attrs.duration)
      : end !== undefined ? parseIsoDuration(end) - start : (totalDuration || dynamicEnd) - start;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("DASH Period duration/start cannot be resolved");
    if (index && Math.abs(start - nextStart) > 0.05) throw new Error("DASH Period gap/overlap is unsupported; choose a continuous source");
    nextStart = start + duration;
    return { start, duration, id: period.attrs.id || String(index), index };
  });
}
