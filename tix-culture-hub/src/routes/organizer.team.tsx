import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, UserPlus, Trash2, X, Smartphone, ScanLine, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/TablePagination";
import { api } from "@/services/api";

export const Route = createFileRoute("/organizer/team")({
  component: OrganizerTeam,
});

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  assignedEvent: string;
  assignedEventId: string;
  scanned: number;
  status: "active" | "inactive";
  lastActive: string;
  lastLogin?: string;
  createdAt?: string;
}

interface Event {
  id: string;
  title: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data: T;
}

function OrganizerTeam() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ 
    name: "", 
    email: "", 
    phone: "", 
    password: "", 
    assignedEventId: "" 
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch team members and events on load
  useEffect(() => {
    fetchTeamMembers();
    fetchEvents();
  }, []);

  const fetchTeamMembers = async () => {
    setLoading(true);
    try {
      const response = await api.getTeamMembers() as ApiResponse<{ members: any[] }>;
      if (response.success) {
        const members = response.data.members.map((member: any) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          phone: member.phone || 'N/A',
          assignedEvent: member.event_title,
          assignedEventId: member.event_id,
          scanned: member.scans_count || 0,
          status: member.status,
          lastActive: formatLastActive(member.last_active || member.last_login),
          lastLogin: member.last_login,
          createdAt: member.created_at,
        }));
        setTeam(members);
      }
    } catch (error) {
      console.error('Error fetching team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await api.getMyEvents('published') as ApiResponse<{ events: Event[] }>;
      if (response.success) {
        setEvents(response.data.events);
        if (response.data.events.length > 0 && !form.assignedEventId) {
          setForm(prev => ({ ...prev, assignedEventId: response.data.events[0].id }));
        }
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const formatLastActive = (date: string | null) => {
    if (!date) return 'Never';
    
    const lastActive = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

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
    if (!form.assignedEventId) {
      setFormError("Please select an event to assign");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.addTeamMember({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        eventId: form.assignedEventId,
      }) as ApiResponse;

      if (response.success) {
        await fetchTeamMembers(); // Refresh the list
        setForm({ name: "", email: "", phone: "", password: "", assignedEventId: events[0]?.id || "" });
        setFormError("");
        setShowModal(false);
      } else {
        setFormError(response.message || "Failed to create team member");
      }
    } catch (error: any) {
      setFormError(error.message || "Failed to create team member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    
    try {
      const response = await api.deleteTeamMember(id) as ApiResponse;
      if (response.success) {
        await fetchTeamMembers(); // Refresh the list
      } else {
        alert(response.message || "Failed to remove team member");
      }
    } catch (error: any) {
      alert(error.message || "Failed to remove team member");
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'activate' : 'deactivate';
    
    if (!confirm(`Are you sure you want to ${action} this team member?`)) return;
    
    try {
      const response = await api.updateTeamMemberStatus(id, newStatus) as ApiResponse;
      
      if (response.success) {
        await fetchTeamMembers(); // Refresh the list
      } else {
        alert(response.message || `Failed to ${action} team member`);
      }
    } catch (error: any) {
      alert(error.message || `Failed to ${action} team member`);
    }
  };

  const filtered = team.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase()) ||
    t.assignedEvent.toLowerCase().includes(search.toLowerCase())
  );

  const { paginatedItems, currentPage, totalPages, goToPage, totalItems } = usePagination(filtered, 5);

  const totalScanned = team.reduce((sum, m) => sum + m.scanned, 0);
  const activeCount = team.filter(m => m.status === "active").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading team members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Scanner Team</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your mobile ticket scanners</p>
        </div>
        <Button variant="neon" onClick={() => setShowModal(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total Scanners</p>
            <Smartphone className="h-4 w-4 text-chart-1" />
          </div>
          <p className="text-2xl font-bold mt-2">{team.length}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Active Now</p>
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          </div>
          <p className="text-2xl font-bold mt-2">{activeCount}</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Tickets Scanned</p>
            <ScanLine className="h-4 w-4 text-chart-2" />
          </div>
          <p className="text-2xl font-bold mt-2">{totalScanned.toLocaleString()}</p>
        </div>
      </div>

      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or event..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-input text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium text-muted-foreground">Member</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Phone</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Assigned Event</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Scanned</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Last Active</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
               </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-muted-foreground">
                    No team members found
                  </td>
                </tr>
              ) : (
                paginatedItems.map((m, i) => (
                  <motion.tr
                    key={m.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
                          {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs font-mono">{m.phone}</td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-chart-1/20 text-chart-1">
                        {m.assignedEvent}
                      </span>
                    </td>
                    <td className="p-4 font-semibold">{m.scanned}</td>
                    <td className="p-4 text-muted-foreground text-xs">{m.lastActive}</td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleStatus(m.id, m.status)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                          m.status === "active" 
                            ? "bg-success/20 text-success hover:bg-success/30" 
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {m.status}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive/80" 
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 w-full max-w-md space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Scanner Team Member</h2>
              <button 
                onClick={() => { setShowModal(false); setFormError(""); }} 
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground bg-accent/40 px-3 py-2 rounded-lg flex gap-2">
              <Mail className="h-4 w-4 text-chart-1 shrink-0 mt-0.5" />
              <span>Member will use this email & password to log in on the mobile scanner app. They can change their password anytime.</span>
            </div>

            {formError && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{formError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. James Mwangi"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="scanner@email.com"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+254712345678"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign Event</label>
                <select
                  value={form.assignedEventId}
                  onChange={e => setForm({ ...form, assignedEventId: e.target.value })}
                  className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  required
                >
                  <option value="">Select an event</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="neon" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" /> Create Scanner Account
                  </>
                )}
              </Button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}