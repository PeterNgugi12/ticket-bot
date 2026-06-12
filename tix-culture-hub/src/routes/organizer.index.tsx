// admin/index.tsx - OPTIMIZED to prevent 429 errors
import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { 
  Users, DollarSign, Calendar, Ticket, TrendingUp, Zap, 
  RefreshCw, AlertCircle, Activity, 
  ArrowUp, ArrowDown, Minus, Eye, BarChart3 
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { motion } from "framer-motion";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/organizer/")({
  component: AdminOverview,
});

interface DashboardStats {
  users: {
    total_users: number;
    active_last_week: number;
    organizers?: number;
    growth?: number;
  };
  events: {
    active_events: number;
    upcoming_events: number;
    total_tickets_sold: number;
    total_events?: number;
    growth?: number;
  };
  payments: {
    total_revenue: number;
    platform_fees?: number;
    growth?: number;
  };
  scans: {
    active_scanners: number;
    total_scans?: number;
  };
  withdrawals?: {
    pending_withdrawals: number;
    total_withdrawn: number;
  };
}

interface TicketData {
  id: string;
  ticket_number: string;
  purchase_price: number;
  status: string;
  created_at: string;
  user_id?: string;
  attendee_name?: string;
  attendee_email?: string;
  event_title?: string;
  event_id?: string;
  tier_name?: string;
}

function AdminOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [ticketData, setTicketData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<'revenue' | 'tickets'>('revenue');
  
  // Real data from tickets
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalTicketsSold, setTotalTicketsSold] = useState(0);
  const [uniqueCustomers, setUniqueCustomers] = useState(0);
  const [allTickets, setAllTickets] = useState<TicketData[]>([]);
  const [activeEvents, setActiveEvents] = useState(0);
  
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    fetchAllTicketData();
    
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const formatCurrency = (amount: number): string => {
    if (!amount || isNaN(amount)) return "KES 0";
    if (amount >= 1000000) {
      return `KES ${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `KES ${(amount / 1000).toFixed(1)}K`;
    }
    return `KES ${amount.toLocaleString()}`;
  };

  const getTicketPrice = (ticket: any): number => {
    const price = ticket.purchase_price || ticket.price || ticket.amount || ticket.total_amount || ticket.ticket_price || 0;
    return typeof price === 'number' ? price : parseFloat(price) || 0;
  };

  const fetchAllTicketData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      let allTicketsList: TicketData[] = [];
      let revenue = 0;
      let ticketCount = 0;
      const uniqueBuyerIds = new Set<string>();
      
      console.log("=== STARTING TICKET FETCH ===");
      
      // Step 1: Get all events (single call)
      console.log("Fetching events...");
      let events: any[] = [];
      try {
        const eventsResponse = await api.getAllEvents({ limit: 200 }) as any;
        console.log("Events response:", eventsResponse?.success);
        
        if (eventsResponse?.success && eventsResponse.data?.events) {
          events = eventsResponse.data.events;
          console.log(`Found ${events.length} events`);
          
          // Count active events
          const now = new Date();
          const active = events.filter(
            (e: any) => e.status === 'published' && new Date(e.event_date) > now
          ).length;
          setActiveEvents(active);
        }
      } catch (error) {
        console.error("Failed to fetch events:", error);
      }
      
      // Step 2: Fetch tickets for all events in parallel with delay to avoid rate limiting
      console.log("Fetching tickets for events...");
      const BATCH_SIZE = 3;
      const DELAY_MS = 500;
      
      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const batch = events.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(events.length / BATCH_SIZE)}`);
        
        const batchPromises = batch.map(async (event: any) => {
          try {
            const ticketRes = await api.getEventTickets(event.id) as any;
            if (ticketRes?.success && ticketRes.data?.tickets) {
              return { event, tickets: ticketRes.data.tickets };
            }
          } catch (error) {
            console.error(`Failed to fetch tickets for event ${event.id}:`, error);
          }
          return null;
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result) {
            const { event, tickets } = result;
            console.log(`Event "${event.title}" has ${tickets.length} tickets`);
            
            for (const ticket of tickets) {
              const price = getTicketPrice(ticket);
              // Only count valid/used tickets
              if (ticket.status === 'valid' || ticket.status === 'used') {
                revenue += price;
                ticketCount++;
                
                // Track unique buyer
                if (ticket.user_id) {
                  uniqueBuyerIds.add(ticket.user_id);
                } else if (ticket.attendee_email) {
                  uniqueBuyerIds.add(ticket.attendee_email);
                }
                
                allTicketsList.push({
                  id: ticket.id,
                  ticket_number: ticket.ticket_number,
                  purchase_price: price,
                  status: ticket.status,
                  created_at: ticket.created_at,
                  user_id: ticket.user_id,
                  attendee_name: ticket.attendee_name,
                  attendee_email: ticket.attendee_email,
                  event_title: event.title,
                  event_id: event.id,
                  tier_name: ticket.tier_name,
                });
              }
            }
          }
        }
        
        // Add delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < events.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }
      
      console.log("=== FINAL RESULTS ===");
      console.log(`Total tickets: ${ticketCount}`);
      console.log(`Total revenue: ${revenue}`);
      console.log(`Unique customers: ${uniqueBuyerIds.size}`);
      
      if (!isMounted.current) return;
      
      setTotalRevenue(revenue);
      setTotalTicketsSold(ticketCount);
      setUniqueCustomers(uniqueBuyerIds.size);
      setAllTickets(allTicketsList);
      
      // Generate monthly revenue data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyRevenue = new Map<string, number>();
      monthNames.forEach(month => monthlyRevenue.set(month, 0));
      
      allTicketsList.forEach((ticket: TicketData) => {
        if (ticket.created_at && (ticket.status === 'valid' || ticket.status === 'used')) {
          const date = new Date(ticket.created_at);
          const monthName = monthNames[date.getMonth()];
          const price = ticket.purchase_price;
          monthlyRevenue.set(monthName, (monthlyRevenue.get(monthName) || 0) + price);
        }
      });
      
      const formattedRevenueData = monthNames.map(month => ({
        month: month,
        revenue: monthlyRevenue.get(month) || 0,
      }));
      setRevenueData(formattedRevenueData);
      
      // Generate weekly ticket sales data
      const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weeklySales = new Map<string, number>();
      weekDays.forEach(day => weeklySales.set(day, 0));
      
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      allTicketsList.forEach((ticket: TicketData) => {
        if (ticket.created_at && (ticket.status === 'valid' || ticket.status === 'used')) {
          const date = new Date(ticket.created_at);
          if (date >= lastWeek) {
            const dayName = weekDays[date.getDay()];
            weeklySales.set(dayName, (weeklySales.get(dayName) || 0) + 1);
          }
        }
      });
      
      const formattedTicketData = weekDays.map(day => ({
        day: day,
        sold: weeklySales.get(day) || 0,
      }));
      setTicketData(formattedTicketData);
      
      toast.success(`${uniqueBuyerIds.size} customers, ${ticketCount} tickets, ${formatCurrency(revenue)} revenue`);
      
    } catch (error: any) {
      console.error("Failed to fetch ticket data:", error);
      if (error.name !== 'AbortError' && isMounted.current) {
        setError(error.message || "Failed to load data");
        toast.error(error.message || "Failed to load dashboard data");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllTicketData();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">Loading ticket data...</p>
      </div>
    );
  }

  if (error && totalTicketsSold === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4 px-4">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-red-500">Error loading dashboard</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
        <button 
          onClick={handleRefresh}
          className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Dashboard Overview
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Real-time platform analytics & insights
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard 
            title="Total Customers" 
            value={uniqueCustomers.toLocaleString()} 
            change={`${uniqueCustomers > 0 ? 'Active buyers' : 'No purchases yet'}`}
            changeType={uniqueCustomers > 0 ? "positive" : "neutral"} 
            icon={Users} 
            delay={0} 
          />
          <StatCard 
            title="Total Revenue" 
            value={formatCurrency(totalRevenue)} 
            change={`From ${totalTicketsSold} tickets`}
            changeType={totalRevenue > 0 ? "positive" : "neutral"} 
            icon={DollarSign} 
            delay={0.05} 
          />
          <StatCard 
            title="Active Events" 
            value={activeEvents.toString()} 
            change={`Currently live`}
            changeType={activeEvents > 0 ? "positive" : "neutral"} 
            icon={Calendar} 
            delay={0.1} 
          />
          <StatCard 
            title="Tickets Sold" 
            value={totalTicketsSold.toLocaleString()} 
            change={`Total sales`}
            changeType={totalTicketsSold > 0 ? "positive" : "neutral"} 
            icon={Ticket} 
            delay={0.15} 
          />
          <StatCard 
            title="Active Scanners" 
            value="0" 
            change="No active scanners" 
            changeType="neutral" 
            icon={Zap} 
            delay={0.2} 
          />
          <StatCard 
            title="Avg. Tickets/Customer" 
            value={uniqueCustomers > 0 ? (totalTicketsSold / uniqueCustomers).toFixed(1) : "0"} 
            change="Tickets per buyer" 
            changeType="neutral" 
            icon={TrendingUp} 
            delay={0.25} 
          />
        </div>

        {/* Chart Toggle */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            onClick={() => setActiveChart('revenue')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeChart === 'revenue' 
                ? 'bg-primary text-white' 
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <BarChart3 className="h-4 w-4 inline mr-2" />
            Revenue Trend
          </button>
          <button
            onClick={() => setActiveChart('tickets')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeChart === 'tickets' 
                ? 'bg-primary text-white' 
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <Activity className="h-4 w-4 inline mr-2" />
            Ticket Sales
          </button>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            key={activeChart}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-2 glass-card p-4 sm:p-5"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {activeChart === 'revenue' ? 'Revenue Trend' : 'Ticket Sales This Week'}
            </h3>
            <div className="w-full h-72 sm:h-80">
              {activeChart === 'revenue' && revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.28 290)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.28 290)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 270)" />
                    <XAxis dataKey="month" stroke="oklch(0.5 0.03 270)" fontSize={11} />
                    <YAxis 
                      stroke="oklch(0.5 0.03 270)" 
                      fontSize={11}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: "oklch(0.17 0.025 270)", 
                        border: "1px solid oklch(0.28 0.03 270)", 
                        borderRadius: "8px", 
                        color: "oklch(0.95 0.01 270)",
                        fontSize: "12px"
                      }}
                      formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="oklch(0.65 0.28 290)" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : activeChart === 'tickets' && ticketData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ticketData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 270)" />
                    <XAxis dataKey="day" stroke="oklch(0.5 0.03 270)" fontSize={11} />
                    <YAxis 
                      stroke="oklch(0.5 0.03 270)" 
                      fontSize={11}
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: "oklch(0.17 0.025 270)", 
                        border: "1px solid oklch(0.28 0.03 270)", 
                        borderRadius: "8px", 
                        color: "oklch(0.95 0.01 270)",
                        fontSize: "12px"
                      }}
                      formatter={(value: any) => [`${value.toLocaleString()} tickets`, 'Sold']}
                    />
                    <Bar dataKey="sold" fill="oklch(0.65 0.25 250)" radius={[4, 4, 0, 0]}>
                      {ticketData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.sold > 0 ? "oklch(0.65 0.25 250)" : "oklch(0.3 0.03 270)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
            {activeChart === 'tickets' && ticketData.length > 0 && (
              <div className="mt-4 text-center text-xs text-muted-foreground">
                Total tickets sold this week: {ticketData.reduce((sum, day) => sum + day.sold, 0).toLocaleString()}
              </div>
            )}
          </motion.div>

          <div className="h-100 lg:h-auto">
            <ActivityFeed />
          </div>
        </div>

        {/* Platform Insights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-4 sm:p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Platform Insights
            </h3>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Avg. Tickets per Customer</p>
              <p className="text-xl font-bold text-primary mt-1">
                {uniqueCustomers > 0 ? (totalTicketsSold / uniqueCustomers).toFixed(1) : 0}
              </p>
              <p className="text-xs text-green-500 mt-1">Tickets per unique buyer</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Avg. Ticket Price</p>
              <p className="text-xl font-bold text-primary mt-1">
                {formatCurrency(totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Across all tickets</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Platform Fees Collected</p>
              <p className="text-xl font-bold text-primary mt-1">
                {formatCurrency(totalRevenue * 0.1)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">10% of total revenue</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}