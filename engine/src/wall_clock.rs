use std::ffi::OsString;
use std::io::Write;

/// A wall-clock budget: panics when `within` is false, unless `WALL_CLOCK_REPORT` names a file,
/// where the overrun is appended as a JSON line instead (pull-request and merge-queue runs).
pub fn budget(within: bool, message: impl FnOnce() -> String) {
    check(within, message, std::env::var_os("WALL_CLOCK_REPORT"));
}

fn check(within: bool, message: impl FnOnce() -> String, report: Option<OsString>) {
    if within {
        return;
    }
    let what = message();
    match report.filter(|path| !path.is_empty()) {
        None => panic!("{what}"),
        Some(path) => {
            let line = serde_json::json!({ "what": what }).to_string();
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .unwrap_or_else(|e| panic!("{what} (and WALL_CLOCK_REPORT {path:?} failed: {e})"));
            writeln!(file, "{line}").unwrap_or_else(|e| panic!("{what} (and WALL_CLOCK_REPORT {path:?} failed: {e})"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::check;

    fn report_path(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("wall-clock-{}-{name}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn a_budget_kept_neither_panics_nor_reports() {
        let path = report_path("kept");
        check(true, || unreachable!(), Some(path.clone().into()));
        check(true, || unreachable!(), None);
        assert!(!path.exists());
    }

    #[test]
    #[should_panic(expected = "took 9 ms of 5")]
    fn an_overrun_panics_without_a_report_file() {
        check(false, || "took 9 ms of 5".into(), None);
    }

    #[test]
    #[should_panic(expected = "took 9 ms of 5")]
    fn an_empty_report_path_still_enforces() {
        check(false, || "took 9 ms of 5".into(), Some("".into()));
    }

    #[test]
    fn an_overrun_is_appended_to_the_report_file() {
        let path = report_path("overrun");
        check(false, || "first \"quoted\"".into(), Some(path.clone().into()));
        check(false, || "second".into(), Some(path.clone().into()));
        let lines: Vec<serde_json::Value> = std::fs::read_to_string(&path).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        let _ = std::fs::remove_file(&path);
        assert_eq!(lines, vec![serde_json::json!({ "what": "first \"quoted\"" }), serde_json::json!({ "what": "second" })]);
    }

    #[test]
    #[should_panic(expected = "took 9 ms of 5 (and WALL_CLOCK_REPORT")]
    fn an_unwritable_report_file_fails_closed() {
        check(false, || "took 9 ms of 5".into(), Some("/nonexistent/dir/report.jsonl".into()));
    }
}
