// admin/tickets.tsx - FIXED with proper revenue calculation
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, Eye, Ticket as TicketIcon, User, Calendar, DollarSign, RefreshCw, Filter, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/tickets")({
  component: AdminTickets,
});

interface AdminTicket {
  id: string;
  ticket_number: string;
  attendee_name: string;
  attendee_email: string;
  attendee_phone: string;
  event_title: string;
  event_id: string;
  organizer_name: string;
  tier_name: string;
  purchase_price: number;
  created_at: string;
  status: string;
  used_at?: string;
  scanned_by?: string;
}

interface Stats {
  total_tickets: number;
  total_revenue: number;
  valid_tickets: number;
  used_tickets: number;
  resold_tickets: number;
  cancelled_tickets: number;
  average_price: number;
}

function AdminTickets() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_tickets: 0,
    total_revenue: 0,
    valid_tickets: 0,
    used_tickets: 0,
    resold_tickets: 0,
    cancelled_tickets: 0,
    average_price: 0,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<AdminTicket | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllTickets();
  }, []);

  const getTicketPrice = (ticket: any): number => {
    // Try multiple possible price field names
    const price = ticket.purchase_price || ticket.price || ticket.amount || ticket.total_amount || ticket.ticket_price || 0;
    // Ensure it's a number
    const numericPrice = typeof price === 'number' ? price : parseFloat(price) || 0;
    console.log(`Ticket ${ticket.id} price:`, numericPrice, 'from fields:', { purchase_price: ticket.purchase_price, price: ticket.price, amount: ticket.amount });
    return numericPrice;
  };

  const fetchAllTickets = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      
      let allTickets: AdminTicket[] = [];
      let totalRevenueCalculated = 0;
      
      // Approach 1: Fetch tickets from events directly (most reliable)
      console.log("Fetching tickets from events...");
      try {
        const eventsResponse = await api.getAllEvents({ limit: 100 }) as any;
        if (eventsResponse?.success) {
          const events = eventsResponse.data.events || [];
          console.log(`Found ${events.length} events`);
          
          for (const event of events) {
            try {
              const ticketRes = await api.getEventTickets(event.id) as any;
              if (ticketRes?.success && ticketRes.data?.tickets) {
                console.log(`Event "${event.title}" has ${ticketRes.data.tickets.length} tickets`);
                
                const eventTickets = ticketRes.data.tickets.map((t: any) => {
                  const price = getTicketPrice(t);
                  totalRevenueCalculated += price;
                  return {
                    id: t.id,
                    ticket_number: t.ticket_number,
                    attendee_name: t.attendee_name || t.user_name || 'Anonymous',
                    attendee_email: t.attendee_email || 'N/A',
                    attendee_phone: t.attendee_phone || 'N/A',
                    event_title: event.title,
                    event_id: event.id,
                    organizer_name: event.organizer_name || 'Unknown',
                    tier_name: t.tier_name,
                    purchase_price: price,
                    created_at: t.created_at,
                    status: t.status,
                    used_at: t.used_at,
                    scanned_by: t.scanned_by,
                  };
                });
                allTickets = [...allTickets, ...eventTickets];
              }
            } catch (error) {
              console.error(`Failed to fetch tickets for event ${event.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch events:", error);
      }
      
      // Approach 2: Fetch tickets from user details as fallback
      if (allTickets.length === 0) {
        console.log("No tickets found from events, trying user details...");
        try {
          const usersResponse = await api.getAllUsers({ limit: 100 }) as any;
          if (usersResponse?.success) {
            const users = usersResponse.data.users || [];
            
            for (const user of users) {
              try {
                const userDetails = await api.getUserDetails(user.id) as any;
                if (userDetails?.success && userDetails.data.user.recentTickets) {
                  const userTickets = userDetails.data.user.recentTickets.map((t: any) => {
                    const price = getTicketPrice(t);
                    totalRevenueCalculated += price;
                    return {
                      id: t.id,
                      ticket_number: t.ticket_number,
                      attendee_name: t.attendee_name || user.full_name || 'Anonymous',
                      attendee_email: user.email,
                      attendee_phone: user.phone_number,
                      event_title: t.event_title || 'Unknown Event',
                      event_id: t.event_id,
                      organizer_name: t.organizer_name || 'Unknown Organizer',
                      tier_name: t.tier_name,
                      purchase_price: price,
                      created_at: t.created_at,
                      status: t.status,
                      used_at: t.used_at,
                      scanned_by: t.scanned_by,
                    };
                  });
                  allTickets = [...allTickets, ...userTickets];
                }
              } catch (error) {
                console.error(`Failed to fetch tickets for user ${user.id}:`, error);
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch users:", error);
        }
      }
      
      // Remove duplicates by ID
      const uniqueTickets = Array.from(new Map(allTickets.map(t => [t.id, t])).values());
      
      // Calculate stats
      const validTickets = uniqueTickets.filter(t => t.status === 'valid');
      const usedTickets = uniqueTickets.filter(t => t.status === 'used');
      const resoldTickets = uniqueTickets.filter(t => t.status === 'resold');
      const cancelledTickets = uniqueTickets.filter(t => t.status === 'cancelled');
      
      // Recalculate total revenue from unique tickets
      const totalRevenue = uniqueTickets.reduce((sum, t) => sum + (t.purchase_price || 0), 0);
      const averagePrice = uniqueTickets.length > 0 ? totalRevenue / uniqueTickets.length : 0;
      
      console.log(`Total tickets found: ${uniqueTickets.length}`);
      console.log(`Total revenue calculated: ${totalRevenue}`);
      console.log(`Average price: ${averagePrice}`);
      
      setStats({
        total_tickets: uniqueTickets.length,
        total_revenue: totalRevenue,
        valid_tickets: validTickets.length,
        used_tickets: usedTickets.length,
        resold_tickets: resoldTickets.length,
        cancelled_tickets: cancelledTickets.length,
        average_price: averagePrice,
      });
      
      setTickets(uniqueTickets);
      
      if (uniqueTickets.length === 0) {
        setFetchError("No tickets found. Make sure tickets have been purchased.");
      }
      
    } catch (error: any) {
      console.error("Failed to fetch tickets:", error);
      setFetchError(error.message || "Failed to load tickets");
      toast.error(error.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (!amount || isNaN(amount)) return "KES 0";
    if (amount >= 1000000) {
      return `KES ${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `KES ${(amount / 1000).toFixed(1)}K`;
    }
    return `KES ${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'valid':
        return 'bg-green-500/20 text-green-500';
      case 'used':
        return 'bg-blue-500/20 text-blue-500';
      case 'resold':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'cancelled':
        return 'bg-red-500/20 text-red-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
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

  const filtered = tickets.filter(t => {
    const matchSearch = 
      t.ticket_number?.toLowerCase().includes(search.toLowerCase()) || 
      t.attendee_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.event_title?.toLowerCase().includes(search.toLowerCase()) ||
      t.attendee_email?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || t.status === filter;
    return matchSearch && matchFilter;
  });

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(filtered, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Ticket Management</h1>
        <p className="text-sm text-muted-foreground mt-1">View and manage all tickets across the platform</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Tickets</p>
            <TicketIcon className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2">{stats.total_tickets.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <DollarSign className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-green-500">{formatCurrency(stats.total_revenue)}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Valid Tickets</p>
            <span className="h-2 w-2 rounded-full bg-green-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-green-500">{stats.valid_tickets.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Used Tickets</p>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-blue-500">{stats.used_tickets.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Resold Tickets</p>
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-yellow-500">{stats.resold_tickets.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Cancelled</p>
            <span className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-red-500">{stats.cancelled_tickets.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Avg. Price</p>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold mt-2">{formatCurrency(stats.average_price)}</p>
        </div>
      </div>

      {/* Error Message */}
      {fetchError && (
        <div className="glass-card p-4 bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ticket ID, buyer name, event, or email..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-input text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", "valid", "used", "resold", "cancelled"].map(f => (
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
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => fetchAllTickets()}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Tickets Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TicketIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No tickets found</p>
              <p className="text-xs mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="text-left p-4 font-medium text-muted-foreground">Ticket ID</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Event</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Organizer</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Price</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Purchase Date</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((ticket, i) => (
                  <motion.tr
                    key={ticket.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setShowDetailsModal(true);
                    }}
                  >
                    <td className="p-4 font-mono text-xs">{ticket.ticket_number || ticket.id.slice(0, 8)}</td>
                    <td className="p-4">
                      <div>
                        <p className="font-medium text-sm">{ticket.attendee_name}</p>
                        <p className="text-xs text-muted-foreground">{ticket.attendee_email}</p>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground max-w-48 truncate">{ticket.event_title}</td>
                    <td className="p-4 text-muted-foreground text-xs">{ticket.organizer_name}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTicketTypeColor(ticket.tier_name)}`}>
                        {ticket.tier_name || "Regular"}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-green-500">{formatCurrency(ticket.purchase_price)}</td>
                    <td className="p-4 text-muted-foreground text-xs">{formatDate(ticket.created_at)}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                          setShowDetailsModal(true);
                        }}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
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

      {/* Ticket Details Modal */}
      {showDetailsModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-lg space-y-5 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Ticket Details</h2>
              <button 
                onClick={() => { setShowDetailsModal(false); setSelectedTicket(null); }} 
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Ticket Header */}
              <div className="text-center p-4 bg-linear-to-r from-primary/10 to-transparent rounded-lg">
                <TicketIcon className="h-12 w-12 mx-auto text-primary mb-2" />
                <p className="text-xs text-muted-foreground">Ticket Number</p>
                <p className="text-lg font-mono font-bold">{selectedTicket.ticket_number}</p>
              </div>

              {/* Buyer Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" /> Buyer Information
                </h3>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{selectedTicket.attendee_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{selectedTicket.attendee_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">{selectedTicket.attendee_phone || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Event Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Event Information
                </h3>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Event</span>
                    <span className="font-medium">{selectedTicket.event_title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Organizer</span>
                    <span className="font-medium">{selectedTicket.organizer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ticket Type</span>
                    <span className="font-medium">{selectedTicket.tier_name || 'Regular'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price Paid</span>
                    <span className="font-medium text-green-500">{formatCurrency(selectedTicket.purchase_price)}</span>
                  </div>
                </div>
              </div>

              {/* Status Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Status Information</h3>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Purchase Date</span>
                    <span className="font-medium">{formatDate(selectedTicket.created_at)}</span>
                  </div>
                  {selectedTicket.used_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Used At</span>
                      <span className="font-medium">{formatDate(selectedTicket.used_at)}</span>
                    </div>
                  )}
                  {selectedTicket.scanned_by && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scanned By</span>
                      <span className="font-medium">{selectedTicket.scanned_by}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => { setShowDetailsModal(false); setSelectedTicket(null); }}
              >
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}