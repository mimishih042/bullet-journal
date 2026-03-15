# Stickory

A creative, browser-based monthly journal you can decorate with stickers. Design your page, place and transform stickers on the calendar, then export a print-ready PNG — all without any account or backend.

---

## Features

### Calendar & Layout
- Full monthly calendar with a consistent 6-row grid
- Month tab navigation and year controls
- Left notes panel with a freeform text area
- Responsive layout that hides the editor on small screens and shows a friendly message instead

### Stickers
- **Upload your own stickers** — PNG or JPEG images
- **Bulk upload** — select multiple files at once
- **Sticker sheet extraction** — upload a photo of a sticker sheet with a white background and the app automatically cuts out each sticker with a transparent background
- **Drag onto the calendar** — place stickers anywhere on the journal page
- Stickers persist across sessions via IndexedDB

### Sticker Interaction
| Device | Gestures |
|---|---|
| Desktop | Drag to move · Corner handles to resize · Rotate handle |
| Tablet / Touch | One-finger drag · Two-finger pinch to resize · Two-finger rotate |

- Tap a sticker (touch) to select it and reveal the delete button
- Peel animation on hover

### Customization
- Solid background color picker
- Upload a custom background image
- Customization panel slides in/out without reloading the page

### Export
- **Save as PNG** at 2× resolution
- Exports a square canvas with the journal centred and background color/image included
- Shadows and today-cell highlights are automatically stripped from the export
- iOS Safari font fix: fonts are embedded as base64 before capture

### PWA
- Installable as a desktop or home screen app
- Offline support via a service worker (cache-first strategy)
- iOS Add to Home Screen compatible

---

## Tech Stack

| Layer | Library |
|---|---|
| UI framework | React 18 + TypeScript |
| Sticker drag (desktop) | Pointer Events API |
| Sticker gestures (touch) | Native Touch Events |
| Image cropping | react-easy-crop |
| PNG export | html-to-image |
| HEIC support | heic2any |
| Persistence | IndexedDB (custom storage.ts) |
| PWA | Web App Manifest + Service Worker |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```

The app runs at `http://localhost:5173` by default.

---

## Project Structure

```
src/
├── App.tsx                     # Root layout, year/month state, PWA install prompt
├── main.tsx                    # Entry point, service worker registration
├── storage.ts                  # IndexedDB helpers (settings, stickers, placed stickers)
├── tokens.css / tokens.ts      # Design tokens (colors, spacing, z-index…)
├── components/
│   ├── CalendarCard.tsx        # Full journal card (grid + left panel + sticker layer)
│   ├── CalendarGrid.tsx        # 6-row calendar grid (always 42 cells)
│   ├── CalendarCell.tsx        # Individual day cell with photo upload + HEIC support
│   ├── MonthTabs.tsx           # Horizontal month tab bar
│   ├── LeftPanel.tsx           # Notes panel (month label + freeform textarea)
│   ├── StickerLayer.tsx        # Placed-sticker rendering + drag/pinch/rotate gestures
│   ├── BackgroundControl.tsx   # Side panel: background, stickers, export
│   ├── CropModal.tsx           # Photo crop modal (square / circle / stamp shapes)
│   ├── ExtractModal.tsx        # Sticker-sheet upload explainer modal
│   └── StickerPeelPreview.tsx  # Sticker thumbnail with peel-on-hover animation
├── utils/
│   └── extractStickers.ts      # Canvas-based sticker sheet extraction (flood fill + BFS)
└── assets/
    ├── favicon.png
    ├── extract-example.png
    └── edit.svg
public/
├── favicon.png
├── manifest.json               # PWA manifest
└── sw.js                       # Service worker (cache-first)
```

---

## Sticker Sheet Extraction

The extraction pipeline runs entirely in the browser using the Canvas API:

1. Scale the uploaded image down to a maximum of 1800 px on the long side
2. Edge-seeded flood fill — marks pixels connected to the image border as background (works for white or near-white backgrounds)
3. Erase background pixels (set alpha = 0)
4. BFS connected-component labeling — finds each distinct sticker blob
5. Filter out blobs smaller than 500 px² (noise)
6. Pad each bounding box by 8 px and export as a transparent PNG data URL
