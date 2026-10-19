// Download tasks outlive the page that discovered them.
export function retainDownloadTask(card) {
  return ["queued", "downloading", "paused", "completed"].includes(card?.status);
}
