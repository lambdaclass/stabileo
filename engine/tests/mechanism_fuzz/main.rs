mod calibration;
mod case;
mod gen2;
mod gen3;
mod known;
mod nullspace;
mod oracle;
mod shrink;

use case::Case;
use oracle::{judge, Outcome};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub fn generate(seed: u64) -> Case {
    if seed % 2 == 0 { gen2::case(seed) } else { gen3::case(seed) }
}

fn corpus() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/mechanism_fuzz_corpus")
}

fn env<T: std::str::FromStr>(name: &str, default: T) -> T {
    std::env::var(name).ok().map(|v| v.parse().unwrap_or_else(|_| panic!("{name}={v} does not parse"))).unwrap_or(default)
}

fn threads() -> usize {
    let n = env("MECHANISM_FUZZ_THREADS", std::thread::available_parallelism().map_or(4, |n| n.get().min(8)));
    assert!(n > 0, "MECHANISM_FUZZ_THREADS=0 would evaluate no models");
    n
}

pub fn parse_duration(s: &str) -> Duration {
    let s = s.trim();
    let (n, unit) = s.split_at(s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len()));
    let n: u64 = n.parse().unwrap_or_else(|_| panic!("DURATION={s}: expected e.g. 90, 90s, 30m or 1h"));
    Duration::from_secs(match unit {
        "" | "s" => n,
        "m" => 60 * n,
        "h" => 3600 * n,
        _ => panic!("DURATION={s}: expected e.g. 90, 90s, 30m or 1h"),
    })
}

struct Finding {
    seed: u64,
    issue: Option<u32>,
    outcome: Outcome,
    case: Case,
}

fn minimised(seed: u64) -> (Case, Outcome) {
    let c = generate(seed);
    let o = judge(&c);
    let issue = known::classify(&c, &o);
    let mut m = shrink::minimise(&c, |t| {
        let o = judge(t);
        o.is_silent() && known::classify(t, &o) == issue
    });
    m.known_issue = issue;
    let o = judge(&m);
    (m, o)
}

