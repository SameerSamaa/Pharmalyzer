import { Hospital } from "lucide-react";
import type { HospitalButton } from "@/hooks/use-sur-chat";

export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[•\-]\s*/gm, "")
    .replace(/^\d+\.\s*/gm, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

export function formatMarkdown(text: string): string {
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

export function FormattedContent({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div
      className={`prose prose-sm max-w-none [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:mb-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }}
    />
  );
}

export function HospitalFilterChips({
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
