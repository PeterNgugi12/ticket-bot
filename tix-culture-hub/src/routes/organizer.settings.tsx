import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bell, Lock, User, Building2, Smartphone, Save, Mail, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { api } from "@/services/api";

export const Route = createFileRoute("/organizer/settings")({
  component: OrganizerSettings,
});

interface ProfileData {
  fullName: string;
  email: string;
  phoneNumber: string;
  website?: string;
  companyName?: string;
  bio?: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface NotificationSettings {
  salesAlerts: boolean;
  scanAlerts: boolean;
  payoutAlerts: boolean;
  fraudAlerts: boolean;
  weeklyDigest: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  whatsappAlerts: boolean;
}

interface SystemSettings {
  autoApproveResale: boolean;
  requireScanReceipt: boolean;
  publicProfile: boolean;
  twoFactorAuth: boolean;
}

function OrganizerSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [profile, setProfile] = useState<ProfileData>({
    fullName: "",
    email: "",
    phoneNumber: "",
    website: "",
    companyName: "",
    bio: "",
  });

  const [password, setPassword] = useState<PasswordData>({ 
    currentPassword: "", 
    newPassword: "", 
    confirmPassword: "" 
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    salesAlerts: true,
    scanAlerts: true,
    payoutAlerts: true,
    fraudAlerts: true,
    weeklyDigest: false,
    emailAlerts: true,
    smsAlerts: true,
    whatsappAlerts: true,
  });

  const [system, setSystem] = useState<SystemSettings>({
    autoApproveResale: false,
    requireScanReceipt: true,
    publicProfile: true,
    twoFactorAuth: false,
  });

