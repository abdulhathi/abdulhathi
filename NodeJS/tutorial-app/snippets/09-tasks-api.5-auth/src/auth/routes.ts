import { type RequestHandler, Router } from 'express';
import { LogInInput, SignUpInput } from '../users/user.ts';
import { requireAuth, userIdOf } from './middleware.ts';
import type { AuthService } from './service.ts';
import type { TokenService } from './tokens.ts';

export function authRouter(auth: AuthService, tokens: TokenService, loginLimiter: RequestHandler): Router {
  const router = Router();

  router.post('/signup', async (req, res) => {
    const input = SignUpInput.parse(req.body);
    res.status(201).json(await auth.signUp(input));
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const input = LogInInput.parse(req.body);
    res.json(await auth.logIn(input));
  });

  router.get('/me', requireAuth(tokens), async (_req, res) => {
    res.json(await auth.me(userIdOf(res)));
  });

  return router;
}
