import { errors, jwtVerify, SignJWT } from 'jose';
import { UnauthorizedError } from '../errors.ts';

const ISSUER = 'tasks-api';

/** Signs and checks JSON Web Tokens with a shared secret (HMAC-SHA256). */
export class TokenService {
  readonly #key: Uint8Array;
  readonly #ttl: string;

  constructor(secret: string, ttl = '1h') {
    this.#key = new TextEncoder().encode(secret);
    this.#ttl = ttl;
  }

  sign(userId: string): Promise<string> {
    return new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(this.#ttl)
      .sign(this.#key);
  }

  /** Returns the user id, or throws UnauthorizedError for any bad, tampered or expired token. */
  async verify(token: string): Promise<string> {
    try {
      // Pin the algorithm: never let the token itself choose how it is checked.
      const { payload } = await jwtVerify(token, this.#key, { issuer: ISSUER, algorithms: ['HS256'] });
      if (!payload.sub) throw new UnauthorizedError('Invalid token');
      return payload.sub;
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw new UnauthorizedError('Token expired');
      if (error instanceof errors.JOSEError) throw new UnauthorizedError('Invalid token');
      throw error;
    }
  }
}
