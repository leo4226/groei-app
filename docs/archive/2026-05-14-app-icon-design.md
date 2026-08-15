# App Icon — Greenhouse Window

**Date:** 2026-05-14  
**Status:** Approved

## Goal

Replace all existing app/system icons with the new greenhouse window SVG across favicon, PWA manifest, and Apple touch icon. Clean up unused legacy PNG files.

## Source icon

The greenhouse window SVG is stored as the source of truth at `public/app-icon.svg`. It is a 100×100 unit canvas with:
- Warm parchment linear gradient background (`#FFFDF6` → `#F0E8D0`)
- Rounded corners (`rx="22"`)
- Muntin grid lines in warm brown (`#6B4A35`)
- Perimeter frame stroke
- Subtle glass highlight triangles

The SVG fragment provided by the user is wrapped in a complete `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` document.

`public/favicon.svg` is replaced with the same content (or symlinked to `app-icon.svg`; for simplicity, a copy).

## Generated PNG outputs

A dev-only script `scripts/generate-icons.js` uses `sharp` to rasterise `app-icon.svg` into three PNG sizes:

| File | Size | Used by |
|------|------|---------|
| `public/icons/icon-192.png` | 192×192 | `manifest.json` |
| `public/icons/icon-512.png` | 512×512 | `manifest.json` (standard + maskable) |
| `public/icons/icon-180.png` | 180×180 | `index.html` apple-touch-icon |

The cream/parchment background fills the maskable safe zone naturally — no extra padding needed.

Run once after changes to the source SVG:
```
node scripts/generate-icons.js
```

`sharp` is added as a dev dependency in `groei/frontend/package.json`.

## Manifest changes (`public/manifest.json`)

Keep the existing two entries; update `src` paths to the regenerated files. The 180px icon is not added to the manifest — apple-touch-icon is declared in HTML. The maskable entry continues to point at `icon-512.png`.

No changes to `name`, `short_name`, `theme_color`, or `background_color`.

## HTML changes (`index.html`)

- `<link rel="icon">` already points at `favicon.svg` — no change needed beyond replacing the file.
- `<link rel="apple-touch-icon">` updated from `icon-192-plant.png` → `icon-180.png`.

## Cleanup

Delete from `public/icons/`:
- `icon-192-plant.png`
- `icon-192-bostonfern_bare.png`
- `icon-512-bostonfern_bare.png`
- `icon-192-seed_bare.png`
- `icon-512-seed_bare.png`
- `icon-192-monstera.png`
- `icon-512-monstera.png`
- `icon-192-silvergrass_bare.png`
- `icon-512-silvergrass_bare.png`
- `icon-192-strawberry_bare.png`
- `icon-512-strawberry_bare.png`

None of these are referenced in any source file.

## Out of scope

- In-app usage of the icon (splash screen, header logo) — not requested.
- Automated icon generation as part of the Vite build.
- Any changes to plant species icons served from `/api/icons/`.

