export function parseByteRange(value, previous, url) {
  const match = String(value).match(/^(\d+)(?:@(\d+))?$/);
  if (!match) throw new Error("Invalid HLS byte range");
  const length = Number(match[1]);
  const offset = match[2] === undefined
    ? (previous?.url === url && previous.byteRange ? previous.byteRange.offset + previous.byteRange.length : NaN)
    : Number(match[2]);
  if (!Number.isSafeInteger(length) || length <= 0 || !Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(offset + length)) throw new Error("Invalid HLS byte-range offset");
  return { length, offset };
}
