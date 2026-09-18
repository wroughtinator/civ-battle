//! Bounded, deterministic beam search over a player's observation, never the full server state.
//! This is a practical planning agent, not an assertion of optimal play in an eight-player game.
use super::*;

pub const DECISION_INTERVAL: u32 = 12;
const BRANCHES: usize = 10;
const FORECAST_STEP: u32 = 12;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Action {
    pub kind: &'static str,
    pub from: usize,
    pub to: usize,
    pub value: u8,
}
impl Action {
    fn new(kind: &'static str, from: usize, to: usize, value: u8) -> Self {
        Self {
            kind,
            from,
            to,
            value,
        }
    }
    pub fn apply(&self, g: &mut Game, p: usize) -> bool {
        self.kind == "wait"
            || g.command(p, self.kind, self.from, self.to, self.value)
                .is_ok()
    }
}
#[derive(Debug, Serialize)]
pub struct Plan {
    pub action: Action,
    pub nodes: usize,
    pub depth: u8,
    pub horizon: u32,
    pub value: f32,
}

/// Reconstruct a deliberately conservative belief from exactly the information a client gets.
/// Unknown garrisons, economies, research and orders are estimates, not privileged observations.
pub fn observation(g: &Game, p: usize) -> Game {
    let seen: Vec<_> = (0..g.tiles.len()).map(|i| g.visible(p, i)).collect();
    let mut b = g.clone();
    let era = if g.tick >= 900 {
        3
    } else if g.tick >= 400 {
        2
    } else if g.tick >= 150 {
        1
    } else {
        0
    };
    for (i, t) in b.tiles.iter_mut().enumerate() {
        if !seen[i] {
            let beacon = t.building == 6;
            if !beacon {
                if !t.site {
                    t.owner = t.capital;
                }
                t.building = 0;
            }
            t.army = if t.capital >= 0 {
                45. + era as f32 * 12.
            } else {
                16.
            };
            t.work = 0;
            t.next = 0;
            t.unrest = 0;
            t.suppression = 0;
        } else if t.owner != p as i8 {
            t.army = t.army.floor();
        }
    }
    for (i, x) in b.players.iter_mut().enumerate() {
        x.bot = false;
        if i == p {
            continue;
        }
        x.gold = 160.;
        x.food = 120.;
        x.science = 80.;
        x.industry = 60.;
        x.orders = 3.;
        x.tech = [era, era, era];
        x.research = -1;
        x.research_left = 0;
        x.cooldown = 0;
        x.satellite = 0;
        x.strike_ready = 0;
        x.doctrine = -1;
        x.doctrine_next = -1;
        x.doctrine_left = 0;
    }
    b.squads = g
        .squads
        .iter()
        .filter(|s| g.squad_visible(p, s))
        .cloned()
        .map(|mut s| {
            if s.owner != p {
                s.to = s.tile;
                s.path = vec![s.tile];
                s.left = 0;
                s.total = 0;
                s.ready = 0;
            }
            s
        })
        .collect();
    b.next_squad = b.squads.iter().map(|s| s.id + 1).max().unwrap_or(0);
    b.marches = g
        .marches
        .iter()
        .filter_map(|m| {
            if m.owner == p {
                return Some(m.clone());
            }
            let step = ((1. - m.left as f32 / m.total.max(1) as f32) * (m.path.len() - 1) as f32)
                .floor() as usize;
            let at = m.path[step.min(m.path.len() - 1)];
            if !seen[at] {
                return None;
            }
            let mut m = m.clone();
            m.from = at;
            m.to = at;
            m.path = vec![at];
            m.left = 1;
            m.total = 1;
            Some(m)
        })
        .collect();
    b.strikes = g
        .strikes
        .iter()
        .filter(|s| s.owner == p || s.kind == 2 || seen[s.to])
        .cloned()
        .map(|mut s| {
            if s.owner != p && !seen[s.from] {
                s.from = s.to;
            }
            s
        })
        .collect();
    b.events.clear();
    // Equipment is evidence of prerequisites, not permission to inspect secret research.
    for s in &b.squads {
        if s.owner == p {
            continue;
        }
        let known = match s.kind {
            0 => [2, 3, 0],
            1 => [0, 0, 2],
            2 => [3, 0, 2],
            _ => [3, 2, 0],
        };
        for branch in 0..3 {
            b.players[s.owner].tech[branch] = b.players[s.owner].tech[branch].max(known[branch]);
        }
    }
    for s in &b.strikes {
        if s.owner == p {
            continue;
        }
        let known = match s.kind {
            0 => [2, 3, 0],
            1 => [3, 2, 0],
            _ => [4, 4, 0],
        };
        for branch in 0..3 {
            b.players[s.owner].tech[branch] = b.players[s.owner].tech[branch].max(known[branch]);
        }
    }
    for t in b
        .tiles
        .iter()
        .filter(|t| t.building == 6 && t.owner >= 0 && t.owner != p as i8)
    {
        b.players[t.owner as usize].tech[1] = 4;
        b.players[t.owner as usize].tech[2] = b.players[t.owner as usize].tech[2].max(2);
    }
    b
}

