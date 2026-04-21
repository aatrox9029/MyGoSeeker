export const SUPPORTED_LOCALES = ["en", "zh-Hant", "zh-Hans", "ja"];

const TRANSLATIONS = {
  en: {
    languageName: "English",
    appName: "MyGoSeeker",
    popup: {
      title: "MyGoSeeker",
      toolbar: {
        rescan: "Rescan",
        resetBypass: "Reset Hidden",
        settings: "Settings"
      },
      tabs: {
        available: "Available",
        downloading: "Downloading",
        completed: "Completed"
      },
      labels: {
        variant: "Variant",
        videoFallback: "Video",
        download: "Download",
        downloadAgain: "Download Again",
        retry: "Retry",
        exportRecord: "Export Record",
        ignore: "Hide",
        downloaded: "Downloaded"
      },
      empty: {
        available: "No videos detected for this tab yet.",
        downloading: "No active downloads.",
        completed: "No completed downloads."
      },
      alerts: {
        exportError: "Error exporting record"
      }
    },
    options: {
      title: "MyGoSeeker Settings",
      sections: {
        language: "Language",
        detectionTypes: "Detection Types",
        display: "Display",
        cache: "Cache"
      },
      labels: {
        languageHelp: "Choose the clean user-facing language for the popup and settings pages.",
        downloadHistoryEnabled: "Record downloaded video history and show downloaded badges",
        preserveOldPages: "Keep results from closed tabs",
        keepSettings: "Keep user settings when clearing cache",
        clearCache: "Clear all cache and runtime data",
        save: "Save Settings"
      },
      status: {
        loaded: "Settings loaded.",
        saved: "Settings saved.",
        cacheCleared: "Cache cleared."
      }
    },
    status: {
      ready: "Ready",
      fetchingPlaylist: "Fetching playlist",
      preparingWriter: "Preparing tab file writer",
      finalizingFile: "Finalizing file",
      completed: "Completed",
      browserDownloading: "Browser downloading",
      downloadedNonVideo: "Downloaded file is not video, trying fallback",
      interruptedRetrying: "Download interrupted, trying fallback",
      interrupted: "Download interrupted",
      blobFailed: "Blob download failed",
      processingBlob: "Processing blob",
      directBlob: "Trying direct blob fetch",
      directBlobDone: "Blob downloaded directly",
      recordFallbackEstimate: "Recording with fallback duration estimate",
      recordFallbackStream: "Recording with captureStream fallback",
      recordFallbackNoAudio: "Recording fallback (audio track unavailable)",
      recordingFallbackDuration: "Recording stream (fallback duration)",
      recordingStream: "Recording stream",
      blobFallbackFailed: "Blob fallback failed"
    }
  },
  "zh-Hant": {
    languageName: "繁體中文",
    appName: "影片下載器",
    popup: {
      title: "影片下載器",
      toolbar: {
        rescan: "重新掃描",
        resetBypass: "重設隱藏",
        settings: "設定"
      },
      tabs: {
        available: "可下載",
        downloading: "下載中",
        completed: "已完成"
      },
      labels: {
        variant: "版本",
        videoFallback: "影片",
        download: "下載",
        downloadAgain: "再次下載",
        retry: "重試",
        exportRecord: "匯出記錄",
        ignore: "隱藏"
      },
      empty: {
        available: "這個分頁目前還沒有偵測到影片。",
        downloading: "目前沒有進行中的下載。",
        completed: "目前沒有已完成的下載。"
      },
      alerts: {
        exportError: "匯出記錄時發生錯誤"
      }
    },
    options: {
      title: "影片下載器設定",
      sections: {
        language: "語言",
        detectionTypes: "偵測類型",
        display: "顯示",
        cache: "快取"
      },
      labels: {
        languageHelp: "選擇 popup 與設定頁面顯示的語言。",
        preserveOldPages: "保留已關閉分頁的結果",
        keepSettings: "清除快取時保留使用者設定",
        clearCache: "清除所有快取與執行資料",
        save: "儲存設定"
      },
      status: {
        loaded: "設定已載入。",
        saved: "設定已儲存。",
        cacheCleared: "快取已清除。"
      }
    },
    status: {
      ready: "就緒",
      fetchingPlaylist: "正在取得播放清單",
      preparingWriter: "正在準備分頁檔案寫入器",
      finalizingFile: "正在完成檔案",
      completed: "已完成",
      browserDownloading: "瀏覽器下載中",
      downloadedNonVideo: "下載的檔案不是影片，正在嘗試備援方式",
      interruptedRetrying: "下載中斷，正在嘗試備援方式",
      interrupted: "下載中斷",
      blobFailed: "Blob 下載失敗",
      processingBlob: "正在處理 Blob",
      directBlob: "正在嘗試直接抓取 Blob",
      directBlobDone: "Blob 已直接下載完成",
      recordFallbackEstimate: "正在以估算時長錄製備援",
      recordFallbackStream: "正在以 captureStream 錄製備援",
      recordFallbackNoAudio: "正在錄製備援（沒有音訊軌）",
      recordingFallbackDuration: "正在錄製串流（備援時長）",
      recordingStream: "正在錄製串流",
      blobFallbackFailed: "Blob 備援失敗"
    }
  },
  "zh-Hans": {
    languageName: "简体中文",
    appName: "视频下载器",
    popup: {
      title: "视频下载器",
      toolbar: {
        rescan: "重新扫描",
        resetBypass: "重置隐藏",
        settings: "设置"
      },
      tabs: {
        available: "可下载",
        downloading: "下载中",
        completed: "已完成"
      },
      labels: {
        variant: "版本",
        videoFallback: "视频",
        download: "下载",
        downloadAgain: "再次下载",
        retry: "重试",
        exportRecord: "导出记录",
        ignore: "隐藏"
      },
      empty: {
        available: "当前标签页还没有检测到视频。",
        downloading: "当前没有进行中的下载。",
        completed: "当前没有已完成的下载。"
      },
      alerts: {
        exportError: "导出记录时出错"
      }
    },
    options: {
      title: "视频下载器设置",
      sections: {
        language: "语言",
        detectionTypes: "检测类型",
        display: "显示",
        cache: "缓存"
      },
      labels: {
        languageHelp: "选择 popup 和设置页面使用的语言。",
        preserveOldPages: "保留已关闭标签页的结果",
        keepSettings: "清除缓存时保留用户设置",
        clearCache: "清除所有缓存和运行数据",
        save: "保存设置"
      },
      status: {
        loaded: "设置已加载。",
        saved: "设置已保存。",
        cacheCleared: "缓存已清除。"
      }
    },
    status: {
      ready: "就绪",
      fetchingPlaylist: "正在获取播放列表",
      preparingWriter: "正在准备标签页文件写入器",
      finalizingFile: "正在完成文件",
      completed: "已完成",
      browserDownloading: "浏览器下载中",
      downloadedNonVideo: "下载的文件不是视频，正在尝试回退方案",
      interruptedRetrying: "下载中断，正在尝试回退方案",
      interrupted: "下载中断",
      blobFailed: "Blob 下载失败",
      processingBlob: "正在处理 Blob",
      directBlob: "正在尝试直接抓取 Blob",
      directBlobDone: "Blob 已直接下载完成",
      recordFallbackEstimate: "正在以估算时长录制回退方案",
      recordFallbackStream: "正在以 captureStream 录制回退方案",
      recordFallbackNoAudio: "正在录制回退方案（无音轨）",
      recordingFallbackDuration: "正在录制流（回退时长）",
      recordingStream: "正在录制流",
      blobFallbackFailed: "Blob 回退失败"
    }
  },
  ja: {
    languageName: "日本語",
    appName: "動画ダウンローダー",
    popup: {
      title: "動画ダウンローダー",
      toolbar: {
        rescan: "再スキャン",
        resetBypass: "非表示をリセット",
        settings: "設定"
      },
      tabs: {
        available: "利用可能",
        downloading: "ダウンロード中",
        completed: "完了"
      },
      labels: {
        variant: "種類",
        videoFallback: "動画",
        download: "ダウンロード",
        downloadAgain: "再ダウンロード",
        retry: "再試行",
        exportRecord: "記録を書き出す",
        ignore: "非表示"
      },
      empty: {
        available: "このタブではまだ動画が検出されていません。",
        downloading: "進行中のダウンロードはありません。",
        completed: "完了したダウンロードはありません。"
      },
      alerts: {
        exportError: "記録の書き出し中にエラーが発生しました"
      }
    },
    options: {
      title: "動画ダウンローダー設定",
      sections: {
        language: "言語",
        detectionTypes: "検出タイプ",
        display: "表示",
        cache: "キャッシュ"
      },
      labels: {
        languageHelp: "popup と設定ページで使う言語を選択します。",
        preserveOldPages: "閉じたタブの結果を保持する",
        keepSettings: "キャッシュ削除時に設定を保持する",
        clearCache: "すべてのキャッシュと実行データを削除する",
        save: "設定を保存"
      },
      status: {
        loaded: "設定を読み込みました。",
        saved: "設定を保存しました。",
        cacheCleared: "キャッシュを削除しました。"
      }
    },
    status: {
      ready: "準備完了",
      fetchingPlaylist: "プレイリストを取得中",
      preparingWriter: "タブファイルライターを準備中",
      finalizingFile: "ファイルを仕上げています",
      completed: "完了",
      browserDownloading: "ブラウザーでダウンロード中",
      downloadedNonVideo: "ダウンロードしたファイルが動画ではないため、代替手段を試しています",
      interruptedRetrying: "ダウンロードが中断されたため、代替手段を試しています",
      interrupted: "ダウンロードが中断されました",
      blobFailed: "Blob のダウンロードに失敗しました",
      processingBlob: "Blob を処理中",
      directBlob: "Blob の直接取得を試しています",
      directBlobDone: "Blob を直接ダウンロードしました",
      recordFallbackEstimate: "推定時間で録画の代替手段を実行中",
      recordFallbackStream: "captureStream で録画の代替手段を実行中",
      recordFallbackNoAudio: "録画の代替手段を実行中（音声トラックなし）",
      recordingFallbackDuration: "ストリームを録画中（代替時間）",
      recordingStream: "ストリームを録画中",
      blobFallbackFailed: "Blob の代替手段に失敗しました"
    }
  }
};

