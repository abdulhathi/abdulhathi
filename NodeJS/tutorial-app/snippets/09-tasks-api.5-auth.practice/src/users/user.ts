import { z } from 'zod';

export type User = {
  id: string;
  email: string; // stored lower-case
  passwordHash: string;
  createdAt: string;
};

/** What the API may show about a user. The hash never leaves the server. */
export type PublicUser = Omit<User, 'passwordHash'>;

export const toPublicUser = ({ passwordHash: _hidden, ...user }: User): PublicUser => user;

const email = z.string().trim().toLowerCase().pipe(z.email());

export const SignUpInput = z.strictObject({
  email,
  // Length beats complexity rules. The upper limit caps the hashing work an attacker can request.
  password: z.string().min(12, 'Use at least 12 characters').max(128),
});
export type SignUpInput = z.infer<typeof SignUpInput>;

// Login does not re-check the sign-up policy: a policy change must not lock existing users out.
export const LogInInput = z.strictObject({ email, password: z.string().min(1).max(128) });
export type LogInInput = z.infer<typeof LogInInput>;

export const ChangePasswordInput = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12, 'Use at least 12 characters').max(128),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;
