// src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
      phoneNumber: string;
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
    sessionToken: string;
  };
}

export interface NotificationSettings {
  salesAlerts: boolean;
  scanAlerts: boolean;
  payoutAlerts: boolean;
  fraudAlerts: boolean;
  weeklyDigest: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  whatsappAlerts: boolean;
}

export interface SystemSettings {
  autoApproveResale: boolean;
  requireScanReceipt: boolean;
  publicProfile: boolean;
  twoFactorAuth: boolean;
}

class ApiService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  
  // Cache configuration
  private cache = new Map<string, { data: any; timestamp: number }>();
  private pendingRequests = new Map<string, Promise<any>>();
  private CACHE_DURATION = 30000; // 30 seconds

  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      const customHeaders = options.headers as Record<string, string>;
      Object.assign(headers, customHeaders);
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed && this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, {
          ...options,
          headers,
        });
        return retryResponse.json();
      } else if (typeof window !== 'undefined') {
        this.clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      } else {
        throw new Error('Session expired');
      }
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }

    return data;
  }

  // Helper for cached requests with deduplication
  private async cachedRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    cacheKey?: string,
    forceRefresh = false
  ): Promise<T> {
    const key = cacheKey || `${options.method || 'GET'}:${endpoint}`;
    
    // Check cache
    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        console.log(`[Cache HIT] ${key}`);
        return cached.data;
      }
    }
    
    // Deduplicate in-flight requests
    if (this.pendingRequests.has(key)) {
      console.log(`[Request Dedup] ${key}`);
      return this.pendingRequests.get(key) as Promise<T>;
    }
    
    const requestPromise = this.request<T>(endpoint, options)
      .then(data => {
        // Store in cache
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
      });
    
    this.pendingRequests.set(key, requestPromise);
    return requestPromise;
  }

  // Clear cache for specific endpoints
  clearCache(pattern?: string) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
      console.log(`[Cache cleared] Pattern: ${pattern}`);
    } else {
      this.cache.clear();
      console.log('[Cache cleared] All');
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.data.accessToken;
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('accessToken', this.accessToken!);
        }
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }

    return false;
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    if (response.success) {
      this.setTokens(
        response.data.tokens.accessToken,
        response.data.tokens.refreshToken
      );
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      // Clear cache on login
      this.clearCache();
    }
    
    return response;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    this.clearTokens();
    this.clearCache();
  }

  // ==================== AUTH METHODS ====================
  
  async getProfile() {
    return this.cachedRequest('/auth/profile', { method: 'GET' }, 'profile');
  }

  async updateProfile(data: { fullName: string; email: string; phoneNumber: string }) {
    const result = await this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    this.clearCache('profile');
    return result;
  }

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    const result = await this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.clearCache('profile');
    return result;
  }

  // ==================== ADMIN METHODS ====================

  async getDashboardStats() {
    return this.cachedRequest('/admin/dashboard/stats', { method: 'GET' }, 'admin-dashboard');
  }

  async getAllUsers(params?: { role?: string; search?: string; limit?: number; offset?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.role) queryParams.append('role', params.role);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    
    const url = `/admin/users${queryParams.toString() ? `?${queryParams}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getUserDetails(userId: string) {
    const cacheKey = `GET:/admin/users/${userId}`;
    return this.cachedRequest(`/admin/users/${userId}`, { method: 'GET' }, cacheKey);
  }

  async updateUserRole(userId: string, role: string) {
    const result = await this.request(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    this.clearCache('users');
    return result;
  }

  async toggleUserStatus(userId: string, isActive: boolean) {
    const result = await this.request(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    });
    this.clearCache('users');
    return result;
  }

  async createOrganizer(data: { phoneNumber: string; email: string; fullName: string; password: string; commissionRate?: number }) {
    const result = await this.request('/admin/organizers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.clearCache('organizers');
    return result;
  }

  async getAllOrganizers(limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const url = `/admin/organizers${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getPendingWithdrawals(limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    const url = `/admin/withdrawals/pending${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async approveWithdrawal(withdrawalId: string) {
    const result = await this.request(`/admin/withdrawals/${withdrawalId}/approve`, { method: 'POST' });
    this.clearCache('withdrawals');
    return result;
  }

  async rejectWithdrawal(withdrawalId: string, reason: string) {
    const result = await this.request(`/admin/withdrawals/${withdrawalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    this.clearCache('withdrawals');
    return result;
  }

  async getRevenueAnalytics(days?: number) {
    const params = new URLSearchParams();
    if (days) params.append('days', days.toString());
    const url = `/admin/analytics/revenue${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getUserGrowthAnalytics(days?: number) {
    const params = new URLSearchParams();
    if (days) params.append('days', days.toString());
    const url = `/admin/analytics/user-growth${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getTicketSalesAnalytics(eventId?: string, days?: number) {
    const params = new URLSearchParams();
    if (eventId) params.append('eventId', eventId);
    if (days) params.append('days', days.toString());
    const url = `/admin/analytics/ticket-sales${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getEventPerformance(limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    const url = `/admin/analytics/event-performance${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getPlatformSettings() {
    return this.cachedRequest('/admin/settings', { method: 'GET' }, 'platform-settings');
  }

  async updatePlatformSettings(settings: any) {
    const result = await this.request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    this.clearCache('platform-settings');
    return result;
  }

  async getSystemLogs(filters?: { userId?: string; action?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    
    const url = `/admin/logs${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async getAllEvents(params?: { status?: string; limit?: number; offset?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const url = `/admin/events${queryParams.toString() ? `?${queryParams}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async updateEventStatus(eventId: string, status: string) {
    const result = await this.request(`/admin/events/${eventId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    this.clearCache('events');
    return result;
  }

  async getDisputes(params?: { status?: string; limit?: number; offset?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const url = `/admin/disputes${queryParams.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async resolveDispute(disputeId: string, resolution: string, note: string) {
    const result = await this.request(`/admin/disputes/${disputeId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolution, note }),
    });
    this.clearCache('disputes');
    return result;
  }

  // ==================== ORGANIZER METHODS ====================

  async getMyEvents(status?: string) {
    const cacheKey = `GET:/events/my/events${status ? `?status=${status}` : ''}`;
    return this.cachedRequest(
      `/events/my/events${status ? `?status=${status}` : ''}`,
      { method: 'GET' },
      cacheKey
    );
  }

  async getEventDetails(eventId: string) {
    const cacheKey = `GET:/events/${eventId}`;
    return this.cachedRequest(`/events/${eventId}`, { method: 'GET' }, cacheKey);
  }

  async publishEvent(eventId: string) {
    const result = await this.request(`/events/${eventId}/publish`, { method: 'POST' });
    this.clearCache('events');
    this.clearCache('organizer');
    return result;
  }

  async createEvent(formData: FormData, publish: boolean = true) {
    if (!publish) {
      formData.append('status', 'draft');
    }
    
    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }
    
    // Clear related caches
    this.clearCache('events');
    this.clearCache('organizer');
    
    return data;
  }

  async deleteEvent(eventId: string) {
    const result = await this.request(`/admin/events/${eventId}`, { method: 'DELETE' });
    this.clearCache('events');
    this.clearCache('organizer');
    return result;
  }

  async getEventStats(eventId: string) {
    const cacheKey = `GET:/events/${eventId}/stats`;
    return this.cachedRequest(`/events/${eventId}/stats`, { method: 'GET' }, cacheKey);
  }

  async getEventCheckins(eventId: string, limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const url = `/scan/events/${eventId}/checkins${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  // ==================== TICKET METHODS ====================

  async getEventTickets(eventId: string, status?: string) {
    const cacheKey = `GET:/tickets/event/${eventId}${status ? `?status=${status}` : ''}`;
    return this.cachedRequest(
      `/tickets/event/${eventId}${status ? `?status=${status}` : ''}`,
      { method: 'GET' },
      cacheKey
    );
  }

  // Batch method to get all tickets for organizer (optimized)
  async getAllOrganizerTickets(limit?: number) {
    const cacheKey = `GET:/organizer/tickets${limit ? `?limit=${limit}` : ''}`;
    return this.cachedRequest(
      `/organizer/tickets${limit ? `?limit=${limit}` : ''}`,
      { method: 'GET' },
      cacheKey
    );
  }

  // ==================== WALLET METHODS ====================

  async getWallet() {
    return this.cachedRequest('/wallet', { method: 'GET' }, 'wallet');
  }

  async getWalletTransactions(limit?: number, offset?: number, type?: string) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    if (type) params.append('type', type);
    const url = `/wallet/transactions${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async requestWithdrawal(amount: number, phoneNumber: string) {
    const result = await this.request('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, phoneNumber }),
    });
    this.clearCache('wallet');
    return result;
  }

  // ==================== SCANNER METHODS ====================

  async scanTicket(imageBase64: string, eventId: string, gateNumber?: string) {
    const result = await this.request('/scan/scan', {
      method: 'POST',
      body: JSON.stringify({
        image: imageBase64,
        eventId,
        gateNumber: gateNumber || 'Gate A',
      }),
    });
    this.clearCache('scans');
    this.clearCache('checkins');
    return result;
  }

  async getRecentScans(limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    const url = `/scan/recent${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  // ==================== TEAM MANAGEMENT METHODS ====================

  async getTeamMembers(eventId?: string) {
    const params = new URLSearchParams();
    if (eventId) params.append('eventId', eventId);
    const url = `/scanners/team${params.toString() ? `?${params}` : ''}`;
    const cacheKey = `GET:${url}`;
    return this.cachedRequest(url, { method: 'GET' }, cacheKey);
  }

  async addTeamMember(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    eventId: string;
  }) {
    const result = await this.request('/scanners/team', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.clearCache('team');
    return result;
  }

  async updateTeamMemberStatus(memberId: string, status: 'active' | 'inactive') {
    const result = await this.request(`/scanners/team/${memberId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    this.clearCache('team');
    return result;
  }

  async deleteTeamMember(memberId: string) {
    const result = await this.request(`/scanners/team/${memberId}`, { method: 'DELETE' });
    this.clearCache('team');
    return result;
  }

  async getTeamMemberStats(memberId: string) {
    const cacheKey = `GET:/scanners/team/${memberId}/stats`;
    return this.cachedRequest(`/scanners/team/${memberId}/stats`, { method: 'GET' }, cacheKey);
  }

  // ==================== ORGANIZER SETTINGS ====================

  async getOrganizerSettings() {
    return this.cachedRequest('/organizer/settings', { method: 'GET' }, 'organizer-settings');
  }

  async updateNotificationSettings(settings: NotificationSettings) {
    const result = await this.request('/organizer/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    this.clearCache('organizer-settings');
    return result;
  }

  async updateSystemSettings(settings: SystemSettings) {
    const result = await this.request('/organizer/settings/system', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    this.clearCache('organizer-settings');
    return result;
  }

  // ==================== BATCH METHODS ====================

  async getOrganizerDashboard() {
    return this.cachedRequest('/organizer/dashboard', { method: 'GET' }, 'organizer-dashboard');
  }

  async getOrganizerEventsWithTickets() {
    return this.cachedRequest('/organizer/events-with-tickets', { method: 'GET' }, 'organizer-events-tickets');
  }

  async getOrganizerSalesStats() {
    return this.cachedRequest('/organizer/sales-stats', { method: 'GET' }, 'organizer-sales-stats');
  }

  // ==================== UTILITY METHODS ====================

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  getUser(): any {
    if (typeof window !== 'undefined' && window.localStorage) {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          return JSON.parse(userStr);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  getUserRole(): string | null {
    const user = this.getUser();
    return user?.role || null;
  }

  // Force refresh cache for specific data
  refreshData(pattern?: string) {
    this.clearCache(pattern);
  }
}

export const api = new ApiService();