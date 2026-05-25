import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, RotateCcw, Loader2, Bot, User, Hospital } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurLogo } from "@/components/sur-logo";
import { useSurChat } from "@/hooks/use-sur-chat";
import { useToast } from "@/hooks/use-toast";
import { useVoiceRecord } from "@/hooks/use-voice-record";

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[•\-]\s*/gm, "")
    .replace(/^\d+\.\s*/gm, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: "Tap the mic to speak",
  listening: "Listening...",
  thinking: "SUR is thinking...",
  speaking: "SUR is speaking...",
};

export function Voice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState("");

  const synthRef = useRef(window.speechSynthesis);
  const { toast } = useToast();

  const speak = useCallback((text: string) => {
    if (!speakerOn) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    synthRef.current.speak(utterance);
  }, [speakerOn]);

  const { messages, isStreaming, sendMessage, clearChat } = useSurChat(
    useCallback((text: string) => {
      setStatus("thinking");
      setTimeout(() => speak(text), 100);
    }, [speak])
  );

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
    if (status === "listening" || voice.state === "recording") {
      await voice.stop();
    } else if (status === "idle") {
      synthRef.current.cancel();
      setTranscript("");
      await voice.start();
    }
  };

  const handleClear = () => {
    synthRef.current.cancel();
    voice.cancel();
    setStatus("idle");
    setTranscript("");
    clearChat();
  };

  const toggleSpeaker = () => {
    setSpeakerOn((s) => {
      if (s) synthRef.current.cancel();
      return !s;
    });
  };

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const hasMessages = messages.length > 0;

  const isActive = status === "listening";
  const isBusy = status === "thinking" || status === "speaking";

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center gap-6 py-4" style={{ minHeight: "calc(100dvh - 9rem)" }}>

      {/* Top bar */}
      <div className="w-full flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <SurLogo size="sm" />
          SUR Voice
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleSpeaker} className="text-muted-foreground hover:text-foreground" title={speakerOn ? "Mute SUR" : "Unmute SUR"}>
            {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          {hasMessages && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* SUR avatar + status */}
      <div className="flex flex-col items-center gap-3 mt-4">
        <div className={`relative ${isBusy || isActive ? "drop-shadow-lg" : ""}`}>
          {/* Pulse rings when active */}
          {(isActive || status === "speaking") && (
            <>
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/20 scale-150" />
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/10 scale-[2] animation-delay-150" />
            </>
          )}
          <SurLogo size="xl" pulse={status === "thinking"} />
        </div>
        <p className={`text-sm font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
          {STATUS_TEXT[status]}
        </p>
        {transcript && (
          <p className="text-sm italic text-foreground/70 max-w-xs text-center">"{transcript}"</p>
        )}
      </div>

      {/* Conversation preview */}
      {hasMessages && (
        <div className="w-full space-y-3 px-2">
          {lastUser && (
            <div className="flex gap-3 flex-row-reverse">
              <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-primary text-white">
                <User className="w-4 h-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm bg-primary text-primary-foreground">
                {lastUser.content}
              </div>
            </div>
          )}
          {lastAssistant && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-primary text-white">
                <Bot className="w-4 h-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-card border border-border relative">
                {lastAssistant.streaming ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
                  </span>
                ) : (
                  lastAssistant.content
                )}
                {lastAssistant.hospitalButtons && lastAssistant.hospitalButtons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground flex items-center gap-1 w-full">
                      <Hospital className="w-3 h-3" /> Filter by hospital:
                    </span>
                    {lastAssistant.hospitalButtons.map((btn) => (
                      <button
                        key={btn.key}
                        onClick={() => sendMessage(`Show me only doctors from ${btn.fullName}`)}
                        disabled={isBusy || isStreaming}
                        className="text-xs px-3 py-1 rounded-full border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 transition-all disabled:opacity-40"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mic button */}
      <div className="flex flex-col items-center gap-3 pb-4">
        <button
          onClick={handleMicClick}
          disabled={isBusy}
          aria-label={isActive ? "Stop listening" : "Start speaking"}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 ${
            isActive
              ? "bg-red-500 hover:bg-red-600 scale-110"
              : isBusy
              ? "bg-primary/40 cursor-not-allowed"
              : "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95"
          }`}
        >
          {isBusy ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : isActive ? (
            <MicOff className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </button>
        <p className="text-xs text-muted-foreground">
          {isActive ? "Tap to stop" : isBusy ? "Please wait..." : "Tap to speak"}
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground pb-2">
        For informational use only. Always consult a qualified doctor for medical advice.
      </p>
    </div>
  );
}
