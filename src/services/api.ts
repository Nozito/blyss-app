const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const API_URL = API_BASE_URL;

export const getApiEndpoint = (path: string): string => {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

// =====================
// TYPES & INTERFACES
// =====================

export interface User {
  is_admin: boolean;
  profile_visibility: string;
  id: number;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  birth_date: string;
  is_verified: boolean;
  role: "client" | "pro";
  created_at: string;
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
  profile_photo?: string | null;
  banner_photo?: string | null;
  bio?: string | null;
  pro_specialties?: string[] | null;
  pro_status?: "active" | "inactive" | "suspended" | null;
  clients_count?: number;
  avg_rating?: number | null;
  years_on_blyss?: number;
  bankaccountname?: string | null;
  IBAN?: string | null;
  accept_online_payment?: 0 | 1;
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
  role: "client" | "pro";
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
}

export interface SignupResponse {
  success: boolean;
  message?: string;
  error?: 
    | "email_exists"
    | "weak_password"
    | "age_restriction"
    | "invalid_phone"
    | "invalid_email"
    | "missing_fields"
    | "data_too_long"
    | "server_error";
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ClientNotificationSettings {
  reminders: boolean;
  changes: boolean;
  messages: boolean;
  late: boolean;
  offers: boolean;
  email_summary: boolean;
}

export interface ProNotificationSettings {
  new_reservation: boolean;
  cancel_change: boolean;
  daily_reminder: boolean;
  client_message: boolean;
  payment_alert: boolean;
  activity_summary: boolean;
}

export interface PaymentsSettings {
  bankaccountname: string | null;
  IBAN: string | null;
  accept_online_payment: 0 | 1;
}

export interface SavedCard {
  id: number;
  brand: "visa" | "mastercard" | "amex";
  last4: string;
  exp_month: string;
  exp_year: string;
  cardholder_name: string;
  is_default: boolean;
}

type UpdateServicePayload = Partial<{
  nom: string;
  typePrestation: string;
  description: string;
  prixBase: number;
  tempsBloque: number;
  reservable: boolean;
  options: { id?: number; nom: string; supplement: number }[];
}>;

// =====================
// SESSION MANAGEMENT
// =====================

const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setSession(accessToken: string, refreshToken: string, user?: User) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// =====================
// HTTP UTILITIES
// =====================

async function rawApiCall<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<{ response: Response; json: any }> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { response, json };
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const { response, json } = await rawApiCall<{
      accessToken: string;
      refreshToken: string;
    }>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok || !json?.success) {
      clearSession();
      return false;
    }

    const { accessToken: newAccess, refreshToken: newRefresh } = json.data;
    setSession(newAccess, newRefresh);
    return true;
  } catch (e) {
    console.error("Refresh token error:", e);
    clearSession();
    return false;
  }
}

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
async function apiCall<T>(method: string, endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
async function apiCall<T>(a: string, b?: any, c: any = {}): Promise<ApiResponse<T>> {
  let endpoint: string;
  let options: RequestInit = {};

  if (typeof b === "string") {
    endpoint = b;
    options = { ...(c || {}), method: a };
  } else {
    endpoint = a;
    options = b || {};
  }

  try {
    const token = getAccessToken();

    let { response, json } = await rawApiCall<T>(endpoint, options, token);

    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const newToken = getAccessToken();
        ({ response, json } = await rawApiCall<T>(endpoint, options, newToken));
      } else {
        return {
          success: false,
          error: "Session expirée, veuillez vous reconnecter",
        };
      }
    }

    if (!response.ok) {
      return {
        success: false,
        error: json?.message || json?.error || "Une erreur est survenue",
      };
    }

    return {
      success: true,
      data: json?.data ?? json,
      message: json?.message,
    };
  } catch (error) {
    console.error("API Error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur de connexion au serveur",
    };
  }
}

// =====================
// AUTH API
// =====================

export const authApi = {
  login: async (
    credentials: LoginCredentials
  ): Promise<
    ApiResponse<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>
  > => {
    const { response, json } = await rawApiCall<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });

    if (!response.ok || !json?.success) {
      return {
        success: false,
        error: json?.message || json?.error || "Une erreur est survenue",
      };
    }

    const { user, accessToken, refreshToken } = json.data;
    setSession(accessToken, refreshToken, user);

    return {
      success: true,
      data: { user, accessToken, refreshToken },
      message: json.message,
    };
  },

  signup: async (data: SignupData): Promise<SignupResponse> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const json = await response.json();

      if (response.ok) {
        return {
          success: true,
          message: json.message || "Account created successfully",
        };
      } else {
        return {
          success: false,
          message: json.message || "Signup failed",
          error: json.error,
        };
      }
    } catch (error) {
      console.error("Signup API error:", error);
      return {
        success: false,
        message: "Network error",
        error: "server_error",
      };
    }
  },

  getProfile: async (): Promise<ApiResponse<User>> => {
    return apiCall("/api/auth/profile");
  },

  updateProfile: async (data: Partial<User>): Promise<ApiResponse<User>> => {
    return apiCall("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  logout: async (): Promise<void> => {
    try {
      const refreshToken = localStorage.getItem("refresh_token");
      
      if (refreshToken) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.error("Logout API error:", error);
    } finally {
      clearSession();
    }
  },
};

