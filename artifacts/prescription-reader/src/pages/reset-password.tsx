import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PharmalyzerLogo } from "@/components/pharmalyzer-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return "Password must contain at least one special character";
  return null;
}

export function ResetPassword() {
  const [, setLocation] = useLocation();

  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const pwErr = validatePassword(password);
    if (pwErr) next.password = pwErr;
    if (confirm !== password) next.confirm = "Passwords do not match";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset password");
      setDone(true);
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-primary">
            <PharmalyzerLogo size={36} />
            <span className="text-2xl font-bold tracking-tight">Pharmalyzer</span>
          </div>
          <p className="text-sm text-muted-foreground">Choose a new password</p>
        </div>

        <Card className="shadow-sm">
          {!token ? (
            <CardContent className="pt-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold">Invalid reset link</h2>
                <p className="text-sm text-muted-foreground">
                  This link is missing its reset code. Please request a new password reset.
                </p>
              </div>
              <Button className="w-full" onClick={() => setLocation("/forgot-password")}>
                Request a new link
              </Button>
            </CardContent>
          ) : done ? (
            <CardContent className="pt-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold">Password updated</h2>
                <p className="text-sm text-muted-foreground">
                  Your password has been changed. You can now sign in with your new password.
                </p>
              </div>
              <Button className="w-full" onClick={() => setLocation("/login")}>
                Sign in
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Set a new password</CardTitle>
                <CardDescription>Enter and confirm your new password.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {errors.form && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                      {errors.form}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="password">New password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter a new password"
                        autoComplete="new-password"
                        value={password}
                        onChange={e => { setPassword(e.target.value); if (errors.password) setErrors(p => ({ ...p, password: undefined })); }}
                        className={errors.password ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirm new password</Label>
                    <Input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); if (errors.confirm) setErrors(p => ({ ...p, confirm: undefined })); }}
                      className={errors.confirm ? "border-destructive focus-visible:ring-destructive" : ""}
                      disabled={loading}
                    />
                    {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : "Update password"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
