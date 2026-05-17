import { useRoute } from "wouter";
import { useGetPrescription, getGetPrescriptionQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { User, UserRound, Calendar, Pill, Clock, Activity, AlertCircle, FileText } from "lucide-react";
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
          <Skeleton className="h-32 w-full md:col-span-2" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !prescription) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
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
        <Card className="md:col-span-2 bg-card border shadow-sm">
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
          <div className="grid gap-4">
            {prescription.medications.map((med) => (
              <Card key={med.id} className="overflow-hidden border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                          {med.name}
                        </h3>
                        {med.purpose && (
                          <Badge variant="secondary" className="mt-2 bg-primary/10 text-primary hover:bg-primary/20 text-sm py-1 font-medium">
                            Use: {med.purpose}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex gap-4 sm:text-right shrink-0 bg-muted/50 p-3 rounded-lg">
                        {med.dosage && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Dosage</p>
                            <p className="font-medium text-foreground">{med.dosage}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
                      {med.frequency && (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Clock className="w-5 h-5 text-primary shrink-0" />
                          <div>
                            <p className="text-xs uppercase tracking-wider font-semibold">Frequency</p>
                            <p className="font-medium text-foreground">{med.frequency}</p>
                          </div>
                        </div>
                      )}
                      
                      {med.notes && (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Activity className="w-5 h-5 text-primary shrink-0" />
                          <div>
                            <p className="text-xs uppercase tracking-wider font-semibold">Special Instructions</p>
                            <p className="font-medium text-foreground">{med.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {prescription.rawAnalysis && (
        <div className="pt-8">
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
