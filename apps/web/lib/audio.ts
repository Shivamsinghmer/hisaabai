// Browser audio helpers for the mic (F9).

/** First recording format this browser supports; Sarvam accepts all of them. */
export function pickRecordingMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let current: HTMLAudioElement | null = null;

/** Plays a reply from the API (/media/tts/…); stops any reply already playing. */
export async function playReply(path: string): Promise<void> {
  current?.pause();
  current = new Audio(path.startsWith("http") ? path : `${API_URL}${path}`);
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
