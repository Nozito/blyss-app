import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  authApi,
  User,
  LoginCredentials,
  SignupData,
  ApiResponse,
} from "@/services/api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    credentials: LoginCredentials
  ) => Promise<
    ApiResponse<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>
  >;
  signup: (
    data: SignupData
  ) => Promise<
    ApiResponse<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>
  >;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<ApiResponse<User>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("auth_token");
      let savedUser: User | null = null;

      try {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          savedUser = JSON.parse(storedUser) as User;
        }
      } catch {
        localStorage.removeItem("user");
      }

      if (!token) {
        setUser(savedUser);
        setIsLoading(false);
        return;
      }

      try {
        const response = await authApi.getProfile();
        if (response.success && response.data) {
          setUser(response.data);
          localStorage.setItem("user", JSON.stringify(response.data));
        } else {
          setUser(savedUser);
        }
      } catch {
        setUser(savedUser);
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem("user", JSON.stringify(user));
      } catch {
        // ignore
      }
    } else {
      localStorage.removeItem("user");
      localStorage.removeItem("auth_token");
    }
  }, [user]);

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
      console.log("login response =", response);

      if (response.success && response.data) {
        try {
          const { accessToken, refreshToken, user: respUser } = response.data;

          console.log("storing token =", accessToken, "user =", respUser);
          localStorage.setItem("auth_token", accessToken);
          localStorage.setItem("refresh_token", refreshToken);
          setUser(respUser);
        } catch (err) {
          console.error("Error storing token or setting user:", err);
        }
      } else {
        console.warn("login failed at API level:", response);
      }

      return response;
    } catch (err) {
      console.error("Login error (catch):", err);
      return { success: false, message: "Login failed" };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    data: SignupData
  ): Promise<
    ApiResponse<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>
  > => {
    setIsLoading(true);
    try {
      const response = await authApi.signup(data);

      if (response.success && response.data) {
        const { accessToken, refreshToken, user: respUser } = response.data;
        localStorage.setItem("auth_token", accessToken);
        localStorage.setItem("refresh_token", refreshToken);
        setUser(respUser);
      }

      return response;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
      setUser(null);
    }
  };

  const updateUser = async (
    data: Partial<User>
  ): Promise<ApiResponse<User>> => {
    if (!user) {
      return { success: false, message: "No authenticated user" };
    }

    const response = (await authApi.updateProfile(
      data
    )) as ApiResponse<User>;

    if (response.success && response.data) {
      setUser(response.data);
    }

    return response;
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    signup,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
