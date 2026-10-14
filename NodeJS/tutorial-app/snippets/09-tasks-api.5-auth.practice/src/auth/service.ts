import { randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../errors.ts';
import { createLogger, type Logger } from '../logger.ts';
import type { UserRepository } from '../users/repository.ts';
import {
  toPublicUser,
  type ChangePasswordInput,
  type LogInInput,
  type PublicUser,
  type SignUpInput,
  type User,
} from '../users/user.ts';
import { hashPassword, verifyPassword } from './password.ts';
import type { TokenService } from './tokens.ts';

export type Session = { user: PublicUser; token: string };

// Computed once, on first use: a real hash to check against when the email is unknown.
let dummyHash: Promise<string> | undefined;

export class AuthService {
  readonly #users: UserRepository;
  readonly #tokens: TokenService;
  readonly #log: Logger;

  constructor(users: UserRepository, tokens: TokenService, log: Logger = createLogger('silent')) {
    this.#users = users;
    this.#tokens = tokens;
    this.#log = log;
  }

  async signUp({ email, password }: SignUpInput): Promise<Session> {
    const user: User = { id: randomUUID(), email, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
    await this.#users.insert(user);
    this.#log.info({ userId: user.id }, 'user signed up');
    return { user: toPublicUser(user), token: await this.#tokens.sign(user.id) };
  }

  async logIn({ email, password }: LogInInput): Promise<Session> {
    const user = await this.#users.findByEmail(email);
    // Hash even when the email is unknown, so response times do not reveal which emails have accounts.
    const hash = user?.passwordHash ?? (await (dummyHash ??= hashPassword('not anybody’s password')));
    const valid = await verifyPassword(password, hash);
    // One message for both failures, for the same reason.
    if (!user || !valid) throw new UnauthorizedError('Email or password is incorrect');
    this.#log.info({ userId: user.id }, 'user logged in');
    return { user: toPublicUser(user), token: await this.#tokens.sign(user.id) };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.#users.get(userId);
    if (!user) throw new UnauthorizedError(); // the account was deleted after the token was issued
    return toPublicUser(user);
  }

  async changePassword(userId: string, { currentPassword, newPassword }: ChangePasswordInput): Promise<void> {
    const user = await this.#users.get(userId);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    await this.#users.updatePasswordHash(user.id, await hashPassword(newPassword));
    this.#log.info({ userId }, 'password changed');
  }
}
