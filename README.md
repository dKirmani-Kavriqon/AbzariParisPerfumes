# Abzari Paris

Standalone storefront for Abzari Paris. React, Vite and Three.js, with no Shopify or other backend. The cart is stored in the browser and the checkout is a demo.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```

## Deploy on Vercel

Import the repo in Vercel. It detects Vite on its own: the build command is `npm run build` and the output folder is `dist`. `vercel.json` sends every route to `index.html` so links like `/product/rawah` work when opened directly.

## What is where

| Path | What it does |
| --- | --- |
| `src/components/RawahStory.tsx` | The pinned scroll story on the home page. It turns scroll progress and drag into motion state and fades the text chapters. |
| `src/three/RawahScene.tsx` | Canvas, studio lighting (built from Lightformers, so no HDR download) and the scroll choreography. |
| `src/three/Bottle.tsx` | The 50ml flacon: lathed glass, liquid, label, atomiser and cap. |
| `src/three/liquidMaterial.ts` | The liquid shader and the damped spring that drives the slosh. |
| `src/three/SprayMist.tsx` | The atomiser spray: droplets launched sideways from the nozzle, slowed by air drag, then drifting as mist. |
| `src/three/spray.ts` | Nozzle position, spray direction and the press rhythm shared by the bottle and the mist. |
| `src/three/label.ts` | Paints the label on a canvas and bends it onto the glass. |
| `src/data/products.ts` | All 21 products, prices and notes. Edit this file to change the catalogue. |
| `public/products/` | Product photos. A file named after the product slug is picked up automatically. |
| `public/notes/` | Round ingredient images used for the notes. |

## Hosted preview build

`npm run build:preview` builds a copy with relative asset paths and in-memory routing into `dist-preview/`, for hosts that serve the site from a sub-path.

## How the liquid works

The oil is not a fluid simulation. It is a mesh the shape of the inside of the bottle, cut by a plane in world space, so it stays level however the bottle turns. Each frame the bottle's linear and angular velocity feed a damped spring that tilts that plane, which makes the oil lag, overshoot and settle. Back faces that survive the cut are shaded as the top surface of the liquid. This keeps the effect smooth on phones as well.

The glass body uses drei's `MeshTransmissionMaterial` on three's own transmission pass, so the oil is refracted (with slight chromatic aberration) but the label on the outside of the glass is not.

## How the spray works

When a note chapter is on screen the actuator presses every 2.6 seconds. Each droplet's position is a closed-form function of its age: a launch along a narrow cone from the nozzle, exponential air drag, then a slow billow and spread. It all runs in the vertex shader, so thousands of droplets cost no CPU time.

## Before going live

- The product photos are cut from screenshots of the current store. Swap in the original files at the same names for sharper images.
- The logo is traced from a small raster. A vector logo would make the header and the bottle label sharper.
- Only Rawah and Voyage have published notes. Other products show their photo, size and price.
- 100ml sizes are not listed because their prices are not published.
- Checkout, payments and the contact form need a real backend before launch.
