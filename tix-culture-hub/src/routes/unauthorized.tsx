// src/routes/unauthorized.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/unauthorized")({
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-12 w-12 text-destructive" />
          </div>
        </div>
        <h1 className="text-4xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to access this page. Please contact your administrator if you believe this is an error.
        </p>
        <Link to="/">
          <button className="gradient-primary text-white px-6 py-2 rounded-lg inline-flex items-center gap-2 hover:opacity-90 transition">
            <ArrowLeft className="h-4 w-4" />
            Go Back Home
          </button>
        </Link>
      </div>
    </div>
  );
}