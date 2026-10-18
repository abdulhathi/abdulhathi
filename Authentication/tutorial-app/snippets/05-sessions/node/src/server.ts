import { createApp } from './app.ts';

// express-session sends a Secure cookie only when it knows the request arrived over HTTPS. Behind a proxy or load
// balancer that terminates TLS, pass trustProxy (for example 1, for one hop) so Express believes its
// X-Forwarded-Proto header. For plain-HTTP development on your own machine, start with COOKIE_SECURE=false.
const { app } = await createApp({
  secure: process.env.COOKIE_SECURE !== 'false',
  secret: process.env.SESSION_SECRET,
});
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
