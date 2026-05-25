import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Plus, MessageCircle, Camera, Mic } from "lucide-react";
import { useAuth } from "@/context/auth";
import { usePendingUpload } from "@/context/pending-upload";

interface FabOptionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  visible: boolean;
  delay: string;
}

function FabOption({ icon, label, onClick, visible, delay }: FabOptionProps) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        transition: `opacity 180ms ease-out ${delay}, transform 180ms ease-out ${delay}`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <span className="bg-card border border-border text-foreground text-sm font-medium px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap select-none">
        {label}
      </span>
      <button
        onClick={onClick}
        className="w-12 h-12 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-primary hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all duration-150"
        aria-label={label}
      >
        {icon}
      </button>
    </div>
  );
}

export function FloatingActionButton() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { setPendingFile } = usePendingUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setOpen(false);
    setLocation("/");
    e.target.value = "";
  };

  const handleSurClick = () => {
    setOpen(false);
    setLocation("/chat");
  };

  const handleVoiceClick = () => {
    setOpen(false);
    setLocation("/voice");
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-50 flex flex-col items-end gap-3">
        <FabOption
          icon={<Mic className="w-5 h-5" />}
          label="Talk to SUR"
          onClick={handleVoiceClick}
          visible={open}
          delay="100ms"
        />
        <FabOption
          icon={<MessageCircle className="w-5 h-5" />}
          label="Ask SUR"
          onClick={handleSurClick}
          visible={open}
          delay="60ms"
        />
        <FabOption
          icon={<Camera className="w-5 h-5" />}
          label="Scan Prescription"
          onClick={handleCameraClick}
          visible={open}
          delay="20ms"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCameraChange}
        />

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close quick actions" : "Open quick actions"}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:shadow-xl active:scale-95"
          style={{
            transition: "transform 220ms ease-out, box-shadow 150ms ease-out",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </>
  );
}
