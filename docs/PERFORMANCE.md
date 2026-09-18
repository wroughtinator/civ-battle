# Renderer performance

The September 2026 optimization removes per-frame CPU construction of unit rings, redundant scenery rebuilding, repeated animation sampling, repeated instance-buffer allocation, and layout reads between marker writes. It preserves terrain subdivision, model geometry, render resolution, clouds, and the outline passes.

## Measured comparison

Local Chromium, 393 × 852 CSS viewport, device scale factor 3 (the renderer caps this at 1.4, producing a 550 × 1192 framebuffer), and **4× CPU throttling**. Both versions use the same seed, six-player world, 100 units, all-visible initial terrain, 20 units moving on one-second updates, and changing visibility. The fixture includes city territory metadata. Each fresh page warms up for three seconds, then records twelve seconds.

| Measurement | Before | After |
| --- | ---: | ---: |
| Average frame interval | 52.17 ms (~19 FPS) | 16.67 ms (~60 FPS) |
| 95th-percentile frame interval | 183.3 ms | 18.5 ms |
| Mean rendering CPU time | 42.68 ms | 2.02 ms |
| Mean unit-ring update | 38.85 ms | 0.32 ms |
| Mean state update, including fog/scenery | 165.77 ms | 10.84 ms |
| GPU buffer allocations per frame | 22.26 | 0 |
| Terrain triangles | 289,232 | 289,232 |

These are local comparative measurements, **not iPhone/Safari results**. CPU throttling does not emulate an iPhone GPU or Safari. The harness measures renderer CPU submission and animation-frame intervals; it does not measure GPU time separately, networking, or the full game's DOM/audio cost. Normal gameplay additionally benefits from batched canvas-size reads, transform-based marker movement, and avoiding duplicate panel/clock rendering.

## Reproduce

1. Run `node scripts/build.mjs` to generate the current WASM.
2. **Before changing renderer code**, run `node scripts/profile-renderer.mjs --snapshot`. This saves the baseline JS under ignored `artifacts/renderer-baseline/` and starts a loopback-only server on port 8794. Subsequent runs should omit `--snapshot` to preserve that baseline.
3. Open `http://127.0.0.1:8794/benchmark?baseline=1&moving=1` for the baseline and `http://127.0.0.1:8794/benchmark?moving=1` for current code. Use a fresh navigation for each run so movement starts from the same fixture. Keep viewport, device scale, CPU throttling, and foreground-tab conditions identical.
4. Compare the JSON displayed by the page. Omit `moving=1` to isolate repeated unchanged state updates. Source snapshots and results are local development artifacts; no diagnostics are sent to a service or included in production.

## Correctness constraints

- Unit rings share one immutable annulus and upload only instance transforms/colors. A conservative horizon margin keeps elevated and expanding effects visible.
- Scenery invalidation uses value snapshots, including fog, ownership, buildings, cities, civilization models, and discoveries. Unit motion, damage, and economy updates still run without rebuilding unchanged scenery.
- Territory chunks invalidate on local visibility, city ownership, selection, expansion, and neighboring borders. Selection updates do not require a new server snapshot.
- The color and outline passes reuse the same instance data and sampled animation pose, including crossfades.
- Dynamic buffers retain reusable capacity; large immutable terrain meshes release their CPU staging copies.

Focused regression checks: `node --test tests/render-performance.test.mjs tests/graphics.test.mjs tests/globe-controls.test.mjs tests/movement.test.mjs tests/showcase.test.mjs`.

Validation completed: all 81 JavaScript tests passed, including WASM, network, archive integrity, and eight renderer regressions. A local six-player match at 393 × 852 passed selection, movement, fog/territory rendering, and control checks without browser errors. Physical Safari validation remains outstanding.
