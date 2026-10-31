"use client";

import type { VoiceCommandResponse } from "@hisaab/shared";
import { useEffect, useRef, useState } from "react";
import { sendVoiceAudio, sendVoiceText, type VoiceResult } from "@/app/voice-actions";
import { pickRecordingMimeType, playReply, stopReply, vibrate } from "@/lib/audio";
import { t } from "@/lib/strings";

// F9 MicButton: push-to-talk, live waveform, 30 s cap, slide left to cancel.
// Works from any screen; the API routes the utterance by intent.

const MAX_MS = 30_000;
const MIN_MS = 500;
const CANCEL_PX = 80;

type Phase =
  | { kind: "idle" }
  | { kind: "recording"; cancelling: boolean }
  | { kind: "thinking" }
  | { kind: "result"; data: VoiceCommandResponse; needsTap: boolean }
  | { kind: "message"; text: readonly [string, string]; typing: boolean };

export function MicButton() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const startX = useRef(0);
  const cancelled = useRef(false);
  const released = useRef(false);
  const timers = useRef<{ cap?: number; tick?: number; raf?: number }>({});
  const audioCtx = useRef<AudioContext | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    window.clearTimeout(timers.current.cap);
    window.clearInterval(timers.current.tick);
    if (timers.current.raf) cancelAnimationFrame(timers.current.raf);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioCtx.current?.close();
    audioCtx.current = null;
  }

  async function start(clientX: number) {
    if (phase.kind === "recording" || phase.kind === "thinking") return;
    stopReply();
    cancelled.current = false;
    released.current = false;
    startX.current = clientX;
    chunks.current = [];

    const mimeType = pickRecordingMimeType();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) {
      setPhase({ kind: "message", text: t.voice.noMic, typing: true });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setPhase({ kind: "message", text: t.voice.noMic, typing: true });
      return;
    }
    // Let go while the permission prompt was open: treat as a tap.
    if (released.current) {
      cleanup();
      setPhase({ kind: "message", text: t.voice.tooShort, typing: false });
      return;
    }

    const rec = new MediaRecorder(stream.current, { mimeType });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => void finish(rec.mimeType || mimeType);
    recorder.current = rec;
    rec.start();
    startedAt.current = Date.now();
    vibrate(20);
    setSeconds(0);
    setPhase({ kind: "recording", cancelling: false });
    timers.current.tick = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
      250,
    );
    timers.current.cap = window.setTimeout(() => stop(), MAX_MS);
    drawWaveform(stream.current);
  }

  function stop() {
    released.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function move(clientX: number) {
    if (phase.kind !== "recording") return;
    const cancelling = startX.current - clientX > CANCEL_PX;
    if (cancelling !== cancelled.current) {
      cancelled.current = cancelling;
      setPhase({ kind: "recording", cancelling });
    }
  }

  async function finish(mimeType: string) {
    const duration = Date.now() - startedAt.current;
    cleanup();
    vibrate(10);
    if (cancelled.current) return setPhase({ kind: "idle" });
    if (duration < MIN_MS) return setPhase({ kind: "message", text: t.voice.tooShort, typing: false });

    setPhase({ kind: "thinking" });
    const form = new FormData();
    form.append("audio", new Blob(chunks.current, { type: mimeType }));
    show(await sendVoiceAudio(form));
  }

  async function submitText(text: string) {
    setPhase({ kind: "thinking" });
    show(await sendVoiceText(text));
  }

  async function show(result: VoiceResult) {
    if (!result.ok) return setPhase({ kind: "message", text: [result.error, ""], typing: true });
    let needsTap = false;
    if (result.data.replyAudioUrl) {
      try {
        await playReply(result.data.replyAudioUrl);
      } catch {
        needsTap = true;
      }
    }
    setPhase({ kind: "result", data: result.data, needsTap });
  }

  function drawWaveform(media: MediaStream) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtx.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(media).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const bars = 28;
    const loop = () => {
      const el = canvas.current;
      const g = el?.getContext("2d");
      if (el && g) {
        analyser.getByteTimeDomainData(samples);
        g.clearRect(0, 0, el.width, el.height);
        g.fillStyle = cancelled.current ? "#b91c1c" : "#171717";
        const step = Math.floor(samples.length / bars);
        for (let i = 0; i < bars; i++) {
          let peak = 0;
          for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(samples[i * step + j]! - 128));
          const h = Math.max(3, (peak / 128) * el.height);
          g.fillRect(i * (el.width / bars) + 2, (el.height - h) / 2, el.width / bars - 4, h);
        }
      }
      timers.current.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  const recording = phase.kind === "recording";
  const busy = phase.kind === "thinking";

  return (
    <>
      {phase.kind !== "idle" && (
        <VoiceSheet
          phase={phase}
          seconds={seconds}
          canvasRef={canvas}
          onClose={() => {
            stopReply();
            setPhase({ kind: "idle" });
          }}
          onType={() => setPhase({ kind: "message", text: t.voice.typeInstead, typing: true })}
          onSubmitText={submitText}
        />
      )}
      <button
        type="button"
        aria-label={`${t.voice.holdToSpeak[0]} (${t.voice.holdToSpeak[1]})`}
        aria-pressed={recording}
        disabled={busy}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          void start(e.clientX);
        }}
        onPointerMove={(e) => move(e.clientX)}
        onPointerUp={stop}
        onPointerCancel={() => {
          cancelled.current = true;
          stop();
        }}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat && !recording) {
            e.preventDefault();
            void start(0);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") stop();
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`-mt-8 flex h-20 w-20 touch-none select-none items-center justify-center rounded-full text-white shadow-lg transition-transform disabled:opacity-60 ${
          recording ? (phase.cancelling ? "scale-110 bg-red-700" : "scale-110 bg-red-600") : "bg-neutral-900"
        }`}
      >
        <MicIcon />
      </button>
    </>
  );
}

