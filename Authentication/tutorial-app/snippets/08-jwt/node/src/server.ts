import { createApp } from './app.ts';

const { app } = await createApp(); // a fresh RS256 key every start: tokens from the last run stop verifying
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
