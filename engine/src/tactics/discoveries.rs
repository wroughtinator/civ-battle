use super::*;
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Discovery {
    pub tile: usize,
    pub kind: u8,
    pub variant: u32,
    pub used: bool,
    pub owner: i8,
    pub seen: u8,
    #[serde(default)]
    pub known_used: u8,
    pub until: u32,
}
impl Game {
    pub fn seed_discoveries(&mut self, secret: u32) {
        let rolls: Vec<_> = (0..self.tiles.len())
            .map(|i| hash(secret.wrapping_add(i as u32 * 104729)))
            .collect();
        self.seed_discovery_rolls(&rolls);
    }
    pub fn seed_discovery_rolls(&mut self, rolls: &[u32]) {
        if rolls.len() != self.tiles.len() {
            return;
        }
        self.discoveries.clear();
        self.squads.retain(|u| u.owner < 8);
        let distance: Vec<_> = self.cities.iter().map(|c| self.distances(c.tile)).collect();
        for tile in 0..self.tiles.len() {
            if self.tiles[tile].terrain == 0
                || distance.iter().any(|d| d[tile] < 4)
                || rolls[tile] % 12 != 0
            {
                continue;
            }
            let variant = hash(rolls[tile]);
            let kind = 1; // Every chest contains gold.
            self.discoveries.push(Discovery {
                tile,
                kind,
                variant,
                used: false,
                owner: -1,
                seen: 0,
                known_used: 0,
                until: 0,
            });
        }
    }
    pub fn claim(&mut self, i: usize) -> Result<(), u8> {
        let u = self.squads[i].clone();
        if u.owner >= 8 {
            return Err(4);
        }
        let n = self.discoveries.iter().position(|d| d.tile == u.tile && !d.used).ok_or(6)?;
        // Secret, persisted randomness: reconnects and retries cannot reroll a chest.
        let amount = (25 + self.discoveries[n].variant % 126) as f32;
        self.players[u.owner].gold += amount;
        self.discoveries[n].kind = 1;
        self.discoveries[n].until = 0;
        self.discoveries[n].used = true;
        self.discoveries[n].owner = u.owner as i8;
        self.discoveries[n].seen |= 1 << u.owner;
        self.discoveries[n].known_used |= 1 << u.owner;
        self.feedback("pickup", &u, u.tile, 1, amount, 4);
        Ok(())
    }
    pub(super) fn encounters(&mut self) {
        if self.tick % 4 == 0 {
            for p in 0..self.players.len() {
                let v = self.vision(p);
                for d in &mut self.discoveries {
                    if v[d.tile] {
                        d.seen |= 1 << p;
                        if d.used {
                            d.known_used |= 1 << p;
                        }
                    }
                }
            }
        }
        if self.tick % 8 != 0 {
            return;
        }
        let barbarians: Vec<_> = self
            .squads
            .iter()
            .filter(|u| u.owner == 8)
            .cloned()
            .collect();
        for u in barbarians {
            let d = self.distances(u.tile);
            let home = self
                .discoveries
                .iter()
                .filter(|s| s.kind == 0 && !s.used)
                .min_by_key(|s| d[s.tile])
                .map(|s| s.tile)
                .unwrap_or(u.tile);
            let leash = self.distances(home);
            let target = self
                .squads
                .iter()
                .filter(|s| s.owner < 8 && d[s.tile] <= 2 && leash[s.tile] <= 3)
                .min_by_key(|s| d[s.tile])
                .map(|s| s.tile)
                .unwrap_or(home);
            if target == u.tile || u.left > 0 || u.locked_until > self.tick {
                continue;
            }
            if let Some(path) = self.path(&u, target) {
                if path.len() > 1 {
                    let n = self.move_cost(&u, path[1]);
                    if let Some(s) = self.squads.iter_mut().find(|s| s.id == u.id) {
                        s.path = path;
                        s.left = n;
                        s.total = n;
                        s.to = target;
                    }
                }
            }
        }
    }
}
