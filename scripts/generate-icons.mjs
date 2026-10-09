#!/usr/bin/env node
/** Generate PNG sizes from the supplied artwork using Node built-ins only. */

import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(rootDir, 'public', 'icons');
const sizes = [16, 32, 48, 128];
const source = decodePng(readFileSync(join(rootDir, 'assets', 'icon-source.png')));

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

// The checked-in master is an 8-bit RGB/RGBA PNG. Undo its PNG row filters.
function decodePng(png) {
  if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const channels = png[25] === 2 ? 3 : png[25] === 6 ? 4 : 0;
  if (png[24] !== 8 || !channels || png[28] !== 0 || width !== height) throw new Error('Use a square, noninterlaced 8-bit RGB/RGBA master');
  const parts = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p);
    if (png.toString('ascii', p + 4, p + 8) === 'IDAT') parts.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('Invalid PNG pixel length');
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a,b,c) => { const p=a+b-c, da=Math.abs(p-a), db=Math.abs(p-b), dc=Math.abs(p-c); return da<=db && da<=dc ? a : db<=dc ? b : c; };
  for (let y=0; y<height; y++) {
    const filter=raw[y*(stride+1)];
    if (filter>4) throw new Error('Invalid PNG filter');
    for (let x=0; x<stride; x++) {
      const i=y*stride+x, a=x>=channels ? pixels[i-channels] : 0, b=y ? pixels[i-stride] : 0, c=y && x>=channels ? pixels[i-stride-channels] : 0;
      const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[i]=(raw[y*(stride+1)+1+x]+prediction)&255;
    }
  }
  return {width,height,channels,pixels};
}

// Area averaging retains all of the original artwork at toolbar sizes.
function renderIcon(size) {
  const {width,channels,pixels}=source, scale=width/size;
  const out=Buffer.alloc(size*size*4);
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const sums=[0,0,0,0]; let area=0;
    for (let sy=Math.floor(y*scale); sy<Math.ceil((y+1)*scale); sy++) {
      const wy=Math.min(sy+1,(y+1)*scale)-Math.max(sy,y*scale);
      for (let sx=Math.floor(x*scale); sx<Math.ceil((x+1)*scale); sx++) {
        const weight=wy*(Math.min(sx+1,(x+1)*scale)-Math.max(sx,x*scale)), i=(sy*width+sx)*channels;
        for(let c=0;c<4;c++) sums[c]+=weight*(c===3 && channels===3 ? 255 : pixels[i+c]);
        area+=weight;
      }
    }
    for(let c=0;c<4;c++) out[(y*size+x)*4+c]=Math.round(sums[c]/area);
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const size of sizes) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(join(outDir, `icon-${size}.png`), png);
}
process.stdout.write(`Generated ${sizes.length} icons in ${outDir}\n`);
