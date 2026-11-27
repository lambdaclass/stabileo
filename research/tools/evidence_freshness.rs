use serde_json::Value;

pub fn close(fresh: &Value, stored: &Value, path: &str) -> Result<(), String> {
    match (fresh, stored) {
        (Value::Number(a), Value::Number(b)) => {
            let field = path.rsplit('.').next();
            let measured = matches!(
                field,
                Some(
                    "computed"
                        | "computed_delta"
                        | "observed"
                        | "median_distance"
                        | "elastica"
                        | "stabileo"
                )
            );
            if measured && a.is_f64() && b.is_f64() {
                let (x, y) = (a.as_f64().unwrap(), b.as_f64().unwrap());
                if (x - y).abs() <= 1e-12 + 1e-6 * y.abs() {
                    return Ok(());
                }
            }
            if a == b {
                Ok(())
            } else {
                Err(format!("{path}: {a} (committed {b})"))
            }
        }
        (Value::Array(a), Value::Array(b)) if a.len() == b.len() => a
            .iter()
            .zip(b)
            .enumerate()
            .try_for_each(|(i, (x, y))| close(x, y, &format!("{path}[{i}]"))),
        (Value::Object(a), Value::Object(b)) if a.len() == b.len() => {
            for (key, x) in a {
                let field = format!("{path}.{key}");
                let y = b.get(key).ok_or_else(|| format!("{field} missing"))?;
                close(x, y, &field)?;
            }
            Ok(())
        }
        _ if fresh == stored => Ok(()),
        _ => Err(format!("{path}: {fresh} (committed {stored})")),
    }
}

#[cfg(test)]
mod tests {
    use super::close;
    use serde_json::json;

    #[test]
    fn paper_fields_are_exact_even_within_solver_roundoff() {
        let row = json!({"reference": 4.2, "computed": 4.2, "tolerance": 0.06, "points": 10});
        for field in ["reference", "tolerance"] {
            let mut stored = row.clone();
            stored[field] = json!(row[field].as_f64().unwrap() * 1.0000005);
            assert!(close(&row, &stored, "checks[0]").is_err(), "{field}");
        }
        assert!(close(&row, &row, "checks[0]").is_ok());
    }

    #[test]
    fn paper_coordinates_and_unrecognized_quantities_are_exact() {
        let mut accepted = Vec::new();
        for field in [
            "reference_delta",
            "paper_theta",
            "paper_delta",
            "new_quantity",
        ] {
            let fresh = json!({field: 1.36});
            let stale = json!({field: 1.360001});
            if close(&fresh, &stale, "row").is_ok() {
                accepted.push(field);
            }
        }
        assert!(accepted.is_empty(), "stale fields accepted: {accepted:?}");
        assert!(close(
            &json!({"computed_delta": 1.36}),
            &json!({"computed_delta": 1.360001}),
            "row"
        )
        .is_ok());
    }
}
