//! Observation-limited planning. Difficulty changes forecasting, never income or damage.
use super::*;

impl Game {
    pub fn bot(&mut self, p: usize) {
        self.bot_policy(p, 0);
    }
    // Policies 1..6 are deliberately narrow audit opponents, with the same economy.
    pub fn bot_policy(&mut self, p: usize, policy: u8) {
        let visible = self.vision(p);
        let mut observed = self.clone();
        observed.squads.retain(|u| self.detected(p, u, &visible));
        observed
            .cities
            .retain(|c| c.owner == p || c.capital >= 0 || visible[c.tile]);
        observed
            .discoveries
            .retain(|d| visible[d.tile] || d.seen & (1 << p) != 0);
        for d in &mut observed.discoveries {
            if !visible[d.tile] {
                d.used = d.known_used & (1 << p) != 0;
                d.owner = -1;
            }
        }
        observed.last_order = None;
        observed.bot_plan(p, policy);
        if let Some((kind, from, to, value)) = observed.last_order {
            let _ = self.command(p, &kind, from, to, value);
        }
    }
    fn bot_plan(&mut self, p: usize, policy: u8) {
        if !self.players[p].alive || self.players[p].cooldown > self.tick {
            return;
        }
        let vision = self.vision(p);
        let enemies: Vec<_> = self
            .squads
            .iter()
            .filter(|u| u.owner != p && self.detected(p, u, &vision))
            .cloned()
            .collect();
        let own: Vec<_> = self
            .squads
            .iter()
            .filter(|u| u.owner == p && u.boarded_on.is_none())
            .cloned()
            .collect();
        let cities: Vec<_> = self
            .cities
            .iter()
            .filter(|c| c.owner == p)
            .cloned()
            .collect();
        let city_dist: Vec<_> = self.cities.iter().map(|c| self.distances(c.tile)).collect();
        let enemy_dist: Vec<_> = enemies.iter().map(|u| self.distances(u.tile)).collect();
        let a = self.players[p].clone();
        for u in &own {
            if u.left == 0
                && self.discoveries.iter().any(|d| d.tile == u.tile && !d.used)
                && self.command(p, "explore", u.id, 0, 0).is_ok()
            {
                return;
            }
        }

        // Forecast counter exchanges and threats to city centers before choosing a purchase.
        let threat = enemies
            .iter()
            .any(|u| cities.iter().any(|c| self.distances(c.tile)[u.tile] <= 4));
        let preferred = match policy {
            1 => 0,
            2 => 1,
            3 => 2,
            4 => 4,
            5 => 7,
            6 => 10,
            _ => {
                if enemies.is_empty() {
                    BRANCHES[(p + self.seed as usize) % 3][0]
                } else {
                    *a.unlocked
                        .iter()
                        .filter(|&&k| k < 10)
                        .max_by(|&&k, &&l| {
                            let score = |kind| {
                                let s = spec(kind);
                                let clusters = enemies
                                    .iter()
                                    .filter(|e| {
                                        enemies.iter().any(|b| {
                                            b.id != e.id
                                                && self.tiles[e.tile].near.contains(&b.tile)
                                        })
                                    })
                                    .count() as f32
                                    / enemies.len().max(1) as f32;
                                let coverage = enemies
                                    .iter()
                                    .map(|e| {
                                        let reachable = if (7..=9).contains(&kind)
                                            && self.tiles[e.tile].terrain > 0
                                            && !self.tiles[e.tile]
                                                .near
                                                .iter()
                                                .any(|&t| self.tiles[t].terrain == 0)
                                        {
                                            0.15
                                        } else {
                                            1.
                                        };
                                        Self::multiplier(kind, e.kind) * reachable
                                    })
                                    .sum::<f32>();
                                let splash = if matches!(kind, 2 | 4 | 6 | 7) {
                                    1. + clusters * if kind == 4 { 1.4 } else { 0.65 }
                                } else {
                                    1.
                                };
                                let duplicate =
                                    own.iter().filter(|u| u.kind == kind).count() as f32;
                                coverage * s.damage / s.reload as f32 * s.hp.sqrt() / s.cost as f32
                                    * (1. + (s.range - 1) as f32 * 0.3)
                                    * splash
                                    / (1. + duplicate * 0.22)
                            };
                            score(k).total_cmp(&score(l))
                        })
                        .unwrap_or(&0)
                }
            }
        };
        // Reserve an occasional order for investment so repeated combat cannot starve it.
        if (self.tick + p as u32) % 12 < 2
            && self.bot_economy(p, policy, preferred, &own, &cities, &enemies)
        {
            return;
        }

        let depth = if policy == 0 { self.difficulty + 1 } else { 1 };
        // Attack is a deliberate order, never a side effect of movement. The next attack
        // is chosen afresh after recovery, using the latest visible position.
        for u in &own {
            if u.left > 0 || u.locked_until > self.tick || spec(u.kind).damage == 0. || u.refit >= 0
            {
                continue;
            }
            let d = self.distances(u.tile);
            let sp = spec(u.kind);
            let target = enemies
                .iter()
                .filter(|e| d[e.tile] >= sp.min && d[e.tile] <= sp.range)
                .max_by(|b, c| {
                    (Self::multiplier(u.kind, b.kind) / b.hp)
                        .total_cmp(&(Self::multiplier(u.kind, c.kind) / c.hp))
                });
            if let Some(e) = target {
                let cluster = enemies
                    .iter()
                    .filter(|other| self.tiles[e.tile].near.contains(&other.tile))
                    .count();
                if depth > 1
                    && cluster >= 2
                    && matches!(u.kind, 2 | 4 | 6 | 7)
                    && !own
                        .iter()
                        .any(|friend| self.tiles[e.tile].near.contains(&friend.tile))
                    && self.command(p, "ability", u.id, e.tile, 0).is_ok()
                {
                    return;
                }
                if u.focus != Some(e.id) && self.command(p, "attack", u.id, e.tile, 0).is_ok() {
                    return;
                }
            }
        }
        // A grounded engineer and a defended production center are both required.
        for u in &own {
            if u.kind == 10 && a.launch_tile.is_none() {
                if cities.iter().any(|c| c.tile == u.tile && c.production == 3)
                    && self.command(p, "ability", u.id, 0, 0).is_ok()
                {
                    return;
                }
                if let Some(c) = cities
                    .iter()
                    .filter(|c| c.production == 3)
                    .min_by_key(|c| self.distances(u.tile)[c.tile])
                {
                    if let Some(blocker) = self
                        .occupant(c.tile)
                        .cloned()
                        .filter(|b| b.owner == p && b.id != u.id)
                    {
                        if let Some(t) = self.tiles[c.tile].near.iter().copied().find(|&t| {
                            self.occupant(t).is_none()
                                && self.tiles[t].terrain > 0
                                && self.can_enter(blocker.kind, t)
                        }) {
                            if self.command(p, "move", blocker.id, t, 0).is_ok() {
                                return;
                            }
                        }
                    }
                    if u.tile != c.tile
                        && u.to != c.tile
                        && self.command(p, "move", u.id, c.tile, 0).is_ok()
                    {
                        return;
                    }
                }
            }
            if u.kind == SETTLER && !u.founding {
                if u.left == 0
                    && self.foundable(u.tile)
                    && self.command(p, "ability", u.id, 0, 0).is_ok()
                {
                    return;
                }
                if u.path.len() > 1 {
                    continue;
                }
                let d = self.distances(u.tile);
                let dest = (0..self.tiles.len())
                    .filter(|&i| {
                        matches!(self.tiles[i].terrain, 1 | 2 | 3)
                            && city_dist.iter().all(|ds| ds[i] >= 4)
                            && self.occupant(i).is_none()
                            && !self
                                .squads
                                .iter()
                                .any(|s| s.founding && self.distances(s.tile)[i] < 4)
                    })
                    .min_by_key(|&i| {
                        let danger = enemy_dist.iter().filter(|ds| ds[i] < 5).count() as u16 * 6;
                        d[i] + danger
                            + if self.tiles[i]
                                .near
                                .iter()
                                .any(|&n| self.tiles[n].terrain == 0)
                            {
                                0
                            } else {
                                2
                            }
                    });
                if let Some(t) = dest {
                    if self.command(p, "move", u.id, t, 0).is_ok() {
                        return;
                    }
                }
            }
        }
        // Inexpensive defensive formations come before expensive exposed development.
        let combat_count = own.iter().filter(|u| spec(u.kind).damage > 0.).count();
        let desired = (3 + cities.len()).min(self.cap(p) - 1);
        if combat_count < desired && (threat || a.gold > 115.) {
            let k = if a.unlocked.contains(&preferred) && preferred < 10 {
                preferred
            } else {
                0
            };
            if let Some(c) = cities
                .iter()
                .filter(|c| {
                    c.training < 0
                        && (!(7..=9).contains(&k)
                            || self.tiles[c.tile]
                                .near
                                .iter()
                                .any(|&t| self.tiles[t].terrain == 0))
                })
                .min_by_key(|c| enemy_dist.iter().map(|ds| ds[c.tile]).min().unwrap_or(99))
            {
                if self.command(p, "train", c.tile, 0, k).is_ok() {
                    return;
                }
            }
        }
        if policy == 0 {
            for u in &own {
                if u.left == 0
                    && u.refit < 0
                    && self.tiles[u.tile].owner == p as i8
                    && u.kind < 10
                    && u.kind != preferred
                    && spec(preferred).cost > spec(u.kind).cost
                    && self.command(p, "refit", u.id, 0, preferred).is_ok()
                {
                    return;
                }
            }
        }
        // Positional search evaluates an objective route and nearby alternatives, including
        // enemy best replies at deeper settings. It does not inspect concealed pieces.
        let mut orders: Vec<(f32, usize, usize)> = vec![];
        for u in &own {
            if spec(u.kind).damage == 0. || u.founding || u.locked_until > self.tick {
                continue;
            }
            let d = self.distances(u.tile);
            // Keep a real defensive piece on a city center. A vacant capital is not defended
            // by a hidden population number; taking its guard away is a meaningful risk.
            if matches!(u.kind, 0..=5) && cities.iter().any(|c| c.tile == u.tile) {
                if u.hp < 40.
                    && enemies.iter().any(|e| d[e.tile] <= 2)
                    && u.ability_ready <= self.tick
                    && self.command(p, "ability", u.id, 0, 0).is_ok()
                {
                    return;
                }
                continue;
            }
            if u.left > 0 && u.path.len() > 2 && !enemies.iter().any(|e| d[e.tile] <= 4) {
                continue;
            }
            let mut targets: Vec<usize> = self
                .cities
                .iter()
                .filter(|c| c.owner != p && (c.capital >= 0 || vision[c.tile]))
                .map(|c| c.tile)
                .collect();
            targets.extend(enemies.iter().map(|e| e.tile));
            targets.extend(
                cities
                    .iter()
                    .filter(|c| enemies.iter().any(|e| self.distances(c.tile)[e.tile] <= 4))
                    .map(|c| c.tile),
            );
            if (7..=9).contains(&u.kind) {
                targets = targets
                    .into_iter()
                    .flat_map(|t| {
                        if self.tiles[t].terrain == 0 {
                            vec![t]
                        } else {
                            self.tiles[t]
                                .near
                                .iter()
                                .copied()
                                .filter(|&j| self.tiles[j].terrain == 0)
                                .collect()
                        }
                    })
                    .collect();
            }
            targets.sort_by_key(|&t| d[t]);
            targets.truncate(3);
            let Some(&goal) = targets.first() else {
                continue;
            };
            let dg = self.distances(goal);
            let mut candidates = vec![u.tile];
            candidates.extend(self.tiles[u.tile].near.iter().copied());
            if let Some(route) = self.path(u, goal) {
                candidates.push(*route.get(1).unwrap_or(&u.tile));
            }
            for tile in candidates {
                if !self.can_enter(u.kind, tile)
                    || self.occupant(tile).is_some_and(|b| b.id != u.id)
                {
                    continue;
                }
                let positional = self.position_value(u, tile, goal, depth, &enemies, &enemy_dist);
                let current = self.position_value(u, u.tile, goal, depth, &enemies, &enemy_dist);
                let progress = (dg[u.tile] as f32 - dg[tile] as f32) * 2.;
                let urgency = if u.hp < spec(u.kind).hp * 0.4 { 8. } else { 0. };
                if tile != u.tile && !(u.left > 0 && u.to == tile) {
                    orders.push((positional - current + progress + urgency, u.id, tile));
                }
            }
            // Long routes are a single command. Tactical replanning starts on contact.
            if !enemies.iter().any(|e| d[e.tile] <= 5) && u.path.len() <= 1 {
                if self.path(u, goal).is_some() {
                    orders.push((
                        5. + (hash(self.tick / 12 + u.id as u32) % 7) as f32 * 0.1,
                        u.id,
                        goal,
                    ));
                }
            }
            // Abilities have positioning and information costs; they are not free spam.
            if u.left == 0
                && u.ability_ready <= self.tick
                && enemies.iter().any(|e| d[e.tile] <= spec(u.kind).range + 1)
            {
                let value = if matches!(u.kind, 7 | 8 | 9 | 12) {
                    1
                } else {
                    0
                };
                if self
                    .command(
                        p,
                        "ability",
                        u.id,
                        enemies
                            .iter()
                            .min_by_key(|e| d[e.tile])
                            .map(|e| e.tile)
                            .unwrap_or(0),
                        value,
                    )
                    .is_ok()
                {
                    return;
                }
            }
        }
        orders.sort_by(|a, b| b.0.total_cmp(&a.0));
        if let Some(&(score, id, to)) = orders.first() {
            if score > 4. && self.command(p, "move", id, to, 0).is_ok() {
                return;
            }
        }
        if self.bot_economy(p, policy, preferred, &own, &cities, &enemies) {
            return;
        }
        if let Some(&(score, id, to)) = orders.first() {
            if score > 0. && self.command(p, "move", id, to, 0).is_ok() {
                return;
            }
        }
        if a.gold > 150. {
            if let Some(c) = cities
                .iter()
                .filter(|c| c.radius < 3)
                .min_by_key(|c| c.radius)
            {
                let _ = self.command(p, "upgrade", c.tile, 0, 0);
            }
        }
    }
    fn bot_economy(
        &mut self,
        p: usize,
        policy: u8,
        preferred: u8,
        own: &[Unit],
        cities: &[City],
        enemies: &[Unit],
    ) -> bool {
        let a = self.players[p].clone();
        let threat = enemies
            .iter()
            .any(|u| cities.iter().any(|c| self.distances(c.tile)[u.tile] <= 3));
        if a.unlocked.contains(&10)
            && !own.iter().any(|u| u.kind == 10)
            && !cities.iter().any(|c| c.training == 10)
        {
            if let Some(c) = cities.iter().find(|c| c.production == 3 && c.training < 0) {
                if self.command(p, "train", c.tile, 0, 10).is_ok() {
                    return true;
                }
            }
        }
        if !threat
            && !own.iter().any(|u| u.kind == SETTLER)
            && !cities.iter().any(|c| c.training == SETTLER as i8)
            && a.gold > 185. + 25. * cities.len() as f32
        {
            if let Some(c) = cities.iter().find(|c| c.training < 0) {
                if self.command(p, "train", c.tile, 0, SETTLER).is_ok() {
                    return true;
                }
            }
        }
        if a.research < 0 && a.gold > 95. {
            let mut tech: Vec<_> = (0..12)
                .filter(|&k| {
                    !a.unlocked.contains(&k)
                        && (policy == 0
                            || match policy {
                                1 => false,
                                2 => k == 1,
                                3 => k == 2,
                                4 => k == 2 || k == 4,
                                5 => (7..=9).contains(&k),
                                6 => [1, 2, 3, 4, 10].contains(&k),
                                _ => true,
                            })
                })
                .filter_map(|k| self.research_info(k).map(|info| (k, info)))
                .filter(|(_, info)| {
                    info.2.iter().all(|k| a.unlocked.contains(k)) && self.tick >= info.3
                })
                .collect();
            tech.sort_by(|(k, _), (l, _)| {
                let score = |k: u8| {
                    let mut s = if k == preferred { 9. } else { 1. };
                    if k == 10 {
                        s += if self.tick >= 900 { 8. } else { 0. };
                    }
                    if policy == 0 {
                        s += enemies
                            .iter()
                            .map(|e| Self::multiplier(k, e.kind))
                            .sum::<f32>();
                    }
                    if policy == 6 && matches!(k, 2 | 3 | 4 | 10) {
                        s += 8.;
                    }
                    s
                };
                score(*l).total_cmp(&score(*k))
            });
            for (k, _) in tech {
                if self.command(p, "research", 0, 0, k).is_ok() {
                    return true;
                }
            }
        }
        if a.gold > 150. {
            if let Some(c) = cities
                .iter()
                .filter(|c| {
                    c.production < 3 && enemies.iter().all(|u| self.distances(c.tile)[u.tile] > 2)
                })
                .max_by_key(|c| c.production)
            {
                if self.command(p, "upgrade", c.tile, 0, 1).is_ok() {
                    return true;
                }
            }
        }
        false
    }
    fn position_value(
        &self,
        u: &Unit,
        tile: usize,
        goal: usize,
        depth: u8,
        enemies: &[Unit],
        enemy_dist: &[Vec<u16>],
    ) -> f32 {
        let mut score = 0.;
        let d = self.distances(tile);
        let st = spec(u.kind);
        for (e, dist) in enemies.iter().zip(enemy_dist) {
            let separation = dist[tile];
            let their = spec(e.kind);
            let my_shot = separation >= st.min && separation <= st.range;
            let their_shot = separation >= their.min && separation <= their.range;
            let mut actor = u.clone();
            actor.tile = tile;
            if my_shot {
                score += self.damage(&actor, e) / e.hp.max(15.) * 24.;
            }
            let ready = if depth >= 2 && e.locked_until > self.tick + st.speed as u32 {
                0.3
            } else {
                1.
            };
            let immediate_threat = if their_shot {
                self.damage(e, &actor) / u.hp.max(15.) * 28. * ready
            } else {
                0.
            };
            score -= immediate_threat;
            if depth >= 2
                && separation <= their.range + 1
                && their.damage > 0.
                && e.locked_until <= self.tick
            {
                // An opponent may close one hex or escape a minimum-range weapon.
                let mut best = 0f32;
                for &reply in &self.tiles[e.tile].near {
                    if self.can_enter(e.kind, reply) && self.occupant(reply).is_none() {
                        let dr = d[reply];
                        if dr >= their.min && dr <= their.range {
                            let mut b = e.clone();
                            b.tile = reply;
                            best = best.max(self.damage(&b, &actor) / u.hp.max(15.) * 16.);
                        }
                    }
                }
                // These are alternative replies by the same piece, not two simultaneous hits.
                score -= (best - immediate_threat).max(0.);
            }
            if depth >= 3 && separation <= 4 {
                // Friendly support and a safe next retreat matter over a second exchange.
                let support: f32 = self
                    .squads
                    .iter()
                    .filter(|a| {
                        a.owner == u.owner
                            && a.id != u.id
                            && dist[a.tile] >= spec(a.kind).min
                            && dist[a.tile] <= spec(a.kind).range
                            && a.locked_until <= self.tick + st.speed as u32
                    })
                    .map(|a| self.damage(a, e) / e.hp.max(15.))
                    .sum();
                score += support.min(1.5) * 5.;
                if matches!(e.kind, 2 | 4 | 6 | 7) && separation <= their.range + 1 {
                    let nearby = self
                        .squads
                        .iter()
                        .filter(|a| {
                            a.owner == u.owner
                                && a.id != u.id
                                && self.tiles[tile].near.contains(&a.tile)
                        })
                        .count();
                    score -= nearby as f32 * 5.;
                }
                let escapes = self.tiles[tile]
                    .near
                    .iter()
                    .filter(|&&t| {
                        self.can_enter(u.kind, t)
                            && self.occupant(t).is_none()
                            && dist[t] > separation
                    })
                    .count();
                if escapes == 0 && u.hp < st.hp * 0.6 {
                    score -= 10.;
                }
            }
        }
        if self.tiles[tile].owner == u.owner as i8 && u.hp < st.hp * 0.6 {
            score += 7.;
        }
        if tile == goal
            && self
                .cities
                .iter()
                .any(|c| c.tile == tile && c.owner != u.owner)
            && !matches!(u.kind, 6..=9)
        {
            score += 24.;
        }
        if self
            .cities
            .iter()
            .any(|c| c.tile == tile && c.owner == u.owner)
            && enemies.iter().any(|e| d[e.tile] <= 3)
        {
            score += 18.;
        }
        if u.kind == 4 && tile == u.tile && self.tick - u.moved >= 10 {
            score += 6.;
        }
        score
    }
}
