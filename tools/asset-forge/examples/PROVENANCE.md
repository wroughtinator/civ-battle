# Example provenance

Created for this task on 2026-09-17/18. Geometry and rigid animations were authored in JSON by Codex. Surface images were made with the built-in `image_gen` tool, then baked by Asset Forge. No API fallback or third-party model packs were used. Generated painting sources are retained in the ignored `../output/` capture directories; distributable baked atlases are `guard.png`, `watchtower.png`, and `cannon.png`. Each source was inspected before projection. These assets are tool examples, not replacements for deployed game assets.

All examples use two passes: front at yaw 35° (cannon 40°), rear at yaw −145° (cannon −140°), pitch 15° (cannon 25°). Final gallery renders are at pitch 20°. Existing atlas texels were preserved on rear passes. The atlas sampling uses a 4×4 footprint; no subsequent AI edits were applied to the model previews.

## Guard front

Input edit target: `../output/front/guide.png`. Source output: `../output/front/generated.png`.

> Use case: precise-object-edit. Edit target: the supplied flat-color orthographic low-poly guard render, with transparent background. Produce a CAMERA-ALIGNED texture stencil, keeping every silhouette pixel, all rectangular part boundaries, pose, camera, position and empty margins exactly as in the image. Do not add geometry or change framing. Paint ONLY within the existing colored silhouette. A grungy retro strategy game guard: worn muted olive metal helmet and torso armor, simple tan face with small dark eyes on front face, battered brown wooden shield on image left, scuffed gray steel sword crossing to the left from the right arm, dark brown trousers and boots. Flat unlit material color with small scratches, subtle coarse mottling, restrained pixels, no cast shadows or dramatic shading. Maintain transparent background. Output a square image. No text. Keep the model blocky and rough, all surfaces planar. This image will be projected directly back onto those exact visible surfaces.

## Guard rear

Inputs: `../output/rear/guide.png` (edit target), `inpaint.png` (preservation reference), `../front/generated.png` (style only). Output: `../output/rear/generated.png`.

> Texture inpainting experiment. Image 1 is the EDIT TARGET: the exact rear-view geometry guide of a blocky guard. Image 2 is the same camera view with TRANSPARENT HOLES where texture is missing; preserve its few already painted opaque fragments. Image 3 is a STYLE REFERENCE ONLY for the front of the same guard, do NOT use its camera or pose. Complete the transparent missing model surfaces in image 2 using image 1's EXACT silhouette and planar shape boundaries. Texture the BACK of the helmet in chipped muted olive metal, back of head with short dark brown hair, back of torso in worn olive metal armor with leather straps, arms worn leather, shield backside wooden, trousers dark brown cloth. Realistic worn material detail, flat diffuse light, no geometry changes. Keep full 512-square guide framing and relative sizes; no crop or resize of the subject. Background outside image 1's silhouette must remain transparent. No face on the back of head. No text.

## Watchtower front

Input edit target: `../output/tower-front/guide.png`. Output: `../output/tower-front/generated.png`.

> Use case precise-object-edit. This exact flat-color low-poly wooden watchtower is the edit target. Paint REALISTIC natural materials onto its existing planar surfaces, suitable for projection onto low-poly game geometry. Weather-beaten rough sawn oak, visible real wood grain, splits and knots, dark iron nail heads, aged timber board parapet, dark aged cedar shingle roof, coarse grey stone plinth. Small moss traces around post bases. Retain exactly this silhouette, orthographic camera, scale, margin placement and all geometry boundaries. Do not invent additional braces, beams, openings, bevels or scene props. Ladder and pillars stay exactly where shown. Realistic surface photography quality, low contrast flat diffuse material color without strong shadows or highlights, not cartoon and not deliberately pixel art (the tool downsamples it). Keep all outside areas and gaps between posts transparent, square canvas with same framing. No ground plane, backdrop, lettering or watermark.

## Watchtower rear

Inputs: `../output/tower-rear/guide.png`, `inpaint.png`, and `../tower-front/generated.png` (style only). Output: `../output/tower-rear/generated.png`.

> Inpaint missing texture on the BACK of a watchtower. Image 1 = exact rear camera geometry guide, EDIT TARGET. Image 2 = already-painted opaque texels to preserve, transparent areas need filling within the tower silhouette. Image 3 = material/style reference from FRONT view only. Paint realistic weather-beaten rough oak grain and nail heads on the brown planar timbers and parapet, aged grey cedar shingles on the tapered roof, coarse grey stone on base. Maintain exactly image 1's rear-view silhouette, camera, framing, scale, pillar positions, open spaces and ladder position (seen behind on right). No extra posts or beams. Realistic material photography in flat diffuse albedo color with subtle variation, no cast shadows. Transparent exterior background and gaps. Square image, keep same margins. Preserve painted texture in image 2 where it exists. No text, no ground plane.

## Cannon front

Input edit target: `../output/cannon-front/guide.png`. Output: `../output/cannon-front/generated.png`.

> Use case precise-object-edit. Paint realistic material textures onto the exact low-poly field cannon in this guide. IMPORTANT preserve the silhouette and EVERY part boundary, exact orthographic camera, object size and placement within the square. The object occupies only the central part of the canvas; do not zoom in or change those margins. Grey shape is a dark worn cast-iron cannon barrel pointing toward bottom-left, with muzzle at the left tip. Paint a dark circular bore on the front muzzle face, pitted iron, worn metal bands. Brown octagonal shapes are solid wooden wheels, paint radial plank grain and rusty iron rims onto their flat faces; DO NOT cut out spokes or change the shape. Brown carriage and rear trail are weathered oak with realistic grain and iron bolts. Use realistic texture photography, low contrast diffuse albedo color, no cast shadows and no studio lighting; not cartoon, not pixel art. We will downsample and project this image onto actual low-poly geometry. No added shapes, ground, backdrop, text or labels. Preserve transparent background.

## Cannon rear

Inputs: `../output/cannon-rear/guide.png`, `inpaint.png`, and `../cannon-front/generated.png` (style only). Output: `../output/cannon-rear/generated.png`.

> Inpaint missing material textures on exact low-poly cannon rear view. Image 1 is EDIT TARGET and exact geometry guide. Image 2 is the same view with missing texture transparent; preserve existing opaque paint. Image 3 is front-view material reference only, not the target camera. Keep exact image 1 rear-view camera, scale, margins, part boundaries and silhouette, do not enlarge model. Complete brown shapes with weathered realistic oak grain, solid octagonal wood wheels with dark iron rims and central iron hubs, iron bolts on carriage and long rear trail pointing bottom left. Grey barrel shape is aged dark pitted cast iron; this view sees closed rear breech toward bottom-left and muzzle tip toward upper-right. Retain the narrow painted strip on barrel top. Realistic surface texture, diffuse low-contrast albedo, not cartoon or pixel art, no cast shadows. No new geometry, cutouts, spokes, props or ground. Background and gaps remain transparent. Square canvas same framing.
