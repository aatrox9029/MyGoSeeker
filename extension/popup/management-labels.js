export const managementLabels = (locale) => ({
  "zh-Hant": { search: "搜尋影片", newest: "最新", title: "標題", progress: "進度", batch: "下載勾選影片", select: "勾選影片", fileRule: "檔名規則：{title}、{quality}、{date}、{id}" },
  "zh-Hans": { search: "搜索视频", newest: "最新", title: "标题", progress: "进度", batch: "下载勾选视频", select: "勾选视频", fileRule: "文件名规则：{title}、{quality}、{date}、{id}" },
  ja: { search: "動画を検索", newest: "新着", title: "タイトル", progress: "進捗", batch: "選択した動画を保存", select: "動画を選択", fileRule: "ファイル名：{title}、{quality}、{date}、{id}" },
  en: { search: "Search videos", newest: "Newest", title: "Title", progress: "Progress", batch: "Download selected", select: "Select video", fileRule: "Filename rule: {title}, {quality}, {date}, {id}" }
}[locale] || managementLabels("en"));
