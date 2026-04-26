import * as THREE from '../lib/three/three.module.js';
import { createClient } from 'https://esm.sh/@liveblocks/client@2';

let room = null;
const peerSpheres = new Map(); // connectionId → Mesh
let _lastPos = null, _lastRot = null;

const sphereGeo = new THREE.SphereGeometry(0.25, 12, 8);
const sphereMat = new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.7 });

function getOrCreateRoomId() {
  const params = new URLSearchParams(window.location.search);
  let id = params.get('room');
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    params.set('room', id);
    window.location.replace(window.location.pathname + '?' + params.toString());
    return null;
  }
  return id;
}

export function initCollab(scene) {
  const roomId = getOrCreateRoomId();
  if (!roomId) return; // page is redirecting

  const client = createClient({ publicApiKey: window.CONFIG.liveblocksPublicKey });
  const { room: r } = client.enterRoom(roomId, {
    initialPresence: { position: null, rotation: null }
  });
  room = r;

  room.subscribe('others', (others) => {
    const activeIds = new Set(others.map(o => o.connectionId));

    for (const [id, mesh] of peerSpheres) {
      if (!activeIds.has(id)) {
        scene.remove(mesh);
        peerSpheres.delete(id);
      }
    }

    for (const other of others) {
      const p = other.presence?.position;
      if (!p) continue;

      let mesh = peerSpheres.get(other.connectionId);
      if (!mesh) {
        mesh = new THREE.Mesh(sphereGeo, sphereMat.clone());
        scene.add(mesh);
        peerSpheres.set(other.connectionId, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
    }
  });
}

export function broadcastPosition(camera) {
  if (!room) return;

  const { x, y, z } = camera.position;
  const ry = camera.rotation.y;

  // Skip if position hasn't meaningfully changed (1mm / 0.001 rad threshold)
  const px = Math.round(x * 1000), py = Math.round(y * 1000), pz = Math.round(z * 1000);
  const pr = Math.round(ry * 1000);
  if (_lastPos && _lastPos[0] === px && _lastPos[1] === py && _lastPos[2] === pz && _lastRot === pr) return;

  _lastPos = [px, py, pz];
  _lastRot = pr;
  room.updatePresence({ position: { x, y, z }, rotation: ry });
}
