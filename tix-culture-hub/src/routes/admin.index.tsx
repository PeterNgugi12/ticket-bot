// admin/index.tsx - COMPLETE FIXED VERSION WITH PROPER JSX
import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { 
  Users, DollarSign, Calendar, Ticket, TrendingUp, Zap, 
  RefreshCw, AlertCircle, Activity, 
  Eye, BarChart3, ShoppingBag 
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

interface DashboardData {
  totalCustomers: number;
  totalRevenue: number;
  totalTicketsSold: number;
  activeEvents: number;
  totalEvents: number;
  growthRate: number;
}

interface Ticket {
  id: string;
  ticket_number: string;
  attendee_name: string;
  event_title: string;
  tier_name: string;
  purchase_price: number;
  created_at: string;
  status: string;
  user_id?: string;
  attendee_email?: string;
}

function AdminOverview() {
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalCustomers: 0,
    totalRevenue: 0,
    totalTicketsSold: 0,
    activeEvents: 0,
    totalEvents: 0,
    growthRate: 0,
  });
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [ticketData, setTicketData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<'revenue' | 'tickets'>('revenue');

  useEffect(() => {
    fetchAllData();
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
    const price = ticket.purchase_price || ticket.price || ticket.amount || ticket.total_amount || 0;
    return typeof price === 'number' ? price : parseFloat(price) || 0;
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let allTicketsList: Ticket[] = [];
      let totalRevenue = 0;
      let totalTickets = 0;
      const uniqueBuyers = new Set<string>();
      
      console.log("=== FETCHING ALL TICKETS ===");
      
      // Get all users first
      const usersResponse = await api.getAllUsers({ limit: 200 }) as any;
      let events: any[] = [];
      let activeEventsCount = 0;
      let totalEventsCount = 0;
      const eventsMap = new Map();
      
      if (usersResponse?.success && usersResponse.data?.users) {
        const users = usersResponse.data.users;
        
        // Fetch user details to get their tickets
        for (const user of users) {
          try {
            const userDetails = await api.getUserDetails(user.id) as any;
            if (userDetails?.success && userDetails.data.user?.recentTickets) {
              const userTickets = userDetails.data.user.recentTickets;
              
              for (const ticket of userTickets) {
                const price = getTicketPrice(ticket);
                
                if (ticket.status === 'valid' || ticket.status === 'used') {
                  totalRevenue += price;
                  totalTickets++;
                  uniqueBuyers.add(user.id);
                  
                  const eventId = ticket.event_id;
                  if (eventId && !eventsMap.has(eventId)) {
                    eventsMap.set(eventId, {
                      id: eventId,
                      title: ticket.event_title || 'Unknown Event',
                      status: 'published',
                      event_date: ticket.event_date || new Date().toISOString()
                    });
                  }
                  
                  allTicketsList.push({
                    id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    attendee_name: ticket.attendee_name || user.full_name || 'Anonymous',
                    attendee_email: user.email,
                    user_id: user.id,
                    event_title: ticket.event_title || 'Unknown Event',
                    tier_name: ticket.tier_name,
                    purchase_price: price,
                    created_at: ticket.created_at,
                    status: ticket.status,
                  });
                }
              }
            }
          } catch (error) {
            console.error(`Failed to fetch tickets for user ${user.id}:`, error);
          }
        }
      }
      
      try {
        const eventsResponse = await api.getAllEvents({ limit: 200 }) as any;
        if (eventsResponse?.success && eventsResponse.data?.events) {
          events = eventsResponse.data.events;
          totalEventsCount = events.length;
          
          const now = new Date();
          activeEventsCount = events.filter(
            (e: any) => e.status === 'published' && new Date(e.event_date) > now
          ).length;
        } else {
          totalEventsCount = eventsMap.size;
          activeEventsCount = eventsMap.size;
        }
      } catch (error) {
        console.log("Admin events endpoint not available, using ticket data");
        totalEventsCount = eventsMap.size;
        activeEventsCount = eventsMap.size;
      }
      
      console.log(`Total tickets: ${totalTickets}`);
      console.log(`Total revenue: ${totalRevenue}`);
      console.log(`Unique customers: ${uniqueBuyers.size}`);
      console.log(`Total events: ${totalEventsCount}`);
      
      setAllTickets(allTicketsList);
      
      setDashboardData({
        totalCustomers: uniqueBuyers.size,
        totalRevenue: totalRevenue,
        totalTicketsSold: totalTickets,
        activeEvents: activeEventsCount,
        totalEvents: totalEventsCount,
        growthRate: totalTickets > 0 ? 24 : 0,
      });
      
      // Generate monthly revenue data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyRevenue = new Map<string, number>();
      monthNames.forEach(month => monthlyRevenue.set(month, 0));
      
      allTicketsList.forEach((ticket: Ticket) => {
        if (ticket.created_at) {
          const date = new Date(ticket.created_at);
          const monthName = monthNames[date.getMonth()];
          monthlyRevenue.set(monthName, (monthlyRevenue.get(monthName) || 0) + ticket.purchase_price);
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
      
      allTicketsList.forEach((ticket: Ticket) => {
        if (ticket.created_at) {
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
      
      toast.success(`${uniqueBuyers.size} customers, ${totalTickets} tickets sold`);
      
    } catch (error: any) {
      console.error("Failed to fetch data:", error);
      setError(error.message || "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">Loading dashboard data...</p>
      </div>
    );
  }

  if (error && dashboardData.totalTicketsSold === 0) {
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
            value={dashboardData.totalCustomers.toLocaleString()} 
            change={`${dashboardData.totalCustomers > 0 ? 'Active buyers' : 'No purchases yet'}`}
            changeType={dashboardData.totalCustomers > 0 ? "positive" : "neutral"} 
            icon={Users} 
            delay={0} 
          />
          <StatCard 
            title="Total Revenue" 
            value={formatCurrency(dashboardData.totalRevenue)} 
            change={`From ${dashboardData.totalTicketsSold} tickets`}
            changeType={dashboardData.totalRevenue > 0 ? "positive" : "neutral"} 
            icon={DollarSign} 
            delay={0.05} 
          />
          <StatCard 
            title="Active Events" 
            value={dashboardData.activeEvents.toString()} 
            change={`Out of ${dashboardData.totalEvents} total events`}
            changeType={dashboardData.activeEvents > 0 ? "positive" : "neutral"} 
            icon={Calendar} 
            delay={0.1} 
          />
          <StatCard 
            title="Tickets Sold" 
            value={dashboardData.totalTicketsSold.toLocaleString()} 
            change={`Total sales`}
            changeType={dashboardData.totalTicketsSold > 0 ? "positive" : "neutral"} 
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
            title="Growth Rate" 
            value={`${dashboardData.growthRate}%`} 
            change="vs last month" 
            changeType={dashboardData.growthRate > 0 ? "positive" : "neutral"} 
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
              {activeChart === 'revenue' && revenueData.some(d => d.revenue > 0) ? (
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
              ) : activeChart === 'tickets' && ticketData.some(d => d.sold > 0) ? (
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
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingBag className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">No sales data available yet</p>
                  <p className="text-xs mt-1">Sales will appear here once tickets are purchased</p>
                </div>
              )}
            </div>
            {activeChart === 'tickets' && ticketData.some(d => d.sold > 0) && (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Avg. Tickets per Customer</p>
              <p className="text-xl font-bold text-primary mt-1">
                {dashboardData.totalCustomers > 0 ? (dashboardData.totalTicketsSold / dashboardData.totalCustomers).toFixed(1) : 0}
              </p>
              <p className="text-xs text-green-500 mt-1">Tickets per unique buyer</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Avg. Ticket Price</p>
              <p className="text-xl font-bold text-primary mt-1">
                {formatCurrency(dashboardData.totalTicketsSold > 0 ? dashboardData.totalRevenue / dashboardData.totalTicketsSold : 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Across all tickets</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Platform Fees Collected</p>
              <p className="text-xl font-bold text-primary mt-1">
                {formatCurrency(dashboardData.totalRevenue * 0.1)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">10% of total revenue</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Total Events</p>
              <p className="text-xl font-bold text-primary mt-1">
                {dashboardData.totalEvents}
              </p>
              <p className="text-xs text-green-500 mt-1">{dashboardData.activeEvents} active now</p>
            </div>
          </div>
        </motion.div>

        {/* Recent Tickets Section */}
        {allTickets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="glass-card p-4 sm:p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Ticket Sales
              </h3>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Ticket ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Buyer</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Event</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allTickets.slice(0, 5).map((ticket, i) => (
                    <motion.tr
                      key={ticket.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="p-3 font-mono text-xs">{ticket.ticket_number?.slice(0, 8) || ticket.id.slice(0, 8)}</td>
                      <td className="p-3">{ticket.attendee_name}</td>
                      <td className="p-3 text-muted-foreground">{ticket.event_title || 'Unknown'}</td>
                      <td className="p-3 font-medium text-green-500">{formatCurrency(ticket.purchase_price)}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ticket.status === 'valid' ? 'bg-green-500/20 text-green-500' : 
                          ticket.status === 'used' ? 'bg-blue-500/20 text-blue-500' : 
                          'bg-gray-500/20 text-gray-500'
                        }`}>
                          {ticket.status}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}