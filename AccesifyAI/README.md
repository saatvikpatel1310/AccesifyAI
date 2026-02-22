# Accesify AI — Chrome Extension

A production-quality Chrome extension providing AI-powered accessibility tools for every website.

## Features

- 📖 **Reading Mode** — Removes clutter, centers text, highlights reading line
- 🔤 **Dyslexia Mode** — Lexend/OpenDyslexic/Atkinson fonts with optimized spacing
- 👁️ **Vision Filters** — Dark mode, high contrast, colorblind simulations
- 🎤 **Voice Navigation** — Hands-free browsing with speech commands
- 🤖 **AI Alt Text** — Auto-generates descriptions for images without alt text

## Installation

1. Download or clone this folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `accesify-ai` folder
6. The extension icon appears in your toolbar — click to open!

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

## Production Notes

For the AI Alt Text feature in a production environment:
- Replace the heuristic engine in `ai.js` with a call to an AI vision API (e.g., Google Cloud Vision, OpenAI GPT-4V)
- Add your API key management via background service worker
- Implement request batching and caching for performance
