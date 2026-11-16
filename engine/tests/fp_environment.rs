//! The floating-point environment the certificates assume (testing/docs/TRUSTED_BASE.md,
//! "Floating point where the code runs"), checked where the tests run.
//!
//! The outward rounding of `certify/interval.rs` (round to nearest, then `next_down` /
//! `next_up`) is sound only if
//! * every f64 operation rounds to nearest-even (no other rounding mode in effect),
//! * subnormals are produced and consumed (no flush-to-zero / denormals-are-zero),
//! * `a * b + c` is two roundings, not one fused multiply-add the code did not ask for,
//! * `next_up` / `next_down` step to the adjacent float across zero, the subnormal range
//!   and the overflow threshold.
//! WebAssembly fixes all four for scalar f64 by its specification; on native targets they
//! hold unless something changes the FPU state or the build flags, which these tests and
//! the source scan below would catch. Operands go through `black_box` so the compiler
//! cannot fold the arithmetic at compile time (which would test the compiler, not the FPU).

use std::hint::black_box;

fn bits(x: f64) -> u64 {
    x.to_bits()
}

#[test]
fn rounding_is_to_nearest_even() {
    let one = black_box(1.0f64);
    let half_ulp = black_box(2f64.powi(-53));
    // Exact ties round to the even neighbour, in both directions.
    assert_eq!(one + half_ulp, 1.0, "1 + 2^-53 must tie to 1 (even)");
    let odd = black_box(1.0 + 2f64.powi(-52));
    assert_eq!(odd + half_ulp, 1.0 + 2f64.powi(-51), "(1 + 2^-52) + 2^-53 must tie up to even");
    // Above and below the tie: nearest, not toward zero or toward ±inf.
    let above = black_box(2f64.powi(-53) + 2f64.powi(-80));
    assert_eq!(one + above, 1.0 + 2f64.powi(-52));
    assert_eq!(-one - above, -(1.0 + 2f64.powi(-52)));
    let below = black_box(2f64.powi(-53) - 2f64.powi(-80));
    assert_eq!(one + below, 1.0);
    assert_eq!(-one - below, -1.0);
    // Division and square root are correctly rounded too.
    assert_eq!(black_box(1.0f64) / black_box(3.0f64), 0.333_333_333_333_333_3);
    assert_eq!(black_box(2.0f64).sqrt(), std::f64::consts::SQRT_2);
}

#[test]
fn subnormals_are_not_flushed() {
    let tiny = black_box(f64::from_bits(1)); // 2^-1074
    let min_normal = black_box(f64::MIN_POSITIVE);
    assert_eq!(bits(tiny * black_box(1.0)), 1, "a subnormal operand must not be read as 0 (DAZ)");
    assert_eq!(min_normal / black_box(2.0), f64::from_bits(1u64 << 51), "a subnormal result must not be flushed (FTZ)");
    assert!(tiny > 0.0 && tiny + tiny == f64::from_bits(2));
    // Gradual underflow: x − y = 0 only when x = y.
    let x = black_box(f64::MIN_POSITIVE * 1.5);
    let y = black_box(f64::MIN_POSITIVE);
    assert_ne!(x - y, 0.0);
    // Rounding into the subnormal range is to nearest as well: 3·2^-1075 is a tie → 2^-1073 (even).
    assert_eq!(bits(black_box(f64::from_bits(3)) / black_box(2.0)), 2);
}

#[test]
fn multiply_add_is_not_contracted() {
    // a·b = 1 − 2^-60 exactly, which rounds to 1; a fused a·b − 1 would give −2^-60.
    let a = black_box(1.0 + 2f64.powi(-30));
    let b = black_box(1.0 - 2f64.powi(-30));
    let c = black_box(-1.0f64);
    assert_eq!(a * b + c, 0.0, "a*b + c was contracted into an fma");
    assert_eq!(c + a * b, 0.0, "c + a*b was contracted into an fma");
    // The explicit fma is the only fused operation.
    assert_eq!(a.mul_add(b, c), -(2f64.powi(-60)));
    // Inside the interval code: the upper endpoint of [a]·[b] + [−1] must enclose the
    // exact −2^-60 from rounding the product to 1 and widening, not from a fused residual.
    use dedaliano_engine::certify::interval::Interval;
    let r = Interval::point(a) * Interval::point(b) + Interval::point(c);
    assert!(r.lo <= -(2f64.powi(-60)) && -(2f64.powi(-60)) <= r.hi, "{r:?}");
}

