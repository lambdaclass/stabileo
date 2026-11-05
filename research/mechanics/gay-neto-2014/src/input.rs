//! Reader for the subset of the reference code's input format used by tutorials 1 and 16.

use std::collections::BTreeMap;

#[derive(Clone, Debug, Default)]
pub struct BoolTable(pub Vec<bool>);

impl BoolTable {
    pub fn on(&self, step: usize) -> bool {
        self.0.get(step).or(self.0.last()).copied().unwrap_or(true)
    }

    /// Load multiplier at `t` inside solution step `step` that runs over `[t0, t1]`:
    /// ramps up through a step that switches the effect on.
    pub fn factor(&self, step: usize, t: f64, t0: f64, t1: f64) -> f64 {
        let now = self.on(step);
        let before = step > 0 && self.on(step - 1);
        let r = ((t - t0) / (t1 - t0)).clamp(0.0, 1.0);
        match (before, now) {
            (true, true) => 1.0,
            (false, true) => r,
            (true, false) => 1.0 - r,
            (false, false) => 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ElementInput {
    pub kind: String,
    pub section: usize,
    pub material: usize,
    pub cs: usize,
    pub nodes: [usize; 3],
}

#[derive(Clone, Debug)]
pub struct PipeSectionInput {
    pub ea: f64,
    pub ei: f64,
    pub gj: f64,
    pub ga: f64,
    pub rho: f64,
    pub de: f64,
    pub di: f64,
}

#[derive(Clone, Debug)]
pub struct StepInput {
    pub end_time: f64,
    pub time_step: f64,
    pub max_time_step: f64,
    pub min_time_step: f64,
    pub max_it: usize,
    pub conv_increase: usize,
    pub inc_factor: f64,
}

#[derive(Clone, Debug)]
pub struct TimeTable {
    pub node_set: usize,
    pub cs: usize,
    pub rows: Vec<[f64; 7]>,
}

impl TimeTable {
    pub fn at(&self, t: f64) -> [f64; 6] {
        let rows = &self.rows;
        let pick = |r: &[f64; 7]| [r[1], r[2], r[3], r[4], r[5], r[6]];
        if t <= rows[0][0] {
            return pick(&rows[0]);
        }
        for w in rows.windows(2) {
            if t <= w[1][0] {
                let s = (t - w[0][0]) / (w[1][0] - w[0][0]);
                let (a, b) = (pick(&w[0]), pick(&w[1]));
                return std::array::from_fn(|k| a[k] + s * (b[k] - a[k]));
            }
        }
        pick(rows.last().unwrap())
    }
}

#[derive(Clone, Debug)]
pub struct ContactInput {
    pub node_set: usize,
    pub surface_set: usize,
    pub mu: f64,
    pub epn: f64,
    pub ept: f64,
    pub radius: f64,
    pub table: BoolTable,
}

#[derive(Clone, Debug, Default)]
pub struct Input {
    pub nodes: BTreeMap<usize, [f64; 3]>,
    pub node_sets: BTreeMap<usize, Vec<usize>>,
    pub elements: Vec<ElementInput>,
    pub hooke: BTreeMap<usize, (f64, f64, f64)>,
    pub rectangles: BTreeMap<usize, (f64, f64)>,
    pub pipe_sections: BTreeMap<usize, PipeSectionInput>,
    pub cs: BTreeMap<usize, ([f64; 3], [f64; 3])>,
    pub steps: Vec<StepInput>,
    pub points: BTreeMap<usize, [f64; 3]>,
    pub triangles: BTreeMap<usize, [usize; 3]>,
    pub surface_sets: BTreeMap<usize, Vec<usize>>,
    pub contacts: Vec<ContactInput>,
    pub constraints: Vec<(usize, [Option<BoolTable>; 6])>,
    pub displacements: Vec<TimeTable>,
    pub loads: Vec<TimeTable>,
    pub gravity: Option<([f64; 3], BoolTable)>,
    pub ocean: Option<(f64, [f64; 3])>,
}

struct Tokens {
    t: Vec<String>,
    i: usize,
}

impl Tokens {
    fn next(&mut self) -> Result<String, String> {
        let s = self.t.get(self.i).cloned().ok_or("unexpected end of input")?;
        self.i += 1;
        Ok(s)
    }
    fn peek(&self) -> Option<&str> {
        self.t.get(self.i).map(String::as_str)
    }
    fn num(&mut self) -> Result<f64, String> {
        let s = self.next()?;
        s.parse().map_err(|_| format!("expected a number, found {s:?}"))
    }
    fn int(&mut self) -> Result<usize, String> {
        let s = self.next()?;
        s.parse().map_err(|_| format!("expected an integer, found {s:?}"))
    }
    fn expect(&mut self, word: &str) -> Result<(), String> {
        let s = self.next()?;
        if s == word {
            Ok(())
        } else {
            Err(format!("expected {word:?}, found {s:?}"))
        }
    }
    fn keyed(&mut self, word: &str) -> Result<f64, String> {
        self.expect(word)?;
        self.num()
    }
    fn vec3(&mut self) -> Result<[f64; 3], String> {
        Ok([self.num()?, self.num()?, self.num()?])
    }
    fn bools(&mut self) -> BoolTable {
        let mut v = vec![];
        while let Some(s) = self.peek() {
            match s {
                "0" => v.push(false),
                "1" => v.push(true),
                _ => break,
            }
            self.i += 1;
        }
        BoolTable(v)
    }
}

const DOF_NAMES: [&str; 6] = ["UX", "UY", "UZ", "ROTX", "ROTY", "ROTZ"];

pub fn parse(text: &str) -> Result<Input, String> {
    let t = text
        .lines()
        .map(|l| l.split("//").next().unwrap_or(""))
        .flat_map(|l| l.split_whitespace().map(str::to_owned).collect::<Vec<_>>())
        .collect();
    let mut tk = Tokens { t, i: 0 };
    let mut inp = Input::default();
    while let Some(word) = tk.peek().map(str::to_owned) {
        tk.i += 1;
        match word.as_str() {
            "Nodes" => {
                for _ in 0..tk.int()? {
                    tk.expect("Node")?;
                    let id = tk.int()?;
                    inp.nodes.insert(id, tk.vec3()?);
                }
            }
            "NodeSets" => {
                for _ in 0..tk.int()? {
                    tk.expect("NodeSet")?;
                    let id = tk.int()?;
                    tk.expect("Nodes")?;
                    let count = tk.int()?;
                    let list = match tk.next()?.as_str() {
                        "List" => (0..count).map(|_| tk.int()).collect::<Result<Vec<_>, _>>()?,
                        "Sequence" => {
                            let first = tk.keyed("Initial")? as usize;
                            let step = tk.keyed("Increment")? as usize;
                            (0..count).map(|k| first + k * step).collect()
                        }
                        other => return Err(format!("unsupported node set syntax {other:?}")),
                    };
                    inp.node_sets.insert(id, list);
                }
            }
            "Elements" => {
                for _ in 0..tk.int()? {
                    let kind = tk.next()?;
                    tk.int()?;
                    let (material, section) = match kind.as_str() {
                        "Beam_1" => (tk.keyed("Mat")? as usize, tk.keyed("Sec")? as usize),
                        "Pipe_1" => (0, tk.keyed("PipeSec")? as usize),
                        other => return Err(format!("unsupported element {other:?}")),
                    };
                    let cs = tk.keyed("CS")? as usize;
                    tk.expect("Nodes")?;
                    let nodes = [tk.int()?, tk.int()?, tk.int()?];
                    inp.elements.push(ElementInput { kind, section, material, cs, nodes });
                }
            }
            "Materials" => {
                for _ in 0..tk.int()? {
                    tk.expect("Hooke")?;
                    let id = tk.int()?;
                    inp.hooke.insert(id, (tk.keyed("E")?, tk.keyed("Nu")?, tk.keyed("Rho")?));
                }
            }
            "Sections" => {
                for _ in 0..tk.int()? {
                    tk.expect("Rectangle")?;
                    let id = tk.int()?;
                    inp.rectangles.insert(id, (tk.keyed("B")?, tk.keyed("H")?));
                }
            }
            "PipeSections" => {
                for _ in 0..tk.int()? {
                    tk.expect("PS")?;
                    let id = tk.int()?;
                    let (ea, ei, gj, ga, rho) =
                        (tk.keyed("EA")?, tk.keyed("EI")?, tk.keyed("GJ")?, tk.keyed("GA")?, tk.keyed("Rho")?);
                    for k in ["CDt", "CDn", "CAt", "CAn"] {
                        tk.keyed(k)?;
                    }
                    let (de, di) = (tk.keyed("De")?, tk.keyed("Di")?);
                    inp.pipe_sections.insert(id, PipeSectionInput { ea, ei, gj, ga, rho, de, di });
                }
            }
            "CoordinateSystems" => {
                for _ in 0..tk.int()? {
                    tk.expect("CS")?;
                    let id = tk.int()?;
                    tk.expect("E1")?;
                    let e1 = tk.vec3()?;
                    tk.expect("E3")?;
                    inp.cs.insert(id, (e1, tk.vec3()?));
                }
            }
            "SolutionSteps" => {
                for _ in 0..tk.int()? {
                    tk.expect("Static")?;
                    tk.int()?;
                    let mut s = StepInput {
                        end_time: tk.keyed("EndTime")?,
                        time_step: tk.keyed("TimeStep")?,
                        max_time_step: tk.keyed("MaxTimeStep")?,
                        min_time_step: tk.keyed("MinTimeStep")?,
                        max_it: tk.keyed("MaxIt")? as usize,
                        conv_increase: 0,
                        inc_factor: 1.0,
                    };
                    tk.keyed("MinIt")?;
                    s.conv_increase = tk.keyed("ConvIncrease")? as usize;
                    s.inc_factor = tk.keyed("IncFactor")?;
                    tk.keyed("Sample")?;
                    inp.steps.push(s);
                }
            }
            "Points" => {
                for _ in 0..tk.int()? {
                    tk.expect("Point")?;
                    let id = tk.int()?;
                    inp.points.insert(id, tk.vec3()?);
                }
            }
            "Surfaces" => {
                for _ in 0..tk.int()? {
                    tk.expect("RigidTriangularSurface_1")?;
                    let id = tk.int()?;
                    tk.expect("Points")?;
                    let p = [tk.int()?, tk.int()?, tk.int()?];
                    tk.keyed("PilotNode")?;
                    inp.triangles.insert(id, p);
                }
            }
            "SurfaceSets" => {
                for _ in 0..tk.int()? {
                    tk.expect("SurfaceSet")?;
                    let id = tk.int()?;
                    tk.expect("Surfaces")?;
                    let count = tk.int()?;
                    tk.expect("List")?;
                    let list = (0..count).map(|_| tk.int()).collect::<Result<Vec<_>, _>>()?;
                    inp.surface_sets.insert(id, list);
                }
            }
            "Contacts" => {
                for _ in 0..tk.int()? {
                    tk.expect("NSSS")?;
                    tk.int()?;
                    let node_set = tk.keyed("NodeSet")? as usize;
                    let surface_set = tk.keyed("SurfaceSet")? as usize;
                    let (mu, epn) = (tk.keyed("MU")?, tk.keyed("EPN")?);
                    tk.keyed("CN")?;
                    let ept = tk.keyed("EPT")?;
                    tk.keyed("CT")?;
                    tk.keyed("Pinball")?;
                    let radius = tk.keyed("Radius")?;
                    tk.keyed("MaxPointwiseInt")?;
                    tk.expect("BoolTable")?;
                    let table = tk.bools();
                    inp.contacts.push(ContactInput { node_set, surface_set, mu, epn, ept, radius, table });
                }
            }
            "Constraints" => {
                for _ in 0..tk.int()? {
                    tk.expect("NodalConstraint")?;
                    tk.int()?;
                    let set = tk.keyed("NodeSet")? as usize;
                    let mut dofs: [Option<BoolTable>; 6] = Default::default();
                    while let Some(k) = tk.peek().and_then(|s| DOF_NAMES.iter().position(|d| *d == s)) {
                        tk.i += 1;
                        tk.expect("BoolTable")?;
                        dofs[k] = Some(tk.bools());
                    }
                    inp.constraints.push((set, dofs));
                }
            }
            "Displacements" | "Loads" => {
                let item = if word == "Loads" { "NodalLoad" } else { "NodalDisplacement" };
                for _ in 0..tk.int()? {
                    tk.expect(item)?;
                    tk.int()?;
                    let node_set = tk.keyed("NodeSet")? as usize;
                    let cs = tk.keyed("CS")? as usize;
                    let n = tk.keyed("NTimes")? as usize;
                    let rows = (0..n)
                        .map(|_| -> Result<[f64; 7], String> {
                            let mut r = [0.0; 7];
                            for v in &mut r {
                                *v = tk.num()?;
                            }
                            Ok(r)
                        })
                        .collect::<Result<Vec<_>, _>>()?;
                    let table = TimeTable { node_set, cs, rows };
                    if word == "Loads" {
                        inp.loads.push(table)
                    } else {
                        inp.displacements.push(table)
                    }
                }
            }
            "GravityData" => {
                tk.expect("G")?;
                let g = tk.vec3()?;
                tk.expect("BoolTable")?;
                inp.gravity = Some((g, tk.bools()));
            }
            "OceanData" => {
                let rho = tk.keyed("RhoFluid")?;
                tk.expect("SurfacePosition")?;
                inp.ocean = Some((rho, tk.vec3()?));
            }
            _ => {}
        }
    }
    Ok(inp)
}