// =====================
// BOOKINGS API
// =====================

export const bookingsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall("/api/bookings");
  },

  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiCall(`/api/bookings/${id}`);
  },

  create: async (data: any): Promise<ApiResponse<any>> => {
    return apiCall("/api/bookings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: any): Promise<ApiResponse<any>> => {
    return apiCall(`/api/bookings/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  cancel: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/bookings/${id}/cancel`, {
      method: "POST",
    });
  },
};

// =====================
// SPECIALISTS API
// =====================

export const specialistsApi = {
  getAll: async (query?: string): Promise<ApiResponse<any[]>> => {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    return apiCall(`/api/specialists${params}`);
  },

  getById: async (id: string): Promise<ApiResponse<any>> => {
    return apiCall(`/api/specialists/${id}`);
  },

  getAvailability: async (
    id: string,
    date: string
  ): Promise<ApiResponse<any[]>> => {
    return apiCall(
      `/api/specialists/${id}/availability?date=${encodeURIComponent(date)}`
    );
  },

  getSpecialists: (params?: { 
    page?: number; 
    limit?: number; 
    search?: string;
    city?: string;
  }) => {
    const query = params
      ? '?' +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return apiCall('GET', `/api/client/specialists${query}`);
  },
  
  getSpecialistById: (id: number) => 
    apiCall('GET', `/api/client/specialists/${id}`),
};

// =====================
// REVIEWS API
// =====================

export const reviewsApi = {
  create: async (
    specialistId: string,
    data: { rating: number; comment: string }
  ): Promise<ApiResponse<any>> => {
    return apiCall(`/api/specialists/${specialistId}/reviews`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getBySpecialist: async (
    specialistId: string
  ): Promise<ApiResponse<any[]>> => {
    return apiCall(`/api/specialists/${specialistId}/reviews`);
  },
};

// =====================
// FAVORITES API
// =====================

export const favoritesApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall("/api/favorites");
  },

  add: async (proId: number): Promise<ApiResponse<{ id: number; pro_id: number; isFavorite: boolean }>> => {
    return apiCall("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ pro_id: proId }),
    });
  },

  remove: async (proId: number): Promise<ApiResponse<{ isFavorite: boolean }>> => {
    return apiCall(`/api/favorites/${proId}`, {
      method: "DELETE",
    });
  },

  check: async (proId: number): Promise<ApiResponse<{ isFavorite: boolean; favoriteId: number | null }>> => {
    return apiCall(`/api/favorites/check/${proId}`);
  },
};

// =====================
// NOTIFICATIONS API
// =====================

export const notificationsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall("/api/notifications");
  },

  markAsRead: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/notifications/${id}/read`, {
      method: "POST",
    });
  },

  getSettings: async (): Promise<ApiResponse<ClientNotificationSettings>> => {
    return apiCall("/api/client/notification-settings");
  },

  updateSettings: async (
    settings: Partial<ClientNotificationSettings>
  ): Promise<ApiResponse<ClientNotificationSettings>> => {
    return apiCall("/api/client/notification-settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },
};

// =====================
// PRO API
// =====================

export const proApi = {
  getDashboard: async (): Promise<ApiResponse<any>> => {
    return apiCall("/api/pro/dashboard");
  },

  getCalendar: async (params?: { from?: string; to?: string }) => {
    const query =
      params && (params.from || params.to)
        ? `?from=${encodeURIComponent(params.from || "")}&to=${encodeURIComponent(
            params.to || ""
          )}`
        : "";
    return apiCall<any[]>(`/api/pro/calendar${query}`);
  },

  getClients: () => apiCall<any[]>("/api/pro/clients"),

  updateClientNotes: (clientId: number, notes: string) =>
    apiCall(`/api/pro/clients/${clientId}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    }),

  getSubscription: () =>
    apiCall<{
      id: number;
      plan: "start" | "serenite" | "signature";
      billingType: "monthly" | "one_time";
      monthlyPrice: number;
      totalPrice: number | null;
      commitmentMonths: number | null;
      startDate: string;
      endDate: string | null;
      status: string;
    } | null>("/api/pro/subscription"),

  cancelSubscription: () =>
    apiCall("/api/pro/subscription/cancel", {
      method: "PUT",
    }),

  getSlots: (params: { date: string }) => {
    const query = `?date=${encodeURIComponent(params.date)}`;
    return apiCall<any[]>(`/api/pro/slots${query}`);
  },

  createSlot: (data: { date: string; time: string; duration: number }) =>
    apiCall("/api/pro/slots", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateSlot: (id: number, data: { status: string }) =>
    apiCall(`/api/pro/slots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteSlot: (id: number) =>
    apiCall(`/api/pro/slots/${id}`, {
      method: "DELETE",
    }),

  getNotificationSettings: async (): Promise<ApiResponse<ProNotificationSettings>> => {
    return apiCall("/api/pro/notification-settings");
  },

  updateNotificationSettings: async (
    settings: Partial<ProNotificationSettings>
  ): Promise<ApiResponse<ProNotificationSettings>> => {
    return apiCall("/api/pro/notification-settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },

  getServices: () => apiCall<any[]>("/api/pro/prestations"),

  createService: (data: {
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  active?: boolean;
}) =>
  apiCall("/api/pro/prestations", {
    method: "POST",
    body: JSON.stringify(data),
  }),

updateService: (id: number, data: Partial<{
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  active: boolean;
}>) =>
  apiCall(`/api/pro/prestations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }),

