//! Offline research controller. Never linked into the production WASM bot.
//! Open-loop, policy-portfolio UCT with sampled hidden states (not full ISMCTS).
use meridian_engine::tactics::{spec, Game, Unit};
use serde::Serialize;
use std::time::Instant;

pub const NAMES: [&str; 9] = [
    "adaptive",
    "guards",
    "cavalry",
    "archers",
    "artillery",
    "naval",
    "space",
    "expansion",
    "idle",
];
pub const ACTIONS: usize = 8; // Idle is a negative control, never a search action.

pub fn mix(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^ (x >> 16)
}

/// The existing seven policies share tactical code. Expansion is an additional
/// economic stress policy, not a claim to cover all strategically distinct play.
pub fn act(g: &mut Game, p: usize, policy: usize) {
    if !g.players[p].alive || g.players[p].cooldown > g.tick || policy == 8 {
        return;
    }
    // The native expansion policy now has its own four-city target and full
    // research/transport support. Endless extra settlers would starve its goals.
    // The guards portfolio exercises explicit per-unit robot control.
    if policy == 1 {
        if let Some(u) = g.squads.iter().find(|u|u.owner==p && !u.automated && spec(u.kind).damage>0.) {
            let id=u.id; let _=g.command(p,"auto",id,0,1); return;
        }
    }
    g.bot_policy(p, policy as u8);
}

pub fn fresh(seed: u32, players: usize) -> Game {
    let mut g = Game::with_players(seed, players, 2);
    g.cache_distances();
    // A separate reproducible discovery seed; planning never reads its rewards.
    g.seed_discoveries(mix(seed ^ 0xa721d4b3));
    for p in &mut g.players {
        p.bot = false;
    }
    g
}

fn unit(id: usize, owner: usize, kind: u8, tile: usize) -> Unit {
    Unit {
        automated: false,
        facing:None,
        id,
        owner,
        kind,
        tile,
        hp: spec(kind).hp,
        to: tile,
        path: vec![tile],
        left: 0,
        total: 0,
        ready: 0,
        moved: 0,
        hurt: 0,
        ability_ready: 0,
        mode: 0,
        effect_until: 0,
        revealed: 0,
        work: 0,
        founding: false,
        refit: -1,
        locked_until: 0,
        fire_at: 0,
        aim: tile,
        focus: None,
        salvo: 0,
        boarded_on: None,
    }
}

/// Independent prior, not access to the referee's hidden state. No learned
/// belief/memory yet: unknown cities and undiscovered chests are omitted.
pub fn belief(g: &Game, p: usize, sample: u32) -> Game {
    let v = g.vision(p);
    let mut b = g.clone();
    b.events.clear();
    b.feedback.clear();
    b.next_feedback = 0;
    b.last_order = None;
    b.squads.retain(|u| g.detected(p, u, &v));
    for u in &mut b.squads {
        if u.owner != p {
            // Match the client view: no hidden queued orders or weapon intent.
            u.to = u.tile;
            u.path = vec![u.tile];
            u.left = 0;
            u.total = 0;
            u.ability_ready = 0;
            u.ready = 0;
            u.focus = None;
            u.aim = u.tile;
            u.fire_at = 0;
            u.salvo = 0;
        }
    }
    b.next_unit = b.squads.iter().map(|u| u.id).max().unwrap_or(0) + 1;
    b.cities
        .retain(|c| c.owner == p || c.capital >= 0 || v[c.tile]);
    for c in &mut b.cities {
        if c.owner != p {
            c.training = -1;
            c.left = 0;
            c.total = 0;
            if !v[c.tile] {
                c.production = 1;
                c.radius = 1;
                c.capture = 0;
                c.claimant = -1;
                c.disabled_until = 0;
            }
        }
    }
    for (i, t) in b.tiles.iter_mut().enumerate() {
        if !v[i] {
            t.owner = -1;
            t.building = 0;
        }
    }
    b.discoveries
        .retain(|d| v[d.tile] || d.seen & (1 << p) != 0);
    for d in &mut b.discoveries {
        if !v[d.tile] {
            d.used = d.known_used & (1 << p) != 0;
        }
        // Preserve only this player's active, already collected effects.
        if !(d.used && d.owner == p as i8) {
            d.kind = 1;
            d.variant = mix(sample ^ d.tile as u32);
            d.owner = -1;
            d.until = 0;
        }
        d.seen &= 1 << p;
        d.known_used &= 1 << p;
    }
    b.strikes.retain(|s| s.owner == p || v[s.to]);
    for s in &mut b.strikes {
        if s.owner != p && !v[s.from] {
            s.from = s.to;
        }
    }
    for q in 0..b.players.len() {
        b.players[q].bot = false;
        if q == p {
            continue;
        }
        let r = mix(sample ^ (q as u32).wrapping_mul(104729));
        let observed: Vec<_> = b
            .squads
            .iter()
            .filter(|u| u.owner == q)
            .map(|u| u.kind)
            .collect();
        let a = &mut b.players[q];
        a.gold = 60. + (r % 201) as f32;
        a.cooldown = 0;
        a.research = -1;
        a.research_left = 0;
        a.research_queue.clear();
        a.launch_tile = None;
        a.unlocked = vec![0, 12, 13];
        if b.tick > 180 {
            a.unlocked.extend([1, 2]);
        }
        if b.tick > 600 {
            a.unlocked.extend([3, 4, 7]);
        }
        a.unlocked.extend(observed);
        a.unlocked.sort_unstable();
        a.unlocked.dedup();
        if !a.alive {
            continue;
        }
        let origins: Vec<_> = b
            .cities
            .iter()
            .filter(|c| c.owner == q)
            .map(|c| c.tile)
            .collect();
        for origin in origins {
            let tiles: Vec<_> = std::iter::once(origin)
                .chain(b.tiles[origin].near.iter().copied())
                .collect();
            for tile in tiles
                .into_iter()
                .filter(|&t| !v[t])
                .take((r % 3 + 1) as usize)
            {
                if b.tiles[tile].terrain > 0 && b.occupant(tile).is_none() {
                    let kind = if b.tick > 180 { (r % 3) as u8 } else { 0 };
                    if b.can_enter(kind, tile) {
                        b.squads.push(unit(b.next_unit, q, kind, tile));
                        b.next_unit += 1;
                    }
                }
            }
        }
    }
    b
}

