use super::*;

/// Short-lived presentation records, never an input to combat or AI decisions.
/// The audience is captured when an event happens, not when fog later clears.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Feedback {
    pub id: u64,
    pub tick: u32,
    pub action: String,
    pub owner: usize,
    pub unit: usize,
    pub kind: u8,
    pub from: usize,
    pub to: usize,
    pub value: u8,
    pub amount: f32,
    pub duration: u16,
    pub audience: u16,
}

impl Game {
    pub(super) fn feedback(
        &mut self,
        action: &str,
        u: &Unit,
        to: usize,
        value: u8,
        amount: f32,
        duration: u16,
    ) {
        let mut audience = if u.owner < 8 { 1 << u.owner } else { 0 };
        if matches!(action, "shot" | "hit" | "heal" | "support" | "impact") {
            for p in 0..self.players.len() {
                let v = self.vision(p);
                if v[to] && (action == "impact" || self.detected(p, u, &v)) {
                    audience |= 1 << p;
                }
            }
        }
        self.next_feedback += 1;
        self.feedback.push(Feedback {
            id: self.next_feedback,
            tick: self.tick,
            action: action.into(),
            owner: u.owner,
            unit: u.id,
            kind: u.kind,
            from: if action == "impact" { to } else { u.tile },
            to,
            value,
            amount,
            duration,
            audience,
        });
    }

    pub(super) fn eliminate_landless(&mut self) {
        for p in 0..self.players.len() {
            if self.players[p].alive && !self.cities.iter().any(|c| c.owner == p) {
                let a = &mut self.players[p];
                a.alive = false;
                a.research = -1;
                a.research_left = 0;
                a.launch = 0;
                a.launch_tile = None;
                a.domination = 0;
                a.mandate = 0;
                a.score = 0;
            }
        }
        // Settlers and foundations cannot resurrect a civilization after its last city falls.
        self.squads
            .retain(|u| u.owner == 8 || self.players[u.owner].alive);
    }
}
