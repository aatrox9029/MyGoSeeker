export function translateStreamStage(locale, stage) {
  const index = ({ "zh-Hant": 0, "zh-Hans": 1, ja: 2, en: 3 })[locale] ?? 3;
  const exact = {
    Queued: ["等待下載", "等待下载", "ダウンロード待機中", "Queued"],
    "Downloading DASH segments": ["正在下載 DASH 分段", "正在下载 DASH 分段", "DASH セグメントをダウンロード中", stage],
    "Queued task interrupted; resume": ["佇列已中斷，請按繼續", "队列已中断，请继续", "待機中のタスクが中断しました。再開してください", stage]
  };
  if (exact[stage]) return exact[stage][index];
  let match = /^(Remuxing|Saving finalized) (\w+)$/.exec(stage);
  if (match) return (match[1] === "Remuxing" ? ["正在轉封裝", "正在转封装", "再多重化中", "Remuxing"] : ["正在保存", "正在保存", "保存中", "Saving finalized"])[index] + ` ${match[2]}`;
  match = /^Saving live HLS (\d+)\/(\d+)s$/.exec(stage);
  if (match) return ["正在保存直播", "正在保存直播", "ライブを保存中", "Saving live HLS"][index] + ` ${match[1]}/${match[2]}s`;
  match = /^Downloading (?:DASH )?(video|audio)(?: segments)? (\d+)\/(\d+)$/.exec(stage);
  if (match) return ["正在下載分段", "正在下载分段", "セグメントをダウンロード中", "Downloading segments"][index] + ` ${match[2]}/${match[3]}`;
  return null;
}
