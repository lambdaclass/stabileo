//! Records the git commit the engine is built from (`STABILEO_ENGINE_COMMIT`), for the
//! provenance of certificate bundles (`certify::provenance`). `STABILEO_GIT_COMMIT`
//! overrides it (builds outside a git checkout); `unknown` when neither is available.

use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8(out.stdout).ok()).flatten().map(|s| s.trim().to_string())
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=STABILEO_GIT_COMMIT");
    let commit = std::env::var("STABILEO_GIT_COMMIT")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| git(&["rev-parse", "HEAD"]))
        .unwrap_or_else(|| "unknown".into());
    // Rebuild when HEAD moves (the HEAD file, the branch ref it points to, packed refs).
    let mut refs = vec!["HEAD".to_string(), "packed-refs".to_string()];
    refs.extend(git(&["symbolic-ref", "-q", "HEAD"]));
    for r in refs {
        if let Some(path) = git(&["rev-parse", "--git-path", &r]).filter(|p| std::path::Path::new(p).exists()) {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    println!("cargo:rustc-env=STABILEO_ENGINE_COMMIT={commit}");
}
