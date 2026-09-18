//! Fixed fixtures with a longer simulated match horizon. Descriptive only;
//! never substitutes for the 2,200-tick completion or input-restraint gates.
use super::*;

pub(super) fn run(args:&[String]) {
    let seed:u32=args[2].parse().unwrap();
    let dir=PathBuf::from(&args[3]);
    let rounds:usize=args[4].parse().unwrap();
    let max_ticks:u32=args[5].parse().unwrap();
    assert!((1..=64).contains(&rounds)&&(2200..=21600).contains(&max_ticks));
    fs::create_dir_all(&dir).unwrap();
    let mut out=BufWriter::new(File::create(dir.join("events.jsonl")).unwrap());
    let start=Instant::now();
    emit(&mut out,json!({"type":"config","mode":"long_outcomes","seed":seed,"rounds":rounds,"max_ticks":max_ticks,"policies":&NAMES[..8],"certificate":false}));
    let mut jobs=vec![];
    for round in 0..rounds {
        for a in 0..8 {for b in a+1..8 {for seat in 0..2 {
            let controllers=if seat==0{vec![Controller::Fixed(a),Controller::Fixed(b)]}else{vec![Controller::Fixed(b),Controller::Fixed(a)]};
            jobs.push((seed.wrapping_add(round as u32),round,format!("{a}-{b}"),seat,controllers));
        }}}
        for seat in 0..8 {
            jobs.push((seed.wrapping_add(20000+round as u32),round,"eight-player".into(),seat,
                (0..8).map(|p|Controller::Fixed((p+seat)%8)).collect()));
        }
    }
    let workers=std::thread::available_parallelism().map(|n|n.get()).unwrap_or(2).div_ceil(2).min(8);
    let mut completed=0;
    for chunk in jobs.chunks(workers) {
        let results=std::thread::scope(|scope|{
            let handles:Vec<_>=chunk.iter().map(|(seed,round,fixture,seat,controllers)|scope.spawn(move||{
                let m=play_until(*seed,controllers,120,Instant::now()+Duration::from_secs(86400),&mut vec![],max_ticks);
                json!({"type":"outcome","round":round,"fixture":fixture,"seat":seat,"players":controllers.len(),"match":m})
            })).collect();
            handles.into_iter().map(|h|h.join().unwrap()).collect::<Vec<_>>()
        });
        for result in results {emit(&mut out,result);}
        completed+=chunk.len();eprintln!("Long outcomes: {completed}/{} fixtures written",jobs.len());
    }
    emit(&mut out,json!({"type":"end","elapsed_seconds":start.elapsed().as_secs_f64()}));
}