deleteService: (id: number) =>
  apiCall(`/api/pro/prestations/${id}`, {
    method: "DELETE",
  }),

duplicateService: (id: number) =>
  apiCall(`/api/pro/prestations/${id}/duplicate`, {
    method: "POST",
  }),

getFinanceStats: () => 
  apiCall<{
    today: number;
    week: number;
    month: number;
    lastMonth: number;
    objective: number;
    forecast: number;
    topServices: Array<{
      name: string;
      revenue: number;
      count: number;
      percentage: number;
    }>;
    trend: "up" | "down" | "stable";
  }>("/api/pro/finance/stats"),

  updateFinanceObjective: (objective: number) =>
  apiCall("/api/pro/finance/objective", {
    method: "PUT",
    body: JSON.stringify({ objective }),
  }),

exportFinanceData: async (period: "week" | "month" | "year"): Promise<ApiResponse<Blob>> => {
  try {
    const token = getAccessToken();
    
    const response = await fetch(
      `${API_BASE_URL}/api/pro/finance/export?period=${period}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (!refreshed) {
        return {
          success: false,
          error: "Session expirée, veuillez vous reconnecter",
        };
      }
      
      const newToken = getAccessToken();
      const retryResponse = await fetch(
        `${API_BASE_URL}/api/pro/finance/export?period=${period}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        }
      );
      
      if (!retryResponse.ok) {
        return {
          success: false,
          error: "Erreur lors de l'export",
        };
      }
      
      const blob = await retryResponse.blob();
      return {
        success: true,
        data: blob,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: "Erreur lors de l'export",
      };
    }

    const blob = await response.blob();
    return {
      success: true,
      data: blob,
    };
  } catch (error) {
    console.error("Export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur de connexion",
    };
  }
},

};

// =====================
// PAYMENTS API
// =====================

export const paymentsApi = {
  updateProPayments: async (data: {
    bankaccountname: string;
    IBAN: string;
    accept_online_payment: boolean;
  }): Promise<ApiResponse<PaymentsSettings>> => {
    return apiCall("/api/users/payments", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// =====================
// PAYMENT METHODS API
// =====================

export const paymentMethodsApi = {
  getAll: async (): Promise<ApiResponse<SavedCard[]>> => {
    return apiCall("/api/client/payment-methods");
  },

  create: async (data: {
    card_number: string;
    cardholder_name: string;
    exp_month: string;
    exp_year: string;
    cvc: string;
    set_default: boolean;
  }): Promise<ApiResponse<void>> => {
    return apiCall("/api/client/payment-methods", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  setDefault: async (id: number): Promise<ApiResponse<void>> => {
    return apiCall(`/api/client/payment-methods/${id}/default`, {
      method: "PUT",
    });
  },

  delete: async (id: number): Promise<ApiResponse<void>> => {
    return apiCall(`/api/client/payment-methods/${id}`, {
      method: "DELETE",
    });
  },
};

// =====================
// DEFAULT EXPORT
// =====================

export default {
  auth: authApi,
  bookings: bookingsApi,
  specialists: specialistsApi,
  reviews: reviewsApi,
  favorites: favoritesApi,
  notifications: notificationsApi,
  payments: paymentsApi,
  paymentMethods: paymentMethodsApi,
  pro: proApi,
};
