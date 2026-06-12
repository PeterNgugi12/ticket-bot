// organizer/events.tsx
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Eye, Edit, Trash2, Plus, Calendar, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/organizer/events")({
  component: OrganizerEvents,
});

// Define the Event interface properly - adjust property names to match your API
interface Event {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  venue_name?: string;
  tickets_sold?: number;
  total_tickets?: number;
  revenue?: number;
  status: string;
  image_url?: string;
  organizer_id?: string;
  created_at?: string;
  updated_at?: string;
  is_secret?: boolean;
  min_age_restriction?: number;
  category?: string;
  latitude?: number;
  longitude?: number;
}

// Add a simple cache
const eventCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

function OrganizerEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    fetchMyEvents();
    
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchMyEvents = useCallback(async (force = false) => {
    // Check cache first
    const cacheKey = 'my-events';
    const cached = eventCache.get(cacheKey);
    
    if (!force && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('Using cached events');
      setEvents(cached.data);
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      // Fix: api.getMyEvents() doesn't accept options, so call it directly
      const response = await api.getMyEvents() as any;
      
      if (!isMounted.current) return;
      
      if (response?.success) {
        const eventsData = response.data.events || [];
        setEvents(eventsData);
        
        // Update cache
        eventCache.set(cacheKey, {
          data: eventsData,
          timestamp: Date.now()
        });
      } else {
        setEvents([]);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError' && isMounted.current) {
        console.error("Failed to fetch events:", error);
        if (!error.message?.includes('aborted')) {
          toast.error(error.message || "Failed to load events");
        }
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return;
    }
    
    try {
      const response = await api.deleteEvent(eventId) as any;
      if (response?.success) {
        toast.success("Event deleted successfully");
        // Clear cache and refresh
        eventCache.delete('my-events');
        await fetchMyEvents(true);
      } else {
        toast.error(response?.message || "Failed to delete event");
      }
    } catch (error: any) {
      console.error("Delete event error:", error);
      toast.error(error.message || "Failed to delete event");
    }
  };

  const handlePublishEvent = async (eventId: string) => {
    try {
      const response = await api.publishEvent(eventId) as any;
      if (response?.success) {
        toast.success("Event published successfully");
        // Clear cache and refresh
        eventCache.delete('my-events');
        await fetchMyEvents(true);
      } else {
        toast.error(response?.message || "Failed to publish event");
      }
    } catch (error: any) {
      console.error("Publish event error:", error);
      toast.error(error.message || "Failed to publish event");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "TBD";
    return new Date(dateString).toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return "KES 0";
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
        return status;
    }
  };

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(events, 4);

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
          <h1 className="text-2xl font-bold">My Events</h1>
          <p className="text-sm text-muted-foreground mt-1">{events.length} total events</p>
        </div>
        <Button variant="neon" onClick={() => window.location.href = '/organizer/create-event'}>
          <Plus className="h-4 w-4 mr-2" /> Create Event
        </Button>
      </div>

      <div className="grid gap-4">
        {paginatedItems.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No events yet. Create your first event!</p>
            <Button variant="neon" className="mt-4" onClick={() => window.location.href = '/organizer/create-event'}>
              <Plus className="h-4 w-4 mr-2" /> Create Event
            </Button>
          </div>
        ) : (
          paginatedItems.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl gradient-primary text-white text-lg font-bold shrink-0">
                {event.title?.charAt(0) || 'E'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{event.title || 'Untitled Event'}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  {formatDate(event.event_date)}
                  <span className="mx-1">•</span>
                  <MapPin className="h-3 w-3" />
                  {event.venue_name || 'TBD'}
                </p>
                <div className="flex items-center gap-4 mt-1.5">
                  <div className="flex-1 max-w-50">
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div 
                        className="h-full rounded-full gradient-primary" 
                        style={{ width: `${(event.total_tickets || 0) > 0 ? ((event.tickets_sold || 0) / (event.total_tickets || 1)) * 100 : 0}%` }} 
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {event.tickets_sold || 0}/{event.total_tickets || 0} sold
                    </p>
                  </div>
                  <span className="text-xs font-medium text-chart-1">{formatCurrency(event.revenue || 0)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(event.status)}`}>
                    {getStatusLabel(event.status)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => {
                    setSelectedEvent(event);
                    setShowDetailsModal(true);
                  }}
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => window.location.href = `/organizer/events/${event.id}/edit`}
                  title="Edit Event"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                {event.status === 'draft' && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-green-500 hover:text-green-600"
                    onClick={() => handlePublishEvent(event.id)}
                    title="Publish Event"
                  >
                    Publish
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => handleDeleteEvent(event.id)}
                  title="Delete Event"
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
          itemsPerPage={4} 
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
              <h2 className="text-lg font-bold">{selectedEvent.title}</h2>
              <button 
                onClick={() => { setShowDetailsModal(false); setSelectedEvent(null); }} 
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(selectedEvent.event_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Venue</p>
                  <p className="font-medium">{selectedEvent.venue_name || 'TBD'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tickets Sold</p>
                  <p className="font-medium">{selectedEvent.tickets_sold || 0} / {selectedEvent.total_tickets || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="font-medium text-chart-1">{formatCurrency(selectedEvent.revenue || 0)}</p>
                </div>
              </div>

              {selectedEvent.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm mt-1">{selectedEvent.description}</p>
                </div>
              )}

              {selectedEvent.image_url && (
                <div>
                  <p className="text-xs text-muted-foreground">Event Image</p>
                  <img 
                    src={selectedEvent.image_url} 
                    alt={selectedEvent.title} 
                    className="rounded-lg max-h-48 w-auto object-cover mt-1"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              {selectedEvent.status === 'draft' && (
                <Button 
                  variant="default"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handlePublishEvent(selectedEvent.id);
                    setShowDetailsModal(false);
                  }}
                >
                  Publish Event
                </Button>
              )}
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => window.location.href = `/organizer/events/${selectedEvent.id}/edit`}
              >
                Edit Event
              </Button>
              <Button 
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  handleDeleteEvent(selectedEvent.id);
                  setShowDetailsModal(false);
                }}
              >
                Delete Event
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}