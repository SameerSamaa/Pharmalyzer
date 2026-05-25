import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { UploadCloud, FileImage, Loader2, AlertCircle, ScanLine, Wand2 } from "lucide-react";
import { useAnalyzePrescription, getListPrescriptionsQueryKey, getGetPrescriptionSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePendingUpload } from "@/context/pending-upload";

interface PreprocessResult {
  base64: string;
  mimeType: string;
  enhanced: boolean;
}

/** Analyse pixel data to determine if the image needs enhancement.
 *  Returns true when the image is blurry, too dark, or low-contrast. */
function needsEnhancement(data: Uint8ClampedArray, width: number, height: number): boolean {
  // Sample every 4th row and column for speed
  const step = 4;
  const lums: number[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
  }

  // Mean luminance — dark images need brightening
  const mean = lums.reduce((s, v) => s + v, 0) / lums.length;

  // Standard deviation of luminance — low std-dev = washed-out / low contrast
  const variance = lums.reduce((s, v) => s + (v - mean) ** 2, 0) / lums.length;
  const stdDev = Math.sqrt(variance);

  // Laplacian sharpness: measure edge strength via neighbour differences
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      const left  = (y * width + (x - step)) * 4;
      const right = (y * width + (x + step)) * 4;
      const up    = ((y - step) * width + x) * 4;
      const down  = ((y + step) * width + x) * 4;
      const center = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const l = 0.299 * data[left]  + 0.587 * data[left + 1]  + 0.114 * data[left + 2];
      const r = 0.299 * data[right] + 0.587 * data[right + 1] + 0.114 * data[right + 2];
      const u = 0.299 * data[up]    + 0.587 * data[up + 1]    + 0.114 * data[up + 2];
      const d = 0.299 * data[down]  + 0.587 * data[down + 1]  + 0.114 * data[down + 2];
      edgeSum += Math.abs(l + r + u + d - 4 * center);
      edgeCount++;
    }
  }
  const sharpness = edgeCount > 0 ? edgeSum / edgeCount : 0;

  const isDark        = mean < 100;          // average pixel too dark
  const isLowContrast = stdDev < 40;         // very flat histogram
  const isBlurry      = sharpness < 8;       // weak edges = blurry

  return isDark || isLowContrast || isBlurry;
}

