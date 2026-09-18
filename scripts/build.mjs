import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import './roster.mjs';
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { stdio: 'inherit' });
copyFileSync('target/wasm32-unknown-unknown/release/meridian_engine.wasm', 'worker/engine.wasm');
copyFileSync('worker/engine.wasm', 'public/engine.wasm');
console.log('Rust simulation compiled for Workers and browser previews.');
