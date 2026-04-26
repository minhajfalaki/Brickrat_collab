let callObject = null;

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
      console.error('Daily.co SDK not available — check CDN script in index.html');
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

    try {
      await callObject.join({
        url: `https://${domain}/${roomId}`,
        videoSource: false
      });
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
