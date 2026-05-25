export function SurLogo({ size = "sm", pulse = false }: { size?: "sm" | "lg" | "xl"; pulse?: boolean }) {
  const dimension = size === "xl" ? 120 : size === "lg" ? 72 : 40;
  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 80 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${pulse ? "animate-pulse" : ""}`}
      aria-label="SUR"
    >
      <line x1="28" y1="6" x2="28" y2="18" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="28" cy="5" r="3" fill="hsl(var(--primary))" />
      <line x1="52" y1="6" x2="52" y2="18" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="52" cy="5" r="3" fill="hsl(var(--primary))" />
      <path
        d="M22 18 H58 A16 16 0 0 1 74 34 V40 A16 16 0 0 1 58 56 H30 L22 62 V56 A16 16 0 0 1 6 40 V34 A16 16 0 0 1 22 18 Z"
        fill="hsl(var(--primary) / 0.08)"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text
        x="40"
        y="43"
        textAnchor="middle"
        fill="hsl(var(--primary))"
        fontSize="16"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="2"
      >
        SUR
      </text>
    </svg>
  );
}
