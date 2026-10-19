// ISO BMFF Segment Index; offsets refer to the original file, not the range response.
export function parseSidx(buffer, fileOffset, url) {
  const view = new DataView(buffer);
  let pos = 0;
  const u64 = (offset) => {
    const value = Number(view.getBigUint64(offset));
    if (!Number.isSafeInteger(value)) throw new Error("DASH sidx offset exceeds safe integer range");
    return value;
  };
  while (pos + 8 <= view.byteLength) {
    let size = view.getUint32(pos), header = 8;
    const type = String.fromCharCode(...new Uint8Array(buffer, pos + 4, 4));
    if (size === 1) { if (pos + 16 > view.byteLength) throw new Error("Truncated DASH sidx box"); size = u64(pos + 8); header = 16; }
    if (size === 0) size = view.byteLength - pos;
    if (size < header || pos + size > view.byteLength) throw new Error("Invalid DASH sidx box size");
    if (type !== "sidx") { pos += size; continue; }
    let cursor = pos + header;
    if (cursor + 24 > pos + size) throw new Error("Truncated DASH sidx header");
    const version = view.getUint8(cursor); cursor += 8;
    if (version > 1) throw new Error("Unsupported DASH sidx version");
    const scale = view.getUint32(cursor); cursor += 4;
    if (!scale) throw new Error("Invalid DASH sidx timescale");
    if (cursor + (version ? 20 : 12) > pos + size) throw new Error("Truncated DASH sidx timing");
    const time = version ? u64(cursor) : view.getUint32(cursor); cursor += version ? 8 : 4;
    const first = version ? u64(cursor) : view.getUint32(cursor); cursor += version ? 8 : 4;
    cursor += 2; const count = view.getUint16(cursor); cursor += 2;
    if (!count || count > 10000 || cursor + count * 12 > pos + size) throw new Error("Invalid DASH sidx references");
    let offset = fileOffset + pos + size + first, startTime = time / scale;
    const segments = [];
    for (let index = 0; index < count; index++, cursor += 12) {
      const ref = view.getUint32(cursor), duration = view.getUint32(cursor + 4) / scale;
      if (ref >>> 31) throw new Error("Hierarchical DASH sidx is unsupported");
      const length = ref & 0x7fffffff;
      if (!length || !duration || !Number.isSafeInteger(offset + length)) throw new Error("Invalid DASH sidx resource");
      segments.push({ url, byteRange: { offset, length }, duration, startTime });
      offset += length; startTime += duration;
    }
    return segments;
  }
  throw new Error("DASH index range contains no sidx box");
}
