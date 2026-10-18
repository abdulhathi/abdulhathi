// The clients this authorization server knows. A real server keeps them in a database, registered by an admin.
export type Grant = 'authorization_code' | 'client_credentials';

export type Client = {
  id: string;
  /** SHA-256 of the client secret (hex). Public clients, which cannot keep a secret, have none. */
  secretHash?: string;
  /** Compared as exact strings: no prefixes, no wildcards. */
  redirectUris: string[];
  scopes: string[];
  grants: Grant[];
};

export const CLIENTS: Client[] = [
  // A single-page or mobile app acting for a user. It is public, so PKCE protects its codes instead of a secret.
  { id: 'photo-app', redirectUris: ['http://localhost:4000/callback'], scopes: ['photos.read'], grants: ['authorization_code'] },
  // A second public app. The tests use it to show that a code works only for the client it was issued to.
  { id: 'album-app', redirectUris: ['http://localhost:4002/callback'], scopes: ['photos.read'], grants: ['authorization_code'] },
  // A back-end job calling the API as itself. It is confidential: it proves who it is with a secret.
  // This is SHA-256 of the test secret "report-job-secret" that the tests and the curl session use.
  {
    id: 'report-job',
    secretHash: '5a6109c0796d5c2d3b378a951cd14803866a434eadf8964eda1d246a0091c35b',
    redirectUris: [],
    scopes: ['reports.read'],
    grants: ['client_credentials'],
  },
];