function VoiceSheet({
  phase,
  seconds,
  canvasRef,
  onClose,
  onType,
  onSubmitText,
}: {
  phase: Exclude<Phase, { kind: "idle" }>;
  seconds: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
  onType: () => void;
  onSubmitText: (text: string) => void;
}) {
  return (
    <section
      role="dialog"
      aria-live="polite"
      aria-label="Voice"
      className="fixed inset-x-0 bottom-24 z-10 mx-auto max-w-md px-3"
    >
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl">
        {phase.kind === "recording" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-lg font-semibold">
              {t.voice.listening[0]}{" "}
              <span className="tabular-nums">0:{String(seconds).padStart(2, "0")}</span>
            </p>
            <canvas ref={canvasRef} width={280} height={48} className="h-12 w-full max-w-xs" aria-hidden />
            <p className={`text-sm ${phase.cancelling ? "font-semibold text-red-700" : "text-neutral-600"}`}>
              {phase.cancelling ? t.voice.releaseToCancel[0] : t.voice.slideToCancel[0]}
            </p>
          </div>
        )}

        {phase.kind === "thinking" && (
          <p className="text-center text-lg font-semibold">{t.voice.thinking[0]}</p>
        )}

        {phase.kind === "result" && (
          <div className="flex flex-col gap-3">
            {phase.data.transcript && (
              <p className="text-neutral-700">
                <span className="text-sm text-neutral-500">{t.voice.youSaid[0]}: </span>“
                {phase.data.transcript}”
              </p>
            )}
            <p className="text-xl font-semibold">{phase.data.replyText}</p>
            {phase.data.intent && phase.data.intent !== "other" && (
              <p className="w-fit rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
                {phase.data.intent}
              </p>
            )}
            {!phase.data.understood && <TypeBox onSubmit={onSubmitText} />}
            <div className="flex gap-2">
              {phase.data.replyAudioUrl && (
                <button
                  type="button"
                  className={`min-h-12 flex-1 rounded-lg px-3 font-semibold ${
                    phase.needsTap ? "bg-neutral-900 text-white" : "border-2 border-neutral-900"
                  }`}
                  onClick={() => void playReply(phase.data.replyAudioUrl!).catch(() => {})}
                >
                  {t.voice.playAgain[0]}
                </button>
              )}
              {phase.data.understood && (
                <button
                  type="button"
                  className="min-h-12 rounded-lg border-2 border-neutral-300 px-3"
                  onClick={onType}
                >
                  {t.voice.typeInstead[0]}
                </button>
              )}
              <button
                type="button"
                className="min-h-12 rounded-lg border-2 border-neutral-300 px-3"
                onClick={onClose}
              >
                {t.voice.close[0]}
              </button>
            </div>
          </div>
        )}

        {phase.kind === "message" && (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-semibold">
              {phase.text[0]}
              {phase.text[1] && (
                <span className="block text-sm font-normal text-neutral-600">{phase.text[1]}</span>
              )}
            </p>
            {phase.typing && <TypeBox onSubmit={onSubmitText} />}
            <button
              type="button"
              className="min-h-12 rounded-lg border-2 border-neutral-300 px-3"
              onClick={onClose}
            >
              {t.voice.close[0]}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function TypeBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        autoFocus
        aria-label={t.voice.typeInstead[1]}
        placeholder="Gupta ji, 120 udhaar"
        className="min-h-12 flex-1 rounded-lg border-2 border-neutral-300 px-3 text-lg focus:border-neutral-900"
      />
      <button type="submit" className="min-h-12 rounded-lg bg-neutral-900 px-4 font-semibold text-white">
        {t.voice.send[0]}
      </button>
    </form>
  );
}

function MicIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" strokeLinecap="round" />
    </svg>
  );
}