/// Explicit heuristic, not a calibrated win probability. Terminal wins dominate.
pub fn value(g: &Game, p: usize) -> f64 {
    if g.winner >= 0 {
        return if g.winner as usize == p { 1. } else { 0. };
    }
    if !g.players[p].alive {
        return 0.;
    }
    let strength = |q: usize| {
        let a = &g.players[q];
        if !a.alive {
            return 0.;
        }
        let cities: f64 = g
            .cities
            .iter()
            .filter(|c| c.owner == q)
            .map(|c| {
                100. + c.production as f64 * 25.
                    + c.radius as f64 * 5.
                    + if c.training >= 0 {
                        spec(c.training as u8).cost as f64 * 0.3
                    } else {
                        0.
                    }
            })
            .sum();
        let army: f64 = g
            .squads
            .iter()
            .filter(|u| u.owner == q)
            .map(|u| spec(u.kind).cost as f64 * (u.hp / spec(u.kind).hp) as f64 * 0.45)
            .sum();
        cities
            + army
            + a.gold.min(500.) as f64 * 0.12
            + a.unlocked.len() as f64 * 8.
            + a.launch as f64 * 1.8
    };
    let own = strength(p);
    let other = (0..g.players.len())
        .filter(|&q| q != p)
        .map(strength)
        .fold(0., f64::max);
    (0.5 + (own - other) / (own + other + 1.) * 0.45).clamp(0., 1.)
}

/// Execute the real rules and the same two-second order opportunities.
pub fn advance(g: &mut Game, policies: &[usize], seconds: u32, deadline: Instant) -> bool {
    let intervals = vec![2; policies.len()];
    advance_rates(g, policies, &intervals, seconds, deadline)
}
fn advance_rates(
    g: &mut Game,
    policies: &[usize],
    intervals: &[u32],
    seconds: u32,
    deadline: Instant,
) -> bool {
    for _ in 0..seconds {
        if Instant::now() >= deadline {
            return false;
        }
        if g.winner >= 0 {
            break;
        }
        for (p, &policy) in policies.iter().enumerate() {
            if (g.tick + p as u32) % intervals[p] == 0 {
                act(g, p, policy);
            }
        }
        g.tick_one(false);
    }
    true
}

