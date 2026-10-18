import { createApp } from './app.ts';
import { USERS } from './documents.ts';
import { signToken } from './tokens.ts';

const { app, key } = createApp(); // a fresh random signing key every run
const port = Number(process.env.PORT ?? 3000);

// Sign-in is covered by earlier chapters. To try this API, print a token per demo user, made with this run's key.
const lines = ['Test tokens (valid for 1 hour). Paste these lines into your shell:'];
for (const [name, claims] of Object.entries(USERS)) lines.push(`export ${name.toUpperCase()}=${await signToken(key, claims)}`);
lines.push(`export ADA_READONLY=${await signToken(key, USERS.ada, 'documents:read')}`);

app.listen(port, () => console.log(`Listening on http://localhost:${port}\n${lines.join('\n')}`));
