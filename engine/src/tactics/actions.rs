use super::*;
impl Game {
    pub(super) fn order_attack(&mut self, i: usize, to: usize, salvo: u8) -> Result<(), u8> {
        let u = self.squads[i].clone();
        let s = spec(u.kind);
        if u.boarded_on.is_some() || u.locked_until > self.tick || u.left > 0 || u.refit >= 0 || u.founding {
            return Err(2);
        }
        let range = if salvo > 0 && u.kind == 6 { 3 } else { s.range };
        if to >= self.tiles.len()
            || s.damage == 0.
            || !self.vision(u.owner)[to]
            || self.tiles[u.tile].terrain == 0 && ground(u.kind)
        {
            return Err(4);
        }
        let d = self.distances(u.tile)[to];
        if d < s.min || d > range || !definition(u.kind).indirect && !self.line_of_sight(u.tile, to) {
            return Err(4);
        }
        if u.kind == 8 && self.tiles[to].terrain > 0 {
            return Err(4);
        }
        if self.tick.saturating_sub(u.moved) < definition(u.kind).setup {
            return Err(6);
        }
        let windup = if definition(u.kind).setup>0 {
            5
        } else if salvo > 0 {
            4
        } else {
            2
        };
        let recovery = s.reload + if salvo > 0 { 10 } else { 0 };
        let focus = if salvo == 0 {
            self.occupant(to)
                .filter(|b| b.owner != u.owner)
                .map(|b| b.id)
        } else {
            None
        };
        let a = &mut self.squads[i];
        a.fire_at = self.tick + windup;
        a.aim = to;
        a.salvo = salvo;
        a.locked_until = self.tick + recovery;
        a.ready = a.locked_until;
        a.focus = focus;
        a.path = vec![a.tile];
        a.to = a.tile;
        a.revealed = self.tick + windup + 12;
        let visible_actor = self.squads[i].clone();
        self.feedback("shot", &visible_actor, to, salvo, 0., windup as u16);
        Ok(())
    }
}