async function preprocessImage(file: File): Promise<PreprocessResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      // Cap at 1600px on the longest side — enough for AI, small enough to send
      const MAX_DIM = 1600;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const mimeType = "image/jpeg";

      const shouldEnhance = needsEnhancement(data, canvas.width, canvas.height);

      if (shouldEnhance) {
        // Enhancement pipeline: contrast boost + background whitening + ink darkening
        const contrast   = 1.4;
        const brightness = 10;
        const enhance = (v: number) =>
          Math.min(255, Math.max(0, contrast * (v - 128) + 128 + brightness));

        for (let i = 0; i < data.length; i += 4) {
          const r   = data[i], g = data[i + 1], b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          data[i]     = enhance(r);
          data[i + 1] = enhance(g);
          data[i + 2] = enhance(b);

          // Whiten near-white background noise
          const post = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (post > 210) { data[i] = data[i + 1] = data[i + 2] = 255; }

          // Darken ink strokes
          if (lum < 80) {
            data[i]     = Math.max(0, data[i]     - 20);
            data[i + 1] = Math.max(0, data[i + 1] - 20);
            data[i + 2] = Math.max(0, data[i + 2] - 20);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        URL.revokeObjectURL(objectUrl);
        const base64 = canvas.toDataURL(mimeType, 0.88).split(",")[1];
        resolve({ base64, mimeType, enhanced: true });
      } else {
        // Image is already clear — export as-is at high quality, no pixel manipulation
        URL.revokeObjectURL(objectUrl);
        const base64 = canvas.toDataURL(mimeType, 0.95).split(",")[1];
        resolve({ base64, mimeType, enhanced: false });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onloadend = () => {
        const raw = reader.result as string;
        resolve({ base64: raw.split(",")[1], mimeType: file.type, enhanced: false });
      };
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

export function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [wasEnhanced, setWasEnhanced] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const analyzeMutation = useAnalyzePrescription();
  const { pendingFile, setPendingFile } = usePendingUpload();

  const handleFileChange = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }
    setFile(selectedFile);
    setWasEnhanced(false);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
  }, [toast]);

  useEffect(() => {
    if (pendingFile) {
      handleFileChange(pendingFile);
      setPendingFile(null);
    }
  }, [pendingFile, handleFileChange, setPendingFile]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }, [handleFileChange]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleAnalyze = async () => {
    if (!file) return;

    setIsPreprocessing(true);
    let base64Data: string;
    let mimeType: string;

    try {
      const processed = await preprocessImage(file);
      base64Data = processed.base64;
      mimeType = processed.mimeType;
      setWasEnhanced(processed.enhanced);
    } catch {
      // Fallback to raw file if preprocessing fails
      const reader = new FileReader();
      const raw = await new Promise<string>((res) => {
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });
      base64Data = raw.split(",")[1];
      mimeType = file.type;
      setWasEnhanced(false);
    } finally {
      setIsPreprocessing(false);
    }

    analyzeMutation.mutate(
      { data: { imageData: base64Data, mimeType } },
      {
        onSuccess: (prescription) => {
          queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPrescriptionSummaryQueryKey() });
          setLocation(`/prescriptions/${prescription.id}`);
        },
        onError: () => {
          toast({
            title: "Analysis Failed",
            description: "There was an error processing the prescription. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const isProcessing = isPreprocessing || analyzeMutation.isPending;

  const loadingLabel = isPreprocessing
    ? "Checking image quality..."
    : "Analyzing prescription...";

  const loadingSubLabel = isPreprocessing
    ? (wasEnhanced ? "Enhancing clarity for better OCR" : "Image is clear — sending as-is")
    : "Extracting clinical data with AI";

  return (
    <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          Intelligent Prescription Analysis
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
          Upload a handwritten doctor's prescription. Our AI reads it — even blurry, angled, or poorly-lit photos — and extracts every medication with clinical detail.
        </p>
      </div>

      <Card className="border-2 border-dashed shadow-sm overflow-hidden transition-colors data-[active=true]:border-primary" data-active={isProcessing}>
        <CardContent className="p-0">
          {!previewUrl ? (
            <div
              className="flex flex-col items-center justify-center py-16 sm:py-28 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => document.getElementById("file-upload")?.click()}
              data-testid="upload-zone"
            >
              <div className="w-16 h-16 mb-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-medium mb-2">Upload Prescription</h3>
              <p className="text-sm text-muted-foreground mb-2 text-center max-w-sm">
                Drag and drop an image here, or click to browse files from your device.
              </p>
              <p className="text-xs text-muted-foreground mb-6 text-center max-w-sm">
                Works with blurry, angled, or low-light photos
              </p>
              <Button variant="outline" className="pointer-events-none">Select File</Button>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
                data-testid="input-file"
              />
            </div>
          ) : (
            <div className="relative">
              <div className="aspect-[4/3] md:aspect-[16/9] w-full bg-muted flex items-center justify-center overflow-hidden">
                <img src={previewUrl} alt="Prescription preview" className="object-contain w-full h-full" />
              </div>
              <div
                className="absolute inset-0 bg-background/85 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 transition-opacity data-[loading=true]:opacity-100"
                data-loading={isProcessing}
              >
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <h3 className="text-lg font-medium">{loadingLabel}</h3>
                <p className="text-sm text-muted-foreground">{loadingSubLabel}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {previewUrl && !isProcessing && (
        <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
              <FileImage className="w-5 h-5" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium truncate">{file?.name}</p>
              <p className="text-xs text-muted-foreground">{(file?.size ? (file.size / 1024 / 1024).toFixed(2) : 0)} MB</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" onClick={() => { setPreviewUrl(null); setFile(null); }} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleAnalyze} data-testid="button-analyze" className="gap-2">
              <Wand2 className="w-4 h-4" />
              Analyze
            </Button>
          </div>
        </div>
      )}

      {analyzeMutation.isError && (
        <div className="bg-destructive/10 text-destructive-foreground p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
          <div>
            <h4 className="font-medium text-destructive text-sm">Analysis Error</h4>
            <p className="text-sm opacity-90 text-destructive mt-1">Failed to read the prescription. Please ensure the image is clear and try again.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center pb-20 sm:pb-0">
        {[
          { label: "Blurry photos", sub: "AI infers from context" },
          { label: "Bad lighting", sub: "Auto contrast boost" },
          { label: "Abbreviations", sub: "OD, BD, TDS decoded" },
        ].map(({ label, sub }) => (
          <div key={label} className="bg-muted/40 rounded-xl p-3 sm:p-4">
            <p className="text-xs sm:text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