fn run(seeds: impl Iterator<Item = u64> + Send, deadline: Option<Instant>) -> (Vec<Finding>, BTreeMap<(String, &'static str), usize>, u64) {
    let seeds = Mutex::new(seeds);
    let findings = Mutex::new(Vec::new());
    let tally = Mutex::new(BTreeMap::new());
    let count = Mutex::new(0u64);
    std::thread::scope(|scope| {
        for _ in 0..threads() {
            scope.spawn(|| loop {
                if deadline.is_some_and(|d| Instant::now() >= d) {
                    return;
                }
                let Some(seed) = seeds.lock().unwrap().next() else { return };
                let c = generate(seed);
                let o = judge(&c);
                *tally.lock().unwrap().entry((format!("{}/{}", &c.name[..2], c.family), o.label())).or_insert(0) += 1;
                *count.lock().unwrap() += 1;
                if o.is_silent() {
                    let issue = known::classify(&c, &o);
                    findings.lock().unwrap().push(Finding { seed, issue, outcome: o, case: c });
                }
            });
        }
    });
    let mut f = findings.into_inner().unwrap();
    f.sort_by_key(|x| x.seed);
    (f, tally.into_inner().unwrap(), count.into_inner().unwrap())
}

fn print_tally(t: &BTreeMap<(String, &'static str), usize>) {
    for ((family, label), n) in t {
        println!("{family:<18} {label:<12} {n}");
    }
}

fn issue_name(i: Option<u32>) -> String {
    i.map_or("unknown".into(), |i| format!("#{i}"))
}

struct Quick {
    ranges: Vec<(u64, u64)>,
    expect: BTreeMap<u64, u32>,
}

fn quick_corpus() -> Quick {
    let text = std::fs::read_to_string(corpus().join("quick.txt")).expect("tests/mechanism_fuzz_corpus/quick.txt");
    let mut q = Quick { ranges: vec![], expect: BTreeMap::new() };
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        let w: Vec<&str> = line.split_whitespace().collect();
        match w.as_slice() {
            ["seeds", a, b] => q.ranges.push((a.parse().unwrap(), b.parse().unwrap())),
            ["expect", issue, seeds @ ..] => {
                let issue: u32 = issue.trim_start_matches('#').parse().unwrap();
                for s in seeds {
                    q.expect.insert(s.parse().unwrap(), issue);
                }
            }
            _ => panic!("quick.txt: cannot read {line:?}"),
        }
    }
    q
}

fn render_quick(q: &Quick, found: &[Finding]) -> String {
    let mut s = String::from("# Seeds of the per-PR mechanism-fuzz tier, and the silent ones each open issue explains.\n# Rewritten by MECHANISM_FUZZ_UPDATE=1 make test.engine.mechanism-fuzz.quick.\n");
    for (a, b) in &q.ranges {
        s += &format!("seeds {a} {b}\n");
    }
    let mut per_issue: BTreeMap<u32, Vec<String>> = BTreeMap::new();
    for f in found {
        if let Some(i) = f.issue {
            per_issue.entry(i).or_default().push(f.seed.to_string());
        }
    }
    for (i, seeds) in per_issue {
        s += &format!("expect #{i} {}\n", seeds.join(" "));
    }
    s
}

#[test]
#[ignore]
fn mechanism_fuzz_quick() {
    let q = quick_corpus();
    let started = Instant::now();
    let (found, tally, n) = run(q.ranges.clone().into_iter().flat_map(|(a, b)| a..b), None);
    print_tally(&tally);
    println!("{n} models in {:.1} s", started.elapsed().as_secs_f64());
    let corpus_size: u64 = q.ranges.iter().map(|(a, b)| b - a).sum();
    assert_eq!(n, corpus_size, "the quick tier evaluated {n} of its {corpus_size} seeds");
    let mut errors = vec![];
    for f in &found {
        match (f.issue, q.expect.get(&f.seed)) {
            (Some(i), Some(&e)) if i == e => {}
            (issue, expected) => {
                let (m, o) = minimised(f.seed);
                errors.push(format!(
                    "seed {} ({}): silent, classified {}, expected {}: {:?}\nminimised: {}\n{o:?}",
                    f.seed, f.case.family, issue_name(issue), expected.map_or("to hold".into(), |e| format!("#{e}")), f.outcome, serde_json::to_string(&m).unwrap()
                ));
            }
        }
    }
    let silent: std::collections::BTreeSet<u64> = found.iter().map(|f| f.seed).collect();
    for (seed, issue) in &q.expect {
        if !silent.contains(seed) {
            errors.push(format!("seed {seed} is listed under #{issue} but no longer fails: if #{issue} is fixed, drop its expect lines (MECHANISM_FUZZ_UPDATE=1) and its regression files' knownIssue"));
        }
    }
    if std::env::var("MECHANISM_FUZZ_UPDATE").is_ok() {
        std::fs::write(corpus().join("quick.txt"), render_quick(&q, &found)).unwrap();
        errors.retain(|e| e.contains("classified unknown"));
    }
    assert!(errors.is_empty(), "{} mechanism-fuzz finding(s):\n{}", errors.len(), errors.join("\n\n"));
}

#[test]
#[ignore]
fn mechanism_fuzz_long() {
    let budget = parse_duration(&std::env::var("MECHANISM_FUZZ_DURATION").unwrap_or("30m".into()));
    let start: u64 = env("MECHANISM_FUZZ_SEED", 1_000_000);
    let report = std::env::var("MECHANISM_FUZZ_REPORT_DIR").ok().map(PathBuf::from);
    let started = Instant::now();
    let (found, tally, n) = run(start.., Some(started + budget));
    print_tally(&tally);
    println!("{n} models (seeds {start}..) in {:.1} s", started.elapsed().as_secs_f64());
    let mut per_issue: BTreeMap<Option<u32>, Vec<u64>> = BTreeMap::new();
    for f in &found {
        per_issue.entry(f.issue).or_default().push(f.seed);
    }
    let mut unknown = vec![];
    for (issue, seeds) in &per_issue {
        println!("{}: {} silent seed(s): {:?}", issue_name(*issue), seeds.len(), &seeds[..seeds.len().min(20)]);
        let shown = if issue.is_none() { seeds.len() } else { 3 };
        for &seed in seeds.iter().take(shown) {
            let (m, o) = minimised(seed);
            let json = serde_json::to_string_pretty(&m).unwrap();
            if let Some(dir) = &report {
                let dir = dir.join(issue.map_or("unknown".into(), |i| format!("issue-{i}")));
                std::fs::create_dir_all(&dir).unwrap();
                std::fs::write(dir.join(format!("seed-{seed}.json")), &json).unwrap();
            }
            if issue.is_none() {
                unknown.push(format!("seed {seed}: {o:?}\n{json}"));
            }
        }
    }
    assert!(unknown.is_empty(), "{} silent mechanism(s) no open issue explains:\n{}", unknown.len(), unknown.join("\n\n"));
}

#[test]
#[ignore]
fn mechanism_fuzz_replay() {
    for s in std::env::var("MECHANISM_FUZZ_SEEDS").unwrap_or_default().split(',').filter(|s| !s.is_empty()) {
        let (m, o) = minimised(s.parse().unwrap());
        let c = generate(s.parse().unwrap());
        println!("seed {s}: {:?}\ngenerated: {}\nminimised: {}\n{o:?}", judge(&c), serde_json::to_string(&c).unwrap(), serde_json::to_string_pretty(&m).unwrap());
    }
    for f in std::env::var("MECHANISM_FUZZ_FILES").unwrap_or_default().split(',').filter(|s| !s.is_empty()) {
        let c: Case = serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
        println!("{f}: {:?}", judge(&c));
    }
}

#[test]
fn regressions() {
    let mut files: Vec<PathBuf> = std::fs::read_dir(corpus().join("regressions")).unwrap().map(|e| e.unwrap().path()).collect();
    files.sort();
    assert!(!files.is_empty());
    for f in files {
        let c: Case = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap_or_else(|e| panic!("{}: {e}", f.display()));
        let o = judge(&c);
        let issue = known::classify(&c, &o);
        match c.known_issue {
            Some(i) => assert!(o.is_silent() && issue == Some(i), "{}: #{i} no longer reproduces ({o:?}): if it is fixed, drop knownIssue here and the expect lines in quick.txt", f.display()),
            None if c.must_hold => assert!(matches!(o, Outcome::Held), "{}: must be certified and match its closed-form answer: {o:?}", f.display()),
            None => assert!(!o.is_silent(), "{}: {o:?}", f.display()),
        }
    }
}

#[test]
fn generation_is_deterministic_and_reaches_every_family() {
    let mut families = std::collections::BTreeSet::new();
    for seed in 0..400 {
        let (a, b) = (generate(seed), generate(seed));
        assert_eq!(serde_json::to_value(&a).unwrap(), serde_json::to_value(&b).unwrap());
        families.insert(a.name[..2].to_string() + &a.family);
    }
    let all: std::collections::BTreeSet<String> = gen2::FAMILIES.iter().map(|f| format!("2d{f}")).chain(gen3::FAMILIES.iter().map(|f| format!("3d{f}"))).collect();
    assert_eq!(families, all);
}

#[test]
fn case_json_round_trips() {
    for seed in 0..40 {
        let c = generate(seed);
        let back: Case = serde_json::from_str(&serde_json::to_string(&c).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(&back).unwrap(), serde_json::to_value(&c).unwrap());
        assert_eq!(judge(&back).label(), judge(&c).label());
    }
}

#[test]
fn durations_parse() {
    assert_eq!(parse_duration("90"), Duration::from_secs(90));
    assert_eq!(parse_duration("45s"), Duration::from_secs(45));
    assert_eq!(parse_duration("30m"), Duration::from_secs(1800));
    assert_eq!(parse_duration("1h"), Duration::from_secs(3600));
}
