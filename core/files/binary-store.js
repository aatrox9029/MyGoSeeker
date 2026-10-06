// Structured cloning preserves binary data without Chrome JSON messaging or size limits.
async function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mygoseeker-binary-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("jobs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(key, mode, action) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("jobs", mode);
      const request = action(transaction.objectStore("jobs"), key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error || new Error("Binary store aborted"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export const putBinaryJob = (key, value) => transact(key, "readwrite", (store) => store.put(value, key));
export const getBinaryJob = (key) => transact(key, "readonly", (store) => store.get(key));
export const deleteBinaryJob = (key) => transact(key, "readwrite", (store) => store.delete(key));
