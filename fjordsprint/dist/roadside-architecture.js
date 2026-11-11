import * as T from './vendor/three.module.js';
import { hospitalsForCourse } from './hso-data.js?v=3.1.0';
import { groundHeight } from './terrain.js';

const styles = {
  fjord: { walls: [0x9f4a37, 0xc39456], roof: 0x36454b, trim: 0xf0dfc0, rise: 2.5 },
  pass: { walls: [0x7a644f, 0x65775f], roof: 0x4a5158, trim: 0xd9c8a9, rise: 2.9 },
  aurora: { walls: [0x4d667b, 0x794c5a], roof: 0xb3c5ce, trim: 0xdfe7e9, rise: 3.1 },
};

function timberTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f1e7db';
  ctx.fillRect(0, 0, 128, 128);
  for (let board = 0; board < 16; board++) {
    const x = board * 8;
    ctx.fillStyle = `rgba(82,55,39,${.03 + (board * 11 % 7) * .012})`;
    ctx.fillRect(x, 0, 8, 128);
    ctx.fillStyle = '#ac9d8c';
    ctx.fillRect(x, 0, 1, 128);
    ctx.fillStyle = '#faf0e2';
    ctx.fillRect(x + 1, 0, 1, 128);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  return map;
}

function findSites(track, terrain) {
  const reserved = hospitalsForCourse(track.config.id).map(campus => campus.q * track.length);
  const sites = [];
  const roadEdge = track.config.width / 2;
  for (let index = 0; index < 10; index++) {
    const ideal = 130 + index * (track.length - 430) / 9;
    const preferredSide = index % 2 ? -1 : 1;
    let site;
    for (const along of [0, -22, 22, -46, 46, -70, 70]) {
      const s = ideal + along;
      if (reserved.some(distance => Math.abs(s - distance) < 73)) continue;
      const frame = track.at(s);
      for (const side of [preferredSide, -preferredSide]) {
        for (const setback of [21, 29, 39]) {
          const lateral = side * (roadEdge + setback);
          const x = frame.p.x + frame.r.x * lateral;
          const z = frame.p.z + frame.r.z * lateral;
          const clearance = track.distanceToRoad(x, z);
          if (clearance < roadEdge + 13 || sites.some(other => Math.hypot(x - other.x, z - other.z) < 30)) continue;
          const yaw = Math.atan2(frame.p.x - x, frame.p.z - z);
          const ground = [[0, 0], [-6, -5], [-6, 7], [6, -5], [6, 7]].map(([localX, localZ]) =>
            groundHeight(terrain, x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
              z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ));
          const bottom = Math.min(...ground);
          const y = Math.max(...ground);
          if (bottom < 4 || y - bottom > 3.4 || Math.abs(y - frame.p.y) > 10) continue;
          const cost = (y - bottom) * 2 + Math.abs(y - frame.p.y) + Math.abs(along) * .035 + setback * .12 + (side === preferredSide ? 0 : 1.2);
          if (!site || cost < site.cost) site = { s, side, x, y, z, yaw, depth: y - bottom, clearance, cost };
        }
      }
    }
    if (site) sites.push(site);
  }
  return sites;
}

