'use strict';

/**
 * Tiny dependency-free PNG writer used to draw simple bar/line chart
 * figures for sample and seed manuscripts.
 */
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function hex(color) {
  const n = parseInt(color.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Draws a chart. kind: 'bar' | 'line'.
 */
function chartPng({ width = 480, height = 300, values = [3, 5, 2, 8, 6], kind = 'bar', color = '#2F6FDE' } = {}) {
  const px = Buffer.alloc(width * height * 3, 255);
  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
  };
  const rect = (x0, y0, x1, y1, rgb) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, rgb);
  };
  const line = (x0, y0, x1, y1, rgb, w = 2) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      rect(x - w + 1, y - w + 1, x + w - 1, y + w - 1, rgb);
    }
  };
  const axis = [60, 60, 60];
  const grid = [230, 230, 230];
  const m = { l: 50, r: 20, t: 20, b: 40 };
  const plotW = width - m.l - m.r;
  const plotH = height - m.t - m.b;
  for (let g = 1; g <= 4; g++) {
    const y = m.t + Math.round((plotH * g) / 5);
    line(m.l, y, width - m.r, y, grid, 1);
  }
  line(m.l, m.t, m.l, height - m.b, axis, 2);
  line(m.l, height - m.b, width - m.r, height - m.b, axis, 2);
  const max = Math.max(...values) * 1.1 || 1;
  const rgb = hex(color);
  const step = plotW / values.length;
  const pts = [];
  values.forEach((v, i) => {
    const h = Math.round((v / max) * plotH);
    const cx = Math.round(m.l + step * i + step / 2);
    if (kind === 'bar') {
      rect(Math.round(cx - step * 0.3), height - m.b - h, Math.round(cx + step * 0.3), height - m.b - 1, rgb);
    }
    pts.push([cx, height - m.b - h]);
  });
  if (kind === 'line') {
    for (let i = 1; i < pts.length; i++) line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], rgb, 2);
    pts.forEach(([x, y]) => rect(x - 4, y - 4, x + 4, y + 4, rgb));
  }

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    px.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

module.exports = { chartPng };
