use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;

#[test]
fn probe_material() {
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string("tests/metamorphic_corpus/differential/frame3d-2.json").unwrap()).unwrap();
    for (m2, m3) in [(1, 1), (1, 2), (2, 1), (2, 2)] {
        let sections = s.sections.values().map(|x| {
            let (b, h) = ((12.0 * x.iy / x.a).sqrt(), (12.0 * x.iz / x.a).sqrt());
            let mat = match x.id { 2 => m2, 3 => m3, _ => 1 };
            (x.id.to_string(), PlasticSectionData3D { a: x.a, iy: x.iy, iz: x.iz, material_id: mat, b: Some(b), h: Some(h), d: Some(b) })
        }).collect();
        let materials = s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(250.0) })).collect();
        let r = plastic::solve_plastic_3d(&PlasticInput3D { solver: s.clone(), sections, materials, max_hinges: None, mp_overrides: None }).unwrap();
        eprintln!("section materials (2:{m2}, 3:{m3}) -> collapse factor {}", r.collapse_factor);
    }
    for m in s.materials.values() { eprintln!("material {}: E {} nu {}", m.id, m.e, m.nu); }
}

#[test]
fn probe() {
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string("tests/metamorphic_corpus/differential/frame3d-2.json").unwrap()).unwrap();
    let mut seen: Vec<f64> = Vec::new();
    for _ in 0..30 {
        let s = serde_json::from_str::<SolverInput3D>(&serde_json::to_string(&s).unwrap()).unwrap();
        let sections = s.sections.values().map(|x| {
            let (b, h) = ((12.0 * x.iy / x.a).sqrt(), (12.0 * x.iz / x.a).sqrt());
            let mat = s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
            (x.id.to_string(), PlasticSectionData3D { a: x.a, iy: x.iy, iz: x.iz, material_id: mat, b: Some(b), h: Some(h), d: Some(b) })
        }).collect();
        let materials = s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(250.0) })).collect();
        let r = plastic::solve_plastic_3d(&PlasticInput3D { solver: s.clone(), sections, materials, max_hinges: None, mp_overrides: None }).unwrap();
        if !seen.iter().any(|v| (v - r.collapse_factor).abs() < 1e-6 * v.abs()) { seen.push(r.collapse_factor); }
    }
    eprintln!("distinct collapse factors over 30 solves: {seen:?}");
    let mats: Vec<_> = { let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string("tests/metamorphic_corpus/differential/frame3d-2.json").unwrap()).unwrap(); s.elements.values().map(|e| (e.section_id, e.material_id)).collect::<std::collections::BTreeSet<_>>().into_iter().collect() };
    eprintln!("(section, material) pairs: {mats:?}");
}

#[test]
fn probe_relabel() {
    use dedaliano_engine::metamorphic::relabel::Relabel;
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string("tests/metamorphic_corpus/differential/frame3d-2.json").unwrap()).unwrap();
    let solve = |m: &SolverInput3D| {
        let sections = m.sections.values().map(|x| {
            let (b, h) = ((12.0 * x.iy / x.a).sqrt(), (12.0 * x.iz / x.a).sqrt());
            let mat = m.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
            (x.id.to_string(), PlasticSectionData3D { a: x.a, iy: x.iy, iz: x.iz, material_id: mat, b: Some(b), h: Some(h), d: Some(b) })
        }).collect();
        let materials = m.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(250.0) })).collect();
        plastic::solve_plastic_3d(&PlasticInput3D { solver: m.clone(), sections, materials, max_hinges: None, mp_overrides: None }).map(|r| r.collapse_factor)
    };
    for seed in 0..40u64 {
        let rl = Relabel::random_3d(&s, seed);
        let m = rl.apply_3d(&s, seed);
        let mut seen: Vec<f64> = Vec::new();
        for _ in 0..8 {
            let m2: SolverInput3D = serde_json::from_str(&serde_json::to_string(&m).unwrap()).unwrap();
            if let Ok(c) = solve(&m2) { if !seen.iter().any(|v| (v - c).abs() < 1e-6 * v.abs()) { seen.push(c); } }
        }
        if seen.len() > 1 || seen.iter().any(|c| (c - 75.8726045625864).abs() > 1e-4) { eprintln!("seed {seed}: {seen:?}"); }
    }
    eprintln!("relabel probe done");
}

#[test]
fn probe_relabel_2d() {
    use dedaliano_engine::metamorphic::relabel::Relabel;
    for f in ["frame2d-0", "frame2d-1", "frame2d-2", "frame2d-3", "frame2d-4", "frame2d-5"] {
        let s: SolverInput = serde_json::from_str(&std::fs::read_to_string(format!("tests/metamorphic_corpus/differential/{f}.json")).unwrap()).unwrap();
        let solve = |m: &SolverInput| {
            let sections = m.sections.values().map(|x| {
                let h = (12.0 * x.iz / x.a).sqrt(); let b = x.a / h;
                let mat = m.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
                (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
            }).collect();
            let materials = m.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(250.0) })).collect();
            plastic::solve_plastic_2d(&PlasticInput { solver: m.clone(), sections, materials, max_hinges: None, mp_overrides: None }).map(|r| r.collapse_factor)
        };
        let Ok(base) = solve(&s) else { eprintln!("{f}: refused"); continue };
        let mut odd = Vec::new();
        for seed in 0..40u64 {
            let rl = Relabel::random_2d(&s, seed);
            if let Ok(c) = solve(&rl.apply_2d(&s, seed)) { if (c - base).abs() > 1e-6 * base.abs() { odd.push((seed, c)); } }
        }
        eprintln!("{f}: base {base}, differing relabelings {}: {:?}", odd.len(), &odd[..odd.len().min(4)]);
    }
}

#[test]
fn probe_certificate() {
    use dedaliano_engine::metamorphic::relabel::Relabel;
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string("tests/metamorphic_corpus/differential/frame3d-2.json").unwrap()).unwrap();
    for seed in [5u64, 18, 26, 0] {
        let m = Relabel::random_3d(&s, seed).apply_3d(&s, seed);
        let sections = m.sections.values().map(|x| {
            let (b, h) = ((12.0 * x.iy / x.a).sqrt(), (12.0 * x.iz / x.a).sqrt());
            let mat = m.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
            (x.id.to_string(), PlasticSectionData3D { a: x.a, iy: x.iy, iz: x.iz, material_id: mat, b: Some(b), h: Some(h), d: Some(b) })
        }).collect();
        let materials = m.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(250.0) })).collect();
        let input = PlasticInput3D { solver: m.clone(), sections, materials, max_hinges: None, mp_overrides: None };
        let r = plastic::solve_plastic_3d(&input).unwrap();
        let c = dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&input);
        match c {
            Ok(c) => eprintln!("seed {seed}: solver λ = {:.3}; certificate certified={} lower={:?} upper={:?}", r.collapse_factor, c.certificate.certified, c.certificate.lambda_lower, c.certificate.lambda_upper),
            Err(e) => eprintln!("seed {seed}: solver λ = {:.3}; certificate error: {e}", r.collapse_factor),
        }
    }
}
