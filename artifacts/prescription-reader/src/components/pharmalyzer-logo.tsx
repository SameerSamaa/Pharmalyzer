interface PharmalyzerLogoProps {
  size?: number;
}

export function PharmalyzerLogo({ size = 32 }: PharmalyzerLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pharmalyzer logo"
    >
      <rect width="36" height="36" rx="9" fill="#018749" />
      <rect x="15" y="8" width="6" height="20" rx="3" fill="white" />
      <rect x="8" y="15" width="20" height="6" rx="3" fill="white" />
    </svg>
  );
}
