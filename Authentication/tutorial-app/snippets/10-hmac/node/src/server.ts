import { createApp } from './app.ts';
import { newSecret } from './sender.ts';

// Active secrets, comma-separated, newest first: WEBHOOK_SECRETS=whsec_new,whsec_old while you rotate.
let secrets = (process.env.WEBHOOK_SECRETS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (secrets.length === 0) {
  secrets = [newSecret()];
  console.log(`No WEBHOOK_SECRETS set. This run uses: ${secrets[0]}`);
}
const { app } = createApp({ secrets });
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