export function addRoadsideCabins(scene, track, terrain) {
  const style = styles[track.config.id] ?? styles.fjord;
  const sites = findSites(track, terrain);
  if (!sites.length) return { sites, stats: { count: 0 } };
  const siding = timberTexture();
  const material = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .78, ...extra });
  const palette = {
    painted: material(style.walls[0], { map: siding }),
    alternate: material(style.walls[1], { map: siding }),
    roof: material(style.roof),
    trim: material(style.trim),
    stone: material(0x697573),
    wood: material(0x685247),
    glass: material(0xe9af6f, { emissive: 0xe8a24c, emissiveIntensity: track.config.id === 'aurora' ? .72 : .22 }),
  };
  const profile = new T.Shape();
  profile.moveTo(-.5, 0);
  profile.lineTo(.5, 0);
  profile.lineTo(0, 1);
  profile.closePath();
  const gable = new T.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false });
  gable.translate(0, 0, -.5);
  const geometries = { box: new T.BoxGeometry(1, 1, 1), gable };
  const local = new T.Object3D();
  const building = new T.Object3D();
  const batches = new Map();

  function part(color, x, y, z, width, height, depth, rotation = 0, shape = 'box') {
    const key = `${shape}:${color}`;
    if (!batches.has(key)) batches.set(key, { geometry: geometries[shape], material: palette[color], transforms: [] });
    local.position.set(x, y, z);
    local.scale.set(width, height, depth);
    local.rotation.set(0, 0, rotation);
    local.updateMatrix();
    batches.get(key).transforms.push(local.matrix.clone().premultiply(building.matrix));
  }

  for (const [index, site] of sites.entries()) {
    building.position.set(site.x, site.y + .22, site.z);
    building.rotation.y = site.yaw;
    building.updateMatrix();
    const width = 9.8;
    const depth = 7.6;
    const eaves = 4.5;
    const rise = style.rise;
    const pitch = Math.atan2(rise, width / 2);
    const wall = index % 3 ? 'painted' : 'alternate';
    part('stone', 0, -(site.depth + .38) / 2, 0, width + .36, site.depth + .4, depth + .32);
    part(wall, 0, eaves / 2, 0, width, eaves, depth);
    part(wall, 0, eaves, 0, width, rise, depth, 0, 'gable');
    part('trim', 0, .28, 0, width + .1, .13, depth + .1);
    for (const side of [-1, 1]) {
      const slope = Math.hypot(width / 2, rise) + .7;
      part('roof', side * (width / 4 + .14), eaves + rise / 2 + .05, 0, slope, .25, depth + 1.22, -side * pitch);
      for (const front of [-1, 1]) {
        part('trim', side * (width / 4 + .14), eaves + rise / 2 - .09, front * (depth / 2 + .51), slope, .15, .16, -side * pitch);
        part('trim', side * (width / 2 - .12), eaves / 2, front * (depth / 2 + .018), .18, eaves, .14);
        part('trim', side * 2.85, 2.75, front * (depth / 2 + .055), 1.68, 1.75, .16);
        part('glass', side * 2.85, 2.75, front * (depth / 2 + .148), 1.4, 1.48, .045);
        part('trim', side * 2.85, 2.75, front * (depth / 2 + .185), .085, 1.51, .065);
      }
    }
    part('roof', 0, eaves + rise + .12, 0, .26, .24, depth + 1.22);
    part('stone', 2.2, eaves + rise + .1, -.75, .75, 2.04, .78);
    part('roof', 2.2, eaves + rise + 1.14, -.75, .97, .16, .98);
    part('trim', 0, 1.31, depth / 2 + .045, 1.47, 2.62, .17);
    part('wood', 0, 1.27, depth / 2 + .153, 1.16, 2.48, .075);
    part('glass', 0, 1.9, depth / 2 + .203, .82, .58, .045);
    part('roof', 0, 2.85, depth / 2 + .68, 2.55, .18, 1.66);
    part('wood', 0, .06, depth / 2 + .64, 2.63, .22, 1.35);
    part('stone', 0, -.12, depth / 2 + 1.25, 2.34, .27, .66);
  }

  const cabins = new T.Group();
  cabins.name = 'Roadside cabins';
  for (const { geometry, material, transforms } of batches.values()) {
    const batch = new T.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach((transform, index) => batch.setMatrixAt(index, transform));
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.computeBoundingSphere();
    cabins.add(batch);
  }
  scene.add(cabins);
  return { sites, stats: { count: sites.length, batches: batches.size, minimumClearance: Math.min(...sites.map(site => site.clearance)) } };
}
