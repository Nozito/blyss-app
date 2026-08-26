export type ReasonCode =
  | "injures_menaces"
  | "arnaque_paiement"
  | "contournement_plateforme"
  | "contenu_inapproprie"
  | "autre";

export const REASON_LABELS: Record<ReasonCode, string> = {
  injures_menaces: "Injures ou menaces",
  arnaque_paiement: "Arnaque / paiement",
  contournement_plateforme: "Contournement de la plateforme",
  contenu_inapproprie: "Contenu inapproprié",
  autre: "Autre",
};

export interface FlaggedReview {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
  author_name: string;
  pro_name: string;
  flags_count: number;
}

export interface FlaggedThread {
  id: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  is_locked: boolean;
  client_name: string;
  pro_name: string;
  flags_count: number;
  flags_total: number;
  last_reason_code: ReasonCode | null;
  last_reason: string | null;
}

export interface ThreadMessage {
  id: number;
  sender_id: number | null;
  body: string | null;
  attachment_url: string | null;
  created_at: string;
  deleted_at: string | null;
  sender_role: "client" | "pro" | null;
}

export type FlagOutcome = "upheld" | "dismissed" | "abusive";

export interface ThreadFlag {
  id: number;
  reason_code: ReasonCode;
  reason: string | null;
  status: "pending" | "reviewed";
  outcome: FlagOutcome | null;
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
  flagged_by_name: string;
  reported_user_name: string;
}

export interface ThreadDetail {
  messages: ThreadMessage[];
  flags: ThreadFlag[];
}
