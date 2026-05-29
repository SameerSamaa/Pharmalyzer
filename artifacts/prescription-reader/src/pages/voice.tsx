import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Volume2, MessageSquareText, RotateCcw, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurLogo } from "@/components/sur-logo";
import { useSurChat } from "@/hooks/use-sur-chat";
import { useToast } from "@/hooks/use-toast";
import { useVoiceRecord } from "@/hooks/use-voice-record";
import { stripMarkdown, FormattedContent, HospitalFilterChips } from "@/components/formatted-message";

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: "Tap the mic to speak",
  listening: "Listening...",
  thinking: "SUR is thinking...",
  speaking: "SUR is speaking...",
};

type AnswerMode = "voice" | "text";

export function Voice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("voice");
  const [transcript, setTranscript] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);
  const answerModeRef = useRef<AnswerMode>("voice");
  const audioUnlockedRef = useRef(false);
  const { toast } = useToast();

  // A tiny silent WAV used to "unlock" the audio element on a user gesture.
  const SILENT_AUDIO =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

  const ensureAudioEl = useCallback(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }, []);

  // Must be called from within a user gesture (e.g. mic tap). Playing a silent
  // clip here satisfies the browser autoplay policy so a later, async play()
  // (after the TTS round-trip) isn't blocked — the cause of intermittent
  // "playback failed" errors when the network is slow.
  const primeAudio = useCallback(() => {
    const audio = ensureAudioEl();
    try {
      audio.muted = true;
      audio.src = SILENT_AUDIO;
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audioUnlockedRef.current = true;
        }).catch(() => {
          audio.muted = false;
        });
      } else {
        audioUnlockedRef.current = true;
      }
    } catch {
      audio.muted = false;
    }
  }, [ensureAudioEl]);

  useEffect(() => {
    answerModeRef.current = answerMode;
  }, [answerMode]);

  const revokeUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
    }
    revokeUrl();
  }, [revokeUrl]);

  const speak = useCallback(async (text: string) => {
    stopSpeaking();
    const clean = stripMarkdown(text).trim();
    if (!clean) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    speakAbortRef.current = controller;
    setStatus("speaking");
    try {
      const resp = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (controller.signal.aborted) return;
      revokeUrl();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = ensureAudioEl();
      audio.muted = false;
      audio.src = url;
      audio.onended = () => {
        revokeUrl();
        setStatus("idle");
      };
      audio.onerror = () => {
        revokeUrl();
        setStatus("idle");
      };
      try {
        await audio.play();
      } catch (playErr) {
        if ((playErr as Error)?.name === "AbortError") return;
        // Autoplay was blocked (gesture expired). Retry once on the next tick —
        // the element was primed on the mic tap so this usually succeeds.
        await new Promise((r) => setTimeout(r, 60));
        if (controller.signal.aborted) return;
        await audio.play();
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      revokeUrl();
      setStatus("idle");
      toast({ title: "Voice playback unavailable", description: "Showing the answer as text instead." });
    }
  }, [stopSpeaking, revokeUrl, ensureAudioEl, toast]);

  const { messages, isStreaming, sendMessage, clearChat } = useSurChat(
    useCallback((text: string) => {
      if (answerModeRef.current === "voice") {
        void speak(text);
      } else {
        setStatus("idle");
      }
    }, [speak])
  );

  useEffect(() => {
    return () => stopSpeaking();
  }, [stopSpeaking]);

  const voice = useVoiceRecord({
    onTranscript: useCallback((text: string) => {
      setTranscript(text);
      setStatus("thinking");
      sendMessage(text);
    }, [sendMessage]),
    onError: useCallback((err: { kind: string; message: string }) => {
      setTranscript("");
      setStatus("idle");
      if (err.kind === "permission") {
        toast({ title: "Microphone blocked", description: err.message, variant: "destructive" });
      } else if (err.kind === "no-speech") {
        toast({ title: "No speech detected", description: err.message });
      } else if (err.kind === "transcribe") {
        toast({ title: "Voice error", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Microphone error", description: err.message, variant: "destructive" });
      }
    }, [toast]),
  });

  useEffect(() => {
    if (voice.state === "recording") setStatus("listening");
    else if (voice.state === "transcribing") setStatus("thinking");
  }, [voice.state]);

  useEffect(() => {
    if (isStreaming) setStatus("thinking");
  }, [isStreaming]);

  const handleMicClick = async () => {
    if (voice.state === "recording") {
      await voice.stop();
      return;
    }
    if (voice.state === "transcribing") return;
    stopSpeaking();
    // Unlock audio within this user gesture so the later TTS playback isn't
    // blocked by the browser autoplay policy when the response is slow.
    if (answerModeRef.current === "voice") primeAudio();
    setStatus("idle");
    setTranscript("");
    await voice.start();
  };

  const handleClear = () => {
    stopSpeaking();
    voice.cancel();
    setStatus("idle");
    setTranscript("");
    clearChat();
  };

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const hasMessages = messages.length > 0;

  const isActive = status === "listening";
  const isBusy = status === "thinking" || status === "speaking";

  const handleHospitalFilter = (fullName: string) => {
    sendMessage(`Show me only doctors from ${fullName}`);
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col px-2 pb-32">

      {/* Top bar */}
      <div className="w-full flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <SurLogo size="sm" />
          SUR Voice
        </h1>
        <div className="flex items-center gap-2">
          {hasMessages && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* SUR avatar + status (compact, doesn't take all the space) */}
      <div className="flex flex-col items-center gap-2 mt-4 mb-3 shrink-0">
        <div className={`relative transition-transform duration-300 ${isActive ? "scale-105" : ""}`}>
          {(isActive || status === "speaking") && (
            <>
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/20 scale-150" />
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/10 scale-[1.8] [animation-delay:300ms]" />
            </>
          )}
          <SurLogo size={hasMessages ? "lg" : "xl"} pulse={status === "thinking"} />
        </div>
        <p className={`text-sm font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
          {STATUS_TEXT[status]}
        </p>
        {transcript && status !== "thinking" && (
          <p className="text-sm italic text-foreground/70 max-w-xs text-center px-4 line-clamp-2">"{transcript}"</p>
        )}

        {/* Answer mode toggle */}
        <div className="mt-1 inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setAnswerMode("voice")}
            aria-pressed={answerMode === "voice"}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
              answerMode === "voice" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            Voice answer
          </button>
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              setStatus("idle");
              setAnswerMode("text");
            }}
            aria-pressed={answerMode === "text"}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
              answerMode === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            Text only
          </button>
        </div>
      </div>

      {/* Conversation preview */}
      <div className="w-full space-y-3">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
            <p className="text-sm text-muted-foreground">
              Tap the mic and ask SUR anything, medicines, symptoms, or finding a doctor.
            </p>
          </div>
        )}

        {lastUser && (
          <div className="flex gap-3 flex-row-reverse animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-primary text-white">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm bg-primary text-primary-foreground">
              {lastUser.content}
            </div>
          </div>
        )}

        {lastAssistant && (
          <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-primary text-white">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-card border border-border">
              {lastAssistant.streaming && !lastAssistant.content ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
                </span>
              ) : (
                <FormattedContent content={lastAssistant.content} />
              )}
              {lastAssistant.streaming && lastAssistant.content && (
                <span className="inline-block w-1.5 h-4 bg-primary/60 rounded-sm ml-0.5 animate-pulse align-middle" />
              )}
              {!lastAssistant.streaming && lastAssistant.hospitalButtons && lastAssistant.hospitalButtons.length > 0 && (
                <HospitalFilterChips
                  buttons={lastAssistant.hospitalButtons}
                  onFilter={handleHospitalFilter}
                  disabled={isBusy || isStreaming}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mic button — pinned to viewport bottom, always reachable */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
        <button
          onClick={handleMicClick}
          aria-label={isActive ? "Stop listening" : "Start speaking"}
          className={`pointer-events-auto relative w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 touch-manipulation ${
            isActive
              ? "bg-red-500 hover:bg-red-600 scale-110"
              : voice.state === "transcribing"
              ? "bg-primary/60"
              : "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95"
          }`}
        >
          {voice.state === "transcribing" ? (
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          ) : isActive ? (
            <MicOff className="w-7 h-7 text-white" />
          ) : (
            <Mic className="w-7 h-7 text-white" />
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          {isActive ? "Tap to stop" : voice.state === "transcribing" ? "Transcribing..." : isBusy ? "Tap to interrupt" : "Tap to speak"}
        </p>
      </div>
    </div>
  );
}
