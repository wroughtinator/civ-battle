use super::*;
impl Game {
    pub(super) fn bot_sea_route(&self,p:usize,city:usize,kind:u8,own:&[Unit])->bool {
        let Some(mut probe)=own.iter().find(|u|ground(u.kind)&&spec(u.kind).damage>0.).cloned() else{return false;};
        probe.kind=kind;probe.boarded_on=None;
        for sea in self.tiles[city].near.iter().copied().filter(|&t|self.tiles[t].terrain==0&&self.occupant(t).is_none()) {
            probe.tile=sea;probe.to=sea;probe.path=vec![sea];
            for c in self.cities.iter().filter(|c|c.owner!=p) {
                if self.tiles[c.tile].near.iter().any(|&t|self.tiles[t].terrain==0&&self.path(&probe,t).is_some()){return true;}
            }
        }
        false
    }
    pub(super) fn bot_transport(&mut self,p:usize,own:&[Unit])->bool {
        let tick=self.tick;
        for ship in own.iter().filter(|u|spec(u.kind).boarding_capacity>0&&u.left==0&&u.locked_until<=tick) {
            let mut goals:Vec<_>=self.cities.iter().filter(|c|c.owner!=p)
                .flat_map(|c|self.tiles[c.tile].near.iter().copied().filter(|&t|self.tiles[t].terrain==0).map(|t|(c.tile,t)))
                .filter(|&(_,t)|self.occupant(t).is_none_or(|u|u.id==ship.id)).collect();
            let d=self.distances(ship.tile);goals.sort_by_key(|&(_,t)|d[t]);
            let Some((city,sea))=goals.into_iter().find(|&(_,t)|t==ship.tile||self.path(ship,t).is_some()) else{continue;};
            if self.passenger_count(ship.id)>0 {
                let dc=self.distances(city);
                let mut land:Vec<_>=self.tiles[ship.tile].near.iter().copied().filter(|&t|self.tiles[t].terrain>0&&dc[t]<=3&&self.occupant(t).is_none()).collect();
                land.sort_by_key(|&t|dc[t]);
                for to in land {if self.command(p,"disembark",ship.id,to,0).is_ok(){return true;}}
                if ship.tile!=sea && ship.to!=sea && self.command(p,"move",ship.id,sea,0).is_ok(){return true;}
            }else if ship.path.len()==1 {
                let mut troops:Vec<_>=own.iter().filter(|u|ground(u.kind)&&spec(u.kind).damage>0.&&u.locked_until<=self.tick
                    && !self.cities.iter().any(|c|c.tile==u.tile&&c.owner==p)&&d[u.tile]<=5).collect();
                troops.sort_by_key(|u|d[u.tile]);
                for u in troops {if u.to!=ship.tile&&self.command(p,"move",u.id,ship.tile,0).is_ok(){return true;}}
            }
        }
        false
    }
    pub(super) fn research_path(&self,p:usize,k:u8,queue:&mut Vec<u8>) {
        if self.players[p].unlocked.contains(&k)||self.players[p].research==k as i8||queue.contains(&k) {return;}
        for &parent in &definition(k).prerequisites {self.research_path(p,parent,queue);}
        queue.push(k);
    }
    /// A 120 degree frontal cone, shown by the unit's model and ground wedge.
    /// All calculations use the globe tangent plane, including pentagons.
    pub fn in_front(&self,u:&Unit,tile:usize)->bool {
        let Some(f)=u.facing.filter(|&f|f<self.tiles.len()) else{return false;};
        let origin=self.tiles[u.tile].p;
        let tangent=|p:[f32;3]| {let h=dot(p,origin);norm([p[0]-origin[0]*h,p[1]-origin[1]*h,p[2]-origin[2]*h])};
        tile!=u.tile && dot(tangent(self.tiles[f].p),tangent(self.tiles[tile].p))>=0.49
    }
    pub(super) fn support_units(&mut self) {
        if self.tick%5!=0{return;}
        let mut healing=vec![0f32;self.squads.len()];
        let mut sources=vec![None;self.squads.len()];
        for u in &self.squads {
            if !matches!(u.kind,17|22|27)||u.boarded_on.is_some()||u.left>0||u.path.len()>1 {continue;}
            for (i,b) in self.squads.iter().enumerate() {
                if b.owner!=u.owner || b.id==u.id || b.boarded_on.is_some() || !self.tiles[u.tile].near.contains(&b.tile)
                    || self.tick.saturating_sub(b.hurt)<if u.kind==27{4}else{8} {continue;}
                let allowed=match u.kind {17=>ground(b.kind)&&!definition(b.kind).mechanical,22=>definition(b.kind).mechanical,_=>ground(b.kind)};
                let amount=if u.kind==27{6.}else{4.};
                if allowed && amount>healing[i] {healing[i]=amount;sources[i]=Some(u.clone());}
            }
        }
        // Only the strongest neighbouring healer applies; stacking is not a multiplier.
        for (i,amount) in healing.into_iter().enumerate().filter(|(_,a)|*a>0.) {
            let u=self.squads[i].clone();let actual=amount.min(spec(u.kind).hp-u.hp);
            if actual>0. {
                self.squads[i].hp+=actual;self.feedback("heal",&u,u.tile,0,actual,2);
                if let Some(source)=&sources[i]{self.feedback("support",source,u.tile,0,actual,1);}
            }
        }
    }
}
