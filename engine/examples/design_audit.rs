//! Bounded offline game-design experiments. See docs/DESIGN_AUDIT.md.
#[path = "design_audit/search.rs"]
mod search;
#[path = "design_audit/outcomes.rs"]
mod outcomes;
use meridian_engine::tactics::{Game, SPACE_GOAL};
use search::{act, fresh, mix, search, value, ACTIONS, NAMES};
use serde::Serialize;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[derive(Clone)]
enum Controller {
    Fixed(usize),
    Search(u32),
    FixedRate(usize, u32),
    SearchRate(u32, u32),
    Repeat(usize),
}
impl Controller {
    fn name(&self) -> String {
        match self {
            Self::Fixed(p) => NAMES[*p].into(),
            Self::Search(n) => format!("mcts-{n}"),
            Self::FixedRate(p, s) => format!("{}@{s}s", NAMES[*p]),
            Self::SearchRate(n, s) => format!("mcts-{n}@{s}s"),
            Self::Repeat(p) => format!("{}@8s+repeat", NAMES[*p]),
        }
    }
    fn interval(&self) -> u32 {
        match self {
            Self::FixedRate(_, s) | Self::SearchRate(_, s) => *s,
            _ => 2,
        }
    }
}
#[derive(Default, Serialize)]
struct Stats {
    orders: BTreeMap<String, u32>,
    train_orders: BTreeMap<u8, u32>,
    policy_epochs: BTreeMap<String, u32>,
    searches: u32,
    simulations: u64,
    simulated_ticks: u64,
    invalid_orders: u32,
    decision_opportunities: u32,
    repeat_attempts: u32,
}
#[derive(Serialize)]
struct Match {
    seed: u32,
    controllers: Vec<String>,
    ticks: u32,
    winner: Option<usize>,
    complete: bool,
    stop_reason: String,
    victory: String,
    captures: u32,
    cities_founded: usize,
    stats: Vec<Stats>,
    gold: Vec<f32>,
    mandate: Vec<u16>,
    unit_counts: Vec<usize>,
    wall_ms: u128,
}

fn play(
    seed: u32,
    controllers: &[Controller],
    horizon: u32,
    deadline: Instant,
    snapshots: &mut Vec<Game>,
) -> Match {
    play_until(seed,controllers,horizon,deadline,snapshots,2200)
}

