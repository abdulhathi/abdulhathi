import { readFileSync } from 'node:fs';
import { createApp } from './app.ts';
import { EXAMPLE_SETTINGS } from './saml.ts';

// The IdP's signing certificate, saved from its metadata (Entra ID calls it "Certificate (Base64)").
const certFile = process.env.IDP_CERT;
if (!certFile) {
  console.error('Set IDP_CERT to the path of the identity provider’s signing certificate (PEM).');
  process.exit(1);
}
const { app } = createApp({ settings: { ...EXAMPLE_SETTINGS, idpCert: readFileSync(certFile, 'utf8') } });
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
