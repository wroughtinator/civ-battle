//! Low-frequency combined-arms operations. Costs and targets are validated in Rust.
use super::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Squad {
    pub id: usize,
    pub owner: usize,
    pub kind: u8,
    pub tile: usize,
    pub to: usize,
    pub path: Vec<usize>,
    pub left: u16,
    pub total: u16,
    pub hp: f32,
    pub ready: u32,
    pub revealed: u32,
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

impl Game {
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
    pub fn squad_visible(&self, p: usize, s: &Squad) -> bool {
        if s.owner == p {
            return true;
        }
        if !self.visible(p, s.tile) {
            return false;
        }
        if s.kind != 2 || s.revealed > self.tick {
            return true;
        }
        // Space reconnaissance sees surface forces; submerged boats require local sonar.
        self.squads.iter().any(|u| {
            u.owner == p
                && u.kind == 1
                && (u.tile == s.tile || self.tiles[u.tile].near.contains(&s.tile))
        }) || self.tiles[s.tile]
            .near
            .iter()
            .any(|&i| self.tiles[i].owner == p as i8 && self.tiles[i].building == 5)
    }
    pub fn squad_path(&self, s: &Squad, to: usize) -> Option<Vec<usize>> {
        if to >= self.tiles.len() || s.tile == to {
            return None;
        }
        if s.kind == 3 {
            return if self.tiles[to].terrain > 0
                && dot(self.tiles[s.tile].p, self.tiles[to].p) > 0.42
            {
                Some(vec![s.tile, to])
            } else {
                None
            };
        }
        let sea = s.kind == 1 || s.kind == 2;
        let mut prev = vec![usize::MAX; self.tiles.len()];
        let mut q = VecDeque::from([s.tile]);
        prev[s.tile] = s.tile;
        while let Some(i) = q.pop_front() {
            if i == to {
                let mut path = vec![to];
                while *path.last().unwrap() != s.tile {
                    path.push(prev[*path.last().unwrap()]);
                }
                path.reverse();
                return if path.len() <= 18 { Some(path) } else { None };
            }
            for &j in &self.tiles[i].near {
                if prev[j] != usize::MAX || ((self.tiles[j].terrain == 0) != sea) {
                    continue;
                }
                if !sea && j != to && self.tiles[j].owner != s.owner as i8 {
                    continue;
                }
                prev[j] = i;
                q.push_back(j);
            }
        }
        None
    }
    pub fn modern_command(
        &mut self,
        p: usize,
        kind: &str,
        from: usize,
        to: usize,
        value: u8,
    ) -> Result<(), u8> {
        match kind {
            "train" => {
                if from >= self.tiles.len() || self.tiles[from].owner != p as i8 {
                    return Err(3);
                }
                if value > 3 || self.squads.iter().filter(|s| s.owner == p).count() >= 6 {
                    return Err(6);
                }
                let t = self.players[p].tech;
                let unlocked = match value {
                    0 => t[0] >= 2 && t[1] >= 3,
                    1 => t[2] >= 2,
                    2 => t[0] >= 3 && t[2] >= 2,
                    3 => t[0] >= 3 && t[1] >= 2,
                    _ => false,
                };
                if !unlocked {
                    return Err(6);
                }
                let sea = value == 1 || value == 2;
                let spawn = if sea {
                    if self.tiles[from].building != 5 {
                        return Err(6);
                    }
                    *self.tiles[from]
                        .near
                        .iter()
                        .find(|&&i| self.tiles[i].terrain == 0)
                        .ok_or(4)?
                } else {
                    from
                };
                let cost = [110., 100., 145., 125.][value as usize]
                    * if self.players[p].doctrine == 1 {
                        1.2
                    } else {
                        1.
                    };
                let industry = [30., 25., 40., 30.][value as usize];
                if self.players[p].gold < cost
                    || self.players[p].food < 15.
                    || self.players[p].industry < industry
                {
                    return Err(5);
                }
                self.players[p].gold -= cost;
                self.players[p].food -= 15.;
                self.players[p].industry -= industry;
                self.squads.push(Squad {
                    id: self.next_squad,
                    owner: p,
                    kind: value,
                    tile: spawn,
                    to: spawn,
                    path: vec![spawn],
                    left: 20,
                    total: 20,
                    hp: [60., 65., 45., 35.][value as usize],
                    ready: self.tick + 20,
                    revealed: 0,
                });
                self.next_squad += 1;
            }
            "maneuver" => {
                let index = self
                    .squads
                    .iter()
                    .position(|s| s.id == from && s.owner == p)
                    .ok_or(3)?;
                let s = &self.squads[index];
                if s.left > 0 || s.ready > self.tick {
                    return Err(2);
                }
                let path = self.squad_path(s, to).ok_or(4)?;
                // Special operations need observed targets; other forces can explore.
                if s.kind == 3 && !self.visible(p, to) {
                    return Err(4);
                }
                let total = if s.kind == 3 {
                    35
                } else {
                    ((path.len() - 1) as f32
                        * (if s.kind == 0 { 9. } else { 8. })
                        * (1.
                            + if self.players[p].tech[2] < 3 {
                                self.storm(to) * 0.4
                            } else {
                                0.
                            })) as u16
                };
                let total = if (s.kind == 1 || s.kind == 2) && self.players[p].doctrine == 2 {
                    (total as f32 * 0.8) as u16
                } else {
                    total
                };
                let s = &mut self.squads[index];
                s.to = to;
                s.path = path;
                s.total = total;
                s.left = total;
                s.ready = self.tick + total as u32 + 8;
            }
            "strike" => {
                if from >= self.tiles.len()
                    || to >= self.tiles.len()
                    || self.tiles[from].owner != p as i8
                {
                    return Err(3);
                }
                if value > 2
                    || self.players[p].strike_ready > self.tick
                    || (!self.visible(p, to)
                        && self.tiles[to].building != 6
                        && !self.tiles[to].site)
                    || self.tiles[to].owner == p as i8
                {
                    return Err(6);
                }
                let t = self.players[p].tech;
                let unlocked = match value {
                    0 => t[0] >= 2 && t[1] >= 3,
                    1 => t[0] >= 3 && t[1] >= 2,
                    2 => t[0] >= 4 && t[1] >= 4 && self.tick >= 840,
                    _ => false,
                };
                if !unlocked {
                    return Err(6);
                }
                if dot(self.tiles[from].p, self.tiles[to].p) < [0.68, 0.12, -1.][value as usize] {
                    return Err(4);
                }
                let gold = [90., 150., 550.][value as usize];
                let science = [0., 25., 180.][value as usize];
                let industry = [18., 35., 120.][value as usize];
                if self.players[p].gold < gold
                    || self.players[p].science < science
                    || self.players[p].industry < industry
                {
                    return Err(5);
                }
                self.players[p].gold -= gold;
                self.players[p].science -= science;
                self.players[p].industry -= industry;
                self.players[p].strike_ready = self.tick + [40, 60, 150][value as usize];
                let total = [14, 20, 40][value as usize];
                self.strikes.push(Strike {
                    owner: p,
                    kind: value,
                    from,
                    to,
                    left: total,
                    total,
                });
                self.emit(4 + value, p, to);
            }
            "satellite" => {
                if self.players[p].tech[1] < 4 || self.players[p].satellite > 0 {
                    return Err(6);
                }
                if self.players[p].gold < 180.
                    || self.players[p].science < 70.
                    || self.players[p].industry < 25.
                {
                    return Err(5);
                }
                self.players[p].gold -= 180.;
                self.players[p].science -= 70.;
                self.players[p].industry -= 25.;
                self.players[p].satellite = 120;
            }
            _ => return Err(6),
        }
        Ok(())
    }
    pub fn modern_tick(&mut self) {
        for p in &mut self.players {
            p.satellite = p.satellite.saturating_sub(1);
        }
        let mut impacts = vec![];
        for s in &mut self.strikes {
            s.left = s.left.saturating_sub(1);
            if s.left == 0 {
                impacts.push(s.clone());
            }
        }
        self.strikes.retain(|s| s.left > 0);
        for s in impacts {
            let owner = self.tiles[s.to].owner;
            let fortified = self.tiles[s.to].building == 4
                || self.tiles[s.to].near.iter().any(|&i| {
                    self.tiles[i].owner == owner && owner >= 0 && self.tiles[i].building == 4
                });
            let weather = if self.players[s.owner].satellite == 0 {
                1. - self.storm(s.to) * 0.55
            } else {
                1.
            };
            let damage = match s.kind {
                0 => 30. * weather * if fortified { 0.45 } else { 1. },
                1 => 45. * if fortified { 0.55 } else { 1. },
                _ => 130.,
            };
            let mut targets = vec![s.to];
            if s.kind == 2 {
                targets.extend(self.tiles[s.to].near.clone());
            }
            for i in targets {
                let d = damage * if i == s.to { 1. } else { 0.55 };
                let t = &mut self.tiles[i];
                t.army = (t.army - d).max(1.);
                // Suppression opens a planning window for a following ground force;
                // established fort networks shorten it, storms weaken drone suppression.
                let window = if s.kind == 0 {
                    (20. * weather) as u16
                } else if s.kind == 1 {
                    26
                } else {
                    35
                };
                t.suppression = t
                    .suppression
                    .max(if fortified { window / 2 } else { window });
                if s.kind >= 1 {
                    t.unrest = t.unrest.max(if s.kind == 2 {
                        90
                    } else if fortified {
                        12
                    } else {
                        25
                    });
                    // Conventional strikes interrupt work but cannot erase a funded
                    // 90-second project every 60 seconds. Ground sabotage and nukes
                    // still destroy the queue. Forts shorten this economic interruption.
                    if s.kind == 2 {
                        t.work = 0;
                        t.next = 0;
                    }
                }
                if s.kind == 2 && i == s.to {
                    t.building = 0;
                }
                for u in &mut self.squads {
                    if u.tile == i {
                        u.hp -= d;
                        u.revealed = self.tick + 20;
                    }
                }
            }
            self.emit(7 + s.kind, s.owner, s.to);
        }
        let mut arrivals = vec![];
        for s in &mut self.squads {
            if s.left > 0 {
                s.left -= 1;
                if s.path.len() > 1 {
                    let step = ((1. - s.left as f32 / s.total as f32) * (s.path.len() - 1) as f32)
                        .floor() as usize;
                    s.tile = s.path[step.min(s.path.len() - 1)];
                }
                if s.left == 0 {
                    s.tile = s.to;
                    arrivals.push(s.id);
                }
            }
        }
        for id in arrivals {
            let Some(index) = self.squads.iter().position(|s| s.id == id) else {
                continue;
            };
            let s = self.squads[index].clone();
            if s.kind == 1 || s.kind == 2 || self.tiles[s.to].owner == s.owner as i8 {
                continue;
            }
            let t = self.tiles[s.to].clone();
            let defense = t.army
                * (if t.building == 4 {
                    if s.kind == 0 {
                        1.2
                    } else {
                        1.55
                    }
                } else {
                    1.
                })
                * (if t.terrain == 4 && s.kind == 0 {
                    1.6
                } else {
                    1.
                })
                * if t.suppression > 0 { 0.7 } else { 1. };
            if s.kind == 3 {
                self.tiles[s.to].unrest = 60;
                self.tiles[s.to].work = 0;
                self.tiles[s.to].next = 0;
                self.tiles[s.to].army = (t.army - 22.).max(1.);
                self.squads[index].hp -= defense * 0.42;
                self.squads[index].tile = s.path[0];
                self.squads[index].to = s.path[0];
                self.squads[index].path = vec![s.path[0]];
                self.squads[index].revealed = self.tick + 30;
                self.emit(10, s.owner, s.to);
            } else {
                let power = s.hp * (2.0 + self.players[s.owner].tech[0] as f32 * 0.15);
                if power > defense {
                    let t = &mut self.tiles[s.to];
                    t.owner = s.owner as i8;
                    t.army = 5.;
                    t.unrest = 20;
                    t.work = 0;
                    t.next = 0;
                    if t.building == 6 {
                        t.building = 0;
                    }
                    self.squads[index].hp = (s.hp - defense / (power / s.hp)).max(1.);
                    self.emit(1, s.owner, s.to);
                } else {
                    self.tiles[s.to].army = (self.tiles[s.to].army - power / 1.5).max(1.);
                    self.squads[index].hp = 0.;
                }
            }
        }
        if self.tick % 5 == 0 {
            let mut damage = vec![0.; self.squads.len()];
            let snapshot = self.squads.clone();
            for (a, s) in snapshot.iter().enumerate() {
                if s.hp <= 0. || s.left > 0 {
                    continue;
                }
                let sea = s.kind == 1 || s.kind == 2;
                if let Some((b, target)) = self
                    .squads
                    .iter()
                    .enumerate()
                    .filter(|(_, u)| {
                        u.owner != s.owner
                            && u.hp > 0.
                            && ((u.kind == 1 || u.kind == 2) == sea)
                            && (u.tile == s.tile || self.tiles[s.tile].near.contains(&u.tile))
                            && self.squad_visible(s.owner, u)
                    })
                    .min_by(|(_, a), (_, b)| a.hp.total_cmp(&b.hp))
                {
                    damage[b] += if s.kind == 2 && target.kind == 1 {
                        24.
                    } else if s.kind == 1 && target.kind == 2 {
                        12.
                    } else {
                        10.
                    };
                    self.squads[a].revealed = self.tick + 15;
                } else if s.kind == 1 {
                    for i in self.tiles[s.tile].near.clone() {
                        if self.tiles[i].owner >= 0 && self.tiles[i].owner != s.owner as i8 {
                            self.tiles[i].army = (self.tiles[i].army - 3.).max(1.);
                            self.tiles[i].unrest = self.tiles[i].unrest.max(6);
                        }
                    }
                }
            }
            // Embarked armies need escorts: hostile boats interdict transports automatically.
            for m in &mut self.marches {
                let step = ((1. - m.left as f32 / m.total as f32) * (m.path.len() - 1) as f32)
                    .floor() as usize;
                let at = m.path[step.min(m.path.len() - 1)];
                if self.tiles[at].terrain != 0 {
                    continue;
                }
                for s in &snapshot {
                    if s.owner == m.owner
                        || s.left > 0
                        || !(s.kind == 1 || s.kind == 2)
                        || !(s.tile == at || self.tiles[at].near.contains(&s.tile))
                    {
                        continue;
                    }
                    let escort = snapshot.iter().any(|u| {
                        u.owner == m.owner
                            && u.kind == 1
                            && (u.tile == at || self.tiles[at].near.contains(&u.tile))
                    });
                    m.army = (m.army - if escort { 2. } else { 9. }).max(0.);
                }
            }
            self.marches.retain(|m| m.army >= 1.);
            for (i, s) in self.squads.iter_mut().enumerate() {
                s.hp -= damage[i];
                let p = &mut self.players[s.owner];
                p.gold = (p.gold - 1.2).max(0.);
                if p.gold == 0. {
                    s.hp -= 1.;
                }
                let sea = s.kind == 1 || s.kind == 2;
                let supplied = if sea {
                    self.tiles[s.tile].near.iter().any(|&j| {
                        self.tiles[j].owner == s.owner as i8
                            && self.tiles[j].building == 5
                            && self.tiles[j].unrest == 0
                    })
                } else {
                    self.tiles[s.tile].owner == s.owner as i8 && self.tiles[s.tile].unrest == 0
                };
                let max_hp = [60., 65., 45., 35.][s.kind as usize];
                if s.hp > 0.
                    && s.hp < max_hp
                    && s.left == 0
                    && damage[i] == 0.
                    && supplied
                    && p.gold >= 2.
                {
                    p.gold -= 2.;
                    s.hp = (s.hp + 3.).min(max_hp);
                }
            }
        }
        self.squads.retain(|s| s.hp > 0.);
    }
    pub fn modern_bot(&mut self, p: usize) -> bool {
        if self.tick < 260 || self.players[p].orders < 1. || self.players[p].cooldown > self.tick {
            return false;
        }
        let owned: Vec<usize> = self
            .tiles
            .iter()
            .enumerate()
            .filter(|(_, t)| t.owner == p as i8)
            .map(|(i, _)| i)
            .collect();
        if owned.is_empty() {
            return false;
        }
        let target = self
            .tiles
            .iter()
            .enumerate()
            .filter(|(i, t)| {
                t.owner >= 0 && t.owner != p as i8 && (self.visible(p, *i) || t.building == 6)
            })
            .max_by_key(|(i, t)| {
                if t.building == 6 {
                    1000
                } else if self.visible(p, *i) {
                    (if t.capital >= 0 { 120 } else { 0 }) + t.army as usize
                } else {
                    0
                }
            })
            .map(|(i, _)| i);
        if let Some(to) = target {
            let from = *owned
                .iter()
                .max_by(|&&a, &&b| {
                    dot(self.tiles[a].p, self.tiles[to].p)
                        .total_cmp(&dot(self.tiles[b].p, self.tiles[to].p))
                })
                .unwrap();
            let kind = if self.tick >= 840
                && self.players[p].tech[0] >= 4
                && self.players[p].tech[1] >= 4
                && self.players[p].gold > 800.
            {
                2
            } else if self.players[p].tech[0] >= 3 {
                1
            } else {
                0
            };
            if (self.tiles[to].building == 6 || self.visible(p, to) && self.tiles[to].army > 35.)
                && self.command(p, "strike", from, to, kind).is_ok()
            {
                return true;
            }
        }
        if self.players[p].tech[1] >= 4
            && self.players[p].gold > 600.
            && self.players[p].satellite == 0
            && self.tick % 60 < 12
        {
            if self.command(p, "satellite", 0, 0, 0).is_ok() {
                return true;
            }
        }
        let idle: Vec<Squad> = self
            .squads
            .iter()
            .filter(|s| s.owner == p && s.left == 0 && s.ready <= self.tick)
            .cloned()
            .collect();
        for s in idle {
            // Hold a blockade instead of repeatedly clicking between adjacent sea cells.
            if (s.kind == 1 || s.kind == 2)
                && s.hp > 20.
                && self.tiles[s.tile].near.iter().any(|&i| {
                    self.visible(p, i) && self.tiles[i].owner >= 0 && self.tiles[i].owner != p as i8
                })
            {
                continue;
            }
            let target = if s.kind == 1 || s.kind == 2 {
                self.tiles
                    .iter()
                    .enumerate()
                    .filter(|(i, t)| {
                        t.terrain == 0
                            && *i != s.tile
                            && t.near.iter().any(|&j| {
                                self.visible(p, j)
                                    && self.tiles[j].owner >= 0
                                    && self.tiles[j].owner != p as i8
                            })
                    })
                    .min_by(|(_, a), (_, b)| {
                        dot(safe_pos(self, s.tile), b.p)
                            .total_cmp(&dot(safe_pos(self, s.tile), a.p))
                    })
                    .map(|(i, _)| i)
                    .or_else(|| {
                        let destination = self
                            .tiles
                            .iter()
                            .filter(|t| t.capital >= 0 && t.capital != p as i8)
                            .max_by(|a, b| {
                                dot(safe_pos(self, s.tile), a.p)
                                    .total_cmp(&dot(safe_pos(self, s.tile), b.p))
                            })?
                            .p;
                        let mut candidates: Vec<_> = self
                            .tiles
                            .iter()
                            .enumerate()
                            .filter(|(i, t)| {
                                t.terrain == 0
                                    && *i != s.tile
                                    && dot(t.p, self.tiles[s.tile].p) < 0.97
                            })
                            .map(|(i, t)| (i, dot(t.p, destination)))
                            .collect();
                        candidates.sort_by(|a, b| b.1.total_cmp(&a.1));
                        candidates
                            .iter()
                            .take(24)
                            .find(|(i, _)| self.squad_path(&s, *i).is_some())
                            .map(|(i, _)| *i)
                    })
            } else {
                self.tiles
                    .iter()
                    .enumerate()
                    .filter(|(i, t)| {
                        t.terrain > 0
                            && t.owner != p as i8
                            && self.visible(p, *i)
                            && self.squad_path(&s, *i).is_some()
                    })
                    .min_by(|(_, a), (_, b)| a.army.total_cmp(&b.army))
                    .map(|(i, _)| i)
            };
            if let Some(to) = target {
                if self.command(p, "maneuver", s.id, to, 0).is_ok() {
                    return true;
                }
            }
        }
        let squad_count = self.squads.iter().filter(|s| s.owner == p).count();
        if squad_count < 3 && self.players[p].gold > 300. && self.tick % 40 < 18 {
            let harbor = owned.iter().copied().find(|&i| self.tiles[i].building == 5);
            if let Some(i) = harbor {
                let kind = if p % 2 == 0 && self.players[p].tech[0] >= 3 {
                    2
                } else {
                    1
                };
                if self.command(p, "train", i, 0, kind).is_ok() {
                    return true;
                }
            }
            let kind = if p % 3 == 0 { 3 } else { 0 };
            if self.command(p, "train", owned[0], 0, kind).is_ok() {
                return true;
            }
            if harbor.is_none() && self.players[p].tech[2] >= 2 {
                if let Some(&i) = owned.iter().find(|&&i| {
                    self.tiles[i].building == 0
                        && self.tiles[i]
                            .near
                            .iter()
                            .any(|&j| self.tiles[j].terrain == 0)
                }) {
                    if self.command(p, "build", i, 0, 5).is_ok() {
                        return true;
                    }
                }
            }
        }
        false
    }
    pub fn tactical_view(&self, p: usize) -> serde_json::Value {
        let visible: Vec<bool> = (0..self.tiles.len()).map(|i| self.visible(p, i)).collect();
        let tiles:Vec<_>=self.tiles.iter().enumerate().map(|(i,t)|serde_json::json!({
            "visible":visible[i],"owner":if visible[i]{t.owner}else{-2},"army":if visible[i]{t.army.floor() as i32}else{-1},
            "building":if visible[i]{t.building}else{0},"work":if visible[i]{t.work}else{0},"next":if visible[i]{t.next}else{0},"unrest":if visible[i]{t.unrest}else{0},"suppression":if visible[i]{t.suppression}else{0},"storm":self.storm(i)
        })).collect();
        let players:Vec<_>=self.players.iter().enumerate().map(|(i,x)|if i==p{serde_json::to_value(x).unwrap()}else{serde_json::json!({"civ":x.civ,"name":x.name,"tag":x.tag,"bot":x.bot,"alive":x.alive,"launch":x.launch,"domination":x.domination,"mandate":x.mandate,"score":x.score})}).collect();
        let squads: Vec<_> = self
            .squads
            .iter()
            .filter(|s| self.squad_visible(p, s))
            .map(|s| {
                let mut s = s.clone();
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
        let marches: Vec<_> = self
            .marches
            .iter()
            .filter_map(|m| {
                if m.owner == p {
                    return Some(m.clone());
                }
                let step = ((1. - m.left as f32 / m.total as f32) * (m.path.len() - 1) as f32)
                    .floor() as usize;
                let i = m.path[step.min(m.path.len() - 1)];
                if !visible[i] {
                    return None;
                }
                let mut out = m.clone();
                out.from = i;
                out.to = i;
                out.path = vec![i];
                out.left = 0;
                out.total = 1;
                Some(out)
            })
            .collect();
        let strikes: Vec<_> = self
            .strikes
            .iter()
            .filter(|s| s.owner == p || s.kind == 2 || visible[s.to])
            .map(|s| {
                let mut out = s.clone();
                if s.owner != p && !visible[s.from] {
                    out.from = s.to;
                }
                out
            })
            .collect();
        let events: Vec<_> = self
            .events
            .iter()
            .filter(|e| e.player == p || visible[e.tile] || e.kind == 6 || e.kind == 9)
            .collect();
        // Launch sites are deliberate public beacons, revealing no surrounding garrisons.
        let beacons: Vec<_> = self
            .tiles
            .iter()
            .enumerate()
            .filter(|(_, t)| t.building == 6)
            .map(|(i, t)| serde_json::json!({"tile":i,"owner":t.owner}))
            .collect();
        let sites: Vec<_> = self
            .tiles
            .iter()
            .enumerate()
            .filter(|(_, t)| t.site)
            .map(|(i, t)| serde_json::json!({"tile":i,"owner":t.owner}))
            .collect();
        serde_json::json!({"tiles":tiles,"players":players,"squads":squads,"marches":marches,"strikes":strikes,"events":events,"weather":self.weather(),"beacons":beacons,"sites":sites,"rules":{"space_goal":SPACE_GOAL,"mandate_goal":MANDATE_GOAL,"research_surcharge":RESEARCH_SURCHARGE}})
    }
}
fn safe_pos(g: &Game, i: usize) -> V3 {
    g.tiles[i].p
}
