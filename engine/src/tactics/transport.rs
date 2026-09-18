use super::*;

impl Game {
    pub fn passenger_count(&self, id: usize) -> usize {
        self.squads
            .iter()
            .filter(|u| u.boarded_on == Some(id))
            .count()
    }

    // Boarding is a terminal move onto a friendly transport, never a water path.
    pub fn boarding_target(&self, u: &Unit, tile: usize) -> Option<usize> {
        if u.boarded_on.is_some()
            || tile >= self.tiles.len()
            || self.tiles[tile].terrain != 0
            || self.can_enter(u.kind, tile)
        {
            return None;
        }
        self.occupant(tile)
            .filter(|ship| {
                ship.owner == u.owner
                    && ship.hp > 0.
                    && ship.refit < 0
                    && self.passenger_count(ship.id) < spec(ship.kind).boarding_capacity as usize
            })
            .map(|ship| ship.id)
    }

    pub(super) fn board(&mut self, i: usize, ship: usize, tile: usize) {
        let u = &mut self.squads[i];
        u.boarded_on = Some(ship);
        u.tile = tile;
        u.to = tile;
        u.path = vec![tile];
        u.left = 0;
        u.total = 0;
        u.moved = self.tick;
        u.mode = 0;
        u.effect_until = 0;
        u.focus = None;
        u.fire_at = 0;
        u.founding = false;
        u.work = 0;
    }

    pub(super) fn sync_passengers(&mut self) {
        let ships: Vec<_> = self
            .squads
            .iter()
            .filter(|u| u.boarded_on.is_none() && u.hp > 0.)
            .map(|u| (u.id, u.tile))
            .collect();
        for u in &mut self.squads {
            if let Some(id) = u.boarded_on {
                if let Some(&(_, tile)) = ships.iter().find(|&&(ship, _)| ship == id) {
                    u.tile = tile;
                    u.to = tile;
                    u.path = vec![tile];
                } else {
                    u.hp = 0.;
                }
            }
        }
        self.squads.retain(|u| u.hp > 0.);
    }

    pub(super) fn disembark(&mut self, i: usize, to: usize) -> Result<(), u8> {
        let ship = self.squads[i].clone();
        if spec(ship.kind).boarding_capacity == 0 || ship.left > 0 {
            return Err(6);
        }
        if to >= self.tiles.len()
            || !self.tiles[ship.tile].near.contains(&to)
            || self.tiles[to].terrain == 0
            || self.occupant(to).is_some()
        {
            return Err(4);
        }
        let passenger = self
            .squads
            .iter()
            .position(|u| u.boarded_on == Some(ship.id) && self.can_enter(u.kind, to))
            .ok_or(6)?;
        let cooldown = self.move_cost(&self.squads[passenger], to);
        let u = &mut self.squads[passenger];
        u.boarded_on = None;
        u.tile = to;
        u.to = to;
        u.path = vec![to];
        u.moved = self.tick;
        u.left = cooldown;
        u.total = cooldown;
        // Unloading stops the carrier's route and uses the normal shared order interval.
        self.squads[i].path = vec![ship.tile];
        self.squads[i].to = ship.tile;
        self.squads[i].locked_until = self.tick + 2;
        Ok(())
    }
}
