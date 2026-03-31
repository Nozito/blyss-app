/**
 * Canonical frontend User type.
 * Only non-sensitive fields are stored in localStorage cache (see AuthContext.tsx).
 * Tokens are NEVER stored client-side — they live in HttpOnly cookies only.
 */
export interface User {
  id: number;
  first_name: string;
  last_name: string;
  role: "pro" | "client";
  /**
   * UX guard only — authoritative check is always server-side (requireAdminMiddleware).
   * Never use this alone to protect server resources.
   */
  is_admin?: boolean;
  profile_photo?: string | null;
  avg_rating?: number | null;
  clients_count?: number | null;
  // Pro-specific (populated after profile fetch)
  activity_name?: string | null;
  city?: string | null;
  pro_status?: "active" | "inactive" | null;
  bio?: string | null;
  instagram_account?: string | null;
  banner_photo?: string | null;
  phone_number?: string | null;
  birth_date?: string | null;
  is_active?: boolean;
}
