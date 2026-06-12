// admin/events.tsx - USING ONLY EXISTING ENDPOINTS
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, Eye, Pause, Play, Trash2, Calendar, MapPin, Users, DollarSign, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/events")({
  component: AdminEvents,
});

interface Event {
  id: string;
  title: string;
  description: string;
  organizer_id: string;
  organizer_name?: string;
  event_date: string;
  venue_name: string;
  total_tickets: number;
  tickets_sold: number;
  status: string;
  revenue?: number;
  image_url?: string;
  created_at: string;
}

function AdminEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const getTicketPrice = (ticket: any): number => {
    const price = ticket.purchase_price || ticket.price || ticket.amount || ticket.total_amount || 0;
    return typeof price === 'number' ? price : parseFloat(price) || 0;
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let allEvents: Event[] = [];
      const eventsMap = new Map<string, Event>();
      
      console.log("=== FETCHING EVENTS FROM USERS ===");
      
      // Get all users
      const usersResponse = await api.getAllUsers({ limit: 200 }) as any;
      
      if (usersResponse?.success && usersResponse.data?.users) {
        const users = usersResponse.data.users;
        
        // Find organizers
        const organizers = users.filter((u: any) => u.role === 'organizer');
        console.log(`Found ${organizers.length} organizers`);
        
        // For each organizer, fetch their events
        for (const organizer of organizers) {
          try {
            // Try to get events from user details
            const userDetails = await api.getUserDetails(organizer.id) as any;
            
            // Also try to get events through the my-events endpoint (works for the logged-in user only)
            // So we need a different approach - check if the organizer has created events
            // by looking at their tickets or using a different method
            
            // Alternative: Get all events by fetching tickets and extracting event info
            const userTickets = userDetails?.data?.user?.recentTickets || [];
            
            for (const ticket of userTickets) {
              if (ticket.event_id && !eventsMap.has(ticket.event_id)) {
                eventsMap.set(ticket.event_id, {
                  id: ticket.event_id,
                  title: ticket.event_title || 'Unknown Event',
                  description: '',
                  organizer_id: organizer.id,
                  organizer_name: organizer.full_name,
                  event_date: ticket.event_date || new Date().toISOString(),
                  venue_name: ticket.venue_name || 'TBD',
                  total_tickets: 0,
                  tickets_sold: 0,
                  status: ticket.status === 'valid' ? 'published' : 'draft',
                  revenue: 0,
                  created_at: ticket.created_at,
                });
              }
            }
          } catch (error) {
            console.error(`Failed to fetch data for organizer ${organizer.id}:`, error);
          }
        }
      }
      
      // Also try to get events from the getMyEvents for each organizer (if possible with different auth)
      // Since we can't directly call getMyEvents for other users, we use the ticket method above
      
      // Now fetch ticket details for each event to calculate revenue
      const eventsList = Array.from(eventsMap.values());
      console.log(`Found ${eventsList.length} unique events from tickets`);
      
      const eventsWithRevenue = await Promise.all(
        eventsList.map(async (event) => {
          let revenue = 0;
          let ticketsSold = 0;
          
          try {
            // Try to get tickets for this event
            const ticketsResponse = await api.getEventTickets(event.id) as any;
            if (ticketsResponse?.success && ticketsResponse.data?.tickets) {
              const tickets = ticketsResponse.data.tickets;
              for (const ticket of tickets) {
                if (ticket.status === 'valid' || ticket.status === 'used') {
                  revenue += getTicketPrice(ticket);
                  ticketsSold++;
                }
              }
            }
          } catch (error) {
            console.error(`Failed to fetch tickets for event ${event.id}:`, error);
          }
          
          return {
            ...event,
            revenue: revenue,
            tickets_sold: ticketsSold,
          };
        })
      );
      
      setEvents(eventsWithRevenue);
      
      if (eventsWithRevenue.length === 0) {
        setError("No events found. Events will appear here once tickets are purchased.");
      }
      
    } catch (error: any) {
      console.error("Failed to fetch events:", error);
      setError(error.message || "Failed to load events");
      toast.error(error.message || "Failed to load events");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
    toast.success("Events refreshed");
  };

  const handleUpdateStatus = async (eventId: string, newStatus: string) => {
    try {
      const response = await api.updateEventStatus(eventId, newStatus) as any;
      if (response?.success) {
        toast.success(`Event ${newStatus === 'published' ? 'activated' : 'cancelled'} successfully`);
        fetchEvents();
      } else {
        toast.error(response?.message || "Failed to update event status");
      }
    } catch (error: any) {
      console.error("Update status error:", error);
      toast.error(error.message || "Failed to update event status");
    }
  };

  const handleViewDetails = async (eventId: string) => {
    try {
      const response = await api.getEventDetails(eventId) as any;
      if (response?.success) {
        setSelectedEvent(response.data.event);
        setShowDetailsModal(true);
      } else {
        // Find event from our list
        const event = events.find(e => e.id === eventId);
        if (event) {
          setSelectedEvent(event);
          setShowDetailsModal(true);
        }
      }
    } catch (error: any) {
      console.error("Failed to fetch event details:", error);
      // Use local event data
      const event = events.find(e => e.id === eventId);
      if (event) {
        setSelectedEvent(event);
        setShowDetailsModal(true);
      } else {
        toast.error("Failed to load event details");
      }
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return;
    }
    
    try {
      const response = await api.deleteEvent(eventId) as any;
      if (response?.success) {
        toast.success("Event deleted successfully");
        fetchEvents();
      } else {
        toast.error(response?.message || "Failed to delete event");
      }
    } catch (error: any) {
      console.error("Delete event error:", error);
      toast.error(error.message || "Failed to delete event");
    }
  };

  const filtered = events.filter(e => {
    const matchSearch = e.title?.toLowerCase().includes(search.toLowerCase()) || 
                        e.venue_name?.toLowerCase().includes(search.toLowerCase()) ||
                        e.organizer_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || e.status === filter;
    return matchSearch && matchFilter;
  });

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(filtered, 5);

  const formatDate = (dateString: string) => {
    if (!dateString) return "TBD";
    return new Date(dateString).toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  };

  const formatRevenue = (amount: number) => {
    if (!amount || isNaN(amount)) return "KES 0";
    if (amount >= 1000000) {
      return `KES ${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `KES ${(amount / 1000).toFixed(1)}K`;
    }
    return `KES ${amount.toLocaleString()}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
      case 'active':
        return 'bg-green-500/20 text-green-500';
      case 'draft':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'cancelled':
        return 'bg-red-500/20 text-red-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'published':
        return 'active';
      case 'draft':
        return 'draft';
      case 'cancelled':
        return 'cancelled';
      default:
        return status || 'unknown';
    }
  };

  // Calculate summary stats
  const totalEvents = events.length;
  const totalRevenue = events.reduce((sum, e) => sum + (e.revenue || 0), 0);
  const totalTicketsSold = events.reduce((sum, e) => sum + (e.tickets_sold || 0), 0);
  const activeEvents = events.filter(e => e.status === 'published').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Event Management</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalEvents} total events on platform</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Total Events</p>
          <p className="text-2xl font-bold mt-1">{totalEvents}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Active Events</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{activeEvents}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Tickets Sold</p>
          <p className="text-2xl font-bold mt-1 text-blue-500">{totalTicketsSold.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{formatRevenue(totalRevenue)}</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="glass-card p-4 bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{error}</p>
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
            placeholder="Search events by title, venue, or organizer..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-input text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
          />
        </div>
        <div className="flex gap-2">
          {["all", "published", "draft", "cancelled"].map(f => (
            <Button 
              key={f} 
              variant={filter === f ? "default" : "ghost"} 
              size="sm" 
              onClick={() => setFilter(f)} 
              className="capitalize"
            >
              {f === "all" ? "All" : f === "published" ? "Active" : f}
            </Button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="grid gap-4">
        {paginatedItems.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No events found</p>
            <p className="text-xs text-muted-foreground mt-1">Events will appear here once tickets are purchased</p>
          </div>
        ) : (
          paginatedItems.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-accent/30 transition-colors"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl gradient-primary text-white text-lg font-bold shrink-0">
                {event.title?.charAt(0) || 'E'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{event.title || 'Untitled Event'}</h3>
                <p className="text-sm text-muted-foreground">
                  {event.organizer_name || 'Unknown Organizer'} • {formatDate(event.event_date)}
                </p>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {event.tickets_sold || 0}/{event.total_tickets || 0} tickets
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.venue_name || 'TBD'}
                  </span>
                  <span className="text-xs font-medium text-green-500 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatRevenue(event.revenue || 0)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(event.status)}`}>
                    {getStatusLabel(event.status)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleViewDetails(event.id)}
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {event.status === 'published' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleUpdateStatus(event.id, 'cancelled')}
                    title="Cancel Event"
                    className="text-yellow-500 hover:text-yellow-600"
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                {event.status === 'cancelled' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleUpdateStatus(event.id, 'published')}
                    title="Reactivate Event"
                    className="text-green-500 hover:text-green-600"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleDeleteEvent(event.id)}
                  title="Delete Event"
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {totalItems > 0 && (
        <TablePagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={totalItems} 
          onPageChange={goToPage} 
        />
      )}

      {/* Event Details Modal */}
      {showDetailsModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-2xl space-y-5 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Event Details</h2>
              <button 
                onClick={() => { setShowDetailsModal(false); setSelectedEvent(null); }} 
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-xl">{selectedEvent.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedEvent.description || 'No description'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">Date</span>
                  </div>
                  <p className="font-medium">{formatDate(selectedEvent.event_date)}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">Venue</span>
                  </div>
                  <p className="font-medium">{selectedEvent.venue_name || 'TBD'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Tickets</span>
                  </div>
                  <p className="font-medium">{selectedEvent.tickets_sold || 0} / {selectedEvent.total_tickets || 0} sold</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm">Revenue</span>
                  </div>
                  <p className="font-medium text-green-500">{formatRevenue(selectedEvent.revenue || 0)}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <h4 className="font-medium mb-2">Organizer</h4>
                <p>{selectedEvent.organizer_name || 'Unknown'}</p>
              </div>

              {selectedEvent.image_url && (
                <div className="pt-4 border-t border-border">
                  <h4 className="font-medium mb-2">Event Image</h4>
                  <img 
                    src={selectedEvent.image_url} 
                    alt={selectedEvent.title} 
                    className="rounded-lg max-h-48 w-auto object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              {selectedEvent.status === 'published' && (
                <Button 
                  variant="default" 
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white"
                  onClick={() => {
                    handleUpdateStatus(selectedEvent.id, 'cancelled');
                    setShowDetailsModal(false);
                  }}
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Cancel Event
                </Button>
              )}
              {selectedEvent.status === 'cancelled' && (
                <Button 
                  variant="default" 
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                  onClick={() => {
                    handleUpdateStatus(selectedEvent.id, 'published');
                    setShowDetailsModal(false);
                  }}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Reactivate Event
                </Button>
              )}
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={() => {
                  handleDeleteEvent(selectedEvent.id);
                  setShowDetailsModal(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Event
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}