import * as THREE from '../lib/three/three.module.js';
import { createClient } from 'https://esm.sh/@liveblocks/client@2';

let room = null;
let _leave = null;
let _scene = null;
let _onCallEnd = null;

const peerPins = new Map();  // connectionId → Group
let _lastPos = null, _lastRot = null;

const PIN_COLORS = [0xee4444, 0x44cc55, 0x4499ff, 0xff8822]; // red, green, blue, orange

function colorFromId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  return PIN_COLORS[h % PIN_COLORS.length];
}

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

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.roundRect(4, 4, 248, 56, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.15, 1);
  sprite.position.set(0, -0.35, 0);
  return sprite;
}

function setupRoom(scene, r, leave) {
  _scene = scene;
  _leave = leave;
  room = r;

  room.subscribe('event', ({ event }) => {
    if (event?.type === 'call:end' && _onCallEnd) _onCallEnd();
  });

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
        pin = createPinMesh(colorFromId(other.connectionId));
        const name = other.presence?.name || '';
        const sprite = makeNameSprite(name);
        pin.add(sprite);
        pin.userData.nameSprite = sprite;
        pin.userData.lastName = name;
        scene.add(pin);
        peerPins.set(other.connectionId, pin);
      } else {
        const name = other.presence?.name || '';
        if (name !== pin.userData.lastName) {
          if (pin.userData.nameSprite) pin.remove(pin.userData.nameSprite);
          const sprite = makeNameSprite(name);
          pin.add(sprite);
          pin.userData.nameSprite = sprite;
          pin.userData.lastName = name;
        }
      }
      pin.position.set(p.x, p.y, p.z);
      pin.userData.mat.emissiveIntensity = other.presence?.speaking ? 1.0 : 0;
    }
  });
}

export function initCollab(scene, roomId, onCallEnd) {
  if (!roomId) return;
  _onCallEnd = onCallEnd || null;
  const client = createClient({ publicApiKey: window.CONFIG.liveblocksPublicKey });
  const { room: r, leave } = client.enterRoom(roomId, {
    initialPresence: { position: null, rotation: null, speaking: false, name: window._userName || '' }
  });
  setupRoom(scene, r, leave);
}

// Joins a room only if someone else is already in it. Rejects after 4 s if empty.
export function tryJoinRoom(scene, roomId, onCallEnd) {
  return new Promise((resolve, reject) => {
    if (!roomId) { reject(new Error('No room ID')); return; }
    _onCallEnd = onCallEnd || null;

    const client = createClient({ publicApiKey: window.CONFIG.liveblocksPublicKey });
    const { room: r, leave } = client.enterRoom(roomId, {
      initialPresence: { position: null, rotation: null, speaking: false, name: window._userName || '' }
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      leave();
      reject(new Error('Room not found'));
    }, 4000);

    r.subscribe('others', (others) => {
      if (settled || others.length === 0) return;
      settled = true;
      clearTimeout(timer);
      setupRoom(scene, r, leave);
      resolve();
    });
  });
}

export function broadcastCallEnd() {
  if (!room) return;
  room.broadcastEvent({ type: 'call:end' });
}

export function leaveCollab() {
  for (const [, pin] of peerPins) {
    if (_scene) _scene.remove(pin);
  }
  peerPins.clear();
  if (_leave) _leave();
  _leave = null;
  room = null;
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
