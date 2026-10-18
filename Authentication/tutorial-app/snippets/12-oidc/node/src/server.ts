import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const { app } = await createApp({ baseUrl: process.env.BASE_URL ?? `http://localhost:${port}` });
app.listen(port, () => console.log(`Listening on http://localhost:${port} (identity provider at /idp)`));
