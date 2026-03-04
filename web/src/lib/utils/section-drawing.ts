// Cross-section SVG path generator for section visualization.
// Extracted from SectionStressPanel to be reusable in SectionShapeBuilder preview.
// All dimensions in meters; output SVG path fits within ~160px (viewBox -90..90).

import type { SectionShape } from '../data/steel-profiles';

export interface SectionDrawingParams {
  shape: SectionShape;
  h: number;   // m - total height
  b: number;   // m - total width (flange width for I/H/T)
  tw: number;  // m - web thickness
  tf: number;  // m - flange thickness
  t: number;   // m - wall thickness (for hollow sections) / lip length (C-channel)
  tl?: number; // m - lip thickness (C-channel only)
}

/**
 * Generate SVG path string for a cross-section outline.
 * Designed for viewBox="-90 -90 180 180".
 * Origin at centroid, scale fits within ±80 units.
 */
export function crossSectionPath(p: SectionDrawingParams): string {
  const sc = 80 / Math.max(p.h, p.b);

  switch (p.shape) {
    case 'I':
    case 'H': {
      const bf = (p.b / 2) * sc;
      const tw2 = (p.tw / 2) * sc;
      const hh = (p.h / 2) * sc;
      const tf = p.tf * sc;
      return `M ${-bf},${-hh} L ${bf},${-hh} L ${bf},${-hh + tf} L ${tw2},${-hh + tf} L ${tw2},${hh - tf} L ${bf},${hh - tf} L ${bf},${hh} L ${-bf},${hh} L ${-bf},${hh - tf} L ${-tw2},${hh - tf} L ${-tw2},${-hh + tf} L ${-bf},${-hh + tf} Z`;
    }

    case 'U': {
      const bf = (p.b / 2) * sc;
      const hh = (p.h / 2) * sc;
      const tf = p.tf * sc;
      // Compute proper inner width: web is on the left, flanges extend to the right
      // Inner width = b - tw (the open channel part)
      const tw = p.tw * sc;
      const innerW = (p.b - p.tw) * sc;
      // Draw symmetric U centered: left side is the web (closed), right side is open
      // Outer: full rectangle. Inner: rectangle cut from the right side.
      // Points: start top-left (web side), go clockwise
      return [
        `M ${-bf},${-hh}`,             // top-left
        `L ${bf},${-hh}`,              // top-right
        `L ${bf},${-hh + tf}`,         // step down right (top flange inner)
        `L ${-bf + tw},${-hh + tf}`,   // inner top-right (web inner edge)
        `L ${-bf + tw},${hh - tf}`,    // inner bottom-right
        `L ${bf},${hh - tf}`,          // step out right (bottom flange inner)
        `L ${bf},${hh}`,               // bottom-right
        `L ${-bf},${hh}`,              // bottom-left
        'Z',
      ].join(' ');
    }

    case 'RHS': {
      const bw = (p.b / 2) * sc;
      const hh = (p.h / 2) * sc;
      const ts = p.t * sc;
      return `M ${-bw},${-hh} L ${bw},${-hh} L ${bw},${hh} L ${-bw},${hh} Z M ${-bw + ts},${-hh + ts} L ${bw - ts},${-hh + ts} L ${bw - ts},${hh - ts} L ${-bw + ts},${hh - ts} Z`;
    }

    case 'CHS': {
      const ro = (p.h / 2) * sc;
      // Handle solid circle (no wall thickness or t >= radius)
      const hasWall = p.t > 0 && p.t < p.h / 2;
      if (!hasWall) {
        // Solid circle — single outer arc
        return `M 0,${-ro} A ${ro},${ro} 0 1 1 0,${ro} A ${ro},${ro} 0 1 1 0,${-ro} Z`;
      }
      const ri = (p.h / 2 - p.t) * sc;
      return `M 0,${-ro} A ${ro},${ro} 0 1 1 0,${ro} A ${ro},${ro} 0 1 1 0,${-ro} Z M 0,${-ri} A ${ri},${ri} 0 1 0 0,${ri} A ${ri},${ri} 0 1 0 0,${-ri} Z`;
    }

    case 'L': {
      const bw = (p.b / 2) * sc;
      const hh = (p.h / 2) * sc;
      const ts = p.t * sc;
      return `M ${-bw},${-hh} L ${-bw + ts},${-hh} L ${-bw + ts},${hh - ts} L ${bw},${hh - ts} L ${bw},${hh} L ${-bw},${hh} Z`;
    }

    case 'T': {
      // T-beam: web below, flange on top, centroid at origin
      const hf = p.tf;             // flange thickness
      const hw = p.h - hf;         // web height
      const bw = p.tw;             // web width
      const bf = p.b;              // flange width
      const A = bw * hw + bf * hf;
      // Centroid from bottom of web
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;

      // In SVG: y increases downward, structural y increases upward
      // structural y=0 at centroid → SVG y=0 at centroid
      // structural top (positive) → SVG negative
      const yBot = -yBar;              // bottom of web in centroid coords
      const yJunc = hw - yBar;         // junction (top of web / bottom of flange)
      const yTop = p.h - yBar;         // top of flange

      const bw2 = (bw / 2) * sc;
      const bf2 = (bf / 2) * sc;

      return [
        `M ${-bw2},${-yBot * sc}`,       // bottom-left of web
        `L ${bw2},${-yBot * sc}`,         // bottom-right of web
        `L ${bw2},${-yJunc * sc}`,        // top-right of web
        `L ${bf2},${-yJunc * sc}`,        // right edge of flange
        `L ${bf2},${-yTop * sc}`,         // top-right of flange
        `L ${-bf2},${-yTop * sc}`,        // top-left of flange
        `L ${-bf2},${-yJunc * sc}`,       // left edge of flange
        `L ${-bw2},${-yJunc * sc}`,       // top-left of web
        'Z',
      ].join(' ');
    }

    case 'invL': {
      // Inverted L: web below, flange extends to one side on top
      const hf = p.tf;
      const hw = p.h - hf;
      const bw = p.tw;
      const bf = p.b;
      const A = bw * hw + bf * hf;
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;

      const yBot = -yBar;
      const yJunc = hw - yBar;
      const yTop = p.h - yBar;

      // Horizontal centering: center on the bounding box
      const halfW = bf / 2;
      const webLeft = -halfW;
      const webRight = webLeft + bw;
      const flangeRight = halfW;  // = webLeft + bf

      return [
        `M ${webLeft * sc},${-yBot * sc}`,     // bottom-left of web
        `L ${webRight * sc},${-yBot * sc}`,     // bottom-right of web
        `L ${webRight * sc},${-yJunc * sc}`,    // top-right of web (junction)
        `L ${flangeRight * sc},${-yJunc * sc}`, // right edge of flange
        `L ${flangeRight * sc},${-yTop * sc}`,  // top-right of flange
        `L ${webLeft * sc},${-yTop * sc}`,      // top-left of flange (= web left)
        'Z',
      ].join(' ');
    }

    case 'C': {
      // C-channel with lips: like U but with inward-pointing lips at flange tips
      const bf = (p.b / 2) * sc;
      const hh = (p.h / 2) * sc;
      const tf = p.tf * sc;
      const tw = p.tw * sc;
      const lip = p.t * sc; // lip length stored in t field
      const lipThk = (p.tl ?? p.tf) * sc; // lip thickness (fallback to tf)
      // Draw clockwise from top-left (web side)
      return [
        `M ${-bf},${-hh}`,                      // top-left
        `L ${bf},${-hh}`,                       // top-right (top flange outer)
        `L ${bf},${-hh + lip}`,                 // lip down (top-right lip)
        `L ${bf - lipThk},${-hh + lip}`,        // lip inner corner
        `L ${bf - lipThk},${-hh + tf}`,         // step to flange inner
        `L ${-bf + tw},${-hh + tf}`,            // inner top-right (web inner)
        `L ${-bf + tw},${hh - tf}`,             // inner bottom-right
        `L ${bf - lipThk},${hh - tf}`,          // bottom flange inner
        `L ${bf - lipThk},${hh - lip}`,         // lip inner corner (bottom)
        `L ${bf},${hh - lip}`,                  // lip outer corner (bottom)
        `L ${bf},${hh}`,                        // bottom-right
        `L ${-bf},${hh}`,                       // bottom-left
        'Z',
      ].join(' ');
    }

    default: {
      // rect / generic — simple rectangle
      const bw = (p.b / 2) * sc;
      const hh = (p.h / 2) * sc;
      return `M ${-bw},${-hh} L ${bw},${-hh} L ${bw},${hh} L ${-bw},${hh} Z`;
    }
  }
}
