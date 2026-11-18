// The gallery thumbnail from our replay: the inverted start, the most asymmetric frame as the
// midpoint crosses the clamps' line, and the last frame, drawn at true scale.
//   node research/mechanics/vella-2024/thumbnail.mjs
import fs from 'node:fs';
import path from 'node:path';
const here = import.meta.dirname;
const replay = JSON.parse(fs.readFileSync(path.join(here, 'reference-results/replay.json')));
const frames = replay.frames;
const n = replay.settings.n;
const asym = f => Math.max(...f.z.map((z, i) => Math.abs(z - f.z[n - i])));
const jump = frames.filter(f => f.t >= replay.outcome.tSnap - 0.3 && f.t <= replay.outcome.tSnap + 0.05);
const chosen = [frames[0], jump.reduce((a, b) => (asym(b) > asym(a) ? b : a)), frames[frames.length - 1]];
const colours = ['#7fa7d9', '#f2a541', '#e8ecef'];
const W = 320, H = 200, scale = 280, x0 = 20, y0 = 112;
const line = (f, c) => `<polyline fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${f.x.map((x, i) => `${(x0 + scale * x).toFixed(1)},${(y0 - scale * f.z[i]).toFixed(1)}`).join(' ')}"/>`;
const clamps = [0, n].map(i => { const f = frames[0]; const x = x0 + scale * f.x[i]; return `<rect x="${(x - 5).toFixed(1)}" y="${y0 - 3}" width="10" height="16" fill="#5b6770"/>`; }).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0d1b2a"/>${clamps}${chosen.map((f, k) => line(f, colours[k])).join('')}</svg>\n`;
fs.writeFileSync(path.resolve(here, '../../../web/public/research-thumbs/vella-2024.svg'), svg);
console.log('written', chosen.map(f => f.t.toFixed(2)).join(' '));
