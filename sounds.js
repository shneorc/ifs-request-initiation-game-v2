/* =============================================================================
 * sounds.js — tiny Web Audio synth. No audio files, no dependencies.
 * All sounds are generated in-browser, so it stays a pure static site.
 * Exposes window.SFX with named effects + a mute toggle.
 * AudioContext is created lazily on the first user gesture (autoplay policy).
 * ========================================================================== */

(() => {
  "use strict";

  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }

  // primitive: one oscillator note with an ADSR-ish envelope
  function tone(freq, start, dur, type = "sine", peak = 0.6, glideTo = null) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // short filtered noise burst (for whoosh / thunk / engine texture)
  function noise(start, dur, freq = 800, q = 1, peak = 0.4, type = "bandpass") {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SFX = {
    get muted() { return muted; },

    unlock() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
    },
    toggleMute() {
      ensure();
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },

    click() { ensure(); if (muted) return; tone(420, 0, 0.06, "square", 0.25); },

    hover() { ensure(); if (muted) return; tone(680, 0, 0.03, "sine", 0.08); },

    correct() {
      ensure(); if (muted) return;
      tone(523.25, 0.00, 0.12, "triangle", 0.5);  // C5
      tone(659.25, 0.10, 0.12, "triangle", 0.5);  // E5
      tone(783.99, 0.20, 0.22, "triangle", 0.55); // G5
    },

    wrong() {
      ensure(); if (muted) return;
      tone(200, 0.0, 0.22, "sawtooth", 0.35, 90);
      noise(0.0, 0.18, 300, 0.7, 0.15, "lowpass");
    },

    load() { // box slides + thunk
      ensure(); if (muted) return;
      noise(0.0, 0.16, 1200, 0.8, 0.25, "bandpass"); // slide
      tone(140, 0.14, 0.10, "sine", 0.5);            // thunk
    },

    trophy() {
      ensure(); if (muted) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, i * 0.09, 0.18, "triangle", 0.5));
    },

    complete() { // fanfare
      ensure(); if (muted) return;
      const seq = [
        [523.25, 0.00], [523.25, 0.12], [523.25, 0.24],
        [659.25, 0.36], [783.99, 0.54], [1046.5, 0.72]
      ];
      seq.forEach(([f, t]) => tone(f, t, 0.24, "triangle", 0.5));
      noise(0.72, 0.5, 2500, 0.5, 0.12, "highpass"); // sparkle
    },

    // engine loop for the driving transition; returns a stop() function
    engineStart() {
      ensure(); if (!ctx || muted) return () => {};
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth"; sub.type = "square";
      osc.frequency.setValueAtTime(70, t0);
      sub.frequency.setValueAtTime(46, t0);
      osc.frequency.linearRampToValueAtTime(150, t0 + 0.5); // rev up
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.08);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 500;
      osc.connect(g); sub.connect(g); g.connect(lp).connect(master);
      osc.start(t0); sub.start(t0);
      return () => {
        const te = ctx.currentTime;
        osc.frequency.linearRampToValueAtTime(80, te + 0.25); // rev down
        g.gain.exponentialRampToValueAtTime(0.0001, te + 0.3);
        osc.stop(te + 0.34); sub.stop(te + 0.34);
      };
    }
  };

  window.SFX = SFX;
})();
