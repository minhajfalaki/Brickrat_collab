# Brickrat Collab — Status & Debug Reference

## Current State (as of last commit)

| Feature | Status | Notes |
|---------|--------|-------|
| Liveblocks presence (peer spheres) | ✅ Working | Colour-coded, speaking glow |
| Daily.co voice | ✅ Working | Fixed room `brickrat` in config.js |
| Create Call flow | ✅ Working | Generates 6-char ID, URL updates to `?room=<id>` |
| Join Call validation | ✅ Working | 4 s timeout — rejects if creator not present |
| Call timer | ✅ Working | Visible top-left, orange monospace |
| Auto-disconnect at limit | ✅ Working | All users disconnected via broadcast; UI fully resets |
| Service worker | ✅ Fixed | `?room=` query params stripped before cache lookup |
| Usernames | ❌ Not started | See Task 2 |

**Timer is set to 60 minutes.**

---

## Key Files

| File | Responsibility |
|------|---------------|
| `main.js` | App entry point — scene, call UI wiring, timer, `activateRoom`, `endCall` |
| `js/collab.js` | Liveblocks — enter/leave room, peer sphere rendering, presence broadcast |
| `js/voice.js` | Daily.co — `joinVoice`, `leaveVoice`, speaking detection |
| `index.html` | All DOM elements — call UI, timer div, modal, voice controls |
| `config.js` | API keys — `liveblocksPublicKey`, `dailyDomain`, `dailyApiKey`, `dailyRoom` |
| `sw.js` | Service worker — shell caching, model cache-first |

---

## Task 1 — Clean call destruction after time limit

### What's broken now

`endCall()` in `main.js` disconnects Liveblocks and Daily.co but leaves the UI in a broken state:

- Create/Join buttons remain hidden (shareRow is still visible)
- URL still shows `?room=xyz`
- `_voiceInited` is reset but voice controls (`#voiceControls`) stay visible
- The user cannot start a new call without refreshing

### Files to read first

1. **`main.js`** lines ~282–290 — current `endCall()` implementation
2. **`main.js`** lines ~355–370 — `onCreateCall` (to understand what it shows/hides)
3. **`index.html`** — `#shareRow`, `#joinRow`, `#btnCreateCall`, `#btnJoinCall`, `#voiceControls`, `#shareRowModal`, `#joinRowModal`, `#btnCreateCallModal`, `#btnJoinCallModal`

### What to change

**`main.js` — `endCall()` function:** After stopping the timer and disconnecting, also:

```
- history.replaceState(null, '', location.pathname)   ← strip ?room= from URL
- hide  #shareRow, #shareRowModal
- show  #btnCreateCall, #btnJoinCall, #btnCreateCallModal, #btnJoinCallModal
- hide  #voiceControls   (set display: none)
- hide  #btnVoice, #btnMute   (reset voice button states)
- clear roomIdDisplay and roomIdDisplayModal text
```

All these elements are already `getElementById`-ed at the top of the Call UI block in `main.js`. Pull references for the ones not already stored (btnCreateCall, btnJoinCall, etc. — they are stored, just locally scoped inside the `{ }` block). Consider moving `endCall` inside that block so it can close over them, or extract the element references to module scope.

---

## Task 2 — Usernames visible below peer avatars

### Architecture decision

Before joining, each user enters a display name. The name is stored in Liveblocks presence alongside `position` and `speaking`. Each peer's name is rendered as a label below their sphere in the Three.js scene.

### Rendering approach — canvas sprite (no extra renderer needed)

`CSS2DRenderer` is not in `lib/three/` (only controls/helpers are local). Rather than pulling it from CDN, use a canvas-based `THREE.Sprite`:

1. Draw the name string onto a `<canvas>` element
2. Use the canvas as a `THREE.CanvasTexture` on a `THREE.SpriteMaterial`
3. Attach the sprite as a child of the peer's sphere mesh, offset downward (e.g. `y = -0.35`)
4. Update the sprite when the name changes (re-draw canvas, update texture)

This requires no additional imports.

### Files to read first

1. **`js/collab.js`** — `createPinMesh()`, `setupRoom()`, the `others` subscriber, `initialPresence`
2. **`index.html`** — find where to add the name prompt UI (before the Create/Join buttons, or as a pre-join modal)
3. **`main.js`** — `onCreateCall`, `onDoJoin` (where to intercept and ask for name before proceeding)

### What to change

#### `index.html`
Add a name input row above the Create/Join buttons (inside `.prompt-box`) and in the call modal:
```html
<input id="nameInput" placeholder="Your name" maxlength="20" />
```

#### `main.js`
- Before calling `onCreateCall` or `onDoJoin`, read `nameInput.value` and store it (e.g. `window._userName`)
- Pass the name into `activateRoom` or directly into `initCollab` / `tryJoinRoom`

#### `js/collab.js`
- Add `name` to `initialPresence`: `{ position: null, rotation: null, speaking: false, name: '' }`
- After entering the room, call `room.updatePresence({ name: window._userName })`
- In `createPinMesh`, also create and attach a name sprite (see below)
- In the `others` subscriber, update the name sprite when `other.presence.name` changes

#### Name sprite helper (add to `collab.js`)

```javascript
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
```

Attach to pin: `pin.add(makeNameSprite(other.presence.name))`.
Update on name change: replace the sprite child when the name presence field differs.

---

## Known Limitations

- **Daily.co room is fixed** (`brickrat` in config.js) — all sessions share one voice channel. Dynamic per-session rooms require a Cloudflare Worker proxy (planned).
- **Timer is per-client** — each user's 60-min clock starts from when they joined, not from when the creator created the room. A shared timer would require syncing via Liveblocks storage.
- **API keys are in config.js** — visible in source. Acceptable for demo; rotate Daily.co key if abused.
