#!/usr/bin/env node
/**
 * Generate the extension icons without any third-party dependencies.
 *
 * Uses zlib (Node built-in) to encode RGBA PNGs. The design is a dark rounded
 * tile with a traffic-light motif (red / amber / green) — recognisable and
 * legible at small sizes, and never reliant on colour alone in the product UI.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(rootDir, 'public', 'icons');
const sizes = [16, 32, 48, 128];
const SS = 4; // supersampling factor

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function insideRoundedRect(x, y, size, margin, radius) {
  const min = margin;
  const max = size - margin;
  if (x < min || x > max || y < min || y > max) {
    return false;
  }
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function circleCoverage(x, y, size, offsetX, offsetY, radius) {
  const cx = size / 2 + offsetX;
  const cy = size / 2 + offsetY;
  const dist = Math.hypot(x - cx, y - cy);
  // smooth edge over one supersample step
  const edge = size / SS;
  if (dist <= radius - edge) {
    return 1;
  }
  if (dist >= radius + edge) {
    return 0;
  }
  return (radius + edge - dist) / (2 * edge);
}

const TILE = [31, 35, 40, 255]; // #1f2328
const DOTS = [
  { color: [255, 43, 43], offsetY: -0.28 }, // red
  { color: [255, 192, 0], offsetY: 0 }, // amber
  { color: [51, 255, 0], offsetY: 0.28 }, // green
];

function renderIcon(size) {
  const big = size * SS;
  const hi = Buffer.alloc(big * big * 4);
  const margin = big * 0.06;
  const radius = big * 0.22;
  const dotRadius = big * 0.135;
  const dotOffsetX = 0;

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const i = (y * big + x) * 4;
      if (!insideRoundedRect(x + 0.5, y + 0.5, big, margin, radius)) {
        continue;
      }
      let r = TILE[0];
      let g = TILE[1];
      let b = TILE[2];
      let a = 255;
      for (const dot of DOTS) {
        const cov = circleCoverage(x + 0.5, y + 0.5, big, dotOffsetX, big * dot.offsetY, dotRadius);
        if (cov > 0) {
          r = mix(r, dot.color[0], cov);
          g = mix(g, dot.color[1], cov);
          b = mix(b, dot.color[2], cov);
        }
      }
      hi[i] = r;
      hi[i + 1] = g;
      hi[i + 2] = b;
      hi[i + 3] = a;
    }
  }

  // Downsample with box filter (supersampling anti-aliasing).
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          r += hi[i];
          g += hi[i + 1];
          b += hi[i + 2];
          a += hi[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const size of sizes) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(join(outDir, `icon-${size}.png`), png);
}
process.stdout.write(`Generated ${sizes.length} icons in ${outDir}\n`);
