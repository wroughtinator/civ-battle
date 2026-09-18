import {execFileSync,spawn} from 'node:child_process';
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/prepare.mjs'],{stdio:'inherit'});
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--port','8793',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,MERIDIAN_LOCAL_DEV:'1'}});
child.on('exit',code=>process.exit(code??1));
