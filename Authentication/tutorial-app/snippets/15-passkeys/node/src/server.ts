import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
// The RP ID is the site's domain; the origin is the exact scheme, host and port the browser shows.
// Browsers allow WebAuthn on http://localhost; everywhere else it needs HTTPS.
const { app } = createApp({ rpId: process.env.RP_ID ?? 'localhost', origin: process.env.ORIGIN ?? `http://localhost:${port}` });
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
