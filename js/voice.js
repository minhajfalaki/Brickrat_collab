let callObject = null;
const audioElements = new Map(); // sessionId → <audio>

// Called immediately on tap to unblock audio on iOS (must be in gesture context)
function primeAudioContext() {
  const a = new Audio();
  a.play().catch(() => {});
}

function attachAudio(participant) {
  if (participant.local) return;
  const track = participant.tracks?.audio?.persistentTrack;
  const sid   = participant.session_id;
  console.log('[voice] attachAudio', sid, 'track:', track?.readyState, 'enabled:', track?.enabled);
  if (!track) return;

  let audio = audioElements.get(sid);
  if (!audio) {
    audio = new Audio();
    audio.autoplay = true;
    audioElements.set(sid, audio);
  }
  audio.srcObject = new MediaStream([track]);
  audio.play()
    .then(() => console.log('[voice] audio playing for', sid))
    .catch(e => console.warn('[voice] audio.play() blocked:', e));
}

export function initVoice() {
  const domain = window.CONFIG?.dailyDomain;
  if (!domain) return;

  const voiceControls = document.getElementById('voiceControls');
  const btnVoice      = document.getElementById('btnVoice');
  const btnMute       = document.getElementById('btnMute');
  const micDenied     = document.getElementById('micDenied');

  if (!btnVoice) return;
  if (voiceControls) voiceControls.style.display = 'flex';

  btnVoice.addEventListener('click', async () => {
    const roomId = window.CONFIG?.dailyRoom;

    if (!window.Daily) {
      micDenied.textContent = 'Voice SDK failed to load';
      micDenied.style.display = 'block';
      return;
    }
    if (!roomId) return;

    primeAudioContext(); // unblock audio on iOS — must be first thing in tap handler

    btnVoice.disabled = true;
    btnVoice.textContent = 'Connecting…';
    micDenied.style.display = 'none';

    callObject = window.Daily.createCallObject();

    callObject.on('joined-meeting', (e) => {
      console.log('[voice] joined-meeting', e);
    });

    callObject.on('participant-joined', (e) => {
      console.log('[voice] participant-joined', e.participant.session_id, e.participant);
      attachAudio(e.participant);
    });

    callObject.on('track-started', (e) => {
      console.log('[voice] track-started kind:', e.track.kind, 'local:', e.participant.local, 'state:', e.track.readyState);
      if (e.track.kind === 'audio' && !e.participant.local) {
        attachAudio(e.participant);
      }
    });

    callObject.on('participant-updated', (e) => {
      if (!e.participant.local) attachAudio(e.participant);
    });

    callObject.on('participant-left', (e) => {
      const audio = audioElements.get(e.participant.session_id);
      if (audio) { audio.srcObject = null; audioElements.delete(e.participant.session_id); }
    });

    callObject.on('camera-error', (e) => {
      console.error('[voice] camera-error', e);
      micDenied.textContent = 'Mic access denied';
      micDenied.style.display = 'block';
      btnVoice.style.display = 'block';
      btnVoice.disabled = false;
      btnVoice.textContent = 'Join Voice';
      btnMute.style.display = 'none';
      callObject.destroy();
      callObject = null;
    });

    callObject.on('error', (e) => console.error('[voice] error', e));

    try {
      await callObject.join({
        url: `https://${domain}/${roomId}`,
        videoSource: false
      });
      console.log('[voice] joined, participants:', callObject.participants());
      Object.values(callObject.participants()).forEach(attachAudio);

      btnVoice.style.display = 'none';
      btnMute.style.display  = 'block';
    } catch (e) {
      console.error('[voice] join failed:', e);
      micDenied.textContent = e.message || 'Failed to join voice';
      micDenied.style.display = 'block';
      btnVoice.disabled = false;
      btnVoice.textContent = 'Join Voice';
      if (callObject) { callObject.destroy(); callObject = null; }
    }
  });

  btnMute.addEventListener('click', () => {
    if (!callObject) return;
    const nowMuted = btnMute.classList.toggle('muted');
    callObject.setLocalAudio(!nowMuted);
    btnMute.textContent = nowMuted ? 'Unmute' : 'Mute';
  });

  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyV') return;
    if (callObject) {
      btnMute.click();
    } else {
      btnVoice.click();
    }
  });
}
