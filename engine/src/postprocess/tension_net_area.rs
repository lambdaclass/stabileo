//! The effective net area Ae a member's end connections leave, CIRSOC 301-2018 §D.3 and
//! §B.4.2.2: the section's elements, x̄ (Figura D.3.1), An, U and Ae per end, and the governing
//! end. Element areas use the sharp-cornered outline. The nominal hole of Tabla J.3.3 comes in
//! with each bolted end; every number a clause needs and the end does not state is refused by
//! code, never defaulted.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetAreaSection {
    #[serde(default)]
    pub shape: Option<String>,
    #[serde(default)]
    pub a: Option<f64>,
    #[serde(default)]
    pub h: Option<f64>,
    #[serde(default)]
    pub b: Option<f64>,
    #[serde(default)]
    pub tw: Option<f64>,
    #[serde(default)]
    pub tf: Option<f64>,
    #[serde(default)]
    pub t: Option<f64>,
    #[serde(default)]
    pub drawn: bool,
    #[serde(default)]
    pub arrangement: Option<String>,
    #[serde(default)]
    pub part: Option<Box<NetAreaSection>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Connected {
    All,
    Flanges,
    Web,
    Flange,
    LegH,
    LegB,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WeldLayout {
    Longitudinal,
    Transverse,
    LongitudinalAndTransverse,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stagger {
    #[serde(default)]
    pub s_mm: Option<f64>,
    #[serde(default)]
    pub g_mm: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EndConnection {
    #[serde(rename_all = "camelCase")]
    Bolted {
        connected: Connected,
        #[serde(default)]
        diameter_mm: Option<f64>,
        #[serde(default)]
        hole_mm: Option<f64>,
        #[serde(default)]
        bolts_per_line: Option<f64>,
        #[serde(default)]
        lines: Option<f64>,
        #[serde(default)]
        web_lines: Option<f64>,
        #[serde(default)]
        pitch_mm: Option<f64>,
        #[serde(default)]
        stagger: Option<Stagger>,
    },
    #[serde(rename_all = "camelCase")]
    Welded {
        connected: Connected,
        weld: WeldLayout,
        #[serde(default)]
        length_mm: Option<f64>,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct NetAreaInput {
    pub section: NetAreaSection,
    pub ends: Vec<Option<EndConnection>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum GeometryKind {
    I,
    U,
    T,
    L,
    #[serde(rename = "plate")]
    Plate,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Geometry {
    pub kind: GeometryKind,
    pub h: f64,
    pub b: f64,
    pub tw: f64,
    pub tf: f64,
    pub count: f64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Refusal {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dh: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(rename = "L", skip_serializing_if = "Option::is_none")]
    pub l: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub w: Option<f64>,
}

fn refuse(code: &'static str) -> Refusal {
    Refusal { code, ..Refusal::default() }
}

fn refuse_as(code: &'static str, variant: &'static str) -> Refusal {
    Refusal { code, variant: Some(variant), ..Refusal::default() }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "step", rename_all = "camelCase")]
pub enum Event {
    WeldNoHoles,
    #[serde(rename_all = "camelCase")]
    PlateTable {
        #[serde(rename = "L")]
        l: f64,
        w: f64,
        #[serde(rename = "U")]
        u: f64,
    },
    AeAg {
        #[serde(rename = "Ag")]
        ag: f64,
        #[serde(rename = "U")]
        u: f64,
        #[serde(rename = "Ae")]
        ae: f64,
        clause: &'static str,
    },
    All {
        #[serde(rename = "Ae")]
        ae: f64,
    },
    Transverse {
        #[serde(rename = "Aconn")]
        a_conn: f64,
        #[serde(rename = "Ae")]
        ae: f64,
    },
    #[serde(rename_all = "camelCase")]
    XBarWeld {
        x_bar: f64,
        #[serde(rename = "L")]
        l: f64,
    },
    #[serde(rename_all = "camelCase")]
    U {
        x_bar: f64,
        #[serde(rename = "L")]
        l: f64,
        raw: f64,
        #[serde(rename = "U")]
        u: f64,
    },
    UFloor {
        #[serde(rename = "Aconn")]
        a_conn: f64,
        #[serde(rename = "Ag")]
        ag: f64,
        #[serde(rename = "U")]
        u: f64,
    },
    Hole {
        hole: f64,
        dh: f64,
    },
    #[serde(rename_all = "camelCase")]
    Chains {
        straight_holes: f64,
        lines: f64,
        dh: f64,
        t: f64,
        straight: f64,
        zig: f64,
    },
    An {
        #[serde(rename = "Ag")]
        ag: f64,
        deduct: f64,
        #[serde(rename = "An")]
        an: f64,
    },
    OneBolt {
        #[serde(rename = "Aconn")]
        a_conn: f64,
        deduct: f64,
        #[serde(rename = "Ae")]
        ae: f64,
    },
    #[serde(rename_all = "camelCase")]
    XBarBolt {
        x_bar: f64,
        n: f64,
        pitch: f64,
        #[serde(rename = "L")]
        l: f64,
    },
    AeAn {
        #[serde(rename = "An")]
        an: f64,
        #[serde(rename = "U")]
        u: f64,
        #[serde(rename = "Ae")]
        ae: f64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndNetArea {
    #[serde(rename = "Ag")]
    pub ag: f64,
    #[serde(rename = "An")]
    pub an: f64,
    #[serde(rename = "U")]
    pub u: f64,
    #[serde(rename = "Ae")]
    pub ae: f64,
    pub clause: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_bar: Option<f64>,
    #[serde(rename = "L", skip_serializing_if = "Option::is_none")]
    pub l: Option<f64>,
    pub events: Vec<Event>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum MemberNetArea {
    Missing { missing: Vec<usize> },
    Refused { refused: Refusal, at: usize },
    #[serde(rename_all = "camelCase")]
    Resolved { per_end: Vec<EndNetArea>, governing: usize },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum GeometryAnswer {
    Kind { kind: GeometryKind, options: &'static [Connected] },
    Refused { refused: Refusal },
}

/// Err on any non-finite number.
pub fn geometry_answer(s: &NetAreaSection) -> Result<GeometryAnswer, String> {
    if let Some((k, v)) = non_finite(s) {
        return Err(format!("tension geometry: {k} = {v} is not finite"));
    }
    Ok(match tension_geometry(s) {
        Ok(g) => GeometryAnswer::Kind { kind: g.kind, options: connected_options(g.kind) },
        Err(refused) => GeometryAnswer::Refused { refused },
    })
}

fn pos(v: Option<f64>) -> Option<f64> {
    v.filter(|x| x.is_finite() && *x > 0.0)
}

fn whole(v: Option<f64>, min: f64) -> Option<f64> {
    v.filter(|x| x.is_finite() && x.fract() == 0.0 && *x >= min)
}

pub fn tension_geometry(s: &NetAreaSection) -> Result<Geometry, Refusal> {
    if s.drawn {
        return Err(refuse("drawn"));
    }
    if let Some(arr) = s.arrangement.as_deref().filter(|a| *a != "single") {
        if arr != "doubleBack" {
            return Err(refuse_as("builtUp", "arrangement"));
        }
        let Some(part) = &s.part else {
            return Err(refuse("builtUpPart"));
        };
        let g = single(part)?;
        if g.kind != GeometryKind::L && g.kind != GeometryKind::U {
            return Err(refuse_as("builtUp", "pair"));
        }
        return Ok(Geometry { count: 2.0, ..g });
    }
    single(s)
}

fn single(s: &NetAreaSection) -> Result<Geometry, Refusal> {
    match s.shape.as_deref() {
        None | Some("generic") => Err(refuse("noShape")),
        Some("RHS" | "CHS") => Err(refuse("tube")),
        Some("C" | "Z") => Err(refuse("coldFormed")),
        Some(shape @ ("I" | "H" | "U" | "T")) => {
            let (Some(h), Some(b), Some(tw), Some(tf)) = (pos(s.h), pos(s.b), pos(s.tw), pos(s.tf)) else {
                return Err(refuse_as("dimensions", "plates"));
            };
            let kind = match shape {
                "U" => GeometryKind::U,
                "T" => GeometryKind::T,
                _ => GeometryKind::I,
            };
            if (if kind == GeometryKind::T { tf } else { 2.0 * tf }) >= h {
                return Err(refuse_as("dimensions", "flange"));
            }
            Ok(Geometry { kind, h, b, tw, tf, count: 1.0 })
        }
        Some("L") => {
            let t = pos(s.t).or_else(|| pos(s.tw).filter(|tw| Some(*tw) == s.tf));
            let (Some(h), Some(b), Some(t)) = (pos(s.h), pos(s.b), t) else {
                return Err(refuse_as("dimensions", "angle"));
            };
            if t >= h || t >= b {
                return Err(refuse_as("dimensions", "angleThickness"));
            }
            Ok(Geometry { kind: GeometryKind::L, h, b, tw: t, tf: t, count: 1.0 })
        }
        Some("rect") => {
            let (Some(h), Some(b)) = (pos(s.h), pos(s.b)) else {
                return Err(refuse_as("dimensions", "plate"));
            };
            let w = b.max(h);
            let t = b.min(h);
            Ok(Geometry { kind: GeometryKind::Plate, h: w, b: w, tw: t, tf: t, count: 1.0 })
        }
        Some(_) => Err(refuse("shape")),
    }
}

pub fn connected_options(kind: GeometryKind) -> &'static [Connected] {
    match kind {
        GeometryKind::I | GeometryKind::U => &[Connected::Flanges, Connected::Web, Connected::All],
        GeometryKind::T => &[Connected::Flange, Connected::Web, Connected::All],
        GeometryKind::L => &[Connected::LegH, Connected::LegB, Connected::All],
        GeometryKind::Plate => &[Connected::All],
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Elem {
    area: f64,
    t: f64,
    width: f64,
}

struct Parts {
    conn: Vec<Elem>,
    x_bar: Option<f64>,
}

fn connected_parts(g: &Geometry, c: Connected) -> Option<Parts> {
    if !connected_options(g.kind).contains(&c) {
        return None;
    }
    let Geometry { h, b, tw, tf, .. } = *g;
    match g.kind {
        GeometryKind::Plate => Some(Parts { conn: vec![Elem { area: h * tw, t: tw, width: h }], x_bar: None }),
        GeometryKind::L => {
            let t = tw;
            if c == Connected::All {
                let leg_h = Elem { area: h * t, t, width: h };
                let leg_b_out = Elem { area: (b - t) * t, t, width: b };
                return Some(Parts { conn: vec![leg_h, leg_b_out], x_bar: None });
            }
            let (a, o) = if c == Connected::LegH { (h, b) } else { (b, h) };
            let area = t * (a + o - t);
            let x_bar = (t * (a * t + o * o - t * t)) / (2.0 * area);
            Some(Parts { conn: vec![Elem { area: a * t, t, width: a }], x_bar: Some(x_bar) })
        }
        GeometryKind::T => {
            let flange = Elem { area: b * tf, t: tf, width: b };
            let stem = Elem { area: (h - tf) * tw, t: tw, width: h - tf };
            match c {
                Connected::All => Some(Parts { conn: vec![flange, stem], x_bar: None }),
                Connected::Flange => {
                    let x_bar = (b * tf * (tf / 2.0) + (h - tf) * tw * (tf + (h - tf) / 2.0)) / (b * tf + (h - tf) * tw);
                    Some(Parts { conn: vec![flange], x_bar: Some(x_bar) })
                }
                _ => {
                    let half = (b / 2.0) * tf + (h - tf) * (tw / 2.0);
                    let x_bar = ((b / 2.0) * tf * (b / 4.0) + (h - tf) * (tw / 2.0) * (tw / 4.0)) / half;
                    Some(Parts { conn: vec![stem], x_bar: Some(x_bar) })
                }
            }
        }
        GeometryKind::I | GeometryKind::U => {
            let flange = Elem { area: b * tf, t: tf, width: b };
            let web = Elem { area: (h - 2.0 * tf) * tw, t: tw, width: h - 2.0 * tf };
            match c {
                Connected::All => Some(Parts { conn: vec![flange, flange, web], x_bar: None }),
                Connected::Flanges => {
                    let stem_h = h / 2.0 - tf;
                    let x_bar = (b * tf * (tf / 2.0) + stem_h * tw * (tf + stem_h / 2.0)) / (b * tf + stem_h * tw);
                    Some(Parts { conn: vec![flange, flange], x_bar: Some(x_bar) })
                }
                _ if g.kind == GeometryKind::U => {
                    let area = 2.0 * b * tf + (h - 2.0 * tf) * tw;
                    let x_bar = (2.0 * b * tf * (b / 2.0) + (h - 2.0 * tf) * tw * (tw / 2.0)) / area;
                    Some(Parts { conn: vec![web], x_bar: Some(x_bar) })
                }
                _ => {
                    let half = b * tf + (h - 2.0 * tf) * (tw / 2.0);
                    let x_bar = (2.0 * (b / 2.0) * tf * (b / 4.0) + (h - 2.0 * tf) * (tw / 2.0) * (tw / 4.0)) / half;
                    Some(Parts { conn: vec![web], x_bar: Some(x_bar) })
                }
            }
        }
    }
}

fn u_from_x_bar(x_bar: f64, l: f64, a_conn: f64, ag: f64, events: &mut Vec<Event>) -> f64 {
    let raw = 1.0 - x_bar / l;
    let mut u = 0.9_f64.min(raw);
    events.push(Event::U { x_bar, l, raw, u });
    let lower = 1.0_f64.min(a_conn / ag);
    if lower > u {
        u = lower;
        events.push(Event::UFloor { a_conn, ag, u: lower });
    }
    u
}

pub fn end_net_area(section: &NetAreaSection, end: &EndConnection) -> Result<EndNetArea, Refusal> {
    let g = tension_geometry(section)?;
    let Some(ag) = pos(section.a) else {
        return Err(refuse("area"));
    };
    let connected = match end {
        EndConnection::Bolted { connected, .. } | EndConnection::Welded { connected, .. } => *connected,
    };
    let Some(parts) = connected_parts(&g, connected) else {
        return Err(refuse("connectedForShape"));
    };
    let n = g.count;
    let a_conn = n * parts.conn.iter().fold(0.0, |s, e| s + e.area);
    let is_all = connected == Connected::All;
    let plate = g.kind == GeometryKind::Plate;
    let mut events = Vec::new();

    match end {
        EndConnection::Welded { weld, length_mm, .. } => {
            events.push(Event::WeldNoHoles);
            let length = pos(*length_mm).map(|v| v / 1000.0);
            if plate && *weld == WeldLayout::Longitudinal {
                let Some(l) = length else {
                    return Err(refuse_as("weldLength", "D.3.5"));
                };
                let w = g.h;
                let at_least = |k: f64| l >= k * w * (1.0 - 1e-9);
                if !at_least(1.0) {
                    return Err(Refusal { l: Some(l), w: Some(w), ..refuse("plateWeldShort") });
                }
                let u = if at_least(2.0) { 1.0 } else if at_least(1.5) { 0.87 } else { 0.75 };
                events.push(Event::PlateTable { l, w, u });
                events.push(Event::AeAg { ag, u, ae: ag * u, clause: "D.3.5" });
                return Ok(EndNetArea { ag, an: ag, u, ae: ag * u, clause: "D.3.5", x_bar: None, l: Some(l), events });
            }
            if is_all || plate {
                events.push(Event::All { ae: ag });
                return Ok(EndNetArea { ag, an: ag, u: 1.0, ae: ag, clause: "D.3(1)", x_bar: None, l: None, events });
            }
            if *weld == WeldLayout::Transverse {
                let ae = ag.min(a_conn);
                events.push(Event::Transverse { a_conn, ae });
                return Ok(EndNetArea { ag, an: ag, u: 1.0, ae, clause: "D.3.4", x_bar: None, l: None, events });
            }
            let Some(l) = length else {
                return Err(refuse_as("weldLength", "D.3.2"));
            };
            let Some(x_bar) = parts.x_bar else {
                return Err(refuse("connectedForShape"));
            };
            events.push(Event::XBarWeld { x_bar, l });
            let u = u_from_x_bar(x_bar, l, a_conn, ag, &mut events);
            events.push(Event::AeAg { ag, u, ae: ag * u, clause: "D.3.3" });
            Ok(EndNetArea { ag, an: ag, u, ae: ag * u, clause: "D.3.3", x_bar: Some(x_bar), l: Some(l), events })
        }
        EndConnection::Bolted { diameter_mm, hole_mm, bolts_per_line, lines, web_lines, pitch_mm, stagger, .. } => {
            if pos(*diameter_mm).is_none() {
                return Err(refuse("diameter"));
            }
            let Some(hole) = pos(*hole_mm) else {
                return Err(refuse("holeNotTabulated"));
            };
            let Some(nb) = whole(*bolts_per_line, 1.0) else {
                return Err(refuse("boltsPerLine"));
            };
            let Some(nl) = whole(*lines, 1.0) else {
                return Err(refuse("lines"));
            };
            let secondary = is_all && !plate;
            let web_holes = match (secondary, whole(*web_lines, 0.0)) {
                (false, _) => None,
                (true, Some(v)) => Some(v).filter(|v| *v > 0.0),
                (true, None) => return Err(refuse("webLines")),
            };
            let pitch = pos(*pitch_mm);
            if nb >= 2.0 && pitch.is_none() {
                return Err(refuse("pitch"));
            }
            let dh = (hole + 2.0) / 1000.0;
            events.push(Event::Hole { hole, dh });

            let last = parts.conn.len() - 1;
            let line_elems: &[Elem] = if !secondary {
                &parts.conn
            } else if g.kind == GeometryKind::L {
                &parts.conn[..1]
            } else {
                &parts.conn[..last]
            };
            let web_elem = secondary.then(|| parts.conn[last]);

            let stagger = match stagger {
                None => None,
                Some(st) => {
                    if web_holes.is_some() {
                        return Err(refuse("staggerWithWebLines"));
                    }
                    let (Some(s), Some(gg)) = (pos(st.s_mm), pos(st.g_mm)) else {
                        return Err(refuse_as("stagger", "sg"));
                    };
                    if nl < 2.0 {
                        return Err(refuse_as("stagger", "oneLine"));
                    }
                    Some((s / 1000.0, gg / 1000.0))
                }
            };

            let mut deduct = 0.0;
            for e in line_elems {
                if nl * dh >= e.width {
                    return Err(Refusal { n: Some(nl), dh: Some(dh), width: Some(e.width), ..refuse("holesDoNotFit") });
                }
                let straight_holes = if stagger.is_some() { (nl / 2.0).ceil() } else { nl };
                let straight = straight_holes * dh * e.t;
                let mut worst = straight;
                if let Some((s, gg)) = stagger {
                    let zig = nl * dh * e.t - (nl - 1.0) * (s * s * e.t) / (4.0 * gg);
                    events.push(Event::Chains { straight_holes, lines: nl, dh, t: e.t, straight, zig });
                    worst = straight.max(zig);
                }
                deduct += worst;
            }
            if let (Some(web), Some(nw)) = (web_elem, web_holes) {
                if nw * dh >= web.width {
                    return Err(Refusal { n: Some(nw), dh: Some(dh), width: Some(web.width), ..refuse("holesDoNotFit") });
                }
                deduct += nw * dh * web.t;
            }
            deduct *= n;
            let an = ag - deduct;
            events.push(Event::An { ag, deduct, an });
            if !(an > 0.0) {
                return Err(refuse_as("netArea", "an"));
            }

            if is_all || plate {
                events.push(Event::All { ae: an });
                return Ok(EndNetArea { ag, an, u: 1.0, ae: an, clause: "D.3(1)", x_bar: None, l: None, events });
            }
            if nb == 1.0 {
                let ae = an.min(a_conn - deduct);
                if !(ae > 0.0) {
                    return Err(refuse_as("netArea", "connected"));
                }
                events.push(Event::OneBolt { a_conn, deduct, ae });
                return Ok(EndNetArea { ag, an, u: ae / an, ae, clause: "D.3(2)(a)", x_bar: None, l: None, events });
            }
            let Some(pitch) = pitch else {
                return Err(refuse("pitch"));
            };
            let l = (nb - 1.0) * pitch / 1000.0;
            let Some(x_bar) = parts.x_bar else {
                return Err(refuse("connectedForShape"));
            };
            events.push(Event::XBarBolt { x_bar, n: nb, pitch, l });
            let u = u_from_x_bar(x_bar, l, a_conn, ag, &mut events);
            events.push(Event::AeAn { an, u, ae: an * u });
            Ok(EndNetArea { ag, an, u, ae: an * u, clause: "D.3.1", x_bar: Some(x_bar), l: Some(l), events })
        }
    }
}

fn non_finite(section: &NetAreaSection) -> Option<(&'static str, f64)> {
    let own = [("a", section.a), ("h", section.h), ("b", section.b), ("tw", section.tw), ("tf", section.tf), ("t", section.t)];
    own.iter()
        .find_map(|&(k, v)| v.filter(|x| !x.is_finite()).map(|x| (k, x)))
        .or_else(|| section.part.as_deref().and_then(non_finite))
}

fn end_non_finite(end: &EndConnection) -> Option<(&'static str, f64)> {
    let fields: Vec<(&'static str, Option<f64>)> = match end {
        EndConnection::Bolted { diameter_mm, hole_mm, bolts_per_line, lines, web_lines, pitch_mm, stagger, .. } => vec![
            ("diameterMm", *diameter_mm), ("holeMm", *hole_mm), ("boltsPerLine", *bolts_per_line), ("lines", *lines),
            ("webLines", *web_lines), ("pitchMm", *pitch_mm),
            ("sMm", stagger.as_ref().and_then(|s| s.s_mm)), ("gMm", stagger.as_ref().and_then(|s| s.g_mm)),
        ],
        EndConnection::Welded { length_mm, .. } => vec![("lengthMm", *length_mm)],
    };
    fields.into_iter().find_map(|(k, v)| v.filter(|x| !x.is_finite()).map(|x| (k, x)))
}

/// Err on any non-finite number. The first end whose Ae is strictly smallest governs.
pub fn member_net_area(input: &NetAreaInput) -> Result<MemberNetArea, String> {
    let bad = non_finite(&input.section).or_else(|| input.ends.iter().flatten().find_map(end_non_finite));
    if let Some((k, v)) = bad {
        return Err(format!("net area: {k} = {v} is not finite"));
    }
    let missing: Vec<usize> = input.ends.iter().enumerate().filter(|(_, e)| e.is_none()).map(|(i, _)| i).collect();
    if !missing.is_empty() || input.ends.is_empty() {
        return Ok(MemberNetArea::Missing { missing });
    }
    let mut per_end = Vec::with_capacity(input.ends.len());
    for (at, end) in input.ends.iter().flatten().enumerate() {
        match end_net_area(&input.section, end) {
            Ok(r) => per_end.push(r),
            Err(refused) => return Ok(MemberNetArea::Refused { refused, at }),
        }
    }
    let governing = (1..per_end.len()).fold(0, |m, i| if per_end[i].ae < per_end[m].ae { i } else { m });
    Ok(MemberNetArea::Resolved { per_end, governing })
}
