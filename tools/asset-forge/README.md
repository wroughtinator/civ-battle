# Asset Forge

A separate Rust asset workshop for Codex: author low-poly geometry and rigid animation in JSON, render camera guides, use the built-in image generator to paint realistic materials, and project those images back into a low-resolution UV atlas. No Blender, GPU, API key, or external web dependencies are needed for the tool. Image generation runs through Codex between CLI steps; the Rust executable does not call the image generator itself.

This is a working tool, not an automatic natural-language-to-mesh model. Tell Codex what to make; Codex writes the JSON and runs the commands. It supports boxes, tapered boxes, faceted cylinders, and tapered cylinders. The examples are authored from these shapes, not imported generated meshes. The production catalog now replaces the active game's models and textures; deployment is a separate operation.

## Production game build

From the repository root, `npm run assets` rebuilds all 55 models and textures from `catalog.mjs`, `models/`, and the two saved generated source sheets. `npm run assets:preview` serves the actual game renderer on port 8797, with every asset selectable and a complete GPU/animation audit. See `docs/ASSETS.md` for coverage and `sources/README.md` for exact prompts.

Additional CLI commands: `bake MODEL MATERIAL_SHEET ATLAS` performs eight camera painting passes; `runtime MODEL ATLAS OUT` exports packed UV rigs (or instanced 20-byte geometry with `--static-mesh`); `legacy-mesh MODEL ATLAS OUT` supplies old-client compatibility; `maps SOURCE OUT_DIR --palette PALETTE.json` derives terrain/water textures using the measured mini-Earth colors; `contact MODEL_DIR TEXTURE_DIR OUT.png` renders a catalog sheet. `material` on each part selects a zero-based tile from the 4×4 material source grid.

## Try the finished examples

From this directory:

```powershell
cargo build --release
./target/release/asset-forge serve examples/showcase/index.html
```

Open http://127.0.0.1:8798. The standalone gallery also opens directly from disk, contains orbit and animation sprite previews rendered from the actual geometry, and offers embedded glTF downloads. This is a local viewer, not a hosted site. `examples/showcase/models.png` is a contact sheet of actual Rust renders.

| Model | Triangles | Atlas | Clips |
| --- | ---: | --- | --- |
| Guard | 108 | 256 × 256 | idle, walk, attack |
| Watchtower | 276 | 256 × 256 | static |
| Cannon | 244 | 256 × 256 | fire |

For continuous camera orbit and live JSON/texture reload:

```powershell
./target/release/asset-forge view examples/guard.json --texture examples/guard.png --port 8799
```

This viewer renders on the CPU and shows named animation clips. Drag to orbit, or use yaw/pitch sliders. Restart/reload the page when changing the list of clips. All server bindings are loopback only. Stop the process with Ctrl+C when started in a terminal.

## Model language

```json
{
  "name": "Small timber prop",
  "texture_size": 256,
  "parts": [
    {"name":"base", "position":[0,0.5,0], "size":[1,1,1], "color":[110,90,60]},
    {"name":"cap", "parent":0, "position":[0,0.75,0], "size":[1.2,0.5,1.2], "taper":0.1, "color":[70,75,65]}
  ],
  "animations": []
}
```

- Right-handed coordinates; Y is up, +Z is the front. Dimensions are in arbitrary consistent units.
- `position` is the joint position in the parent's coordinate system. Parents are optional indices and must appear before children.
- `pivot` is the vector from the primitive's center to its joint, in local coordinates. Geometry is shifted by `-pivot`, allowing limbs to rotate about shoulders or hips.
- Optional `rotation: [x,y,z]` is the rest rotation in degrees, XYZ Euler order.
- `shape` defaults to `box`; `cylinder` uses local Y as its long axis, and optional `segments` (3–16, default 8). `size` is full X/Y/Z extent, so cylinders can be elliptical.
- `taper` scales the top X/Z dimensions (default 1, greater than 0 and at most 4). Use a small positive value for pointed roofs.
- Colors are RGB bytes and also serve as fallback material color for unpainted areas.
- `texture_size` is a power of two from 32–1024. Each primitive face receives a unique atlas tile. The tool rejects atlases too small for the face count. Atlas layouts depend on topology: finish geometry before painting; adding parts invalidates an existing atlas.
- `animations` contain `name`, positive `duration` in seconds, and `tracks`. Each track targets one `part` index and has increasing `keys`, each `{ "time": 0, "rotation": [0,0,0] }`. Rotations are offsets after the rest rotation, interpolated as quaternions. Clips loop; include matching start/end poses for a seamless loop. Translation, scale, skeletal deformation, and arbitrary mesh editing are not implemented.

## Camera painting loop

```powershell
# 1. Capture rest pose and camera metadata.
./target/release/asset-forge render examples/guard.json output/front --yaw 35 --pitch 15

# 2. Codex inspects guide.png and sends it to built-in imagegen.
#    Save the generated square stencil as output/front/generated.png.

# 3. Bake visible surfaces into a 256-square working atlas.
./target/release/asset-forge paint examples/guard.json output/front output/front/generated.png output/atlas-front.png

# 4. Move the camera, keeping prior paint visible as context.
./target/release/asset-forge render examples/guard.json output/rear --texture output/atlas-front.png --yaw=-145 --pitch 15

# 5. Codex sends rear/guide.png and rear/inpaint.png to imagegen,
#    plus the first generated image as a material reference.
#    Save output/rear/generated.png, then preserve old texels while painting:
./target/release/asset-forge paint examples/guard.json output/rear output/rear/generated.png output/atlas-final.png --texture output/atlas-front.png

# 6. Inspect and export (embedded texture and animation data).
./target/release/asset-forge view examples/guard.json --texture output/atlas-final.png
./target/release/asset-forge export examples/guard.json output/atlas-final.png output/guard.gltf
```

`render` writes `guide.png`, `inpaint.png`, `camera.json`, and a suggested `prompt.txt`. The guide supplies geometry; the inpaint reference contains opaque painted fragments and transparent unknown regions. On the first pass the inpaint reference is entirely transparent, so use the guide. Render supports `--clip walk --time 0.25` for painting surfaces exposed by a pose. Paint reloads that exact pose from the camera file and refuses a changed model.

Transparent areas can guide built-in image editing, but the generator does not expose an exact mask contract here. It may move boundaries or repaint existing pixels. The Rust tool enforces preservation in texture space, rejects occluded/back-facing/grazing surfaces, skips transparent source pixels, and uses 16 samples per texel to reduce aliasing. It accepts any square stencil resolution, mapping it to the captured frame. Exact subject alignment still needs visual inspection. `--overwrite` deliberately repaints visible texels; otherwise existing nontransparent texels are unchanged. Use new output names to retain versions.

The working atlas alpha records paint coverage. glTF export fills unknown surfaces with authored colors and dilates gutters, and uses nearest-neighbor filtering. These examples have two opposite camera passes, not complete surface coverage: undersides, narrow recesses, some wheel surfaces and seams need more passes. The per-face atlas is deliberately simple and does not distribute texels by surface area; large roofs have less detail than a production UV layout. Each part is a separate rigid mesh/node, so low triangle counts do not imply a single draw call. Game integration and batching are separate work.

## Rebuild gallery and check

```powershell
./target/release/asset-forge gallery examples examples/showcase
cargo test
cargo clippy -- -D warnings
```

Gallery discovers matching JSON/PNG pairs. Tests cover hierarchy/animation, back-face rejection, inter-part occlusion, and preservation across opposite painting passes. All three exported examples were checked with Khronos `gltf-validator`. See `examples/PROVENANCE.md` for image generation prompts and references.
