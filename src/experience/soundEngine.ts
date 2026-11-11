// All sound is synthesised, so there are no audio files to load.
import { safeStorage } from "./device";
import { elementById } from "./experienceContext";

const MUTED_STORAGE_KEY = "aw-muted";

const midiToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

const CHORDS = [
  [50, 57, 62, 65, 69], // Dm9
  [46, 53, 58, 62, 69], // B♭maj7
  [41, 48, 53, 57, 64], // Fmaj7
  [48, 55, 60, 64, 67], // C(add9)
];
const BELL_SCALE = [62, 64, 65, 67, 69, 72, 74, 76, 77, 81];

interface ToneOptions {
  type?: OscillatorType;
  delay?: number;
  attack?: number;
  decay?: number;
  peak?: number;
  reverbSend?: number;
  glide?: number;
}

interface NoiseOptions {
  from?: number;
  to?: number;
  resonance?: number;
  peak?: number;
  reverbSend?: number;
}

function createReverbImpulse(audio: AudioContext, seconds: number) {
  const length = audio.sampleRate * seconds;
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++)
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  return buffer;
}

function applyEnvelope(
  gain: GainNode,
  time: number,
  attack: number,
  peak: number,
  decay: number,
) {
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
}

/** `music: false` keeps the ambient score off, for phones whose big screen already plays it. */
export function createSoundEngine({ music = true }: { music?: boolean } = {}) {
  let audio: AudioContext | null = null;
  let master: GainNode;
  let effectsBus: GainNode;
  let musicBus: GainNode;
  let reverb: ConvolverNode;
  let muted = safeStorage.get(MUTED_STORAGE_KEY) === "1";
  let musicTimer: ReturnType<typeof setInterval> | undefined;
  let chordIndex = 0;
  let nextChordAt = 0;
  let nextBellAt = 0;

  function init() {
    if (audio) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    audio = new AudioContextClass();
    master = audio.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 3;
    master.connect(compressor).connect(audio.destination);
    reverb = audio.createConvolver();
    reverb.buffer = createReverbImpulse(audio, 3.2);
    const reverbGain = audio.createGain();
    reverbGain.gain.value = 0.55;
    reverb.connect(reverbGain).connect(master);
    effectsBus = audio.createGain();
    effectsBus.gain.value = 0.8;
    effectsBus.connect(master);
    musicBus = audio.createGain();
    musicBus.gain.value = 0.0;
    musicBus.connect(master);
    if (music) {
      musicBus.gain.setTargetAtTime(0.32, audio.currentTime + 0.2, 2.5);
      startMusic(audio);
    }
  }

  function tone(
    frequency: number,
    {
      type = "sine",
      delay = 0,
      attack = 0.005,
      decay = 0.4,
      peak = 0.2,
      reverbSend = 0.3,
      glide = 0,
    }: ToneOptions,
  ) {
    if (!audio) return;
    const now = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (glide)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(30, frequency * glide),
        now + attack + decay,
      );
    applyEnvelope(gain, now, attack, peak, decay);
    oscillator.connect(gain);
    gain.connect(effectsBus);
    if (reverbSend) {
      const send = audio.createGain();
      send.gain.value = reverbSend;
      gain.connect(send).connect(reverb);
    }
    oscillator.start(now);
    oscillator.stop(now + attack + decay + 0.05);
  }

  function noise(
    duration: number,
    {
      from = 400,
      to = 2000,
      resonance = 1.2,
      peak = 0.15,
      reverbSend = 0.4,
    }: NoiseOptions,
  ) {
    if (!audio) return;
    const now = audio.currentTime;
    const length = Math.ceil(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + duration * 0.55);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, from * 0.6),
      now + duration,
    );
    const gain = audio.createGain();
    applyEnvelope(gain, now, duration * 0.35, peak, duration * 0.65);
    source.connect(filter).connect(gain).connect(effectsBus);
    const send = audio.createGain();
    send.gain.value = reverbSend;
    gain.connect(send).connect(reverb);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  function playPadChord(
    context: AudioContext,
    notes: number[],
    at: number,
    duration: number,
  ) {
    notes.forEach((note, k) => {
      [-6, 6].forEach((detune) => {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        oscillator.type = k === 0 ? "triangle" : "sawtooth";
        oscillator.frequency.value = midiToFrequency(note);
        oscillator.detune.value = detune;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(500, at);
        filter.frequency.linearRampToValueAtTime(1100, at + duration * 0.5);
        filter.frequency.linearRampToValueAtTime(600, at + duration);
        const peak = k === 0 ? 0.05 : 0.022;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(peak, at + 2.4);
        gain.gain.setValueAtTime(peak, at + duration - 2);
        gain.gain.linearRampToValueAtTime(0.0001, at + duration + 1.5);
        oscillator.connect(filter).connect(gain);
        gain.connect(musicBus);
        const send = context.createGain();
        send.gain.value = 0.6;
        gain.connect(send).connect(reverb);
        oscillator.start(at);
        oscillator.stop(at + duration + 1.6);
      });
    });
  }

  function playBell(context: AudioContext, note: number, at: number) {
    [1, 2.01, 3.02].forEach((harmonic, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = midiToFrequency(note) * harmonic;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(
        [0.05, 0.016, 0.008][i],
        at + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.6 - i * 0.6);
      oscillator.connect(gain);
      gain.connect(musicBus);
      const send = context.createGain();
      send.gain.value = 0.9;
      gain.connect(send).connect(reverb);
      oscillator.start(at);
      oscillator.stop(at + 2.7);
    });
  }

  function startMusic(context: AudioContext) {
    nextChordAt = context.currentTime + 0.3;
    nextBellAt = context.currentTime + 2;
    musicTimer = setInterval(() => {
      if (!audio || audio.state !== "running") return;
      const horizon = audio.currentTime + 0.6;
      while (nextChordAt < horizon) {
        playPadChord(audio, CHORDS[chordIndex % 4], nextChordAt, 8);
        chordIndex++;
        nextChordAt += 8;
      }
      while (nextBellAt < horizon) {
        playBell(
          audio,
          BELL_SCALE[Math.floor(Math.random() * BELL_SCALE.length)],
          nextBellAt,
        );
        nextBellAt += 1.2 + Math.random() * 2.4;
      }
    }, 250);
  }

  return {
    unlock() {
      init();
      if (audio && audio.state === "suspended") audio.resume();
    },
    get muted() {
      return muted;
    },
    setMuted(value: boolean) {
      muted = value;
      safeStorage.set(MUTED_STORAGE_KEY, value ? "1" : "0");
      if (audio && master)
        master.gain.setTargetAtTime(value ? 0 : 0.9, audio.currentTime, 0.08);
    },
    suspend() {
      if (audio && audio.state === "running") audio.suspend();
    },
    resume() {
      if (audio && audio.state === "suspended") audio.resume();
    },
    dispose() {
      clearInterval(musicTimer);
      if (audio) audio.close();
      audio = null;
    },
    hover() {
      tone(1568, { decay: 0.09, peak: 0.035, reverbSend: 0.15 });
      tone(2093, { delay: 0.03, decay: 0.08, peak: 0.02, reverbSend: 0.2 });
    },
    press() {
      [880, 1318.5, 1760].forEach((frequency, i) =>
        tone(frequency, {
          delay: i * 0.045,
          decay: 0.7,
          peak: 0.08 - i * 0.015,
          reverbSend: 0.45,
        }),
      );
      tone(110, { type: "triangle", decay: 0.25, peak: 0.12, reverbSend: 0 });
    },
    back() {
      [1174.7, 880].forEach((frequency, i) =>
        tone(frequency, {
          delay: i * 0.06,
          decay: 0.35,
          peak: 0.06,
          reverbSend: 0.35,
        }),
      );
    },
    whoosh() {
      noise(1.1, { from: 300, to: 2400, resonance: 0.9, peak: 0.12 });
    },
    ignite() {
      tone(220, {
        type: "sawtooth",
        attack: 0.02,
        decay: 0.9,
        peak: 0.05,
        glide: 4,
        reverbSend: 0.5,
      });
      [1318.5, 1975.5].forEach((frequency, i) =>
        tone(frequency, {
          delay: 0.15 + i * 0.07,
          decay: 1.2,
          peak: 0.05,
          reverbSend: 0.6,
        }),
      );
    },
    surge() {
      noise(1.6, { from: 120, to: 1800, resonance: 0.7, peak: 0.16 });
      tone(55, {
        type: "sine",
        attack: 0.05,
        decay: 1.4,
        peak: 0.25,
        reverbSend: 0.2,
      });
      [659.3, 987.8, 1318.5].forEach((frequency, i) =>
        tone(frequency, {
          delay: 0.2 + i * 0.08,
          decay: 1.6,
          peak: 0.05,
          reverbSend: 0.7,
        }),
      );
    },
    cast() {
      tone(1400, {
        type: "square",
        attack: 0.002,
        decay: 0.16,
        peak: 0.035,
        glide: 0.18,
        reverbSend: 0.2,
      });
      noise(0.22, {
        from: 2000,
        to: 5000,
        resonance: 2,
        peak: 0.07,
        reverbSend: 0.1,
      });
    },
    hit(combo: number) {
      const base = 1046.5 * Math.pow(2, Math.min(combo - 1, 7) / 12);
      [1, 1.5, 2.01, 2.99].forEach((harmonic, i) =>
        tone(base * harmonic, {
          delay: i * 0.012,
          decay: 0.9 - i * 0.15,
          peak: 0.06,
          reverbSend: 0.55,
        }),
      );
      tone(80, {
        type: "sine",
        decay: 0.25,
        peak: 0.25,
        glide: 0.5,
        reverbSend: 0,
      });
      noise(0.3, {
        from: 3000,
        to: 7000,
        resonance: 1,
        peak: 0.06,
        reverbSend: 0.3,
      });
    },
    miss() {
      noise(0.35, {
        from: 900,
        to: 300,
        resonance: 1.5,
        peak: 0.05,
        reverbSend: 0.3,
      });
    },
    tick(isHighNote: boolean) {
      tone(isHighNote ? 1760 : 1174.7, {
        decay: 0.12,
        peak: 0.06,
        reverbSend: 0.2,
      });
    },
    error() {
      tone(220, { type: "triangle", decay: 0.18, peak: 0.08, reverbSend: 0.1 });
      tone(207.7, {
        type: "triangle",
        delay: 0.1,
        decay: 0.22,
        peak: 0.08,
        reverbSend: 0.1,
      });
    },
  };
}

export type SoundEngine = ReturnType<typeof createSoundEngine>;

/** Flips mute (unlocking audio first, since this runs from a click or key press) and updates the button. */
export function toggleMute(sound: SoundEngine) {
  sound.unlock();
  sound.setMuted(!sound.muted);
  syncSoundButton(sound);
}

export function syncSoundButton(sound: SoundEngine) {
  const isOn = !sound.muted;
  const button = elementById("sound");
  button.setAttribute("aria-pressed", String(isOn));
  button.setAttribute("aria-label", isOn ? "Sound on" : "Sound off");
  elementById("sound-label").textContent = isOn ? "Sound" : "Muted";
  elementById("sound-icon").innerHTML = isOn
    ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'
    : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>';
}