fn defense(g: &Game, i: usize, war: u8) -> f32 {
    let t = &g.tiles[i];
    (if t.suppression > 0 { 0.7 } else { 1. })
        * t.army
        * (1.
            + if t.owner >= 0 {
                g.players[t.owner as usize].tech[0] as f32 * 0.12
            } else {
                0.
            }
            + if t.building == 4 {
                if war >= 3 {
                    0.35
                } else {
                    0.7
                }
            } else {
                0.
            }
            + if t.capital >= 0 { 0.25 } else { 0. }
            + if t.terrain == 4 {
                0.4
            } else if t.terrain == 2 {
                0.16
            } else {
                0.
            })
}

/// Candidate pruning is shared at every depth. Search changes the sequence, not the rules.
fn candidates(g: &Game, p: usize) -> Vec<Action> {
    let mut out = vec![];
    let x = &g.players[p];
    if !x.alive || x.orders < 1. || x.cooldown > g.tick {
        return vec![Action::new("wait", 0, 0, 0)];
    }
    let own: Vec<_> = g
        .tiles
        .iter()
        .enumerate()
        .filter(|(_, t)| t.owner == p as i8)
        .map(|(i, _)| i)
        .collect();
    if own.is_empty() {
        return vec![Action::new("wait", 0, 0, 0)];
    }
    let seen: Vec<_> = (0..g.tiles.len()).map(|i| g.visible(p, i)).collect();
    let mut counts = [0usize; 8];
    for &i in &own {
        counts[if g.tiles[i].work > 0 {
            g.tiles[i].next
        } else {
            g.tiles[i].building
        } as usize] += 1;
    }
    let mut add =
        |score: f32, kind, from, to, value| out.push((score, Action::new(kind, from, to, value)));
    for branch in 0..3 {
        add(
            70. - x.tech[branch] as f32 * 2.,
            "research",
            0,
            0,
            branch as u8,
        );
    }
    for d in 0..3 {
        add(if x.doctrine < 0 { 80. } else { 12. }, "doctrine", 0, 0, d);
    }
    let base = *own
        .iter()
        .max_by(|&&a, &&b| g.tiles[a].army.total_cmp(&g.tiles[b].army))
        .unwrap();
    let launch_base = *own
        .iter()
        .max_by_key(|&&i| {
            let t = &g.tiles[i];
            (t.army as i32)
                + t.near
                    .iter()
                    .filter(|&&j| g.tiles[j].owner == p as i8 && g.tiles[j].building == 4)
                    .count() as i32
                    * 60
                - t.near
                    .iter()
                    .filter(|&&j| g.tiles[j].owner >= 0 && g.tiles[j].owner != p as i8)
                    .count() as i32
                    * 100
        })
        .unwrap();
    add(150., "build", launch_base, 0, 6);
    let empty = own
        .iter()
        .copied()
        .filter(|&i| g.tiles[i].work == 0 && g.tiles[i].building == 0)
        .max_by(|&a, &b| g.tiles[a].army.total_cmp(&g.tiles[b].army));
    if let Some(i) = empty {
        add(
            if x.food < 100. {
                95.
            } else {
                22. - counts[1] as f32 * 8.
            },
            "build",
            i,
            0,
            1,
        );
        add(40. - counts[2] as f32 * 6., "build", i, 0, 2);
        add(65. - counts[3] as f32 * 10., "build", i, 0, 3);
        add(
            (if (x.tech[1] >= 3 || x.tech[2] >= 2) && x.industry < 160. {
                58.
            } else {
                -20.
            }) - counts[7] as f32 * 8.,
            "build",
            i,
            0,
            7,
        );
    }
    if let Some(i) = own.iter().copied().find(|&i| {
        g.tiles[i].work == 0
            && g.tiles[i].building == 0
            && g.tiles[i].near.iter().any(|&j| g.tiles[j].terrain == 0)
    }) {
        if counts[5] == 0 {
            add(32., "build", i, 0, 5);
        }
    }
    if let Some(i) = own.iter().copied().find(|&i| {
        g.tiles[i].work == 0
            && (g.tiles[i].site || g.tiles[i].terrain == 4)
            && g.tiles[i].building != 7
    }) {
        add(
            if (x.tech[1] >= 3 || x.tech[2] >= 2) && x.industry < 160. {
                65.
            } else {
                -20.
            },
            "build",
            i,
            0,
            7,
        );
    }
    let mut sources = own.clone();
    sources.sort_by(|&a, &b| g.tiles[b].army.total_cmp(&g.tiles[a].army));
    sources.truncate(5);
    let mut moves = vec![];
    for &from in &sources {
        if g.tiles[from].army < 8. {
            continue;
        }
        let mut targets: Vec<_> = g
            .tiles
            .iter()
            .enumerate()
            .filter(|(i, t)| {
                t.terrain > 0
                    && *i != from
                    && (seen[*i] || t.site)
                    && (t.owner != p as i8
                        || t.capital >= 0
                        || t.site
                        || t.near.iter().any(|&j| {
                            seen[j] && g.tiles[j].owner >= 0 && g.tiles[j].owner != p as i8
                        }))
            })
            .map(|(i, t)| (i, dot(g.tiles[from].p, t.p)))
            .collect();
        targets.sort_by(|a, b| b.1.total_cmp(&a.1));
        targets.truncate(14);
        for (i, t) in g
            .tiles
            .iter()
            .enumerate()
            .filter(|(i, t)| t.owner != p as i8 && (t.site || seen[*i] && t.capital >= 0))
        {
            if !targets.iter().any(|&(j, _)| j == i) {
                targets.push((i, dot(g.tiles[from].p, t.p)));
            }
        }
        for (to, _) in targets {
            if let Some(path) = g.path(p, from, to) {
                let t = &g.tiles[to];
                let hostile = t.owner != p as i8;
                let atk = g.tiles[from].army * 0.8 * (1. + x.tech[0] as f32 * 0.16);
                // Do not spend the entire beam on unwinnable hub assaults. A strike
                // or reinforcement can make this attack a candidate in the next state.
                if hostile && atk < defense(g, to, x.tech[0]) * 1.08 {
                    continue;
                }
                let value = if hostile {
                    32. + if t.capital >= 0 { 55. } else { 0. }
                        + if t.building == 6 { 110. } else { 0. }
                        + if t.site { 85. } else { 0. }
                        + (atk - defense(g, to, x.tech[0])).clamp(-100., 30.)
                } else {
                    18. + if t.capital >= 0 { 16. } else { 0. } - t.army * 0.25
                };
                moves.push((value - path.len() as f32 * 2., from, to));
            }
        }
    }
    moves.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut destinations = vec![];
    for (score, from, to) in moves {
        if destinations.contains(&to) {
            continue;
        }
        destinations.push(to);
        if destinations.len() > 4 {
            break;
        }
        add(score, "march", from, to, 1);
        add(score - 1., "march", from, to, 0);
    }
    for &i in &own {
        let t = &g.tiles[i];
        if t.capital >= 0
            || t.site
            || x.tech[1] >= 3 && g.tiles[launch_base].near.contains(&i)
            || t.near
                .iter()
                .any(|&j| seen[j] && g.tiles[j].owner >= 0 && g.tiles[j].owner != p as i8)
        {
            add(
                60. + if t.capital >= 0 { 25. } else { 0. },
                "build",
                i,
                0,
                4,
            );
        }
    }
    for kind in 0..4 {
        let from = if kind == 1 || kind == 2 {
            own.iter()
                .copied()
                .find(|&i| g.tiles[i].building == 5)
                .unwrap_or(base)
        } else {
            base
        };
        add(25., "train", from, 0, kind);
    }
    let mut threats: Vec<_> = g
        .tiles
        .iter()
        .enumerate()
        .filter(|(i, t)| {
            t.owner >= 0 && t.owner != p as i8 && (seen[*i] || t.building == 6 || t.site)
        })
        .map(|(i, t)| {
            (
                i,
                (if t.suppression > 0 { 0.7 } else { 1. }) * t.army
                    + if t.building == 6 { 300. } else { 0. }
                    + if t.site { 50. } else { 0. }
                    + if t.capital >= 0 { 60. } else { 0. },
            )
        })
        .collect();
    threats.sort_by(|a, b| b.1.total_cmp(&a.1));
    for &(to, v) in threats.iter().take(2) {
        let from = *own
            .iter()
            .max_by(|&&a, &&b| {
                dot(g.tiles[a].p, g.tiles[to].p).total_cmp(&dot(g.tiles[b].p, g.tiles[to].p))
            })
            .unwrap();
        for kind in 0..3 {
            add(35. + v * 0.12, "strike", from, to, kind);
        }
    }
    add(24., "satellite", 0, 0, 0);
    for s in g
        .squads
        .iter()
        .filter(|s| s.owner == p && s.left == 0 && s.ready <= g.tick)
    {
        let sea = s.kind == 1 || s.kind == 2;
        let mut targets: Vec<_> = g
            .tiles
            .iter()
            .enumerate()
            .filter(|(i, t)| {
                *i != s.tile
                    && if sea {
                        t.terrain == 0
                    } else {
                        t.terrain > 0 && seen[*i] && t.owner != p as i8
                    }
            })
            .map(|(i, t)| {
                let strategic = if sea {
                    t.near
                        .iter()
                        .filter(|&&j| {
                            seen[j] && g.tiles[j].owner >= 0 && g.tiles[j].owner != p as i8
                        })
                        .count() as f32
                        * 30.
                } else {
                    (if t.capital >= 0 { 30. } else { 0. }) - t.army * 0.3
                };
                (i, strategic + dot(g.tiles[s.tile].p, t.p) * 40.)
            })
            .collect();
        targets.sort_by(|a, b| b.1.total_cmp(&a.1));
        for &(to, _) in targets.iter().take(2) {
            add(64., "maneuver", s.id, to, 0);
        }
    }
    out.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut pool = vec![];
    for (_, a) in out {
        if pool.contains(&a) {
            continue;
        }
        let mut test = g.clone();
        if a.apply(&mut test, p) {
            pool.push(a);
        }
    }
    // A cluster of similar attacks must not prune every research or defense choice.
    // Reserve representation for each available command family, then research branches.
    let mut legal: Vec<Action> = vec![];
    for a in &pool {
        if !legal.iter().any(|x| x.kind == a.kind) && legal.len() < BRANCHES - 1 {
            legal.push(a.clone());
        }
    }
    for a in pool
        .iter()
        .filter(|a| a.kind == "research")
        .chain(pool.iter())
    {
        if !legal.contains(a) && legal.len() < BRANCHES - 1 {
            legal.push(a.clone());
        }
    }
    legal.push(Action::new("wait", 0, 0, 0));
    legal
}

