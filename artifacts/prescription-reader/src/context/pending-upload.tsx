import { createContext, useContext, useState } from "react";

interface PendingUploadContextValue {
  pendingFile: File | null;
  setPendingFile: (file: File | null) => void;
}

const PendingUploadContext = createContext<PendingUploadContextValue>({
  pendingFile: null,
  setPendingFile: () => {},
});

export function PendingUploadProvider({ children }: { children: React.ReactNode }) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  return (
    <PendingUploadContext.Provider value={{ pendingFile, setPendingFile }}>
      {children}
    </PendingUploadContext.Provider>
  );
}

export function usePendingUpload() {
  return useContext(PendingUploadContext);
}
