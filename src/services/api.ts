const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  birth_date: string;
  is_verified: boolean;
  role: 'client' | 'pro';
  created_at: string;
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
  profile_photo?: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone_number: string;
  birth_date: string;
  role?: 'client' | 'pro';
  activity_name?: string;
  city?: string;
  instagram_account?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const token = localStorage.getItem('auth_token');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || data.error || 'Une erreur est survenue' };
    }

    return { success: true, data: data.data ?? data, message: data.message };
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur de connexion au serveur' };
  }
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<ApiResponse<{ user: User; token: string }>> => {
    return apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  signup: async (data: SignupData): Promise<ApiResponse<{ user: User; token: string }>> => {
    return apiCall('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  logout: async (): Promise<ApiResponse<void>> => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    return { success: true };
  },

  getProfile: () => apiCall<User>('/api/users'),
  
  updateProfile: (data: Partial<User>) => apiCall<User>('/api/users', { 
    method: 'PUT', 
    body: JSON.stringify(data) 
  }),
};

export const bookingsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall('/api/bookings');
  },

  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiCall(`/api/bookings/${id}`);
  },

  create: async (data: any): Promise<ApiResponse<any>> => {
    return apiCall('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: any): Promise<ApiResponse<any>> => {
    return apiCall(`/api/bookings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  cancel: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/bookings/${id}/cancel`, {
      method: 'POST',
    });
  },
};

export const specialistsApi = {
  getAll: async (query?: string): Promise<ApiResponse<any[]>> => {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiCall(`/api/specialists${params}`);
  },

  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiCall(`/api/specialists/${id}`);
  },

  getAvailability: async (id: string, date: string): Promise<ApiResponse<any[]>> => {
    return apiCall(`/api/specialists/${id}/availability?date=${encodeURIComponent(date)}`);
  },
};

export const reviewsApi = {
  create: async (specialistId: string, data: { rating: number; comment: string }): Promise<ApiResponse<any>> => {
    return apiCall(`/api/specialists/${specialistId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getBySpecialist: async (specialistId: string): Promise<ApiResponse<any[]>> => {
    return apiCall(`/api/specialists/${specialistId}/reviews`);
  },
};

export const favoritesApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall('/api/favorites');
  },

  add: async (specialistId: string): Promise<ApiResponse<void>> => {
    return apiCall('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ specialistId }),
    });
  },

  remove: async (specialistId: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/favorites/${specialistId}`, {
      method: 'DELETE',
    });
  },
};

export const notificationsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall('/api/notifications');
  },

  markAsRead: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/notifications/${id}/read`, {
      method: 'POST',
    });
  },
};

export const proApi = {
  getDashboard: async (): Promise<ApiResponse<any>> => {
    return apiCall('/api/pro/dashboard');
  },
};


export interface PaymentsSettings {
  bankaccountname: string | null;
  IBAN: string | null;
  accept_online_payment: 0 | 1;
}

export const paymentsApi = {
  updateProPayments: async (data: {
    bankaccountname: string;
    IBAN: string;
    accept_online_payment: boolean;
  }): Promise<ApiResponse<PaymentsSettings>> => {
    return apiCall('/api/users/payments', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

export default {
  auth: authApi,
  bookings: bookingsApi,
  specialists: specialistsApi,
  reviews: reviewsApi,
  favorites: favoritesApi,
  notifications: notificationsApi,
  payments: paymentsApi,
  pro: proApi,
};

