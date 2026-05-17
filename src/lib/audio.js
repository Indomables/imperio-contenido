/**
 * Beeps de UI estilo SOMA OS — square wave corto.
 * Solo suenan si `body.classList.contains("audio-on")`.
 */

let audioCtx = null;

export function beep(freq = 880, dur = 0.05) {
  if (typeof document === "undefined") return;
  if (!document.body.classList.contains("audio-on")) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.07, audioCtx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {
    // silencio: audio no disponible
  }
}
