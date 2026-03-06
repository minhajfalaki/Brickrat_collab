import * as THREE from '../../lib/three/three.module.js';

// ------------------------------------------------------------------
//  Constants — tweak here to change feel of the walkthrough
// ------------------------------------------------------------------
const EYE_HEIGHT      = 1.65;  // metres above the floor surface
const MAX_STEP_UP     = 0.25;  // max step height the player can climb
const MOVE_SPEED      = 4.0;   // metres per second
const LOOK_SENSITIVITY = 0.0018; // radians per pixel of mouse movement
const MIN_PITCH       = -Math.PI * 0.42; // ~75° down
const MAX_PITCH       =  Math.PI * 0.42; // ~75° up

// Small upward offset for the floor probe origin (keeps it just above eye level,
// well inside the room so it never accidentally hits the ceiling first).
const FLOOR_PROBE_ABOVE = 0.1;

export class FirstPersonController {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement}  domElement  - the renderer's canvas
   * @param {object}       [opts]
   * @param {boolean}      [opts.isMobile=false]  - skip pointer-lock/keyboard setup
   */
  constructor(camera, domElement, { isMobile = false } = {}) {
    this.camera     = camera;
    this.domElement = domElement;

    // Look angles (euler decomposed, applied as YXZ)
    this.yaw   = 0; // horizontal — modified by mouse X
    this.pitch = 0; // vertical   — modified by mouse Y

    // Keyboard state: e.code → boolean
    this.keyState = {};

    // Pointer lock state (desktop) / active state (mobile)
    this.isLocked = false;

    // Last confirmed floor Y (foot level, not eye level)
    this.lastGroundY = 0;

    // Debug info — updated every frame, read by main.js for the HUD
    this.debugInfo = {
      probeY:   null,  // raw value returned by the last floor probe
      stepDiff: null,  // newFloorY - currentFootY at last movement probe
      accepted: null,  // true = step accepted, false = rejected, null = no probe
    };

    // Flat array of meshes used for floor raycasting
    this._meshes = [];

    // Reuse one Raycaster for floor probes (always shoots straight down)
    this._downRay = new THREE.Raycaster();
    this._downRay.ray.direction.set(0, -1, 0);
    // Reach: from just above eye level down to ~4 m below foot level.
    // Covers EYE_HEIGHT (1.65) + FLOOR_PROBE_ABOVE (0.1) + extra descent buffer (2.5).
    this._downRay.far = EYE_HEIGHT + FLOOR_PROBE_ABOVE + 2.5;

    // Mobile controls reference (set via setMobileMode)
    this._mobile = null;

    if (!isMobile) {
      this._setupPointerLock();
      this._setupKeyboard();
    }
  }

  // ------------------------------------------------------------------
  //  Public API
  // ------------------------------------------------------------------

  /**
   * Call once after the GLTF scene is added to the Three.js scene.
   * Collects all meshes for floor raycasting.
   */
  setScene(gltfScene) {
    this._meshes = [];
    gltfScene.traverse(obj => {
      if (obj.isMesh) this._meshes.push(obj);
    });
  }

  /**
   * Set initial ground Y (foot level). Call after findStartPosition places
   * the camera so the controller knows where the floor is from frame 1.
   */
  setGroundY(y) {
    this.lastGroundY = y;
  }

  /**
   * Set the initial horizontal look direction (in radians, 0 = +Z forward).
   */
  setYaw(yaw) {
    this.yaw = yaw;
  }

  /**
   * Activate mobile input mode. Pass a MobileControls instance.
   * After this call the controller reads joystick + touch-look instead of
   * keyboard + pointer-lock mouse, and isLocked must be set externally
   * (main.js sets it to true when the user taps "Tap to explore").
   */
  setMobileMode(mobileControls) {
    this._mobile = mobileControls;
  }

  /**
   * Main update — call every frame with elapsed seconds.
   */
  update(dt) {
    // Always apply camera rotation so the view is correct even before the
    // pointer is locked (e.g. the initial "Click to explore" frame).
    this._applyRotation();

    if (!this.isLocked) return;

    if (this._mobile) {
      this._applyMobileMovement(dt);
    } else {
      this._applyMovement(dt);
    }
  }

  // ------------------------------------------------------------------
  //  Setup helpers
  // ------------------------------------------------------------------

  _setupPointerLock() {
    // Click anywhere on the page → grab pointer.
    // Using document instead of domElement because the "Ready to Explore"
    // overlay sits on top of the canvas and would swallow the click otherwise.
    document.addEventListener('click', () => {
      if (!this.isLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;

      // Show/hide the "click to explore" overlay
      const prompt = document.getElementById('clickPrompt');
      if (prompt) {
        prompt.style.display = this.isLocked ? 'none' : 'flex';
      }
    });

    document.addEventListener('mousemove', e => {
      if (!this.isLocked) return;
      this.yaw   -= e.movementX * LOOK_SENSITIVITY;
      this.pitch -= e.movementY * LOOK_SENSITIVITY;
      this.pitch  = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
    });
  }

  _setupKeyboard() {
    window.addEventListener('keydown', e => { this.keyState[e.code] = true;  });
    window.addEventListener('keyup',   e => { this.keyState[e.code] = false; });
  }

  // ------------------------------------------------------------------
  //  Per-frame helpers
  // ------------------------------------------------------------------

  _applyRotation() {
    // YXZ order: yaw first (world Y), then pitch (local X) — standard FPS
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  _applyMovement(dt) {
    // --- Build a horizontal input vector in camera-local space ---
    const inputDir = new THREE.Vector3();
    if (this.keyState['KeyW']     || this.keyState['ArrowUp'])    inputDir.z -= 1;
    if (this.keyState['KeyS']     || this.keyState['ArrowDown'])   inputDir.z += 1;
    if (this.keyState['KeyA']     || this.keyState['ArrowLeft'])   inputDir.x -= 1;
    if (this.keyState['KeyD']     || this.keyState['ArrowRight'])  inputDir.x += 1;

    const currentFootY = this.camera.position.y - EYE_HEIGHT;

    if (inputDir.lengthSq() > 0) {
      inputDir.normalize();

      // Rotate movement by yaw only (keep it horizontal — no pitch tilt)
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), this.yaw
      );
      inputDir.applyQuaternion(yawQuat);
      inputDir.multiplyScalar(MOVE_SPEED * dt);

      const targetX = this.camera.position.x + inputDir.x;
      const targetZ = this.camera.position.z + inputDir.z;

      // Probe floor at the destination
      const newFloorY = this._probeFloor(targetX, targetZ);

      // Always move horizontally (wall collision disabled per requirements)
      this.camera.position.x = targetX;
      this.camera.position.z = targetZ;

      // Update ground Y only if the step is within allowed range
      if (newFloorY !== null) {
        const stepDiff = newFloorY - currentFootY;
        const accepted = stepDiff <= MAX_STEP_UP;
        this.debugInfo.probeY   = newFloorY;
        this.debugInfo.stepDiff = stepDiff;
        this.debugInfo.accepted = accepted;
        if (accepted) {
          this.lastGroundY = newFloorY;
        }
      } else {
        this.debugInfo.probeY   = null;
        this.debugInfo.stepDiff = null;
        this.debugInfo.accepted = null;
      }
    } else {
      // Standing still — re-probe in case floor changed (e.g. slow ramp,
      // or the model moved). Handles gentle descent naturally.
      const floorY = this._probeFloor(
        this.camera.position.x,
        this.camera.position.z
      );
      if (floorY !== null) {
        const stepDiff = floorY - currentFootY;
        if (stepDiff <= MAX_STEP_UP) {
          this.lastGroundY = floorY;
        }
      }
    }

    // Lock camera Y to eye height above last known ground
    this.camera.position.y = this.lastGroundY + EYE_HEIGHT;
  }

  /**
   * Cast a ray straight down from just above eye level and return
   * the Y of the first mesh surface hit, or null if nothing is found.
   *
   * Starting from camera.position.y + 0.1 keeps the origin INSIDE the room
   * (below any ceiling), so the ray hits the actual floor, not the ceiling.
   */
  _probeFloor(x, z) {
    this._downRay.ray.origin.set(
      x,
      this.camera.position.y + FLOOR_PROBE_ABOVE,
      z
    );
    const hits = this._downRay.intersectObjects(this._meshes, false);
    return hits.length > 0 ? hits[0].point.y : null;
  }

  // ------------------------------------------------------------------
  //  Mobile movement (replaces _applyMovement when _mobile is set)
  // ------------------------------------------------------------------

  _applyMobileMovement(dt) {
    // Apply accumulated look delta from touch drag
    const { dx, dy } = this._mobile.consumeLookDelta();
    const sens = this._mobile.getLookSensitivity();
    this.yaw   -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch  = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));

    // Read joystick input
    const { x: jx, z: jz } = this._mobile.getMoveInput();
    const currentFootY = this.camera.position.y - EYE_HEIGHT;

    if (Math.abs(jx) > 0.04 || Math.abs(jz) > 0.04) {
      // Build a horizontal movement vector in world space
      // Joystick: right=+x, down=+z (same convention as WASD)
      const inputDir = new THREE.Vector3(jx, 0, jz);
      inputDir.normalize();

      const yawQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), this.yaw
      );
      inputDir.applyQuaternion(yawQuat);
      inputDir.multiplyScalar(MOVE_SPEED * dt);

      const targetX = this.camera.position.x + inputDir.x;
      const targetZ = this.camera.position.z + inputDir.z;

      const newFloorY = this._probeFloor(targetX, targetZ);

      this.camera.position.x = targetX;
      this.camera.position.z = targetZ;

      if (newFloorY !== null) {
        const stepDiff = newFloorY - currentFootY;
        if (stepDiff <= MAX_STEP_UP) {
          this.lastGroundY = newFloorY;
        }
      }
    } else {
      // Standing still — re-probe floor for gentle slopes / descents
      const floorY = this._probeFloor(
        this.camera.position.x,
        this.camera.position.z
      );
      if (floorY !== null) {
        if (floorY - currentFootY <= MAX_STEP_UP) {
          this.lastGroundY = floorY;
        }
      }
    }

    this.camera.position.y = this.lastGroundY + EYE_HEIGHT;
  }
}
