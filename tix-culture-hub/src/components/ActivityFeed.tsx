import { motion } from "framer-motion";
import { Ticket, CreditCard, ScanLine, AlertTriangle, UserPlus } from "lucide-react";

const activities = [
  { id: 1, icon: Ticket, text: "John Doe bought VIP ticket for Nyege Nyege 2025", time: "2 min ago", color: "text-chart-1" },
  { id: 2, icon: ScanLine, text: "Ticket scanned at Gate A — Safari Sounds", time: "5 min ago", color: "text-success" },
  { id: 3, icon: CreditCard, text: "M-Pesa payment received — KES 3,500", time: "8 min ago", color: "text-chart-2" },
  { id: 4, icon: UserPlus, text: "New organizer registered: EventKings Ltd", time: "12 min ago", color: "text-chart-4" },
  { id: 5, icon: AlertTriangle, text: "Suspicious ticket resale flagged", time: "18 min ago", color: "text-warning" },
  { id: 6, icon: Ticket, text: "Mary W. purchased Regular ticket — Club Night", time: "22 min ago", color: "text-chart-1" },
];

export function ActivityFeed() {
  return (
    <div className="glass-card p-5 space-y-1">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Live Activity</h3>
      <div className="space-y-3">
        {activities.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors"
          >
            <div className={`mt-0.5 ${item.color}`}>
              <item.icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-tight">{item.text}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
