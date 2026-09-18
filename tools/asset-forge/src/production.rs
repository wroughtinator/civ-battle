use super::*;
use image::ImageEncoder;
use serde_json::json;

fn save_compact(image: &RgbaImage, path: &Path) -> Result<()> {
    let mut rgb = Vec::with_capacity((image.width() * image.height() * 3) as usize);
    for p in image.pixels() {
        for c in 0..3 {
            rgb.push(((p[c] as u16 + 2) / 4 * 4).min(255) as u8);
        }
    }
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        fs::File::create(path)?,
        image::codecs::png::CompressionType::Best,
        image::codecs::png::FilterType::Adaptive,
    );
    encoder.write_image(
        &rgb,
        image.width(),
        image.height(),
        image::ExtendedColorType::Rgb8,
    )?;
    Ok(())
}

pub fn legacy(m: &Model, texture: &Path, out: &Path) -> Result<()> {
    let a = atlas(m, Some(texture))?;
    let mut bytes = Vec::new();
    let triangles = mesh(m, &pose(m, "", 0.)?);
    let extent = triangles
        .iter()
        .flat_map(|t| t.p)
        .map(|p| p.abs().max_element())
        .fold(1., f32::max);
    for t in triangles {
        let n = (t.p[1] - t.p[0]).cross(t.p[2] - t.p[0]).normalize();
        for j in 0..3 {
            for v in (t.p[j] / extent).to_array().into_iter().chain(n.to_array()) {
                ensure!(v.abs() <= 1.001, "Legacy position exceeds packed bounds");
                bytes.extend(((v.clamp(-1., 1.) * 32767.).round() as i16).to_le_bytes());
            }
            let px = a.get_pixel(
                (t.uv[j].x * m.texture_size as f32).min(m.texture_size as f32 - 1.) as u32,
                (t.uv[j].y * m.texture_size as f32).min(m.texture_size as f32 - 1.) as u32,
            );
            bytes.extend([px[0], px[1], px[2], 255]);
        }
    }
    fs::write(out, bytes)?;
    Ok(())
}
pub fn contact(directory: &Path, textures: &Path, out: &Path) -> Result<()> {
    let mut files = fs::read_dir(directory)?
        .map(|e| e.map(|e| e.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    files.retain(|p| p.extension().is_some_and(|e| e == "json"));
    files.sort();
    ensure!(!files.is_empty(), "No models");
    let mut image = RgbaImage::from_pixel(
        8 * 256,
        files.len().div_ceil(8) as u32 * 256,
        Rgba([33, 39, 40, 255]),
    );
    let mut labels = Vec::new();
    for (i, file) in files.iter().enumerate() {
        let m = load(file)?;
        let a = atlas(
            &m,
            Some(
                &textures
                    .join(file.file_name().unwrap())
                    .with_extension("png"),
            ),
        )?;
        let c = Camera {
            yaw: 35.,
            pitch: 20.,
            size: 256,
            clip: String::new(),
            time: 0.,
            model: String::new(),
        };
        let (rendered, _, _) = render(&m, &c, &a)?;
        image::imageops::overlay(
            &mut image,
            &rendered,
            (i % 8 * 256) as i64,
            (i / 8 * 256) as i64,
        );
        labels.push(m.name);
    }
    image.save(out)?;
    fs::write(
        out.with_extension("json"),
        serde_json::to_vec_pretty(&labels)?,
    )?;
    Ok(())
}

pub fn bake(m: &Model, materials: &Path, out: &Path) -> Result<()> {
    let source = image::open(materials)?.into_rgba8();
    ensure!(
        source.width() == source.height(),
        "Material sheet must be square with a 4x4 grid"
    );
    let grid = (m.parts.iter().map(face_count).sum::<usize>() as f32)
        .sqrt()
        .ceil() as u32;
    let cell = m.texture_size / grid;
    let mut seed = RgbaImage::new(m.texture_size, m.texture_size);
    let mut offset = 0;
    for p in &m.parts {
        ensure!(p.material < 16, "Material index must be 0..15");
        for f in 0..face_count(p) {
            let tile = (offset + f) as u32;
            let ox = tile % grid * cell;
            let oy = tile / grid * cell;
            for y in 0..cell {
                for x in 0..cell {
                    let u = ((x as f32 - 1.) / (cell - 2) as f32).clamp(0.02, 0.98);
                    let v = ((y as f32 - 1.) / (cell - 2) as f32).clamp(0.02, 0.98);
                    // Filter each source material down to its actual face allocation.
                    let mut sum = [0u32; 3];
                    for sy in 0..4 {
                        for sx in 0..4 {
                            let u = (u + (sx as f32 - 1.5) / 4. / cell as f32).clamp(0.02, 0.98);
                            let v = (v + (sy as f32 - 1.5) / 4. / cell as f32).clamp(0.02, 0.98);
                            let px = source.get_pixel(
                                ((p.material % 4) as f32 + u)
                                    .mul_add(source.width() as f32 / 4., 0.)
                                    as u32,
                                ((p.material / 4) as f32 + v)
                                    .mul_add(source.height() as f32 / 4., 0.)
                                    as u32,
                            );
                            for c in 0..3 {
                                sum[c] += px[c] as u32;
                            }
                        }
                    }
                    seed.put_pixel(
                        ox + x,
                        oy + y,
                        Rgba([
                            (sum[0] / 16) as u8,
                            (sum[1] / 16) as u8,
                            (sum[2] / 16) as u8,
                            255,
                        ]),
                    );
                }
            }
        }
        offset += face_count(p);
    }
    let mut result = RgbaImage::new(m.texture_size, m.texture_size);
    let mut painted = 0;
    for (yaw, pitch) in [
        (35., 20.),
        (125., 20.),
        (215., 20.),
        (305., 20.),
        (0., 80.),
        (180., -80.),
        (90., -30.),
        (270., -30.),
    ] {
        let camera = Camera {
            yaw,
            pitch,
            time: 0.,
            clip: String::new(),
            size: 512,
            model: serde_json::to_string(m)?,
        };
        let (stencil, _, _) = render(m, &camera, &seed)?;
        painted += paint(m, &camera, &stencil, &mut result, false)?;
    }
    // Enclosed faces cannot be reached by an exterior camera. Seed from the same material.
    for (px, fallback) in result.pixels_mut().zip(seed.pixels()) {
        if px[3] == 0 {
            *px = *fallback;
        }
    }
    save_compact(&result, out)?;
    println!(
        "{}: {painted} camera-painted texels, {}² atlas",
        m.name, m.texture_size
    );
    Ok(())
}
pub fn runtime(m: &Model, texture: &Path, out: &Path, static_mesh: bool) -> Result<()> {
    ensure!(
        m.parts.len() <= 32,
        "Runtime palette allows at most 32 parts"
    );
    atlas(m, Some(texture))?;
    let transforms = if static_mesh {
        pose(m, "", 0.)?
    } else {
        vec![Mat4::IDENTITY; m.parts.len()]
    };
    let tris = mesh(m, &transforms);
    let mut vertices = Vec::new();
    for t in &tris {
        let n = (t.p[1] - t.p[0]).cross(t.p[2] - t.p[0]).normalize();
        for j in 0..3 {
            for v in t.p[j].to_array().into_iter().chain(n.to_array()) {
                ensure!(
                    v.is_finite() && v.abs() <= 1.001,
                    "Runtime local geometry must fit [-1,1]"
                );
                vertices.extend(((v.clamp(-1., 1.) * 32767.).round() as i16).to_le_bytes());
            }
            vertices.extend([255, 255, 255, 255]);
            if !static_mesh {
                vertices.extend([t.part as u8, 0, 0, 0, 255, 0, 0, 0]);
            }
            for v in t.uv[j].to_array() {
                vertices.extend(((v * 65535.).round() as u16).to_le_bytes());
            }
        }
    }
    let mut bytes = Vec::new();
    if !static_mesh {
        let mut frames = Vec::<f32>::new();
        let mut clips = serde_json::Map::new();
        let names = if m.animations.is_empty() {
            vec!["idle".to_string()]
        } else {
            m.animations.iter().map(|c| c.name.clone()).collect()
        };
        for name in names {
            let clip = m.animations.iter().find(|c| c.name == name);
            let duration = clip.map_or(1., |c| c.duration);
            let count = (duration * 20.).ceil() as usize + 1;
            let offset = frames.len();
            for frame in 0..count {
                let seconds = frame as f32 / (count - 1) as f32 * duration;
                let sample = if frame + 1 == count {
                    seconds - 0.00001
                } else {
                    seconds
                };
                for p in pose(m, if clip.is_some() { &name } else { "" }, sample)? {
                    frames.extend(p.to_cols_array());
                }
            }
            clips.insert(
                name,
                json!({"duration":duration,"frames":count,"offset":offset}),
            );
        }
        let meta = json!({"version":2,"vertices":tris.len()*3,"stride":28,"bones":m.parts.iter().map(|p|&p.name).collect::<Vec<_>>(),"clips":clips});
        let mut header = serde_json::to_vec(&meta)?;
        while header.len() % 4 != 0 {
            header.push(b' ')
        }
        bytes.extend((header.len() as u32).to_le_bytes());
        bytes.extend(header);
        bytes.extend(vertices);
        for v in frames {
            bytes.extend(v.to_le_bytes());
        }
    } else {
        bytes = vertices;
    }
    fs::write(out, bytes)?;
    Ok(())
}
pub fn maps(source: &Path, out: &Path, palette: Option<&Path>) -> Result<()> {
    fs::create_dir_all(out)?;
    let source = image::open(source)?.into_rgba8();
    ensure!(
        source.width() == source.height(),
        "4x4 square sheet required"
    );
    let mut resized =
        image::imageops::resize(&source, 512, 512, image::imageops::FilterType::Lanczos3);
    // Enforce the extracted concept palette, retaining restrained source luminance.
    // Each biome is centered independently; forest cannot drift back to brown.
    if let Some(path) = palette {
        let palette: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;
        for (tile, name) in [
            (1, "meadow"),
            (2, "forest"),
            (3, "sand"),
            (4, "slate"),
            (5, "snow"),
            (6, "ocean"),
            (12, "sand"),
            (13, "forest"),
        ] {
            let rgb = palette["colors"][name]["rgb"]
                .as_array()
                .context("Missing palette RGB")?;
            ensure!(rgb.len() == 3, "Palette RGB needs three channels");
            let color: Vec<f32> = rgb
                .iter()
                .map(|v| {
                    v.as_u64()
                        .filter(|v| *v <= 255)
                        .map(|v| v as f32)
                        .context("Invalid palette channel")
                })
                .collect::<Result<_>>()?;
            let (ox, oy) = ((tile % 4) * 128, (tile / 4) * 128);
            let luminance =
                |p: &Rgba<u8>| p[0] as f32 * 0.2126 + p[1] as f32 * 0.7152 + p[2] as f32 * 0.0722;
            let mut mean = 0.;
            for y in oy..oy + 128 {
                for x in ox..ox + 128 {
                    mean += luminance(resized.get_pixel(x, y));
                }
            }
            mean /= 16384.;
            for y in oy..oy + 128 {
                for x in ox..ox + 128 {
                    let p = resized.get_pixel_mut(x, y);
                    let detail = (1. + (luminance(p) - mean) / 255. * 2.2).clamp(0.70, 1.30);
                    for c in 0..3 {
                        p[c] = (color[c] * detail).clamp(0., 255.).round() as u8;
                    }
                }
            }
        }
    }
    save_compact(&resized, &out.join("terrain.png"))?;
    let height = image::imageops::crop_imm(&resized, 384, 384, 128, 128).to_image();
    let mut normal = RgbaImage::new(128, 128);
    let mut rough = normal.clone();
    let h = |x: u32, y: u32| {
        let p = height.get_pixel(x % 128, y % 128);
        (p[0] as f32 + p[1] as f32 + p[2] as f32) / 765.
    };
    for y in 0..128 {
        for x in 0..128 {
            let dx = h(x + 1, y) - h(x + 127, y);
            let dy = h(x, y + 1) - h(x, y + 127);
            let n = Vec3::new(-dx * 1.5, -dy * 1.5, 1.).normalize();
            normal.put_pixel(
                x,
                y,
                Rgba([
                    ((n.x * 0.5 + 0.5) * 255.) as u8,
                    ((n.y * 0.5 + 0.5) * 255.) as u8,
                    ((n.z * 0.5 + 0.5) * 255.) as u8,
                    255,
                ]),
            );
            let r = (160. + h(x, y) * 60.) as u8;
            rough.put_pixel(x, y, Rgba([r, r, r, 255]));
        }
    }
    normal.save(out.join("ocean-normal.png"))?;
    save_compact(&rough, &out.join("ocean-roughness.png"))?;
    Ok(())
}
