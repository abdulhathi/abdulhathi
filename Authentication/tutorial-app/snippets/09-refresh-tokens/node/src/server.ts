import { createApp } from './app.ts';

// A fresh signing secret every start, and refresh tokens kept in memory: a restart signs everyone out.
const { app } = createApp();
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