export function normalizeLocale(rawLocale) {
  const locale = typeof rawLocale === "string" ? rawLocale.trim() : "";
  if (SUPPORTED_LOCALES.includes(locale)) {
    return locale;
  }
  const lower = locale.toLowerCase();
  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk") || lower.startsWith("zh-mo") || lower.startsWith("zh-hant")) {
    return "zh-Hant";
  }
  if (lower.startsWith("zh")) {
    return "zh-Hans";
  }
  if (lower.startsWith("ja")) {
    return "ja";
  }
  return "en";
}

export function getTranslation(locale) {
  return TRANSLATIONS[normalizeLocale(locale)];
}

export function getLocaleOptions() {
  return SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: TRANSLATIONS[locale].languageName
  }));
}

export function translateStage(locale, stage) {
  const text = typeof stage === "string" ? stage.trim() : "";
  if (!text) {
    return "";
  }

  const messages = getTranslation(locale).status;
  const exactMap = new Map([
    ["Ready", messages.ready],
    ["Fetching playlist", messages.fetchingPlaylist],
    ["Preparing tab file writer", messages.preparingWriter],
    ["Finalizing file", messages.finalizingFile],
    ["Completed", messages.completed],
    ["Browser downloading", messages.browserDownloading],
    ["Downloaded file is not video, trying fallback", messages.downloadedNonVideo],
    ["Download interrupted, trying fallback", messages.interruptedRetrying],
    ["Download interrupted", messages.interrupted],
    ["Blob download failed", messages.blobFailed],
    ["Processing blob", messages.processingBlob],
    ["Trying direct blob fetch", messages.directBlob],
    ["Blob downloaded directly", messages.directBlobDone],
    ["Recording with fallback duration estimate", messages.recordFallbackEstimate],
    ["Recording with captureStream fallback", messages.recordFallbackStream],
    ["Recording fallback (audio track unavailable)", messages.recordFallbackNoAudio],
    ["Recording stream (fallback duration)", messages.recordingFallbackDuration],
    ["Recording stream", messages.recordingStream],
    ["Blob fallback failed", messages.blobFallbackFailed]
  ]);
  if (exactMap.has(text)) {
    return exactMap.get(text);
  }

  let match = /^Selected (.+) stream$/i.exec(text);
  if (match) {
    switch (normalizeLocale(locale)) {
      case "zh-Hant":
        return `已選擇 ${match[1]} 串流`;
      case "zh-Hans":
        return `已选择 ${match[1]} 流`;
      case "ja":
        return `${match[1]} ストリームを選択しました`;
      default:
        return text;
    }
  }

  match = /^Downloading segments (\d+)\/(\d+)$/i.exec(text);
  if (match) {
    switch (normalizeLocale(locale)) {
      case "zh-Hant":
        return `正在下載分段 ${match[1]}/${match[2]}`;
      case "zh-Hans":
        return `正在下载分段 ${match[1]}/${match[2]}`;
      case "ja":
        return `セグメントをダウンロード中 ${match[1]}/${match[2]}`;
      default:
        return text;
    }
  }

  match = /^Recorded as ([A-Z0-9]+)$/i.exec(text);
  if (match) {
    const format = match[1].toUpperCase();
    switch (normalizeLocale(locale)) {
      case "zh-Hant":
        return `已錄製為 ${format}`;
      case "zh-Hans":
        return `已录制为 ${format}`;
      case "ja":
        return `${format} として録画しました`;
      default:
        return text;
    }
  }

  return text;
}
