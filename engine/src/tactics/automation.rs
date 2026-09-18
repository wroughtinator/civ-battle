use super::*;

impl Game {
    // Per-unit automation has no authority over purchases or other units.
    pub(super) fn automated_movement(&mut self) {
        for i in 0..self.squads.len() {
            let u = self.squads[i].clone();
            if !u.automated || u.boarded_on.is_some() || u.refit >= 0 || u.founding
                || u.left > 0 || u.locked_until > self.tick || u.fire_at > 0
                || u.path.len() > 1 { continue; }
            // Finish occupying a city before selecting another destination.
            if ground(u.kind) && self.cities.iter().any(|c|c.tile==u.tile && c.owner!=u.owner) { continue; }
            let vision = self.vision(u.owner);
            let distance = self.distances(u.tile);
            // Stay in a firing position while setting up or waiting for recovery.
            if spec(u.kind).damage > 0. && self.squads.iter().any(|e|
                e.owner!=u.owner && self.detected(u.owner,e,&vision)
                && distance[e.tile]>=spec(u.kind).min && distance[e.tile]<=spec(u.kind).range
                && (definition(u.kind).indirect || self.line_of_sight(u.tile,e.tile))
                && !(u.kind==8 && self.tiles[e.tile].terrain>0)) { continue; }
            let mut goals = Vec::new();
            if spec(u.kind).damage > 0. {
                for enemy in self.squads.iter().filter(|e|e.owner!=u.owner && self.detected(u.owner,e,&vision)) {
                    let range = self.distances(enemy.tile);
                    for t in 0..self.tiles.len() {
                        if range[t]>=spec(u.kind).min && range[t]<=spec(u.kind).range
                            && (definition(u.kind).indirect || self.line_of_sight(t,enemy.tile))
                            && !(u.kind==8 && self.tiles[enemy.tile].terrain>0)
                            && self.can_enter(u.kind,t) && self.occupant(t).is_none() {
                            goals.push((distance[t],t));
                        }
                    }
                }
            }
            if ground(u.kind) {
                for c in &self.cities {
                    if c.owner!=u.owner && (c.capital>=0 || vision[c.tile]) && self.occupant(c.tile).is_none() {
                        goals.push((distance[c.tile],c.tile));
                    }
                }
            }
            goals.sort_unstable();
            goals.dedup();
            for (_,tile) in goals {
                if let Some(path) = self.path(&u,tile) {
                    self.squads[i].path=path;
                    self.squads[i].to=tile;
                    self.squads[i].focus=None;
                    break;
                }
            }
        }
    }
}
