import type { ComponentType } from 'react';
import { Welcome } from './welcome';
import { Methods } from './methods';
import { Setup } from './setup';
import { Passwords } from './passwords';
import { Sessions } from './sessions';
import { BasicAuth } from './basic-auth';
import { ApiKeys } from './api-keys';
import { Jwt } from './jwt';
import { RefreshTokens } from './refresh-tokens';
import { Hmac } from './hmac';
import { OAuth2 } from './oauth2';
import { Oidc } from './oidc';
import { Saml } from './saml';
import { Mfa } from './mfa';
import { Passkeys } from './passkeys';
import { MagicLinks } from './magic-links';
import { Mtls } from './mtls';
import { Authorization } from './authorization';
import { Checklist } from './checklist';
import { Interview } from './interview';
import { CheatSheet } from './cheat-sheet';

export type Group = 'Start here' | 'Passwords and sessions' | 'Keys and tokens' | 'Single sign-on' | 'Stronger and passwordless' | 'After sign-in' | 'Reference';

export type Chapter = {
  id: string; // also the URL: #/<id>, and the file name in this folder
  num: string;
  group: Group;
  title: string;
  goal: string;
  topic?: string; // the snippets folder (snippets/<topic>/{node,python,dotnet}) and practice folder (projects/<topic>)
  trackable: boolean; // counts toward progress
  Body: ComponentType;
};

export const CHAPTERS: Chapter[] = [
  { id: 'welcome', num: '01', group: 'Start here', title: 'How this lab works', trackable: true, Body: Welcome,
    goal: 'What you will build, how the three stacks are shown side by side, and how to study each method so it sticks.' },
  { id: 'methods', num: '02', group: 'Start here', title: 'Every way to authenticate, at a glance', trackable: true, Body: Methods,
    goal: 'The full list of authentication methods: how each works, when to use it, its risks, and the library for it in Node.js, Python and .NET.' },
  { id: 'setup', num: '03', group: 'Start here', title: 'Set up Node.js, Python and .NET', trackable: true, Body: Setup,
    goal: 'Install the three toolchains, run each stack\'s tests, and call an API with curl.' },
  { id: 'passwords', num: '04', group: 'Passwords and sessions', title: 'Passwords: hashing, sign-in and lockout', topic: '04-passwords', trackable: true, Body: Passwords,
    goal: 'Store passwords so a leaked database is useless, check them in constant time, upgrade old hashes, and slow down guessing.' },
  { id: 'sessions', num: '05', group: 'Passwords and sessions', title: 'Cookie sessions and CSRF', topic: '05-sessions', trackable: true, Body: Sessions,
    goal: 'Server-side sessions in a secure cookie: flags, fixation, sign-out, and stopping cross-site request forgery.' },
  { id: 'basic-auth', num: '06', group: 'Passwords and sessions', title: 'HTTP Basic authentication', topic: '06-basic-auth', trackable: true, Body: BasicAuth,
    goal: 'The simplest scheme on the web, why it needs TLS, and where it is still the right choice.' },
  { id: 'api-keys', num: '07', group: 'Keys and tokens', title: 'API keys', topic: '07-api-keys', trackable: true, Body: ApiKeys,
    goal: 'Issue, store, check, scope and rotate API keys for machine clients.' },
  { id: 'jwt', num: '08', group: 'Keys and tokens', title: 'JSON Web Tokens', topic: '08-jwt', trackable: true, Body: Jwt,
    goal: 'Sign and verify JWTs with HS256 and RS256, validate every claim, rotate keys with JWKS, and avoid the classic mistakes.' },
  { id: 'refresh-tokens', num: '09', group: 'Keys and tokens', title: 'Refresh tokens and sign-out', topic: '09-refresh-tokens', trackable: true, Body: RefreshTokens,
    goal: 'Short access tokens, rotating refresh tokens with reuse detection, revocation, and where a browser should keep them.' },
  { id: 'hmac', num: '10', group: 'Keys and tokens', title: 'Signed requests and webhooks (HMAC)', topic: '10-hmac', trackable: true, Body: Hmac,
    goal: 'Prove a request came from someone holding a shared secret, and stop replays, as webhook senders and receivers do.' },
  { id: 'oauth2', num: '11', group: 'Single sign-on', title: 'OAuth 2.0: authorization code with PKCE, and client credentials', topic: '11-oauth2', trackable: true, Body: OAuth2,
    goal: 'Delegated access the standard way: the code flow with PKCE for apps that act for a user, and client credentials for services.' },
  { id: 'oidc', num: '12', group: 'Single sign-on', title: 'OpenID Connect: sign in with an identity provider', topic: '12-oidc', trackable: true, Body: Oidc,
    goal: 'Sign users in with Microsoft Entra ID, Google, Okta or Keycloak: discovery, the ID token, nonce, and validating it properly.' },
  { id: 'saml', num: '13', group: 'Single sign-on', title: 'SAML 2.0 single sign-on', topic: '13-saml', trackable: true, Body: Saml,
    goal: 'Enterprise SSO with SAML: the browser flow, signed assertions, and everything a service provider must check.' },
  { id: 'mfa', num: '14', group: 'Stronger and passwordless', title: 'Multi-factor: TOTP codes and recovery codes', topic: '14-mfa', trackable: true, Body: Mfa,
    goal: 'Add a second factor with authenticator-app codes (TOTP), enrolment by QR code, and single-use recovery codes.' },
  { id: 'passkeys', num: '15', group: 'Stronger and passwordless', title: 'Passkeys (WebAuthn)', topic: '15-passkeys', trackable: true, Body: Passkeys,
    goal: 'Phishing-resistant sign-in with passkeys: the registration and authentication ceremonies, and what the server verifies.' },
  { id: 'magic-links', num: '16', group: 'Stronger and passwordless', title: 'Magic links and one-time codes', topic: '16-magic-links', trackable: true, Body: MagicLinks,
    goal: 'Passwordless sign-in by email: single-use, short-lived tokens and codes, stored safely and rate-limited.' },
  { id: 'mtls', num: '17', group: 'Stronger and passwordless', title: 'Mutual TLS client certificates', topic: '17-mtls', trackable: true, Body: Mtls,
    goal: 'Authenticate machines with client certificates: make a small CA, require a certificate, and map it to a client.' },
  { id: 'authorization', num: '18', group: 'After sign-in', title: 'Authorization: roles, scopes, policies and ownership', topic: '18-authorization', trackable: true, Body: Authorization,
    goal: 'Decide what a signed-in user may do: roles, scopes, policy-based rules, and checking ownership on every object.' },
  { id: 'checklist', num: '19', group: 'Reference', title: 'Security checklist and common attacks', trackable: true, Body: Checklist,
    goal: 'The attacks every sign-in system faces, and the checklist that stops them.' },
  { id: 'interview', num: '20', group: 'Reference', title: 'Interview questions', trackable: true, Body: Interview,
    goal: 'The authentication questions interviewers ask, with answers you can say out loud.' },
  { id: 'cheat-sheet', num: '21', group: 'Reference', title: 'Cheat sheet: every method in three stacks', trackable: true, Body: CheatSheet,
    goal: 'One page per method: the library, the key call and the check you must not forget, in Node.js, Python and .NET.' },
];

export const TRACKED = CHAPTERS.filter((c) => c.trackable);
export const findChapter = (id: string) => CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
