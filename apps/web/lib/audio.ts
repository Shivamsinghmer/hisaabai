// Browser audio helpers for the mic (F9).

/** First recording format this browser supports; Sarvam accepts all of them. */
export function pickRecordingMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

let current: HTMLAudioElement | null = null;

/** Plays a reply from the API (/media/tts/…); stops any reply already playing. */
export async function playReply(path: string): Promise<void> {
  current?.pause();
  // /media/* is proxied to the API by next.config.ts.
  current = new Audio(path);
  try {
    await current.play();
  } catch {
    // Autoplay blocked: the sheet shows a play button.
    throw new Error("autoplay-blocked");
  }
}

export function stopReply() {
  current?.pause();
  current = null;
}

export function vibrate(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
}
