import * as THREE from './lib/three/three.module.js';
import { GLTFLoader }           from './lib/three/loaders/GLTFLoader.js';
import { FirstPersonController } from './js/controls/FirstPersonControls.js';
import { MobileControls }       from './js/controls/MobileControls.js';
import { findStartPosition }    from './js/utils/findStartPosition.js';

// ============================================================
//  Device detection
// ============================================================
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ============================================================
//  MODEL URL
//  Local dev  → put your GLB inside the "assets/" folder and
//               keep the path below as-is.
//  Production → replace with the direct URL of your hosted GLB
//               (GitHub Release asset, Cloudflare R2, etc.)
// ============================================================
// const MODEL_URL = 'https://pub-4622c204bf054ed7ae6895e757c1af7f.r2.dev/model.glb';
const MODEL_URL = 'https://pub-4622c204bf054ed7ae6895e757c1af7f.r2.dev/baked.glb';

// ============================================================
//  Eye-height constant (metres above floor)
//  Must match the value in FirstPersonControls.js
// ============================================================
const EYE_HEIGHT = 1.65;

// ------------------------------------------------------------
//  Scene
// ------------------------------------------------------------
const scene = new THREE.Scene();

// 4 PM slightly-cloudy sky colour
scene.background = new THREE.Color(0xB8CEDD);

// Subtle atmospheric haze — helps depth perception indoors
// (tweak far distance if the model is very large)
scene.fog = new THREE.FogExp2(0xB8CEDD, 0.002);

// ------------------------------------------------------------
//  Lighting — late-afternoon / 4 PM overcast sun
// ------------------------------------------------------------

// Hemisphere: cool sky dome above, warm earth below
// Mimics the diffuse bounce light of an overcast afternoon
const hemiLight = new THREE.HemisphereLight(
  0x9BBCD4,  // sky colour  — muted steel-blue
  0x7D6B50,  // ground colour — warm tan / earth
  0.9
);
scene.add(hemiLight);

// Directional "sun": warm golden light from low in the west
// position() just sets direction for a DirectionalLight
const sunLight = new THREE.DirectionalLight(0xFFBF7F, 1.1);
sunLight.position.set(-120, 70, -90); // low western sun angle
scene.add(sunLight);

// Soft ambient fill to keep shadowed areas readable
const ambientLight = new THREE.AmbientLight(0xD4C5B0, 0.35);
scene.add(ambientLight);

// ------------------------------------------------------------
//  Camera
// ------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  88,                                    // FOV
  window.innerWidth / window.innerHeight,
  0.05,                                  // near — close enough to avoid clipping indoors
  2000                                   // far
);

// ------------------------------------------------------------
//  Renderer
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// Physically-correct lighting mode for better material appearance
renderer.useLegacyLights = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ------------------------------------------------------------
//  First-person controller
// ------------------------------------------------------------
const fpController = new FirstPersonController(camera, renderer.domElement, { isMobile });

// ------------------------------------------------------------
//  Loading manager + progress ring
// ------------------------------------------------------------
const loadingOverlay   = document.getElementById('loadingOverlay');
const clickPrompt      = document.getElementById('clickPrompt');
const btnGhost         = document.getElementById('btnGhost');
const btnCallFloat     = document.getElementById('btnCallFloat');
const fpsCounter       = document.getElementById('fpsCounter');
const progressText     = document.getElementById('progressText');
const progressCircle   = document.querySelector('.progress-ring__circle');

const CIRCUMFERENCE = 2 * Math.PI * 50; // r=50 → ~314

function setProgress(pct) {
  pct = Math.max(0, Math.min(100, pct));
  if (progressText)   progressText.textContent = `${Math.round(pct)}%`;
  if (progressCircle) {
    progressCircle.style.strokeDashoffset =
      CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  }
}

// Ghost-mode button — 3-second wall pass-through with debounce
let ghostTimer = null;

function activateGhostMode() {
  fpController.wallCollisionEnabled = false;
  if (btnGhost) btnGhost.classList.add('ghost-active');
  if (ghostTimer) clearTimeout(ghostTimer);
  ghostTimer = setTimeout(() => {
    fpController.wallCollisionEnabled = true;
    if (btnGhost) btnGhost.classList.remove('ghost-active');
    ghostTimer = null;
  }, 3000);
}

if (btnGhost) {
  btnGhost.addEventListener('click', activateGhostMode);
}

// Space Bar triggers ghost mode while pointer is locked (desktop shortcut)
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && fpController.isLocked) {
    e.preventDefault(); // prevent page scroll
    activateGhostMode();
  }
});

