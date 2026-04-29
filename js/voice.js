import { setSpeaking } from './collab.js';

let callObject = null;
const audioElements = new Map(); // sessionId → <audio>
let unlockedAudio = null; // pre-created in gesture context to bypass autoplay policy

let _speaking = false;
let _speakingOnset = null;

function handleLocalAudioLevel(level) {
  if (level > 0.01) {
    if (!_speaking) {
      if (!_speakingOnset) {
        _speakingOnset = Date.now();
      } else if (Date.now() - _speakingOnset >= 200) {
        _speaking = true;
        setSpeaking(true);
        const el = document.getElementById('speakingIndicator');
        if (el) el.style.display = 'inline';
      }
    }
  } else {
    _speakingOnset = null;
    if (_speaking) {
      _speaking = false;
      setSpeaking(false);
      const el = document.getElementById('speakingIndicator');
      if (el) el.style.display = 'none';
    }
  }
}

function attachAudio(participant) {
  if (participant.local) return;
  const track = participant.tracks?.audio?.persistentTrack;
  if (!track || track.readyState !== 'live') return;

  const sid = participant.session_id;
  let audio = audioElements.get(sid);
  if (!audio) {
    // Reuse the pre-unlocked element for the first remote participant
    audio = unlockedAudio || new Audio();
    unlockedAudio = null;
    audio.autoplay = true;
    audioElements.set(sid, audio);
  }
  const stream = new MediaStream([track]);
  if (audio.srcObject?.getTracks()[0] === track) return; // already attached
  audio.srcObject = stream;
  audio.play().catch(() => {});
}

export async function joinVoice() {
  const domain  = window.CONFIG?.dailyDomain;
  const roomId  = window.CONFIG?.dailyRoom;
  const apiKey  = window.CONFIG?.dailyApiKey;

  const btnVoice  = document.getElementById('btnVoice');
  const btnMute   = document.getElementById('btnMute');
  const micDenied = document.getElementById('micDenied');

  if (!domain || !roomId || callObject) return;

  if (!window.Daily) {
    if (micDenied) { micDenied.textContent = 'Voice SDK failed to load'; micDenied.style.display = 'block'; }
    return;
  }

  // Create the Daily.co room via REST API before joining.
  // 200 = created, 409 = already exists — both are fine.
  if (apiKey) {
    try {
      await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomId })
      });
    } catch (e) {
      console.warn('[voice] room pre-create failed:', e);
    }
  }

  // Pre-create and unlock audio element inside the gesture — required on Android/iOS
  unlockedAudio = new Audio();
  unlockedAudio.autoplay = true;
  unlockedAudio.play().catch(() => {});

  if (btnVoice) { btnVoice.disabled = true; btnVoice.textContent = 'Connecting…'; }
  if (micDenied) micDenied.style.display = 'none';

  callObject = window.Daily.createCallObject();

  callObject.on('participant-joined',  (e) => attachAudio(e.participant));
  callObject.on('track-started',       (e) => { if (!e.participant.local && e.track.kind === 'audio') attachAudio(e.participant); });
  callObject.on('participant-updated', (e) => { if (!e.participant.local) attachAudio(e.participant); });
  callObject.on('local-audio-level',   (e) => handleLocalAudioLevel(e.audioLevel ?? 0));

  callObject.on('participant-left', (e) => {
    const audio = audioElements.get(e.participant.session_id);
    if (audio) { audio.srcObject = null; audioElements.delete(e.participant.session_id); }
  });

  callObject.on('camera-error', () => {
    if (micDenied) { micDenied.textContent = 'Mic access denied'; micDenied.style.display = 'block'; }
    if (btnVoice)  { btnVoice.style.display = 'block'; btnVoice.disabled = false; btnVoice.textContent = 'Join Voice'; }
    if (btnMute)   btnMute.style.display = 'none';
    handleLocalAudioLevel(0);
    callObject.destroy();
    callObject = null;
  });

  try {
    await callObject.join({ url: `https://${domain}/${roomId}`, videoSource: false });
    Object.values(callObject.participants()).forEach(attachAudio);
    callObject.startLocalAudioLevelObserver(100);
    if (btnVoice) btnVoice.style.display = 'none';
    if (btnMute)  btnMute.style.display  = 'block';
  } catch (e) {
    console.error('[voice] join failed:', e);
    if (micDenied) { micDenied.textContent = e.message || 'Failed to join voice'; micDenied.style.display = 'block'; }
    if (btnVoice)  { btnVoice.disabled = false; btnVoice.textContent = 'Join Voice'; }
    if (callObject) { callObject.destroy(); callObject = null; }
  }
}

export function leaveVoice() {
  if (!callObject) return;
  callObject.destroy();
  callObject = null;
  audioElements.forEach(a => { a.srcObject = null; });
  audioElements.clear();
  handleLocalAudioLevel(0);

  const btnVoice  = document.getElementById('btnVoice');
  const btnMute   = document.getElementById('btnMute');
  if (btnVoice) { btnVoice.style.display = 'block'; btnVoice.disabled = false; btnVoice.textContent = 'Join Voice'; }
  if (btnMute)  { btnMute.style.display = 'none'; btnMute.classList.remove('muted'); btnMute.textContent = 'Mute'; }
}

export function initVoice() {
  const domain = window.CONFIG?.dailyDomain;
  if (!domain) return;

  const voiceControls = document.getElementById('voiceControls');
  const btnVoice      = document.getElementById('btnVoice');
  const btnMute       = document.getElementById('btnMute');

  if (!btnVoice) return;
  if (voiceControls) voiceControls.style.display = 'flex';

  btnVoice.addEventListener('click', () => joinVoice());

  btnMute.addEventListener('click', () => {
    if (!callObject) return;
    const nowMuted = btnMute.classList.toggle('muted');
    callObject.setLocalAudio(!nowMuted);
    btnMute.textContent = nowMuted ? 'Unmute' : 'Mute';
  });

  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyV') return;
    if (callObject) { btnMute.click(); } else { joinVoice(); }
  });
}
