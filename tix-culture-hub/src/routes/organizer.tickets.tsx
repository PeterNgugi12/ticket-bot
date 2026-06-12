import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/organizer/tickets")({
  component: OrganizerTickets,
});

interface Ticket {
  id: string;
  ticket_number: string;
  attendee_name: string;
  event_title: string;
  tier_name: string;
  purchase_price: number;
  created_at: string;
  status: string;
}

function OrganizerTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      // Fetch all events for the organizer first
      const eventsResponse = await api.getMyEvents() as any;
      if (eventsResponse?.success) {
        const events = eventsResponse.data.events || [];
        
        // Fetch tickets for each event
        let allTickets: Ticket[] = [];
        for (const event of events) {
          try {
            const ticketsResponse = await api.getEventTickets(event.id) as any;
            if (ticketsResponse?.success) {
              const eventTickets = ticketsResponse.data.tickets.map((t: any) => ({
                id: t.id,
                ticket_number: t.ticket_number,
                attendee_name: t.attendee_name || t.user_name || 'Anonymous',
                event_title: event.title,
                tier_name: t.tier_name,
                purchase_price: t.purchase_price,
                created_at: t.created_at,
                status: t.status,
              }));
              allTickets = [...allTickets, ...eventTickets];
            }
          } catch (error) {
            console.error(`Failed to fetch tickets for event ${event.id}:`, error);
          }
        }
        setTickets(allTickets);
      }
    } catch (error: any) {
      console.error("Failed to fetch tickets:", error);
      toast.error(error.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    if (!price) return "KES 0";
    return `KES ${price.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getTicketTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'vvip':
        return 'bg-purple-500/20 text-purple-500';
      case 'vip':
        return 'bg-yellow-500/20 text-yellow-500';
      default:
        return 'bg-blue-500/20 text-blue-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'valid':
        return 'bg-green-500/20 text-green-500';
      case 'used':
        return 'bg-gray-500/20 text-gray-500';
      case 'resold':
        return 'bg-yellow-500/20 text-yellow-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  const filtered = tickets.filter(t => {
    const matchSearch = t.ticket_number?.toLowerCase().includes(search.toLowerCase()) || 
                        t.attendee_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || t.status === filter;
    return matchSearch && matchFilter;
  });

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(filtered, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ticket Management</h1>
        <p className="text-sm text-muted-foreground mt-1">{tickets.length} total tickets</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ticket ID or buyer..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-input text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
          />
        </div>
        <div className="flex gap-2">
          {["all", "valid", "used", "resold"].map(f => (
            <Button 
              key={f} 
              variant={filter === f ? "default" : "ghost"} 
              size="sm" 
              onClick={() => setFilter(f)} 
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No tickets found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 font-medium text-muted-foreground">Ticket ID</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Event</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Price</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((t, i) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <td className="p-4 font-mono text-xs">{t.ticket_number || t.id}</td>
                    <td className="p-4">{t.attendee_name}</td>
                    <td className="p-4 text-muted-foreground">{t.event_title}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTicketTypeColor(t.tier_name)}`}>
                        {t.tier_name || "Regular"}
                      </span>
                    </td>
                    <td className="p-4">{formatPrice(t.purchase_price)}</td>
                    <td className="p-4 text-muted-foreground">{formatDate(t.created_at)}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalItems > 0 && (
          <div className="px-4 pb-4">
            <TablePagination 
              currentPage={currentPage} 
              totalPages={totalPages} 
              totalItems={totalItems} 
              onPageChange={goToPage} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