const manager = new THREE.LoadingManager(
  // onLoad
  () => {
    setProgress(100);
    // Brief pause so the 100% renders, then swap overlays
    setTimeout(() => {
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      if (clickPrompt)    clickPrompt.style.display    = 'flex';
      if (btnGhost)       btnGhost.style.display       = 'flex';
      if (btnCallFloat)   btnCallFloat.style.display   = 'flex';
      if (fpsCounter)     fpsCounter.style.display     = 'block';
      _modelLoaded = true;
    }, 400);
  },
  // onProgress
  (url, loaded, total) => {
    setProgress(Math.round((loaded / total) * 100));
  },
  // onError
  url => {
    console.error('Error loading asset:', url);
  }
);

// Safety: hide loading screen after 30 s regardless
setTimeout(() => {
  if (loadingOverlay && loadingOverlay.style.display !== 'none') {
    loadingOverlay.style.display = 'none';
    if (clickPrompt) clickPrompt.style.display = 'flex';
    if (btnGhost)    btnGhost.style.display    = 'flex';
  }
}, 30000);

// ------------------------------------------------------------
//  Mobile controls init
// ------------------------------------------------------------
if (isMobile) {
  const mobileControls = new MobileControls(renderer.domElement);
  fpController.setMobileMode(mobileControls);

  // On mobile there is no pointer lock — tapping the prompt activates the controller
  if (clickPrompt) {
    clickPrompt.addEventListener('click', () => {
      try { screen.orientation.lock('landscape'); } catch {}
      clickPrompt.style.display = 'none';
      fpController.isLocked = true;
    });
  }
}

// ------------------------------------------------------------
//  GLTF / GLB loader
// ------------------------------------------------------------
const loader = new GLTFLoader(manager);

loader.load(
  MODEL_URL,
  gltf => {
    scene.add(gltf.scene);

    // --- Smart start position ---
    const startPos = findStartPosition(gltf.scene, EYE_HEIGHT);
    camera.position.copy(startPos);

    // Tell the controller where the floor is from the very first frame
    fpController.setGroundY(startPos.y - EYE_HEIGHT);

    // --- Initial look direction ---
    // Face toward the centre of the model's bounding box (horizontal only)
    const box    = new THREE.Box3().setFromObject(gltf.scene);
    const centre = box.getCenter(new THREE.Vector3());
    const toCenter = new THREE.Vector3(
      centre.x - startPos.x,
      0,
      centre.z - startPos.z
    );
    if (toCenter.lengthSq() > 0.001) {
      // yaw = angle in XZ plane to face the model interior
      fpController.setYaw(Math.atan2(toCenter.x, toCenter.z));
    }

    // Register scene meshes for floor raycasting
    fpController.setScene(gltf.scene);
    _sceneReady = true;
  },
  undefined,
  err => {
    console.error('Failed to load model:', err);
    // Still hide loading so the user sees an empty scene rather than hanging
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }
);

// ------------------------------------------------------------
//  Window resize
// ------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------
//  Animation loop
// ------------------------------------------------------------
let broadcastPosition = null;
let _initVoice = null;
let _initCollab = null;
let _modelLoaded = false;
let _voiceInited = false;
let _sceneReady = false;
let activeRoomId = null;

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function parseRoomId(input) {
  input = input.trim();
  try {
    const url = new URL(input);
    return url.searchParams.get('room') || input;
  } catch {
    const m = input.match(/[?&]room=([^&]+)/);
    return m ? m[1] : input;
  }
}

import('./js/voice.js').then(({ initVoice }) => {
  _initVoice = initVoice;
}).catch(err => console.warn('Voice unavailable:', err));

import('./js/collab.js').then(({ initCollab, broadcastPosition: bp }) => {
  _initCollab = initCollab;
  broadcastPosition = bp;
  if (activeRoomId) initCollab(scene, activeRoomId);
}).catch(err => console.warn('Collab unavailable:', err));

function activateRoom(roomId) {
  activeRoomId = roomId;
  window.CONFIG.dailyRoom = roomId;
  if (_initCollab) _initCollab(scene, roomId);
  if (_modelLoaded && !_voiceInited) {
    _voiceInited = true;
    if (_initVoice) _initVoice();
  }
}

