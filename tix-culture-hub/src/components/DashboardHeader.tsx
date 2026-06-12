import { Bell, Search, LogOut } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function DashboardHeader({ role }: { role: "admin" | "organizer" }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-card/50 backdrop-blur-md shrink-0">
      <div className="flex items-center gap-3">
        {searchOpen ? (
          <input
            autoFocus
            onBlur={() => setSearchOpen(false)}
            placeholder="Search events, users, tickets..."
            className="h-8 w-72 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
          />
        ) : (
          <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden md:inline-flex h-5 items-center rounded border border-border px-1.5 text-[10px] text-muted-foreground">⌘K</kbd>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
          {role === "admin" ? "SA" : "EO"}
        </div>
        <Link to="/login">
          <Button variant="ghost" size="icon">
            <LogOut className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
