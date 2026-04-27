import * as THREE from '../lib/three/three.module.js';
import { createClient } from 'https://esm.sh/@liveblocks/client@2';

let room = null;
const peerPins = new Map();  // connectionId → Group
let _lastPos = null, _lastRot = null;

const PIN_COLORS = [0xee4444, 0x44cc55, 0x4499ff, 0xff8822]; // red, green, blue, orange
let _colorIndex = 0;
const peerColors = new Map(); // connectionId → color

const sphereGeo = new THREE.SphereGeometry(0.19, 32, 24);

function createPinMesh(color) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.4, metalness: 0.1,
    transparent: true, opacity: 0.82,
    emissive: new THREE.Color(0xffdd44), emissiveIntensity: 0
  });
  const mesh = new THREE.Mesh(sphereGeo, mat);
  mesh.userData.mat = mat;
  return mesh;
}

export function initCollab(scene, roomId) {
  if (!roomId) return;

  const client = createClient({ publicApiKey: window.CONFIG.liveblocksPublicKey });
  const { room: r } = client.enterRoom(roomId, {
    initialPresence: { position: null, rotation: null, speaking: false }
  });
  room = r;

  room.subscribe('others', (others) => {
    const activeIds = new Set(others.map(o => o.connectionId));

    for (const [id, pin] of peerPins) {
      if (!activeIds.has(id)) {
        scene.remove(pin);
        peerPins.delete(id);
      }
    }

    for (const other of others) {
      const p = other.presence?.position;
      if (!p) continue;

      let pin = peerPins.get(other.connectionId);
      if (!pin) {
        if (!peerColors.has(other.connectionId)) {
          peerColors.set(other.connectionId, PIN_COLORS[_colorIndex++ % PIN_COLORS.length]);
        }
        pin = createPinMesh(peerColors.get(other.connectionId));
        scene.add(pin);
        peerPins.set(other.connectionId, pin);
      }
      pin.position.set(p.x, p.y, p.z);
      pin.userData.mat.emissiveIntensity = other.presence?.speaking ? 1.0 : 0;
    }
  });
}

export function setSpeaking(isSpeaking) {
  if (!room) return;
  room.updatePresence({ speaking: isSpeaking });
}

export function broadcastPosition(camera) {
  if (!room) return;

  const { x, y, z } = camera.position;
  const ry = camera.rotation.y;

  const px = Math.round(x * 1000), py = Math.round(y * 1000), pz = Math.round(z * 1000);
  const pr = Math.round(ry * 1000);
  if (_lastPos && _lastPos[0] === px && _lastPos[1] === py && _lastPos[2] === pz && _lastRot === pr) return;

  _lastPos = [px, py, pz];
  _lastRot = pr;
  room.updatePresence({ position: { x, y, z }, rotation: ry });
}
