import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import "fake-indexeddb/auto";
import { parseMediaPlaylist } from "../core/hls/parse-media.js";
import { downloadMediaPlaylistResources } from "../core/hls/download-segments.js";
import { buildRemuxJob } from "../core/hls/merge-renditions.js";
import { createSegmentCheckpoint, clearSegmentCheckpoint, readSegmentResource } from "../core/hls/segment-checkpoint.js";
import { classifyDownloadError, downloadErrorGuidance } from "../core/downloads/error-guidance.js";

const base = "https://example.com/media/index.m3u8";
const keyA = Buffer.from("00112233445566778899aabbccddeeff", "hex");
const keyB = Buffer.from("ffeeddccbbaa99887766554433221100", "hex");
const encrypt = (bytes, key, iv) => {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.from(iv, "hex"));
  return Buffer.concat([cipher.update(bytes), cipher.final()]);
};

test("AES-128 key rotation, implicit sequence IV, explicit IV and clear transitions decrypt before remux", async () => {
  const text = '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:9007199254740993\n#EXT-X-KEY:METHOD=AES-128,URI="../a.key"\n#EXTINF:1,\na.jpg\n#EXT-X-KEY:METHOD=AES-128,URI="b.key",IV=0x123\n#EXTINF:1,\nb.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:1,\nc.ts\n#EXT-X-ENDLIST';
  const info = parseMediaPlaylist(text, base);
  assert.equal(info.segments[0].encryption.iv, "00000000000000000020000000000001");
  assert.equal(info.segments[1].encryption.iv, "00000000000000000000000000000123");
  assert.equal(info.segments[2].encryption, undefined);
  const plain = [Buffer.from("first media segment"), Buffer.from("second media segment"), Buffer.from("clear media segment")];
  const files = new Map([["https://example.com/a.key", keyA], ["https://example.com/media/b.key", keyB],
    ...info.segments.map((item, i) => [item.url, item.encryption ? encrypt(plain[i], i === 0 ? keyA : keyB, item.encryption.iv) : plain[i]])]);
  const logs = [];
  const resources = await downloadMediaPlaylistResources(info, { retries: 1,
    logger: (...args) => logs.push(args), fetchImpl: async (url) => new Response(files.get(url)) });
  assert.deepEqual(resources.map((item) => Buffer.from(item.bytes)), plain);
  assert.ok(resources[0].decrypted && resources[1].decrypted);
  const job = buildRemuxJob({ videoPlaylistText: text, videoPlaylistInfo: info, videoResources: resources });
  assert.equal(job.video.playlistText.includes("#EXT-X-KEY"), false);
  assert.equal(job.video.playlistText.includes("https://"), false);
  assert.ok(logs.some((entry) => entry[2] === "Decrypted AES-128 segment"));
  assert.equal(JSON.stringify(logs).includes(keyA.toString("hex")), false);
  assert.throws(() => buildRemuxJob({ videoPlaylistText: text, videoPlaylistInfo: info,
    videoResources: resources.map((item) => ({ ...item, decrypted: false })) }), /not decrypted/);
});

test("parallel encrypted segments share a key request; decrypted checkpoints resume and reject changed IVs", async () => {
  const text = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0x1\n#EXTINF:1,\na.ts\n#EXTINF:1,\nb.ts\n#EXT-X-ENDLIST';
  const info = parseMediaPlaylist(text, base), plain = Buffer.from("checkpoint media");
  const cipher = encrypt(plain, keyA, info.segments[0].encryption.iv);
  let keyCalls = 0, segmentCalls = 0;
  const options = { retries: 1, stagePrefix: "video", fetchImpl: async (url) => {
    if (url.endsWith("/key")) { keyCalls++; return new Response(keyA, { headers: { "content-type": "text/plain" } }); }
    segmentCalls++; return new Response(cipher);
  } };
  const checkpoint = await createSegmentCheckpoint("aes-resume", "v");
  const resources = await downloadMediaPlaylistResources(info, { ...options, checkpoint });
  assert.equal(keyCalls, 1); assert.equal(segmentCalls, 2);
  assert.deepEqual(Buffer.from(await readSegmentResource(resources[0])), plain);
  await downloadMediaPlaylistResources(info, { ...options, checkpoint: await createSegmentCheckpoint("aes-resume", "v") });
  assert.equal(keyCalls, 1); assert.equal(segmentCalls, 2);
  const changed = parseMediaPlaylist(text.replace("IV=0x1", "IV=0x2"), base);
  const next = await createSegmentCheckpoint("aes-resume", "v");
  const entries = changed.segments.map((item, index) => ({ ...item, kind: "segment", index }));
  await next.prepare(entries, "video", changed);
  assert.equal(await next.load(entries[0], "video"), null);
  await clearSegmentCheckpoint("aes-resume");
});

