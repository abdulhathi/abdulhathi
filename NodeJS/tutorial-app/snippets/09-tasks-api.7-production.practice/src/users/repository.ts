import type { User } from './user.ts';

/** Where accounts are stored. insert throws ConflictError if the email is taken. */
export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  get(id: string): Promise<User | undefined>;
  insert(user: User): Promise<void>;
}