#[test]
fn next_up_next_down_step_to_the_adjacent_float() {
    let tiny = f64::from_bits(1);
    // Across zero (both signed zeros).
    assert_eq!(bits(black_box(0.0f64).next_up()), 1);
    assert_eq!(bits(black_box(-0.0f64).next_up()), 1);
    assert_eq!(black_box(0.0f64).next_down(), -tiny);
    assert_eq!(black_box(-0.0f64).next_down(), -tiny);
    assert_eq!(bits(black_box(tiny).next_down()), 0, "next_down(2^-1074) is +0");
    assert_eq!(black_box(-tiny).next_up(), 0.0);
    // Subnormal / normal boundary.
    let max_sub = f64::from_bits(0x000F_FFFF_FFFF_FFFF);
    assert_eq!(black_box(max_sub).next_up(), f64::MIN_POSITIVE);
    assert_eq!(black_box(f64::MIN_POSITIVE).next_down(), max_sub);
    // Binade boundaries: the gap halves below a power of two.
    assert_eq!(black_box(1.0f64).next_down(), 1.0 - 2f64.powi(-53));
    assert_eq!(black_box(1.0f64).next_up(), 1.0 + 2f64.powi(-52));
    assert_eq!(black_box(-1.0f64).next_up(), -(1.0 - 2f64.powi(-53)));
    // Overflow threshold and infinities: never a finite value above MAX.
    assert_eq!(black_box(f64::MAX).next_up(), f64::INFINITY);
    assert_eq!(black_box(f64::INFINITY).next_up(), f64::INFINITY);
    assert_eq!(black_box(f64::INFINITY).next_down(), f64::MAX);
    assert_eq!(black_box(f64::NEG_INFINITY).next_up(), -f64::MAX);
    assert_eq!(black_box(f64::NEG_INFINITY).next_down(), f64::NEG_INFINITY);
    assert!(black_box(f64::NAN).next_up().is_nan() && black_box(f64::NAN).next_down().is_nan());
    // Exactly one float apart, for a sweep of magnitudes and both signs.
    let mut x = f64::from_bits(1);
    while x.is_finite() {
        for v in [x, -x] {
            assert_eq!(v.next_up().next_down(), v, "{v:e}");
            assert_eq!(v.next_down().next_up(), v, "{v:e}");
            assert!(v.next_down() < v && v < v.next_up());
        }
        x *= 3.7;
    }
}

#[test]
fn round_to_nearest_error_is_within_the_one_ulp_widening() {
    // The rounding model: the exact result r of an operation satisfies
    // next_down(rn(r)) ≤ r ≤ next_up(rn(r)). Checked exactly for products, with the fma
    // residual e (a·b = p + e exactly) and differences that are exact by Sterbenz,
    // in the normal range and for products that land in the subnormal range.
    let mut s = 0x9E37_79B9_7F4A_7C15u64;
    let mut next = move || {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        (s >> 11) as f64 / (1u64 << 53) as f64
    };
    // Powers of two built from their bits (`powi` with a large negative exponent is not
    // exact: 2^-1040 computed as 1/2^1040 overflows to 0).
    let pow2 = |k: i32| f64::from_bits(((k + 1023) as u64) << 52); // normal range only
    let scale_up = |v: f64| v * pow2(1000) * pow2(80); // exact: × 2^1080
    let mut subnormal_cases = 0;
    for _ in 0..50_000 {
        let a = black_box(1.0 + next() * 1e6);
        let b = black_box(1.0 + next() * 1e6);
        let p = a * b;
        let e = a.mul_add(b, -p);
        assert!(p.next_down() - p <= e && e <= p.next_up() - p, "{a} * {b}");
        // (a·2^-1000)(b·2^-80) = a·b·2^-1080 < 2^-1022: rounded in the subnormal range.
        // Both scaled operands are normal, so exact.
        let q = black_box(a * pow2(-1000)) * black_box(b * pow2(-80));
        assert!(q < f64::MIN_POSITIVE);
        if p >= 1024.0 {
            let (lo, hi) = (scale_up(q.next_down()), scale_up(q.next_up()));
            assert!(lo - p <= e && e <= hi - p, "subnormal {a} * {b}");
            subnormal_cases += 1;
        }
    }
    assert!(subnormal_cases > 40_000);
}

/// Source and build-configuration scan: nothing turns on fused or reassociating float
/// arithmetic in the certificate code, and no build flag enables FMA or relaxed SIMD.
#[test]
fn no_fused_or_fast_math_in_certificate_code_or_build_flags() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut offenders = Vec::new();
    for entry in std::fs::read_dir(root.join("src/certify")).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let text = std::fs::read_to_string(&path).unwrap();
        // Only the non-test part: unit tests use mul_add as an exact-residual oracle.
        let code = text.split("#[cfg(test)]").next().unwrap();
        for (i, line) in code.lines().enumerate() {
            let l = line.split("//").next().unwrap();
            for pat in ["mul_add", "fmaf64", "fadd_fast", "fsub_fast", "fmul_fast", "fdiv_fast", "algebraic_", "set_flush", "_mm_setcsr", "fesetround"] {
                if l.contains(pat) {
                    offenders.push(format!("{}:{}: {pat}", path.display(), i + 1));
                }
            }
        }
    }
    let configs = [root.join(".cargo/config.toml"), root.join("Cargo.toml"), root.join("../.cargo/config.toml"), root.join("../Cargo.toml")];
    for path in configs.iter().filter(|p| p.exists()) {
        let text = std::fs::read_to_string(path).unwrap();
        for pat in ["+fma", "relaxed-simd", "target-cpu=native", "fast-math", "-Ffast", "+simd128"] {
            if text.contains(pat) {
                offenders.push(format!("{}: {pat}", path.display()));
            }
        }
    }
    if let Ok(flags) = std::env::var("RUSTFLAGS") {
        for pat in ["+fma", "relaxed-simd", "target-cpu=native"] {
            if flags.contains(pat) {
                offenders.push(format!("RUSTFLAGS: {pat}"));
            }
        }
    }
    assert!(offenders.is_empty(), "fused / fast-math float arithmetic in certificate code or build flags:\n{}", offenders.join("\n"));
}
