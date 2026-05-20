// ─────────────────────────────────────────────────────────
// soma-audio.js
// Soma OS · Imperio Contenido · interaction beep system
//
// Square-wave beeps with exponential decay envelope, generated
// via Web Audio API. Framework-agnostic — works in any JS app.
//
// Why Web Audio (vs <audio>+wav files):
//   - Zero file size (no assets to bundle/load)
//   - Zero latency (no buffering, no decode)
//   - Cannot be blocked by autoplay policies AS LONG AS the first
//     beep() call happens inside a user-gesture handler (click/key).
//
// If you prefer pre-generated WAV files for any reason, use the
// SomaAudioFiles variant at the bottom of this file instead.
// ─────────────────────────────────────────────────────────

const SomaAudio = (() => {
  let ctx = null;
  let muted = false;

  // Resolve / create the AudioContext lazily, only after a user gesture.
  // Browsers block AudioContext creation before the first interaction.
  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Some browsers leave it suspended until resumed.
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Play a single beep.
  //   freq  — frequency in Hz
  //   dur   — duration in seconds (default 0.05)
  //   peak  — peak gain (default 0.07, very soft)
  function beep(freq = 880, dur = 0.05, peak = 0.07) {
    if (muted) return;
    const ac = ensureCtx();
    if (!ac) return;

    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'square';
    o.frequency.value = freq;

    const t0 = ac.currentTime;
    // Exponential ramp: silent → peak → silent (40-80ms typical)
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur);
  }

  // ─── Semantic shortcuts ───────────────────────────────
  // Use these names everywhere in app code — never raw frequencies.
  // Keeps the audio language consistent across the whole product.

  // 660Hz · 40ms — light tap (row select, filter chip, sort chip)
  const tap    = () => beep(660, 0.04);
  // 720Hz · 40ms — toggle / setting change (tweaks panel, sequence picker)
  const toggle = () => beep(720, 0.04);
  // 880Hz · 50ms — generic ambient pulse / notification
  const pulse  = () => beep(880, 0.05);
  // 990Hz · 50ms — focus (cmd-K capture bar focus)
  const focus  = () => beep(990, 0.05);
  // 1200Hz · 80ms — commit (decision sent, capture submitted)
  const send   = () => beep(1200, 0.08);

  // Mute control. Persist to localStorage so it survives reload.
  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('soma.audio.muted', muted ? '1' : '0'); } catch (e) {}
  }
  function isMuted() { return muted; }

  // Initialize muted state from storage on first import.
  try { muted = localStorage.getItem('soma.audio.muted') === '1'; } catch (e) {}

  return { beep, tap, toggle, pulse, focus, send, setMuted, isMuted };
})();

// ─────────────────────────────────────────────────────────
// USAGE (React-style example, but works in any framework)
// ─────────────────────────────────────────────────────────
//
//   import { SomaAudio } from './soma-audio';
//
//   <button onClick={() => { decideEnroll(id); SomaAudio.send(); }}>
//     Enrolar
//   </button>
//
//   <NotificationRow onClick={() => { select(id); SomaAudio.tap(); }} />
//
//   <Toggle onChange={(v) => { setX(v); SomaAudio.toggle(); }} />
//
//   // Mute toggle (Tweaks panel)
//   <button onClick={() => SomaAudio.setMuted(!SomaAudio.isMuted())}>
//     {SomaAudio.isMuted() ? 'Mute' : 'Beeps'}
//   </button>
//
// ─────────────────────────────────────────────────────────

// Export. Adjust syntax for your build system.
export default SomaAudio;
export { SomaAudio };
