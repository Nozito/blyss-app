const API_BASE_URL = import.meta.env.VITE_API_URL || "";

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
// Tokens are stored in HttpOnly cookies (managed by the browser/server).
// Only the user profile is kept in localStorage for display purposes.

const USER_KEY = "user";

function setSession(_accessToken: string, _refreshToken: string, user?: User) {
  // Tokens are set as HttpOnly cookies by the server — not stored in JS
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

function clearSession() {
  localStorage.removeItem(USER_KEY);
}

// =====================
// HTTP UTILITIES
// =====================

async function rawApiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ response: Response; json: any }> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include", // sends HttpOnly auth cookies automatically
  });

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { response, json };
}

// Mutex: at most one refresh in flight across all concurrent requests
let _refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      // The refresh_token cookie is sent automatically by the browser
      const { response } = await rawApiCall("/api/auth/refresh", { method: "POST" });
      if (!response.ok) {
        clearSession();
        return false;
      }
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
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
    let { response, json } = await rawApiCall<T>(endpoint, options);

    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // Retry with the rotated cookie (automatically included by the browser)
        ({ response, json } = await rawApiCall<T>(endpoint, options));
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
        credentials: "include",
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
      // The refresh_token cookie is sent automatically; server clears both cookies
      await rawApiCall("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout API error:", error);
    } finally {
      clearSession();
    }
  },

  deleteAccount: async (): Promise<ApiResponse<void>> => {
    return apiCall("/api/auth/delete-account", { method: "DELETE" });
  },

  exportData: async (): Promise<void> => {
    const response = await fetch(`${API_URL}/api/auth/export-data`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Export échoué");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mes-donnees-blyss.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  /** Liste publique des pros (endpoint réel du backend) */
  getPros: async (params?: { page?: number; limit?: number }): Promise<ApiResponse<any[]>> => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString() ? `?${q}` : "";
    return apiCall(`/api/users/pros${qs}`);
  },

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

  createSubscription: (data: {
    plan: "start" | "serenite" | "signature";
    billingType: "monthly" | "one_time";
    monthlyPrice: number;
    totalPrice?: number | null;
    commitmentMonths?: number | null;
  }) =>
    apiCall("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

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

  updateReservationStatus: (id: number, status: "completed" | "cancelled") =>
    apiCall(`/api/pro/reservations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getUnavailabilities: (params?: { from?: string; to?: string }) => {
    const q = params ? `?from=${params.from || ""}&to=${params.to || ""}` : "";
    return apiCall<any[]>(`/api/pro/unavailabilities${q}`);
  },

  createUnavailability: (data: { start_date: string; end_date: string; reason?: string }) =>
    apiCall("/api/pro/unavailabilities", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteUnavailability: (id: number) =>
    apiCall(`/api/pro/unavailabilities/${id}`, { method: "DELETE" }),

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
    const fetchExport = () =>
      fetch(`${API_BASE_URL}/api/pro/finance/export?period=${period}`, {
        method: "GET",
        credentials: "include",
      });

    let response = await fetchExport();

    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (!refreshed) {
        return {
          success: false,
          error: "Session expirée, veuillez vous reconnecter",
        };
      }
      response = await fetchExport();

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
// STRIPE CONNECT API (Pro)
// =====================

export const stripeApi = {
  onboard: async (): Promise<ApiResponse<{ url: string }>> => {
    return apiCall("/api/pro/stripe/onboard", {
      method: "POST",
    });
  },

  checkOnboardReturn: async (): Promise<ApiResponse<{
    onboarding_complete: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
  }>> => {
    return apiCall("/api/pro/stripe/onboard/return");
  },

  getAccount: async (): Promise<ApiResponse<{
    has_account: boolean;
    onboarding_complete: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    deposit_percentage: number;
  }>> => {
    return apiCall("/api/pro/stripe/account");
  },

  updateDeposit: async (deposit_percentage: number): Promise<ApiResponse<{ deposit_percentage: number }>> => {
    return apiCall("/api/pro/stripe/deposit", {
      method: "PUT",
      body: JSON.stringify({ deposit_percentage }),
    });
  },
};

// =====================
// STRIPE PAYMENTS API (Client)
// =====================

export const stripePaymentsApi = {
  createPaymentIntent: async (data: {
    reservation_id: number;
    type: "deposit" | "balance" | "full";
  }): Promise<ApiResponse<{
    client_secret: string;
    payment_intent_id: string;
    amount: number;
  }>> => {
    return apiCall("/api/payments/create-intent", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  createReservation: async (data: {
    pro_id: number;
    prestation_id: number;
    start_datetime: string;
    end_datetime: string;
    price: number;
    slot_id?: number | null;
  }): Promise<ApiResponse<{
    id: number;
    deposit_percentage: number;
    deposit_amount: number | null;
    price: number;
  }>> => {
    return apiCall("/api/reservations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getPaymentStatus: async (reservationId: number): Promise<ApiResponse<{
    payment_status: string;
    price: number;
    total_paid: number;
    deposit_amount: number | null;
    remaining: number;
  }>> => {
    return apiCall(`/api/reservations/${reservationId}/payment-status`);
  },

  markPaidOnSite: async (reservationId: number): Promise<ApiResponse<void>> => {
    return apiCall(`/api/reservations/${reservationId}/pay-on-site`, {
      method: "PUT",
    });
  },
};

// =====================
// INSTAGRAM API
// =====================

export interface InstagramPhoto {
  media_id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  thumbnail_url: string | null;
  permalink: string;
  caption: string | null;
  ig_timestamp: string;
  display_order: number;
}

export interface InstagramStatus {
  connected: boolean;
  username?: string;
  expiresAt?: string;
}

export interface InstagramPublicData {
  photos: InstagramPhoto[];
  connected: boolean;
  username?: string;
}

export const instagramApi = {
  /** Récupère l'URL OAuth Instagram pour le Pro connecté (Signature requis). */
  getConnectUrl: async (): Promise<ApiResponse<{ authUrl: string }>> => {
    return apiCall("/api/instagram/connect");
  },

  /** Statut de la connexion Instagram du Pro connecté. */
  getStatus: async (): Promise<ApiResponse<InstagramStatus>> => {
    return apiCall("/api/instagram/status");
  },

  /** Déconnecte Instagram pour le Pro connecté. */
  disconnect: async (): Promise<ApiResponse<void>> => {
    return apiCall("/api/instagram/disconnect", { method: "DELETE" });
  },

  /** Déclenche une sync manuelle des photos (throttle 5min). */
  sync: async (): Promise<ApiResponse<boolean>> => {
    return apiCall("/api/instagram/sync", { method: "POST" });
  },

  /** Récupère les photos Instagram publiques d'un Pro (sans auth). */
  getPublicPhotos: async (proId: number): Promise<ApiResponse<InstagramPublicData>> => {
    const BASE_URL = import.meta.env.VITE_API_URL || "";
    const res = await fetch(`${BASE_URL}/api/public/pro/${proId}/instagram`);
    return res.json();
  },
};

// =====================
// USERS API
// =====================

export const usersApi = {
  getMe: (): Promise<ApiResponse<User>> => apiCall("/api/users"),
  update: (data: Record<string, any>): Promise<ApiResponse<User>> =>
    apiCall("/api/users/update", { method: "PUT", body: JSON.stringify(data) }),
};

// =====================
// CLIENT API
// =====================

export const clientApi = {
  getMyBookings: (): Promise<ApiResponse<any[]>> =>
    apiCall("/api/client/my-booking"),
  getBookingDetail: (id: number): Promise<ApiResponse<any>> =>
    apiCall(`/api/client/booking-detail/${id}`),
  cancelBooking: (id: number): Promise<ApiResponse<void>> =>
    apiCall(`/api/client/my-booking/${id}/cancel`, { method: "PATCH" }),
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
  stripe: stripeApi,
  stripePayments: stripePaymentsApi,
  instagram: instagramApi,
  users: usersApi,
  client: clientApi,
};
