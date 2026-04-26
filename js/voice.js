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
    if (!roomId || !window.Daily) return;

    btnVoice.disabled = true;
    btnVoice.textContent = 'Connecting…';
    micDenied.style.display = 'none';

    callObject = window.Daily.createCallObject();

    callObject.on('camera-error', () => {
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
      btnVoice.disabled = false;
      btnVoice.textContent = 'Join Voice';
      if (/permission|denied/i.test(e.message || '')) {
        micDenied.style.display = 'block';
      }
      if (callObject) { callObject.destroy(); callObject = null; }
    }
  });

  btnMute.addEventListener('click', () => {
    if (!callObject) return;
    const nowMuted = btnMute.classList.toggle('muted');
    callObject.setLocalAudio(!nowMuted);
    btnMute.textContent = nowMuted ? 'Unmute' : 'Mute';
  });
}
