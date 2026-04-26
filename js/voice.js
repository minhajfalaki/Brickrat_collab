let callObject = null;
const audioElements = new Map(); // sessionId → <audio>

function attachAudio(participant) {
  if (participant.local) return;
  const track = participant.tracks?.audio?.persistentTrack;
  if (!track) return;

  const sid = participant.session_id;
  let audio = audioElements.get(sid);
  if (!audio) {
    audio = new Audio();
    audio.autoplay = true;
    audioElements.set(sid, audio);
  }
  const stream = new MediaStream([track]);
  if (audio.srcObject !== stream) {
    audio.srcObject = stream;
    audio.play().catch(e => console.warn('audio play blocked:', e));
  }
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

    btnVoice.disabled = true;
    btnVoice.textContent = 'Connecting…';
    micDenied.style.display = 'none';

    callObject = window.Daily.createCallObject();

    callObject.on('camera-error', (e) => {
      console.error('Daily camera-error:', e);
      micDenied.textContent = 'Mic access denied';
      micDenied.style.display = 'block';
      btnVoice.style.display = 'block';
      btnVoice.disabled = false;
      btnVoice.textContent = 'Join Voice';
      btnMute.style.display = 'none';
      callObject.destroy();
      callObject = null;
    });

    // Attach audio whenever a remote track becomes available
    callObject.on('track-started', (e) => {
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

    try {
      await callObject.join({
        url: `https://${domain}/${roomId}`,
        videoSource: false
      });

      // Attach any participants already in the room
      Object.values(callObject.participants()).forEach(attachAudio);

      btnVoice.style.display = 'none';
      btnMute.style.display  = 'block';
    } catch (e) {
      console.error('Daily join failed:', e);
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
