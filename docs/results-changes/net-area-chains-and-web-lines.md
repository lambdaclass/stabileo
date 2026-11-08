# Ae takes every staggered chain, and a bolted all-elements end needs web bolts (2026-11-08)

PR **#1771**. Results-change entry `net-area-chains-and-web-lines`. Found by review of the
TypeScript-to-Rust move of Ae (slice 2). Both defects were in the TypeScript the engine
replaced, so the parity sweep reproduced them bit for bit.

CIRSOC 301-2018 §B.4.2.2 takes the net area along the chain of holes that leaves the least, each
hole at its nominal dimension plus 2 mm, and each diagonal of a chain credits s²·t/(4g).

- **Partial staggered chains.** The check compared the straight chain (every other line) with
  the zig-zag through every line. A chain through some of the lines can deduct more. A 300 × 12 mm
  plate, four alternating lines of M20 (hole 22 + 2 = 24 mm), s = g = 70 mm: straight
  2·24·12 = 576 mm², all four 4·24·12 − 3·70²·12/(4·70) = 522 mm², lines 1, 3 and 4
  3·24·12 − 70²·12/(4·70) = 654 mm². Ae was 3 024 mm² instead of 2 946 mm² (2.6 % high).
- **The shorter diagonal.** Alternate lines staggered s at a pitch p also have the diagonal
  p − s to the line's next bolt. At s = 60 mm, p = 80 mm and g = 50 mm two lines deduct
  2·24·12 − 20²·12/(4·50) = 552 mm², not 576 − 60²·12/200 = 360 mm². A stagger s not shorter than
  the pitch puts holes of adjacent lines in line or nearer than s; it is refused
  (`staggerPitch`) with s to be given as the shift between adjacent lines.
- **An all-elements bolted end with no web lines.** `connected: 'all'` with zero lines in the web
  (or in the second leg of an angle) got Ae = An and U = 1 under D.3(1), but only the flanges
  (or one leg) carry bolts, so D.3(2)(a) with U = 1 − x̄/L applies.

The engine (`engine/src/postprocess/tension_net_area.rs`) now takes the worst chain over every
subset of the lines across the width, a step over an odd number of lines being a diagonal of
gauge (k − i)·g with s = min(s, p − s), and refuses an all-elements bolted end whose web lines
are fewer than one (`webLines`). Ae can only go down or be refused. A brute-force enumeration of
every chain checks the search on 400 random plates (`engine/tests/metamorphic/tension_net_area.rs`).

**What to re-check:** CIRSOC 301 tension members with a staggered bolted end, and bolted ends
described as connecting every element with no web lines; describe those through the flanges or
the leg.
