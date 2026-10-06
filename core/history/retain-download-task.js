// Download tasks outlive the page that discovered them.
export function retainDownloadTask(card) {
  return card?.status === "downloading" || card?.status === "completed";
}
