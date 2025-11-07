/**
 * Auth Validation Schemas
 *
 * Zod schemas for validating authentication inputs
 */

import { z } from 'zod'

// RFC validation regex for Mexican tax IDs
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/

// Password validation: min 8 chars, uppercase, lowercase, number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

export const signupSchema = z.object({
  // User info
  email: z
    .string()
    .email('Please enter a valid email address')
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(
      PASSWORD_REGEX,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),

  confirmPassword: z.string(),

  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255, 'Full name must be less than 255 characters')
    .trim(),

  // Organization info
  organizationName: z
    .string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(255, 'Organization name must be less than 255 characters')
    .trim(),

  organizationRfc: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (val) => val.length === 12 || val.length === 13,
      'RFC must be 12 characters (individuals) or 13 characters (organizations)'
    )
    .refine(
      (val) => RFC_REGEX.test(val),
      'RFC format is invalid (e.g., ABC123456XYZ)'
    ),

  legalName: z
    .string()
    .min(2, 'Legal name must be at least 2 characters')
    .max(255, 'Legal name must be less than 255 characters')
    .trim(),

  taxRegime: z
    .string()
    .min(3, 'Please select a tax regime')
    .max(10, 'Tax regime code is invalid'),

  acceptTerms: z
    .boolean()
    .refine((val) => val === true, 'You must accept the terms and conditions'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const loginSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),

  password: z.string().min(1, 'Password is required'),

  rememberMe: z.boolean().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
})

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password must be less than 100 characters')
      .regex(
        PASSWORD_REGEX,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),

    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
})

// Type exports
export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
