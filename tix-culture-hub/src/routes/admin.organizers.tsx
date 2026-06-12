// admin/organizers.tsx - FIXED TypeScript errors
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, UserPlus, Eye, Trash2, X, Percent, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/organizers")({
  component: AdminOrganizers,
});

interface Organizer {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  commission_rate: number;
  total_events: number;
  total_revenue: number;
  total_tickets_sold: number;
  status: "active" | "suspended";
  created_at: string;
}

interface Event {
  id: string;
  title: string;
  organizer_id: string;
  organizer_name?: string;
  tickets_sold: number;
  total_revenue: number;
  status: string;
}

function AdminOrganizers() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", commission: "10" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      
      // Fetch organizers and events in parallel
      const [organizersResponse, eventsResponse] = await Promise.all([
        api.getAllOrganizers(100, 0),
        fetchAllEvents()
      ]);
      
      // Process organizers - with proper null checking
      let organizersList: any[] = [];
      if (organizersResponse && (organizersResponse as any).success) {
        const responseData = organizersResponse as any;
        organizersList = responseData.data?.organizers || [];
      } else {
        console.error("Failed to fetch organizers:", organizersResponse);
        setFetchError("Could not fetch organizers. Please check your connection.");
      }
      
      // Process events
      let eventsList: Event[] = [];
      if (eventsResponse) {
        eventsList = eventsResponse;
      }
      
      setAllEvents(eventsList);
      
      // Create a map of events by organizer_id
      const eventsByOrganizer = new Map<string, Event[]>();
      eventsList.forEach((event: Event) => {
        const orgId = event.organizer_id;
        if (!eventsByOrganizer.has(orgId)) {
          eventsByOrganizer.set(orgId, []);
        }
        eventsByOrganizer.get(orgId)!.push(event);
      });
      
      // Build organizer objects with stats
      const organizersWithStats: Organizer[] = organizersList.map((org: any) => {
        const orgEvents = eventsByOrganizer.get(org.id) || [];
        const totalEvents = orgEvents.length;
        const totalRevenue = orgEvents.reduce((sum: number, e: Event) => sum + (e.total_revenue || 0), 0);
        const totalTicketsSold = orgEvents.reduce((sum: number, e: Event) => sum + (e.tickets_sold || 0), 0);
        
        return {
          id: org.id,
          full_name: org.full_name || org.fullName || 'Unknown',
          email: org.email || 'No email',
          phone_number: org.phone_number || org.phoneNumber || 'N/A',
          commission_rate: org.commission_rate || org.commissionRate || 10,
          total_events: totalEvents,
          total_revenue: totalRevenue,
          total_tickets_sold: totalTicketsSold,
          status: org.is_active ? "active" : "suspended",
          created_at: org.created_at,
        };
      });
      
      setOrganizers(organizersWithStats);
      
      if (organizersWithStats.length > 0 && eventsList.length === 0) {
        toast.info("No events found. Events will appear here once created.");
      }
      
    } catch (error: any) {
      console.error("Failed to fetch data:", error);
      setFetchError(error.message || "Failed to load data");
      toast.error(error.message || "Failed to load organizers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAllEvents = async (): Promise<Event[]> => {
    try {
      // Try multiple approaches to get events
      
      // Approach 1: Try admin events endpoint
      const adminEventsResponse = await api.getAllEvents({ limit: 1000 }) as any;
      if (adminEventsResponse?.success && adminEventsResponse.data?.events?.length > 0) {
        console.log("Found events via admin endpoint:", adminEventsResponse.data.events.length);
        return adminEventsResponse.data.events;
      }
      
      // Approach 2: Try getting events through user details for each organizer
      console.log("Admin events endpoint returned no events, trying alternative method...");
      
      // Get all organizers first
      const organizersResponse = await api.getAllOrganizers(100, 0) as any;
      if (organizersResponse?.success) {
        const organizersList = organizersResponse.data?.organizers || [];
        let allEventsList: Event[] = [];
        
        // For each organizer, try to get their events
        for (const org of organizersList) {
          try {
            // Try to get user details which might include events
            const userDetails = await api.getUserDetails(org.id) as any;
            if (userDetails?.success && userDetails.data?.user?.events) {
              const userEvents = userDetails.data.user.events.map((e: any) => ({
                id: e.id,
                title: e.title,
                organizer_id: org.id,
                tickets_sold: e.tickets_sold || 0,
                total_revenue: e.total_revenue || e.revenue || 0,
                status: e.status,
              }));
              allEventsList = [...allEventsList, ...userEvents];
            }
          } catch (error) {
            console.error(`Failed to get events for organizer ${org.id}:`, error);
          }
        }
        
        if (allEventsList.length > 0) {
          console.log("Found events via user details:", allEventsList.length);
          return allEventsList;
        }
      }
      
      // Approach 3: Return empty array if no events found
      console.log("No events found via any method");
      return [];
      
    } catch (error) {
      console.error("Error fetching events:", error);
      return [];
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    toast.success("Data refreshed");
  };

  const filtered = organizers.filter(o =>
    o.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    o.email?.toLowerCase().includes(search.toLowerCase())
  );

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(filtered, 5);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password || !form.phone) {
      setFormError("All fields are required");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }
    const commission = parseFloat(form.commission);
    if (isNaN(commission) || commission < 0 || commission > 100) {
      setFormError("Commission must be 0–100%");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.createOrganizer({
        phoneNumber: form.phone,
        email: form.email,
        fullName: form.name,
        password: form.password,
        commissionRate: commission,
      }) as any;

      if (response?.success) {
        toast.success("Organizer created successfully");
        setForm({ name: "", email: "", phone: "", password: "", commission: "10" });
        setFormError("");
        setShowModal(false);
        fetchAllData();
      } else {
        setFormError(response?.message || "Failed to create organizer");
      }
    } catch (error: any) {
      console.error("Create organizer error:", error);
      setFormError(error.message || "Failed to create organizer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (organizerId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus !== "active";
      const response = await api.toggleUserStatus(organizerId, newStatus) as any;
      if (response?.success) {
        toast.success(`Organizer ${newStatus ? 'activated' : 'suspended'} successfully`);
        fetchAllData();
      } else {
        toast.error(response?.message || "Failed to update status");
      }
    } catch (error: any) {
      console.error("Toggle status error:", error);
      toast.error(error.message || "Failed to update status");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  };

  const formatRevenue = (revenue: number) => {
    if (!revenue || isNaN(revenue)) return "KES 0";
    if (revenue >= 1000000) {
      return `KES ${(revenue / 1000000).toFixed(1)}M`;
    }
    if (revenue >= 1000) {
      return `KES ${(revenue / 1000).toFixed(1)}K`;
    }
    return `KES ${revenue.toLocaleString()}`;
  };

  // Calculate totals for summary
  const totalOrganizers = organizers.length;
  const totalEvents = organizers.reduce((sum, o) => sum + (o.total_events || 0), 0);
  const totalTickets = organizers.reduce((sum, o) => sum + (o.total_tickets_sold || 0), 0);
  const totalRevenue = organizers.reduce((sum, o) => sum + (o.total_revenue || 0), 0);

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
          <h1 className="text-2xl font-bold">Organizer Management</h1>
          <p className="text-sm text-muted-foreground mt-1">{organizers.length} registered organizers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="neon" onClick={() => setShowModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Create Organizer
          </Button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Total Organizers</p>
          <p className="text-2xl font-bold mt-1">{totalOrganizers}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Total Events</p>
          <p className="text-2xl font-bold mt-1 text-blue-500">{totalEvents}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Total Tickets Sold</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{totalTickets.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{formatRevenue(totalRevenue)}</p>
        </div>
      </div>

      {/* Error Message */}
      {fetchError && (
        <div className="glass-card p-4 bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Info Message when no events */}
      {totalEvents === 0 && !loading && organizers.length > 0 && (
        <div className="glass-card p-4 bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-sm text-yellow-500 text-center">
            ℹ️ No events found. Events will appear here once organizers create them.
          </p>
        </div>
      )}

      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search organizers..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-input text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left p-4 font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Commission</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Events</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Tickets Sold</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Revenue</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Created</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-muted-foreground">
                    No organizers found
                   </td>
                 </tr>
              ) : (
                paginatedItems.map((org, i) => (
                  <motion.tr
                    key={org.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
                          {org.full_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "OR"}
                        </div>
                        <div>
                          <p className="font-medium">{org.full_name}</p>
                          <p className="text-xs text-muted-foreground">{org.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-chart-1/20 text-chart-1">
                        {org.commission_rate || 10}%
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`font-medium ${org.total_events > 0 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                        {org.total_events || 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`font-medium ${org.total_tickets_sold > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {org.total_tickets_sold?.toLocaleString() || 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`font-medium ${org.total_revenue > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {formatRevenue(org.total_revenue || 0)}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">{formatDate(org.created_at)}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        org.status === "active" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                      }`}>
                        {org.status || "active"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleToggleStatus(org.id, org.status || "active")}
                          title={org.status === "active" ? "Suspend" : "Activate"}
                          className={org.status === "active" ? "text-red-500 hover:text-red-600" : "text-green-500 hover:text-green-600"}
                        >
                          {org.status === "active" ? (
                            <Trash2 className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
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

      {/* Create Organizer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-md space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Create Event Organizer</h2>
              <button onClick={() => { setShowModal(false); setFormError(""); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{formError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Organization Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. EventKings Ltd"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="organizer@email.com"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+254712345678"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" /> Commission Rate
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.commission}
                    onChange={e => setForm({ ...form, commission: e.target.value })}
                    className="w-24 h-10 rounded-lg bg-input px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                  <span className="text-sm text-muted-foreground">% per ticket sale</span>
                </div>
              </div>
              <Button type="submit" variant="neon" size="lg" className="w-full" disabled={submitting}>
                <UserPlus className="h-4 w-4 mr-2" /> 
                {submitting ? "Creating..." : "Create Organizer Account"}
              </Button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}