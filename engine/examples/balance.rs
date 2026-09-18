fn main() {
    let seeds = std::env::args()
        .nth(1)
        .and_then(|x| x.parse().ok())
        .unwrap_or(8);
    let report = meridian_engine::audit::tournament(seeds);
    std::fs::create_dir_all("docs").unwrap();
    std::fs::write(
        "docs/balance-results.json",
        serde_json::to_string_pretty(&report).unwrap(),
    )
    .unwrap();
    println!("Wins: {}", report["wins"]);
    println!("Policies: {}", report["names"]);
    println!(
        "{} completed matches",
        report["games"].as_array().unwrap().len()
    );
}
