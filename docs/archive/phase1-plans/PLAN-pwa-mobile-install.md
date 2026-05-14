# PLAN: PWA Mobile Install Support for Groei (Local Network / Home WiFi)

## Goal
Make Groei installable as a home screen app on iPhone via Safari, connecting to the Windows PC
over home WiFi. No Tailscale, no cloud — works when you're home (which is when you're in the garden anyway).

## Session starter prompt

```
I have a garden planning PWA called Groei built with React 18 + TypeScript + Vite and a FastAPI backend.
I want to add proper PWA support so it can be installed on my iPhone via Safari on home WiFi.
Tailscale is not available — the phone connects directly to the PC's local network IP.
Please follow the plan in this file exactly: PLAN-pwa-mobile-install.md
The frontend lives in the `frontend/` directory (or wherever vite.config.ts is — check first).
```

---

## What needs to happen

1. Make Vite's dev server accessible on the local network (not just localhost)
2. Make FastAPI bind to the local network (not just localhost)
3. Install `vite-plugin-pwa`
4. Create app icons (192px and 512px)
5. Configure the PWA plugin in `vite.config.ts`
6. Add iOS-specific meta tags to `index.html`
7. Add a helper script that prints the install URL with the local IP

---

## Step-by-step changes

### 1. Find your PC's local IP (do this yourself, not Claude Code)

Run in Command Prompt:
```
ipconfig
```
Look for **IPv4 Address** under your WiFi adapter — something like `192.168.1.105`.
You'll use this address to open the app on your phone.

---

### 2. Update Vite dev server config in `vite.config.ts`

Add `host: true` to the server config so Vite listens on all network interfaces, not just localhost:

```ts
server: {
  host: true,           // listen on local network IP, not just localhost
  port: 5173,
  proxy: {
    '/api': 'http://localhost:8000',
  },
},
```

> **Note:** Merge with any existing server config — don't overwrite it.

---

### 3. Update FastAPI startup to bind to `0.0.0.0`

Find where uvicorn is started (likely `main.py` or a start script). Change:

```python
# Before
uvicorn.run(app, host="127.0.0.1", port=8000)

# After
uvicorn.run(app, host="0.0.0.0", port=8000)
```

Or if it's run from the command line, update the start command:
```bash
# Before
uvicorn main:app --port 8000

# After
uvicorn main:app --host 0.0.0.0 --port 8000
```

> This lets the phone reach the API. It's only exposed on your home network, not the internet.

---

### 4. Install the PWA plugin

```bash
cd frontend
npm install -D vite-plugin-pwa
```

---

### 5. Create app icons

Install `sharp` for icon generation:
```bash
npm install -D sharp
```

Create `frontend/scripts/generate-icons.mjs`:

```js
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#2d6a4f"/>
  <text x="50" y="68" font-size="60" font-family="serif" font-weight="bold"
        text-anchor="middle" fill="white">G</text>
</svg>`;

const buf = Buffer.from(svg);

for (const size of [192, 512]) {
  await sharp(buf)
    .resize(size, size)
    .png()
    .toFile(`public/pwa-${size}x${size}.png`);
  console.log(`Generated pwa-${size}x${size}.png`);
}
```

Run it:
```bash
node scripts/generate-icons.mjs
```

---

### 6. Update `vite.config.ts` with PWA plugin

Full updated config (merge with existing, don't replace):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Groei',
        short_name: 'Groei',
        description: 'Garden planning app',
        theme_color: '#2d6a4f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

---

### 7. Add iOS meta tags to `index.html`

In `frontend/index.html`, add inside `<head>`:

```html
<!-- PWA iOS support -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Groei">
<link rel="apple-touch-icon" href="/pwa-192x192.png">
<meta name="theme-color" content="#2d6a4f">
```

---

### 8. Add a helper script that prints the install URL

Create `frontend/scripts/print-url.mjs`:

```js
import { networkInterfaces } from 'os';

const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`\n📱 Open this on your iPhone (on home WiFi):`);
      console.log(`   http://${net.address}:5173\n`);
    }
  }
}
```

Add to `package.json` scripts:
```json
"url": "node scripts/print-url.mjs"
```

So you can run `npm run url` any time to get the address to type into Safari.

---

## How to install on your iPhone

1. Make sure your iPhone is on the **same home WiFi** as your PC
2. Dubbelklik **`start-groei-mobile.bat`** (bouwt frontend + start backend op poort 8000)
3. Open **Safari** op je iPhone en ga naar `http://192.168.1.139:8000`
4. Tik op het **Deel-icoon** (vierkantje met pijl onderaan)
5. Tik **"Zet op beginscherm"**
6. Tik **Voeg toe**

The Groei icon will appear on your home screen. Tap it and it opens full-screen with no browser bar.

---

## Expected result

- Green "G" icon on iPhone home screen
- Opens full-screen, no Safari bar
- Works instantly when home on WiFi
- Lisbeth can install it the same way on her phone

## Notes

- This only works on home WiFi — that's fine for a garden app
- In dev mode the PWA service worker is disabled by default; the home screen install
  still works but the app won't cache offline. If you want offline support, test using
  `npm run build && npm run preview` instead
- `host: true` only exposes the app on your local network, not the internet
