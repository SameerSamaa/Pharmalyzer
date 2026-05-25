import { useState, useRef, useCallback } from "react";

export type Role = "user" | "assistant";

export interface HospitalButton {
  key: string;
  label: string;
  fullName: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
  hospitalButtons?: HospitalButton[];
}

export function useSurChat(onAssistantMessage?: (text: string) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const history = messagesRef.current.map((m) => ({ role: m.role, content: m.content }));
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
                prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated, streaming: true } : m))
              );
            }
            if (data.hospitalButtons) pendingButtons = data.hospitalButtons as HospitalButton[];
          } catch {
            // ignore partial chunk parse errors
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, hospitalButtons: pendingButtons } : m))
      );

      if (accumulated && onAssistantMessage) onAssistantMessage(accumulated);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const errorMsg = "Sorry, something went wrong. Please try again.";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: errorMsg, streaming: false } : m))
      );
      if (onAssistantMessage) onAssistantMessage(errorMsg);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, onAssistantMessage]);

  const handleHospitalFilter = useCallback((fullName: string) => {
    sendMessage(`Show me only doctors from ${fullName}`);
  }, [sendMessage]);

  const clearChat = useCallback(() => {
    if (isStreaming) { abortRef.current?.abort(); setIsStreaming(false); }
    setMessages([]);
  }, [isStreaming]);

  return { messages, input, setInput, isStreaming, sendMessage, clearChat, handleHospitalFilter, abortRef };
}
