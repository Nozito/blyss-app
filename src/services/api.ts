const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export const API_URL = API_BASE_URL;

// =====================
// TYPES & INTERFACES
// =====================

export interface User {
  is_admin: boolean;
  totp_enabled?: boolean;
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
  last_login_at?: string | null;
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
  profile_photo?: string | null;
  banner_photo?: string | null;
  bio?: string | null;
  pro_specialties?: string[] | null;
  years_on_blyss?: number;
  bankaccountname?: string | null;
  IBAN?: string | null;
  accept_online_payment?: 0 | 1;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
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

function setSession(_accessToken: string, _refreshToken: string, _user?: User) {
  // Tokens are HttpOnly cookies — not accessible from JS.
  // User caching (safe fields only) is handled by AuthContext.
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
      requires_2fa?: boolean;
      challenge_token?: string;
    }>
  > => {
    const { response, json } = await rawApiCall<{
      user: User;
      accessToken: string;
      refreshToken: string;
      requires_2fa?: boolean;
      challenge_token?: string;
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

    // Compte admin avec 2FA activée : pas de user/tokens ici, juste un
    // challenge_token à transmettre tel quel — voir POST /2fa/verify.
    if (json.data?.requires_2fa) {
      return {
        success: true,
        data: { requires_2fa: true, challenge_token: json.data.challenge_token },
        message: json.message,
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
    } catch {
      // Ignore — session cleared locally regardless
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
// DEFAULT EXPORT
// =====================

export default {
  auth: authApi,
  favorites: favoritesApi,
  instagram: instagramApi,
  users: usersApi,
};
