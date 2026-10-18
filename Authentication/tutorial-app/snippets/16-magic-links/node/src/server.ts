import { createApp } from './app.ts';
import { Outbox } from './outbox.ts';

const port = Number(process.env.PORT ?? 3000);
// Links in emails start with BASE_URL: the public address of the site, set in configuration.
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
// Emails are printed here instead of being sent.
const outbox = new Outbox((email) => console.log(`\n--- Email to ${email.to}: ${email.subject}\n${email.text}\n---`));

const { app } = createApp({ users: ['ada@example.com'], outbox, baseUrl });
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
