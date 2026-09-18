import { DurableObject } from 'cloudflare:workers';
import { releases, current, bootstrap, catalog } from '../.deploy/registry.js';
import { pinnedRoomClass } from './pinned-room.js';
import { createGateway } from './routing.js';

// Keep this export and its Durable Object namespace unchanged across deployments.
export class Room extends pinnedRoomClass(DurableObject, releases, bootstrap) {}
export default createGateway({releases, current, bootstrap, catalog});
