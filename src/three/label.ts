import * as THREE from 'three'
import crestAsset from '../assets/brand/crest-gold.png'
import { radiusAt, DEPTH } from './profile'

// The oval label, painted on canvas so it stays sharp at any zoom.
// Two passes: a colour map, and a mask that tells the material which pixels are foil.

const W = 1400
const H = 1000
const GOLD = '#d8b064'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function paint(ctx: CanvasRenderingContext2D, crest: HTMLImageElement, name: string, mask: boolean) {
  const ink = mask ? '#000' : '#0a0806'
  const foil = mask ? '#fff' : GOLD
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(W / 2, H / 2)
  // body
  ctx.beginPath()
  ctx.ellipse(0, 0, W / 2 - 6, H / 2 - 6, 0, 0, Math.PI * 2)
  ctx.fillStyle = ink
  ctx.fill()
  // foil rings
  ctx.strokeStyle = foil
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.ellipse(0, 0, W / 2 - 34, H / 2 - 34, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(0, 0, W / 2 - 54, H / 2 - 54, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // crest
  const cw = 250
  const ch = (crest.height / crest.width) * cw
  if (mask) {
    // turn the crest into pure white for the foil mask
    const off = document.createElement('canvas')
    off.width = cw
    off.height = ch
    const o = off.getContext('2d')!
    o.drawImage(crest, 0, 0, cw, ch)
    o.globalCompositeOperation = 'source-in'
    o.fillStyle = '#fff'
    o.fillRect(0, 0, cw, ch)
    ctx.drawImage(off, W / 2 - cw / 2, 120)
  } else {
    ctx.drawImage(crest, W / 2 - cw / 2, 120, cw, ch)
  }

  ctx.fillStyle = foil
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const serif = '"Cormorant Garamond", Georgia, serif'
  ctx.font = `600 132px ${serif}`
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px'
  ctx.fillText('ABZARI', W / 2 - 10, 500)
  ctx.font = `600 34px ${serif}`
  ctx.fillText('TM', W / 2 + 268, 430)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '22px'
  ctx.font = `600 62px ${serif}`
  ctx.fillText('PARIS', W / 2 + 10, 580)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '8px'
  ctx.font = `600 150px ${serif}`
  ctx.fillText(name.toUpperCase(), W / 2, 750)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px'
  ctx.font = `700 48px ${serif}`
  ctx.fillText('50ml EDP', W / 2, 850)
}

export async function makeLabelTextures(name: string) {
  await document.fonts.load('600 100px "Cormorant Garamond"').catch(() => undefined)
  const crestImg = await loadImage(crestAsset.src)
  const make = (mask: boolean) => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    paint(c.getContext('2d')!, crestImg, name, mask)
    const t = new THREE.CanvasTexture(c)
    t.anisotropy = 8
    if (!mask) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  return { map: make(false), foil: make(true) }
}

/**
 * A plane bent onto the front of the flacon. Every vertex is pushed out to the glass
 * surface using the same profile the bottle was lathed from, so the label hugs it exactly.
 */
export function makeLabelGeometry(width = 1.36, height = 0.97, yCenter = -0.02) {
  const g = new THREE.PlaneGeometry(width, height, 48, 32)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i) + yCenter
    const R = radiusAt(y)
    const z = DEPTH * Math.sqrt(Math.max(R * R - x * x, 0)) + 0.006
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}