fn play_until(
    seed:u32, controllers:&[Controller], horizon:u32, deadline:Instant,
    snapshots:&mut Vec<Game>, max_ticks:u32,
) -> Match {
    let start = Instant::now();
    let mut g = fresh(seed, controllers.len());
    let mut stats: Vec<_> = controllers.iter().map(|_| Stats::default()).collect();
    let mut policies = vec![0; controllers.len()];
    let mut next_search = vec![0; controllers.len()];
    let mut plans = vec![vec![0; 3]; controllers.len()];
    let intervals: Vec<_> = controllers.iter().map(Controller::interval).collect();
    let mut last_issued: Vec<Option<(String, usize, usize, u8)>> = vec![None; controllers.len()];
    for (p, c) in controllers.iter().enumerate() {
        g.players[p].name = c.name();
    }
    let mut captures = 0;
    let mut previous: Vec<_> = g.cities.iter().map(|c| c.owner).collect();
    let mut stop = "tick_cap";
    'game: while g.winner < 0 && g.tick < max_ticks {
        if Instant::now() >= deadline {
            stop = "deadline";
            break;
        }
        for p in 0..controllers.len() {
            if !g.players[p].alive || (g.tick + p as u32) % intervals[p] != 0 {
                continue;
            }
            stats[p].decision_opportunities += 1;
            match controllers[p] {
                Controller::Fixed(k) | Controller::FixedRate(k, _) | Controller::Repeat(k) => {
                    policies[p] = k
                }
                Controller::Search(budget) | Controller::SearchRate(budget, _)
                    if g.tick >= next_search[p] =>
                {
                    let s = search::search_rates(&g, p, budget, horizon, &intervals, deadline);
                    stats[p].searches += 1;
                    stats[p].simulations += s.completed as u64;
                    stats[p].simulated_ticks += s.simulated_ticks;
                    if s.completed != budget {
                        stop = "deadline_during_search";
                        break 'game;
                    }
                    policies[p] = s.policy;
                    plans[p] = s.plan;
                    next_search[p] = g.tick + horizon;
                    *stats[p]
                        .policy_epochs
                        .entry(NAMES[s.policy].into())
                        .or_default() += 1;
                }
                _ => {}
            }
            if matches!(
                controllers[p],
                Controller::Search(_) | Controller::SearchRate(_, _)
            ) {
                let elapsed = g.tick + horizon - next_search[p];
                policies[p] = plans[p][(elapsed / (horizon / 3)).min(2) as usize];
            }
            g.last_order = None;
            // Always choose the actual order from an observation-filtered state.
            // The existing bot has its own filtering; the audit adds private-field
            // scrubbing before every policy, including fixed-policy opponents.
            let repeating =
                matches!(controllers[p], Controller::Repeat(_)) && (g.tick + p as u32) % 8 != 0;
            let order = if repeating {
                last_issued[p].clone()
            } else {
                let mut observed = search::belief(&g, p, mix(seed ^ g.tick ^ p as u32));
                act(&mut observed, p, policies[p]);
                observed.last_order
            };
            if let Some((kind, from, to, v)) = order {
                if repeating {
                    stats[p].repeat_attempts += 1;
                }
                if g.command(p, &kind, from, to, v).is_ok() {
                    last_issued[p] = Some((kind.clone(), from, to, v));
                    *stats[p].orders.entry(kind.clone()).or_default() += 1;
                    if kind == "train" {
                        *stats[p].train_orders.entry(v).or_default() += 1;
                    }
                } else {
                    stats[p].invalid_orders += 1;
                }
            }
        }
        g.tick_one(false);
        for (i, c) in g.cities.iter().enumerate() {
            if let Some(old) = previous.get_mut(i) {
                if *old != c.owner {
                    captures += 1;
                    *old = c.owner;
                }
            } else {
                previous.push(c.owner);
            }
        }
        if snapshots.is_empty()
            && g.tick == 700
            && !controllers
                .iter()
                .any(|c| matches!(c, Controller::Fixed(8)))
        {
            snapshots.push(g.clone());
        }
    }
    let winner = (g.winner >= 0).then_some(g.winner as usize);
    let victory = winner
        .map(|p| {
            if g.players.iter().filter(|a| a.alive).count() == 1 {
                "elimination"
            } else if g.players[p].launch >= SPACE_GOAL {
                "space"
        } else {
                "unknown"
            }
        })
        .unwrap_or("unfinished");
    Match {
        seed,
        controllers: controllers.iter().map(Controller::name).collect(),
        ticks: g.tick,
        winner,
        complete: winner.is_some(),
        stop_reason: if winner.is_some() { "victory" } else { stop }.into(),
        victory: victory.into(),
        captures,
        cities_founded: g.cities.len().saturating_sub(controllers.len()),
        stats,
        gold: g.players.iter().map(|a| a.gold).collect(),
        mandate: g.players.iter().map(|a| a.mandate).collect(),
        unit_counts: (0..controllers.len())
            .map(|p| g.squads.iter().filter(|u| u.owner == p).count())
            .collect(),
        wall_ms: start.elapsed().as_millis(),
    }
}