// ── Call UI wiring ──────────────────────────────────────────
{
  const btnCreateCall      = document.getElementById('btnCreateCall');
  const btnJoinCall        = document.getElementById('btnJoinCall');
  const shareRow           = document.getElementById('shareRow');
  const joinRow            = document.getElementById('joinRow');
  const roomIdDisplay      = document.getElementById('roomIdDisplay');
  const btnCopyLink        = document.getElementById('btnCopyLink');
  const joinInput          = document.getElementById('joinInput');
  const btnDoJoin          = document.getElementById('btnDoJoin');

  const btnCreateCallModal = document.getElementById('btnCreateCallModal');
  const btnJoinCallModal   = document.getElementById('btnJoinCallModal');
  const shareRowModal      = document.getElementById('shareRowModal');
  const joinRowModal       = document.getElementById('joinRowModal');
  const roomIdDisplayModal = document.getElementById('roomIdDisplayModal');
  const btnCopyLinkModal   = document.getElementById('btnCopyLinkModal');
  const joinInputModal     = document.getElementById('joinInputModal');
  const btnDoJoinModal     = document.getElementById('btnDoJoinModal');

  const callModal          = document.getElementById('callModal');

  function setRoomId(id) {
    activateRoom(id);
    if (roomIdDisplay)      roomIdDisplay.textContent      = id;
    if (roomIdDisplayModal) roomIdDisplayModal.textContent = id;
  }

  function onCreateCall(shareRowEl, btnCreate, btnJoin) {
    const id = generateRoomId();
    setRoomId(id);
    if (shareRowEl) shareRowEl.style.display = 'flex';
    if (btnCreate)  btnCreate.style.display  = 'none';
    if (btnJoin)    btnJoin.style.display    = 'none';
  }

  function onJoinCall(joinRowEl, btnCreate, btnJoin) {
    if (joinRowEl) joinRowEl.style.display = 'flex';
    if (btnCreate) btnCreate.style.display = 'none';
    if (btnJoin)   btnJoin.style.display   = 'none';
  }

  function onDoJoin(inputEl, shareRowEl, joinRowEl) {
    const id = parseRoomId(inputEl.value);
    if (!id) return;
    setRoomId(id);
    if (shareRowEl) shareRowEl.style.display = 'flex';
    if (joinRowEl)  joinRowEl.style.display  = 'none';
  }

  function onCopyLink(btn) {
    if (!activeRoomId) return;
    const url = window.location.origin + window.location.pathname + '?room=' + activeRoomId;
    const flashCopied = () => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    };
    const execFallback = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); flashCopied(); } catch {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(flashCopied).catch(execFallback);
    } else {
      execFallback();
    }
  }

  if (btnCreateCall) btnCreateCall.addEventListener('click', e => {
    e.stopPropagation();
    onCreateCall(shareRow, btnCreateCall, btnJoinCall);
  });
  if (btnJoinCall) btnJoinCall.addEventListener('click', e => {
    e.stopPropagation();
    onJoinCall(joinRow, btnCreateCall, btnJoinCall);
  });
  if (btnDoJoin) btnDoJoin.addEventListener('click', e => {
    e.stopPropagation();
    onDoJoin(joinInput, shareRow, joinRow);
  });
  if (btnCopyLink) btnCopyLink.addEventListener('click', e => {
    e.stopPropagation();
    onCopyLink(btnCopyLink);
  });
  if (joinInput)  joinInput.addEventListener('click',  e => e.stopPropagation());
  if (shareRow)   shareRow.addEventListener('click',   e => e.stopPropagation());
  if (joinRow)    joinRow.addEventListener('click',    e => e.stopPropagation());

  if (btnCreateCallModal) btnCreateCallModal.addEventListener('click', () =>
    onCreateCall(shareRowModal, btnCreateCallModal, btnJoinCallModal));
  if (btnJoinCallModal) btnJoinCallModal.addEventListener('click', () =>
    onJoinCall(joinRowModal, btnCreateCallModal, btnJoinCallModal));
  if (btnDoJoinModal) btnDoJoinModal.addEventListener('click', () =>
    onDoJoin(joinInputModal, shareRowModal, joinRowModal));
  if (btnCopyLinkModal) btnCopyLinkModal.addEventListener('click', () =>
    onCopyLink(btnCopyLinkModal));

  if (btnCallFloat && callModal) {
    const toggleCallModal = () => {
      if (document.pointerLockElement) document.exitPointerLock();
      callModal.style.display = callModal.style.display === 'flex' ? 'none' : 'flex';
    };
    btnCallFloat.addEventListener('click', toggleCallModal);
    callModal.addEventListener('click', e => {
      if (e.target === callModal) callModal.style.display = 'none';
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyC' && !e.target.matches('input, textarea')) toggleCallModal();
    });
  }
}

const clock = new THREE.Clock();
let fpsFrames = 0, fpsElapsed = 0;
let broadcastAccum = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1); // cap at 100 ms to avoid teleporting on tab-switch

  // FPS counter — update once per second
  fpsFrames++;
  fpsElapsed += dt;
  if (fpsElapsed >= 1.0) {
    fpsCounter.textContent = Math.round(fpsFrames / fpsElapsed) + ' FPS';
    fpsFrames = 0;
    fpsElapsed = 0;
  }

  fpController.update(dt);

  broadcastAccum += dt;
  if (broadcastAccum >= 0.15) {
    broadcastAccum = 0;
    if (broadcastPosition) broadcastPosition(camera);
  }

  renderer.render(scene, camera);
}

animate();
