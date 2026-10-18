import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const { app } = await createApp({ issuer: process.env.ISSUER ?? `http://localhost:${port}` });
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
