const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface User {
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
  role?: "client" | "pro";
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

// --- Helpers stockage tokens ---

const ACCESS_TOKEN_KEY = "access_token";
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

// --- Appel brut sans refresh automatique ---

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

// --- Refresh token ---

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

// --- apiCall avec gestion 401 + refresh ---

async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = getAccessToken();

    // 1er essai
    let { response, json } = await rawApiCall<T>(endpoint, options, token);

    // Si 401, essayer de refresh
    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const newToken = getAccessToken();
        ({ response, json } = await rawApiCall<T>(
          endpoint,
          options,
          newToken
        ));
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

// --- Auth ---

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

  signup: async (
    data: SignupData
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
    }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
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

  logout: async (): Promise<ApiResponse<void>> => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await rawApiCall("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    }
    clearSession();
    return { success: true };
  },

  getProfile: async (): Promise<ApiResponse<User>> => {
    const res = await apiCall<User>("/api/users");
    console.log("[authApi.getProfile] response =", res);
    return res;
  },

  updateProfile: (data: Partial<User>) =>
    apiCall<User>("/api/users/update", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// --- Bookings ---

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

// --- Specialists ---

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
};

// --- Reviews ---

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

// --- Favorites ---

export const favoritesApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall("/api/favorites");
  },

  add: async (specialistId: string): Promise<ApiResponse<void>> => {
    return apiCall("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ specialistId }),
    });
  },

  remove: async (specialistId: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/favorites/${specialistId}`, {
      method: "DELETE",
    });
  },
};

// --- Notifications ---

export const notificationsApi = {
  getAll: async (): Promise<ApiResponse<any[]>> => {
    return apiCall("/api/notifications");
  },

  markAsRead: async (id: string): Promise<ApiResponse<void>> => {
    return apiCall(`/api/notifications/${id}/read`, {
      method: "POST",
    });
  },
};

// --- Pro ---

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
};

// --- Payments ---

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
    return apiCall("/api/users/payments", {
      method: "PUT",
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