/// Enemies punish exposed borders. Responses use only the reconstructed belief and their sight.
fn replies(g: &mut Game, p: usize) {
    for e in 0..g.players.len() {
        if e == p || !g.players[e].alive {
            continue;
        }
        let mut best = None;
        for (i, t) in g
            .tiles
            .iter()
            .enumerate()
            .filter(|(_, t)| t.owner == e as i8 && t.army > 12.)
        {
            for &j in &t.near {
                let target = &g.tiles[j];
                if target.terrain == 0 || target.owner == e as i8 {
                    continue;
                }
                let margin = t.army * 0.8 * (1. + g.players[e].tech[0] as f32 * 0.16)
                    - defense(g, j, g.players[e].tech[0]);
                if margin < 3. {
                    continue;
                }
                let rank = margin
                    + if target.capital >= 0 { 100. } else { 0. }
                    + if target.building == 6 { 200. } else { 0. };
                if best.map_or(true, |(v, _, _)| rank > v) {
                    best = Some((rank, i, j));
                }
            }
        }
        if let Some((_, from, to)) = best {
            let _ = g.command(e, "march", from, to, 1);
        }
    }
}

fn evaluate(g: &Game, p: usize) -> f32 {
    if g.winner >= 0 {
        return if g.winner == p as i8 {
            1_000_000. - g.tick as f32
        } else {
            -1_000_000. + g.tick as f32
        };
    }
    let x = &g.players[p];
    let own: Vec<_> = g.tiles.iter().filter(|t| t.owner == p as i8).collect();
    if own.is_empty() {
        return -100_000.;
    }
    let mut value = 0.;
    let academy_count = own
        .iter()
        .filter(|t| t.building == 3 || t.next == 3)
        .count() as f32;
    let mut food_income = 5. * (1. + x.tech[2] as f32 * 0.18);
    let mut academies: f32 = 0.;
    let mut markets: f32 = 0.;
    let mut capitals = 0.;
    // Territory is an investment, not a winning score. Its return falls as the
    // remaining economic runway shrinks; capital control and launch progress do not.
    let urgency = ((g.tick as f32 - 660.) / 480.).clamp(0., 1.);
    let province_value = 40. * (1. - 0.7 * urgency);
    let army_value = 0.55 * (1. - 0.4 * urgency);
    for t in &own {
        value += province_value + t.army * army_value;
        if t.capital >= 0 {
            value += 300.;
            capitals += 1.;
        }
        if t.site {
            value += 220.;
        }
        let weights = [
            0.,
            22.,
            35.,
            55. / (1. + academy_count * 0.22),
            if t.capital >= 0
                || t.site
                || t.near.iter().any(|&j| {
                    g.tiles[j].owner == p as i8
                        && (g.tiles[j].building == 6 || g.tiles[j].next == 6)
                })
            {
                62.
            } else {
                18.
            },
            25.,
            320.,
            (if t.site || t.terrain == 4 { 60. } else { 35. }) * (1. - x.industry / 600.),
        ];
        value += weights[t.building as usize];
        if t.work > 0 {
            let duration = if t.next == 6 {
                90.
            } else if t.next == 7 {
                if x.tech[1] >= 3 {
                    28.
                } else {
                    40.
                }
            } else if x.tech[1] >= 3 {
                18.
            } else {
                25.
            };
            let progress = (1. - t.work as f32 / duration).clamp(0., 1.);
            value += (weights[t.next as usize] - weights[t.building as usize])
                * (0.35 + 0.65 * progress);
        }
        if t.unrest == 0 {
            if t.building == 1 {
                food_income += 4. * (1. + x.tech[2] as f32 * 0.18);
            }
            if t.building == 2 {
                markets += 1.;
            }
            if t.building == 3 {
                academies += 1.;
            }
        }
        food_income -= t.army * 0.022 * if x.doctrine == 0 { 1.25 } else { 1. };
        food_income -= 0.3;
    }
    for m in g.marches.iter().filter(|m| m.owner == p) {
        value += m.army * army_value * 0.95;
        let target = &g.tiles[m.to];
        let margin = m.army * (1. + x.tech[0] as f32 * 0.16) - defense(g, m.to, x.tech[0]);
        if target.owner != p as i8 && margin > 5. {
            // Account for a committed long voyage beyond the search horizon;
            // otherwise shallow horizons systematically refuse naval invasions.
            let objective = province_value
                + if target.site { 220. } else { 0. }
                + if target.capital >= 0 { 300. } else { 0. }
                + if target.building == 6 {
                    180. + g.players[target.owner.max(0) as usize].launch as f32 * 0.3
                } else {
                    0.
                };
            value += objective * 0.6 * (1. - m.left as f32 / 240.).clamp(0.1, 1.);
        }
    }
    value += g
        .squads
        .iter()
        .filter(|s| s.owner == p)
        .map(|s| s.hp * if s.kind == 0 { 1.1 } else { 0.8 })
        .sum::<f32>();
    value += x.gold.min(600.) * 0.10
        + x.science.min(800.) * 0.10
        + x.food.min(120.) * 0.15
        + x.industry.min(180.) * 0.14;
    if food_income < 0. {
        value += food_income * 8. * (1. - x.food.min(200.) / 240.);
    }
    // Diminishing economic utility stops stockpiling and leaves tactical alternatives competitive.
    value += academies.min(4.) * 16. + markets.min(4.) * 10.;
    let tech_value = |b: usize, l: u8| -> f32 {
        match b {
            0 => [0., 35., 80., 150., 235.][l as usize],
            1 => [0., 50., 105., 190., 330.][l as usize],
            _ => [0., 40., 140., 210., 275.][l as usize],
        }
    };
    for b in 0..3 {
        value += tech_value(b, x.tech[b]);
    }
    if x.research >= 0 {
        let b = x.research as usize;
        let duration = [30., 45., 60., 90.][x.tech[b] as usize];
        let progress = (1. - x.research_left as f32 / duration).clamp(0., 1.);
        value +=
            (tech_value(b, x.tech[b] + 1) - tech_value(b, x.tech[b])) * (0.35 + 0.65 * progress);
    }
    if x.doctrine >= 0 {
        value += 18.;
    }
    let launch_value = 2.5 + urgency * 3.5;
    let space = x.launch as f32 * launch_value;
    let control = x.mandate as f32 * launch_value * SPACE_GOAL as f32 / MANDATE_GOAL as f32;
    value += space.max(control) + space.min(control) * 0.15 + x.domination as f32 * 5.;
    if capitals >= 4. {
        value += 300.;
    }
    let enemy_lead = g
        .players
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != p)
        .map(|(_, e)| {
            (e.launch as f32).max(e.mandate as f32 * SPACE_GOAL as f32 / MANDATE_GOAL as f32)
                * launch_value
                + e.domination as f32 * 5.
        })
        .fold(0., f32::max);
    value -= enemy_lead * 0.9;
    // Position matters before the actual capture is inside the horizon.
    for (i, t) in g
        .tiles
        .iter()
        .enumerate()
        .filter(|(_, t)| t.owner == p as i8)
    {
        let frontier = t
            .near
            .iter()
            .any(|&j| g.tiles[j].terrain > 0 && g.tiles[j].owner != p as i8);
        if frontier || t.capital >= 0 || t.site {
            value += t.army.min(110.) * (if t.capital >= 0 || t.site { 0.65 } else { 0.25 });
        }
        let danger = t
            .near
            .iter()
            .filter_map(|&j| {
                let e = &g.tiles[j];
                (e.owner >= 0 && e.owner != p as i8).then_some(
                    e.army
                        * 0.8
                        * (1.
                            + if e.owner >= 0 {
                                g.players[e.owner as usize].tech[0] as f32 * 0.16
                            } else {
                                0.
                            }),
                )
            })
            .fold(0., f32::max);
        let resistance = defense(g, i, 2);
        if danger > resistance {
            value -= (danger - resistance) * if t.capital >= 0 || t.site { 3. } else { 0.6 };
        }
    }
    value
}

