use anyhow::{bail, ensure, Context, Result};
use base64::Engine;
use clap::{Parser, Subcommand};
use glam::{Mat4, Quat, Vec2, Vec3};
use image::{Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};
mod gallery;
mod production;

#[derive(Parser)]
#[command(about = "Text-authored low-poly models and camera stencil painting")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    LegacyMesh {
        model: PathBuf,
        texture: PathBuf,
        out: PathBuf,
    },
    Contact {
        directory: PathBuf,
        textures: PathBuf,
        out: PathBuf,
    },
    Bake {
        model: PathBuf,
        materials: PathBuf,
        out: PathBuf,
    },
    Runtime {
        model: PathBuf,
        texture: PathBuf,
        out: PathBuf,
        #[arg(long)]
        static_mesh: bool,
    },
    Maps {
        source: PathBuf,
        out: PathBuf,
        #[arg(long)]
        palette: Option<PathBuf>,
    },
    Gallery {
        directory: PathBuf,
        out: PathBuf,
    },
    Serve {
        html: PathBuf,
        #[arg(long, default_value_t = 8798)]
        port: u16,
    },
    Render {
        model: PathBuf,
        out: PathBuf,
        #[arg(long)]
        texture: Option<PathBuf>,
        #[arg(long, default_value_t = 35.)]
        yaw: f32,
        #[arg(long, default_value_t = 15.)]
        pitch: f32,
        #[arg(long, default_value = "")]
        clip: String,
        #[arg(long, default_value_t = 0.)]
        time: f32,
    },
    Paint {
        model: PathBuf,
        pass: PathBuf,
        image: PathBuf,
        out: PathBuf,
        #[arg(long)]
        texture: Option<PathBuf>,
        #[arg(long)]
        overwrite: bool,
    },
    Export {
        model: PathBuf,
        texture: PathBuf,
        out: PathBuf,
    },
    View {
        model: PathBuf,
        #[arg(long)]
        texture: Option<PathBuf>,
        #[arg(long, default_value_t = 8798)]
        port: u16,
    },
}
#[derive(Serialize, Deserialize, Clone)]
struct Model {
    name: String,
    #[serde(default = "atlas_size")]
    texture_size: u32,
    parts: Vec<Part>,
    #[serde(default)]
    animations: Vec<Clip>,
}
fn atlas_size() -> u32 {
    256
}
#[derive(Serialize, Deserialize, Clone)]
struct Part {
    #[serde(default)]
    material: usize,
    name: String,
    parent: Option<usize>,
    position: [f32; 3],
    size: [f32; 3],
    #[serde(default)]
    pivot: [f32; 3],
    #[serde(default)]
    rotation: [f32; 3],
    #[serde(default = "box_shape")]
    shape: String,
    #[serde(default = "segments")]
    segments: usize,
    #[serde(default = "one")]
    taper: f32,
    color: [u8; 3],
}
fn box_shape() -> String {
    "box".into()
}
fn segments() -> usize {
    8
}
fn one() -> f32 {
    1.
}
fn face_count(p: &Part) -> usize {
    if p.shape == "cylinder" {
        p.segments * 3
    } else {
        6
    }
}
#[derive(Serialize, Deserialize, Clone)]
struct Clip {
    name: String,
    duration: f32,
    tracks: Vec<Track>,
}
#[derive(Serialize, Deserialize, Clone)]
struct Track {
    part: usize,
    keys: Vec<Key>,
}
#[derive(Serialize, Deserialize, Clone)]
struct Key {
    time: f32,
    rotation: [f32; 3],
}
#[derive(Serialize, Deserialize, Clone)]
struct Camera {
    yaw: f32,
    pitch: f32,
    clip: String,
    time: f32,
    size: u32,
    model: String,
}
struct Triangle {
    p: [Vec3; 3],
    uv: [Vec2; 3],
    color: [u8; 3],
    part: usize,
}
fn rotation(v: [f32; 3]) -> Quat {
    Quat::from_euler(
        glam::EulerRot::XYZ,
        v[0].to_radians(),
        v[1].to_radians(),
        v[2].to_radians(),
    )
}
fn load(path: &Path) -> Result<Model> {
    let m: Model = serde_json::from_slice(&fs::read(path)?)?;
    ensure!(
        !m.parts.is_empty() && m.parts.len() <= 128,
        "Use 1–128 parts"
    );
    ensure!(
        m.texture_size.is_power_of_two() && (32..=1024).contains(&m.texture_size),
        "texture_size must be a power of two from 32–1024"
    );
    let mut names = HashSet::new();
    for (i, p) in m.parts.iter().enumerate() {
        ensure!(names.insert(&p.name), "Duplicate part name");
        ensure!(
            p.parent.is_none_or(|n| n < i),
            "Parents must precede children"
        );
        ensure!(
            p.size.iter().all(|n| n.is_finite() && *n > 0.)
                && p.position
                    .iter()
                    .chain(&p.pivot)
                    .chain(&p.rotation)
                    .all(|n| n.is_finite()),
            "Invalid part transform"
        );
        ensure!(
            ["box", "cylinder"].contains(&p.shape.as_str())
                && (3..=16).contains(&p.segments)
                && p.taper.is_finite()
                && p.taper > 0.
                && p.taper <= 4.,
            "Invalid primitive: box/cylinder, 3–16 segments, taper > 0 and <= 4"
        );
    }
    let grid = (m.parts.iter().map(face_count).sum::<usize>() as f32)
        .sqrt()
        .ceil() as u32;
    ensure!(
        m.texture_size / grid >= 4,
        "Too many faces for texture size; increase texture_size"
    );
    names.clear();
    for c in &m.animations {
        ensure!(
            names.insert(&c.name) && c.duration.is_finite() && c.duration > 0.,
            "Invalid or duplicate animation"
        );
        let mut parts = HashSet::new();
        for t in &c.tracks {
            ensure!(
                parts.insert(t.part) && t.part < m.parts.len() && !t.keys.is_empty(),
                "Invalid animation track"
            );
            let mut last = -1.;
            for k in &t.keys {
                ensure!(
                    k.time.is_finite()
                        && k.time >= 0.
                        && k.time > last
                        && k.time <= c.duration
                        && k.rotation.iter().all(|v| v.is_finite()),
                    "Invalid keyframes"
                );
                last = k.time;
            }
        }
    }
    Ok(m)
}
fn pose(m: &Model, clip: &str, time: f32) -> Result<Vec<Mat4>> {
    let mut r = vec![Quat::IDENTITY; m.parts.len()];
    if !clip.is_empty() {
        let c = m
            .animations
            .iter()
            .find(|c| c.name == clip)
            .context("Unknown clip")?;
        let t = time.rem_euclid(c.duration);
        for track in &c.tracks {
            let keys = &track.keys;
            r[track.part] = if t <= keys[0].time {
                rotation(keys[0].rotation)
            } else if t >= keys.last().unwrap().time {
                rotation(keys.last().unwrap().rotation)
            } else {
                let pair = keys
                    .windows(2)
                    .find(|k| t >= k[0].time && t < k[1].time)
                    .unwrap();
                rotation(pair[0].rotation).slerp(
                    rotation(pair[1].rotation),
                    (t - pair[0].time) / (pair[1].time - pair[0].time),
                )
            };
        }
    }
    let mut out = Vec::new();
    for (i, p) in m.parts.iter().enumerate() {
        let local =
            Mat4::from_rotation_translation(rotation(p.rotation) * r[i], Vec3::from(p.position));
        out.push(p.parent.map_or(local, |j| out[j] * local));
    }
    Ok(out)
}
fn mesh(m: &Model, transforms: &[Mat4]) -> Vec<Triangle> {
    let faces = [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 4, 7, 3],
        [1, 2, 6, 5],
        [3, 7, 6, 2],
        [0, 1, 5, 4],
    ];
    let grid = (m.parts.iter().map(face_count).sum::<usize>() as f32)
        .sqrt()
        .ceil() as u32;
    let cell = m.texture_size / grid;
    let mut out = Vec::new();
    let mut offset = 0;
    for (i, p) in m.parts.iter().enumerate() {
        let corners = [
            [-1., -1., -1.],
            [1., -1., -1.],
            [1., 1., -1.],
            [-1., 1., -1.],
            [-1., -1., 1.],
            [1., -1., 1.],
            [1., 1., 1.],
            [-1., 1., 1.],
        ];
        let polygons: Vec<Vec<Vec3>> = if p.shape == "cylinder" {
            let mut polys = Vec::new();
            for j in 0..p.segments {
                let ring = |k: usize, y: f32| {
                    let angle = k as f32 / p.segments as f32 * std::f32::consts::TAU;
                    Vec3::new(angle.cos(), y, angle.sin())
                };
                let a = ring(j, -1.);
                let b = ring(j + 1, -1.);
                let c = ring(j + 1, 1.);
                let d = ring(j, 1.);
                polys.push(vec![a, d, c, b]);
                polys.push(vec![Vec3::Y, c, d]);
                polys.push(vec![-Vec3::Y, a, b]);
            }
            polys
        } else {
            faces
                .iter()
                .map(|ids| ids.iter().map(|j| Vec3::from(corners[*j])).collect())
                .collect()
        };
        for (f, polygon) in polygons.iter().enumerate() {
            let v: Vec<_> = polygon
                .iter()
                .map(|c| {
                    let mut c = *c;
                    if c.y > 0. {
                        c.x *= p.taper;
                        c.z *= p.taper;
                    }
                    transforms[i]
                        .transform_point3(c * Vec3::from(p.size) * 0.5 - Vec3::from(p.pivot))
                })
                .collect();
            let n = (offset + f) as u32;
            let x = (n % grid * cell) as f32 + 1.;
            let y = (n / grid * cell) as f32 + 1.;
            let s = cell as f32 - 2.;
            let uv = [
                Vec2::new(x, y + s),
                Vec2::new(x + s, y + s),
                Vec2::new(x + s, y),
                Vec2::new(x, y),
            ];
            let indices = if polygon.len() == 3 {
                vec![[0, 1, 2]]
            } else {
                vec![[0, 1, 2], [0, 2, 3]]
            };
            for idx in indices {
                out.push(Triangle {
                    p: idx.map(|j| v[j]),
                    uv: idx.map(|j| uv[j] / m.texture_size as f32),
                    color: p.color,
                    part: i,
                });
            }
        }
        offset += face_count(p);
    }
    out
}
fn camera(m: &Model, c: &Camera) -> Result<Mat4> {
    ensure!(
        (32..=2048).contains(&c.size) && [c.yaw, c.pitch, c.time].iter().all(|v| v.is_finite()),
        "Invalid camera"
    );
    let tris = mesh(m, &pose(m, "", 0.)?);
    let mut lo = Vec3::splat(f32::INFINITY);
    let mut hi = Vec3::splat(f32::NEG_INFINITY);
    for t in tris {
        for p in t.p {
            lo = lo.min(p);
            hi = hi.max(p);
        }
    }
    let center = (lo + hi) * 0.5;
    let radius = (hi - lo).length() * 0.65;
    let y = c.yaw.to_radians();
    let p = c.pitch.clamp(-89., 89.).to_radians();
    let dir = Vec3::new(y.sin() * p.cos(), p.sin(), y.cos() * p.cos());
    Ok(
        Mat4::orthographic_rh(-radius, radius, -radius, radius, 0.01, radius * 8.)
            * Mat4::look_at_rh(center + dir * radius * 4., center, Vec3::Y),
    )
}
fn project(v: Vec3, vp: Mat4, size: u32) -> Vec3 {
    let q = vp.project_point3(v);
    Vec3::new(
        (q.x + 1.) * 0.5 * size as f32,
        (1. - q.y) * 0.5 * size as f32,
        q.z,
    )
}
fn bary(p: Vec2, v: [Vec2; 3]) -> Option<[f32; 3]> {
    let d = (v[1] - v[0]).perp_dot(v[2] - v[0]);
    if d.abs() < 1e-8 {
        return None;
    }
    let b = (p - v[0]).perp_dot(v[2] - v[0]) / d;
    let c = (v[1] - v[0]).perp_dot(p - v[0]) / d;
    let a = 1. - b - c;
    (a >= -0.00001 && b >= -0.00001 && c >= -0.00001).then_some([a, b, c])
}
fn raster(v: [Vec2; 3], size: u32, mut f: impl FnMut(u32, u32, [f32; 3])) {
    let lo = v[0].min(v[1]).min(v[2]).floor().max(Vec2::ZERO);
    let hi = v[0]
        .max(v[1])
        .max(v[2])
        .ceil()
        .min(Vec2::splat(size as f32 - 1.));
    for y in lo.y as u32..=hi.y.max(0.) as u32 {
        for x in lo.x as u32..=hi.x.max(0.) as u32 {
            if let Some(b) = bary(Vec2::new(x as f32 + 0.5, y as f32 + 0.5), v) {
                f(x, y, b)
            }
        }
    }
}
fn atlas(m: &Model, path: Option<&Path>) -> Result<RgbaImage> {
    match path {
        Some(p) => {
            let a = image::open(p)?.into_rgba8();
            ensure!(
                a.dimensions() == (m.texture_size, m.texture_size),
                "Texture dimensions do not match model"
            );
            Ok(a)
        }
        None => Ok(RgbaImage::new(m.texture_size, m.texture_size)),
    }
}
fn render(m: &Model, c: &Camera, a: &RgbaImage) -> Result<(RgbaImage, RgbaImage, Vec<f32>)> {
    let vp = camera(m, c)?;
    let tris = mesh(m, &pose(m, &c.clip, c.time)?);
    let mut guide = RgbaImage::new(c.size, c.size);
    let mut holes = guide.clone();
    let mut depth = vec![f32::INFINITY; (c.size * c.size) as usize];
    for t in tris {
        let v = t.p.map(|p| project(p, vp, c.size));
        raster(v.map(|p| p.truncate()), c.size, |x, y, b| {
            let z = (0..3).map(|i| v[i].z * b[i]).sum::<f32>();
            let n = (y * c.size + x) as usize;
            if !(0. ..=1.).contains(&z) || z >= depth[n] {
                return;
            }
            depth[n] = z;
            let uv = t.uv[0] * b[0] + t.uv[1] * b[1] + t.uv[2] * b[2];
            let px = a.get_pixel(
                (uv.x * m.texture_size as f32).clamp(0., m.texture_size as f32 - 1.) as u32,
                (uv.y * m.texture_size as f32).clamp(0., m.texture_size as f32 - 1.) as u32,
            );
            let color = if px[3] > 0 {
                *px
            } else {
                Rgba([t.color[0], t.color[1], t.color[2], 255])
            };
            guide.put_pixel(x, y, color);
            holes.put_pixel(x, y, *px);
        });
    }
    Ok((guide, holes, depth))
}
fn paint(
    m: &Model,
    c: &Camera,
    source: &RgbaImage,
    a: &mut RgbaImage,
    overwrite: bool,
) -> Result<usize> {
    let (_, _, depth) = render(m, c, a)?;
    let vp = camera(m, c)?;
    let transforms = pose(m, &c.clip, c.time)?;
    let inv = camera(m, c)?.inverse();
    let toward = (inv.transform_point3(Vec3::new(0., 0., 0.))
        - inv.transform_point3(Vec3::new(0., 0., 1.)))
    .normalize();
    let mut count = 0;
    for t in mesh(m, &transforms) {
        let normal = (t.p[1] - t.p[0]).cross(t.p[2] - t.p[0]).normalize();
        if normal.dot(toward) < 0.15 {
            continue;
        }
        raster(
            t.uv.map(|u| u * m.texture_size as f32),
            m.texture_size,
            |x, y, _| {
                if !overwrite && a.get_pixel(x, y)[3] > 0 {
                    return;
                }
                // Integrate a small footprint instead of point sampling high-frequency grain.
                let mut sum = [0u32; 3];
                let mut weight = 0u32;
                for oy in 0..4 {
                    for ox in 0..4 {
                        let sample = Vec2::new(
                            x as f32 + (ox as f32 + 0.5) / 4.,
                            y as f32 + (oy as f32 + 0.5) / 4.,
                        );
                        let Some(b) = bary(sample, t.uv.map(|u| u * m.texture_size as f32)) else {
                            continue;
                        };
                        let world = t.p[0] * b[0] + t.p[1] * b[1] + t.p[2] * b[2];
                        let q = project(world, vp, c.size);
                        if q.x < 0. || q.y < 0. || q.x >= c.size as f32 || q.y >= c.size as f32 {
                            continue;
                        }
                        if (depth[(q.y as u32 * c.size + q.x as u32) as usize] - q.z).abs() > 0.002
                        {
                            continue;
                        }
                        let px = source.get_pixel(
                            (q.x / c.size as f32 * source.width() as f32) as u32,
                            (q.y / c.size as f32 * source.height() as f32) as u32,
                        );
                        let alpha = px[3] as u32;
                        for channel in 0..3 {
                            sum[channel] += px[channel] as u32 * alpha;
                        }
                        weight += alpha;
                    }
                }
                if weight == 0 {
                    return;
                }
                a.put_pixel(
                    x,
                    y,
                    Rgba([
                        (sum[0] / weight) as u8,
                        (sum[1] / weight) as u8,
                        (sum[2] / weight) as u8,
                        255,
                    ]),
                );
                count += 1;
            },
        );
    }
    Ok(count)
}
fn save_render(m: &Model, c: &Camera, a: &RgbaImage, out: &Path) -> Result<()> {
    fs::create_dir_all(out)?;
    let (g, h, _) = render(m, c, a)?;
    g.save(out.join("guide.png"))?;
    h.save(out.join("inpaint.png"))?;
    fs::write(out.join("camera.json"), serde_json::to_vec_pretty(c)?)?;
    fs::write(out.join("prompt.txt"),format!("Edit guide.png as a camera-aligned texture stencil for {}. Keep the exact silhouette, part boundaries, camera, and framing. Paint worn, grungy low-resolution game materials with flat unlit color, no cast shadows, no new geometry. inpaint.png is the supporting preservation reference: retain its opaque painted areas and complete missing surfaces. Keep outside the silhouette transparent. Return the same square composition.\n",m.name))?;
    Ok(())
}
fn export(m: &Model, texture: &Path, out: &Path) -> Result<()> {
    use serde_json::json;
    let mut a = atlas(m, Some(texture))?;
    // Complete unseen texels with authored base colors. Preserve coverage in the working atlas.
    for t in mesh(m, &vec![Mat4::IDENTITY; m.parts.len()]) {
        raster(
            t.uv.map(|u| u * m.texture_size as f32),
            m.texture_size,
            |x, y, _| {
                if a.get_pixel(x, y)[3] == 0 {
                    a.put_pixel(x, y, Rgba([t.color[0], t.color[1], t.color[2], 255]));
                }
            },
        );
    }
    // Two texels of dilation protect face borders in external renderers.
    for _ in 0..2 {
        let previous = a.clone();
        for y in 0..m.texture_size {
            for x in 0..m.texture_size {
                if previous.get_pixel(x, y)[3] > 0 {
                    continue;
                }
                for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx >= 0
                        && ny >= 0
                        && nx < m.texture_size as i32
                        && ny < m.texture_size as i32
                    {
                        let px = previous.get_pixel(nx as u32, ny as u32);
                        if px[3] > 0 {
                            a.put_pixel(x, y, *px);
                            break;
                        }
                    }
                }
            }
        }
    }
    let mut png = Cursor::new(Vec::new());
    a.write_to(&mut png, image::ImageFormat::Png)?;
    let mut bytes = Vec::<u8>::new();
    let mut views = Vec::new();
    let mut accessors = Vec::new();
    fn add(
        data: &[f32],
        width: usize,
        bytes: &mut Vec<u8>,
        views: &mut Vec<serde_json::Value>,
        acc: &mut Vec<serde_json::Value>,
    ) -> usize {
        let start = bytes.len();
        for v in data {
            bytes.extend(v.to_le_bytes())
        }
        let view = views.len();
        views.push(json!({"buffer":0,"byteOffset":start,"byteLength":bytes.len()-start}));
        if width == 2 || width == 3 {
            views[view]["target"] = json!(34962);
        }
        let n = acc.len();
        let mut value = json!({"bufferView":view,"componentType":5126,"count":data.len()/width,"type":match width {1=>"SCALAR",2=>"VEC2",3=>"VEC3",_=>"VEC4"}});
        if width == 3 || width == 1 {
            value["min"] = json!((0..width)
                .map(|i| data
                    .iter()
                    .skip(i)
                    .step_by(width)
                    .copied()
                    .fold(f32::INFINITY, f32::min))
                .collect::<Vec<_>>());
            value["max"] = json!((0..width)
                .map(|i| data
                    .iter()
                    .skip(i)
                    .step_by(width)
                    .copied()
                    .fold(f32::NEG_INFINITY, f32::max))
                .collect::<Vec<_>>());
        }
        acc.push(value);
        n
    }
    let tris = mesh(m, &vec![Mat4::IDENTITY; m.parts.len()]);
    let mut meshes = Vec::new();
    let mut nodes = Vec::new();
    for (i, p) in m.parts.iter().enumerate() {
        let mut pos = Vec::new();
        let mut uv = Vec::new();
        let mut normals = Vec::new();
        for t in tris.iter().filter(|t| t.part == i) {
            let normal = (t.p[1] - t.p[0]).cross(t.p[2] - t.p[0]).normalize();
            for j in 0..3 {
                pos.extend(t.p[j].to_array());
                uv.extend(t.uv[j].to_array());
                normals.extend(normal.to_array());
            }
        }
        let position = add(&pos, 3, &mut bytes, &mut views, &mut accessors);
        let tex = add(&uv, 2, &mut bytes, &mut views, &mut accessors);
        let normal = add(&normals, 3, &mut bytes, &mut views, &mut accessors);
        meshes.push(json!({"name":p.name,"primitives":[{"attributes":{"POSITION":position,"TEXCOORD_0":tex,"NORMAL":normal},"material":0}]}));
        let children: Vec<_> = m
            .parts
            .iter()
            .enumerate()
            .filter(|(_, p)| p.parent == Some(i))
            .map(|(j, _)| j)
            .collect();
        let mut node = json!({"name":p.name,"mesh":i,"translation":p.position,"rotation":rotation(p.rotation).to_array()});
        if !children.is_empty() {
            node["children"] = json!(children)
        }
        nodes.push(node);
    }
    let mut animations = Vec::new();
    for c in &m.animations {
        let mut samplers = Vec::new();
        let mut channels = Vec::new();
        for t in &c.tracks {
            let mut keys = t.keys.clone();
            if keys[0].time > 0. {
                let mut first = keys[0].clone();
                first.time = 0.;
                keys.insert(0, first);
            }
            if keys.last().unwrap().time < c.duration {
                let mut last = keys.last().unwrap().clone();
                last.time = c.duration;
                keys.push(last);
            }
            let times: Vec<_> = keys.iter().map(|k| k.time).collect();
            let mut rotations = Vec::new();
            let mut previous = Quat::IDENTITY;
            for k in &keys {
                let mut q = rotation(m.parts[t.part].rotation) * rotation(k.rotation);
                if q.dot(previous) < 0. {
                    q = -q
                }
                rotations.extend(q.to_array());
                previous = q;
            }
            let input = add(&times, 1, &mut bytes, &mut views, &mut accessors);
            let output = add(&rotations, 4, &mut bytes, &mut views, &mut accessors);
            channels
                .push(json!({"sampler":samplers.len(),"target":{"node":t.part,"path":"rotation"}}));
            samplers.push(json!({"input":input,"output":output,"interpolation":"LINEAR"}));
        }
        if !channels.is_empty() {
            animations.push(json!({"name":c.name,"samplers":samplers,"channels":channels}));
        }
    }
    let enc = base64::engine::general_purpose::STANDARD;
    let mut doc = json!({"asset":{"version":"2.0","generator":"asset-forge"},"scene":0,"scenes":[{"nodes":m.parts.iter().enumerate().filter(|(_,p)|p.parent.is_none()).map(|(i,_)|i).collect::<Vec<_>>()}],"nodes":nodes,"meshes":meshes,"buffers":[{"byteLength":bytes.len(),"uri":format!("data:application/octet-stream;base64,{}",enc.encode(&bytes))}],"bufferViews":views,"accessors":accessors,"images":[{"uri":format!("data:image/png;base64,{}",enc.encode(png.into_inner()))}],"samplers":[{"magFilter":9728,"minFilter":9728,"wrapS":33071,"wrapT":33071}],"textures":[{"source":0,"sampler":0}],"materials":[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0},"metallicFactor":0,"roughnessFactor":1},"doubleSided":false}]});
    if !animations.is_empty() {
        doc["animations"] = json!(animations)
    }
    fs::write(out, serde_json::to_vec(&doc)?)?;
    Ok(())
}
fn main() -> Result<()> {
    match Cli::parse().command {
        Command::LegacyMesh {
            model,
            texture,
            out,
        } => production::legacy(&load(&model)?, &texture, &out)?,
        Command::Contact {
            directory,
            textures,
            out,
        } => production::contact(&directory, &textures, &out)?,
        Command::Bake {
            model,
            materials,
            out,
        } => production::bake(&load(&model)?, &materials, &out)?,
        Command::Runtime {
            model,
            texture,
            out,
            static_mesh,
        } => production::runtime(&load(&model)?, &texture, &out, static_mesh)?,
        Command::Maps {
            source,
            out,
            palette,
        } => production::maps(&source, &out, palette.as_deref())?,
        Command::Gallery { directory, out } => gallery::build(&directory, &out)?,
        Command::Serve { html, port } => {
            ensure!(html.is_file(), "Gallery HTML does not exist");
            let server =
                tiny_http::Server::http(("127.0.0.1", port)).map_err(|e| anyhow::anyhow!("{e}"))?;
            println!("Gallery: http://127.0.0.1:{port}");
            for req in server.incoming_requests() {
                let result = if req.url() == "/" {
                    fs::read(&html)
                } else {
                    Ok(Vec::new())
                };
                let response = match result {
                    Ok(body) => tiny_http::Response::from_data(body).with_header(
                        tiny_http::Header::from_bytes("Content-Type", "text/html").unwrap(),
                    ),
                    Err(e) => tiny_http::Response::from_data(e.to_string()).with_status_code(500),
                };
                let _ = req.respond(response);
            }
        }
        Command::Render {
            model,
            out,
            texture,
            yaw,
            pitch,
            clip,
            time,
        } => {
            let m = load(&model)?;
            let a = atlas(&m, texture.as_deref())?;
            let c = Camera {
                yaw,
                pitch,
                clip,
                time,
                size: 512,
                model: serde_json::to_string(&m)?,
            };
            save_render(&m, &c, &a, &out)?;
            println!(
                "Saved camera, guide, inpaint reference and prompt to {}",
                out.display()
            );
        }
        Command::Paint {
            model,
            pass,
            image,
            out,
            texture,
            overwrite,
        } => {
            let m = load(&model)?;
            let c: Camera = serde_json::from_slice(&fs::read(pass.join("camera.json"))?)?;
            ensure!(
                c.model == serde_json::to_string(&m)?,
                "Model changed since capture; recapture before painting"
            );
            let mut a = atlas(&m, texture.as_deref())?;
            let src = image::open(image)?.into_rgba8();
            ensure!(
                src.width() == src.height(),
                "Stencil must be square; preserve capture framing"
            );
            let n = paint(&m, &c, &src, &mut a, overwrite)?;
            ensure!(
                n > 0,
                "No texels painted; try another camera or --overwrite"
            );
            a.save(out)?;
            println!("Painted {n} texels");
        }
        Command::Export {
            model,
            texture,
            out,
        } => export(&load(&model)?, &texture, &out)?,
        Command::View {
            model,
            texture,
            port,
        } => {
            let m = load(&model)?;
            atlas(&m, texture.as_deref())?;
            let server =
                tiny_http::Server::http(("127.0.0.1", port)).map_err(|e| anyhow::anyhow!("{e}"))?;
            println!("Viewer: http://127.0.0.1:{port} (reloads model and texture on each frame)");
            for req in server.incoming_requests() {
                let result = (|| -> Result<(Vec<u8>, &str)> {
                    if req.url() == "/" {
                        return Ok((include_bytes!("viewer.html").to_vec(), "text/html"));
                    }
                    let m = load(&model)?;
                    if req.url() == "/model" {
                        return Ok((serde_json::to_vec(&m)?, "application/json"));
                    }
                    if !req.url().starts_with("/frame?") {
                        bail!("Unknown route")
                    }
                    let args: Vec<_> = req
                        .url()
                        .split('?')
                        .nth(1)
                        .unwrap_or("")
                        .split('&')
                        .filter_map(|v| v.split_once('='))
                        .collect();
                    let get =
                        |key: &str| args.iter().find(|a| a.0 == key).map(|a| a.1).unwrap_or("0");
                    let idx = get("clip").parse::<usize>().unwrap_or(0);
                    let c = Camera {
                        yaw: get("yaw").parse()?,
                        pitch: get("pitch").parse()?,
                        time: get("time").parse()?,
                        clip: if idx == 0 {
                            String::new()
                        } else {
                            m.animations
                                .get(idx - 1)
                                .context("Invalid clip")?
                                .name
                                .clone()
                        },
                        size: 512,
                        model: String::new(),
                    };
                    let a = atlas(&m, texture.as_deref())?;
                    let (g, _, _) = render(&m, &c, &a)?;
                    let mut out = Cursor::new(Vec::new());
                    g.write_to(&mut out, image::ImageFormat::Png)?;
                    Ok((out.into_inner(), "image/png"))
                })();
                let response = match result {
                    Ok((data, mime)) => tiny_http::Response::from_data(data)
                        .with_header(tiny_http::Header::from_bytes("Content-Type", mime).unwrap())
                        .with_header(
                            tiny_http::Header::from_bytes("Cache-Control", "no-store").unwrap(),
                        ),
                    Err(e) => tiny_http::Response::from_data(e.to_string()).with_status_code(400),
                };
                let _ = req.respond(response);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn model() -> Model {
        serde_json::from_str(r#"{"name":"box","texture_size":64,"parts":[{"name":"body","position":[0,0,0],"size":[1,1,1],"color":[100,90,80]}]}"#).unwrap()
    }
    #[test]
    fn occluded_parts_receive_no_paint() {
        let mut m = model();
        let mut front = m.parts[0].clone();
        front.name = "occluder".into();
        front.position = [0., 0., 1.];
        front.size = [2., 2., 1.];
        m.parts.push(front);
        let c = Camera {
            yaw: 0.,
            pitch: 0.,
            time: 0.,
            clip: String::new(),
            size: 128,
            model: String::new(),
        };
        let mut a = atlas(&m, None).unwrap();
        let src = RgbaImage::from_pixel(128, 128, Rgba([255, 0, 0, 255]));
        assert!(paint(&m, &c, &src, &mut a, false).unwrap() > 0);
        for t in mesh(&m, &pose(&m, "", 0.).unwrap())
            .iter()
            .filter(|t| t.part == 0)
        {
            raster(
                t.uv.map(|u| u * m.texture_size as f32),
                m.texture_size,
                |x, y, _| assert_eq!(a.get_pixel(x, y)[3], 0),
            );
        }
    }
    #[test]
    fn stencil_preserves_prior_texels_and_hides_backfaces() {
        let m = model();
        let c = Camera {
            yaw: 0.,
            pitch: 0.,
            time: 0.,
            clip: String::new(),
            size: 128,
            model: String::new(),
        };
        let mut a = atlas(&m, None).unwrap();
        let src = RgbaImage::from_pixel(128, 128, Rgba([255, 0, 0, 255]));
        let n = paint(&m, &c, &src, &mut a, false).unwrap();
        assert!(n > 100 && n < 64 * 64 / 3);
        let prior = a.clone();
        let blue = RgbaImage::from_pixel(128, 128, Rgba([0, 0, 255, 255]));
        assert_eq!(paint(&m, &c, &blue, &mut a, false).unwrap(), 0);
        assert_eq!(a, prior);
        let rear = Camera { yaw: 180., ..c };
        assert!(paint(&m, &rear, &blue, &mut a, false).unwrap() > 100);
        for (old, new) in prior.pixels().zip(a.pixels()) {
            if old[3] > 0 {
                assert_eq!(old, new)
            }
        }
    }
    #[test]
    fn hierarchy_and_animation() {
        let mut m = model();
        let mut child = m.parts[0].clone();
        child.name = "child".into();
        child.parent = Some(0);
        child.position = [1., 0., 0.];
        m.parts.push(child);
        m.animations.push(Clip {
            name: "turn".into(),
            duration: 2.,
            tracks: vec![Track {
                part: 0,
                keys: vec![
                    Key {
                        time: 0.,
                        rotation: [0.; 3],
                    },
                    Key {
                        time: 1.,
                        rotation: [0., 0., 90.],
                    },
                ],
            }],
        });
        let p = pose(&m, "turn", 1.).unwrap();
        assert!((p[1].transform_point3(Vec3::ZERO) - Vec3::Y).length() < 0.0001);
    }
}
