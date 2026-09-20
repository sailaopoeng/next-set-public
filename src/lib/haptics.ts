type HapticWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;

function getHapticWindow() {
  return typeof window === "undefined" ? null : (window as HapticWindow);
}

function vibrate(pattern: number | number[]) {
  try {
    getHapticWindow()?.navigator.vibrate?.(pattern);
  } catch {
    // Vibration is unavailable on iOS Safari and some desktop browsers.
  }
}

function ensureAudio() {
  const hapticWindow = getHapticWindow();
  if (!hapticWindow) return null;

  const Context = hapticWindow.AudioContext ?? hapticWindow.webkitAudioContext;
  if (!Context) return null;

  if (!audioContext) {
    audioContext = new Context();
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

function playBeep(frequency: number, durationSeconds: number) {
  const context = ensureAudio();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.07;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    context.currentTime + durationSeconds,
  );
  oscillator.stop(context.currentTime + durationSeconds);
}

export function primeHaptics() {
  vibrate(1);
  ensureAudio();
}

export function notifySetComplete() {
  primeHaptics();
  vibrate(24);
  playBeep(660, 0.1);
}

export function notifyRestComplete() {
  vibrate([180, 70, 180, 70, 280]);
  playBeep(880, 0.16);
  getHapticWindow()?.setTimeout(() => playBeep(1174, 0.2), 160);
}
