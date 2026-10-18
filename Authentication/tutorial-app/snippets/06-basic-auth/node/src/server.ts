import { createApp } from './app.ts';

// Basic sends the password with every request, readable by anyone on the path: serve it over HTTPS only.
// Plain HTTP is acceptable here only because nothing leaves your machine.
const { app } = await createApp();
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
