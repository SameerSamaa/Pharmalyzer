import { useRoute } from "wouter";
import { useGetPrescription, getGetPrescriptionQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { User, UserRound, Calendar, Pill, Clock, AlertTriangle, FileText, Tag, ShieldAlert, Timer } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function PrescriptionDetail() {
  const [, params] = useRoute("/prescriptions/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const { data: prescription, isLoading, isError } = useGetPrescription(id, {
    query: { enabled: !!id, queryKey: getGetPrescriptionQueryKey(id) }
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
        <div className="space-y-2">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-6 w-1/4" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 w-full md:col-span-2" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !prescription) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <AlertTriangle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Prescription Not Found</h2>
        <p className="text-muted-foreground">This scan may have been deleted or does not exist.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Prescription Details</h1>
        <div className="flex items-center gap-2 mt-2 text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>Scanned on {format(new Date(prescription.createdAt), "MMMM d, yyyy 'at' h:mm a")}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {prescription.imageData && prescription.imageMimeType && (
            <Card className="overflow-hidden border shadow-sm">
              <div className="bg-muted/30 px-5 pt-4 pb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Prescription</p>
              </div>
              <div className="max-h-80 overflow-hidden flex items-center justify-center bg-muted/20">
                <img
                  src={`data:${prescription.imageMimeType};base64,${prescription.imageData}`}
                  alt="Original prescription"
                  className="w-full object-contain max-h-80"
                />
              </div>
            </Card>
          )}

          <Card className="bg-card border shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Patient & Doctor Info</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Patient</p>
                    <p className="font-semibold text-lg">{prescription.patientName || "Unknown Patient"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <UserRound className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Doctor</p>
                    <p className="font-semibold text-lg">{prescription.doctorName ? `Dr. ${prescription.doctorName}` : "Unknown Doctor"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-primary text-primary-foreground shadow-sm">
          <CardContent className="p-6 flex flex-col justify-center h-full">
            <p className="text-primary-foreground/80 text-sm font-medium mb-1">Medications Found</p>
            <p className="text-5xl font-bold">{prescription.medications?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Pill className="w-6 h-6 text-primary" />
          Medication Regimen
        </h2>

        {prescription.medications?.length === 0 ? (
          <Card className="py-12 text-center bg-muted/30">
            <CardContent>
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No medications were identified in this scan.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5">
            {prescription.medications.map((med) => (
              <Card key={med.id} className="overflow-hidden border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  <div className="p-5 sm:p-6">
                    {/* Header row */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-bold text-foreground">{med.name}</h3>
                        {med.genericName && (
                          <p className="text-sm text-muted-foreground">Generic: <span className="font-medium text-foreground">{med.genericName}</span></p>
                        )}
                        {med.drugClass && (
                          <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary bg-primary/5">
                            <Tag className="w-3 h-3 mr-1" />
                            {med.drugClass}
                          </Badge>
                        )}
                      </div>

                      <div className="flex gap-3 shrink-0 bg-muted/50 p-3 rounded-xl">
                        {med.dosage && (
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Dosage</p>
                            <p className="font-semibold text-foreground mt-0.5">{med.dosage}</p>
                          </div>
                        )}
                        {med.duration && (
                          <>
                            <div className="w-px bg-border" />
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Duration</p>
                              <p className="font-semibold text-foreground mt-0.5">{med.duration}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Purpose */}
                    {med.purpose && (
                      <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-4">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1.5">What this is for</p>
                        <p className="text-sm text-foreground leading-relaxed">{med.purpose}</p>
                      </div>
                    )}

                    {/* Frequency + Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {med.frequency && (
                        <div className="flex items-start gap-3">
                          <Clock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Frequency</p>
                            <p className="font-medium text-foreground mt-0.5">{med.frequency}</p>
                          </div>
                        </div>
                      )}
                      {med.notes && (
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Special Instructions</p>
                            <p className="font-medium text-foreground mt-0.5">{med.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Side effects + Contraindications */}
                    {(med.sideEffects || med.contraindications) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-border/50">
                        {med.sideEffects && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Side Effects</p>
                            </div>
                            <p className="text-xs text-amber-900 leading-relaxed">{med.sideEffects}</p>
                          </div>
                        )}
                        {med.contraindications && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                              <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">Warnings</p>
                            </div>
                            <p className="text-xs text-red-900 leading-relaxed">{med.contraindications}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {prescription.rawAnalysis && (
        <div className="pt-4">
          <Card className="bg-muted/30 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-muted-foreground">Raw Analysis Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prescription.rawAnalysis}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
