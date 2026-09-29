export type GameCue = 'select' | 'deal' | 'play' | 'turn' | 'win' | 'lose' | 'challenge' | 'spin' | 'trigger' | 'shot' | 'impact' | 'dry' | 'chip' | 'fold';

let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    audioContext ??= new Context();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    return audioContext;
  } catch { return null; }
}

function note(context: AudioContext, frequency: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.018, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function texture(context: AudioContext, start: number, duration: number, volume: number, cutoff: number, filterType: BiquadFilterType = 'lowpass') {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.6), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(cutoff, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(start);
  source.stop(start + duration + 0.01);
}

function metallicClick(context: AudioContext, start: number, strength = 1) {
  texture(context, start, 0.026, 0.026 * strength, 2600, 'highpass');
  note(context, 1460, start, 0.034, 0.023 * strength, 'triangle');
  note(context, 2280, start + 0.018, 0.045, 0.014 * strength, 'square');
}

function lowImpact(context: AudioContext, start: number, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(190, start);
  oscillator.frequency.exponentialRampToValueAtTime(48, start + 0.34);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.36);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.37);
}

export function playCue(cue: GameCue) {
  const context = getContext();
  if (!context) return;
  const now = context.currentTime + 0.005;
  try {
    switch (cue) {
      case 'select':
        texture(context, now, 0.038, 0.022, 2400);
        note(context, 720, now, 0.045, 0.012, 'triangle');
        break;
      case 'deal':
        texture(context, now, 0.12, 0.026, 3200);
        texture(context, now + 0.055, 0.10, 0.021, 2700);
        note(context, 240, now, 0.065, 0.018, 'triangle');
        note(context, 380, now + 0.045, 0.07, 0.016, 'triangle');
        break;
      case 'play':
        texture(context, now, 0.085, 0.045, 1400);
        note(context, 180, now, 0.10, 0.035, 'triangle');
        note(context, 290, now + 0.045, 0.09, 0.017, 'sine');
        break;
      case 'fold':
        texture(context, now, 0.10, 0.03, 3100);
        texture(context, now + 0.08, 0.06, 0.024, 1350);
        break;
      case 'chip':
        for (let i = 0; i < 3; i++) {
          metallicClick(context, now + i * 0.047, 0.56 - i * 0.1);
          note(context, 440 + i * 95, now + i * 0.047, 0.055, 0.018, 'triangle');
        }
        break;
      case 'turn':
        note(context, 660, now, 0.09, 0.025);
        note(context, 880, now + 0.095, 0.13, 0.026);
        break;
      case 'challenge':
        note(context, 220, now, 0.16, 0.04, 'sawtooth');
        note(context, 185, now + 0.17, 0.20, 0.035, 'sawtooth');
        break;
      case 'spin':
        for (let i = 0; i < 9; i++) {
          const tick = now + i * (0.052 + i * 0.004);
          texture(context, tick, 0.018, 0.019 + i * 0.001, 4300, 'highpass');
          note(context, 1120 + (i % 3) * 130, tick, 0.029, 0.019, 'triangle');
        }
        metallicClick(context, now + 0.72, 0.9);
        break;
      case 'trigger':
        metallicClick(context, now, 0.9);
        texture(context, now + 0.045, 0.09, 0.028, 950);
        note(context, 260, now + 0.037, 0.085, 0.039, 'triangle');
        metallicClick(context, now + 0.11, 0.58);
        break;
      case 'dry':
        metallicClick(context, now, 1.3);
        texture(context, now + 0.019, 0.065, 0.046, 2400, 'bandpass');
        note(context, 172, now + 0.018, 0.10, 0.054, 'triangle');
        metallicClick(context, now + 0.09, 0.32);
        break;
      case 'shot':
        texture(context, now, 0.052, 0.27, 7000, 'highpass');
        texture(context, now + 0.008, 0.19, 0.22, 1700, 'bandpass');
        texture(context, now + 0.035, 0.59, 0.12, 680);
        lowImpact(context, now, 0.24);
        note(context, 92, now + 0.018, 0.37, 0.11, 'sawtooth');
        texture(context, now + 0.28, 0.29, 0.025, 2300, 'bandpass');
        break;
      case 'impact':
        lowImpact(context, now, 0.18);
        texture(context, now, 0.095, 0.10, 540);
        texture(context, now + 0.036, 0.22, 0.045, 1450, 'bandpass');
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((frequency, i) => note(context, frequency, now + i * 0.105, 0.25, 0.028));
        break;
      case 'lose':
        [392, 330, 262].forEach((frequency, i) => note(context, frequency, now + i * 0.13, 0.21, 0.021, 'triangle'));
    }
  } catch { /* Audio can be unavailable until the browser receives a gesture. */ }
}
