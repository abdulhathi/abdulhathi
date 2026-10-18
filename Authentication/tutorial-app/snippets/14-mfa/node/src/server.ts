import { randomBytes } from 'node:crypto';
import { createApp } from './app.ts';

// The key that encrypts TOTP secrets comes from configuration (in production, a key vault): 32 bytes, base64.
// Without one, a random key is made at start-up, so enrolments last only until the server stops.
const configured = process.env.MFA_ENCRYPTION_KEY;
if (!configured) console.warn('MFA_ENCRYPTION_KEY is not set: using a random key for this run only.');
const encryptionKey = configured ? Buffer.from(configured, 'base64') : randomBytes(32);

const { app } = await createApp({ encryptionKey });
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
