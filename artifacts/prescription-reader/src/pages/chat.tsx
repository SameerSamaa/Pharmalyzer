import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Loader2, RotateCcw, Pill, Stethoscope, MapPin, Hospital, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SurLogo } from "@/components/sur-logo";
import { useSurChat } from "@/hooks/use-sur-chat";
import type { Message, HospitalButton } from "@/hooks/use-sur-chat";
import { useToast } from "@/hooks/use-toast";
import { useVoiceRecord } from "@/hooks/use-voice-record";

const SUGGESTIONS = [
  { icon: Pill, label: "What is Calpol used for?" },
  { icon: Pill, label: "What is Myteka prescribed for?" },
  { icon: Stethoscope, label: "I have severe back pain" },
  { icon: Stethoscope, label: "I have a chest infection" },
  { icon: MapPin, label: "Best cardiologist in Karachi" },
  { icon: MapPin, label: "Good hospital for chest in Lahore" },
];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[•\-]\s*/gm, "")
    .replace(/^\d+\.\s*/gm, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function formatMarkdown(text: string): string {
  let html = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  const lines = html.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.match(/^\d+\.\s/)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${trimmed.replace(/^[•\-]\s*/, "").replace(/^\d+\.\s*/, "")}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${trimmed}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function HospitalFilterChips({
  buttons,
  onFilter,
  disabled,
}: {
  buttons: HospitalButton[];
  onFilter: (fullName: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 self-center">
        <Hospital className="w-3 h-3" />
        Filter by hospital:
      </span>
      {buttons.map((btn) => (
        <button
          key={btn.key}
          onClick={() => onFilter(btn.fullName)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-full border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 hover:border-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  onHospitalFilter,
  isStreaming,
}: {
  message: Message;
  onHospitalFilter: (text: string) => void;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white mt-1 bg-primary">
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <>
            <div
              className="prose prose-sm max-w-none [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:mb-1"
              dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
            />
            {!message.streaming && message.hospitalButtons && message.hospitalButtons.length > 0 && (
              <HospitalFilterChips
                buttons={message.hospitalButtons}
                onFilter={onHospitalFilter}
                disabled={isStreaming}
              />
            )}
          </>
        )}
        {message.streaming && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 rounded-sm ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

export function Chat() {
  const [speakerOn, setSpeakerOn] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const synthRef = useRef(window.speechSynthesis);
  const { toast } = useToast();

  const speak = useCallback((text: string) => {
    if (!speakerOn) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }, [speakerOn]);

  const { messages, input, setInput, isStreaming, sendMessage, clearChat, handleHospitalFilter } = useSurChat(
    useCallback((text: string) => speak(text), [speak])
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const voice = useVoiceRecord({
    onTranscript: useCallback((text: string) => {
      setInput(text);
      setTimeout(() => sendMessage(text), 50);
    }, [setInput, sendMessage]),
    onError: useCallback((err: { kind: string; message: string }) => {
      if (err.kind === "permission") {
        toast({ title: "Microphone blocked", description: err.message, variant: "destructive" });
      } else if (err.kind === "no-speech") {
        toast({ title: "No speech detected", description: err.message });
      } else if (err.kind === "transcribe") {
        toast({ title: "Voice error", description: err.message, variant: "destructive" });
      } else if (err.kind === "unsupported") {
        toast({ title: "Voice unavailable", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Microphone error", description: err.message, variant: "destructive" });
      }
    }, [toast]),
  });

  const isListening = voice.state === "recording";
  const isTranscribing = voice.state === "transcribing";

  const toggleMic = async () => {
    if (isListening) {
      await voice.stop();
    } else if (voice.state === "idle") {
      synthRef.current.cancel();
      setInput("");
      await voice.start();
    }
  };

  const toggleSpeaker = () => {
    setSpeakerOn((s) => {
      if (s) synthRef.current.cancel();
      return !s;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleClear = () => {
    if (isStreaming) clearChat();
    else clearChat();
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100dvh - 9rem)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SurLogo size="sm" />
            Ask SUR for medical assistance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ask about medicines, symptoms, or find doctors and hospitals near you
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSpeaker}
            title={speakerOn ? "Mute responses" : "Speak responses aloud"}
            className="text-muted-foreground hover:text-foreground"
          >
            {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          {!isEmpty && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-2 text-muted-foreground">
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          )}
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-8">
            <div className="space-y-3">
              <div className="flex justify-center">
                <SurLogo size="lg" />
              </div>
              <h2 className="text-xl font-semibold">Hi, I'm SUR</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask me about any medicine, describe your symptoms for doctor guidance, or find real doctors and hospitals in your city.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(label)}
                  className="flex items-center gap-3 text-left p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-sm"
                >
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2">
              <Hospital className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Live doctor data from KMH, Saifee, LNH &amp; AKUH — 4 Karachi hospitals</span>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onHospitalFilter={handleHospitalFilter}
                isStreaming={isStreaming}
              />
            ))}
            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-primary text-white mt-1">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">SUR is thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3">
        <Card className={`shadow-sm transition-colors ${isListening ? "border-primary ring-1 ring-primary/30" : "border-border/60"}`}>
          <CardContent className="p-2">
            {isListening && (
              <div className="flex items-center gap-2 px-2 py-1 mb-1">
                <span className="flex gap-0.5 items-end h-4">
                  <span className="w-0.5 bg-primary rounded-full animate-bounce h-2" style={{ animationDelay: "0ms" }} />
                  <span className="w-0.5 bg-primary rounded-full animate-bounce h-3" style={{ animationDelay: "100ms" }} />
                  <span className="w-0.5 bg-primary rounded-full animate-bounce h-4" style={{ animationDelay: "200ms" }} />
                  <span className="w-0.5 bg-primary rounded-full animate-bounce h-3" style={{ animationDelay: "100ms" }} />
                  <span className="w-0.5 bg-primary rounded-full animate-bounce h-2" style={{ animationDelay: "0ms" }} />
                </span>
                <span className="text-xs text-primary font-medium">Listening...</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening..." : "Ask about a medicine, your symptoms, or find a doctor..."}
                className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none min-h-[40px] max-h-32 py-2 px-2 leading-relaxed"
                rows={1}
                disabled={isStreaming || isListening}
              />
              <Button
                type="button"
                size="icon"
                variant={isListening ? "default" : "ghost"}
                onClick={toggleMic}
                disabled={isStreaming || isTranscribing}
                title={isListening ? "Stop listening" : isTranscribing ? "Transcribing..." : "Speak your question"}
                className={`shrink-0 rounded-xl h-9 w-9 ${isListening ? "bg-red-500 hover:bg-red-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isStreaming || isListening}
                className="shrink-0 rounded-xl h-9 w-9"
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-2">
          For informational use only. Always consult a qualified doctor for medical advice.
        </p>
      </div>
    </div>
  );
}