#[derive(Default)]
struct Node {
    visits: u32,
    sum: f64,
    children: Vec<(usize, usize)>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Edge {
    pub policy: usize,
    pub visits: u32,
    pub value: f64,
}
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Search {
    pub policy: usize,
    pub requested: u32,
    pub completed: u32,
    pub simulated_ticks: u64,
    pub edges: Vec<Edge>,
    pub plan: Vec<usize>,
}

/// UCT over policy sequences. All budgets use identical action ordering, priors,
/// evaluator, opponent distribution, horizon and tactical controller.
pub fn search(g: &Game, p: usize, budget: u32, horizon: u32, deadline: Instant) -> Search {
    search_rates(g, p, budget, horizon, &vec![2; g.players.len()], deadline)
}
pub fn search_rates(
    g: &Game,
    p: usize,
    budget: u32,
    horizon: u32,
    intervals: &[u32],
    deadline: Instant,
) -> Search {
    let mut nodes = vec![Node::default()];
    let mut completed = 0;
    let mut simulated_ticks = 0;
    let salt = mix(g.seed ^ g.tick.wrapping_mul(7919) ^ p as u32);
    let offset = salt as usize % ACTIONS;
    for sim in 0..budget {
        if Instant::now() >= deadline {
            break;
        }
        let mut b = belief(g, p, mix(salt ^ sim));
        let mut policies: Vec<_> = (0..g.players.len())
            .map(|q| mix(salt ^ sim ^ (q as u32).wrapping_mul(104729)) as usize % ACTIONS)
            .collect();
        let mut path = vec![0];
        let mut node = 0;
        let mut ok = true;
        // Three decision layers; each edge commits a policy for a third of the horizon.
        for depth in 0..3 {
            if b.winner >= 0 {
                break;
            }
            let (action, child) = if nodes[node].children.len() < ACTIONS {
                let action = (nodes[node].children.len() + offset + depth) % ACTIONS;
                let child = nodes.len();
                nodes.push(Node::default());
                nodes[node].children.push((action, child));
                (action, child)
            } else {
                let log_n = (nodes[node].visits.max(1) as f64).ln();
                *nodes[node]
                    .children
                    .iter()
                    .max_by(|a, b| {
                        let ucb = |&(_, c): &(usize, usize)| {
                            let n = &nodes[c];
                            n.sum / n.visits.max(1) as f64
                                + 0.7 * (log_n / n.visits.max(1) as f64).sqrt()
                        };
                        ucb(a).total_cmp(&ucb(b))
                    })
                    .unwrap()
            };
            policies[p] = action;
            let before = b.tick;
            ok = advance_rates(
                &mut b,
                &policies,
                intervals,
                horizon / 3 + u32::from(depth < horizon as usize % 3),
                deadline,
            );
            simulated_ticks += (b.tick - before) as u64;
            node = child;
            path.push(node);
            if !ok {
                break;
            }
        }
        if !ok {
            break;
        }
        let reward = value(&b, p);
        for n in path {
            nodes[n].visits += 1;
            nodes[n].sum += reward;
        }
        completed += 1;
    }
    let edges: Vec<_> = nodes[0]
        .children
        .iter()
        .filter(|(_, c)| nodes[*c].visits > 0)
        .map(|&(policy, c)| Edge {
            policy,
            visits: nodes[c].visits,
            value: nodes[c].sum / nodes[c].visits as f64,
        })
        .collect();
    let policy = edges
        .iter()
        .max_by(|a, b| {
            a.visits
                .cmp(&b.visits)
                .then_with(|| a.value.total_cmp(&b.value))
        })
        .map(|e| e.policy)
        .unwrap_or(0);
    let mut plan = vec![];
    let mut n = 0;
    for _ in 0..3 {
        if let Some(&(action, child)) = nodes[n]
            .children
            .iter()
            .filter(|(_, c)| nodes[*c].visits > 0)
            .max_by(|(_, a), (_, b)| {
                nodes[*a].visits.cmp(&nodes[*b].visits).then_with(|| {
                    (nodes[*a].sum / nodes[*a].visits as f64)
                        .total_cmp(&(nodes[*b].sum / nodes[*b].visits as f64))
                })
            })
        {
            plan.push(action);
            n = child;
        } else {
            plan.push(*plan.last().unwrap_or(&policy));
        }
    }
    Search {
        policy,
        requested: budget,
        completed,
        simulated_ticks,
        edges,
        plan,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn budget_and_deadline_are_real_limits() {
        let g = fresh(9001, 2);
        let deadline = Instant::now() + Duration::from_secs(30);
        let s = search(&g, 0, 16, 6, deadline);
        assert_eq!(s.completed, 16);
        assert_eq!(s.edges.iter().map(|e| e.visits).sum::<u32>(), 16);
        assert!(s.simulated_ticks <= 96);
        let s = search(&g, 0, 16, 6, Instant::now());
        assert_eq!(s.completed, 0);
    }
    #[test]
    fn search_does_not_read_hidden_armies_economy_or_orders() {
        let a = fresh(9001, 2);
        let mut b = a.clone();
        let v = a.vision(0);
        b.squads.retain(|u| u.owner == 0 || v[u.tile]);
        b.players[1].gold = 99999.;
        b.players[1].unlocked = (0..14).collect();
        b.players[1].research = 11;
        b.players[1].research_left = 1;
        b.next_unit += 500;
        for d in &mut b.discoveries {
            d.kind = 9;
            d.variant = 555;
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        assert_eq!(
            search(&a, 0, 16, 6, deadline),
            search(&b, 0, 16, 6, deadline)
        );
    }
    #[test]
    fn terminal_outcomes_override_material() {
        let mut g = fresh(9001, 2);
        g.winner = 1;
        g.players[0].gold = 1e9;
        assert_eq!(value(&g, 0), 0.);
        assert_eq!(value(&g, 1), 1.);
    }
}
