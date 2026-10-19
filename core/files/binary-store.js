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
export async function putBinaryJob(key, value) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("jobs", "readwrite"), store = transaction.objectStore("jobs");
      const usage = store.get("__usage__");
      usage.onsuccess = () => {
        const old = store.get(key);
        old.onsuccess = () => {
          const byteSize = value?.bytes?.byteLength || 0;
          const total = (usage.result || 0) - (old.result?.byteSize || old.result?.bytes?.byteLength || 0) + byteSize;
          if (total > 512 * 1024 * 1024) { transaction.abort(); return; }
          store.put({ ...value, updatedAt: Date.now(), byteSize }, key);
          store.put(total, "__usage__");
        };
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error("Temporary storage exceeds global capacity limit (512 MiB)"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export const getBinaryJob = (key) => transact(key, "readonly", (store) => store.get(key));
export const deleteBinaryJob = (key) => scanBinaryJobs((storedKey) => storedKey === key);

export async function deleteBinaryPrefix(prefix) {
  return scanBinaryJobs((key) => String(key).startsWith(prefix));
}

export async function scanBinaryJobs(remove = () => false) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      let removed = 0, bytes = 0;
      const transaction = db.transaction("jobs", "readwrite");
      const store = transaction.objectStore("jobs");
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { store.put(bytes, "__usage__"); return; }
        if (cursor.key !== "__usage__") {
          if (remove(cursor.key, cursor.value)) { cursor.delete(); removed++; }
          else bytes += cursor.value?.byteSize || cursor.value?.bytes?.byteLength || 0;
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve({ removed, bytes });
      transaction.onabort = () => reject(transaction.error || new Error("Checkpoint cleanup failed"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
