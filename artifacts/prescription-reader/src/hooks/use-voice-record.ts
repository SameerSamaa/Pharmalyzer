import { useRef, useState, useCallback } from "react";

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
];

function formatForType(type: string): string {
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("aac")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function pickMimeType(): { mimeType?: string; format: string } {
  if (typeof MediaRecorder === "undefined") return { format: "webm" };
  for (const m of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) {
        return { mimeType: m, format: formatForType(m) };
      }
    } catch {
      // some browsers throw on unsupported types
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
      const finalize = () => {
        const type = rec.mimeType || chunksRef.current[0]?.type || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      // Capture the final chunk that some browsers deliver right before/after stop.
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        // give any trailing dataavailable a tick to land first
        setTimeout(finalize, 0);
      };
      try {
        rec.requestData?.();
      } catch {
        // ignore — some browsers throw if not actively recording
      }
      rec.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (blob.size < 200) {
      setState("idle");
      onError?.({ kind: "no-speech", message: "Didn't hear anything. Try again." });
      return;
    }

    const actualFormat = formatForType(blob.type) || formatRef.current;

    try {
      const buf = await blob.arrayBuffer();
      const resp = await fetch(`/api/voice/transcribe?format=${actualFormat}`, {
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

    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        onError?.({ kind: "unsupported", message: `Audio recording is not supported on this browser. ${(err as Error)?.message ?? ""}` });
        return;
      }
    }

    recorderRef.current = rec;
    streamRef.current = stream;
    chunksRef.current = [];

    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    try {
      // Timeslice makes the recorder emit chunks during recording, which is far
      // more reliable on mobile (esp. Android/iOS) than relying on a single
      // flush at stop().
      rec.start(250);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      onError?.({ kind: "unknown", message: `Could not start recording. ${(err as Error)?.message ?? ""}` });
      return;
    }
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
