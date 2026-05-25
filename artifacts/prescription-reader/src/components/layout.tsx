import { Link, useLocation } from "wouter";
import { History, ScanLine, MessageCircle, LogOut, User, Mic } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { PharmalyzerLogo } from "@/components/pharmalyzer-logo";
import { FloatingActionButton } from "@/components/floating-action-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <FloatingActionButton />
      <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary">
            <PharmalyzerLogo size={28} />
            <span className="font-semibold text-lg tracking-tight">Pharmalyzer</span>
          </Link>
          <nav className="flex items-center gap-5">
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
            <Link
              href="/chat"
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${location.startsWith("/chat") ? "text-primary" : "text-muted-foreground"}`}
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Ask SUR</span>
            </Link>
            <Link
              href="/voice"
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${location.startsWith("/voice") ? "text-primary" : "text-muted-foreground"}`}
            >
              <Mic className="w-4 h-4" />
              <span className="hidden sm:inline">Voice</span>
            </Link>

            {/* User dropdown */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="hidden md:inline text-sm max-w-32 truncate">{user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground">Signed in</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-destructive focus:text-destructive cursor-pointer gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
