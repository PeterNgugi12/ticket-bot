import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { Wallet, Clock, ArrowUpRight, DollarSign, TrendingUp, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/organizer/earnings")({
  component: OrganizerEarnings,
});

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
  status: string;
  reference_id?: string;
}

interface WalletData {
  balance: number;
  total_earned: number;
  pending_earnings: number;
  total_withdrawn: number;
}

function OrganizerEarnings() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchWalletData();
    fetchTransactions();
  }, []);

  const fetchWalletData = async () => {
    try {
      const response = await api.getWallet() as any;
      if (response?.success) {
        setWallet(response.data.wallet);
      }
    } catch (error: any) {
      console.error("Failed to fetch wallet:", error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await api.getWalletTransactions() as any;
      if (response?.success) {
        setTransactions(response.data.transactions || []);
      }
    } catch (error: any) {
      console.error("Failed to fetch transactions:", error);
      toast.error(error.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 100) {
      toast.error("Minimum withdrawal amount is KES 100");
      return;
    }
    if (!withdrawPhone) {
      toast.error("Please enter your M-Pesa phone number");
      return;
    }
    if (wallet && amount > wallet.balance) {
      toast.error("Insufficient balance");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.requestWithdrawal(amount, withdrawPhone) as any;
      if (response?.success) {
        toast.success("Withdrawal request submitted successfully");
        setShowWithdrawModal(false);
        setWithdrawAmount("");
        setWithdrawPhone("");
        fetchWalletData();
        fetchTransactions();
      } else {
        toast.error(response?.message || "Failed to process withdrawal");
      }
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      toast.error(error.message || "Failed to process withdrawal");
    } finally {
      setSubmitting(false);
    }
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

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionIcon = (type: string, amount: number) => {
    if (type === 'withdrawal' || amount < 0) {
      return <ArrowUpRight className="h-4 w-4 text-orange-500" />;
    }
    return <DollarSign className="h-4 w-4 text-green-500" />;
  };

  const getTransactionColor = (amount: number) => {
    return amount > 0 ? "text-green-500" : "text-orange-500";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'pending':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500 bg-green-500/10';
      case 'pending':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'failed':
        return 'text-red-500 bg-red-500/10';
      default:
        return 'text-gray-500 bg-gray-500/10';
    }
  };

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(transactions, 5);

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
          <h1 className="text-2xl font-bold">Earnings & Withdrawals</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your revenue and track payouts</p>
        </div>
        <Button 
          variant="neon" 
          size="lg" 
          onClick={() => setShowWithdrawModal(true)}
          disabled={!wallet || wallet.balance < 100}
        >
          <ArrowUpRight className="h-4 w-4 mr-2" /> 
          Withdraw to M-Pesa
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard 
          title="Wallet Balance" 
          value={formatCurrency(wallet?.balance || 0)} 
          change="Available for withdrawal" 
          changeType="positive" 
          icon={Wallet} 
        />
        <StatCard 
          title="Pending Earnings" 
          value={formatCurrency(wallet?.pending_earnings || 0)} 
          change="Clearing in 24-48 hours" 
          changeType="neutral" 
          icon={Clock} 
          delay={0.05} 
        />
        <StatCard 
          title="Total Earned" 
          value={formatCurrency(wallet?.total_earned || 0)} 
          change="Lifetime earnings" 
          changeType="positive" 
          icon={DollarSign} 
          delay={0.1} 
        />
      </div>

      {/* Withdrawal Info Card */}
      {wallet && wallet.balance > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-linear-to-r from-primary/10 to-transparent rounded-xl p-4 border border-primary/20"
        >
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium">Ready for Withdrawal</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You can withdraw up to {formatCurrency(wallet.balance)}. Minimum withdrawal is KES 100.
                Funds are sent to your M-Pesa within 24 hours.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.2 }} 
        className="glass-card overflow-hidden"
      >
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Transaction History</h3>
        </div>
        
        {transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No transactions yet</p>
            <p className="text-xs mt-1">Your earnings will appear here once you start selling tickets</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    <th className="text-left p-4 font-medium text-muted-foreground">Transaction</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Date & Time</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((transaction, i) => (
                    <motion.tr
                      key={transaction.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            transaction.amount > 0 ? 'bg-green-500/10' : 'bg-orange-500/10'
                          }`}>
                            {getTransactionIcon(transaction.type, transaction.amount)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{transaction.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {transaction.type === 'withdrawal' ? 'Payout request' : 'Ticket sales'}
                            </p>
                          </div>
                        </div>
                       </td>
                      <td className="p-4">
                        <p className="text-sm">{formatDate(transaction.created_at)}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(transaction.status)}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(transaction.status)}`}>
                            {transaction.status}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <p className={`text-sm font-semibold ${getTransactionColor(transaction.amount)}`}>
                          {transaction.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transaction.amount))}
                        </p>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-4 border-t border-border">
              <TablePagination 
                currentPage={currentPage} 
                totalPages={totalPages} 
                totalItems={totalItems} 
                onPageChange={goToPage} 
                itemsPerPage={5} 
              />
            </div>
          </>
        )}
      </motion.div>

      {/* Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-md space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Withdraw to M-Pesa</h2>
              <button 
                onClick={() => { setShowWithdrawModal(false); setWithdrawAmount(""); setWithdrawPhone(""); }} 
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-secondary/30 rounded-lg">
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(wallet?.balance || 0)}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (KES)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Min. 100"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">M-Pesa Phone Number</label>
                <input
                  type="tel"
                  value={withdrawPhone}
                  onChange={(e) => setWithdrawPhone(e.target.value)}
                  placeholder="254712345678"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
                <p className="text-xs text-muted-foreground">Enter number in format: 254712345678</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => { setShowWithdrawModal(false); setWithdrawAmount(""); setWithdrawPhone(""); }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="neon" 
                  className="flex-1"
                  onClick={handleWithdraw}
                  disabled={submitting}
                >
                  {submitting ? "Processing..." : "Withdraw"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
