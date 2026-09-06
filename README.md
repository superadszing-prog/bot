# 🤖 AI Bot Browser Extension

AI Bot Browser Extension - Real-time video processing with Thai language commands for social media content protection (ปกป้องใบหน้า, เบลอทะเบียน, ตัดตอน).

Works on **Chrome / Firefox / Edge** (Manifest V3). Lets you type commands
in **Thai** — e.g. `ปกป้องใบหน้า`, `เบลอทะเบียน`, `ตัดตอน 00:05-00:10` — that
are applied **in real time** to videos already posted on Facebook, TikTok
and Instagram feeds, without re-uploading or deleting the original post.
All processing happens locally in your browser; permissions are **off by
default** and only activate for the sites you explicitly enable.

## Features

- 🇹🇭 Thai-language command box in the popup (also understands common
  English phrases like `blur face`, `trim`).
- 🎬 Frame extraction from embedded `<video>` elements on supported social
  networks.
- 🧠 AI vision analysis via the OpenAI Vision API (face / license-plate /
  personal-info region detection).
- 🎨 Real-time canvas overlay rendering: blur, pixelate, and trim
  (blackout) segments — rendered live on top of the video as it plays.
- 🔐 User-controlled, per-site permissions (Facebook / TikTok / Instagram)
  stored locally via `chrome.storage.local`; nothing runs until you enable
  a site and enter your own API key.
- 📊 Real-time processing status shown in the popup (idle / processing /
  done / error).

## Repository structure

```
manifest.json                  Extension manifest (Manifest V3)
icons/                         Toolbar/store icons (16/48/128 px)
src/
  background/
    service-worker.js          Routes commands between popup <-> content scripts
  content-scripts/
    common/
      video-detector.js        Shared controller: detects videos, applies actions
      overlay.css              Styles for the in-page overlay/status badge
    facebook.js                Facebook entry point
    tiktok.js                  TikTok entry point
    instagram.js               Instagram entry point
  core/
    commandParser.js           Thai command -> structured action parser
    frameExtractor.js          <video> -> canvas frame capture
    videoProcessor.js          Real-time blur/pixelate/trim overlay renderer
    aiVision.js                OpenAI Vision API client (face/object detection)
    permissions.js             chrome.storage.local settings + per-site toggles
  popup/
    popup.html / popup.js / popup.css   Thai UI: command box, status, permissions
  utils/
    logger.js                  Leveled logger shared across all contexts
config/
  config.example.json          Example local defaults (copy to config/config.json)
.env.example                   Example env vars for Node tooling/tests
test/                          Jest unit tests for parser/logger/permissions
```

## Setup instructions

### 1. Install dependencies (for running the test suite)

```bash
npm install
```

### 2. Load the extension (unpacked) in your browser

**Chrome / Edge:**
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this repository's root folder.

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json`.

### 3. Configure permissions & API key

1. Click the extension icon to open the popup.
2. Under **การอนุญาต (Permissions)**, enable the social networks you want
   the bot to run on (all are **off by default**).
3. Paste your OpenAI API key (used for face/plate detection via the
   Vision API) and click **บันทึกการตั้งค่า** (Save settings).

   > Your key is stored only in `chrome.storage.local` on your machine —
   > see `config/config.example.json` and `.env.example` for optional
   > local-development defaults; neither is required to use the extension.

### 4. Use Thai commands

Open Facebook, TikTok, or Instagram (on an enabled site), then in the
popup's command box try:

| Command (Thai)                | Effect                                   |
| ------------------------------ | ----------------------------------------- |
| `ปกป้องใบหน้า`                 | Blurs detected faces in visible videos    |
| `เบลอทะเบียน`                  | Blurs detected license plates             |
| `ตัดตอน 00:05-00:10`           | Blacks out/skips the 5s–10s segment       |
| `ปกป้องใบหน้าและเบลอทะเบียน`   | Combines multiple actions in one command  |

Status is shown live in the popup (พร้อมทำงาน / กำลังประมวลผล / เสร็จสิ้น /
เกิดข้อผิดพลาด).

## Development

Run the unit tests (command parser, logger, permissions fallback logic):

```bash
npm test
```

## Notes & limitations

- The extension **does not modify the original video file** on Facebook/
  TikTok/Instagram's servers; it renders a protective overlay live in your
  browser as the video plays, so only you (the extension user) see the
  protected version.
- AI region detection requires a valid OpenAI API key with Vision-capable
  model access; without a key, protect commands log a warning and skip
  detection instead of failing silently.
- This is provided as a functional starting point — for production use,
  review OpenAI API usage/cost, add rate limiting, and audit selectors
  against the current DOM structure of each social network (they change
  frequently).
