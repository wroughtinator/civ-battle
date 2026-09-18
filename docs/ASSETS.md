# Asset provenance and replacement coverage

The active game uses the standalone Rust Asset Forge pipeline in `tools/asset-forge`. All 55 model definitions are authored in JSON by `catalog.mjs`; the two saved source sheets in `sources/` were generated with the built-in image generator for this task. No downloaded visual model or texture pack is used by the active renderer. The geometry remains original project visual work; texture provenance is AI generation, not the former third-party CC0 attribution. SVG interface symbols remain original project vector graphics, and fog/territory masks remain gameplay data.

## Complete runtime catalog

- All 14 units: guard, cavalry, archer, tank, artillery, commando (recon), drone, fleet, submarine, carrier, orbital engineer, nuclear launcher, scout and settler. Every unit has idle, walk and attack clips, triggered by the existing movement and attack timing.
- Both strategic missile bodies (ballistic and nuclear), orbiting satellite, and eight additional projectile bodies: arrow, shell, mortar round, bullet, bomb, torpedo, rocket and carrier aircraft. Flight bodies follow trajectories and point along their full 3D tangents; muzzle flashes, wakes and trails remain procedural effects rather than untextured substitute projectile bodies.
- Oak, pine and birch trees, using the new packed geometry and atlases with instanced wind motion.
- Eight civilization capital variants, seven building types, farms, orbital sites, and all ten discovery entries (sharing the unopened treasure-chest model from main).
- A 512px generated terrain atlas supplies ground, forest floor, sand, rock, snow, water and cloud detail. The current version follows the generated mini-Earth reference and measured six-color palette in `tools/asset-forge/sources/terrain-direction.md`. Biome colors are centered on the measured swatches while preserving visible material luminance variation. World-space randomized triplanar sampling uses the shared smooth normals from the final displaced mountain mesh and continuous sampling gradients to avoid repeated grids, UV stretching and mip seams. Ocean normal and roughness maps are derived at 128px from the generated water-height tile.

Each model has a 256 × 256 atlas and at most 32 rigid animated parts. `public/assets/forge/catalog.json` lists the runtime set. `asset-manifest.json` records file sizes and SHA-256 hashes. The new format keeps positions/normals packed as normalized 16-bit data and UVs as unsigned 16-bit values; animation matrices are sampled at 20 Hz. There is no runtime glTF dependency. Opaque color atlases round channels to roughly six bits before PNG compression; the 114-file forge bundle totals 4,135,435 bytes raw (3,016,166 bytes with Brotli).

## Reproducible pipeline

Run `npm run assets`. It authors model JSON, builds the Rust CLI, bakes material textures through eight camera stencils with visibility tests and preservation of previous texels, then exports packed rigs and instanced meshes. Unreachable internal surfaces receive the same generated material as a deterministic completion step. This production batch reuses a shared image-generated material sheet; it does not claim that a separate model-specific image edit was generated for each of the 55 assets. The initial guard/tower/cannon examples demonstrate individual camera-edit prompts.

Material indices, exact image-generation prompts and source hashes are documented in `tools/asset-forge/sources/README.md`. Realistic material detail is deliberately reduced to a low-resolution, grungy style. UV allocation is per face and low-poly joints are rigid, not smoothly skinned organic meshes.

Eight legacy-client compatibility `.mesh` files and the root ocean maps are rebuilt from the same new assets. Obsolete character rigs, unused static unit meshes and the old woodland mesh/texture are removed from the mutable public directory. Archived `releases/` are immutable and retain their original assets and credits for existing rooms. Old conversion scripts are historical and are not used by this pipeline. The old original-model command now forwards to the new build.

## Verification

`npm run build` compiles the engine needed for local previews. `npm run assets:preview` opens a local review on port 8797. The Asset selector covers the whole catalog; Run visual audit renders all 55 assets and both strategic missile flights, checks GL errors, and records unit poses and projectile types. Tests in `tests/graphics.test.mjs` verify catalog coverage, packed data, finite sampled poses, movement/attack clips, ranged model dispatch and ballistic orientation. Unit and texture rendering are reviewed with the actual game renderer. The saved `asset-audit.json` records the final passing 57-case desktop audit: every asset loaded, all 14 units reached idle/walk/attack, all eight ranged projectile types appeared, and no WebGL errors occurred. The focused JavaScript suite passed 30 tests; the Rust tool passed three tests and Clippy with warnings denied. `asset-forge-catalog.png` shows actual renders of all 55 models, in the order listed in its companion JSON. Desktop results do not establish physical mobile GPU performance.

## Audio from the owner's existing 99Sounds library

The audio is **not CC0**. It is incorporated under the [99Sounds license](https://99sounds.org/license/), which permits modification and incorporation into personal and commercial games. Standalone resale or redistribution of the sound library is prohibited. Do not distribute this project's audio as a sound pack or relabel it as CC0.

The source library was found at `C:/Users/camer/OneDrive/Documents/99sounds`. The source-file mapping is `audio-sources.json`; those complete WAV libraries are not shipped. `scripts/build-audio.py` extracts short sections, normalizes their loudness, crossfades ambience boundaries and encodes a combined 32 kHz mono 80 kbps MP3 atlas. The atlas and cue offsets are game runtime assets, without a download/catalog UI. The game loads this audio after user interaction.

Sources include 99 Sound Effects by Tomislav Zlatic (UI, orders and impacts), Water Sounds by Régis Royer (ocean surf), Nature Sounds by Free To Use Sounds (wind/vegetation), and Rain And Thunder (rain). Source attribution is retained here and in the file mapping. See the individual libraries at https://99sounds.org/ for their creators and license context.

Terrain follow-up verification: 23 focused graphics tests pass, including constant tree instance count across the former zoom threshold and shared outward unit normals on displaced triangles. Rust tests and Clippy pass. The mountain preview shows the revised mesh, smooth shading and stronger terrain textures with no WebGL errors.
