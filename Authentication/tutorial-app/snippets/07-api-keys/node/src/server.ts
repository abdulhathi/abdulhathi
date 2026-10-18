import { createApp } from './app.ts';

const { app, store } = createApp();
// The first admin key, printed once so you can try the API. A real service creates it with a deployment script or
// a command-line tool and puts it straight into a secret store.
console.log(`Admin key (shown once): ${store.issue('admin', ['keys:manage']).key}`);
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
