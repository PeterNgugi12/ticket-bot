import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ShieldAlert, Eye, CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/disputes")({
  component: AdminDisputes,
});

interface Dispute {
  id: string;
  type: string;
  user_name: string;
  user_id: string;
  event_title: string;
  event_id: string;
  amount: number;
  severity: string;
  status: string;
  created_at: string;
  description: string;
  ticket_id?: string;
  payment_id?: string;
}

function AdminDisputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDisputes();
  }, []);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      // Fetch disputes from backend (you'll need to create this endpoint)
      const response = await api.getDisputes() as any;
      if (response?.success) {
        setDisputes(response.data.disputes || []);
      } else {
        // Fallback to empty array
        setDisputes([]);
      }
    } catch (error: any) {
      console.error("Failed to fetch disputes:", error);
      toast.error(error.message || "Failed to load disputes");
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveDispute = async (disputeId: string, resolution: string, note: string) => {
    setProcessingId(disputeId);
    try {
      const response = await api.resolveDispute(disputeId, resolution, note) as any;
      if (response?.success) {
        toast.success(`Dispute ${resolution === 'resolved' ? 'resolved' : 'rejected'} successfully`);
        fetchDisputes();
        setShowDetailsModal(false);
        setSelectedDispute(null);
        setResolutionNote("");
      } else {
        toast.error(response?.message || "Failed to resolve dispute");
      }
    } catch (error: any) {
      console.error("Resolve dispute error:", error);
      toast.error(error.message || "Failed to resolve dispute");
    } finally {
      setProcessingId(null);
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
    return new Date(dateString).toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric" 
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return 'bg-red-500/20 text-red-500';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'low':
        return 'bg-blue-500/20 text-blue-500';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'resolved':
        return 'bg-green-500/20 text-green-500';
      case 'rejected':
        return 'bg-red-500/20 text-red-500';
      default:
        return 'bg-yellow-500/20 text-yellow-500';
    }
  };

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(disputes, 5);

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
        <h1 className="text-2xl font-bold">Disputes & Fraud Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {disputes.filter(d => d.status === 'pending').length} pending disputes need review
        </p>
      </div>

      <div className="grid gap-4">
        {paginatedItems.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No disputes found</p>
          </div>
        ) : (
          paginatedItems.map((dispute, i) => (
            <motion.div
              key={dispute.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                  dispute.severity === "high" ? "bg-red-500/20" : 
                  dispute.severity === "medium" ? "bg-yellow-500/20" : "bg-blue-500/20"
                }`}>
                  <ShieldAlert className={`h-5 w-5 ${
                    dispute.severity === "high" ? "text-red-500" : 
                    dispute.severity === "medium" ? "text-yellow-500" : "text-blue-500"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{dispute.type || 'Unknown Type'}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getSeverityColor(dispute.severity)}`}>
                      {dispute.severity || 'medium'}
                    </span>
                    {dispute.status !== 'pending' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(dispute.status)}`}>
                        {dispute.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{dispute.description}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                    <span>User: {dispute.user_name || 'Unknown'}</span>
                    <span>Event: {dispute.event_title || 'N/A'}</span>
                    <span>Amount: {formatCurrency(dispute.amount)}</span>
                    <span>{formatDate(dispute.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSelectedDispute(dispute);
                      setShowDetailsModal(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" /> Review
                  </Button>
                  {dispute.status === 'pending' && (
                    <>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-green-500 hover:text-green-600"
                        onClick={() => {
                          setSelectedDispute(dispute);
                          setShowDetailsModal(true);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Resolve
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-500 hover:text-red-600"
                        onClick={() => {
                          setSelectedDispute(dispute);
                          setShowDetailsModal(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                </div>
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
          itemsPerPage={5} 
        />
      )}

      {/* Dispute Details Modal */}
      {showDetailsModal && selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-2xl space-y-5 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Dispute Details</h2>
              <button 
                onClick={() => { 
                  setShowDetailsModal(false); 
                  setSelectedDispute(null);
                  setResolutionNote("");
                }} 
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                  selectedDispute.severity === "high" ? "bg-red-500/20" : 
                  selectedDispute.severity === "medium" ? "bg-yellow-500/20" : "bg-blue-500/20"
                }`}>
                  <ShieldAlert className={`h-6 w-6 ${
                    selectedDispute.severity === "high" ? "text-red-500" : 
                    selectedDispute.severity === "medium" ? "text-yellow-500" : "text-blue-500"
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{selectedDispute.type}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getSeverityColor(selectedDispute.severity)}`}>
                      {selectedDispute.severity} severity
                    </span>
                    {selectedDispute.status !== 'pending' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(selectedDispute.status)}`}>
                        {selectedDispute.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="font-medium">{selectedDispute.user_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground mt-1">User ID: {selectedDispute.user_id || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Event</p>
                  <p className="font-medium">{selectedDispute.event_title || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Event ID: {selectedDispute.event_id || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium text-chart-1">{formatCurrency(selectedDispute.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(selectedDispute.created_at)}</p>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm mt-1">{selectedDispute.description}</p>
              </div>

              {selectedDispute.ticket_id && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Ticket ID</p>
                  <p className="text-sm font-mono">{selectedDispute.ticket_id}</p>
                </div>
              )}

              {selectedDispute.payment_id && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Payment ID</p>
                  <p className="text-sm font-mono">{selectedDispute.payment_id}</p>
                </div>
              )}

              {selectedDispute.status === 'pending' && (
                <>
                  <div className="pt-4">
                    <label className="text-sm font-medium">Resolution Note</label>
                    <textarea
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="Add a note explaining the resolution or rejection reason..."
                      className="w-full h-24 rounded-lg bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all resize-none mt-2"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button 
                      variant="default"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleResolveDispute(selectedDispute.id, 'resolved', resolutionNote)}
                      disabled={processingId === selectedDispute.id}
                    >
                      {processingId === selectedDispute.id ? "Processing..." : "Resolve Dispute"}
                    </Button>
                    <Button 
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        if (resolutionNote.trim()) {
                          handleResolveDispute(selectedDispute.id, 'rejected', resolutionNote);
                        } else {
                          toast.error("Please provide a reason for rejection");
                        }
                      }}
                      disabled={processingId === selectedDispute.id}
                    >
                      {processingId === selectedDispute.id ? "Processing..." : "Reject Dispute"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
