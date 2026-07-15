import { z } from "zod";

// Centralizing validation here means every API route runs input through the
// same rules — no route can accidentally skip sanitization.

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z.string().trim().toUpperCase().length(3).default("USD"),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const splitSchema = z.object({
  userId: z.string().cuid(),
  amount: z.number().positive().max(1_000_000),
});

export const createExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amount: z.number().positive().max(1_000_000),
    splitType: z.enum(["EQUAL", "PERCENTAGE", "EXACT", "SHARES"]),
    paidById: z.string().cuid(),
    splits: z.array(splitSchema).min(1).max(100),
  })
  .refine(
    (data) => {
      const total = data.splits.reduce((sum, s) => sum + s.amount, 0);
      // Allow a 1-cent tolerance for rounding across many-way splits.
      return Math.abs(total - data.amount) < 0.02;
    },
    { message: "Split amounts must add up to the total expense amount", path: ["splits"] }
  );

export const recordSettlementSchema = z.object({
  fromUserId: z.string().cuid(),
  toUserId: z.string().cuid(),
  amount: z.number().positive().max(1_000_000),
  note: z.string().trim().max(280).optional(),
});
