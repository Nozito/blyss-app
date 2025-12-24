// API Service for backend communication
// Configure this with your backend URL

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Types
export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  role: 'client' | 'pro';
  createdAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  birthDate: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Helper function for API calls
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = localStorage.getItem('auth_token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Une erreur est survenue',
      };
    }

    return {
      success: true,
      data: data.data || data,
      message: data.message,
    };
  } catch (error) {
    console.error('API Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de connexion au serveur',
    };
  }
}

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<ApiResponse<{ user: User; token: string }>> => {
    return apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  signup: async (data: SignupData): Promise<ApiResponse<{ user: User; token: string }>> => {
    return apiCall('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  logout: async (): Promise<ApiResponse<void>> => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    return { success: true };
  },

  getProfile: async (): Promise<ApiResponse<User>> => {
    return apiCall('/auth/profile');
  },

  updateProfile: async (data: Partial<User>): Promise<ApiResponse<User>> => {
    return apiCall('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// Bookings API
export const bookingsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall('/bookings');
  },

  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiCall(`/bookings/${id}`);
  },

  create: async (data: any): Promise<ApiResponse<any>> => {
    return apiCall('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: any): Promise<ApiResponse<any>> => {
    return apiCall(`/bookings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  cancel: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/bookings/${id}/cancel`, {
      method: 'POST',
    });
  },
};

// Specialists API
export const specialistsApi = {
  getAll: async (query?: string): Promise<ApiResponse<any[]>> => {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiCall(`/specialists${params}`);
  },

  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiCall(`/specialists/${id}`);
  },

  getAvailability: async (id: string, date: string): Promise<ApiResponse<any[]>> => {
    return apiCall(`/specialists/${id}/availability?date=${date}`);
  },
};

// Reviews API
export const reviewsApi = {
  create: async (specialistId: string, data: { rating: number; comment: string }): Promise<ApiResponse<any>> => {
    return apiCall(`/specialists/${specialistId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getBySpecialist: async (specialistId: string): Promise<ApiResponse<any[]>> => {
    return apiCall(`/specialists/${specialistId}/reviews`);
  },
};

// Favorites API
export const favoritesApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall('/favorites');
  },

  add: async (specialistId: string): Promise<ApiResponse<void>> => {
    return apiCall('/favorites', {
      method: 'POST',
      body: JSON.stringify({ specialistId }),
    });
  },

  remove: async (specialistId: string): Promise<ApiResponse<void>> => {
    return apiCall(`/favorites/${specialistId}`, {
      method: 'DELETE',
    });
  },
};

// Notifications API
export const notificationsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall('/notifications');
  },

  markAsRead: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/notifications/${id}/read`, {
      method: 'POST',
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
};
