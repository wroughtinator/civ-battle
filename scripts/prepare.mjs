import {captureRelease,stageReleases} from './releases.mjs';
captureRelease(process.cwd(),process.cwd());
const catalog=stageReleases(process.cwd());
console.log(`Prepared release ${catalog.current} for local development.`);
