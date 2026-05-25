import { useRef, useState, useCallback } from "react";

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
];

function pickMimeType(): { mimeType?: string; format: string } {
  if (typeof MediaRecorder === "undefined") return { format: "webm" };
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) {
      const format =
        m.startsWith("audio/webm") ? "webm" :
        m.startsWith("audio/mp4") ? "mp4" :
        m.startsWith("audio/aac") ? "m4a" :
        m.startsWith("audio/ogg") ? "ogg" : "webm";
      return { mimeType: m, format };
    }
  }
  return { format: "webm" };
}

export type RecordingState = "idle" | "recording" | "transcribing";

interface UseVoiceRecordOptions {
  onTranscript: (text: string) => void;
  onError?: (err: { kind: "permission" | "no-speech" | "transcribe" | "unsupported" | "unknown"; message: string }) => void;
}

export function useVoiceRecord({ onTranscript, onError }: UseVoiceRecordOptions) {
  const [state, setState] = useState<RecordingState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const formatRef = useRef<string>("webm");
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;

    setState("transcribing");

    const blob: Blob = await new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      rec.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (blob.size < 500) {
      setState("idle");
      onError?.({ kind: "no-speech", message: "Didn't hear anything. Try again." });
      return;
    }

    try {
      const buf = await blob.arrayBuffer();
      const resp = await fetch(`/api/voice/transcribe?format=${formatRef.current}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: buf,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const transcript = (data?.transcript || "").trim();
      setState("idle");
      if (!transcript) {
        onError?.({ kind: "no-speech", message: "Didn't hear anything. Try again." });
        return;
      }
      onTranscript(transcript);
    } catch (err) {
      setState("idle");
      onError?.({ kind: "transcribe", message: `Transcription failed: ${(err as Error).message}` });
    }
  }, [onTranscript, onError]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.({ kind: "unsupported", message: "Your browser does not support audio recording." });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "NotAllowedError") {
        onError?.({ kind: "permission", message: "Microphone permission denied. Click the lock icon in the address bar to allow it. If you're in the Replit preview, open the app in a new tab first." });
      } else {
        onError?.({ kind: "unknown", message: "Cannot access microphone." });
      }
      return;
    }

    const { mimeType, format } = pickMimeType();
    formatRef.current = format;
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = rec;
    streamRef.current = stream;
    chunksRef.current = [];

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(100);
    setState("recording");
  }, [state, onError]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.onstop = null;
      rec.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("idle");
  }, []);

  return { state, start, stop, cancel };
}
