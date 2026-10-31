"use client";

import { useRef, useState } from "react";
import { pickRecordingMimeType, vibrate } from "@/lib/audio";

/** Minimal push-to-talk: hold, speak, release → onAudio(blob). Used on the customer call tab. */
export function HoldToTalk({ onAudio, disabled }: { onAudio: (audio: Blob) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const released = useRef(false);

  async function start() {
    released.current = false;
    setError(null);
    const mimeType = pickRecordingMimeType();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) return setError("Mic nahi mila — neeche likhiye");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return setError("Mic ki permission nahi mili — neeche likhiye");
    }
    if (released.current) return stream.getTracks().forEach((t) => t.stop());
    chunks.current = [];
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      vibrate(10);
      if (Date.now() - startedAt.current < 500) return setError("Daba kar rakhiye aur boliye");
      onAudio(new Blob(chunks.current, { type: rec.mimeType || mimeType }));
    };
    recorder.current = rec;
    rec.start();
    startedAt.current = Date.now();
    vibrate(20);
    setRecording(true);
    window.setTimeout(() => rec.state === "recording" && rec.stop(), 30_000);
  }

  function stop() {
    released.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={recording}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          void start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        className={`h-24 w-24 touch-none select-none rounded-full text-lg font-bold text-white shadow-lg disabled:opacity-50 ${
          recording ? "scale-110 bg-red-600" : "bg-green-700"
        }`}
      >
        {recording ? "Bol rahe…" : "Boliye"}
      </button>
      <p className="text-sm text-neutral-600">Daba kar rakhiye aur boliye (Hold to speak)</p>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