  const sections = [
    { id: "profile", label: "Profile", icon: User },
    { id: "password", label: "Password", icon: Lock },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "system", label: "System", icon: Smartphone },
  ];
  const [active, setActive] = useState("profile");

  // Fetch profile data on load
  useEffect(() => {
    fetchProfile();
    fetchSettings();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await api.getProfile() as any;
      if (response.success) {
        const user = response.data.user;
        setProfile({
          fullName: user.full_name || user.fullName || "",
          email: user.email || "",
          phoneNumber: user.phone_number || user.phoneNumber || "",
          website: user.website || "",
          companyName: user.company_name || user.companyName || "",
          bio: user.bio || "",
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      // Use the public method instead of private request
      const response = await api.getOrganizerSettings() as any;
      if (response.success) {
        if (response.data.notifications) {
          setNotifications(response.data.notifications);
        }
        if (response.data.system) {
          setSystem(response.data.system);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Use default settings if API fails
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await api.updateProfile({
        fullName: profile.fullName,
        email: profile.email,
        phoneNumber: profile.phoneNumber,
      }) as any;
      
      if (response.success) {
        setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: response.message || 'Failed to update profile' });
      }
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (password.newPassword !== password.confirmPassword) {
      setSaveMessage({ type: 'error', text: 'New passwords do not match' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    if (password.newPassword.length < 6) {
      setSaveMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await api.changePassword({
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
      }) as any;
      
      if (response.success) {
        setSaveMessage({ type: 'success', text: 'Password changed successfully!' });
        setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: response.message || 'Failed to change password' });
      }
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to change password' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      // Use the public method instead of private request
      const response = await api.updateNotificationSettings(notifications) as any;
      
      if (response.success) {
        setSaveMessage({ type: 'success', text: 'Notification settings saved!' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: response.message || 'Failed to save settings' });
      }
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSystem = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      // Use the public method instead of private request
      const response = await api.updateSystemSettings(system) as any;
      
      if (response.success) {
        setSaveMessage({ type: 'success', text: 'System preferences saved!' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: response.message || 'Failed to save preferences' });
      }
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, security & notifications</p>
      </div>

      {saveMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          saveMessage.type === 'success' 
            ? 'bg-success/10 text-success' 
            : 'bg-destructive/10 text-destructive'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar */}
        <div className="glass-card p-2 h-fit">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active === s.id ? "bg-sidebar-accent text-sidebar-primary" : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-6">
          {active === "profile" && (
            <>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-chart-1" />
                <h2 className="text-lg font-semibold">Organization Profile</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <input
                    value={profile.fullName}
                    onChange={e => setProfile({ ...profile, fullName: e.target.value })}
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Name</label>
                  <input
                    value={profile.companyName}
                    onChange={e => setProfile({ ...profile, companyName: e.target.value })}
                    placeholder="Optional"
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={e => setProfile({ ...profile, email: e.target.value })}
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone Number</label>
                  <input
                    type="tel"
                    value={profile.phoneNumber}
                    onChange={e => setProfile({ ...profile, phoneNumber: e.target.value })}
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Website</label>
                  <input
                    value={profile.website}
                    onChange={e => setProfile({ ...profile, website: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Bio</label>
                  <textarea
                    value={profile.bio}
                    onChange={e => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Tell us about your organization"
                    rows={3}
                    className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all resize-none"
                  />
                </div>
              </div>
              <Button variant="neon" onClick={handleSaveProfile} disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </>
          )}

          {active === "password" && (
            <>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-chart-1" />
                <h2 className="text-lg font-semibold">Change Password</h2>
              </div>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Current Password</label>
                  <input
                    type="password"
                    value={password.currentPassword}
                    onChange={e => setPassword({ ...password, currentPassword: e.target.value })}
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Password</label>
                  <input
                    type="password"
                    value={password.newPassword}
                    onChange={e => setPassword({ ...password, newPassword: e.target.value })}
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                  <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm New Password</label>
                  <input
                    type="password"
                    value={password.confirmPassword}
                    onChange={e => setPassword({ ...password, confirmPassword: e.target.value })}
                    className="w-full h-10 rounded-lg bg-input px-3 text-sm outline-none ring-1 ring-border focus:ring-primary transition-all"
                  />
                </div>
              </div>
              <Button variant="neon" onClick={handleChangePassword} disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? "Updating..." : "Update Password"}
              </Button>
            </>
          )}

          {active === "notifications" && (
            <>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-chart-1" />
                <h2 className="text-lg font-semibold">Notifications</h2>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Event Alerts</p>
                {[
                  { key: "salesAlerts" as const, label: "New ticket sale", desc: "Get notified when someone buys a ticket" },
                  { key: "scanAlerts" as const, label: "Ticket scan activity", desc: "Real-time scan logs at the gate" },
                  { key: "payoutAlerts" as const, label: "M-Pesa payouts", desc: "Withdrawals & balance updates" },
                  { key: "fraudAlerts" as const, label: "Fraud attempts", desc: "Duplicate or invalid scan attempts" },
                  { key: "weeklyDigest" as const, label: "Weekly digest", desc: "Summary of weekly performance" },
                ].map(n => (
                  <div key={n.key} className="flex items-center justify-between py-3 border-b border-border/50">
                    <div>
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <Toggle checked={notifications[n.key]} onChange={() => setNotifications({ ...notifications, [n.key]: !notifications[n.key] })} />
                  </div>
                ))}

                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-6 mb-2">Delivery Channels</p>
                {[
                  { key: "emailAlerts" as const, label: "Email", icon: Mail },
                  { key: "smsAlerts" as const, label: "SMS", icon: Smartphone },
                  { key: "whatsappAlerts" as const, label: "WhatsApp", icon: MessageSquare },
                ].map(c => (
                  <div key={c.key} className="flex items-center justify-between py-3 border-b border-border/50">
                    <div className="flex items-center gap-3">
                      <c.icon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{c.label}</p>
                    </div>
                    <Toggle checked={notifications[c.key]} onChange={() => setNotifications({ ...notifications, [c.key]: !notifications[c.key] })} />
                  </div>
                ))}
              </div>
              <Button variant="neon" onClick={handleSaveNotifications} disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? "Saving..." : "Save Notifications"}
              </Button>
            </>
          )}

          {active === "system" && (
            <>
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-chart-1" />
                <h2 className="text-lg font-semibold">System Preferences</h2>
              </div>
              <div className="space-y-1">
                {[
                  { key: "autoApproveResale" as const, label: "Auto-approve ticket resales", desc: "Skip manual review for resale marketplace" },
                  { key: "requireScanReceipt" as const, label: "Require scan receipts", desc: "SMS confirmation to attendee on scan" },
                  { key: "publicProfile" as const, label: "Public organizer profile", desc: "Show your events on the public marketplace" },
                  { key: "twoFactorAuth" as const, label: "Two-factor authentication", desc: "Add an extra layer of security" },
                ].map(s => (
                  <div key={s.key} className="flex items-center justify-between py-3 border-b border-border/50">
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                    <Toggle checked={system[s.key]} onChange={() => setSystem({ ...system, [s.key]: !system[s.key] })} />
                  </div>
                ))}
              </div>
              <Button variant="neon" onClick={handleSaveSystem} disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? "Saving..." : "Save Preferences"}
              </Button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}