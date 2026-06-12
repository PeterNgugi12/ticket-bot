import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Calendar, Users, DollarSign, ShieldAlert, Settings,
  Ticket, ScanLine, Wallet, BarChart3, PlusCircle, ChevronLeft, ChevronRight, Music, UsersRound
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

const adminNav: NavItem[] = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Events", to: "/admin/events", icon: Calendar },
  { label: "Organizers", to: "/admin/organizers", icon: Users },
  { label: "Users", to: "/admin/tickets", icon: Users },
  { label: "Finance", to: "/admin/finance", icon: DollarSign },
  { label: "Disputes", to: "/admin/disputes", icon: ShieldAlert },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

const organizerNav: NavItem[] = [
  { label: "Overview", to: "/organizer", icon: LayoutDashboard },
  { label: "Create Event", to: "/organizer/create-event", icon: PlusCircle },
  { label: "My Events", to: "/organizer/events", icon: Calendar },
  { label: "Live Tracking", to: "/organizer/tracking", icon: BarChart3 },
  { label: "Scanner", to: "/organizer/scanner", icon: ScanLine },
  { label: "Earnings", to: "/organizer/earnings", icon: Wallet },
  { label: "Tickets", to: "/organizer/tickets", icon: Ticket },
  { label: "Team", to: "/organizer/team", icon: UsersRound },
  { label: "Settings", to: "/organizer/settings", icon: Settings },
];

export function DashboardSidebar({ role }: { role: "admin" | "organizer" }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const nav = role === "admin" ? adminNav : organizerNav;

  const isActive = (to: string) => {
    if (to === `/${role}`) return location.pathname === `/${role}`;
    return location.pathname.startsWith(to);
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-screen bg-sidebar border-r border-sidebar-border shrink-0 overflow-hidden"
    >
      <div className="flex items-center gap-2 p-4 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary shrink-0">
          <Music className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden">
            <span className="text-base font-bold gradient-text">TIX CULTURE</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {role === "admin" ? "Super Admin" : "Organizer"}
            </p>
          </motion.div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                active
                  ? "bg-sidebar-accent text-sidebar-primary glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className={`h-5 w-5 shrink-0 ${active ? "text-sidebar-primary" : ""}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center p-3 border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </motion.aside>
  );
}
