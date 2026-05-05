# ConsoleStreamSaver
Capture and save media streams directly from any <video> element using your browser's dev console. No extensions, no backend — just paste and run.

## Features
- 🎥 Capture any video element's stream
- 💾 Save recordings directly from browser console
- 🔄 Maintains playback when tab loses focus
- 📦 Stores chunks in IndexedDB for persistence
- 🧹 Cleanup function to release resources

## Quick Start
1. Open dev console (F12)
2. Copy and paste the script
3. Run `initialize(videoElement, "my-recording-Name")`
4. call `destroy()` when done
5. Run `saveRecordingAsVideoFile("my-recording-Name", <optional_filename>)` to save recording into a video file
6. call `deleteRecording("my-recording-Name")` to delete the data saved in IndexedDB

## Usage

### Basic example
```javascript

// Get the video element
const video= document.querySelector("video");

// Set video name or use h1 text content
const videoID= document.querySelector("h1").textContent || "my video id";

// Start capturing
const controller= initialize(video, videoID);

// ... let it record ...

// cleanup when the video reaches the end
controller.destroy();


// Save the recording into a video file
await saveRecordingAsVideoFile(videoID);


// after saving the video file, you can go ahead to delete the streams saved in IndexedDB
await deleteRecording(videoID);
```