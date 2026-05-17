import { Link, useLocation } from "wouter";
import { Stethoscope, History, ScanLine } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary">
            <Stethoscope className="w-6 h-6" />
            <span className="font-semibold text-lg tracking-tight">RxScan</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link 
              href="/" 
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${location === "/" ? "text-primary" : "text-muted-foreground"}`}
            >
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">New Scan</span>
            </Link>
            <Link 
              href="/history" 
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${location.startsWith("/history") ? "text-primary" : "text-muted-foreground"}`}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
