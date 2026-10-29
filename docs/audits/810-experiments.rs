// Audit harness body; generated builders are taken from the original benchmark revision.
fn adjust(input: &mut SolverInput3D, n: usize, roof: bool, mode: &str) {
    if mode == "original" { return; }
    if mode == "unpin" {
        input.supports.values_mut().find(|s| s.node_id == 1).unwrap().rz = false;
        return;
    }
    let keep_pin = mode == "symmetry_pin";
    input.supports.clear();
    for i in 0..=n { for j in 0..=n {
        let mut f = [false;6];
        if i==0 { f[0]=true; f[4]=true; f[5]=true; }
        if i==n { f[1]=true; f[2]=true; }
        if roof && j==0 { f[1]=true; f[3]=true; f[5]=true; }
        if !roof && j==0 { f[2]=true; f[3]=true; f[4]=true; }
        if !roof && j==n { f[1]=true; f[3]=true; f[5]=true; }
        if keep_pin && i==0 && j==0 { f[2]=true; }
        if f.iter().any(|b| *b) {
            let id=i*(n+1)+j+1;
            input.supports.insert(id.to_string(),sup3d(id,f[0],f[1],f[2],f[3],f[4],f[5]));
        }
    }}
    if roof && mode != "symmetry_pin" && mode != "symmetry_old_load" {
        input.loads.clear();
        for i in 0..=n { for j in 0..=n {
            let w=(if i==0 || i==n {0.5} else {1.0})*(if j==0 || j==n {0.5} else {1.0});
            input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id:i*(n+1)+j+1, fx:0.,fy:0.,fz:-90.*25.*25.*40_f64.to_radians()/(n*n) as f64*w,
                mx:0.,my:0.,mz:0.,bw:None,
            }));
        }}
    }
}
fn run(input: &SolverInput3D, target: usize, roof: bool, label: &str) -> f64 {
    let r=linear::solve_3d(input).unwrap();
    let d=r.displacements.iter().find(|d|d.node_id==target).unwrap();
    let u=if roof {d.uz} else {d.uy};
    let f:f64=input.loads.iter().map(|l|match l {SolverLoad3D::Nodal(l)=>if roof {l.fz}else{l.fy},_=>0.}).sum();
    let reaction:f64=r.reactions.iter().map(|r|if roof {r.fz}else{r.fy}).sum();
    if input.loads.iter().any(|l| !matches!(l,SolverLoad3D::Nodal(_))) {
        println!("{label}: u={u:.12e} reaction={reaction:.9} (element loads; nodal-only sum omitted)");return u;
    }
    println!("{label}: u={u:.12e} ratio={:.9} F={f:.9} R={reaction:.9} balance={:.3e}",u/if roof {-0.3024}else{-1.8248e-5},f+reaction);
    u
}
fn main() {
    if std::env::args().any(|s|s=="isolate") {isolate();return;}
    if std::env::args().any(|s|s=="elements") {element_experiments(); flat_experiments();return;}
    let data:serde_json::Value=serde_json::from_str(&std::fs::read_to_string("/private/tmp/810-cases.json").unwrap()).unwrap();
    for c in data["cases"].as_array().unwrap() {
        let group=c["group"].as_str().unwrap();
        if group!="roof" && group!="cylinder" {continue;}
        let input:SolverInput3D=serde_json::from_value(c["input"].clone()).unwrap();
        run(&input,c["measurement"]["node"].as_u64().unwrap() as usize,group=="roof",&format!("case {}",c["id"]));
    }
    for roof in [true,false] { for n in [6,8,12,16,32] {
        let (base,target)=if roof {scordelis_lo_solve(n,n)}else{pinched_cylinder_solve(n,n)};
        for mode in if roof {vec!["original","unpin","symmetry_pin","symmetry_old_load","corrected"]}else{vec!["original","corrected"]} {
            let mut input=base.clone(); adjust(&mut input,n,roof,mode);
            run(&input,target,roof,&format!("roof={roof} n={n} {mode}"));
        }
    }}
    for roof in [true,false] { for n in [8,16] {
        let m=if roof {family::scordelis(family::Fam::Mitc9,n)}else{family::pinched_cylinder(family::Fam::Mitc9,n)};
        let target=if roof {m.grid[0][n].0}else{m.grid[0][0].0};
        run(&m.input,target,roof,&format!("MITC9 roof={roof} n={n}"));
    }}
}
fn custom(input: &SolverInput3D, target:usize, roof:bool, drill:f64, shear:f64) -> f64 {
    use dedaliano_engine::{element::quad, linalg::*};
    let nd=input.nodes.len()*6;
    let mut fixed=vec![false;nd];
    for s in input.supports.values() {
        for (d,b) in [s.rx,s.ry,s.rz,s.rrx,s.rry,s.rrz].iter().enumerate() {fixed[(s.node_id-1)*6+d] |= b;}
    }
    let mut map=vec![usize::MAX;nd]; let mut nf=0;
    for i in 0..nd {if !fixed[i] {map[i]=nf;nf+=1;}}
    let (mut rows,mut cols,mut vals)=(vec![],vec![],vec![]);
    for q in input.quads.values() {
        let coords=q.nodes.map(|id| {let p=&input.nodes[&id.to_string()];[p.x,p.y,p.z]});
        let mat=&input.materials[&q.material_id.to_string()];
        let kl=variant::audit_stiffness(&coords,mat.e*1000.,mat.nu,q.thickness,drill,shear);
        let k=transform_stiffness(&kl,&quad::quad_transform_3d(&coords),24);
        let ids:Vec<usize>=q.nodes.iter().flat_map(|id|(0..6).map(move |d|(id-1)*6+d)).collect();
        for a in 0..24 {for b in 0..=a {let (i,j)=(map[ids[a]],map[ids[b]]);if i!=usize::MAX && j!=usize::MAX {rows.push(i);cols.push(j);vals.push(k[a*24+b]);}}}
    }
    let mut f=vec![0.;nf];
    for l in &input.loads {if let SolverLoad3D::Nodal(l)=l {for (d,v) in [l.fx,l.fy,l.fz,l.mx,l.my,l.mz].iter().enumerate() {let i=map[(l.node_id-1)*6+d];if i!=usize::MAX {f[i]+=v;}}}}
    let k=CscMatrix::from_triplets(nf,&rows,&cols,&vals);
    let u=sparse_cholesky_solve_full(&k,&f).unwrap();
    u[map[(target-1)*6+if roof {2}else{1}]]
}
fn element_experiments() {
    use family::Fam;
    for roof in [true,false] {
        let n=16;
        let (mut input,target)=if roof {scordelis_lo_solve(n,n)}else{pinched_cylinder_solve(n,n)};
        adjust(&mut input,n,roof,"corrected");
        let production=run(&input,target,roof,"custom-control");
        let control=custom(&input,target,roof,1.,1.);
        assert!((control/production-1.).abs()<1e-7);
        for drill in [0.01,1.,100.] {
            let u=custom(&input,target,roof,drill,1.);
            println!("drill roof={roof} multiplier={drill} u={u:.12e} relative_to_default={:.9}",u/control);
        }
        for shear in [0.1,10.] {
            let u=custom(&input,target,roof,1.,shear);
            println!("shear roof={roof} multiplier={shear} u={u:.12e} relative_to_default={:.9}",u/control);
        }
        let maxwarp=input.quads.values().map(|q| {
            let coords=q.nodes.map(|id|{let p=&input.nodes[&id.to_string()];[p.x,p.y,p.z]});
            dedaliano_engine::element::quad::quad_quality_metrics(&coords).warping
        }).fold(0_f64,f64::max);
        println!("warp roof={roof} max={maxwarp:.12e}");
        for scale in [0.1,1.,10.] {
            let mut values=vec![];
            for fam in [Fam::Mitc4,Fam::Mitc9] {
                let mut m=if roof {family::scordelis(fam,n)}else{family::pinched_cylinder(fam,n)};
                for l in &mut m.input.loads {match l {SolverLoad3D::QuadSelfWeight(w)|SolverLoad3D::Quad9SelfWeight(w)=>w.density/=scale,_=>{}}}
                for q in m.input.quads.values_mut(){q.thickness*=scale;}
                for q in m.input.quad9s.values_mut(){q.thickness*=scale;}
                let target=if roof {m.grid[0][n].0}else{m.grid[0][0].0};
                values.push(run(&m.input,target,roof,&format!("thickness roof={roof} fam={fam:?} scale={scale}")));
            }
            println!("thickness roof={roof} scale={scale} MITC4/MITC9={:.9}",values[0]/values[1]);
        }
    }
}
fn flat_experiments() {
    for t in [0.001_f64,0.01,0.1] {
        let mut values=vec![];
        for fam in [family::Fam::Mitc4,family::Fam::Mitc9] {
            let m=family::surface(fam,16,16,t,200000.,0.3,
                &|u,v|([u,v,0.],[0.,0.,1.]),
                &|i,j,mx,my| {
                    let mut f=[false;6];
                    f[2]=i==0||j==0||i==mx||j==my;
                    f[0]=i==0&&j==0;f[1]=j==0&&(i==0||i==mx);
                    f.iter().any(|b|*b).then_some(f)
                },family::Load::Pressure(-1.));
            let r=linear::solve_3d(&m.input).unwrap();
            let u=r.displacements.iter().find(|d|d.node_id==m.grid[8][8].0).unwrap().uz;
            let d=200000000.*t.powi(3)/(12.*(1.-0.3*0.3));
            let navier=0.00406235266/d;
            println!("flat fam={fam:?} t={t} u={u:.12e} abs/Navier={:.9}",u.abs()/navier);
            values.push(u);
        }
        println!("flat t={t} MITC4/MITC9={:.9}",values[0]/values[1]);
    }
}
fn isolate() {
    let n=16;
    let (base,target)=pinched_cylinder_solve(n,n);
    for mode in ["corners_only","rotations_only"] {
        let mut m=base.clone();adjust(&mut m,n,false,"corrected");
        if mode=="corners_only" {
            for i in 1..n {
                m.supports.get_mut(&(i*(n+1)+1).to_string()).unwrap().rry=false;
                m.supports.get_mut(&(i*(n+1)+n+1).to_string()).unwrap().rrz=false;
            }
        } else {
            for id in [1,n+1,n*(n+1)+1,(n+1)*(n+1)] {
                *m.supports.get_mut(&id.to_string()).unwrap()=base.supports.values().find(|s|s.node_id==id).unwrap().clone();
            }
        }
        run(&m,target,false,mode);
    }
    let (base,target)=scordelis_lo_solve(n,n);
    let mut full=base.clone();adjust(&mut full,n,true,"corrected");
    full.supports=base.supports.clone();
    run(&full,target,true,"old BC all loads");
    for scale in [0.25,1.187] {
        let mut m=base.clone();
        for l in &mut m.loads {if let SolverLoad3D::Nodal(l)=l {l.fz*=scale;}}
        run(&m,target,true,&format!("old BC load scale={scale}"));
    }
}
