/**
 * Generates public/og-image.png (1200×630), the link-preview image for social sites.
 * Usage: npx vite-node scripts/make-og.ts
 */
import { writeFileSync } from 'node:fs';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

const W = 1200;
const H = 630;
const NAVY = '#14254a';
const PAPER = '#fbfaf7';
const WARM = '#c8632b';
const INK = 'rgba(20,37,74,';

const c = createCanvas(W, H);
const g = c.getContext('2d');

g.fillStyle = NAVY;
g.fillRect(0, 0, W, H);

// Headline.
g.fillStyle = PAPER;
g.font = '600 60px Georgia, serif';
['Turn any', 'assignment brief into', 'a ready-to-fill', 'Word template'].forEach((line, i) => g.fillText(line, 80, 150 + i * 72));
g.fillStyle = WARM;
g.fillRect(80, 410, 120, 6);
g.fillStyle = 'rgba(251,250,247,0.78)';
g.font = '28px Arial, sans-serif';
g.fillText('Cover · Contents · One part per page · Rubric', 80, 470);
g.fillText('Runs in your browser. Files never leave it.', 80, 512);

function page(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, rot: number, draw: (ctx: SKRSContext2D) => void, bg = '#ffffff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = 'transparent';
  draw(ctx);
  ctx.restore();
}
const bar = (ctx: SKRSContext2D, x: number, y: number, w: number, h: number, a: number) => {
  ctx.fillStyle = `${INK}${a})`;
  ctx.fillRect(x, y, w, h);
};

// Contents page.
page(g, 930, 100, 230, 325, 4, (ctx) => {
  bar(ctx, 60, 30, 110, 10, 0.7);
  for (let i = 0; i < 8; i++) {
    bar(ctx, 24 + (i % 3 === 2 ? 14 : 0), 66 + i * 28, 110, 7, 0.45);
    bar(ctx, 196, 66 + i * 28, 10, 7, 0.45);
  }
});
// Cover page (light blue).
page(
  g,
  815,
  150,
  230,
  325,
  -5,
  (ctx) => {
    ctx.fillStyle = NAVY;
    ctx.fillRect(95, 26, 40, 40);
    bar(ctx, 55, 82, 120, 10, 0.7);
    bar(ctx, 45, 104, 140, 7, 0.45);
    bar(ctx, 65, 120, 100, 7, 0.35);
    ctx.strokeStyle = `${INK}0.5)`;
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 4; r++) for (let col = 0; col < 3; col++) ctx.strokeRect(20 + col * 64, 190 + r * 30, 64, 30);
  },
  '#dcebf7',
);
// Rubric (landscape).
page(g, 870, 415, 300, 190, -2, (ctx) => {
  ctx.strokeStyle = `${INK}0.35)`;
  ctx.lineWidth = 1.2;
  for (let r = 0; r < 4; r++) for (let col = 0; col < 5; col++) ctx.strokeRect(16 + col * 54, 18 + r * 38, 54, 38);
  ctx.fillStyle = `${INK}0.08)`;
  ctx.fillRect(16, 18, 270, 38);
});

writeFileSync('public/og-image.png', c.toBuffer('image/png'));
console.log('public/og-image.png');
