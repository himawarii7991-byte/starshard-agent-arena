// All sound is synthesised with WebAudio: no audio files, no network.
// The context is created on the first user gesture, so autoplay rules
// never block the game. M toggles mute.

export function makeAudio() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // A minor-key bass line under a soft pad, one note per beat.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const ac = ensure();
    if (!ac || muted) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    const ac = ensure();
    if (!ac || muted) return;
    const t0 = ac.currentTime;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start(t0);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone(720 + Math.random() * 120, 0.07, 'square', 0.05, 320);
    },
    hit() {
      tone(180, 0.06, 'triangle', 0.09, 90);
    },
    explode() {
      noise(0.28, 0.22, 900);
      tone(140, 0.25, 'sawtooth', 0.1, 40);
    },
    nova() {
      noise(0.5, 0.3, 500);
      tone(90, 0.5, 'sawtooth', 0.16, 30);
      tone(660, 0.18, 'sine', 0.08, 990);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.09);
      setTimeout(() => tone(1318, 0.12, 'sine', 0.09), 60);
    },
    hurt() {
      tone(220, 0.18, 'sawtooth', 0.14, 70);
      noise(0.12, 0.12, 600);
    },
    levelup() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 70));
    },
    waveClear() {
      [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.09), i * 80));
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.11), i * 160));
    },
    victory() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.11), i * 110));
    },
    startMusic() {
      if (musicTimer || !ensure()) return;
      musicTimer = setInterval(() => {
        if (muted) return;
        const f = BASS[musicStep % BASS.length];
        tone(f, 0.42, 'triangle', 0.05);
        if (musicStep % 2 === 0) tone(f * 2, 0.5, 'sine', 0.025);
        musicStep++;
      }, 460);
    },
    stopMusic() {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
    },
  };
}
