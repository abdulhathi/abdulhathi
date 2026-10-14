import { ConflictError } from '../errors.ts';
import type { UserRepository } from './repository.ts';
import type { User } from './user.ts';

export class InMemoryUserRepository implements UserRepository {
  readonly #users = new Map<string, User>();

  async findByEmail(email: string) {
    const user = [...this.#users.values()].find((u) => u.email === email.toLowerCase());
    return user && { ...user };
  }

  async get(id: string) {
    const user = this.#users.get(id);
    return user && { ...user };
  }

  async insert(user: User) {
    if (await this.findByEmail(user.email)) throw new ConflictError('An account with this email already exists');
    this.#users.set(user.id, { ...user });
  }
}
