// src/routes/login.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Music, ArrowRight, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — TIX CULTURE" },
      { name: "description", content: "Sign in to your TIX CULTURE dashboard" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }

    try {
      const response = await login({ email, password });
      
      // Get the user role from the response
      const userRole = response?.data?.user?.role;
      
      // Redirect based on actual user role from database
      if (userRole === 'admin' || userRole === 'super_admin') {
        navigate({ to: "/admin" });
      } else if (userRole === 'organizer') {
        navigate({ to: "/organizer" });
      } else {
        // Regular user - redirect to home
        navigate({ to: "/" });
      }
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
    }
  };

  // Demo credentials helper
  const fillDemoCredentials = (type: "admin" | "organizer") => {
    if (type === "admin") {
      setEmail("admin@tixculture.com");
      setPassword("admin123");
    } else {
      setEmail("peterevent12345@gmail.com");
      setPassword("58276900Simon@");
    }
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-[100px] animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-chart-2/10 blur-[100px] animate-pulse-slow" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="glass-card p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary glow">
              <Music className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold gradient-text">TIX CULTURE</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your dashboard</p>
            </div>
          </div>

          {/* Demo credentials hint */}
          <div className="bg-accent/30 rounded-lg p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">🔑 Demo Credentials</p>
            <p className="mb-1"><span className="font-medium">Admin:</span> admin@tixculture.com / admin123</p>
            <p><span className="font-medium">Organizer:</span> peterevent12345@gmail.com / 58276900Simon@</p>
            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => fillDemoCredentials("admin")}
                className="text-primary hover:underline text-xs"
              >
                Fill Admin
              </button>
              <button 
                onClick={() => fillDemoCredentials("organizer")}
                className="text-primary hover:underline text-xs"
              >
                Fill Organizer
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  className="w-full h-10 rounded-lg bg-input pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 rounded-lg bg-input pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" className="rounded border-border" />
                Remember me
              </label>
              <a href="#" className="text-primary hover:underline">Forgot password?</a>
            </div>
            <Button type="submit" variant="neon" size="xl" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"} <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Protected dashboard • Authorized access only
          </p>
        </div>
      </motion.div>
    </div>
  );
}