import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Loader2, RotateCcw, Pill, Stethoscope, MapPin, Hospital } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function SurLogo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dimension = size === "lg" ? 64 : 36;
  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 drop-shadow-sm"
      aria-label="SUR"
    >
      <defs>
        <linearGradient id="surGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Antenna */}
      <line x1="32" y1="3" x2="32" y2="11" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="3.5" r="2.5" fill="hsl(var(--primary))" />

      {/* Head */}
      <rect x="6" y="11" width="52" height="46" rx="13" fill="url(#surGrad)" />

      {/* Inner face panel for SUR name plate */}
      <rect x="13" y="34" width="38" height="15" rx="4" fill="hsl(var(--primary-foreground))" fillOpacity="0.15" />

      {/* Eyes */}
      <circle cx="23" cy="24" r="3.5" fill="white" />
      <circle cx="41" cy="24" r="3.5" fill="white" />
      <circle cx="23" cy="24" r="1.4" fill="hsl(var(--primary))" />
      <circle cx="41" cy="24" r="1.4" fill="hsl(var(--primary))" />

      {/* SUR name plate text */}
      <text
        x="32"
        y="45.5"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="1.5"
      >
        SUR
      </text>

      {/* Side ears */}
      <rect x="3" y="26" width="4" height="14" rx="2" fill="hsl(var(--primary))" />
      <rect x="57" y="26" width="4" height="14" rx="2" fill="hsl(var(--primary))" />
    </svg>
  );
}

type Role = "user" | "assistant";

interface HospitalButton {
  key: string;
  label: string;
  fullName: string;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
  hospitalButtons?: HospitalButton[];
}

const SUGGESTIONS = [
  { icon: Pill, label: "What is Calpol used for?" },
  { icon: Pill, label: "What is Myteka prescribed for?" },
  { icon: Stethoscope, label: "I have severe back pain" },
  { icon: Stethoscope, label: "I have a chest infection" },
  { icon: MapPin, label: "Best cardiologist in Karachi" },
  { icon: MapPin, label: "Good hospital for chest in Lahore" },
];

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
      <div
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white mt-1 bg-primary`}
      >
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) throw new Error("Request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let pendingButtons: HospitalButton[] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done || data.error) break;
            if (data.content) {
              accumulated += data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated, streaming: true } : m
                )
              );
            }
            if (data.hospitalButtons) {
              pendingButtons = data.hospitalButtons as HospitalButton[];
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, hospitalButtons: pendingButtons }
            : m
        )
      );
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, something went wrong. Please try again.", streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [isStreaming, messages]);

  const handleHospitalFilter = useCallback((fullName: string) => {
    sendMessage(`Show me only doctors from ${fullName}`);
  }, [sendMessage]);

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

  const clearChat = () => {
    if (isStreaming) { abortRef.current?.abort(); setIsStreaming(false); }
    setMessages([]);
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
        {!isEmpty && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-2 text-muted-foreground">
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
        )}
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-8">
            <div className="space-y-3">
              <SurLogo size="lg" />
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
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-2">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a medicine, your symptoms, or find a doctor in your city..."
                className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none min-h-[40px] max-h-32 py-2 px-2 leading-relaxed"
                rows={1}
                disabled={isStreaming}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isStreaming}
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
