import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: { id: number };
  file?: Express.Multer.File;
}

export type AuthRequest = AuthenticatedRequest;

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  birth_date: string | null;
  password_hash: string;
  role: string;
  activity_name: string | null;
  city: string | null;
  instagram_account: string | null;
  profile_photo: string | null;
  pro_status?: "active" | "inactive" | null;
  IBAN?: string | null;
  bankaccountname?: string | null;
  bio?: string | null;
  acceptance_conditions?: Array<{ text: string; accepted: boolean }> | null;
  is_admin?: boolean;
  is_active?: boolean;
}

export interface SignupRequestBody {
  first_name?: string;
  last_name?: string;
  email: string;
  password: string;
  phone_number?: string;
  birth_date?: string;
  role?: string;
  activity_name?: string | null;
  city?: string | null;
  instagram_account?: string | null;
}

export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface UpdatePaymentsBody {
  bankaccountname?: string;
  IBAN?: string;
  accept_online_payment?: boolean;
}

export interface CreateSubscriptionBody {
  plan: "start" | "serenite" | "signature";
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice?: number | null;
  commitmentMonths?: number | null;
  startDate: string;
  endDate?: string | null;
}