fn emit(out: &mut BufWriter<File>, event: serde_json::Value) {
    serde_json::to_writer(&mut *out, &event).unwrap();
    writeln!(out).unwrap();
    out.flush().unwrap();
}
fn paired(
    phase: &str,
    seed: u32,
    a: Controller,
    b: Controller,
    horizon: u32,
    deadline: Instant,
) -> (serde_json::Value, Vec<Game>) {
    let results = std::thread::scope(|scope| {
        let jobs: Vec<_> = [vec![a.clone(), b.clone()], vec![b.clone(), a.clone()]]
            .into_iter()
            .map(|controllers| {
                scope.spawn(move || {
                    let mut snapshots = vec![];
                    let m = play(seed, &controllers, horizon, deadline, &mut snapshots);
                    (m, snapshots)
                })
            })
            .collect();
        jobs.into_iter()
            .map(|j| j.join().unwrap())
            .collect::<Vec<_>>()
    });
    let (matches, snapshots): (Vec<_>, Vec<_>) = results.into_iter().unzip();
    let complete = matches.len() == 2 && matches.iter().all(|m| m.complete);
    (
        json!({"type":"pair", "phase":phase, "a":a.name(), "b":b.name(),
        "seed":seed, "complete":complete, "matches":matches}),
        snapshots.into_iter().flatten().collect(),
    )
}

