use super::*;
use serde_json::json;

pub fn build(directory: &Path, out: &Path) -> Result<()> {
    fs::create_dir_all(out)?;
    let mut files = fs::read_dir(directory)?
        .map(|e| e.map(|e| e.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    files.retain(|p| {
        p.extension().is_some_and(|e| e == "json") && p.with_extension("png").is_file()
    });
    files.sort();
    ensure!(
        !files.is_empty(),
        "Gallery needs matching model.json / model.png pairs"
    );
    let mut contact = RgbaImage::from_pixel(512 * files.len() as u32, 512, Rgba([26, 31, 33, 255]));
    let mut cards = Vec::new();
    let enc = base64::engine::general_purpose::STANDARD;
    for (index, file) in files.iter().enumerate() {
        let m = load(file)?;
        let a = atlas(&m, Some(&file.with_extension("png")))?;
        let stem = file.file_stem().unwrap().to_string_lossy();
        let model_path = out.join(format!("{stem}.gltf"));
        export(&m, &file.with_extension("png"), &model_path)?;
        let triangles = mesh(&m, &pose(&m, "", 0.)?).len();
        let mut modes = Vec::new();
        for n in 0..=m.animations.len() {
            let (label, clip, duration) = if n == 0 {
                ("Orbit", "", 4.)
            } else {
                let c = &m.animations[n - 1];
                (c.name.as_str(), c.name.as_str(), c.duration)
            };
            let mut sheet = RgbaImage::new(384 * 24, 384);
            for frame in 0..24 {
                let c = Camera {
                    yaw: 35. + if n == 0 { frame as f32 * 15. } else { 0. },
                    pitch: 20.,
                    time: frame as f32 / 24. * duration,
                    clip: clip.into(),
                    size: 384,
                    model: String::new(),
                };
                let (img, _, _) = render(&m, &c, &a)?;
                image::imageops::overlay(&mut sheet, &img, frame as i64 * 384, 0);
            }
            let mut png = Cursor::new(Vec::new());
            sheet.write_to(&mut png, image::ImageFormat::Png)?;
            modes.push(json!({"name":label,"duration":duration,"sheet":format!("data:image/png;base64,{}",enc.encode(png.into_inner()))}));
        }
        let c = Camera {
            yaw: 35.,
            pitch: 20.,
            time: 0.,
            clip: String::new(),
            size: 512,
            model: String::new(),
        };
        let (preview, _, _) = render(&m, &c, &a)?;
        preview.save(out.join(format!("{stem}.png")))?;
        image::imageops::overlay(&mut contact, &preview, index as i64 * 512, 0);
        cards.push(json!({"name":m.name,"triangles":triangles,"texture":m.texture_size,"modes":modes,"file":format!("{stem}.gltf"),"download":format!("data:model/gltf+json;base64,{}",enc.encode(fs::read(model_path)?))}));
    }
    contact.save(out.join("models.png"))?;
    let html = include_str!("gallery.html").replace(
        "/*MODEL_DATA*/",
        &serde_json::to_string(&cards)?.replace('<', "\\u003c"),
    );
    fs::write(out.join("index.html"), html)?;
    println!(
        "Saved {} models, actual render previews, glTFs and standalone gallery in {}",
        files.len(),
        out.display()
    );
    Ok(())
}
