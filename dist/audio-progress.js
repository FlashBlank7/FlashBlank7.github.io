const formatTime = seconds => Number.isFinite(seconds)
  ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0')
  : '0:00';

export function createAudioProgress(audio, getElements) {
  let interacting = false;
  let selectedTime = null;

  function duration() {
    return !audio.error && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration : 0;
  }

  function sync() {
    const { scrub, elapsed, total } = getElements();
    if (!scrub) return;
    const length = duration();
    const position = interacting && selectedTime !== null
      ? selectedTime : Math.max(0, audio.currentTime || 0);
    scrub.max = '1000';
    scrub.disabled = !length;
    if (!interacting) scrub.value = String(length ? Math.min(1000, position / length * 1000) : 0);
    elapsed.textContent = formatTime(position);
    total.textContent = formatTime(length);
    scrub.setAttribute('aria-valuetext', `${formatTime(position)} / ${formatTime(length)}`);
  }

  function seek(scrub) {
    const length = duration();
    if (!length) return;
    selectedTime = Math.max(0, Math.min(length, Number(scrub.value) / 1000 * length));
    audio.currentTime = selectedTime;
    sync();
  }

  function release(scrub) {
    if (selectedTime !== null) seek(scrub);
    interacting = false;
    selectedTime = null;
    sync();
  }

  function attach() {
    const { scrub } = getElements();
    if (!scrub) return;
    interacting = false;
    selectedTime = null;
    scrub.addEventListener('pointerdown', () => { interacting = true; });
    scrub.addEventListener('input', () => { interacting = true; seek(scrub); });
    scrub.addEventListener('change', () => release(scrub));
    scrub.addEventListener('pointerup', () => release(scrub));
    scrub.addEventListener('pointercancel', () => release(scrub));
    scrub.addEventListener('keyup', () => release(scrub));
    scrub.addEventListener('blur', () => release(scrub));
    sync();
    // Opening the panel must make a paused, never-played track seekable too.
    audio.preload = 'metadata';
    if ((audio.currentSrc || audio.getAttribute?.('src')) && audio.readyState === 0 && audio.networkState !== 2) audio.load();
  }

  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeking', 'seeked', 'pause', 'ended', 'error']) {
    audio.addEventListener(event, sync);
  }
  audio.addEventListener('emptied', () => {
    interacting = false;
    selectedTime = null;
    sync();
  });
  return { attach, sync };
}
