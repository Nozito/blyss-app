import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import {
  authApi,
  User,
  LoginCredentials,
  SignupData,
  ApiResponse,
} from "@/services/api";

// ✅ Interface pour la réponse de signup simplifiée
interface SignupResponse {
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

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** @deprecated Tokens are now HttpOnly cookies — always null from JS */
  token: string | null;
  login: (
    credentials: LoginCredentials
  ) => Promise<
    ApiResponse<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>
  >;
  signup: (data: SignupData) => Promise<SignupResponse>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<ApiResponse<User>>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const USER_CACHE_KEY = "blyss_user";

// Champs non-sensibles stockés en localStorage pour l'affichage initial
const SAFE_FIELDS = ["id", "first_name", "last_name", "role", "is_admin", "profile_photo", "avg_rating", "clients_count"] as const;
const toSafeCache = (u: User) => Object.fromEntries(SAFE_FIELDS.filter(k => k in u).map(k => [k, (u as any)[k]])) as Partial<User>;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    // Use cached user info for initial render (avoids flash)
    try {
      const cached = localStorage.getItem(USER_CACHE_KEY);
      return cached ? (JSON.parse(cached) as User) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  // Prevents stale initAuth from overwriting a concurrent login()
  const _loginSucceeded = useRef(false);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        // Verify the HttpOnly cookie is still valid by calling /profile
        const response = await authApi.getProfile();
        // If login() completed during this async call, don't overwrite its result
        if (_loginSucceeded.current) return;
        if (response.success && response.data) {
          setUser(response.data);
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(toSafeCache(response.data)));
        } else {
          // Cookie expired or invalid
          setUser(null);
          localStorage.removeItem(USER_CACHE_KEY);
        }
      } catch {
        // Network error — keep cached user so UI renders
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (
    credentials: LoginCredentials
  ): Promise<
    ApiResponse<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>
  > => {
    setIsLoading(true);
    try {
      const response = await authApi.login(credentials);

      if (response.success && response.data) {
        // Tokens are set as HttpOnly cookies by the server
        const profile = await authApi.getProfile();
        if (profile.success && profile.data) {
          _loginSucceeded.current = true; // prevents stale initAuth from overwriting
          setUser(profile.data);
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(toSafeCache(profile.data)));
        }
      }

      return response;
    } catch {
      return { success: false, message: "Login failed" };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (data: SignupData): Promise<SignupResponse> => {
    setIsLoading(true);
    try {
      const response = await authApi.signup(data);

      if (response.success) {
        // Le backend pose les cookies d'auth — on fetch le profil pour populer le state
        const profile = await authApi.getProfile();
        if (profile.success && profile.data) {
          _loginSucceeded.current = true;
          setUser(profile.data);
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(toSafeCache(profile.data)));
        }
        return { success: true, message: response.message || "Account created successfully" };
      } else {
        return { success: false, message: response.message, error: response.error as any };
      }
    } catch {
      return { success: false, message: "Network error", error: "server_error" };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout(); // Server clears HttpOnly cookies
    } catch {
      // Ignore — cookies are cleared locally regardless
    } finally {
      localStorage.removeItem(USER_CACHE_KEY);
      setUser(null);
    }
  };

  const updateUser = async (
    data: Partial<User>
  ): Promise<ApiResponse<User>> => {
    if (!user) {
      return { success: false, message: "No authenticated user" };
    }

    const response = (await authApi.updateProfile(data)) as ApiResponse<User>;

    if (response.success && response.data) {
      setUser(response.data);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(toSafeCache(response.data)));
    }

    return response;
  };

  const refreshProfile = async (): Promise<void> => {
    try {
      const response = await authApi.getProfile();
      if (response.success && response.data) {
        setUser(response.data);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(toSafeCache(response.data)));
      }
    } catch {
      // silently ignore — caller can handle UI state
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    token: null, // Tokens are HttpOnly cookies — not accessible from JS
    login,
    signup,
    logout,
    updateUser,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