test("encrypted initialization sections require an IV and decrypt along with segments", async () => {
  const text = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0x1\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\na.m4s\n#EXT-X-ENDLIST';
  assert.throws(() => parseMediaPlaylist(text.replace(",IV=0x1", ""), base), /explicit IV/);
  const info = parseMediaPlaylist(text, base), plain = Buffer.from("fmp4 media data");
  const bytes = encrypt(plain, keyA, info.initSegment.encryption.iv);
  const resources = await downloadMediaPlaylistResources(info, { fetchImpl: async (url) => new Response(url.endsWith("/key") ? keyA : bytes) });
  assert.equal(resources.length, 2);
  assert.ok(resources.every((item) => item.decrypted && Buffer.from(item.bytes).equals(plain)));
});

test("DRM, invalid encryption metadata and invalid sequence values fail before fetching media", () => {
  for (const tag of ['METHOD=SAMPLE-AES,URI="key"', 'METHOD=AES-128,KEYFORMAT="com.apple.streamingkeydelivery",URI="skd://key"',
    'METHOD=AES-128,KEYFORMATVERSIONS="2",URI="key"', 'METHOD=AES-128', 'METHOD=AES-128,URI="key",IV=0xZZ', 'METHOD=AES-128,URI="file:///key"']) {
    assert.throws(() => parseMediaPlaylist(`#EXTM3U\n#EXT-X-KEY:${tag}\na.ts`, base), /encryption|key|IV/i);
  }
  assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:18446744073709551616\na.ts', base), /sequence/);
});

test("key HTTP errors, invalid key size and corrupted ciphertext produce specific diagnostics", async () => {
  const info = parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0x1\na.ts', base);
  for (const [response, pattern] of [[() => new Response("denied", { status: 403 }), /key request failed: HTTP 403/],
    [() => new Response(new Uint8Array(15)), /exactly 16 bytes/], [() => new Response(new Uint8Array(17)), /exactly 16 bytes/], [() => new Response(keyA), /decryption failed/]]) {
    await assert.rejects(downloadMediaPlaylistResources(info, { retries: 1, fetchImpl: async (url) => url.endsWith("/key") ? response() : new Response(new Uint8Array(16)) }), pattern);
  }
  assert.equal(classifyDownloadError("HLS key request failed: HTTP 403"), "auth");
  assert.equal(classifyDownloadError("AES-128 decryption failed"), "encryption");
  assert.equal(classifyDownloadError("Unsupported HLS encryption / DRM"), "drm");
  assert.doesNotMatch(downloadErrorGuidance("FFmpeg remux failed", "en"), /encrypted|DRM/);
});

test("cancelling an AES key fetch aborts without checkpointing ciphertext", async () => {
  const info = parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0x1\na.ts', base);
  const controller = new AbortController(); let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const operation = downloadMediaPlaylistResources(info, { signal: controller.signal, fetchImpl: async (url, { signal }) => {
    if (!url.endsWith("/key")) return new Response(new Uint8Array(16));
    started(); return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  await ready; controller.abort(new Error("test cancellation"));
  await assert.rejects(operation, /test cancellation/);
});
