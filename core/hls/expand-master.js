import { chooseAudioTrack, buildMasterVariantLabel } from "./parse-master.js";

// Cache only playlist options; title/identity/source must belong to the current page candidate.
export function expandMasterOptions(candidate, options, masterUrl, mergeKey) {
  return options.map((option) => ({
    ...candidate,
    url: option.url, audioUrl: chooseAudioTrack(option.audioTracks)?.uri || "", masterUrl,
    type: "m3u8", source: `${candidate.source || "unknown"}:master`,
    label: buildMasterVariantLabel(option), score: option.score,
    mergeKey: candidate.mergeKey || mergeKey
  }));
}
