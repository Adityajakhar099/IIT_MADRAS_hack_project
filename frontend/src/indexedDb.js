const dbName = "AegisOfflineQueueDB";
const storeName = "ocrQueue";

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const saveFileToOfflineQueue = async (file) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      
      const record = {
        name: file.name,
        type: file.type,
        size: file.size,
        blob: file, // File object is saved directly
        timestamp: Date.now()
      };
      
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.error);
    });
  } catch (err) {
    console.error("Failed to save file to IndexedDB:", err);
    throw err;
  }
};

export const getOfflineQueue = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        // Reconstruct File objects just in case they were downgraded to plain Blobs
        const records = request.result.map(item => {
          let fileObj = item.blob;
          if (!(fileObj instanceof File)) {
            fileObj = new File([item.blob], item.name, { type: item.type });
          }
          // Preserve the database ID
          fileObj.dbId = item.id;
          return fileObj;
        });
        resolve(records);
      };
      request.onerror = (e) => reject(e.error);
    });
  } catch (err) {
    console.error("Failed to get files from IndexedDB:", err);
    return [];
  }
};

export const removeFileFromOfflineQueue = async (id) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.error);
    });
  } catch (err) {
    console.error("Failed to delete file from IndexedDB:", err);
    throw err;
  }
};

export const clearOfflineQueue = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.error);
    });
  } catch (err) {
    console.error("Failed to clear IndexedDB queue:", err);
    throw err;
  }
};
