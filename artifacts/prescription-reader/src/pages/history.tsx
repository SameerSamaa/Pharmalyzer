import { Link } from "wouter";
import { useListPrescriptions, useGetPrescriptionSummary, useDeletePrescription, getListPrescriptionsQueryKey, getGetPrescriptionSummaryQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { FileText, Trash2, Pill, Stethoscope, NotebookText, CalendarClock, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function History() {
  const { data: prescriptions, isLoading: isLoadingList } = useListPrescriptions();
  const { data: summary, isLoading: isLoadingSummary } = useGetPrescriptionSummary();
  const deleteMutation = useDeletePrescription();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this scan?")) return;

    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPrescriptionSummaryQueryKey() });
        toast({ title: "Scan deleted successfully" });
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
        <p className="text-muted-foreground mt-1">Review all previously analyzed prescriptions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="relative p-3 bg-primary/20 rounded-xl text-primary">
              <NotebookText className="w-6 h-6" />
              <Stethoscope className="w-3.5 h-3.5 absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-[1px] ring-2 ring-[var(--card,white)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Scans</p>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-3xl font-bold text-primary">{summary?.totalScans || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-xl text-primary">
              <Pill className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Medications Identified</p>
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-3xl font-bold text-primary">{summary?.totalMedications || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">All Records</h2>

        {isLoadingList ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : prescriptions?.length === 0 ? (
          <Card className="py-12 text-center bg-muted/30">
            <CardContent>
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No scans yet</h3>
              <p className="text-muted-foreground mb-6">Upload your first prescription to see it here.</p>
              <Link href="/">
                <Button>Start Scan</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {prescriptions?.map((p) => (
              <Link key={p.id} href={`/prescriptions/${p.id}`} className="block group">
                <Card className="transition-all hover:border-primary/50 hover:shadow-md">
                  <CardContent className="p-4 flex items-center gap-4">
                    {p.imageData && p.imageMimeType ? (
                      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-border bg-muted">
                        <img
                          src={`data:${p.imageMimeType};base64,${p.imageData}`}
                          alt="Prescription"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg shrink-0 border border-border bg-muted flex items-center justify-center text-muted-foreground">
                        <FileText className="w-8 h-8" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                        {p.patientName ? `Prescription for ${p.patientName}` : `Scan #${p.id}`}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {format(new Date(p.createdAt), "MMM d, yyyy · h:mm a")}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Pill className="w-3.5 h-3.5" />
                          {p.medications?.length || 0} medication{(p.medications?.length || 0) !== 1 ? "s" : ""}
                        </span>
                        {p.doctorName && (
                          <>
                            <span>•</span>
                            <span className="truncate">Dr. {p.doctorName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => handleDelete(p.id, e)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
