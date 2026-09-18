use super::*;
use std::sync::OnceLock;

pub const UNIT_COUNT:u8=36;
#[derive(Deserialize)]
pub struct UnitDefinition {
    pub researchable:bool,
    pub era:usize,
    pub prerequisites:Vec<u8>,
    pub research_cost:u16,
    pub research_seconds:u16,
    pub domain:String,
    pub mounted:bool,
    pub mechanical:bool,
    pub indirect:bool,
    pub splash:bool,
    pub directional:bool,
    pub setup:u32,
    pub counters:Vec<u8>,
    pub spec:Spec,
}
#[derive(Deserialize)]
struct Roster {units:Vec<UnitDefinition>}
pub fn definition(k:u8)-> &'static UnitDefinition {
    static DATA:OnceLock<Roster>=OnceLock::new();
    &DATA.get_or_init(||serde_json::from_str(include_str!("../../../data/units.json")).expect("validated unit roster")).units[k.min(UNIT_COUNT-1) as usize]
}
pub fn technologies()->impl Iterator<Item=u8> {(0..UNIT_COUNT).filter(|&k|definition(k).researchable)}
pub fn naval(k:u8)->bool {definition(k).domain=="sea"}
pub fn air(k:u8)->bool {definition(k).domain=="air"}
pub fn ground(k:u8)->bool {!naval(k)&&!air(k)}
