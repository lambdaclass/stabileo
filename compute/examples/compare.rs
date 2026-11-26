#[cfg(feature = "metal")]
fn main() {
    use dedaliano_engine::linalg::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky};
    use serde_json::json;
    use stabileo_compute::{
        gpu::WgpuBackend,
        solver::{true_relative_residual, PcgProblem, PreparedPcg},
    };
    use std::{rc::Rc, time::Instant};
    fn median(mut samples: Vec<f64>) -> f64 {
        samples.sort_by(f64::total_cmp);
        (samples[(samples.len() - 1) / 2] + samples[samples.len() / 2]) / 2.
    }
    fn relative_error(x: &[f64], reference: &[f64]) -> f64 {
        let error = x
            .iter()
            .zip(reference)
            .fold(0.0f64, |v, (a, b)| v.hypot(a - b));
        let scale = reference.iter().fold(0.0f64, |v, x| v.hypot(*x));
        error / scale
    }
    pollster::block_on(async {
        let start = Instant::now();
        let mut backend = WgpuBackend::new().await.expect("GPU adapter required");
        let startup_ms = start.elapsed().as_secs_f64() * 1000.;
        let adapter = format!("{:?}", backend.adapter_info());
        let mut rows = Vec::new();
        let large = match std::env::var("COMPUTE_BENCH_PROFILE").as_deref() {
            Ok("large") => true,
            Ok("small") | Err(_) => false,
            Ok(other) => panic!("unknown benchmark profile: {other}"),
        };
        let cases: Box<dyn Iterator<Item = _>> = if large {
            Box::new(stabileo_compute::fixtures::LARGE_CASES.iter().map(|name| {
                eprintln!("Preparing {name}");
                stabileo_compute::fixtures::large_case(name).unwrap()
            }))
        } else {
            Box::new(stabileo_compute::fixtures::comparison_cases().into_iter())
        };
        for case in cases {
            let a = case.matrix();
            let start = Instant::now();
            let cpu = PcgProblem::new(a.clone()).unwrap();
            let cpu_prepare_ms = start.elapsed().as_secs_f64() * 1000.;
            let start = Instant::now();
            let mut gpu = PreparedPcg::prepare(&mut backend, a.clone()).await.unwrap();
            let gpu_prepare_ms = start.elapsed().as_secs_f64() * 1000.;
            let start = Instant::now();
            let mut resident = backend.prepare_resident_pcg(a.clone()).await.unwrap();
            let resident_prepare_ms = start.elapsed().as_secs_f64() * 1000.;
            let start = Instant::now();
            let factor = if a.n <= 4096 {
                let symbolic = Rc::new(symbolic_cholesky(&a));
                Some(numeric_cholesky(&symbolic, &a).expect("SPD comparison case"))
            } else {
                None
            };
            let direct_prepare_ms = start.elapsed().as_secs_f64() * 1000.;
            let direct = factor
                .as_ref()
                .map(|factor| sparse_cholesky_solve(factor, &case.rhs));
            cpu.solve_cpu_reference(&case.rhs, 1e-6, 2000).unwrap();
            let _ = gpu.solve(&case.rhs, 1e-6, 2000).await;
            let _ = resident.solve(&case.rhs, 1e-6, 2000).await;
            let mut cpu_ms = Vec::new();
            let mut gpu_ms = Vec::new();
            let mut direct_ms = Vec::new();
            let mut gpu_runs = Vec::new();
            let mut cpu_runs = Vec::new();
            let mut cpu_result = None;
            let mut gpu_result = None;
            let mut resident_result = None;
            let mut resident_ms = Vec::new();
            let mut resident_runs = Vec::new();
            let orders = [
                [0, 1, 2],
                [1, 2, 0],
                [2, 0, 1],
                [2, 1, 0],
                [1, 0, 2],
                [0, 2, 1],
            ];
            for (round, order) in orders.iter().enumerate() {
                for variant in order {
                    let start = Instant::now();
                    if *variant == 1 {
                        gpu.reset_transfers();
                        gpu_result = Some(gpu.solve(&case.rhs, 1e-6, 2000).await);
                        gpu_ms.push(start.elapsed().as_secs_f64() * 1000.);
                        gpu_runs.push(match gpu_result.as_ref().unwrap() {
                            Ok(result) => json!({"converged": result.converged,
                                "iterations": result.iterations,
                                "true_relative_residual": result.true_relative_residual,"transfers":gpu.transfers()}),
                            Err(error) => json!({"converged": false,"error": error.to_string()}),
                        });
                    } else if *variant == 2 {
                        resident_result = Some(resident.solve(&case.rhs, 1e-6, 2000).await);
                        resident_ms.push(start.elapsed().as_secs_f64() * 1000.);
                        resident_runs.push(match resident_result.as_ref().unwrap() {
                            Ok(r) => json!({"converged":r.solve.converged,"iterations":r.solve.iterations,
                                "true_relative_residual":r.solve.true_relative_residual,"transfers":r.transfers}),
                            Err(e) => json!({"converged":false,"error":e.to_string()}),
                        });
                    } else {
                        cpu_result = Some(cpu.solve_cpu_reference(&case.rhs, 1e-6, 2000).unwrap());
                        cpu_ms.push(start.elapsed().as_secs_f64() * 1000.);
                        let result = cpu_result.as_ref().unwrap();
                        cpu_runs.push(
                            json!({"converged":result.converged,"iterations":result.iterations,
                            "true_relative_residual":result.true_relative_residual}),
                        );
                    }
                }
                if let Some(factor) = &factor {
                    let start = Instant::now();
                    let x = sparse_cholesky_solve(factor, &case.rhs);
                    true_relative_residual(&a, &case.rhs, &x).unwrap();
                    direct_ms.push(start.elapsed().as_secs_f64() * 1000.);
                }
                eprintln!("{}: balanced round {}/6", case.name, round + 1);
            }
            let cpu = cpu_result.unwrap();
            let gpu = match gpu_result.unwrap() {
                Ok(result) => json!({"converged":result.converged,"iterations":result.iterations,
                    "true_relative_residual":result.true_relative_residual,"recursive_relative_residual":result.recursive_relative_residual,
                    "relative_error_vs_direct":direct.as_ref().map(|x| relative_error(&result.x,x)),"relative_error_vs_known":relative_error(&result.x,&case.expected),
                    "relative_error_vs_cpu":relative_error(&result.x,&cpu.x),"transfers":gpu.transfers()}),
                Err(error) => json!({"converged":false,"error":error.to_string()}),
            };
            let resident = match resident_result.unwrap() {
                Ok(r) => json!({"converged":r.solve.converged,"iterations":r.solve.iterations,
                    "true_relative_residual":r.solve.true_relative_residual,"recursive_relative_residual":r.solve.recursive_relative_residual,
                    "relative_error_vs_known":relative_error(&r.solve.x,&case.expected),"relative_error_vs_cpu":relative_error(&r.solve.x,&cpu.x),"transfers":r.transfers}),
                Err(e) => json!({"converged":false,"error":e.to_string()}),
            };
            rows.push(json!({"case":case.name,"dofs":case.n,"stored_nnz":a.values.len(),
                "resident_prepare_ms":resident_prepare_ms,"resident_solve_ms":median(resident_ms.clone()),"resident_samples_ms":resident_ms,"resident_runs":resident_runs,"resident":resident,
                "cpu_prepare_ms":cpu_prepare_ms,"gpu_prepare_ms":gpu_prepare_ms,"cholesky_prepare_ms":factor.as_ref().map(|_| direct_prepare_ms),
                "cpu_solve_ms":median(cpu_ms.clone()),"gpu_solve_ms":median(gpu_ms.clone()),"cholesky_solve_ms":(!direct_ms.is_empty()).then(|| median(direct_ms.clone())),
                "cpu_samples_ms":cpu_ms,"gpu_samples_ms":gpu_ms,"cholesky_samples_ms":direct_ms,"gpu_runs":gpu_runs,"cpu_runs":cpu_runs,
                "cpu":{"converged":cpu.converged,"iterations":cpu.iterations,"true_relative_residual":cpu.true_relative_residual,
                    "relative_error_vs_direct":direct.as_ref().map(|x| relative_error(&cpu.x,x)),"relative_error_vs_known":relative_error(&cpu.x,&case.expected)},"gpu":gpu,
                "cholesky_true_relative_residual":direct.as_ref().map(|x| true_relative_residual(&a,&case.rhs,x).unwrap())}));
        }
        let report = json!({"adapter":adapter,"profile":if large {"large"} else {"small"},"gpu_startup_ms":startup_ms,"tolerance":1e-6,"max_iterations":2000,
            "cpu_baseline":"production pcg_solve + original f64 residual validation",
            "timing":"median of six balanced CPU/hybrid/resident rounds after warmup; solve includes transfers and f64 residual validation",
            "experimental":true,"rows":rows});
        let output = std::env::var("COMPUTE_BENCH_OUT")
            .unwrap_or("target/compute-comparison-metal.json".into());
        if let Some(parent) = std::path::Path::new(&output).parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&output, serde_json::to_string_pretty(&report).unwrap()).unwrap();
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
    });
}
#[cfg(not(feature = "metal"))]
fn main() {
    panic!("run make bench.compute.metal with a Metal adapter");
}