pub fn plan(g: &Game, p: usize, depth: u8) -> Plan {
    let depth = depth.clamp(1, 4);
    let belief = observation(g, p);
    let wait = Action::new("wait", 0, 0, 0);
    let mut beam = vec![(belief, wait.clone(), 0.)];
    let mut nodes = 0;
    let mut immediate = wait;
    for level in 0..depth {
        let mut children = vec![];
        for (state, first, _) in beam {
            for a in candidates(&state, p) {
                let mut next = state.clone();
                if !a.apply(&mut next, p) {
                    continue;
                }
                replies(&mut next, p);
                next.step(FORECAST_STEP);
                let score = evaluate(&next, p);
                nodes += 1;
                children.push((next, if level == 0 { a } else { first.clone() }, score));
            }
        }
        children.sort_by(|a, b| b.2.total_cmp(&a.2));
        if level == 0 {
            immediate = children[0].1.clone();
        }
        // Keep two distinct continuations per root while another decision remains.
        // Retaining only the greedy second move hides strike/landing and investment
        // sequences whose payoff arrives with the third order.
        let mut diverse = vec![];
        let width = if level + 1 < depth { 2 } else { 1 };
        for child in children {
            if diverse
                .iter()
                .filter(|(_, first, _)| first == &child.1)
                .count()
                < width
            {
                diverse.push(child);
            }
        }
        beam = diverse;
    }
    // Enemy state/replies are estimates. Tiny forecast differences are not evidence
    // for abandoning a sound immediate choice. Still override decisively for forced
    // wins, threatened defeats, or a material multi-order opportunity.
    let choice = if depth > 1 {
        beam.iter()
            .position(|(_, a, _)| *a == immediate)
            .filter(|&i| beam[0].2 - beam[i].2 < 8. + depth as f32 * 6.)
            .unwrap_or(0)
    } else {
        0
    };
    let (_, action, value) = beam.swap_remove(choice);
    Plan {
        action,
        nodes,
        depth,
        horizon: depth as u32 * FORECAST_STEP,
        value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hidden_information_does_not_change_plan() {
        let g = Game::new(73, 8, 2);
        let mut altered = g.clone();
        for (i, t) in altered.tiles.iter_mut().enumerate() {
            if !g.visible(0, i) {
                t.army = 900.;
                if t.capital < 0 {
                    if !t.site {
                        t.owner = 7;
                    }
                    t.building = 4;
                    t.work = 20;
                    t.next = 3;
                    t.unrest = 30;
                }
            }
        }
        for x in altered.players.iter_mut().skip(1) {
            x.gold = 9999.;
            x.science = 9999.;
            x.industry = 599.;
            x.food = 0.;
            x.tech = [4, 4, 4];
            x.doctrine = 2;
            x.satellite = 120;
            x.cooldown = 9999;
        }
        altered.next_squad = 999;
        assert_eq!(
            serde_json::to_string(&observation(&g, 0)).unwrap(),
            serde_json::to_string(&observation(&altered, 0)).unwrap()
        );
        assert_eq!(plan(&g, 0, 3).action, plan(&altered, 0, 3).action);
    }
    #[test]
    fn depth_increases_horizon_with_a_fixed_work_budget() {
        let g = Game::new(93, 8, 2);
        let a = plan(&g, 0, 1);
        let b = plan(&g, 0, 3);
        assert_eq!(a.horizon, 12);
        assert_eq!(b.horizon, 36);
        assert!(b.nodes > a.nodes && b.nodes <= 310);
        assert!(b.action.apply(&mut g.clone(), 0));
    }

    #[test]
    fn deeper_search_preserves_a_capital_before_a_delayed_counterattack() {
        let mut g = Game::new(73, 8, 2);
        g.tick = 900;
        for x in &mut g.players {
            x.bot = false;
            x.gold = 0.;
            x.science = 0.;
            x.orders = 5.;
        }
        for t in &mut g.tiles {
            t.owner = -1;
            t.army = 150.;
            t.building = 0;
            t.work = 0;
            t.next = 0;
        }
        let cap = g.tiles.iter().position(|t| t.capital == 0).unwrap();
        let ally = g.tiles[cap].near[0];
        let foe = g.tiles[cap].near[2];
        g.tiles[cap].owner = 0;
        g.tiles[cap].army = 30.;
        g.tiles[cap].terrain = 4;
        g.tiles[ally].owner = 0;
        g.tiles[ally].army = 100.;
        g.tiles[ally].terrain = 1;
        g.tiles[foe].owner = 1;
        g.tiles[foe].army = 50.;
        g.tiles[foe].terrain = 1;
        g.players[0].tech = [0, 3, 2];
        g.players[0].science = 500.;
        g.players[0].gold = 100.;
        g.players[0].food = 200.;
        g.players[0].doctrine = 1;
        // The last capital is at stake: recapturing it later cannot undo an
        // opponent's instant all-capital victory. Satellite sight makes this public.
        for t in &mut g.tiles {
            if t.capital > 0 {
                t.owner = 1;
                t.army = 0.;
            }
        }
        g.players[0].satellite = 120;
        let shallow = plan(&g, 0, 1);
        let deep = plan(&g, 0, 3);
        eprintln!(
            "delayed counterattack: shallow {:?}, deep {:?}",
            shallow.action, deep.action
        );
        assert_ne!(shallow.action, deep.action);
        let mut shallow_future = observation(&g, 0);
        let mut deep_future = shallow_future.clone();
        shallow.action.apply(&mut shallow_future, 0);
        deep.action.apply(&mut deep_future, 0);
        replies(&mut shallow_future, 0);
        replies(&mut deep_future, 0);
        shallow_future.step(24);
        deep_future.step(24);
        assert_ne!(
            shallow_future.tiles[cap].owner, 0,
            "short-horizon investment loses the capital"
        );
        assert_eq!(
            deep_future.tiles[cap].owner, 0,
            "planning must preserve it through the counterattack"
        );
    }
}
