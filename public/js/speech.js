const synth = globalThis.speechSynthesis ?? null;

export const isSupported = () => synth !== null;

let primed = false;

/**
 * iOS Safari silently drops speech that does not originate in a user gesture,
 * and ours arrives after two network round trips. Speaking a near-empty
 * utterance synchronously inside the tap unlocks the queue for later calls.
 * Must be called from the event handler itself, never after an await.
 */
export function primeSpeech() {
  if (!synth || primed) return;
  try {
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.volume = 0;
    synth.speak(unlock);
    primed = true;
  } catch (err) {
    console.warn("Could not prime speech synthesis", err);
  }
}

export function speak(text) {
  if (!synth || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  synth.speak(utterance);
}

export function stopSpeaking() {
  synth?.cancel();
}
