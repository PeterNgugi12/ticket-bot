// admin/finance.tsx - FIXED WITH REAL DATA FROM TICKETS
import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { DollarSign, TrendingUp, ArrowDownRight, AlertTriangle, CheckCircle, XCircle, Clock, Users, Calendar, Wallet, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/finance")({
  component: AdminFinance,
});

interface Withdrawal {
  id: string;
  organizer_name: string;
  organizer_id: string;
  amount: number;
  phone_number: string;
  status: string;
  created_at: string;
  processed_at?: string;
  rejection_reason?: string;
}

interface RevenueData {
  date: string;
  revenue: number;
  commission: number;
}

interface TicketData {
  id: string;
  purchase_price: number;
  created_at: string;
  status: string;
  event_title?: string;
}

function AdminFinance() {
  const [period, setPeriod] = useState("weekly");
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [totalOrganizers, setTotalOrganizers] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalTicketsSold, setTotalTicketsSold] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    fetchFinanceData();
  }, [period]);

  const getTicketPrice = (ticket: any): number => {
    const price = ticket.purchase_price || ticket.price || ticket.amount || ticket.total_amount || 0;
    return typeof price === 'number' ? price : parseFloat(price) || 0;
  };

  const fetchFinanceData = async () => {
    try {
      setLoading(true);
      
      let allTicketsList: TicketData[] = [];
      let revenue = 0;
      let ticketCount = 0;
      let eventsSet = new Set();
      let organizersSet = new Set();
      
      console.log("=== FETCHING FINANCE DATA ===");
      
      // Get all users first
      const usersResponse = await api.getAllUsers({ limit: 200 }) as any;
      
      if (usersResponse?.success && usersResponse.data?.users) {
        const users = usersResponse.data.users;
        
        // Count organizers
        const organizers = users.filter((u: any) => u.role === 'organizer');
        setTotalOrganizers(organizers.length);
        
        // Fetch user details to get their tickets
        for (const user of users) {
          try {
            const userDetails = await api.getUserDetails(user.id) as any;
            if (userDetails?.success && userDetails.data.user?.recentTickets) {
              const userTickets = userDetails.data.user.recentTickets;
              
              for (const ticket of userTickets) {
                const price = getTicketPrice(ticket);
                
                if (ticket.status === 'valid' || ticket.status === 'used') {
                  revenue += price;
                  ticketCount++;
                  
                  if (ticket.event_id) {
                    eventsSet.add(ticket.event_id);
                  }
                  
                  allTicketsList.push({
                    id: ticket.id,
                    purchase_price: price,
                    created_at: ticket.created_at,
                    status: ticket.status,
                    event_title: ticket.event_title,
                  });
                }
              }
            }
          } catch (error) {
            console.error(`Failed to fetch tickets for user ${user.id}:`, error);
          }
        }
      }
      
      // Try to get events count
      try {
        const eventsResponse = await api.getAllEvents({ limit: 200 }) as any;
        if (eventsResponse?.success && eventsResponse.data?.events) {
          setTotalEvents(eventsResponse.data.events.length);
        } else {
          setTotalEvents(eventsSet.size);
        }
      } catch (error) {
        setTotalEvents(eventsSet.size);
      }
      
      console.log(`Total tickets: ${ticketCount}`);
      console.log(`Total revenue: ${revenue}`);
      
      setTotalRevenue(revenue);
      setTotalTicketsSold(ticketCount);
      setTotalCommission(revenue * 0.1);
      
      // Fetch pending withdrawals
      const withdrawalsResponse = await api.getPendingWithdrawals(100) as any;
      let pendingWithdrawalsList: Withdrawal[] = [];
      let withdrawnAmount = 0;
      
      if (withdrawalsResponse?.success) {
        pendingWithdrawalsList = withdrawalsResponse.data.withdrawals || [];
        // Calculate total withdrawn from completed withdrawals
        withdrawnAmount = pendingWithdrawalsList
          .filter(w => w.status === 'completed')
          .reduce((sum, w) => sum + w.amount, 0);
        setPendingWithdrawals(pendingWithdrawalsList.filter(w => w.status === 'pending').length);
      }
      
      setTotalWithdrawn(withdrawnAmount);
      setWithdrawals(pendingWithdrawalsList);
      
      // Generate revenue data from actual tickets by date
      const revenueByDate = new Map<string, number>();
      
      allTicketsList.forEach((ticket: TicketData) => {
        if (ticket.created_at) {
          const date = new Date(ticket.created_at);
          let dateKey: string;
          
          if (period === "daily") {
            dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          } else if (period === "weekly") {
            // Group by week
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            dateKey = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          } else {
            dateKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          }
          
          const currentRevenue = revenueByDate.get(dateKey) || 0;
          revenueByDate.set(dateKey, currentRevenue + ticket.purchase_price);
        }
      });
      
      // Convert to array and sort by date
      const formattedRevenueData: RevenueData[] = Array.from(revenueByDate.entries())
        .map(([date, revenue]) => ({
          date: date,
          revenue: revenue,
          commission: revenue * 0.1,
        }))
        .slice(-30); // Last 30 entries
      
      setRevenueData(formattedRevenueData);
      
      toast.success(`Finance data loaded: ${formatCurrency(revenue)} revenue from ${ticketCount} tickets`);
      
    } catch (error: any) {
      console.error("Failed to fetch finance data:", error);
      toast.error(error.message || "Failed to load finance data");
      
      // Set fallback empty data
      setRevenueData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFinanceData();
  };

  const handleApproveWithdrawal = async (withdrawalId: string) => {
    setProcessingId(withdrawalId);
    try {
      const response = await api.approveWithdrawal(withdrawalId) as any;
      if (response?.success) {
        toast.success("Withdrawal approved successfully");
        fetchFinanceData();
        setShowApproveModal(false);
        setSelectedWithdrawal(null);
        setActionType(null);
      } else {
        toast.error(response?.message || "Failed to approve withdrawal");
      }
    } catch (error: any) {
      console.error("Approve withdrawal error:", error);
      toast.error(error.message || "Failed to approve withdrawal");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectWithdrawal = async (withdrawalId: string, reason: string) => {
    setProcessingId(withdrawalId);
    try {
      const response = await api.rejectWithdrawal(withdrawalId, reason) as any;
      if (response?.success) {
        toast.success("Withdrawal rejected successfully");
        fetchFinanceData();
        setShowApproveModal(false);
        setSelectedWithdrawal(null);
        setRejectReason("");
        setActionType(null);
      } else {
        toast.error(response?.message || "Failed to reject withdrawal");
      }
    } catch (error: any) {
      console.error("Reject withdrawal error:", error);
      toast.error(error.message || "Failed to reject withdrawal");
    } finally {
      setProcessingId(null);
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
    return new Date(dateString).toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: "numeric"
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-500';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'failed':
        return 'bg-red-500/20 text-red-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(withdrawals, 5);

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
          <h1 className="text-2xl font-bold">Financial Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue tracking & withdrawals</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {["daily", "weekly", "monthly"].map(p => (
            <Button 
              key={p} 
              variant={period === p ? "default" : "ghost"} 
              size="sm" 
              onClick={() => setPeriod(p)} 
              className="capitalize"
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Revenue" 
          value={formatCurrency(totalRevenue)} 
          change={`From ${totalTicketsSold} tickets`}
          changeType={totalRevenue > 0 ? "positive" : "neutral"} 
          icon={DollarSign} 
          delay={0}
        />
        <StatCard 
          title="Commission Earned" 
          value={formatCurrency(totalCommission)} 
          change="10% platform fee" 
          changeType={totalCommission > 0 ? "positive" : "neutral"} 
          icon={TrendingUp} 
          delay={0.05}
        />
        <StatCard 
          title="Withdrawals Processed" 
          value={formatCurrency(totalWithdrawn)} 
          change="Paid to organizers" 
          changeType={totalWithdrawn > 0 ? "positive" : "neutral"} 
          icon={ArrowDownRight} 
          delay={0.1}
        />
        <StatCard 
          title="Pending Withdrawals" 
          value={pendingWithdrawals.toString()} 
          change="Awaiting approval" 
          changeType={pendingWithdrawals > 0 ? "neutral" : "neutral"} 
          icon={AlertTriangle} 
          delay={0.15}
        />
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Organizers</p>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2">{totalOrganizers}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Events</p>
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2">{totalEvents}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Tickets Sold</p>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2 text-green-500">{totalTicketsSold.toLocaleString()}</p>
        </div>
      </div>

      {/* Revenue Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.2 }} 
        className="glass-card p-5"
      >
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Revenue vs Commission Trend</h3>
        {revenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 270)" />
              <XAxis dataKey="date" stroke="oklch(0.5 0.03 270)" fontSize={12} />
              <YAxis 
                stroke="oklch(0.5 0.03 270)" 
                fontSize={12}
                tickFormatter={(value) => formatCurrency(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  background: "oklch(0.17 0.025 270)", 
                  border: "1px solid oklch(0.28 0.03 270)", 
                  borderRadius: "8px", 
                  color: "oklch(0.95 0.01 270)" 
                }}
                formatter={(value: any) => [formatCurrency(value), '']}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="oklch(0.65 0.28 290)" 
                strokeWidth={2} 
                dot={true} 
                name="Revenue"
              />
              <Line 
                type="monotone" 
                dataKey="commission" 
                stroke="oklch(0.7 0.25 250)" 
                strokeWidth={2} 
                dot={true} 
                name="Commission"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-75 text-muted-foreground">
            <div className="text-center">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No revenue data available</p>
              <p className="text-xs mt-1">Revenue will appear here once tickets are sold</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Withdrawal Requests Table */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.3 }} 
        className="glass-card p-5"
      >
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Withdrawal Requests</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No withdrawal requests found</p>
                    <p className="text-xs mt-1">Withdrawals will appear here when organizers request payouts</p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((w) => (
                  <tr key={w.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="p-3 font-medium">{w.organizer_name || 'Unknown'}</td>
                    <td className="p-3 font-medium text-green-500">{formatCurrency(w.amount)}</td>
                    <td className="p-3 text-muted-foreground">{w.phone_number}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(w.created_at)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {getStatusIcon(w.status)}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(w.status)}`}>
                          {w.status}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      {w.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              setSelectedWithdrawal(w);
                              setActionType("approve");
                              setShowApproveModal(true);
                            }}
                            disabled={processingId === w.id}
                          >
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => {
                              setSelectedWithdrawal(w);
                              setActionType("reject");
                              setShowApproveModal(true);
                            }}
                            disabled={processingId === w.id}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalItems > 0 && (
          <div className="px-1 mt-4">
            <TablePagination 
              currentPage={currentPage} 
              totalPages={totalPages} 
              totalItems={totalItems} 
              onPageChange={goToPage} 
              itemsPerPage={5} 
            />
          </div>
        )}
      </motion.div>

      {/* Approval Modal */}
      {showApproveModal && selectedWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-md space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {actionType === "approve" ? "Approve Withdrawal" : "Reject Withdrawal"}
              </h2>
              <button 
                onClick={() => { 
                  setShowApproveModal(false); 
                  setSelectedWithdrawal(null);
                  setRejectReason("");
                  setActionType(null);
                }} 
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Organizer</p>
                <p className="font-medium">{selectedWithdrawal.organizer_name}</p>
                <p className="text-xs text-muted-foreground mt-2">Amount</p>
                <p className="text-xl font-bold text-chart-1">{formatCurrency(selectedWithdrawal.amount)}</p>
                <p className="text-xs text-muted-foreground mt-2">Phone Number</p>
                <p className="font-mono text-sm">{selectedWithdrawal.phone_number}</p>
                <p className="text-xs text-muted-foreground mt-2">Request Date</p>
                <p className="text-sm">{formatDate(selectedWithdrawal.created_at)}</p>
              </div>

              {actionType === "approve" ? (
                <Button 
                  variant="default"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleApproveWithdrawal(selectedWithdrawal.id)}
                  disabled={processingId === selectedWithdrawal.id}
                >
                  {processingId === selectedWithdrawal.id ? "Processing..." : "Confirm Approval"}
                </Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rejection Reason</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Enter reason for rejection..."
                      className="w-full h-24 rounded-lg bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all resize-none"
                    />
                  </div>
                  <Button 
                    variant="destructive"
                    className="w-full"
                    onClick={() => {
                      if (rejectReason.trim()) {
                        handleRejectWithdrawal(selectedWithdrawal.id, rejectReason);
                      } else {
                        toast.error("Please provide a reason for rejection");
                      }
                    }}
                    disabled={processingId === selectedWithdrawal.id}
                  >
                    {processingId === selectedWithdrawal.id ? "Processing..." : "Confirm Rejection"}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}