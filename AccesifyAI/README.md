# Accesify AI — Chrome Extension

Accesify AI is a Chrome extension that makes websites easier to use for everyone. It adds an accessibility layer on top of any page, letting you change how content looks, sounds, and behaves so browsing feels more comfortable and inclusive.

## Features

- **Reading Mode** — Removes clutter, centers text, and adds a reading guide line

- **Dyslexia Mode** — Switch to easier-to-read fonts with better spacing

- **Vision Filters** — Dark mode, contrast boost, and color-blind viewing modes

- **Voice Navigation** — Control pages hands-free with speech commands

- **AI Alt Text** — Generates descriptions for images that don’t have them

## Installation

1. Download or clone this folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `accesify-ai` folder
6. The extension icon appears in your toolbar; click to open!

## Voice Commands

| Command | Action |
|---|---|
| "scroll down" | Scroll page down |
| "scroll up" | Scroll page up |
| "read page" | Read page aloud |
| "stop reading" | Stop TTS |
| "click [name]" | Click element by text |
| "go back" | Browser back |
| "zoom in / zoom out" | Adjust zoom |

## File Structure

```
accesify-ai/
├── manifest.json     # Extension manifest (MV3)
├── popup.html        # Popup UI
├── popup.css         # Premium glassmorphism styles
├── popup.js          # Popup controller
├── content.js        # Page content manipulator
├── content.css       # Content script baseline CSS
├── background.js     # Service worker
├── ai.js             # AI alt text generation module
└── icons/            # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Architecture

- **Manifest V3** compliant
- **No external frameworks** — pure HTML/CSS/JS
- **Modular design** — each feature is self-contained
- **Chrome Storage API** — persists settings across sessions
- **Content Script messaging** — clean popup ↔ page communication
- **CSS injection** — all page styles are scoped and reversible

## How It Works

Accesify AI is built using plain HTML, CSS, and JavaScript with Chrome’s Manifest V3 extension system.
Each feature runs in its own module, so everything stays organized and fast. Settings are saved using Chrome storage, and scripts communicate cleanly between the popup and the webpage.

## Future Improvements

- Smarter AI text simplification

- More voice commands

- Support for other browsers (ex: Microsoft Edge, and Firefox)

- Sync settings across devices

## Why This Project Exists

Many websites still aren’t designed with accessibility in mind. Accesify AI helps fix that by letting users customize any page instantly. No redesigning required.
