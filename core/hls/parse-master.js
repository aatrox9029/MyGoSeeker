function parseAttributeList(line) {
  const attributes = {};
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) {
    return attributes;
  }
  const attrText = line.slice(colonIndex + 1);
  const pattern = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/gi;
  let match = pattern.exec(attrText);
  while (match) {
    let value = match[2].trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    }
    attributes[match[1].toUpperCase()] = value;
    match = pattern.exec(attrText);
  }
  return attributes;
}

function parseAudioGroups(lines, baseUrl) {
  const groups = new Map();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("#EXT-X-MEDIA")) {
      continue;
    }
    const attrs = parseAttributeList(line);
    if ((attrs.TYPE || "").toUpperCase() !== "AUDIO") {
      continue;
    }
    const groupId = attrs["GROUP-ID"] || "";
    if (!groupId) {
      continue;
    }
    const uri = attrs.URI ? new URL(attrs.URI, baseUrl).href : "";
    const item = {
      name: attrs.NAME || "",
      language: attrs.LANGUAGE || "",
      isDefault: (attrs.DEFAULT || "").toUpperCase() === "YES",
      autoselect: (attrs.AUTOSELECT || "").toUpperCase() === "YES",
      uri
    };
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId).push(item);
  }
  return groups;
}

export function parseMasterPlaylist(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const audioGroups = parseAudioGroups(lines, baseUrl);
  const options = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) {
      continue;
    }
    const attrs = parseAttributeList(line);
    let uri = "";
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const candidate = lines[nextIndex].trim();
      if (!candidate || candidate.startsWith("#")) {
        continue;
      }
      uri = candidate;
      break;
    }
    if (!uri) {
      continue;
    }

    const resolutionRaw = attrs.RESOLUTION || "";
  const resolutionMatch = resolutionRaw.match(/^(\d+)[x*](\d+)$/i);
    const resolutionWidth = resolutionMatch ? Number(resolutionMatch[1]) || 0 : 0;
    const resolutionHeight = resolutionMatch ? Number(resolutionMatch[2]) || 0 : 0;
    const bandwidth = Number(attrs.BANDWIDTH || attrs["AVERAGE-BANDWIDTH"] || 0);
    const codecs = String(attrs.CODECS || "").toLowerCase();
    const audioGroupId = attrs.AUDIO || "";
    const audioTracks = audioGroupId ? (audioGroups.get(audioGroupId) || []) : [];
    const hasAudioCodec = /(mp4a|aac|ac-3|ec-3|opus|vorbis|flac|alac)/i.test(codecs);
    const hasVideoCodec = /(avc1|avc3|hev1|hvc1|vp8|vp9|vp09|av01|theora)/i.test(codecs);

    options.push({
      url: new URL(uri, baseUrl).href,
      score: resolutionHeight * 10000 + resolutionWidth + bandwidth / 1000,
      resolutionWidth,
      resolutionHeight,
      bandwidth,
      codecs,
      hasAudioCodec,
      hasVideoCodec,
      audioGroupId,
      audioTracks,
      hasSeparateAudio: audioTracks.some((track) => Boolean(track.uri))
    });
  }

  return options;
}

function getAudioRank(option) {
  if (!option || typeof option !== "object") {
    return -10;
  }
  if (option.hasSeparateAudio) {
    return 4;
  }
  if (option.hasAudioCodec) {
    return 3;
  }
  if (!option.codecs) {
    return 1;
  }
  if (option.hasVideoCodec) {
    return 0;
  }
  return 1;
}

export function choosePreferredMasterOption(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return null;
  }
  return [...options].sort((a, b) => {
    const audioRankDiff = getAudioRank(b) - getAudioRank(a);
    if (audioRankDiff !== 0) {
      return audioRankDiff;
    }
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }
    return (b.bandwidth || 0) - (a.bandwidth || 0);
  })[0];
}

export function chooseAudioTrack(audioTracks) {
  if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
    return null;
  }
  return [...audioTracks].sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    if (a.autoselect !== b.autoselect) {
      return a.autoselect ? -1 : 1;
    }
    return (a.language || "").localeCompare(b.language || "");
  })[0];
}

export function buildMasterVariantLabel(option) {
  const parts = [];
  if (option.resolutionWidth && option.resolutionHeight) {
    parts.push(`${option.resolutionWidth}*${option.resolutionHeight}`);
  } else {
    parts.push("Auto");
  }
  if (option.bandwidth) {
    parts.push(`${Math.round(option.bandwidth / 1000)}k`);
  }
  if (option.hasSeparateAudio) {
    parts.push("AV split");
  }
  return `${parts.join(" ")} (m3u8)`;
}

export { parseAttributeList };
