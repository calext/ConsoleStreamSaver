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

/**
 * Starts captuuring a video element's stream and returns a cleanup controller.
 * 
 * @param {HTMLVideoElement} video 
 * @param {MediaStream} stream 
 * @param {String} id 
 * @returns {{stop: ()=> void}} object with stop method to end capture and clean up
 */

function startSmartListener(video, stream, id) {
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm"
  });

  let chunks = [];
  let lastSavedTime = 0;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(60000); // get chunk every 60 seconds

  async function handleTimeUpdate() {
    const currentTime = video.currentTime;

    // Only trigger when actual playback advanced by 60s
    if (currentTime - lastSavedTime >= 60) {
      lastSavedTime = currentTime;

      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: "video/webm" });
      chunks = [];

      await appendChunk({
        id,
        chunk: blob,
        currentTime
      });

      console.log("Saved at playback time:", currentTime);
    }
  }
  video.addEventListener("timeupdate", handleTimeUpdate);

  return {
    stop: () => {
      recorder.stop();
      video.removeEventListener("timeupdate", handleTimeUpdate);
    }
  };
}

/**
 * Ensures the video keeps playing even if the tab or window loses focus
 * 
 * @param {HTMLVideoElement} video 
 * @returns {{destroyPlaybackPermanence: ()=> void}} Returns a cleanup function
 */
function maintainVideoPlaybackPermanence(video){
  function ensurePermanence(params) {
    if(document.hidden){
      //tab is in background
      video.play().catch(()=>{});
    }else{
      //tab is active again
      video.play().catch(()=>{});
    }
  }
  function handleWindowBlur(e){
    video.play().catch(()=>{})
  }
  document.addEventListener("visibilitychange", ensurePermanence)
  window.addEventListener("blur", handleWindowBlur);
  return{
    destroyPlaybackPermanence: ()=>{
      document.removeEventListener("visibilitychange", ensurePermanence)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }
}

/**
 * 
 * @param {String} id 
 * @param {String} [filename=null] - You can set a filename, else, the id becomes the filename
 * @returns {Boolean}
 */
async function saveRecordingAsVideoFile(id, filename = null) {
  const record = await getRecording(id);

  if (!record) {
    console.log("No recording found");
    return false;
  }

  let videoBlob = null;

  if (record.blob instanceof Blob) {
    videoBlob = record.blob;
  } else if (Array.isArray(record.chunks) && record.chunks.length > 0) {
    videoBlob = new Blob(record.chunks, {
      type: record.mimeType || "video/webm"
    });
  } else {
    console.log("No video data found in record");
    return false;
  }

  const extension = (videoBlob.type && videoBlob.type.includes("webm")) ? "webm" : "webm";
  const safeFilename = filename || `${id}.${extension}`;

  const url = URL.createObjectURL(videoBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  return true;
}

/**
 * Takes the video element, string id and calls the startSmartListener function to start recording stream
 * stops recording when the video ends
 * 
 * @param {HTMLVideoElement} video 
 * @param {String} id 
 * @returns {{destroy: ()=> void}} Returns a cleanup function
 * 
 * @example
 * const video = document.querySelector(".player");
 * const id= document.querySelector("h1").textContent;
 * const controller= await initialize(video, id)
 * //later...
 * controller.destroy()
 */
async function initialize(video, id) {
  // 1. mute
  video.muted = true;

  // 2. ensure inline playback (important on mobile)
  video.setAttribute("playsinline", "");

  //take playbackRate to 4.0. ====> Not a good idea
  // video.playbackRate="4.0";

  //maintain playback even when tab loses focus
  const permanence= maintainVideoPlaybackPermanence(video);

  // 3. start playback
  try {
    await video.play(); 
  } catch (e) {
    console.log("Playback blocked");
  }

  // 4. capture stream
  const stream = video.captureStream();

  // 5. start recording logic
  const controller = startSmartListener(video, stream, id);

  // Attach ended listener here
  const onEnded = () => {
    console.log("Video ended");

    if (controller && typeof controller.stop === "function") {
      controller.stop();
    }
  };

  video.addEventListener("ended", onEnded);

  // Optional: expose cleanup
  return {
    destroy: () => {
      video.removeEventListener("ended", onEnded);
      permanence.destroyPlaybackPermanence()
      controller.stop();
    }
  };
}