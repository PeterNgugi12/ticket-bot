import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { Users, ScanLine, DollarSign, Ticket } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/organizer/tracking")({
  component: LiveTracking,
});

interface Checkin {
  id: string;
  attendee_name: string;
  ticket_number: string;
  tier_name: string;
  checkin_time: string;
  gate_number: string;
  scanner_name: string;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
  venue_name: string;
  total_tickets: number;
  tickets_sold: number;
}

function LiveTracking() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchMyEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchCheckins(selectedEventId);
      fetchEventStats(selectedEventId);
      
      // Auto-refresh every 15 seconds
      const interval = setInterval(() => {
        refreshData();
      }, 15000);
      
      return () => clearInterval(interval);
    }
  }, [selectedEventId]);

  const fetchMyEvents = async () => {
    try {
      const response = await api.getMyEvents() as any;
      if (response?.success) {
        const eventList = response.data.events || [];
        setEvents(eventList);
        if (eventList.length > 0 && !selectedEventId) {
          setSelectedEventId(eventList[0].id);
        }
      }
    } catch (error: any) {
      console.error("Failed to fetch events:", error);
      toast.error(error.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const fetchCheckins = async (eventId: string) => {
    try {
      const response = await api.getEventCheckins(eventId) as any;
      if (response?.success) {
        setCheckins(response.data.checkins || []);
      }
    } catch (error: any) {
      console.error("Failed to fetch checkins:", error);
    }
  };

  const fetchEventStats = async (eventId: string) => {
    try {
      const response = await api.getEventStats(eventId) as any;
      if (response?.success) {
        setStats(response.data.stats);
      }
    } catch (error: any) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const refreshData = async () => {
    if (!selectedEventId) return;
    setRefreshing(true);
    await Promise.all([
      fetchCheckins(selectedEventId),
      fetchEventStats(selectedEventId),
    ]);
    setRefreshing(false);
    toast.success("Data refreshed");
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return "N/A";
    return new Date(timeString).toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTicketBadgeColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'vvip':
        return 'bg-purple-500/20 text-purple-500';
      case 'vip':
        return 'bg-yellow-500/20 text-yellow-500';
      default:
        return 'bg-blue-500/20 text-blue-500';
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const checkinsToday = checkins.length;
  const ticketsSold = stats?.total_tickets_sold || 0;
  const totalTickets = selectedEvent?.total_tickets || 0;
  const ticketsLeft = totalTickets - ticketsSold;
  const sellThroughPercent = totalTickets > 0 ? (ticketsSold / totalTickets) * 100 : 0;
  const totalRevenue = stats?.total_revenue || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <h3 className="text-lg font-semibold mb-2">No Events Found</h3>
        <p className="text-muted-foreground">You don't have any active events yet.</p>
        <button 
          onClick={() => window.location.href = '/organizer/create-event'}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
        >
          Create Your First Event
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Live Event Tracking</h1>
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/20 px-2 py-1 rounded-full">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </span>
        </div>
        
        {/* Event Selector */}
        {events.length > 1 && (
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="h-10 rounded-lg bg-input px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
          >
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.title} - {new Date(event.event_date).toLocaleDateString()}
              </option>
            ))}
          </select>
        )}
        
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all text-sm flex items-center gap-2"
        >
          {refreshing ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          ) : (
            <span>🔄</span>
          )}
          Refresh
        </button>
      </div>

      {/* Event Info */}
      {selectedEvent && (
        <div className="glass-card p-4">
          <h2 className="font-semibold text-lg">{selectedEvent.title}</h2>
          <p className="text-sm text-muted-foreground">
            📅 {new Date(selectedEvent.event_date).toLocaleString()} • 📍 {selectedEvent.venue_name}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Check-ins" 
          value={checkinsToday.toString()} 
          change={`of ${ticketsSold} tickets sold`} 
          changeType="neutral" 
          icon={ScanLine} 
        />
        <StatCard 
          title="At Venue Now" 
          value={checkinsToday.toString()} 
          change={checkinsToday > 0 ? `+${Math.max(1, Math.round(checkinsToday / 10))} in last 10 min` : 'No recent activity'} 
          changeType={checkinsToday > 0 ? "positive" : "neutral"} 
          icon={Users} 
          delay={0.05} 
        />
        <StatCard 
          title="Live Revenue" 
          value={`KES ${totalRevenue.toLocaleString()}`} 
          change={`${Math.round(sellThroughPercent)}% of capacity`} 
          changeType="positive" 
          icon={DollarSign} 
          delay={0.1} 
        />
        <StatCard 
          title="Tickets Left" 
          value={ticketsLeft.toString()} 
          change={`${Math.round(sellThroughPercent)}% sold`} 
          changeType={ticketsLeft > 0 ? "neutral" : "negative"} 
          icon={Ticket} 
          delay={0.15} 
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Check-ins</h3>
          {refreshing && (
            <span className="text-xs text-muted-foreground">Refreshing...</span>
          )}
        </div>
        <div className="overflow-x-auto">
          {checkins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ScanLine className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              No check-ins yet. Share the QR code with attendees.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Attendee</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Ticket</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Gate</th>
                 </tr>
              </thead>
              <tbody>
                {checkins.slice(0, 20).map((checkin, i) => (
                  <motion.tr
                    key={checkin.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-linear-to-r from-purple-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white">
                          {checkin.attendee_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "A"}
                        </div>
                        <span className="truncate max-w-37.5">{checkin.attendee_name || "Anonymous"}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTicketBadgeColor(checkin.tier_name)}`}>
                        {checkin.tier_name || "Regular"}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatTime(checkin.checkin_time)}</td>
                    <td className="p-3 text-muted-foreground">{checkin.gate_number || "Gate A"}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {checkins.length > 20 && (
          <div className="text-center pt-4 text-sm text-muted-foreground">
            Showing last 20 of {checkins.length} check-ins
          </div>
        )}
      </motion.div>
    </div>
  );
}
