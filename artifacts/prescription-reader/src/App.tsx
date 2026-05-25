import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { Home } from "@/pages/home";
import { History } from "@/pages/history";
import { PrescriptionDetail } from "@/pages/prescription-detail";
import { Chat } from "@/pages/chat";
import { Voice } from "@/pages/voice";
import { Login } from "@/pages/login";
import { Signup } from "@/pages/signup";
import { AuthProvider, useAuth } from "@/context/auth";
import { PendingUploadProvider } from "@/context/pending-upload";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/">
        {() => (
          <Layout>
            <ProtectedRoute component={Home} />
          </Layout>
        )}
      </Route>
      <Route path="/history">
        {() => (
          <Layout>
            <ProtectedRoute component={History} />
          </Layout>
        )}
      </Route>
      <Route path="/prescriptions/:id">
        {() => (
          <Layout>
            <ProtectedRoute component={PrescriptionDetail} />
          </Layout>
        )}
      </Route>
      <Route path="/chat">
        {() => (
          <Layout>
            <ProtectedRoute component={Chat} />
          </Layout>
        )}
      </Route>
      <Route path="/voice">
        {() => (
          <Layout>
            <ProtectedRoute component={Voice} />
          </Layout>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <PendingUploadProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </PendingUploadProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
