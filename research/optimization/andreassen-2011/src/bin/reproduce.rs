use topopt_andreassen_2011::{Config, Optimizer};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ft = std::env::args().nth(1).unwrap_or("1".into()).parse()?;
    let mut opt = Optimizer::new(Config {
        ft,
        ..Config::default()
    })?;
    let mut frames = Vec::new();
    while !opt.finished() {
        frames.push(opt.step()?);
    }
    println!("{}", serde_json::to_string(&frames)?);
    Ok(())
}
