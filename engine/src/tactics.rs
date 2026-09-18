//! Current rules: conquest or orbital spaceflight, persistent combat and guarded approaches.
use super::{dot, hash, norm, Event, Tile};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, VecDeque};

pub const INFLUENCE_GOAL: u16 = 540;
pub const SPACE_GOAL: u16 = 360;
/// Standing orders keep working while the player considers their next choice.
pub const ORDER_INTERVAL: u32 = 0;
pub const SETTLER: u8 = 13;
pub const BRANCHES: [[u8; 3]; 11] = [[1,24,3],[2,23,5],[14,25,35],[15,4,11],[16,26,32],[17,27,34],[18,28,6],[19,31,9],[20,7,8],[21,29,33],[22,30,10]];
pub mod roster;
use roster::{definition,technologies,naval,air,ground,UNIT_COUNT};

#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct Spec {
    pub hp: f32,
    pub damage: f32,
    pub min: u16,
    pub range: u16,
    pub reload: u32,
    pub speed: u16,
    pub cost: u16,
    pub train: u16,
    pub sight: u16,
    pub boarding_capacity: u8,
}
pub fn spec(k: u8) -> Spec { definition(k).spec }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Player {
    pub civ: u8,
    pub tag: u16,
    pub name: String,
    pub bot: bool,
    pub alive: bool,
    pub gold: f32,
    pub unlocked: Vec<u8>,
    pub research: i8,
    pub research_left: u16,
    #[serde(default)]
    pub research_queue: Vec<u8>,
    pub cooldown: u32,
    pub launch: u16,
    pub launch_tile: Option<usize>,
    pub domination: u16,
    pub mandate: u16,
    pub score: u32,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct City {
    pub tile: usize,
    pub owner: usize,
    pub capital: i8,
    pub radius: u8,
    pub production: u8,
    pub training: i8,
    pub left: u16,
    pub total: u16,
    pub claimant: i8,
    pub capture: u16,
    #[serde(default)]
    pub disabled_until: u32,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Unit {
    #[serde(default)]
    pub facing:Option<usize>,
    #[serde(default)]
    pub boarded_on: Option<usize>,
    pub id: usize,
    pub owner: usize,
    pub kind: u8,
    pub tile: usize,
    pub hp: f32,
    pub to: usize,
    pub path: Vec<usize>,
    pub left: u16,
    pub total: u16,
    pub ready: u32,
    pub moved: u32,
    pub hurt: u32,
    pub ability_ready: u32,
    pub mode: u8,
    pub effect_until: u32,
    pub revealed: u32,
    pub work: u16,
    pub founding: bool,
    #[serde(default = "super::uncommitted")]
    pub refit: i8,
    #[serde(default)]
    pub locked_until: u32,
    #[serde(default)]
    pub fire_at: u32,
    #[serde(default)]
    pub aim: usize,
    #[serde(default)]
    pub focus: Option<usize>,
    #[serde(default)]
    pub salvo: u8,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Strike {
    pub owner: usize,
    pub kind: u8,
    pub from: usize,
    pub to: usize,
    pub left: u16,
    pub total: u16,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Game {
    /// Optional offline acceleration for an immutable adjacency graph. Never
    /// serialized; callers changing tile adjacency must clear/rebuild this.
    #[serde(skip)]
    pub distance_cache: Option<std::sync::Arc<Vec<Vec<u16>>>>,
    pub seed: u32,
    pub tick: u32,
    pub difficulty: u8,
    pub tiles: Vec<Tile>,
    pub players: Vec<Player>,
    pub cities: Vec<City>,
    pub squads: Vec<Unit>,
    pub strikes: Vec<Strike>,
    pub events: Vec<Event>,
    #[serde(default)]
    pub feedback: Vec<feedback::Feedback>,
    #[serde(default)]
    pub next_feedback: u64,
    pub discoveries: Vec<Discovery>,
    pub next_unit: usize,
    pub winner: i8,
    pub victory: u8,
    #[serde(skip)]
    pub last_order: Option<(String, usize, usize, u8)>,
}
impl Game {
    pub fn new(seed: u32, difficulty: u8) -> Self {
        Self::with_players(seed, 8, difficulty)
    }
    pub fn with_players(seed: u32, count: usize, difficulty: u8) -> Self {
        let count = count.clamp(2, 8);
        // Keep the full globe and eight-player spacing. Smaller lobbies occupy
        // neighbouring starts, instead of spreading two capitals across the globe.
        let old = super::Game::new(seed, 8, difficulty);
        let mut tiles = old.tiles;
        if count < 8 {
            let anchor = tiles.iter().find(|t| t.capital == 0).unwrap().p;
            let mut starts: Vec<_> = tiles
                .iter()
                .enumerate()
                .filter(|(_, t)| t.capital >= 0)
                .map(|(i, _)| i)
                .collect();
            starts.sort_by(|&a, &b| {
                super::dot(tiles[b].p, anchor)
                    .total_cmp(&super::dot(tiles[a].p, anchor))
                    .then_with(|| a.cmp(&b))
            });
            for t in &mut tiles {
                t.capital = -1;
            }
            for (p, &tile) in starts.iter().take(count).enumerate() {
                tiles[tile].capital = p as i8;
            }
        }
        for t in &mut tiles {
            t.owner = -1;
            t.army = 0.;
            t.building = 0;
            t.site = false;
            t.work = 0;
            t.next = 0;
        }
        let cities = tiles
            .iter()
            .enumerate()
            .filter(|(_, t)| t.capital >= 0)
            .map(|(i, t)| City {
                tile: i,
                owner: t.capital as usize,
                capital: t.capital,
                radius: 1,
                production: 1,
                training: -1,
                left: 0,
                total: 0,
                claimant: -1,
                capture: 0,
                disabled_until: 0,
            })
            .collect();
        let players = (0..count)
            .map(|p| Player {
                civ: p as u8,
                tag: 1001 + p as u16,
                name: format!("Computer {}", p + 1),
                bot: p != 0,
                alive: true,
                gold: 170.,
                unlocked: vec![0, 12, 13],
                research: -1,
                research_left: 0,
                research_queue: vec![],
                cooldown: 0,
                launch: 0,
                launch_tile: None,
                domination: 0,
                mandate: 0,
                score: 1,
            })
            .collect();
        let mut g = Self {
            distance_cache: None,
            seed,
            tick: 0,
            difficulty: difficulty.min(2),
            tiles,
            players,
            cities,
            squads: vec![],
            strikes: vec![],
            events: vec![],
            feedback: vec![],
            next_feedback: 0,
            discoveries: vec![],
            next_unit: 1,
            winner: -1,
            victory: 0,
            last_order: None,
        };
        for p in 0..count {
            let tile = g.cities.iter().find(|c| c.owner == p).unwrap().tile;
            g.spawn(p, 0, tile);
            for k in [12, 13] {
                if let Some(t) = g.tiles[tile]
                    .near
                    .iter()
                    .copied()
                    .find(|&t| g.tiles[t].terrain > 0 && g.occupant(t).is_none())
                {
                    g.spawn(p, k, t);
                }
            }
        }
        g.control();
        g.seed_discoveries(hash(seed ^ 0x6d3a810c));
        g
    }
    fn spawn(&mut self, owner: usize, kind: u8, tile: usize) {
        self.squads.push(Unit {
            facing: self.tiles[tile].near.first().copied(),
            boarded_on: None,
            id: self.next_unit,
            owner,
            kind,
            tile,
            hp: spec(kind).hp,
            to: tile,
            path: vec![tile],
            left: 0,
            total: 0,
            ready: self.tick + 3,
            moved: self.tick,
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
        });
        self.next_unit += 1;
    }
    pub fn occupant(&self, tile: usize) -> Option<&Unit> {
        self.squads.iter().find(|u| u.tile == tile && u.boarded_on.is_none())
    }
    pub fn distances(&self, start: usize) -> Vec<u16> {
        if let Some(rows) = &self.distance_cache {
            if let Some(row) = rows.get(start) { return row.clone(); }
        }
        let mut d = vec![u16::MAX; self.tiles.len()];
        if start >= d.len() {
            return d;
        }
        d[start] = 0;
        let mut q = VecDeque::from([start]);
        while let Some(i) = q.pop_front() {
            for &j in &self.tiles[i].near {
                if d[j] == u16::MAX {
                    d[j] = d[i] + 1;
                    q.push_back(j);
                }
            }
        }
        d
    }
    pub fn cache_distances(&mut self) {
        self.distance_cache = None;
        self.distance_cache = Some(std::sync::Arc::new((0..self.tiles.len()).map(|i|self.distances(i)).collect()));
    }
    pub fn weather(&self) -> Vec<[f32; 4]> {
        (0..3)
            .map(|k| {
                let a = self.seed as f32 * 0.0001 + self.tick as f32 * 0.0014 + k as f32 * 2.094;
                let p = norm([
                    a.cos() * 0.9,
                    (a * 0.7 + k as f32).sin() * 0.48,
                    a.sin() * 0.9,
                ]);
                [p[0], p[1], p[2], 0.89 + k as f32 * 0.008]
            })
            .collect()
    }
    pub fn storm(&self, i: usize) -> f32 {
        self.weather()
            .iter()
            .map(|w| ((dot(self.tiles[i].p, [w[0], w[1], w[2]]) - w[3]) / 0.09).clamp(0., 1.))
            .fold(0., f32::max)
    }
    pub fn vision(&self, p: usize) -> Vec<bool> {
        let mut v = vec![false; self.tiles.len()];
        // A launch broadcasts its pad, not the surrounding army or territory.
        // Humans and every controller receive the same actionable warning.
        for a in self.players.iter().filter(|a|a.alive) {
            if let Some(tile)=a.launch_tile {if tile<v.len(){v[tile]=true;}}
        }
        for c in self.cities.iter().filter(|c| c.owner == p) {
            for (i, d) in self.distances(c.tile).iter().enumerate() {
                if *d <= c.radius as u16 + 1 {
                    v[i] = true;
                }
            }
        }
        for u in self.squads.iter().filter(|u| u.owner == p && u.boarded_on.is_none()) {
            let r = if u.mode == 2 && u.effect_until > self.tick {
                4
            } else {
                spec(u.kind).sight
            };
            for (i, d) in self.distances(u.tile).iter().enumerate() {
                if *d <= r {
                    v[i] = true;
                }
            }
        }
        v
    }
    pub fn detected(&self, p: usize, u: &Unit, vision: &[bool]) -> bool {
        if u.owner == p {
            return true;
        }
        if u.boarded_on.is_some() || !vision[u.tile] {
            return false;
        }
        if u.revealed > self.tick {
            return true;
        }
        let stealth = u.kind == 8 && u.mode == 1
            || u.kind == 5 && u.mode == 1 && self.tiles[u.tile].terrain == 2;
        if !stealth {
            return true;
        }
        let d = self.distances(u.tile);
        self.squads.iter().any(|a| {
            a.owner == p && a.boarded_on.is_none()
                && (d[a.tile] <= 1
                    || ((a.mode == 2 && a.effect_until > self.tick) || matches!(a.kind,9|28|33))
                        && d[a.tile] <= 3)
        })
    }
    pub fn can_enter(&self, kind: u8, tile: usize) -> bool {
        if tile >= self.tiles.len() {
            return false;
        }
        if naval(kind) {self.tiles[tile].terrain==0}
        else if air(kind) {true}
        else if definition(kind).mounted {!matches!(self.tiles[tile].terrain,0|4)}
        else {self.tiles[tile].terrain!=0}
    }

    pub fn move_cost(&self, u: &Unit, to: usize) -> u16 {
        let t = self.tiles[to].terrain;
        let mut n = spec(u.kind).speed;
        if ground(u.kind) {
            if t == 0 {
                n = 18;
            } else if t == 4 {
                n += 7;
            } else if t == 2 {
                n += if u.kind == 5 {
                    0
                } else if u.kind == 1 {
                    7
                } else {
                    3
                };
            }
        }
        if self.storm(to) > 0.5 {
            n += if air(u.kind) {
                5
            } else if t == 0 {
                3
            } else {
                1
            };
        }
        if u.mode == 3 && u.kind == 1 && u.effect_until > self.tick {
            n = n.saturating_sub(2).max(2);
        }
        if u.mode == 1 && u.kind == 8 {
            n += 3;
        }
        n
    }
    /// A guard holds its neighbouring ground. Entering or withdrawing
    /// is legal; crossing between two cells in the same guard's zone is not.
    /// Planning sees only detected guards; execution discovers hidden blockers.
    pub fn guard_blocks(&self, u: &Unit, from: usize, to: usize, vision: Option<&[bool]>) -> bool {
        if air(u.kind) { return false; }
        self.squads.iter().any(|g| g.owner != u.owner && g.hp>0. && g.boarded_on.is_none()
            && g.refit<0 && self.tiles[g.tile].near.contains(&from) && self.tiles[g.tile].near.contains(&to)
            && (g.kind==0 && ground(u.kind) || matches!(g.kind,16|26|30) && naval(u.kind)==naval(g.kind)
                && g.left==0 && g.path.len()==1 && (self.in_front(g,from)||self.in_front(g,to)))
            && vision.is_none_or(|v|self.detected(u.owner,g,v)))
    }

    pub fn space_ready(&self, p: usize) -> bool {
        self.players[p].unlocked.contains(&10)
    }
    pub fn path(&self, u: &Unit, to: usize) -> Option<Vec<usize>> {
        if u.boarded_on.is_some() || (!self.can_enter(u.kind, to) && self.boarding_target(u, to).is_none()) {
            return None;
        }
        let start = u.tile;
        let vision = self.vision(u.owner);
        let occupied: Vec<_> = self
            .squads
            .iter()
            .filter(|s| s.id != u.id && s.boarded_on.is_none() && self.detected(u.owner, s, &vision))
            .collect();
        let mut dist = vec![u32::MAX; self.tiles.len()];
        let mut prev = vec![usize::MAX; self.tiles.len()];
        let mut q = BinaryHeap::new();
        dist[start] = 0;
        q.push(Reverse((0u32, start)));
        while let Some(Reverse((cost, i))) = q.pop() {
            if cost != dist[i] {
                continue;
            }
            if i == to {
                break;
            }
            for &j in &self.tiles[i].near {
                let boarding = j == to && self.boarding_target(u, j).is_some();
                if !boarding && (!self.can_enter(u.kind, j) || occupied.iter().any(|s| s.tile == j)
                    || self.guard_blocks(u, i, j, Some(&vision))) {
                    continue;
                }
                let n = cost + self.move_cost(u, j) as u32;
                if n < dist[j] {
                    dist[j] = n;
                    prev[j] = i;
                    q.push(Reverse((n, j)));
                }
            }
        }
        if dist[to] == u32::MAX {
            return None;
        }
        let mut path = vec![to];
        while *path.last().unwrap() != start {
            path.push(prev[*path.last().unwrap()]);
        }
        path.reverse();
        if start != u.tile {
            path.insert(0, u.tile);
        }
        Some(path)
    }
    pub fn research_info(&self, k: u8) -> Option<(u16, u16, Vec<u8>, u32)> {
        if k>=UNIT_COUNT || !definition(k).researchable {return None;}
        let d=definition(k);
        Some((d.research_cost,d.research_seconds,d.prerequisites.clone(),0))
    }

    pub fn cap(&self, p: usize) -> usize {
        5 + self
            .cities
            .iter()
            .filter(|c| c.owner == p)
            .map(|c| c.radius as usize + 1)
            .sum::<usize>()
    }
    pub fn foundable(&self, tile: usize) -> bool {
        tile < self.tiles.len()
            && matches!(self.tiles[tile].terrain, 1 | 2 | 3)
            && self
                .cities
                .iter()
                .all(|c| self.distances(c.tile)[tile] >= 4)
            && !self
                .squads
                .iter()
                .any(|u| u.founding && u.tile != tile && self.distances(u.tile)[tile] < 4)
    }
    pub fn command(
        &mut self,
        p: usize,
        kind: &str,
        from: usize,
        to: usize,
        value: u8,
    ) -> Result<(), u8> {
        if p >= self.players.len() || self.winner >= 0 || !self.players[p].alive {
            return Err(1);
        }
        if kind == "refit" { return Err(6); }
        let actor = self
            .squads
            .iter()
            .find(|u| u.id == from && u.owner == p)
            .cloned();
        match kind {
            "plan" => {
                if value != 255 && (value >= UNIT_COUNT || !definition(value).researchable) {return Err(6);}
                let a = &mut self.players[p];
                if a.research >= 0 {a.gold += definition(a.research as u8).research_cost as f32;}
                a.research = -1;
                a.research_left = 0;
                a.research_queue.clear();
                if value != 255 {
                    let mut queue = vec![];
                    self.research_path(p, value, &mut queue);
                    self.players[p].research_queue = queue;
                    Self::advance_research(&mut self.players[p]);
                }
            }
            "research" => {
                let (cost, time, req, gate) = self.research_info(value).ok_or(6)?;
                let a = &mut self.players[p];
                if a.research >= 0
                    || a.unlocked.contains(&value)
                    || !req.iter().all(|k| a.unlocked.contains(k))
                    || self.tick < gate
                {
                    return Err(6);
                }
                if a.gold < cost as f32 {
                    return Err(5);
                }
                a.gold -= cost as f32;
                a.research = value as i8;
                a.research_left = time;
            }
            "train" | "upgrade" => {
                let c = self
                    .cities
                    .iter()
                    .position(|c| c.tile == from && c.owner == p)
                    .ok_or(3)?;
                if kind == "train" {
                    if value >= UNIT_COUNT
                        || !self.players[p].unlocked.contains(&value)
                        || self.cities[c].training >= 0
                        || self.squads.iter().filter(|u| u.owner == p).count()
                            + self
                                .cities
                                .iter()
                                .filter(|c| c.owner == p && c.training >= 0)
                                .count()
                            >= self.cap(p)
                    {
                        return Err(6);
                    }
                    if naval(value)
                        && !self.tiles[from]
                            .near
                            .iter()
                            .any(|&i| self.tiles[i].terrain == 0)
                    {
                        return Err(4);
                    }
                    let cost = spec(value).cost as f32;
                    if self.players[p].gold < cost {
                        return Err(5);
                    }
                    self.players[p].gold -= cost;
                    let city = &mut self.cities[c];
                    city.training = value as i8;
                    city.total = (spec(value).train as f32
                        / (1. + (city.production - 1) as f32 * 0.25))
                        .ceil() as u16;
                    city.left = city.total;
                } else {
                    let level = if value == 0 {
                        self.cities[c].radius
                    } else {
                        self.cities[c].production
                    };
                    if value > 1 || level >= 3 {
                        return Err(6);
                    }
                    let cost = if value == 0 {
                        [0., 80., 140.][level as usize]
                    } else {
                        [0., 110., 180.][level as usize]
                    };
                    if self.players[p].gold < cost {
                        return Err(5);
                    }
                    self.players[p].gold -= cost;
                    if value == 0 {
                        self.cities[c].radius += 1;
                        self.control();
                    } else {
                        self.cities[c].production += 1;
                    }
                }
            }
            "move" | "stop" | "ability" | "explore" | "attack" | "disband" | "disembark" | "face" => {
                let index = self
                    .squads
                    .iter()
                    .position(|u| u.id == from && u.owner == p)
                    .ok_or(3)?;
                let u = self.squads[index].clone();
                if u.locked_until > self.tick && !matches!(kind, "move" | "stop") {
                    return Err(2);
                }
                if u.refit >= 0 || u.boarded_on.is_some() {
                    return Err(6);
                }
                if kind == "move" || kind == "stop" {
                    let target = if kind == "stop" { u.tile } else { to };
                    if target >= self.tiles.len() {
                        return Err(4);
                    }
                    let path = if kind == "stop" { vec![u.tile] } else {
                        self.path(&u, target).ok_or(4)?
                    };
                    let s = &mut self.squads[index];
                    s.focus = None;
                    s.to = target;
                    s.path = path;
                    s.founding = false;
                    s.work = 0;
                    if u.locked_until <= self.tick && !matches!(s.kind, 1 | 6 | 8) {
                        s.mode = 0;
                    }
                    // Orders replace intent, never the previous step's cooldown.
                    if kind == "move" {
                        self.move_unit(index);
                    }
                } else if kind == "face" {
                    if !definition(u.kind).directional || u.left>0 || !self.tiles[u.tile].near.contains(&to) {return Err(4);}
                    self.squads[index].facing=Some(to);
                    self.squads[index].locked_until=self.tick+8;
                    self.squads[index].path=vec![u.tile];
                    self.squads[index].to=u.tile;
                } else if kind == "disembark" {
                    self.disembark(index, to)?;
                } else if kind == "disband" {
                    if self.tiles[u.tile].owner == p as i8 {
                        self.players[p].gold += spec(u.kind).cost as f32 * 0.25;
                    }
                    self.squads.remove(index);
                    self.sync_passengers();
                } else if kind == "attack" {
                    self.order_attack(index, to, 0)?;
                } else if kind == "explore" {
                    self.claim(index)?;
                    let healed = self.squads[index].hp - u.hp;
                    if healed > 0. {
                        self.feedback("heal", &u, u.tile, 0, healed, 2);
                    }
                } else {
                    self.ability(index, to, value)?;
                }
            }
            _ => return Err(6),
        }
        if let Some(u) = actor {
            if matches!(
                kind,
                "move" | "stop" | "disband" | "refit" | "explore" | "ability" | "disembark"
            ) && !self
                .squads
                .iter()
                .any(|a| a.id == u.id && a.fire_at > self.tick && kind == "ability")
            {
                let target = if kind == "move" || kind == "disembark"
                    || kind == "ability" && (u.kind == 11 || u.kind == 8 && value == 2)
                {
                    to
                } else {
                    u.tile
                };
                self.feedback(kind, &u, target, value, 0., 2);
            }
        }

        self.last_order = Some((kind.to_owned(), from, to, value));
        Ok(())
    }
    fn ability(&mut self, i: usize, to: usize, value: u8) -> Result<(), u8> {
        let u = self.squads[i].clone();
        // Defensive infantry and armour dig in by holding a position; no
        // repeated stance button or player-order expenditure is required.
        if matches!(u.kind,0|3) { return Err(6); }
        if u.ability_ready > self.tick || u.left > 0 {
            return Err(6);
        }
        let p = u.owner;
        let k = u.kind;
        if value == 0 && matches!(k, 1 | 2 | 4 | 6 | 7) || k == 5 && value == 1 {
            return self.order_attack(i, to, 1);
        }
        self.squads[i].focus = None;
        if k == SETTLER {
            if value != 0 || !self.foundable(u.tile) {
                return Err(4);
            }
            let cost = 35. + self.cities.iter().filter(|c| c.owner == p).count() as f32 * 25.;
            if self.players[p].gold < cost {
                return Err(5);
            }
            self.players[p].gold -= cost;
            self.squads[i].founding = true;
            self.squads[i].work = 25;
            self.squads[i].path = vec![u.tile];
            self.squads[i].to = u.tile;
        } else if k == 10 {
            if !self.space_ready(p) || !self
                .cities
                .iter()
                .any(|c| c.tile == u.tile && c.owner == p && c.production == 3)
                || self.players[p].launch_tile.is_some()
            {
                return Err(6);
            }
            if self.players[p].gold < 180. {
                return Err(5);
            }
            self.players[p].gold -= 180.;
            self.players[p].launch_tile = Some(u.tile);
            self.squads[i].mode = 3;
        } else if k == 11 || k == 8 && value == 2 {
            let max = if k == 11 { 9 } else { 7 };
            if to >= self.tiles.len() || self.distances(u.tile)[to] > max || !self.vision(p)[to] {
                return Err(4);
            }
            if k == 8 && !self.players[p].unlocked.contains(&9) {
                return Err(6);
            }
            let cost = if k == 11 { 150. } else { 65. };
            if self.players[p].gold < cost {
                return Err(5);
            }
            self.players[p].gold -= cost;
            self.strikes.push(Strike {
                owner: p,
                kind: if k == 11 { 2 } else { 1 },
                from: u.tile,
                to,
                left: 14,
                total: 14,
            });
            self.squads[i].ability_ready = self.tick + 100;
            self.squads[i].mode = 0;
            self.squads[i].revealed = self.tick + 30;
            self.event(4, p, u.tile);
        } else if (k == 8 || k == 5) && value == 0 {
            self.squads[i].mode = if u.mode == 1 { 0 } else { 1 };
            self.squads[i].ability_ready = self.tick + 12;
        } else if (k == 8 || k == 7 || k == 9 || k == 12) && value == 1 {
            self.squads[i].mode = 2;
            self.squads[i].effect_until = self.tick + 16;
            self.squads[i].revealed = self.tick + 24;
            self.squads[i].ability_ready = self.tick + 45;
            self.event(3, p, u.tile);
        } else if value == 0 && matches!(k, 0 | 1 | 2 | 3 | 4 | 6 | 7 | 9 | 12) {
            self.squads[i].mode = 3;
            self.squads[i].effect_until = self.tick + 18;
            self.squads[i].ability_ready = self.tick + 45;
        } else {
            return Err(6);
        }
        let duration = if k == SETTLER {
            25
        } else if k == 11 {
            36
        } else if k == 8 && value == 2 {
            28
        } else if value == 1 {
            12
        } else if matches!(k, 5 | 8) {
            8
        } else {
            18
        };
        self.squads[i].locked_until = self.tick + duration;
        self.squads[i].ability_ready = self.tick + duration;
        Ok(())
    }
    fn event(&mut self, kind: u8, p: usize, tile: usize) {
        self.events.push(Event {
            tick: self.tick,
            kind,
            player: p,
            tile,
        });
    }
    fn territory_sources(&self) -> Vec<Option<usize>> {
        self.territory_sources_expanding(None)
    }
    fn territory_sources_expanding(&self, expanding: Option<usize>) -> Vec<Option<usize>> {
        let mut best = vec![(u16::MAX, usize::MAX); self.tiles.len()];
        for (n, c) in self.cities.iter().enumerate() {
            for (i, d) in self.distances(c.tile).into_iter().enumerate() {
                let radius = c.radius as u16 + u16::from(expanding == Some(n) && c.radius < 3);
                if d <= radius && self.tiles[i].terrain > 0 && (d, n) < best[i] {
                    best[i] = (d, n);
                }
            }
        }
        best.into_iter()
            .map(|(_, n)| if n == usize::MAX { None } else { Some(n) })
            .collect()
    }
    fn farmland(&self, tile: usize) -> bool {
        self.tiles[tile].terrain == 1 && !self.cities.iter().any(|c| c.tile == tile)
    }
    fn farm_counts(&self, sources: &[Option<usize>]) -> Vec<usize> {
        let mut counts = vec![0; self.cities.len()];
        for (tile, source) in sources.iter().enumerate() {
            if self.farmland(tile) {
                if let Some(city) = source { counts[*city] += 1; }
            }
        }
        counts
    }
    fn cover(&self, u: &Unit) -> f32 {
        if self.tiles[u.tile].terrain == 2 && ground(u.kind) { 0.75 } else { 1. }
    }
    fn control(&mut self) {
        let sources = self.territory_sources();
        for (i, t) in self.tiles.iter_mut().enumerate() {
            t.owner = sources[i].map_or(-1, |n| self.cities[n].owner as i8);
            t.building = 0;
        }
        for c in &self.cities {
            self.tiles[c.tile].owner = c.owner as i8;
            self.tiles[c.tile].building = if self.players[c.owner].launch_tile == Some(c.tile) {
                6
            } else {
                2
            };
        }
    }
    pub fn step(&mut self, ticks: u32) {
        for _ in 0..ticks.min(7200) {
            if self.winner >= 0 {
                break;
            }
            self.tick_one(true);
        }
    }
    pub fn tick_one(&mut self, bots: bool) {
        if self.winner >= 0 {
            return;
        }
        self.tick += 1;
        self.events.retain(|e| self.tick - e.tick < 12);
        self.feedback
            .retain(|e| self.tick.saturating_sub(e.tick) < 12);
        self.eliminate_landless();
        if bots {
            for p in 0..self.players.len() {
                if self.players[p].bot && self.players[p].alive && (self.tick + p as u32) % 2 == 0 {
                    self.bot(p);
                }
            }
        }
        self.encounters();
        self.movement();
        self.combat();
        self.support_units();
        self.development();
        self.victory();
    }
    fn movement(&mut self) {
        let mut order: Vec<_> = (0..self.squads.len()).collect();
        order.sort_by_key(|&i| hash(self.seed ^ self.tick / 6 ^ self.squads[i].id as u32));
        for i in order {
            // Cooldowns expire even after a route is cancelled or completed.
            // Bot orders may already have stepped this unit on this tick.
            if self.squads[i].moved != self.tick {
                self.squads[i].left = self.squads[i].left.saturating_sub(1);
            }
            self.move_unit(i);
            let u=&mut self.squads[i];
            if matches!(u.kind,0|3) {
                let dug_in=u.boarded_on.is_none()&&u.refit<0&&u.left==0&&u.path.len()==1
                    && self.tick.saturating_sub(u.moved)>=8;
                u.mode=if dug_in{3}else{0};
                u.effect_until=if dug_in{self.tick+2}else{0};
            }
        }
    }
    fn move_unit(&mut self, i: usize) {
        let u = self.squads[i].clone();
        if u.boarded_on.is_some() || u.left > 0 || u.locked_until > self.tick || u.founding || u.refit >= 0 || u.path.len() < 2 {
            return;
        }
        let to = u.path[1];
        let boarding = self.boarding_target(&u, to);
        if !self.tiles[u.tile].near.contains(&to) || (!self.can_enter(u.kind, to) && boarding.is_none()) {
            self.squads[i].path = vec![u.tile];
            self.squads[i].to = u.tile;
            return;
        }
        if self.guard_blocks(&u, u.tile, to, None) {
            // A late or previously concealed guard stops the route; never walk
            // through its zone just because a route was queued earlier.
            self.squads[i].path = vec![u.tile];
            self.squads[i].to = u.tile;
            return;
        }
        if let Some(ship) = boarding {
            self.board(i, ship, to);
            return;
        }
        if let Some(other) = self.occupant(to).cloned() {
            if other.owner != u.owner {
                for s in &mut self.squads {
                    if s.id == other.id || s.id == u.id { s.revealed = self.tick + 8; }
                }
                self.squads[i].path = vec![u.tile];
                self.squads[i].to = u.tile;
            } else if self.tick % 5 == 0 {
                if let Some(path) = self.path(&u, u.to) {
                    self.squads[i].path = path;
                }
            }
            return;
        }
        let cooldown = self.move_cost(&u, to);
        let facing=self.tiles[to].near.iter().copied().max_by(|&a,&b|{
            let ahead=|t:usize|dot(self.tiles[t].p,self.tiles[to].p)-dot(self.tiles[t].p,self.tiles[u.tile].p);
            ahead(a).total_cmp(&ahead(b))
        });
        let s = &mut self.squads[i];
        s.facing=facing;
        s.tile = to;
        if matches!(s.kind,0|3) {s.mode=0;s.effect_until=0;}
        s.moved = self.tick;
        s.path.remove(0);
        s.left = cooldown;
        s.total = cooldown;
        self.sync_passengers();
        let _ = self.claim(i);
    }
    fn line_of_sight(&self, from: usize, to: usize) -> bool {
        let d = self.distances(to);
        let mut q = VecDeque::from([from]);
        let mut seen = vec![false; self.tiles.len()];
        seen[from] = true;
        while let Some(i) = q.pop_front() {
            if i == to {
                return true;
            }
            for &j in &self.tiles[i].near {
                if !seen[j] && d[j] < d[i] && (j == to || self.tiles[j].terrain != 4) {
                    seen[j] = true;
                    q.push_back(j);
                }
            }
        }
        false
    }
    pub fn multiplier(a: u8, b: u8) -> f32 {
        if a>=14 || b>=14 {
            if a==32 {return if air(b){2.5}else{0.25};}
            if air(b) && !matches!(a,2|6|7|9|14|23|32) {return 0.;}
            if definition(a).counters.contains(&b) {return 1.9;}
            if b==18 && matches!(a,2|14) {return 0.35;}
            if b==29 && !matches!(a,8|21|4|35) {return 0.65;}
            if b==3 {return 0.78;}
            return 1.;
        }
        match (a, b) {
            (0, 1) => 2.2,
            (1, 2 | 4 | 10 | 13) => 1.8,
            (2, 0) => 2.2,
            (3, 0 | 1 | 2 | 5) => 1.6,
            (4, 3 | 9) => 1.85,
            (5, 4 | 10 | 11 | 13) => 2.,
            (6, 3 | 4) => 1.75,
            (7, 6 | 8) => 1.7,
            (8, 7 | 9) => 2.,
            (9, 6) => 2.2,
            (_, 13) => 1.5,
            (_, 3) => 0.78,
            _ => 1.,
        }
    }
    pub fn damage(&self, a: &Unit, b: &Unit) -> f32 {
        let mut x = spec(a.kind).damage * Self::multiplier(a.kind, b.kind);
        if self.tiles[a.tile].terrain == 0 && ground(a.kind) {
            return 0.;
        }
        if naval(a.kind) && self.tiles[b.tile].terrain != 0 {
            x *= 0.65;
        }
        if a.kind == 8 && self.tiles[b.tile].terrain != 0 {
            return 0.;
        }
        x *= self.cover(b);
        if definition(b.kind).directional && b.kind!=34 && b.left==0 && b.path.len()==1 && self.in_front(b,a.tile) {
            x *= if matches!(a.kind,18|4|25|35|11){0.8}else{0.25};
        }
        if self.squads.iter().any(|u|u.kind==34 && u.owner==b.owner && u.id!=b.id && u.boarded_on.is_none() && u.left==0 && u.path.len()==1 && self.tiles[u.tile].near.contains(&b.tile) && self.in_front(u,a.tile)) {x*=0.6;}

        if b.mode == 3 && b.effect_until > self.tick && matches!(b.kind, 0 | 3 | 7 | 9) {
            x *= 0.55;
        }
        if a.mode == 3 && a.effect_until > self.tick && matches!(a.kind, 1 | 2 | 4 | 6) {
            x *= 1.45;
        }
        if a.kind == 1 && self.tick - a.moved < 12 && matches!(self.tiles[b.tile].terrain, 1 | 3) {
            x *= 1.25;
        }
        if a.kind == 6 {
            x *= 1. - self.storm(b.tile) * 0.5;
        }
        if a.kind == 8 && a.mode == 1 {
            x *= 0.65;
        }
        x
    }
    fn combat(&mut self) {
        let mut hits = vec![0.; self.squads.len()];
        let mut fired = vec![];
        // Standing combat pieces maintain their position and fire when recovered.
        // Explicit focus picks a target; it never grants an extra shot or chase.
        let mut visions: Vec<Option<Vec<bool>>> = vec![None;self.players.len()];
        for i in 0..self.squads.len() {
            let u = self.squads[i].clone();
            if u.boarded_on.is_some() || u.refit >= 0
                || u.founding
                || u.left > 0
                || u.locked_until > self.tick
                || u.fire_at > 0
                || u.ready > self.tick
                || u.path.len() > 1
                || spec(u.kind).damage == 0.
            {
                continue;
            }
            let d = self.distances(u.tile);
            let sp = spec(u.kind);
            let mut targets: Vec<_> = self.squads.iter()
                .filter(|b| b.boarded_on.is_none() && b.owner != u.owner
                    && d[b.tile] >= sp.min && d[b.tile] <= sp.range
                    && (u.owner == 8 || self.detected(u.owner, b,
                        visions[u.owner].get_or_insert_with(||self.vision(u.owner)))))
                .map(|b| (u.focus != Some(b.id), d[b.tile], b.id, b.tile)).collect();
            targets.sort_unstable();
            for (_,_,_,tile) in targets {
                // Never automatically splash our own formation. A deliberate
                // barrage can accept that risk; normal hold-position fire cannot.
                if definition(u.kind).splash && self.squads.iter().any(|a| a.owner == u.owner
                    && a.boarded_on.is_none() && self.tiles[tile].near.contains(&a.tile)) { continue; }
                if self.order_attack(i, tile, 0).is_ok() { break; }
            }
        }
        let mut pushes = vec![];
        for (i, a) in self.squads.iter().enumerate() {
            if a.boarded_on.is_some() || a.fire_at == 0 || a.fire_at > self.tick {
                continue;
            }
            let target = a.aim;
            let d = self.distances(target);
            let splash = definition(a.kind).splash || a.salvo > 0 && matches!(a.kind, 2 | 6 | 7);
            if a.kind == 5 && a.salvo > 0 {
                for c in &mut self.cities {
                    if c.tile == target && c.owner != a.owner {
                        c.disabled_until = self.tick + 24;
                    }
                }
            } else {
                for (j, b) in self.squads.iter().enumerate() {
                    if b.boarded_on.is_none() && (b.tile == target && b.owner != a.owner || splash && d[b.tile] == 1) {
                        let mut damage = self.damage(a, b);
                        if a.salvo > 0 {
                            damage *= 1.35;
                        }
                        if b.tile != target {
                            damage *= if a.kind == 6 { 0.65 } else { 0.4 };
                        }
                        hits[j] += damage;
                        if a.kind == 1 && a.salvo > 0 && b.tile == target {
                            pushes.push((b.id, a.tile));
                        }
                    }
                }
            }
            fired.push((i, target));
        }
        for (i, t) in fired {
            if self.squads[i].kind==21 {hits[i]+=self.squads[i].hp;}
            self.squads[i].fire_at = 0;
            // Keep the focus between shots. Move/Stop/abilities replace it.
            self.squads[i].revealed = self.tick + 12;
            self.event(
                if self.squads[i].kind == 4 || self.squads[i].kind == 6 {
                    2
                } else {
                    1
                },
                self.squads[i].owner,
                t,
            );
        }
        // Cavalry shock can dislodge a defender, but only into a genuinely vacant hex.
        for (id, from) in pushes {
            if let Some(i) = self.squads.iter().position(|u| u.id == id) {
                let d = self.distances(from);
                let u = self.squads[i].clone();
                if let Some(to) = self.tiles[u.tile].near.iter().copied().find(|&t| {
                    d[t] > d[u.tile] && self.can_enter(u.kind, t) && self.occupant(t).is_none()
                }) {
                    self.squads[i].tile = to;
                    self.squads[i].moved = self.tick;
                    self.squads[i].mode = 0;
                    self.squads[i].effect_until = 0;
                    self.squads[i].path = vec![to];
                    self.squads[i].left = 0;
                    self.squads[i].locked_until = self.squads[i].locked_until.max(self.tick + 4);
                }
            }
        }
        for s in &mut self.strikes {
            s.left = s.left.saturating_sub(1);
        }
        let impacts: Vec<_> = self
            .strikes
            .iter()
            .filter(|s| s.left == 0)
            .cloned()
            .collect();
        for s in impacts {
            let d = self.distances(s.to);
            for (i, u) in self.squads.iter().enumerate() {
                if u.boarded_on.is_none() && d[u.tile] <= if s.kind == 2 { 1 } else { 0 } {
                    hits[i] += (if s.kind == 2 { 140. } else { 75. }) * self.cover(u);
                }
            }
            self.event(2, s.owner, s.to);
        }
        self.strikes.retain(|s| s.left > 0);
        for i in 0..self.squads.len() {
            if hits[i] > 0. {
                let u = self.squads[i].clone();
                self.feedback("hit", &u, u.tile, 0, hits[i].min(u.hp), 2);
            }
        }
        for (i, u) in self.squads.iter_mut().enumerate() {
            if hits[i] > 0. {
                u.hp -= hits[i];
                u.hurt = self.tick;
            }
        }
        self.sync_passengers();
    }
    fn advance_research(p: &mut Player) {
        if p.alive && p.research < 0 {
            if let Some(&k) = p.research_queue.first() {
                let d = definition(k);
                if p.gold >= d.research_cost as f32 && d.prerequisites.iter().all(|k|p.unlocked.contains(k)) {
                    p.gold -= d.research_cost as f32;
                    p.research = k as i8;
                    p.research_left = d.research_seconds;
                    p.research_queue.remove(0);
                }
            }
        }
    }
    fn development(&mut self) {
        let mut changed = false;
        let farms = self.farm_counts(&self.territory_sources());
        for p in &mut self.players {
            if p.research >= 0 {
                p.research_left = p.research_left.saturating_sub(1);
                if p.research_left == 0 {
                    p.unlocked.push(p.research as u8);
                    p.research = -1;
                }
            }
            p.research_queue.retain(|k|!p.unlocked.contains(k)&&p.research!=*k as i8);
            Self::advance_research(p);
        }
        for i in 0..self.cities.len() {
            let c = self.cities[i].clone();
            let occupant = self.occupant(c.tile).cloned();
            if let Some(u) = occupant.filter(|u| {
                u.owner < self.players.len()
                    && u.owner != c.owner
                    && ground(u.kind)
                    && u.left == 0
            }) {
                if self.cities[i].claimant != u.owner as i8 {
                    self.cities[i].claimant = u.owner as i8;
                    self.cities[i].capture = 0;
                }
                if u.hurt == 0 || self.tick.saturating_sub(u.hurt) > 2 {
                    self.cities[i].capture += 1;
                }
                if self.cities[i].capture >= if u.kind == 5 { 6 } else { 12 } {
                    self.cities[i].owner = u.owner;
                    self.cities[i].training = -1;
                    self.cities[i].left = 0;
                    self.cities[i].claimant = -1;
                    self.cities[i].capture = 0;
                    changed = true;
                    self.event(2, u.owner, c.tile);
                }
            } else {
                self.cities[i].capture = 0;
                self.cities[i].claimant = -1;
            }
            if self.cities[i].owner != c.owner {
                continue;
            }
            if c.training >= 0 && c.disabled_until <= self.tick {
                self.cities[i].left = self.cities[i].left.saturating_sub(1);
                if self.cities[i].left == 0 {
                    let mut spots = vec![c.tile];
                    spots.extend(self.tiles[c.tile].near.iter().copied());
                    if let Some(tile) = spots.into_iter().find(|&t| {
                        self.occupant(t).is_none()
                            && self.can_enter(c.training as u8, t)
                            && (naval(c.training as u8) || self.tiles[t].terrain > 0)
                    }) {
                        self.spawn(c.owner, c.training as u8, tile);
                        self.cities[i].training = -1;
                    }
                }
            }
            if self.tick % 5 == 0 && c.disabled_until <= self.tick {
                let blockade = self.squads.iter().any(|u| {
                    u.owner != c.owner
                        && naval(u.kind)
                        && self.tiles[c.tile].near.contains(&u.tile)
                });
                self.players[c.owner].gold +=
                    (4. + c.production as f32 * 4. + farms[i] as f32 * 0.25)
                        * if blockade { 0.5 } else { 1. };
            }
        }
        self.eliminate_landless();
        let mut founded = vec![];
        for i in 0..self.squads.len() {
            let u = self.squads[i].clone();
            if u.boarded_on.is_some() { continue; }
            if u.refit >= 0 {
                self.squads[i].work = self.squads[i].work.saturating_sub(1);
                if self.squads[i].work == 0 {
                    self.squads[i].kind = u.refit as u8;
                    self.squads[i].hp = (u.hp / spec(u.kind).hp * spec(u.refit as u8).hp)
                        .min(spec(u.refit as u8).hp);
                    self.squads[i].refit = -1;
                }
                continue;
            }
            if u.founding {
                if u.hurt == 0 || self.tick.saturating_sub(u.hurt) > 2 {
                    self.squads[i].work = self.squads[i].work.saturating_sub(1);
                }
                if self.squads[i].work == 0 && self.foundable(u.tile) {
                    founded.push((u.id, u.owner, u.tile));
                }
            } else if self.tick % 5 == 0
                && self.tick.saturating_sub(u.hurt) > 18
                && u.left == 0
                && self.tiles[u.tile].owner == u.owner as i8
            {
                self.squads[i].hp = (u.hp + 4.).min(spec(u.kind).hp);
            }
            if u.mode == 3 && u.effect_until <= self.tick && u.kind != 10 {
                self.squads[i].mode = 0;
            }
        }
        for (id, p, tile) in founded {
            self.cities.push(City {
                tile,
                owner: p,
                capital: -1,
                radius: 1,
                production: 1,
                training: -1,
                left: 0,
                total: 0,
                claimant: -1,
                capture: 0,
                disabled_until: 0,
            });
            self.squads.retain(|u| u.id != id);
            changed = true;
            self.event(3, p, tile);
        }
        for p in 0..self.players.len() {
            if self.tick % 10 == 0 {
                let upkeep = self
                    .squads
                    .iter()
                    .filter(|u| u.owner == p && u.kind != SETTLER)
                    .count()
                    .saturating_sub(3) as f32
                    * 0.7;
                self.players[p].gold = (self.players[p].gold - upkeep).max(0.);
            }
            if let Some(tile) = self.players[p].launch_tile {
                if self.space_ready(p) && self.cities.iter().any(|c| c.tile == tile && c.owner == p)
                    && self.squads.iter().any(|u| {
                        u.tile == tile
                            && u.owner == p
                            && u.kind == 10
                            && u.left == 0
                            && (u.hurt == 0 || self.tick.saturating_sub(u.hurt) > 2)
                    })
                {
                    self.players[p].launch += 1;
                } else {
                    self.players[p].launch = self.players[p].launch.saturating_sub(2);
                    if self.players[p].launch == 0 {
                        self.players[p].launch_tile = None;
                    }
                }
            }
        }
        if changed {
            self.control();
        }
    }
    fn victory(&mut self) {
        self.eliminate_landless();
        for p in 0..self.players.len() {
            let cities = self.cities.iter().filter(|c| c.owner == p).count();
            if !self.players[p].alive {
                continue;
            }
            self.players[p].score = cities as u32;
            // Retain save fields for compatibility, but they no longer score or win.
            self.players[p].domination = 0;
            self.players[p].mandate = 0;
        }
        let mut winners: Vec<_> = (0..self.players.len())
            .filter(|&p| {
                self.players[p].alive
                    && (self.space_ready(p) && self.players[p].launch >= SPACE_GOAL
                        || self.players.iter().filter(|a| a.alive).count() == 1)
            })
            .collect();
        winners.sort_by_key(|&p| {
            Reverse((
                self.players[p].launch >= SPACE_GOAL,
                hash(self.seed ^ p as u32),
            ))
        });
        if let Some(&p) = winners.first() {
            self.winner = p as i8;
            self.victory = if self.players[p].launch >= SPACE_GOAL {
                2
            } else {
                1
            };
        }
    }
    pub fn view(&self, p: usize) -> Value {
        let spectator = !self.players[p].alive;
        let v = if spectator {
            vec![true; self.tiles.len()]
        } else {
            self.vision(p)
        };
        let sources = self.territory_sources();
        let farms = self.farm_counts(&sources);
        let tiles:Vec<_>=self.tiles.iter().enumerate().map(|(i,t)|json!({"owner":if v[i]{t.owner}else{-2},"city":sources[i].filter(|&n| v[i] && (spectator || self.cities[n].owner == p || v[self.cities[n].tile])).map(|n|self.cities[n].tile),"building":if v[i]{t.building}else{0},"visible":v[i],"storm":self.storm(i)})).collect();
        let players:Vec<_>=self.players.iter().enumerate().map(|(i,a)|if i==p{serde_json::to_value(a).unwrap()}else{json!({"civ":a.civ,"tag":a.tag,"name":a.name,"bot":a.bot,"alive":a.alive,"score":a.score,"mandate":a.mandate,"launch":a.launch,"launch_tile":a.launch_tile,"domination":a.domination})}).collect();
        let squads: Vec<_> = self
            .squads
            .iter()
            .filter(|u| spectator || self.detected(p, u, &v))
            .map(|u| {
                let mut a = u.clone();
                if u.owner != p {
                    a.to = a.tile;
                    a.path = vec![a.tile];
                    a.left = 0;
                    a.total = 0;
                    a.ability_ready = 0;
                    a.ready = 0;
                    a.focus = None;
                    a.aim = a.tile;
                    a.fire_at = 0;
                    a.salvo = 0;
                }
                a
            })
            .collect();
        let cities: Vec<_> = self
            .cities
            .iter()
            .enumerate()
            .filter(|(_, c)| v[c.tile] || c.owner == p || c.capital >= 0)
            .map(|(n, c)| {
                let mut a = c.clone();
                if c.owner != p {
                    a.training = -1;
                    a.left = 0;
                    a.total = 0;
                    if !v[c.tile] {
                        a.radius = 1;
                        a.production = 1;
                        a.capture = 0;
                        a.claimant = -1;
                    }
                }
                let mut value = serde_json::to_value(a).unwrap();
                if c.owner == p || spectator {
                    value["farms"] = json!(farms[n]);
                    value["income"] = json!(4. + c.production as f32 * 4. + farms[n] as f32 * 0.25);
                    if c.owner == p && c.radius < 3 {
                        let expanded = self.territory_sources_expanding(Some(n));
                        let tiles: Vec<_> = expanded.iter().enumerate()
                            .filter(|(i, source)| **source == Some(n) && sources[*i] != Some(n) && v[*i])
                            .map(|(i, _)| i).collect();
                        let new_farms = tiles.iter().filter(|&&i| self.farmland(i)
                            && sources[i].is_none_or(|other| self.cities[other].owner != p)).count();
                        value["expansion_tiles"] = json!(tiles);
                        value["expansion_income"] = json!(new_farms as f32 * 0.25);
                    }
                }
                value
            })
            .collect();
        let strikes: Vec<_> = self
            .strikes
            .iter()
            .filter(|s| s.owner == p || v[s.to])
            .map(|s| {
                let mut a = s.clone();
                if a.owner != p && !v[a.from] {
                    a.from = a.to;
                }
                a
            })
            .collect();
        let events: Vec<_> = self
            .events
            .iter()
            .filter(|e| e.player == p || v[e.tile])
            .collect();
        let feedback: Vec<_> = self.feedback.iter()
            .filter(|e| (spectator && matches!(e.action.as_str(), "shot" | "hit" | "heal" | "ability")) || e.audience & (1 << p) != 0)
            .map(|e| json!({"id":format!("{}:{}:{}", e.tick, e.action, e.unit),"tick":e.tick,"action":e.action,"owner":e.owner,
                "unit":e.unit,"kind":e.kind,"from":e.from,"to":e.to,"value":e.value,
                "amount":e.amount,"duration":e.duration})).collect();
        json!({"spectator":spectator,"feedback":feedback,"tiles":tiles,"players":players,"cities":cities,"squads":squads,"strikes":strikes,"marches":[],"events":events,"weather":self.weather(),"discoveries":self.discoveries.iter().filter(|d|v[d.tile]||d.seen&(1<<p)!=0).map(|d|json!({"tile":d.tile,"kind":d.kind,"variant":d.variant,"used":if v[d.tile]{d.used}else{d.known_used&(1<<p)!=0},"owner":if v[d.tile]{d.owner}else{-1}})).collect::<Vec<_>>(),"rules":{"tactics":true,"victory_modes":["conquest","space"],"space_goal":SPACE_GOAL,"order_interval":ORDER_INTERVAL,"specs":(0..UNIT_COUNT).map(spec).collect::<Vec<_>>(),"unit_cap":self.cap(p)}})
    }
}

fn default_player_count() -> usize {
    8
}

#[derive(Deserialize)]
struct Request {
    op: String,
    #[serde(default)]
    seed: u32,
    #[serde(default)]
    difficulty: u8,
    #[serde(default = "default_player_count")]
    count: usize,
    #[serde(default)]
    hidden_rolls: Option<Vec<u32>>,
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
pub fn execute(input: &[u8]) -> Vec<u8> {
    let result = (|| -> Result<Value, String> {
        let r: Request = serde_json::from_slice(input).map_err(|e| e.to_string())?;
        if r.op == "new" {
            if !(2..=8).contains(&r.count) {
                return Err("player count".into());
            }
            let mut g = Game::with_players(r.seed, r.count, r.difficulty);
            if let Some(rolls) = r.hidden_rolls {
                g.seed_discovery_rolls(&rolls);
            }
            return Ok(json!({"state":g,"error":0}));
        }
        let mut g = r.state.ok_or("missing state")?;
        if r.op == "view" {
            if r.player >= g.players.len() {
                return Err("player".into());
            }
            return Ok(json!({"state":g.view(r.player),"error":0}));
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
        Ok(json!({"state":g,"error":error}))
    })();
    serde_json::to_vec(&result.unwrap_or_else(|e| json!({"error":99,"detail":e}))).unwrap()
}

mod utility;
#[cfg(test)]
mod era_tests;
mod transport;
mod actions;
mod discoveries;
mod feedback;
mod planner;
use discoveries::Discovery;

#[cfg(test)]
mod tests;
