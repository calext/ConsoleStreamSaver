/**
 * @typedef {Object} VideoRecording
 * @property {String} id
 * @property {Blob[]} chunks
 * @property {number} duration
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * Opens IndexedDB "Captured" with a "recordings" object store.
 * @returns {Promise<IDBDatabase>}    Resolves with the database
 */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("CaptureDB", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("recordings")) {
        db.createObjectStore("recordings", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fetches a single recording from the "recordings" store by its primary key
 * 
 * @param {String} id - The unique ID of the recording
 * @returns {Promise<VideoRecording|false>} - Recording object or false if it doesn't exist
 */

async function getRecording(id) {
  const db = await openDB();

  const tx = db.transaction("recordings", "readonly");
  const store = tx.objectStore("recordings");

  return new Promise((resolve, reject) => {
    const req = store.get(id);

    req.onsuccess = () => {
      resolve(req.result || false); // return record or false
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Appends a video/audio chunk to a recordiong's chunk array and updates the metadata.
 * 
 * @param {String} id - Recording ID to append the chunk to
 * @param {Blob} chunk - Media chunk from Media recorder
 * @param {Number} currentTime - timestamp when chunk was captured
 * @param {String} [mimeType=video/webm] - mimetype of the chunk
 * @returns {Promise<VideoRecording>} - Updated video recording object with new chunk appended
 */

async function appendChunk({ id, chunk, currentTime, mimeType = "video/webm" }) {
  const db = await openDB();

  const tx = db.transaction("recordings", "readwrite");
  const store = tx.objectStore("recordings");

  const existingRecord = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  let record;

  if (existingRecord) {
    record = existingRecord;
    record.chunks = Array.isArray(record.chunks) ? record.chunks : [];
    record.chunks.push(chunk);
    record.duration = currentTime;
    record.updatedAt = Date.now();

    if (!record.mimeType && mimeType) {
      record.mimeType = mimeType;
    }
  } else {
    record = {
      id,
      chunks: [chunk],
      duration: currentTime,
      mimeType: chunk.type || mimeType,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  store.put(record);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Deletes a single recording from the "recordings" store by its primary key
 * 
 * @param {String} id - Recording ID to delete
 * @returns {Promise<Boolean>}
 */

async function deleteRecording(id) {
  const db = await openDB();

  const tx = db.transaction("recordings", "readwrite");
  const store = tx.objectStore("recordings");

  // optional: check if it exists first
  const existing = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  if (!existing) {
    console.log("No record found to delete");
    return false;
  }

  store.delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      console.log("Record deleted:", id);
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}