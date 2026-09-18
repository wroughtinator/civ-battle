//! Observation-limited planning. Difficulty changes forecasting, never income or damage.
use super::*;

fn military_technologies(policy:u8)-> &'static [u8] {
    match policy {
        1=>&[15,16,17,26,34], 2=>&[1,24,3,22], 3=>&[2,14,23,32],
        4=>&[18,4,25,35,22], 5=>&[2,19,20,31,7,29,8,30,9], _=>&[]
    }
}

impl Game {
    // Civilian and support jobs occupy real slots too. Keep one free slot for
    // a situational response instead of targeting an impossible army size.
    fn bot_army_capacity(&self,p:usize)->usize {
        let support=self.squads.iter().filter(|u|u.owner==p&&spec(u.kind).damage==0.).count()
            +self.cities.iter().filter(|c|c.owner==p&&c.training>=0&&spec(c.training as u8).damage==0.).count();
        self.cap(p).saturating_sub(support+1)
    }
    pub fn bot(&mut self, p: usize) {
        self.bot_policy(p, 0);
    }
    // Policies 1..6 are deliberately narrow audit opponents, with the same economy.
    pub fn bot_policy(&mut self, p: usize, policy: u8) {
        if !self.players[p].alive {return;}
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
        if !self.players[p].alive {
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
        // Interruption is an objective, not just another low-health target.
        // Use only the same broadcast pad and detected engineer humans see.
        let mut launches:Vec<_>=enemies.iter().filter(|e|e.kind==10
            && self.players.get(e.owner).is_some_and(|a|a.launch_tile==Some(e.tile))).collect();
        launches.sort_by_key(|e|Reverse(self.players[e.owner].launch));
        for e in launches {
            for u in &own {
                if u.left>0||u.locked_until>self.tick {continue;}
                if (u.kind==11||u.kind==8) && u.ability_ready<=self.tick
                    && !own.iter().any(|f|f.tile==e.tile||(u.kind==11&&self.tiles[e.tile].near.contains(&f.tile)))
                    && self.command(p,"ability",u.id,e.tile,if u.kind==8{2}else{0}).is_ok(){return;}
                if spec(u.kind).damage>0. && !u.automated
                    && self.command(p,"attack",u.id,e.tile,0).is_ok(){return;}
                if u.kind==11 && u.path.len()<=1 && self.distances(u.tile)[e.tile]>9 {
                    let from=self.distances(u.tile);let target=self.distances(e.tile);
                    let mut positions:Vec<_>=(0..self.tiles.len()).filter(|&t|target[t]<=9
                        && self.can_enter(u.kind,t)&&self.occupant(t).is_none()).collect();
                    positions.sort_by_key(|&t|from[t]);
                    if let Some(t)=positions.into_iter().find(|&t|self.path(u,t).is_some()) {
                        if self.command(p,"move",u.id,t,0).is_ok(){return;}
                    }
                }
            }
        }
        if self.bot_transport(p,&own) {return;}
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
        let mut preferred = match policy {
            1 => 0,
            2 => 1,
            3 => 2,
            4 => 4,
            5 => 7,
            6 => 10,
            _ => {
                if enemies.is_empty() {
                    BRANCHES[(p + self.seed as usize) % BRANCHES.len()][0]
                } else {
                    *a.unlocked
                        .iter()
                        .filter(|&&k| spec(k).damage>0.)
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
                                        let reachable = if naval(kind)
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
                                let splash = if definition(kind).splash || matches!(kind, 2 | 6 | 7) {
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
        if (1..=5).contains(&policy) {
            let family:&[u8]=match policy {1=>&[0,15,16,26],2=>&[1,24,3],3=>&[2,14,23,32],4=>&[18,4,25,35],_=>&[0,1,2,5,19,20,7,29,8,9]};
            let value=|k:u8|{
                let sp=spec(k);
                let coverage=if enemies.is_empty(){if k==32{0.2}else{1.}}else{enemies.iter().map(|e|{
                    let access=if naval(k)&&self.tiles[e.tile].terrain>0 {if k==8{0.}else if self.tiles[e.tile].near.iter().any(|&t|self.tiles[t].terrain==0){0.65}else{0.1}}else{1.};
                    Self::multiplier(k,e.kind)*access
                }).sum::<f32>()/enemies.len() as f32};
                coverage*sp.damage/sp.reload as f32*sp.hp.sqrt()/sp.cost as f32*(1.+sp.range as f32*0.3)/(1.+own.iter().filter(|u|u.kind==k).count() as f32*0.3)
            };
            preferred=family.iter().copied().filter(|k|a.unlocked.contains(k)).max_by(|&k,&l|value(k).total_cmp(&value(l))).unwrap_or(0);
        }
        // Utility units maintain their jobs without repetitive ability commands.
        for u in &own {
            if u.left>0||u.locked_until>self.tick {continue;}
            if u.kind==11 && a.gold>=150. {
                let d=self.distances(u.tile);
                if let Some(e)=enemies.iter().filter(|e|d[e.tile]<=9
                    && !own.iter().any(|f|f.tile==e.tile||self.tiles[e.tile].near.contains(&f.tile)))
                    .max_by_key(|e|enemies.iter().filter(|b|b.tile==e.tile||self.tiles[e.tile].near.contains(&b.tile)).count()) {
                    if (enemies.iter().filter(|b|b.tile==e.tile||self.tiles[e.tile].near.contains(&b.tile)).count()>=2
                        || self.players.get(e.owner).is_some_and(|a|a.launch>0)) && self.command(p,"ability",u.id,e.tile,0).is_ok(){return;}
                }
            }
            if definition(u.kind).directional {
                if let Some(e)=enemies.iter().min_by_key(|e|self.distances(u.tile)[e.tile]) {
                    if self.distances(u.tile)[e.tile]<=4 && !self.in_front(u,e.tile) {
                        let d=self.distances(e.tile);
                        if let Some(t)=self.tiles[u.tile].near.iter().copied().min_by_key(|&t|d[t]) {
                            if self.command(p,"face",u.id,t,0).is_ok(){return;}
                        }
                    }
                }
            }
            if matches!(u.kind,17|22|27|28|33|34) && u.path.len()==1 {
                let mut choices:Vec<_>=self.tiles[u.tile].near.iter().copied().chain(std::iter::once(u.tile)).filter(|&t|self.can_enter(u.kind,t)&&self.occupant(t).is_none_or(|s|s.id==u.id)).collect();
                let value=|t:usize|{let d=self.distances(t);own.iter().filter(|f|f.id!=u.id&&spec(f.kind).damage>0.).map(|f|if d[f.tile]==1{4.}else{-(d[f.tile] as f32)*0.2}).sum::<f32>()-enemies.iter().map(|e|if d[e.tile]<=spec(e.kind).range{10.}else{0.}).sum::<f32>()};
                choices.sort_by(|&x,&y|value(y).total_cmp(&value(x)));
                if let Some(&t)=choices.first(){if t!=u.tile && value(t)>value(u.tile)+0.2 && self.command(p,"move",u.id,t,0).is_ok(){return;}}
            }
        }
        // Military policies save for replacements during an actual city attack.
        // A switch of policy must be able to change a standing research goal;
        // otherwise every late-game portfolio choice silently funds the same plan.
        let pressure=policy!=6&&enemies.iter().any(|u|u.owner<self.players.len()&&cities.iter().any(|c|self.distances(c.tile)[u.tile]<=3));
        let family=military_technologies(policy);
        let military_complete=family.iter().all(|k|a.unlocked.contains(k));
        let launch_alarm=self.players.iter().enumerate().any(|(q,a)|q!=p&&a.launch_tile.is_some());
        if !family.is_empty() && a.research_queue.last().is_some_and(|k|!family.contains(k)&&!(*k==10&&military_complete)&&!(*k==11&&launch_alarm)) {
            if self.command(p,"plan",0,0,255).is_ok(){return;}
        }
        if pressure&&a.gold<250.&&!a.research_queue.is_empty()&&own.iter().filter(|u|spec(u.kind).damage>0.&&u.hp>spec(u.kind).hp*0.5).count()<4 {
            if self.command(p,"plan",0,0,255).is_ok(){return;}
        }
        // Reserve an occasional order for investment so repeated combat cannot starve it.
        if (self.tick + p as u32) % 12 < 2
            && self.bot_economy(p, policy, preferred, &own, &cities, &enemies)
        {
            return;
        }

        let depth = if policy == 0 { self.difficulty + 1 } else { 1 };
        // Manual units need one order per shot; robot units handle their own fire.
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
                if !u.automated && self.command(p, "attack", u.id, e.tile, 0).is_ok() {
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
                // Arriving occupies the site before the movement cooldown expires.
                // Wait there; choosing a new site now would endlessly reroute settlers.
                if u.left>0 || u.path.len()>1 || self.foundable(u.tile) {
                    continue;
                }
                let d = self.distances(u.tile);
                let mut sites: Vec<_> = (0..self.tiles.len())
                    .filter(|&i| {
                        matches!(self.tiles[i].terrain, 1 | 2 | 3)
                            && city_dist.iter().all(|ds| ds[i] >= 4)
                            && self.occupant(i).is_none()
                            && !self
                                .squads
                                .iter()
                                .any(|s| s.founding && self.distances(s.tile)[i] < 4)
                    })
                    .collect();
                sites.sort_by_key(|&i| {
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
                let dest = sites.into_iter().take(12).find(|&t| self.path(u,t).is_some());
                if let Some(t) = dest {
                    if self.command(p, "move", u.id, t, 0).is_ok() {
                        return;
                    }
                }
            }
        }
        // Inexpensive defensive formations come before expensive exposed development.
        let combat_count = own.iter().filter(|u| spec(u.kind).damage > 0.).count();
        let desired = (if policy==6 {2+cities.len()}
            else if (1..=5).contains(&policy)||a.gold>500. {self.bot_army_capacity(p)}
            else {3+cities.len()+usize::from(pressure)*2}).min(self.bot_army_capacity(p));
        // Keep an emergency defence, but do not spend every research saving on
        // another replacement. Completing the tree is now a real win route.
        let research_reserve = if a.research < 0 && combat_count >= 3 && !a.research_queue.is_empty() {
            technologies().filter(|k| !a.unlocked.contains(k))
                .filter_map(|k| self.research_info(k))
                .filter(|info| self.tick >= info.3 && info.2.iter().all(|k|a.unlocked.contains(k)))
                .map(|info|info.0).min().unwrap_or(0) as f32
        } else { 0. };
        let founding_reserve=if own.iter().any(|u|u.kind==SETTLER&&!u.founding&&self.foundable(u.tile)){35.+cities.len() as f32*25.}else{0.};
        let reserve=research_reserve.max(founding_reserve);
        if combat_count < desired && (threat || a.gold > 115.) {
            let k = if a.unlocked.contains(&preferred) && spec(preferred).damage>0. {
                preferred
            } else {
                0
            };
            if a.gold >= spec(k).cost as f32 + reserve { if let Some(c) = cities
                .iter()
                .filter(|c| {
                    c.training < 0
                        && (!naval(k)
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
            } }
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
            if naval(u.kind) {
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
            // An assault should pursue the income source, not chase whichever
            // enemy soldier happens to be nearest. Estimate the income swing
            // after travel and occupation; tactical scoring below still checks
            // whether each step is safe. Unknown capital production stays a
            // prior, never privileged knowledge from the referee state.
            let objective=|t:usize| {
                if let Some(c)=self.cities.iter().find(|c|c.tile==t) {
                    if c.owner!=p {
                        if self.players[c.owner].launch_tile==Some(t) {
                            return (-1,(SPACE_GOAL-self.players[c.owner].launch.min(SPACE_GOAL)) as f32);
                        }
                        let production=if vision[t]{c.production}else{1};
                        let travel=d[t] as f32*spec(u.kind).speed as f32+12.;
                        let income_swing=2.*(4.+production as f32*4.)/5.;
                        let return_value=income_swing*(240.-travel).max(0.);
                        return (1,-return_value);
                    }
                    if d[t]<=4 && enemies.iter().any(|e|self.distances(t)[e.tile]<=3) {
                        return (0,d[t] as f32);
                    }
                }
                (2,d[t] as f32)
            };
            targets.sort_by(|&a,&b|{let x=objective(a);let y=objective(b);x.0.cmp(&y.0).then(x.1.total_cmp(&y.1))});
            targets.truncate(3);
            let Some(&goal) = targets.first() else {
                continue;
            };
            // An occupied city is not a legal path destination. Advance to a
            // firing position, then occupy the city after its defender falls.
            let approach = if self.occupant(goal).is_some_and(|b|b.id!=u.id) {
                let goal_dist=self.distances(goal);
                let mut positions:Vec<_>=(0..self.tiles.len()).filter(|&t|
                    goal_dist[t]>=spec(u.kind).min.max(1) && goal_dist[t]<=spec(u.kind).range.max(1)
                    && self.can_enter(u.kind,t) && self.occupant(t).is_none()).collect();
                positions.sort_by_key(|&t|d[t]);
                positions.into_iter().find(|&t|self.path(u,t).is_some()).unwrap_or(goal)
            }else{goal};
            let dg = self.distances(goal);
            let mut candidates = vec![u.tile];
            candidates.extend(self.tiles[u.tile].near.iter().copied());
            if let Some(route) = self.path(u, approach) {
                candidates.push(*route.get(1).unwrap_or(&u.tile));
            }
            for tile in candidates {
                if !self.can_enter(u.kind, tile)
                    || self.occupant(tile).is_some_and(|b| b.id != u.id)
                    || self.guard_blocks(u,u.tile,tile,Some(&vision))
                {
                    continue;
                }
                let positional = self.position_value(u, tile, goal, depth, &enemies, &enemy_dist);
                let current = self.position_value(u, u.tile, goal, depth, &enemies, &enemy_dist);
                let progress = (dg[u.tile] as f32 - dg[tile] as f32) * 2.;
                if tile != u.tile && !(u.left > 0 && u.to == tile) {
                    orders.push((positional - current + progress, u.id, tile));
                }
            }
            // Long routes are a single command. Tactical replanning starts on contact.
            if !enemies.iter().any(|e| d[e.tile] <= 5) && u.path.len() <= 1 {
                if approach != u.tile && self.path(u, approach).is_some() {
                    orders.push((
                        5. + (hash(self.tick / 12 + u.id as u32) % 7) as f32 * 0.1,
                        u.id,
                        approach,
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
        if own.iter().any(|u|u.kind==SETTLER&&!u.founding&&self.foundable(u.tile)) {
            // Save for the city already reached instead of feeding every coin into a queue.
            if !a.research_queue.is_empty() {return self.command(p,"plan",0,0,255).is_ok();}
            return false;
        }
        let threat = enemies
            .iter()
            .any(|u| cities.iter().any(|c| self.distances(c.tile)[u.tile] <= 3));
        // A broadcast pad can be hit by a strategic launcher even when its
        // engineer is alone. Waiting for a clustered army misses the objective.
        let pads:Vec<_>=self.players.iter().enumerate().filter(|(q,_)|*q!=p).filter_map(|(_,a)|a.launch_tile).collect();
        if let Some(c)=cities.iter().filter(|c|c.training<0&&!pads.is_empty())
            .min_by_key(|c|pads.iter().map(|&t|self.distances(c.tile)[t]).min().unwrap_or(u16::MAX)) {
            if !a.unlocked.contains(&11) {
                if a.research!=11&&a.research_queue.last()!=Some(&11)
                    && self.command(p,"plan",0,0,11).is_ok(){return true;}
            }else if !own.iter().any(|u|u.kind==11)&&!cities.iter().any(|c|c.training==11)
                && a.gold>=spec(11).cost as f32+150.
                && self.command(p,"train",c.tile,0,11).is_ok(){return true;}
        }
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
        if policy==5 && !threat && !own.iter().any(|u|spec(u.kind).boarding_capacity>0)
            && !cities.iter().any(|c|c.training>=0&&spec(c.training as u8).boarding_capacity>0) && a.gold>120. {
            let aircraft=enemies.iter().any(|u|air(u.kind));
            if let Some(k)=(if aircraft{[9,31,19]}else{[31,19,9]}).into_iter().find(|k|a.unlocked.contains(k)) {
                if let Some(c)=cities.iter().find(|c|c.training<0&&self.bot_sea_route(p,c.tile,k,own)) {
                    if self.command(p,"train",c.tile,0,k).is_ok(){return true;}
                }
            }
        }
        if !threat
            && cities.len() < if policy==7{4}else{2}
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
        // Invest in income early, then choose a persistent research goal. Queue
        // execution uses exactly the same automatic rules available to humans.
        if a.gold>=110. && (self.tick<180 || policy==6) {
            if let Some(c)=cities.iter().filter(|c|c.production<3).max_by_key(|c|c.production){
                if self.command(p,"upgrade",c.tile,0,1).is_ok(){return true;}
            }
        }
        let emergency=policy!=6&&a.gold<250.&&enemies.iter().any(|u|u.owner<self.players.len()&&cities.iter().any(|c|self.distances(c.tile)[u.tile]<=3))
            && own.iter().filter(|u|spec(u.kind).damage>0.&&u.hp>spec(u.kind).hp*0.5).count()<4;
        if !emergency && a.research < 0 && a.research_queue.is_empty() && !self.space_ready(p) {
            if policy==5&&!a.unlocked.contains(&2)&&a.research!=2 {
                // A navy still needs an inexpensive land escort to hold its ports.
                if self.command(p,"plan",0,0,2).is_ok(){return true;}
            }
            let family=military_technologies(policy);
            let surplus_space=!family.is_empty() && family.iter().all(|k|a.unlocked.contains(k))
                && a.gold>=800. && own.iter().filter(|u|spec(u.kind).damage>0.).count()>=self.bot_army_capacity(p);
            if policy==6 || (self.tick>=360 && family.is_empty()) || surplus_space {
                if self.command(p,"plan",0,0,10).is_ok(){return true;}
            }else{
                let family=military_technologies(policy);
                // A military policy buys its composition, then spends on the
                // army. It must not silently become another full-tree racer.
                // Queued goals still buy every prerequisite through the engine.
                let mut tech:Vec<_>=technologies().filter(|k|!a.unlocked.contains(k)&&a.research!=*k as i8)
                    .filter(|k|family.is_empty()||family.contains(k)).collect();
                tech.sort_by_key(|&k|(if family.contains(&k)||k==preferred{0}else{1},definition(k).era,hash(self.seed ^ k as u32)));
                if let Some(&k)=tech.first(){if self.command(p,"plan",0,0,k).is_ok(){return true;}}
            }
        }
        // Buy one situational response when an observed threat warrants it.
        // These are the same public recruit orders a human can issue.
        let clustered=enemies.iter().any(|e|enemies.iter().filter(|b|b.tile==e.tile||self.tiles[e.tile].near.contains(&b.tile)).count()>=3);
        let launch_threat=enemies.iter().any(|e|self.players.get(e.owner).is_some_and(|a|a.launch>0));
        let response=if launch_threat&&clustered&&a.gold>spec(11).cost as f32+150.{Some(11)}
            else if threat&&enemies.iter().any(|e|air(e.kind)){Some(if policy==5&&a.unlocked.contains(&9)&&cities.iter().any(|c|self.tiles[c.tile].near.iter().any(|&t|self.tiles[t].terrain==0)){9}else{32})}
            else if threat&&enemies.iter().any(|e|naval(e.kind))&&policy==5{Some(30)}
            else if policy==1&&threat{Some(if a.unlocked.contains(&26){26}else{16})}
            else if policy==0&&enemies.iter().any(|e|matches!(e.kind,4|25|35|26)){Some(6)}else{None};
        if let Some(k)=response.filter(|k|a.unlocked.contains(k)&&!own.iter().any(|u|u.kind==*k)&&!cities.iter().any(|c|c.training==*k as i8)){
            if a.gold>spec(k).cost as f32+80. {
                if let Some(c)=cities.iter().find(|c|c.training<0&&(!naval(k)||self.tiles[c.tile].near.iter().any(|&t|self.tiles[t].terrain==0))){
                    if self.command(p,"train",c.tile,0,k).is_ok(){return true;}
                }
            }
        }
        // At most two distinct support jobs, and only when an army can use them.
        if own.iter().filter(|u|spec(u.kind).damage>0.).count()>=3 && !threat && a.gold>180. {
            let mechanical=own.iter().filter(|u|definition(u.kind).mechanical&&spec(u.kind).damage>0.).count();
            let support=if policy==1{[34,27,17,22,33,28]}else if enemies.iter().any(|e|e.kind==8||e.kind==5){[33,28,22,27,17,34]}
                else if mechanical>=2{[22,34,27,17,33,28]}else if enemies.is_empty(){[28,33,17,27,22,34]}else{[27,17,34,22,33,28]};
            if let Some(k)=support.into_iter().find(|k|a.unlocked.contains(k)&&!own.iter().any(|u|u.kind==*k)) {
                let count=own.iter().filter(|u|matches!(u.kind,17|22|27|28|33|34)).count()+cities.iter().filter(|c|matches!(c.training,17|22|27|28|33|34)).count();
                if count<if a.gold>300.{2}else{1} {
                    if let Some(c)=cities.iter().find(|c|c.training<0){if self.command(p,"train",c.tile,0,k).is_ok(){return true;}}
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
                    if self.can_enter(e.kind, reply) && self.occupant(reply).is_none()
                        && !self.guard_blocks(e,e.tile,reply,None) {
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
            && ground(u.kind)
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
        if definition(u.kind).setup>0 && tile == u.tile && self.tick - u.moved >= definition(u.kind).setup {
            score += 6.;
        }
        score
    }
}