fn batch(
    out: &mut BufWriter<File>,
    phase: &str,
    jobs: Vec<(u32, Controller, Controller)>,
    horizon: u32,
    deadline: Instant,
    snapshots: &mut Vec<Game>,
) {
    let results = std::thread::scope(|scope| {
        let handles: Vec<_> = jobs
            .into_iter()
            .map(|(seed, a, b)| {
                scope.spawn(move || {
                    let phase = if matches!(a, Controller::SearchRate(_, _)) {
                        "apm_thinking"
                    } else if matches!(a, Controller::Repeat(_)) {
                        "apm_repeat"
                    } else {
                        phase
                    };
                    paired(phase, seed, a, b, horizon, deadline)
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>()
    });
    // Reaching the diagnostic tick cap completes an experiment, not a match.
    // Count other finished pairs in its batch; report the capped game as a stall.
    let batch_complete = results.iter().all(|(e, _)| e["matches"].as_array().is_some_and(|ms|
        ms.len()==2 && ms.iter().all(|m| !m["stop_reason"].as_str().unwrap_or("").starts_with("deadline"))));
    for (mut event, states) in results {
        event["batch_complete"] = json!(batch_complete);
        if phase == "meta" {
            snapshots.extend(
                states
                    .into_iter()
                    .take(6usize.saturating_sub(snapshots.len())),
            );
        }
        emit(out, event);
    }
}

fn main() {
    // Invoked by scripts/design-audit.mjs after compilation.
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).is_some_and(|s|s=="--outcomes") {outcomes::run(&args);return;}
    let seconds: f64 = args.get(1).expect("seconds").parse().unwrap();
    let seed: u32 = args.get(2).expect("seed").parse().unwrap();
    let dir = PathBuf::from(args.get(3).expect("output directory"));
    let budgets: Vec<u32> = args
        .get(4)
        .expect("budgets")
        .split(',')
        .map(|s| s.parse().unwrap())
        .collect();
    let horizon: u32 = args.get(5).expect("horizon").parse().unwrap();
    let workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2)
        .div_ceil(2)
        .min(8);
    assert!(seconds.is_finite() && seconds > 0. && horizon >= 6 && horizon % 6 == 0);
    assert!(
        budgets.len() >= 2
            && budgets
                .windows(2)
                .all(|b| b[0] >= ACTIONS as u32 && b[0] < b[1])
    );
    fs::create_dir_all(&dir).unwrap();
    let mut out = BufWriter::new(File::create(dir.join("events.jsonl")).unwrap());
    let start = Instant::now();
    let deadline = |fraction: f64| start + Duration::from_secs_f64(seconds * fraction);
    emit(
        &mut out,
        json!({"type":"config", "schema_version":3, "ruleset":"three-eras-conquest-space", "order_interval":meridian_engine::tactics::ORDER_INTERVAL, "researchable_units":meridian_engine::tactics::roster::technologies().collect::<Vec<_>>(), "name":"Meridian Strategy Audit", "seed":seed, "seconds":seconds,
        "budgets":budgets, "horizon":horizon, "policy_interval_seconds":horizon/3,
        "replan_seconds":horizon,"parallel_pairs":workers,"policies":NAMES,
        "search":"open-loop portfolio UCT; independent hidden-state priors; no learned network",
        "phase_fractions":{"meta":0.20,"compute_and_input_thinking":0.50,"probes":0.10,"input_frequency":0.10,"multiplayer":0.10}}),
    );
    let mut snapshots = vec![];
    // Round-robin fixture order, interleaving every strategy before repeating.
    // Include idle as a negative control but exclude it from meta diversity claims.
    let mut ring: Vec<_> = (0..10).collect(); // 9 policies + bye
    let mut fixtures = vec![];
    for _ in 0..9 {
        for i in 0..5 {
            let (a, b) = (ring[i], ring[9 - i]);
            if a < NAMES.len() && b < NAMES.len() {
                fixtures.push((a, b));
            }
        }
        ring[1..].rotate_right(1);
    }
    eprintln!("Meridian Strategy Audit: strategy tournament (20% of budget)");
    let mut index = 0;
    while Instant::now() < deadline(0.20) {
        let jobs = (0..workers)
            .map(|_| {
                let (a, b) = fixtures[index % fixtures.len()];
                let round = index / fixtures.len();
                index += 1;
                (
                    seed.wrapping_add(round as u32),
                    Controller::Fixed(a),
                    Controller::Fixed(b),
                )
            })
            .collect();
        batch(
            &mut out,
            "meta",
            jobs,
            horizon,
            deadline(0.20),
            &mut snapshots,
        );
    }
    eprintln!("Meridian Strategy Audit: compute ladder and fast/shallow vs slow/deeper play (50%)");
    index = 0;
    while Instant::now() < deadline(0.70) {
        let jobs = (0..workers)
            .map(|_| {
                let pair = &budgets[(index / 2) % (budgets.len() - 1)..][..2];
                let round = (index / 2) / (budgets.len() - 1);
                let input_test = index % 2 == 1;
                index += 1;
                if input_test {
                    (
                        seed.wrapping_add(10000 + round as u32),
                        Controller::SearchRate(pair[0], 2),
                        Controller::SearchRate(pair[1], 8),
                    )
                } else {
                    (
                        seed.wrapping_add(10000 + round as u32),
                        Controller::Search(pair[1]),
                        Controller::Search(pair[0]),
                    )
                }
            })
            .collect();
        batch(
            &mut out,
            "compute",
            jobs,
            horizon,
            deadline(0.70),
            &mut vec![],
        );
    }
    eprintln!("Meridian Strategy Audit: decision consequences (10%)");
    let probe_results = std::thread::scope(|scope| {
        let handles:Vec<_>=snapshots.iter().enumerate().map(|(i,g)| {
        let budgets=&budgets;
        let dir=&dir;
        scope.spawn(move || {
        let p = (0..g.players.len()).find(|&p| g.players[p].alive).unwrap();
        let path = dir.join(format!("position-{i}.json"));
        fs::write(&path, serde_json::to_vec(g).unwrap()).unwrap();
        let mut recommendations = vec![];
        for &h in &[horizon, horizon * 2] {
            for &budget in budgets {
                recommendations
                    .push(json!({"horizon":h,"result":search(g,p,budget,h,deadline(0.80))}));
            }
        }
        // Referee-only counterfactuals: same actual hidden world, same opponents,
        // policy held for one decision interval, then all branches revert to adaptive.
        // Report heuristic differences separately from terminal outcomes.
        let mut branches = vec![];
        'branches: for opponent in [0, 1, 7] {
            for policy in 0..ACTIONS {
                let mut b = g.clone();
                let mut policies = vec![opponent; g.players.len()];
                policies[p] = policy;
                if !search::advance(&mut b, &policies, horizon / 3, deadline(0.80)) {
                    break 'branches;
                }
                let immediate = value(&b, p);
                policies[p] = 0;
                if !search::advance(&mut b, &policies, 240, deadline(0.80)) {
                    break 'branches;
                }
                branches.push(json!({"policy":NAMES[policy],"opponent":NAMES[opponent],
                    "immediate_value":immediate,"later_value":value(&b,p),"winner":b.winner,
                    "launch":b.players[p].launch,"cities":b.cities.iter().filter(|c|c.owner==p).count()}));
            }
        }
        let complete = branches.len() == ACTIONS * 3
            && recommendations
                .iter()
                .all(|r| r["result"]["completed"] == r["result"]["requested"]);
            json!({"type":"probe","seed":g.seed,"tick":g.tick,"player":p,
            "snapshot":format!("position-{i}.json"),"complete":complete,
            "source_controllers":g.players.iter().map(|p|p.name.clone()).collect::<Vec<_>>(),
            "recommendations":recommendations,"branches":branches})
        })
      }).collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>()
    });
    for e in probe_results {
        emit(&mut out, e);
    }
    eprintln!("Meridian Strategy Audit: input-frequency and repeated-command stress tests (10%)");
    index = 0;
    while Instant::now() < deadline(0.90) {
        let jobs = (0..workers)
            .map(|_| {
                let policy = (index / 2) % ACTIONS;
                let repeat = index % 2 == 1;
                let game_seed = seed.wrapping_add(30000 + (index / 2) as u32);
                index += 1;
                (
                    game_seed,
                    if repeat {
                        Controller::Repeat(policy)
                    } else {
                        Controller::FixedRate(policy, 2)
                    },
                    Controller::FixedRate(policy, 8),
                )
            })
            .collect();
        batch(
            &mut out,
            "apm_frequency",
            jobs,
            horizon,
            deadline(0.90),
            &mut vec![],
        );
    }
    eprintln!("Meridian Strategy Audit: eight-player sanity tournament (remaining budget)");
    let mut rotation = 0;
    while Instant::now() < deadline(1.) {
        let results = std::thread::scope(|scope| {
            let jobs: Vec<_> = (rotation..rotation + workers * 2)
                .map(|rotation| {
                    scope.spawn(move || {
                        let controllers: Vec<_> = (0..8)
                            .map(|p| Controller::Fixed((p + rotation) % 8))
                            .collect();
                        let m = play(
                            seed.wrapping_add(20000 + (rotation / 8) as u32),
                            &controllers,
                            horizon,
                            deadline(1.),
                            &mut vec![],
                        );
                        json!({"type":"multiplayer","rotation":rotation,"match":m})
                    })
                })
                .collect();
            jobs.into_iter()
                .map(|j| j.join().unwrap())
                .collect::<Vec<_>>()
        });
        for e in results {
            emit(&mut out, e);
        }
        rotation += workers * 2;
    }
    emit(
        &mut out,
        json!({"type":"end","elapsed_seconds":start.elapsed().as_secs_f64()}),
    );
}

#[cfg(test)]
mod input_tests {
    use super::*;
    #[test]
    fn restrained_and_repeated_input_obey_real_order_limits() {
        let m = play(
            9001,
            &[Controller::FixedRate(0, 8), Controller::Repeat(0)],
            120,
            Instant::now() + Duration::from_secs(10),
            &mut vec![],
        );
        assert!(m.complete || m.stop_reason == "tick_cap");
        assert!(m.stats[0].decision_opportunities <= m.ticks.div_ceil(8));
        assert!(m.stats[1].decision_opportunities <= m.ticks.div_ceil(2));
        assert!(m.stats[1].repeat_attempts > 0);
        for s in &m.stats {
            assert!(s.orders.values().sum::<u32>() <= s.decision_opportunities);
        }
    }
}
