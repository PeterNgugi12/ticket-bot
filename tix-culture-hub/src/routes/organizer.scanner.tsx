import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Camera, CheckCircle, XCircle, ScanLine, Upload, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/organizer/scanner")({
  component: TicketScanner,
});

interface ScanResult {
  success: boolean;
  message: string;
  ticket?: {
    ticketNumber: string;
    attendeeName: string;
    tierName: string;
    eventTitle: string;
    eventDate: string;
  };
}

interface RecentScan {
  id: string;
  ticket_number: string;
  attendee_name: string;
  scan_status: string;
  created_at: string;
}

function TicketScanner() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEvents();
    fetchRecentScans();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await api.getMyEvents() as any;
      if (response?.success) {
        const eventList = response.data.events || [];
        setEvents(eventList);
        if (eventList.length > 0 && !selectedEventId) {
          setSelectedEventId(eventList[0].id);
        }
      }
    } catch (error: any) {
      console.error("Failed to fetch events:", error);
      toast.error(error.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentScans = async () => {
    try {
      // Fetch recent scans from the last hour
      const response = await api.getRecentScans(20) as any;
      if (response?.success) {
        setRecentScans(response.data.scans || []);
      }
    } catch (error: any) {
      console.error("Failed to fetch recent scans:", error);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedEventId) {
      toast.error("Please select an event first");
      return;
    }

    setScanning(true);
    setScanResult(null);

    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        try {
          const response = await api.scanTicket(base64String, selectedEventId) as any;
          
          if (response?.success) {
            setScanResult({
              success: true,
              message: response.message,
              ticket: response.data?.ticket,
            });
            toast.success("Ticket validated successfully!");
            fetchRecentScans();
          } else {
            setScanResult({
              success: false,
              message: response?.message || "Invalid ticket",
            });
            toast.error(response?.message || "Invalid ticket");
          }
        } catch (error: any) {
          setScanResult({
            success: false,
            message: error.message || "Failed to scan ticket",
          });
          toast.error(error.message || "Failed to scan ticket");
        } finally {
          setScanning(false);
          // Clear result after 3 seconds
          setTimeout(() => setScanResult(null), 3000);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error("Error processing image:", error);
      toast.error("Failed to process image");
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      handleImageUpload(file);
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return "N/A";
    return new Date(timeString).toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScanStatusColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'bg-green-500/20 text-green-500';
      case 'invalid':
        return 'bg-red-500/20 text-red-500';
      case 'already_used':
        return 'bg-yellow-500/20 text-yellow-500';
      default:
        return 'bg-gray-500/20 text-gray-500';
    }
  };

  const getScanStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <ScanLine className="h-4 w-4 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Ticket Scanner</h1>
        <p className="text-sm text-muted-foreground mt-1">Scan QR codes to validate tickets</p>
      </div>

      {/* Event Selector */}
      {events.length > 0 && (
        <div className="glass-card p-4">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">Select Event</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
          >
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.title} - {new Date(event.event_date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Scanner Area */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative aspect-square max-h-100 mx-auto rounded-2xl border-2 overflow-hidden transition-all duration-500 cursor-pointer ${
          scanResult?.success ? "border-green-500 shadow-lg shadow-green-500/20" :
          scanResult && !scanResult.success ? "border-red-500 shadow-lg shadow-red-500/20" :
          "border-border hover:border-primary/50"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="absolute inset-0 bg-secondary flex items-center justify-center">
          {scanning ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Processing...</p>
            </div>
          ) : scanResult ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-center space-y-3"
            >
              {scanResult.success ? (
                <>
                  <CheckCircle className="h-20 w-20 mx-auto text-green-500" />
                  <p className="text-xl font-bold text-green-500">VALID TICKET</p>
                  {scanResult.ticket && (
                    <div className="text-sm text-muted-foreground">
                      <p>{scanResult.ticket.attendeeName}</p>
                      <p>{scanResult.ticket.tierName}</p>
                      <p>{scanResult.ticket.eventTitle}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <XCircle className="h-20 w-20 mx-auto text-red-500" />
                  <p className="text-xl font-bold text-red-500">INVALID TICKET</p>
                  <p className="text-sm text-muted-foreground">{scanResult.message}</p>
                </>
              )}
            </motion.div>
          ) : (
            <div className="text-center space-y-3">
              <Camera className="h-16 w-16 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload QR code image</p>
              <p className="text-xs text-muted-foreground">Supported: PNG, JPG, JPEG (Max 5MB)</p>
              <div className="absolute inset-8 border-2 border-primary/30 rounded-xl" />
              <div className="absolute top-8 left-8 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
              <div className="absolute top-8 right-8 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
              <div className="absolute bottom-8 left-8 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
              <div className="absolute bottom-8 right-8 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={scanning}
        />
      </motion.div>

      {/* Instructions */}
      <div className="glass-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          📸 Take a clear photo of the ticket QR code and upload it.
          The system will automatically verify the ticket.
        </p>
      </div>

      {/* Recent Scans */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Scans</h3>
        {recentScans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ScanLine className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No recent scans</p>
            <p className="text-xs mt-1">Scanned tickets will appear here</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-75 overflow-y-auto">
            {recentScans.slice(0, 10).map((scan, i) => (
              <motion.div
                key={scan.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors"
              >
                {getScanStatusIcon(scan.scan_status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{scan.ticket_number}</p>
                  <p className="text-xs text-muted-foreground">{scan.attendee_name || "Anonymous"} • {formatTime(scan.created_at)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getScanStatusColor(scan.scan_status)}`}>
                  {scan.scan_status}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}