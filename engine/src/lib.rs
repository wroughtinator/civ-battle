//! Deterministic, authoritative strategy simulation. One tick is one real second.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
mod modern;
pub mod search;
pub mod tactics;
pub use modern::{Squad, Strike};
#[cfg(not(target_arch = "wasm32"))]
pub mod audit;

pub const SPACE_GOAL: u16 = 420;
pub const MANDATE_GOAL: u16 = 720;
pub const RESEARCH_SURCHARGE: f32 = 36.;
fn uncommitted() -> i8 {
    -1
}
pub type V3 = [f32; 3];
fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn mul(a: V3, s: f32) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}
fn dot(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: V3, b: V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn norm(a: V3) -> V3 {
    mul(a, 1.0 / dot(a, a).sqrt())
}
fn hash(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^ (x >> 16)
}
fn rand(seed: u32, i: u32) -> f32 {
    hash(seed.wrapping_add(i.wrapping_mul(7919))) as f64 as f32 / u32::MAX as f32
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Tile {
    pub p: V3,
    pub poly: Vec<V3>,
    pub near: Vec<usize>,
    pub terrain: u8,
    pub owner: i8,
    pub army: f32,
    pub building: u8,
    pub capital: i8,
    pub work: u16,
    pub next: u8,
    pub unrest: u16,
    #[serde(default)]
    pub site: bool,
    #[serde(default)]
    pub suppression: u16,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Player {
    pub civ: u8,
    pub bot: bool,
    pub gold: f32,
    pub food: f32,
    pub science: f32,
    #[serde(default)]
    pub industry: f32,
    pub orders: f32,
    pub tech: [u8; 3],
    pub research: i8,
    pub research_left: u16,
    pub cooldown: u32,
    pub alive: bool,
    pub launch: u16,
    pub score: u32,
    #[serde(default)]
    pub satellite: u16,
    #[serde(default)]
    pub strike_ready: u32,
    #[serde(default = "uncommitted")]
    pub doctrine: i8,
    #[serde(default = "uncommitted")]
    pub doctrine_next: i8,
    #[serde(default)]
    pub doctrine_left: u16,
    #[serde(default)]
    pub tag: u16,
    #[serde(default)]
    pub domination: u16,
    #[serde(default)]
    pub mandate: u16,
    #[serde(default)]
    pub name: String,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct March {
    pub owner: usize,
    pub from: usize,
    pub to: usize,
    pub army: f32,
    pub left: u16,
    pub total: u16,
    pub path: Vec<usize>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Event {
    pub tick: u32,
    pub kind: u8,
    pub player: usize,
    pub tile: usize,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Game {
    pub seed: u32,
    pub tick: u32,
    pub tiles: Vec<Tile>,
    pub players: Vec<Player>,
    pub marches: Vec<March>,
    pub winner: i8,
    pub victory: u8,
    pub difficulty: u8,
    pub events: Vec<Event>,
    #[serde(default)]
    pub squads: Vec<Squad>,
    #[serde(default)]
    pub strikes: Vec<Strike>,
    #[serde(default)]
    pub next_squad: usize,
}

fn world(seed: u32) -> Vec<Tile> {
    let t = (1.0 + 5.0_f32.sqrt()) / 2.0;
    let mut v: Vec<V3> = vec![
        [-1., t, 0.],
        [1., t, 0.],
        [-1., -t, 0.],
        [1., -t, 0.],
        [0., -1., t],
        [0., 1., t],
        [0., -1., -t],
        [0., 1., -t],
        [t, 0., -1.],
        [t, 0., 1.],
        [-t, 0., -1.],
        [-t, 0., 1.],
    ]
    .into_iter()
    .map(norm)
    .collect();
    let mut f = vec![
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ];
    for _ in 0..3 {
        let mut cache = BTreeMap::new();
        let mut out = vec![];
        for [a, b, c] in f {
            let mut mid = |a: usize, b: usize| {
                let k = (a.min(b), a.max(b));
                *cache.entry(k).or_insert_with(|| {
                    let i = v.len();
                    v.push(norm(add(v[a], v[b])));
                    i
                })
            };
            let ab = mid(a, b);
            let bc = mid(b, c);
            let ca = mid(c, a);
            out.extend([[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]);
        }
        f = out;
    }
    let mut polygons = vec![vec![]; v.len()];
    let mut neighbors = vec![BTreeSet::new(); v.len()];
    for [a, b, c] in f {
        let p = norm(add(add(v[a], v[b]), v[c]));
        for (i, j, k) in [(a, b, c), (b, c, a), (c, a, b)] {
            polygons[i].push(p);
            neighbors[i].extend([j, k]);
        }
    }
    let continents: Vec<V3> = (0..6)
        .map(|i| {
            norm([
                rand(seed, i * 3) * 2. - 1.,
                (rand(seed, i * 3 + 1) * 2. - 1.) * 0.75,
                rand(seed, i * 3 + 2) * 2. - 1.,
            ])
        })
        .collect();
    v.into_iter()
        .enumerate()
        .map(|(i, p)| {
            let east = norm(cross(
                if p[1].abs() > 0.9 {
                    [1., 0., 0.]
                } else {
                    [0., 1., 0.]
                },
                p,
            ));
            let north = cross(p, east);
            polygons[i].sort_by(|a, b| {
                dot(*a, north)
                    .atan2(dot(*a, east))
                    .total_cmp(&dot(*b, north).atan2(dot(*b, east)))
            });
            let mut height = -1.0_f32;
            for (j, c) in continents.iter().enumerate() {
                height = height.max(dot(p, *c) - (0.81 + rand(seed, j as u32 + 400) * 0.08));
            }
            height +=
                (p[0] * 19. + seed as f32 * 0.01).sin() * (p[2] * 13. - p[1] * 7.).cos() * 0.018;
            let r = rand(seed, i as u32 + 1000);
            let terrain = if p[1].abs() > 0.93 {
                5
            } else if height < 0. {
                0
            } else if height > 0.11 && r < 0.42 {
                4
            } else if p[1].abs() < 0.38 && r < 0.36 {
                3
            } else if r < 0.62 {
                2
            } else {
                1
            };
            Tile {
                p,
                poly: polygons[i].clone(),
                near: neighbors[i].iter().copied().collect(),
                terrain,
                owner: -1,
                army: if terrain == 0 { 0. } else { 5. + r * 8. },
                building: 0,
                capital: -1,
                work: 0,
                next: 0,
                unrest: 0,
                site: false,
                suppression: 0,
            }
        })
        .collect()
}

impl Game {
    pub fn new(seed: u32, count: usize, difficulty: u8) -> Self {
        let count = count.clamp(2, 8);
        let mut tiles = world(seed);
        let mut starts = vec![];
        for p in 0..count {
            let best = tiles
                .iter()
                .enumerate()
                .filter(|(_, t)| {
                    t.terrain > 0
                        && t.terrain < 4
                        && t.near
                            .iter()
                            .filter(|&&j| tiles[j].terrain > 0 && tiles[j].terrain < 4)
                            .count()
                            >= 3
                })
                .max_by(|(a, x), (b, y)| {
                    let score = |i: usize, t: &Tile| {
                        if starts.is_empty() {
                            t.p[2] + rand(seed, i as u32) * 0.15
                        } else {
                            starts
                                .iter()
                                .map(|&s: &usize| 1. - dot(t.p, tiles[s].p))
                                .fold(3., f32::min)
                                + rand(seed, i as u32) * 0.015
                        }
                    };
                    score(*a, x).total_cmp(&score(*b, y))
                })
                .map(|(i, _)| i)
                .unwrap();
            starts.push(best);
            tiles[best].owner = p as i8;
            tiles[best].capital = p as i8;
            tiles[best].army = 42.;
            tiles[best].terrain = 1;
            let mut near = tiles[best].near.clone();
            near.sort_by_key(|&i| tiles[i].terrain);
            for i in near
                .into_iter()
                .filter(|&i| tiles[i].terrain > 0 && tiles[i].terrain < 4 && tiles[i].owner < 0)
                .take(2)
                .collect::<Vec<_>>()
            {
                tiles[i].owner = p as i8;
                tiles[i].army = 14.;
            }
        }
        // Public frontier hubs sit between starts, outside the free starting estate.
        // Their industrial efficiency and territorial influence make geography matter.
        let mut sites: Vec<usize> = vec![];
        for p in 0..count {
            let neighbor = (0..count)
                .filter(|&q| q != p)
                .max_by(|&a, &b| {
                    dot(tiles[starts[p]].p, tiles[starts[a]].p)
                        .total_cmp(&dot(tiles[starts[p]].p, tiles[starts[b]].p))
                })
                .unwrap();
            let middle = norm(add(tiles[starts[p]].p, tiles[starts[neighbor]].p));
            let best = tiles
                .iter()
                .enumerate()
                .filter(|(_, t)| {
                    t.owner < 0
                        && t.terrain > 0
                        && t.terrain < 4
                        && starts.iter().all(|&s| dot(t.p, tiles[s].p) < 0.975)
                        && sites.iter().all(|&s| dot(t.p, tiles[s].p) < 0.93)
                })
                .max_by(|(_, a), (_, b)| dot(a.p, middle).total_cmp(&dot(b.p, middle)))
                .map(|(i, _)| i);
            if let Some(i) = best {
                tiles[i].site = true;
                tiles[i].army = 18.;
                sites.push(i);
            }
        }
        let players = (0..count)
            .map(|i| Player {
                civ: i as u8,
                bot: i != 0,
                gold: 150.,
                food: 120.,
                science: 40.,
                industry: 45.,
                orders: 4.,
                tech: [0; 3],
                research: -1,
                research_left: 0,
                cooldown: 0,
                alive: true,
                launch: 0,
                score: 0,
                satellite: 0,
                strike_ready: 0,
                doctrine: -1,
                doctrine_next: -1,
                doctrine_left: 0,
                tag: 1001 + i as u16,
                domination: 0,
                mandate: 0,
                name: format!("Computer {}", i + 1),
            })
            .collect();
        Self {
            seed,
            tick: 0,
            tiles,
            players,
            marches: vec![],
            winner: -1,
            victory: 0,
            difficulty: difficulty.min(2),
            events: vec![],
            squads: vec![],
            strikes: vec![],
            next_squad: 0,
        }
    }
    fn emit(&mut self, kind: u8, player: usize, tile: usize) {
        self.events.push(Event {
            tick: self.tick,
            kind,
            player,
            tile,
        });
        if self.events.len() > 16 {
            self.events.remove(0);
        }
    }
    pub fn visible(&self, p: usize, i: usize) -> bool {
        self.tiles[i].owner == p as i8
            || self.tiles[i].near.iter().any(|&n| {
                self.tiles[n].owner == p as i8
                    || self.players[p].tech[1] >= 2
                        && self.tiles[n]
                            .near
                            .iter()
                            .any(|&j| self.tiles[j].owner == p as i8)
            })
            || self.marches.iter().any(|m| {
                if m.owner != p {
                    return false;
                }
                let step = ((1. - m.left as f32 / m.total as f32) * (m.path.len() - 1) as f32)
                    .floor() as usize;
                let at = m.path[step.min(m.path.len() - 1)];
                at == i || self.tiles[at].near.contains(&i)
            })
            || self
                .squads
                .iter()
                .any(|s| s.owner == p && (s.tile == i || self.tiles[s.tile].near.contains(&i)))
            || self.players[p].satellite > 0
    }
    fn path(&self, p: usize, from: usize, to: usize) -> Option<Vec<usize>> {
        let sea = self.players[p].tech[2] >= 2;
        let mut prev = vec![usize::MAX; self.tiles.len()];
        let mut q = VecDeque::from([from]);
        prev[from] = from;
        while let Some(i) = q.pop_front() {
            if i == to {
                let mut path = vec![to];
                while *path.last().unwrap() != from {
                    path.push(prev[*path.last().unwrap()]);
                }
                path.reverse();
                return if path.len() <= if sea { 18 } else { 9 } {
                    Some(path)
                } else {
                    None
                };
            }
            for &j in &self.tiles[i].near {
                if prev[j] != usize::MAX {
                    continue;
                }
                let t = &self.tiles[j];
                if t.terrain == 0 && !sea {
                    continue;
                }
                if j != to && t.terrain != 0 && t.owner != p as i8 {
                    continue;
                }
                prev[j] = i;
                q.push_back(j);
            }
        }
        None
    }
    pub fn command(
        &mut self,
        p: usize,
        kind: &str,
        from: usize,
        to: usize,
        value: u8,
    ) -> Result<(), u8> {
        // Error codes: 1 phase/player, 2 command budget, 3 ownership, 4 route, 5 funds, 6 prerequisite.
        if self.winner >= 0 || p >= self.players.len() || !self.players[p].alive {
            return Err(1);
        }
        if self.players[p].orders < 1. || self.tick < self.players[p].cooldown {
            return Err(2);
        }
        match kind {
            "march" => {
                if from >= self.tiles.len()
                    || to >= self.tiles.len()
                    || from == to
                    || self.tiles[from].owner != p as i8
                {
                    return Err(3);
                }
                if self.tiles[to].terrain == 0 {
                    return Err(4);
                }
                let path = self.path(p, from, to).ok_or(4)?;
                let army = (self.tiles[from].army * if value == 1 { 0.8 } else { 0.5 }).floor();
                if army < 3. {
                    return Err(5);
                }
                if self.marches.iter().filter(|m| m.owner == p).count() >= 12 {
                    return Err(2);
                }
                let total = ((path.len() - 1) as f32
                    * (if self.players[p].tech[0] >= 4 {
                        7.
                    } else {
                        11.
                    })
                    + if self.tiles[to].terrain == 4 { 8. } else { 0. })
                    * (1.
                        + if self.players[p].tech[2] < 3 {
                            self.storm(to) * 0.25
                        } else {
                            0.
                        });
                let total = total as u16;
                self.tiles[from].army -= army;
                self.marches.push(March {
                    owner: p,
                    from,
                    to,
                    army,
                    left: total,
                    total,
                    path,
                });
            }
            "build" => {
                if from >= self.tiles.len() || self.tiles[from].owner != p as i8 {
                    return Err(3);
                }
                if !(1..=7).contains(&value)
                    || self.tiles[from].work > 0
                    || self.tiles[from].building == value
                {
                    return Err(6);
                }
                if value == 5
                    && (self.players[p].tech[2] < 2
                        || !self.tiles[from]
                            .near
                            .iter()
                            .any(|&n| self.tiles[n].terrain == 0))
                {
                    return Err(6);
                }
                if value == 6
                    && (self.players[p].tech[1] < 4
                        || self.players[p].tech[2] < 2
                        || self
                            .tiles
                            .iter()
                            .any(|t| t.owner == p as i8 && (t.building == 6 || t.next == 6)))
                {
                    return Err(6);
                }
                let cost = [0., 45., 55., 70., 60., 65., 400., 95.][value as usize];
                if self.players[p].gold < cost || value == 6 && self.players[p].industry < 60. {
                    return Err(5);
                }
                self.players[p].gold -= cost;
                if value == 6 {
                    self.players[p].industry -= 60.;
                }
                self.tiles[from].next = value;
                self.tiles[from].work = if value == 6 {
                    90
                } else if value == 7 {
                    if self.players[p].tech[1] >= 3 {
                        28
                    } else {
                        40
                    }
                } else if self.players[p].tech[1] >= 3 {
                    18
                } else {
                    25
                };
            }
            "research" => {
                let b = value as usize;
                if b >= 3 || self.players[p].research >= 0 || self.players[p].tech[b] >= 4 {
                    return Err(6);
                }
                // Opportunity cost grows with all discoveries; specialization reaches the final tier earlier.
                let level = self.players[p].tech[b] as usize;
                // Shared eras leave time to react to the first advanced research investments.
                if self.tick < [0, 0, 300, 780][level] {
                    return Err(6);
                }
                let cost = [55., 100., 180., 300.][level]
                    + self.players[p].tech.iter().map(|&x| x as f32).sum::<f32>()
                        * RESEARCH_SURCHARGE;
                if self.players[p].science < cost {
                    return Err(5);
                }
                self.players[p].science -= cost;
                self.players[p].research = b as i8;
                self.players[p].research_left = [30, 45, 60, 90][level];
            }
            "doctrine" => {
                if value > 2
                    || self.players[p].doctrine == value as i8
                    || self.players[p].doctrine_left > 0
                    || !self.players[p].tech.iter().any(|&x| x >= 3)
                {
                    return Err(6);
                }
                if self.players[p].doctrine < 0 {
                    self.players[p].doctrine = value as i8;
                } else {
                    if self.players[p].gold < 140. || self.players[p].science < 60. {
                        return Err(5);
                    }
                    self.players[p].gold -= 140.;
                    self.players[p].science -= 60.;
                    self.players[p].doctrine_next = value as i8;
                    self.players[p].doctrine_left = 45;
                }
            }
            "train" | "maneuver" | "strike" | "satellite" => {
                self.modern_command(p, kind, from, to, value)?
            }
            _ => return Err(6),
        }
        self.players[p].orders -= 1.;
        self.players[p].cooldown = self.tick + 2;
        Ok(())
    }
    pub fn step(&mut self, seconds: u32) {
        for _ in 0..seconds.min(3600) {
            if self.winner >= 0 {
                break;
            }
            self.tick += 1;
            self.advance();
        }
    }
    fn advance(&mut self) {
        self.modern_tick();
        for p in 0..self.players.len() {
            let player = &mut self.players[p];
            player.orders = (player.orders + 0.125).min(5.);
            if player.doctrine_left > 0 {
                player.doctrine_left -= 1;
                if player.doctrine_left == 0 {
                    player.doctrine = player.doctrine_next;
                    player.doctrine_next = -1;
                }
            }
            if player.research >= 0 {
                player.research_left = player.research_left.saturating_sub(1);
                if player.research_left == 0 {
                    player.tech[player.research as usize] += 1;
                    player.research = -1;
                }
            }
        }
        for i in 0..self.tiles.len() {
            let t = &mut self.tiles[i];
            t.unrest = t.unrest.saturating_sub(1);
            t.suppression = t.suppression.saturating_sub(1);
            if t.work > 0 && t.unrest == 0 {
                t.work -= 1;
                if t.work == 0 {
                    t.building = t.next;
                    t.next = 0;
                }
            }
        }
        if self.tick % 5 == 0 {
            self.economy();
        }
        let mut arrivals = vec![];
        for m in &mut self.marches {
            m.left = m.left.saturating_sub(1);
            if m.left == 0 {
                arrivals.push(m.clone());
            }
        }
        self.marches.retain(|m| m.left > 0);
        // Arrivals resolve in stable dispatch order; no client clock or frame rate participates.
        for m in arrivals {
            self.arrive(m);
        }
        let mut winners = vec![];
        for p in 0..self.players.len() {
            let owned: Vec<usize> = self
                .tiles
                .iter()
                .enumerate()
                .filter(|(_, t)| t.owner == p as i8)
                .map(|(i, _)| i)
                .collect();
            self.players[p].alive = !owned.is_empty() || self.marches.iter().any(|m| m.owner == p);
            let rocket = owned
                .iter()
                .copied()
                .find(|&i| self.tiles[i].building == 6 && self.tiles[i].unrest == 0);
            // Space requires a sustained industrial economy. There is no automatic
            // civilian space progress; territorial control provides the anti-stall route.
            let mut accelerated = false;
            if rocket.is_some()
                && self.players[p].gold >= 0.8
                && self.players[p].science >= 0.5
                && self.players[p].industry >= 0.6
            {
                self.players[p].gold -= 0.8;
                self.players[p].science -= 0.5;
                self.players[p].industry -= 0.6;
                self.players[p].launch += 1;
                accelerated = true;
            }
            if !accelerated {
                let checkpoint = self.players[p].launch / 60 * 60;
                self.players[p].launch = self.players[p].launch.saturating_sub(2).max(checkpoint);
            }
            if self.players[p].launch >= SPACE_GOAL && !owned.is_empty() {
                self.players[p].launch = SPACE_GOAL;
                winners.push((p, 2, rocket.unwrap_or(owned[0])));
            }
            let capitals = owned
                .iter()
                .filter(|&&i| self.tiles[i].capital >= 0)
                .count();
            // Capital sovereignty and frontier control bank territorial influence.
            // Points never reset on conquest: every fourth tick assigns all capital
            // points to their current owners, so cycling ownership cannot stall forever.
            let hubs = owned.iter().filter(|&&i| self.tiles[i].site).count();
            if self.tick % 4 == 0 {
                self.players[p].mandate += capitals as u16;
            }
            if self.tick % 8 == 0 {
                self.players[p].mandate += hubs as u16;
            }
            self.players[p].mandate = self.players[p].mandate.min(MANDATE_GOAL);
            self.players[p].domination = if capitals >= (self.players.len() / 2).max(2) {
                self.players[p].domination + 1
            } else {
                0
            };
            self.players[p].score = (owned.len() * 10
                + capitals * 70
                + self.players[p]
                    .tech
                    .iter()
                    .map(|&x| x as usize)
                    .sum::<usize>()
                    * 18
                + self.players[p].launch as usize * 2
                + self.players[p].mandate as usize) as u32;
            if !owned.is_empty()
                && (capitals == self.players.len()
                    || self.players[p].domination >= 90
                    || self.players[p].mandate >= MANDATE_GOAL)
            {
                winners.push((p, 1, owned[0]));
            }
        }
        if let Some(&(p, v, tile)) = winners
            .iter()
            .max_by_key(|&&(p, _, _)| hash(self.seed ^ self.tick ^ (p as u32 * 7919)))
        {
            self.winner = p as i8;
            self.victory = v;
            self.emit(3, p, tile);
            return;
        }
        for p in 0..self.players.len() {
            if self.players[p].bot
                && self.players[p].alive
                && self.tick % search::DECISION_INTERVAL == p as u32 % search::DECISION_INTERVAL
            {
                self.bot(p);
            }
        }
    }
    fn economy(&mut self) {
        for p in 0..self.players.len() {
            let owned: Vec<usize> = self
                .tiles
                .iter()
                .enumerate()
                .filter(|(_, t)| t.owner == p as i8)
                .map(|(i, _)| i)
                .collect();
            let mut buildings = [0.; 8];
            let mut army = 0.;
            let mut effective = 0.;
            let mut industrial_output = 0.;
            for &i in &owned {
                army += self.tiles[i].army;
                if self.tiles[i].unrest == 0 {
                    buildings[self.tiles[i].building as usize] += 1.;
                    effective += 1.;
                    let t = &self.tiles[i];
                    if t.capital >= 0 {
                        industrial_output += 0.8;
                    }
                    if t.site {
                        industrial_output += 0.6;
                    }
                    if t.building == 7 {
                        industrial_output += if t.site || t.terrain == 4 { 4. } else { 2. };
                    }
                    if t.building == 5 {
                        industrial_output += 0.5;
                    }
                }
            }
            let player = &mut self.players[p];
            let trade = if player.doctrine == 2 { 1.2 } else { 1. };
            let learning = if player.doctrine == 1 {
                1.25
            } else if player.doctrine == 0 {
                0.9
            } else {
                1.
            };
            player.gold = (player.gold
                + (3.
                    + effective * 0.7
                    + buildings[2] * (if player.tech[2] >= 3 { 5. } else { 3.5 })
                    + buildings[5] * 2.)
                    * trade
                    * (1. + player.tech[2] as f32 * 0.1)
                - owned.len().saturating_sub(14) as f32 * 0.42)
                .clamp(0., 9999.);
            player.science = (player.science
                + (2. + effective * 0.12 + buildings[3].powf(0.72) * 3.)
                    * learning
                    * (1. + player.tech[1] as f32 * 0.12))
                .min(9999.);
            player.industry = (player.industry + industrial_output + effective * 0.03).min(600.);
            player.food = (player.food
                + (5. + buildings[1] * 4.) * (1. + player.tech[2] as f32 * 0.18)
                - army * 0.022 * if player.doctrine == 0 { 1.25 } else { 1. }
                - owned.len() as f32 * 0.3)
                .clamp(0., 999.);
            let supplied = player.food > 1.;
            for i in owned {
                let t = &mut self.tiles[i];
                if t.unrest > 0 {
                    continue;
                }
                let growth = ((if t.capital >= 0 { 1.8 } else { 0.42 })
                    + if t.building == 4 { 0.15 } else { 0. }
                    + if player.tech[2] >= 4 { 0.3 } else { 0. })
                    * if player.doctrine == 0 { 1.25 } else { 1. };
                let limit = if t.capital >= 0 { 100. } else { 65. };
                // Natural growth caps never delete reinforcements already gathered here.
                if supplied {
                    if t.army < limit {
                        t.army = (t.army + growth).min(limit);
                    }
                } else {
                    t.army = (t.army - 0.5).max(1.);
                }
            }
        }
    }
    fn arrive(&mut self, m: March) {
        if self.tiles[m.to].owner == m.owner as i8 {
            self.tiles[m.to].army = (self.tiles[m.to].army + m.army).min(160.);
            return;
        }
        let attacker = &self.players[m.owner];
        let mut atk = 1. + attacker.tech[0] as f32 * 0.16;
        if attacker.food < 1. {
            atk *= 0.72;
        }
        if attacker.doctrine == 2 {
            atk *= 0.9;
        }
        let t = &self.tiles[m.to];
        let mut def = (if t.owner >= 0 {
            1. + self.players[t.owner as usize].tech[0] as f32 * 0.12
        } else {
            1.
        }) + if t.building == 4 {
            (if attacker.tech[0] >= 3 { 0.2 } else { 0.55 })
                + if t.owner >= 0 && self.players[t.owner as usize].tech[0] >= 2 {
                    0.15
                } else {
                    0.
                }
        } else {
            0.
        } + if t.terrain == 4 {
            0.4
        } else if t.terrain == 2 {
            0.16
        } else {
            0.
        } + if t.capital >= 0 { 0.25 } else { 0. };
        if t.suppression > 0 {
            def *= 0.7;
        }
        let power = m.army * atk;
        let resistance = t.army * def;
        if power > resistance {
            let t = &mut self.tiles[m.to];
            t.owner = m.owner as i8;
            t.army = ((power - resistance) / atk).max(1.);
            t.unrest = 20;
            t.work = 0;
            t.next = 0;
            if t.building == 6 {
                t.building = 0;
            }
            self.emit(1, m.owner, m.to);
        } else {
            self.tiles[m.to].army = ((resistance - power) / def).max(1.);
            self.emit(2, m.owner, m.to);
        }
    }
    fn bot(&mut self, p: usize) {
        let plan = search::plan(self, p, self.difficulty + 1);
        plan.action.apply(self, p);
    }
    #[cfg(not(target_arch = "wasm32"))]
    fn heuristic_bot(&mut self, p: usize) {
        // Reassess once per strategic interval, using only visible threats and public goals.
        if self.tick > 660
            && self.tick % 180 < 18
            && self.players[p].doctrine >= 0
            && self.players[p].gold > 400.
            && self.players[p].science > 180.
        {
            let threatened = self.tiles.iter().enumerate().any(|(i, t)| {
                t.owner == p as i8
                    && t.capital >= 0
                    && t.near.iter().any(|&j| {
                        self.visible(p, j)
                            && self.tiles[j].owner >= 0
                            && self.tiles[j].owner != p as i8
                            && self.tiles[j].army > t.army * 0.5
                    })
                    && self.visible(p, i)
            });
            let desired = if threatened {
                0
            } else if self.players[p].tech[1] >= 3 {
                1
            } else if self
                .squads
                .iter()
                .filter(|s| s.owner == p && (s.kind == 1 || s.kind == 2))
                .count()
                >= 2
            {
                2
            } else {
                0
            };
            if self.players[p].doctrine != desired
                && self.command(p, "doctrine", 0, 0, desired as u8).is_ok()
            {
                return;
            }
        }
        if self.players[p].doctrine < 0
            && self
                .command(
                    p,
                    "doctrine",
                    0,
                    0,
                    if p % 4 == 1 || p % 4 == 3 {
                        1
                    } else if p % 4 == 2 {
                        2
                    } else {
                        0
                    },
                )
                .is_ok()
        {
            return;
        }
        if self.modern_bot(p) {
            return;
        }
        let owned: Vec<usize> = self
            .tiles
            .iter()
            .enumerate()
            .filter(|(_, t)| t.owner == p as i8)
            .map(|(i, _)| i)
            .collect();
        if owned.is_empty() {
            return;
        }
        let role = p % 4;
        let player = self.players[p].clone();
        let acad = owned
            .iter()
            .filter(|&&i| self.tiles[i].building == 3 || self.tiles[i].next == 3)
            .count();
        let farms = owned
            .iter()
            .filter(|&&i| self.tiles[i].building == 1 || self.tiles[i].next == 1)
            .count();
        if player.tech[1] >= 4
            && player.tech[2] >= 2
            && player.gold >= 400.
            && !owned
                .iter()
                .any(|&i| self.tiles[i].building == 6 || self.tiles[i].next == 6)
        {
            let base = *owned
                .iter()
                .max_by(|&&a, &&b| self.tiles[a].army.total_cmp(&self.tiles[b].army))
                .unwrap();
            if self.command(p, "build", base, 0, 6).is_ok() {
                return;
            }
        }
        if player.research < 0 {
            let b = if player.tech[2] < 2 && self.tick > 100 {
                2
            } else if role == 1 || role == 3 {
                1
            } else if player.tech[0] < 3 {
                0
            } else {
                1
            };
            if self.command(p, "research", 0, 0, b).is_ok() {
                return;
            }
        }
        if self.players[p].food < 80. || farms == 0 && self.tick > 100 {
            if let Some(&i) = owned
                .iter()
                .find(|&&i| self.tiles[i].building == 0 && self.tiles[i].work == 0)
            {
                if self.command(p, "build", i, 0, 1).is_ok() {
                    return;
                }
            }
        }
        if (acad < if role == 1 || role == 3 { 4 } else { 2 }) && self.tick > 30 {
            if let Some(&i) = owned
                .iter()
                .find(|&&i| self.tiles[i].building == 0 && self.tiles[i].work == 0)
            {
                if self.command(p, "build", i, 0, 3).is_ok() {
                    return;
                }
            }
        }
        // Consider only observed garrisons. Scientists prefer expansion; generals prioritize capitals and launch sites.
        let mut moves = vec![];
        for &from in &owned {
            if self.tiles[from].army < 14. {
                continue;
            }
            for to in 0..self.tiles.len() {
                let t = &self.tiles[to];
                if t.terrain == 0 || t.owner == p as i8 || !self.visible(p, to) {
                    continue;
                }
                if let Some(path) = self.path(p, from, to) {
                    let strength =
                        self.tiles[from].army * 0.8 * (1. + self.players[p].tech[0] as f32 * 0.16);
                    let defense = t.army * (1.35 + if t.building == 4 { 0.15 } else { 0. });
                    if strength < defense + 3. {
                        continue;
                    }
                    let score = (strength - defense) / path.len() as f32
                        + if t.capital >= 0 { 28. } else { 0. }
                        + if t.building == 6 { 120. } else { 0. }
                        + if t.owner < 0 {
                            10.
                        } else if role == 0 {
                            15.
                        } else {
                            0.
                        };
                    moves.push((score, from, to));
                }
            }
        }
        moves.sort_by(|a, b| b.0.total_cmp(&a.0));
        if let Some(&(_, from, to)) = moves.first() {
            if self.command(p, "march", from, to, 1).is_ok() {
                return;
            }
        }
        // Transfer idle interior armies toward the weakest exposed frontier.
        let frontier: Vec<usize> = owned
            .iter()
            .copied()
            .filter(|&i| {
                self.tiles[i]
                    .near
                    .iter()
                    .any(|&j| self.tiles[j].terrain > 0 && self.tiles[j].owner != p as i8)
            })
            .collect();
        for &from in &owned {
            if self.tiles[from].army < 24. {
                continue;
            }
            if let Some(&to) = frontier
                .iter()
                .filter(|&&i| {
                    i != from
                        && self.tiles[i].army < 110.
                        && self.path(p, from, i).is_some()
                        && !self.marches.iter().any(|m| m.owner == p && m.to == i)
                })
                .max_by_key(|&&i| {
                    self.tiles[i]
                        .near
                        .iter()
                        .filter(|&&j| self.tiles[j].owner >= 0 && self.tiles[j].owner != p as i8)
                        .count()
                        * 100
                        + (self.tiles[i].army as usize)
                })
            {
                // Concentrate rather than endlessly redistributing equal-sized detachments.
                if self.tiles[from].army < self.tiles[to].army || !frontier.contains(&from) {
                    if self.command(p, "march", from, to, 1).is_ok() {
                        return;
                    }
                }
            }
        }
        if let Some(&i) = owned
            .iter()
            .find(|&&i| self.tiles[i].building == 0 && self.tiles[i].work == 0)
        {
            let b = if self.players[p].gold < 250. {
                2
            } else if frontier.contains(&i) {
                4
            } else {
                3
            };
            let _ = self.command(p, "build", i, 0, b);
        }
    }
}

#[derive(Deserialize)]
struct Request {
    op: String,
    #[serde(default)]
    seed: u32,
    #[serde(default = "default_count")]
    count: usize,
    #[serde(default)]
    difficulty: u8,
    state: Option<Game>,
    #[serde(default)]
    ticks: u32,
    #[serde(default)]
    player: usize,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    from: usize,
    #[serde(default)]
    to: usize,
    #[serde(default)]
    value: u8,
}
fn default_count() -> usize {
    8
}
pub fn execute_legacy(input: &[u8]) -> Vec<u8> {
    let result = (|| -> Result<serde_json::Value, String> {
        let r: Request = serde_json::from_slice(input).map_err(|e| e.to_string())?;
        if r.op == "new" {
            return Ok(
                serde_json::json!({"state":Game::new(r.seed,r.count,r.difficulty),"error":0}),
            );
        }
        let mut g = r.state.ok_or("missing state")?;
        if r.op == "view" {
            if r.player >= g.players.len() {
                return Err("invalid player".into());
            }
            return Ok(serde_json::json!({"state":g.tactical_view(r.player),"error":0}));
        }
        let error = if r.op == "step" {
            g.step(r.ticks);
            0
        } else if r.op == "command" {
            g.command(r.player, &r.kind, r.from, r.to, r.value)
                .err()
                .unwrap_or(0)
        } else {
            6
        };
        Ok(serde_json::json!({"state":g,"error":error}))
    })();
    serde_json::to_vec(&result.unwrap_or_else(|e| serde_json::json!({"error":99,"detail":e})))
        .unwrap()
}

pub fn execute(input: &[u8]) -> Vec<u8> {
    tactics::execute(input)
}
thread_local! {static OUTPUT: std::cell::RefCell<Vec<u8>> = const {std::cell::RefCell::new(Vec::new())};}
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let v = vec![0u8; len].into_boxed_slice();
    Box::into_raw(v) as *mut u8
}
/// # Safety
/// `ptr` must originate from `alloc(len)` and may be consumed only once.
#[no_mangle]
pub unsafe extern "C" fn run(ptr: *mut u8, len: usize) {
    let input = Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len));
    OUTPUT.with(|out| *out.borrow_mut() = execute(&input));
}
#[no_mangle]
pub extern "C" fn output_ptr() -> *const u8 {
    OUTPUT.with(|out| out.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn output_len() -> usize {
    OUTPUT.with(|out| out.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reinforcements_survive_natural_growth_cap() {
        let mut g = Game::new(22, 2, 1);
        g.players.iter_mut().for_each(|p| p.bot = false);
        let i = g
            .tiles
            .iter()
            .position(|t| t.owner == 0 && t.capital < 0)
            .unwrap();
        g.tiles[i].army = 130.;
        g.step(5);
        assert_eq!(g.tiles[i].army, 130.);
    }
    #[test]
    fn modern_research_cannot_skip_the_era_gate() {
        let mut g = Game::new(22, 2, 1);
        g.players[0].science = 9999.;
        g.players[0].tech[1] = 3;
        assert_eq!(g.command(0, "research", 0, 0, 1), Err(6));
        g.tick = 780;
        assert!(g.command(0, "research", 0, 0, 1).is_ok());
    }
    #[test]
    fn every_capital_and_completed_launch_win() {
        let mut g = Game::new(22, 2, 1);
        g.players.iter_mut().for_each(|p| p.bot = false);
        for t in &mut g.tiles {
            if t.capital >= 0 {
                t.owner = 0;
            }
        }
        g.step(1);
        assert_eq!((g.winner, g.victory), (0, 1));
        let mut g = Game::new(22, 2, 1);
        g.players.iter_mut().for_each(|p| p.bot = false);
        let i = g.tiles.iter().position(|t| t.capital == 0).unwrap();
        g.tiles[i].building = 6;
        g.players[0].launch = SPACE_GOAL - 1;
        g.step(1);
        assert_eq!((g.winner, g.victory), (0, 2));
    }
    #[test]
    fn globe_is_closed_and_starts_are_fair() {
        for seed in [1, 17, 1234, 99999] {
            let g = Game::new(seed, 8, 1);
            assert_eq!(g.tiles.len(), 642);
            assert_eq!(g.tiles.iter().filter(|t| t.near.len() == 5).count(), 12);
            for (i, t) in g.tiles.iter().enumerate() {
                assert!((dot(t.p, t.p) - 1.).abs() < 0.001);
                for &j in &t.near {
                    assert!(g.tiles[j].near.contains(&i));
                }
            }
            for p in 0..8 {
                assert_eq!(g.tiles.iter().filter(|t| t.owner == p).count(), 3);
            }
        }
    }
    #[test]
    fn cannot_spend_or_move_another_players_army() {
        let mut g = Game::new(42, 8, 1);
        let i = g.tiles.iter().position(|t| t.owner == 1).unwrap();
        assert_eq!(g.command(0, "march", i, 0, 0), Err(3));
        let before = g.players[0].gold;
        assert_eq!(g.command(0, "build", i, 0, 1), Err(3));
        assert_eq!(before, g.players[0].gold);
    }
    #[test]
    fn build_cost_and_timer_are_authoritative() {
        let mut g = Game::new(17, 2, 1);
        g.players.iter_mut().for_each(|p| p.bot = false);
        let i = g.tiles.iter().position(|t| t.owner == 0).unwrap();
        assert!(g.command(0, "build", i, 0, 3).is_ok());
        assert_eq!(g.players[0].gold, 80.);
        assert_eq!(g.tiles[i].building, 0);
        g.step(24);
        assert_eq!(g.tiles[i].building, 0);
        g.step(1);
        assert_eq!(g.tiles[i].building, 3);
    }
    #[test]
    fn march_resolves_after_travel_and_conserves_armies() {
        let mut g = Game::new(42, 2, 1);
        g.players.iter_mut().for_each(|p| p.bot = false);
        let from = g.tiles.iter().position(|t| t.capital == 0).unwrap();
        let to = *g.tiles[from]
            .near
            .iter()
            .find(|&&i| g.tiles[i].terrain > 0 && g.tiles[i].owner < 0)
            .unwrap();
        let before = g.tiles[from].army;
        g.command(0, "march", from, to, 1).unwrap();
        assert_eq!(g.tiles[from].army + g.marches[0].army, before);
        let travel = g.marches[0].total;
        g.step(travel as u32 - 1);
        assert_eq!(g.tiles[to].owner, -1);
        g.step(1);
        assert_eq!(g.tiles[to].owner, 0);
    }
    #[test]
    fn deterministic_restore_and_no_negative_resources() {
        let mut a = Game::new(7, 8, 2);
        a.players[0].bot = true;
        a.step(300);
        let mut b: Game = serde_json::from_slice(&serde_json::to_vec(&a).unwrap()).unwrap();
        a.step(700);
        b.step(700);
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            serde_json::to_string(&b).unwrap()
        );
        assert!(a
            .players
            .iter()
            .all(|p| p.gold >= 0. && p.food >= 0. && p.science >= 0.));
    }
    #[test]
    fn rocket_requires_both_branches_and_can_be_interrupted() {
        let mut g = Game::new(5, 2, 1);
        g.players.iter_mut().for_each(|p| p.bot = false);
        let i = g.tiles.iter().position(|t| t.capital == 0).unwrap();
        g.players[0].gold = 1000.;
        g.players[0].industry = 500.;
        assert_eq!(g.command(0, "build", i, 0, 6), Err(6));
        g.players[0].tech = [0, 4, 2];
        g.command(0, "build", i, 0, 6).unwrap();
        g.step(100);
        assert!(g.players[0].launch > 0);
        g.tiles[i].building = 0;
        g.step(10);
        assert_eq!(g.players[0].launch, 0);
    }
    #[test]
    fn passive_match_finishes_an_objective_without_a_score_timeout() {
        let mut g = Game::new(42, 8, 2);
        for p in &mut g.players {
            p.bot = false;
        }
        g.step(1200);
        assert_eq!(g.winner, -1, "twenty minutes is not an end condition");
        assert!(
            g.players.iter().all(|p| p.launch == 0),
            "no free orbital progress"
        );
        g.step(2000);
        assert!(g.winner >= 0);
        assert_eq!(g.victory, 1);
        assert_eq!(g.players[g.winner as usize].mandate, MANDATE_GOAL);
        assert_eq!(
            g.tick,
            MANDATE_GOAL as u32 * 4,
            "idle capitals eventually satisfy their territorial objective"
        );
    }
}
