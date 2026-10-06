import test from "node:test";
import assert from "node:assert/strict";
import { parseMediaPlaylist } from "../core/hls/parse-media.js";
import { parseMasterPlaylist, chooseAudioTrack } from "../core/hls/parse-master.js";
import { buildRemuxJob } from "../core/hls/merge-renditions.js";
import { downloadMediaPlaylistResources } from "../core/hls/download-segments.js";
import { fetchWithRetry } from "../core/network/fetch-retry.js";
import { sendArrayBufferToTransfer } from "../core/files/save-file.js";

const base = "https://media.example/video/index.m3u8";
test("rejects HTML masquerading as a playlist", () => {
  assert.throws(() => parseMediaPlaylist("<html>login</html>", base), /header/);
  assert.throws(() => parseMasterPlaylist("login", base), /header/);
});
test("resolves explicit/implicit ranges and multiple init segments", () => {
  const playlist = parseMediaPlaylist('#EXTM3U\n#EXT-X-MAP:URI="x.mp4",BYTERANGE="4@0"\n#EXTINF:2,\n#EXT-X-BYTERANGE:3@4\nx.mp4\n#EXTINF:2,\n#EXT-X-BYTERANGE:3\nx.mp4\n#EXT-X-MAP:URI="y.mp4"\n#EXTINF:2,\ny.mp4\n#EXT-X-ENDLIST', base);
  assert.deepEqual(playlist.segments.map((s) => s.byteRange), [{ length: 3, offset: 4 }, { length: 3, offset: 7 }, undefined]);
  assert.equal(playlist.initSegments.length, 2);
  assert.equal(playlist.totalDuration, 6);
  assert.ok(playlist.isEndList);
  assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-BYTERANGE:3\nx.mp4', base), /offset/);
  assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-BYTERANGE:3@0\nx.mp4\n#EXT-X-BYTERANGE:3\ny.mp4', base), /offset/);
});
test("encryption remains flagged after METHOD=NONE and gaps fail explicitly", () => {
  const playlist = parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\nx.ts\n#EXT-X-KEY:METHOD=NONE\ny.ts', base);
  assert.ok(playlist.encrypted);
  assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-GAP\nx.ts', base), /missing/);
});
test("split audio groups preserve the default track", () => {
  const [option] = parseMasterPlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English, Stereo",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=123000,CODECS="avc1,mp4a",AUDIO="a",RESOLUTION=1280x720\nvideo.m3u8', base);
  assert.equal(chooseAudioTrack(option.audioTracks).uri, 'https://media.example/video/audio.m3u8');
  assert.equal(option.resolutionHeight, 720);
});
test("parallel segment fetch preserves order and limits concurrency", async () => {
  let active = 0, maxActive = 0;
  const playlist = { segments: Array.from({ length: 9 }, (_, index) => ({ url: `https://example.com/${index}`, duration: 1 })) };
  const result = await downloadMediaPlaylistResources(playlist, {
    concurrency: 3,
    fetchImpl: async (url, options) => {
      assert.equal(options.credentials, "include");
      maxActive = Math.max(maxActive, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response(Uint8Array.of(Number(url.split('/').at(-1))));
    }
  });
  assert.equal(maxActive, 3);
  assert.deepEqual(result.map((r) => new Uint8Array(r.bytes)[0]), [0,1,2,3,4,5,6,7,8]);
});
test("range responses support 206 and servers ignoring Range", async () => {
  for (const partial of [false, true]) {
    const value = await fetchWithRetry(base, "arrayBuffer", {
      byteRange: { offset: 2, length: 2 },
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.get("range"), "bytes=2-3");
        return partial ? new Response(Uint8Array.of(2,3), { status: 206, headers: { "content-range": "bytes 2-3/5" } })
          : new Response(Uint8Array.of(0,1,2,3,4));
      }
    });
    assert.deepEqual([...new Uint8Array(value)], [2,3]);
  }
  await assert.rejects(fetchWithRetry(base, "arrayBuffer", {
    retries: 1, byteRange: { offset: 2, length: 2 },
    fetchImpl: async () => new Response(Uint8Array.of(0,1), { status: 206, headers: { "content-range": "bytes 0-1/5" } })
  }), /range/);
});
test("retries transient HTTP failures, rejects auth failures and HTML", async () => {
  let calls = 0;
  const result = await fetchWithRetry(base, "text", { retryDelayMs: 1, fetchImpl: async () => ++calls < 3 ? new Response("busy", { status: 503 }) : new Response("ok") });
  assert.equal(result, "ok"); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(fetchWithRetry(base, "text", { fetchImpl: async () => { calls++; return new Response("login", { status: 403 }); } }), /403/);
  assert.equal(calls, 1);
  await assert.rejects(fetchWithRetry(base, "arrayBuffer", { fetchImpl: async () => new Response("login", { headers: { "content-type": "text/html" } }) }), /instead of media/);
});
test("timeout aborts an unresponsive request", async () => {
  await assert.rejects(fetchWithRetry(base, "text", {
    timeoutMs: 10, retries: 1, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
  }), /timed out/);
});
test("remux rewrites init transitions and removes ranges already sliced", () => {
  const text = '#EXTM3U\n#EXT-X-MAP:URI="x.mp4",BYTERANGE="4@0"\n#EXT-X-BYTERANGE:3@4\nx.mp4\n#EXT-X-MAP:URI="y.mp4"\ny.mp4\n#EXT-X-ENDLIST';
  const info = parseMediaPlaylist(text, base);
  const resources = [...info.initSegments.map((item, index) => ({ ...item, sourceUrl: item.url, index, kind: "init" })), ...info.segments.map((item, index) => ({ ...item, sourceUrl: item.url, index, kind: "segment" }))];
  const job = buildRemuxJob({ videoPlaylistText: text, videoPlaylistInfo: info, videoResources: resources });
  assert.ok(!job.video.playlistText.includes("BYTERANGE"));
  assert.ok(job.video.playlistText.includes("init-0.mp4"));
  assert.ok(job.video.playlistText.includes("init-1.mp4"));
});
test("binary chunks decode independently without whole-file base64 buffering", async () => {
  const bytes = Uint8Array.from({ length: 123 }, (_, index) => index);
  const chunks = [];
  globalThis.chrome = { tabs: { sendMessage: async (_tabId, message) => { chunks.push(Buffer.from(message.payload.chunkBase64, "base64")); return { ok: true }; } } };
  await sendArrayBufferToTransfer(1, "x", bytes.buffer, 7);
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(bytes));
  await assert.rejects(sendArrayBufferToTransfer(1, "x", bytes.buffer, 0), /chunk size/);
});
