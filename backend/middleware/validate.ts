import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

/**
 * Express middleware factory for Zod body validation.
 * Returns 400 with structured errors when validation fails.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: "validation_error",
        details: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ── Schemas ────────────────────────────────────────────────────────────────────

export const prestationSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100, "Nom trop long"),
  description: z.string().max(500, "Description trop longue").optional().default(""),
  price: z.number("Le prix doit être un nombre").positive("Le prix doit être positif"),
  duration_minutes: z
    .number("La durée doit être un nombre")
    .int("La durée doit être un entier")
    .positive("La durée doit être positive")
    .max(480, "Durée maximale : 8 heures"),
  active: z.boolean().optional().default(true),
});

export const slotCreateSchema = z
  .object({
    start_datetime: z.string().datetime("start_datetime doit être une date ISO valide"),
    end_datetime: z.string().datetime("end_datetime doit être une date ISO valide"),
    duration: z.number().int().positive().max(480).optional(),
  })
  .refine((d) => new Date(d.start_datetime) < new Date(d.end_datetime), {
    message: "start_datetime doit être antérieur à end_datetime",
    path: ["start_datetime"],
  });

export const userUpdateSchema = z.object({
  first_name: z.string().min(1, "Prénom trop court").max(50, "Prénom trop long").optional(),
  last_name: z.string().min(1, "Nom trop court").max(50, "Nom trop long").optional(),
  activity_name: z.string().max(100, "Nom d'activité trop long").optional(),
  city: z.string().max(100, "Ville trop longue").optional(),
  instagram_account: z.string().max(50, "Compte Instagram trop long").optional(),
  bio: z.string().max(500, "Biographie trop longue").optional(),
  acceptance_conditions: z.array(
    z.object({
      text: z.string().min(1, "Le texte est requis").max(150, "Maximum 150 caractères"),
      accepted: z.boolean(),
    })
  ).max(8, "Maximum 8 conditions").optional().nullable(),
  profile_visibility: z.enum(["public", "private"]).optional(),
  banner_photo: z.string().max(500).optional(),
  profile_photo: z.string().max(500).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères")
    .max(128, "Mot de passe trop long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      "Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre"
    )
    .optional(),
});

export const financeObjectiveSchema = z.object({
  objective: z
    .number("L'objectif doit être un nombre")
    .min(0, "L'objectif doit être positif ou nul")
    .max(1_000_000, "L'objectif ne peut pas dépasser 1 000 000"),
});

export const prestationPatchSchema = z.object({
  name: z.string().min(1, "Le nom ne peut pas être vide").max(100, "Nom trop long").optional(),
  description: z.string().max(500, "Description trop longue").optional(),
  price: z.number("Le prix doit être un nombre").positive("Le prix doit être positif").optional(),
  duration_minutes: z
    .number("La durée doit être un nombre")
    .int("La durée doit être un entier")
    .positive("La durée doit être positive")
    .max(480, "Durée maximale : 8 heures")
    .optional(),
  active: z.boolean().optional(),
});

export const reviewSchema = z.object({
  pro_id: z.number("pro_id doit être un nombre").int().positive(),
  rating: z
    .number("La note doit être un nombre")
    .int("La note doit être un entier")
    .min(1, "La note minimale est 1")
    .max(5, "La note maximale est 5"),
  comment: z.string().max(1000, "Commentaire trop long (max 1000 caractères)").nullable().optional(),
});

export const reservationSchema = z
  .object({
    pro_id: z.number("pro_id doit être un nombre").int().positive(),
    prestation_id: z.number("prestation_id doit être un nombre").int().positive(),
    start_datetime: z.string().datetime("start_datetime doit être une date ISO valide"),
    end_datetime: z.string().datetime("end_datetime doit être une date ISO valide"),
    price: z.number("Le prix doit être un nombre").positive("Le prix doit être positif"),
    slot_id: z.number().int().positive().optional(),
  })
  .refine((d) => new Date(d.start_datetime) < new Date(d.end_datetime), {
    message: "start_datetime doit être antérieur à end_datetime",
    path: ["start_datetime"],
  });

export const depositSchema = z.object({
  deposit_percentage: z.union(
    [z.literal(0), z.literal(30), z.literal(50), z.literal(100)],
    { message: "Pourcentage invalide — valeurs autorisées : 0, 30, 50, 100" }
  ),
});

export const paymentIntentSchema = z.object({
  reservation_id: z.number("reservation_id doit être un nombre").int().positive(),
  type: z.enum(["deposit", "balance", "full"], {
    message: "type doit être 'deposit', 'balance' ou 'full'",
  }),
});

export const favoriteSchema = z.object({
  pro_id: z.number("pro_id doit être un nombre").int().positive(),
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const unavailabilitySchema = z
  .object({
    start_date: z
      .string()
      .regex(ISO_DATE_RE, "start_date doit être au format YYYY-MM-DD"),
    end_date: z
      .string()
      .regex(ISO_DATE_RE, "end_date doit être au format YYYY-MM-DD"),
    reason: z
      .string()
      .max(200, "Motif trop long (max 200 caractères)")
      .optional()
      .nullable(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: "end_date doit être >= start_date",
    path: ["end_date"],
  })
  .refine(
    (d) => {
      const maxFuture = new Date();
      maxFuture.setFullYear(maxFuture.getFullYear() + 2);
      return new Date(d.start_date) <= maxFuture;
    },
    { message: "La date ne peut pas dépasser 2 ans dans le futur", path: ["start_date"] }
  );

export const reservationStatusSchema = z.object({
  status: z.enum(["completed", "cancelled"], {
    message: "status doit être 'completed' ou 'cancelled'",
  }),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email invalide").max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token requis").max(256),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères")
    .max(128, "Mot de passe trop long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      "Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre"
    ),
});
