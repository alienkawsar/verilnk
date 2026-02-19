import { z } from 'zod';
import {
    PASSWORD_POLICY_MESSAGE,
    PASSWORD_POLICY_REGEX,
} from '@/lib/passwordPolicy';

export const STRONG_PASSWORD_REGEX = PASSWORD_POLICY_REGEX;
export const STRONG_PASSWORD_MESSAGE = PASSWORD_POLICY_MESSAGE;

export const isStrongPassword = (password: string) => STRONG_PASSWORD_REGEX.test(password);

export const loginSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    country: z.string().optional(),
});

export type LoginForm = z.infer<typeof loginSchema>;
export type SignupForm = z.infer<typeof signupSchema>;
