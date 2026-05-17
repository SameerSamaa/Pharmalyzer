import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { UploadCloud, FileImage, Loader2, AlertCircle, ScanLine } from "lucide-react";
import { useAnalyzePrescription, getListPrescriptionsQueryKey, getGetPrescriptionSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const analyzeMutation = useAnalyzePrescription();

  const handleFileChange = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive"
      });
      return;
    }
    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
  }, [toast]);

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

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      
      analyzeMutation.mutate(
        { data: { imageData: base64Data, mimeType: file.type } },
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
              variant: "destructive"
            });
          }
        }
      );
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          Intelligent Prescription Analysis
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Upload a handwritten doctor's prescription. Our AI instantly extracts medications, dosages, and usage instructions with clinical precision.
        </p>
      </div>

      <Card className="border-2 border-dashed shadow-sm overflow-hidden transition-colors data-[active=true]:border-primary" data-active={analyzeMutation.isPending}>
        <CardContent className="p-0">
          {!previewUrl ? (
            <div 
              className="flex flex-col items-center justify-center py-32 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => document.getElementById('file-upload')?.click()}
              data-testid="upload-zone"
            >
              <div className="w-16 h-16 mb-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-medium mb-2">Upload Prescription</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                Drag and drop an image here, or click to browse files from your device.
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
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 transition-opacity data-[loading=true]:opacity-100" data-loading={analyzeMutation.isPending}>
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <h3 className="text-lg font-medium">Analyzing Prescription...</h3>
                <p className="text-sm text-muted-foreground">Extracting clinical data safely</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {previewUrl && !analyzeMutation.isPending && (
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
              <ScanLine className="w-4 h-4" />
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
    </div>
  );
}
