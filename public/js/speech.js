const synth = globalThis.speechSynthesis ?? null;

export const isSupported = () => synth !== null;

export function speak(text) {
  if (!synth || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  synth.speak(utterance);
}

/** Speaks a route as one queued run so steps do not overlap. */
export function speakRoute({ summary, steps = [] }) {
  if (!synth) return;
  synth.cancel();
  [summary, ...steps].filter(Boolean).forEach(speak);
}

export function stopSpeaking() {
  synth?.cancel();
}
