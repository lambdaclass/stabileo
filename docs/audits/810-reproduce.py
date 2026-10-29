#!/usr/bin/env python3
"""Replay #810 without changing engine/src; run from any directory.

Uses the audited baseline builders and research JSON from local Git objects.
The only numerical experiments are in a temporary example; its control is
checked against the production solver before varying shear/drilling stiffness.
"""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)
BASE = "d7ad866d8c75415c8a0d322b91de6ac01ba1c3c3"
CASES = "710b6bad36c2b2d96183d27c6661be9208da945a"
example = ROOT / "engine/examples/triage810.rs"
if example.exists():
    raise SystemExit(f"Refusing to overwrite {example}")

def source(path, revision=BASE):
    return subprocess.check_output(["git", "show", f"{revision}:{path}"], text=True)

s=source('engine/tests/validation/benchmarks/shell_benchmark.rs')
helper=s[s.index('fn sup3d'):s.index('// Preserve global')]
parts=[]
for name,end,target in [('scordelis_lo','// ================================================================','node_grid[0][ntheta]'),('pinched_cylinder','#[test]','load_node')]:
 start=s.index('fn '+name+'_solve(')
 part=s[start:s.index(end,start)]
 part=part[:part.index('    let res = linear::solve_3d')]+f'    (input, {target})\n}}\n'
 part=part.replace('-> f64 {','-> (SolverInput3D, usize) {',1)
 parts.append(part)
d=source('engine/tests/discretization_error.rs')
fam=d[d.index('#[derive(Clone, Copy, PartialEq, Debug)]'):d.index('// ==================== Energy')]
fam+=d[d.index('fn scordelis('):d.index('/// Refine `m`')]
fam+=d[d.index('fn pinched_cylinder('):d.index('/// Hemispherical shell')]
fam=fam.replace('enum Fam','pub enum Fam').replace('struct Model','pub struct Model').replace('    input: SolverInput3D','    pub input: SolverInput3D').replace('    grid: Vec','    pub grid: Vec').replace('fn surface(', 'pub fn surface(').replace('enum Load', 'pub enum Load').replace('fn scordelis(','pub fn scordelis(').replace('fn pinched_cylinder(','pub fn pinched_cylinder(')
generated = ('use dedaliano_engine::{solver::linear, types::*};\nuse std::collections::HashMap;\n'+helper+'\n'.join(parts)+'\nmod family {use super::*; use std::f64::consts::PI;\n'+fam+'}\n'+Path('docs/audits/810-experiments.rs').read_text())
q=source('engine/src/element/quad.rs').rsplit('#[cfg(test)]',1)[0].replace('crate::','dedaliano_engine::')
q=q.replace('pub fn mitc4_local_stiffness(','pub fn audit_stiffness(',1).replace('    t: f64,\n) -> Vec<f64> {','    t: f64,\n    drill: f64, shear: f64,\n) -> Vec<f64> {',1)
q=q.replace('let d_s = kappa * g * t;','let d_s = kappa * g * t * shear;').replace(' / 2.0 * 1e-3;',' / 2.0 * 1e-3 * drill;',1)
generated += ('\n#[allow(dead_code)] mod variant {\n'+q+'}\n')

env = dict(os.environ, CARGO_TARGET_DIR="/private/tmp/claude-501/codex-810-target", CARGO_BUILD_JOBS="2")
with tempfile.TemporaryDirectory(prefix="triage810-", dir="/private/tmp") as directory:
    cases = Path(directory) / "cases.json"
    cases.write_text(source("engine/tests/benchmarks/shell_obstacle_course.json", CASES))
    generated = generated.replace("/private/tmp/810-cases.json", str(cases))
    example.parent.mkdir(exist_ok=True)
    try:
        example.write_text(generated)
        for mode in (sys.argv[1:] or ["models", "isolate", "elements"]):
            if mode not in ("models", "isolate", "elements"):
                raise SystemExit("Modes: models isolate elements")
            subprocess.run(["cargo", "run", "-p", "dedaliano-engine", "--example", "triage810", "--", mode], env=env, check=True)
    finally:
        example.unlink(missing_ok=True)
