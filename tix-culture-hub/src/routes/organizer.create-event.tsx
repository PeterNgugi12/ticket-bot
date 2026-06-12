import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Upload, MapPin, Clock, Eye, EyeOff, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/organizer/create-event")({
  component: CreateEvent,
});

interface TicketType {
  id: number;
  name: string;
  price: string;
  quantity: string;
  benefits?: string[];
  maxPerPerson?: number;
}

function CreateEvent() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "secret">("public");
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([
    { id: 1, name: "Regular", price: "", quantity: "", benefits: [], maxPerPerson: 5 },
    { id: 2, name: "VIP", price: "", quantity: "", benefits: ["VIP Area Access", "Fast Entry"], maxPerPerson: 3 },
  ]);
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state - FIXED: changed category from "general" to "music"
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    venueName: "",
    latitude: "",
    longitude: "",
    totalTickets: "",
    maxTicketsPerUser: "10",
    minAgeRestriction: "",
    category: "music", // Changed from "general" to a valid category
  });

  const addTicketType = () => {
    setTicketTypes([...ticketTypes, { 
      id: Date.now(), 
      name: "", 
      price: "", 
      quantity: "", 
      benefits: [],
      maxPerPerson: 5 
    }]);
  };

  const removeTicketType = (id: number) => {
    if (ticketTypes.length <= 1) {
      toast.error("You need at least one ticket type");
      return;
    }
    setTicketTypes(ticketTypes.filter(t => t.id !== id));
  };

  const updateTicketType = (id: number, field: keyof TicketType, value: any) => {
    setTicketTypes(ticketTypes.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleImageSelect = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size must be less than 10MB");
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  };

  const handleSubmit = async (publish: boolean = true) => {
    // Validation
    if (!formData.title) {
      toast.error("Please enter event title");
      return;
    }
    if (!formData.date) {
      toast.error("Please select event date");
      return;
    }
    if (!formData.venueName) {
      toast.error("Please enter venue name");
      return;
    }
    
    // Validate ticket types
    const invalidTiers = ticketTypes.filter(t => !t.name || !t.price || !t.quantity);
    if (invalidTiers.length > 0) {
      toast.error("Please fill in all ticket type details");
      return;
    }

    setLoading(true);
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('eventDate', `${formData.date}T${formData.time || '20:00'}:00`);
      formDataToSend.append('venueName', formData.venueName);
      formDataToSend.append('latitude', formData.latitude || '-1.2921');
      formDataToSend.append('longitude', formData.longitude || '36.8219');
      formDataToSend.append('isSecret', visibility === 'secret' ? 'true' : 'false');
      formDataToSend.append('totalTickets', formData.totalTickets || ticketTypes.reduce((sum, t) => sum + parseInt(t.quantity || '0'), 0).toString());
      formDataToSend.append('maxTicketsPerUser', formData.maxTicketsPerUser);
      formDataToSend.append('category', formData.category);
      
      if (formData.minAgeRestriction) {
        formDataToSend.append('minAgeRestriction', formData.minAgeRestriction);
      }
      
      // Add ticket tiers
      const tiers = ticketTypes.map(t => ({
        name: t.name,
        price: parseFloat(t.price),
        quantity: parseInt(t.quantity),
        benefits: t.benefits || [],
        maxPerPerson: t.maxPerPerson || 5,
      }));
      formDataToSend.append('ticketTiers', JSON.stringify(tiers));
      
      // Add image if selected
      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }
      
      const response = await api.createEvent(formDataToSend, publish) as any;
      
      if (response?.success) {
        toast.success(publish ? "Event published successfully!" : "Event saved as draft");
        navigate({ to: "/organizer/events" });
      } else {
        toast.error(response?.message || "Failed to create event");
      }
    } catch (error: any) {
      console.error("Create event error:", error);
      toast.error(error.message || "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create New Event</h1>
        <p className="text-sm text-muted-foreground mt-1">Fill in the details to publish your event</p>
      </div>

      <div className="grid gap-6">
        {/* Event Image */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Event Image</h3>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                <button
                  onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-foreground font-medium">Drag & drop your event image</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB • 1200×630 recommended</p>
                <Button variant="outline" size="sm" className="mt-4">Browse Files</Button>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0])} />
        </motion.div>

        {/* Event Details */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Event Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Event Title *</label>
              <input 
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Safari Sounds Vol. 12" 
                className="w-full h-10 mt-1.5 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea 
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4} 
                placeholder="Tell people what your event is about..." 
                className="w-full mt-1.5 rounded-lg bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all resize-none" 
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Date *</label>
                <input 
                  type="date" 
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full h-10 mt-1.5 rounded-lg bg-input px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Time</label>
                <input 
                  type="time" 
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full h-10 mt-1.5 rounded-lg bg-input px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
                />
              </div>
            </div>
            {/* Category Select - ADDED */}
            <div>
              <label className="text-sm font-medium text-foreground">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-10 mt-1.5 rounded-lg bg-input px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
              >
                <option value="music">🎵 Music</option>
                <option value="party">🎉 Party</option>
                <option value="comedy">😂 Comedy</option>
                <option value="sports">⚽ Sports</option>
                <option value="conference">💼 Conference</option>
                <option value="gospel">🙏 Gospel</option>
                <option value="other">🎪 Other</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Location */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Location
          </h3>
          <input 
            value={formData.venueName}
            onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
            placeholder="Venue name *" 
            className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
          />
          <div className="grid grid-cols-2 gap-3">
            <input 
              value={formData.latitude}
              onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
              placeholder="Latitude" 
              className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
            />
            <input 
              value={formData.longitude}
              onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
              placeholder="Longitude" 
              className="w-full h-10 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
            />
          </div>
          <div className="rounded-xl overflow-hidden border border-border h-48 bg-secondary flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Interactive map coming soon</p>
              <p className="text-xs text-muted-foreground mt-1">Lat: {formData.latitude || '-1.2921'} • Lng: {formData.longitude || '36.8219'}</p>
            </div>
          </div>
          <a 
            href={`https://www.google.com/maps?q=${formData.latitude || '-1.2921'},${formData.longitude || '36.8219'}`} 
            target="_blank" 
            rel="noreferrer" 
            className="text-sm text-primary hover:underline"
          >
            📍 View on Google Maps
          </a>
        </motion.div>

        {/* Ticket Types */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ticket Types *</h3>
            <Button variant="ghost" size="sm" onClick={addTicketType}><Plus className="h-4 w-4 mr-1" /> Add Type</Button>
          </div>
          <div className="space-y-3">
            {ticketTypes.map((t, i) => (
              <div key={t.id} className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg bg-secondary/50">
                <input
                  value={t.name}
                  onChange={e => updateTicketType(t.id, 'name', e.target.value)}
                  placeholder="Type name"
                  className="flex-1 h-9 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
                <input
                  value={t.price}
                  onChange={e => updateTicketType(t.id, 'price', e.target.value)}
                  placeholder="Price (KES)"
                  className="w-full sm:w-32 h-9 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
                <input
                  value={t.quantity}
                  onChange={e => updateTicketType(t.id, 'quantity', e.target.value)}
                  placeholder="Quantity"
                  className="w-full sm:w-28 h-9 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all"
                />
                {ticketTypes.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeTicketType(t.id)} className="text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Visibility */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Visibility</h3>
          <div className="flex gap-3">
            <button
              onClick={() => setVisibility("public")}
              className={`flex-1 p-4 rounded-lg border text-center transition-all ${
                visibility === "public" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <Eye className="h-5 w-5 mx-auto mb-2 text-foreground" />
              <p className="text-sm font-medium">Public</p>
              <p className="text-xs text-muted-foreground">Anyone can find and buy</p>
            </button>
            <button
              onClick={() => setVisibility("secret")}
              className={`flex-1 p-4 rounded-lg border text-center transition-all ${
                visibility === "secret" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <EyeOff className="h-5 w-5 mx-auto mb-2 text-foreground" />
              <p className="text-sm font-medium">Secret</p>
              <p className="text-xs text-muted-foreground">Only with direct link</p>
            </button>
          </div>
        </motion.div>

        {/* Advanced Options */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Advanced Options</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground">Max Tickets Per User</label>
              <input 
                type="number"
                value={formData.maxTicketsPerUser}
                onChange={(e) => setFormData({ ...formData, maxTicketsPerUser: e.target.value })}
                placeholder="Max per person"
                className="w-full h-10 mt-1.5 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Age Restriction</label>
              <input 
                type="number"
                value={formData.minAgeRestriction}
                onChange={(e) => setFormData({ ...formData, minAgeRestriction: e.target.value })}
                placeholder="Minimum age (optional)"
                className="w-full h-10 mt-1.5 rounded-lg bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary transition-all" 
              />
            </div>
          </div>
        </motion.div>

        <div className="flex justify-end gap-3 pb-6">
          <Button 
            variant="outline" 
            size="lg" 
            onClick={() => handleSubmit(false)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Draft
          </Button>
          <Button 
            variant="neon" 
            size="lg" 
            onClick={() => handleSubmit(true)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Publish Event
          </Button>
        </div>
      </div>
    </div>
  );
}