export function Hero() {
  return (
    <header className="hero">
      <p className="kicker">Hands-on lab · Node.js · Python · .NET</p>
      <h1>Every way to sign users in, built three times</h1>
      <p className="lede">
        Passwords, sessions, API keys, JWTs, refresh tokens, signed webhooks, OAuth 2.0, OpenID Connect, SAML, TOTP,
        passkeys, magic links and client certificates. Each chapter explains one method, shows a tested implementation in
        Express, FastAPI and ASP.NET Core side by side, and ends with practice you build yourself.
      </p>
      <dl className="facts">
        <div><dt>Tested with</dt><dd>Node 25 · Python 3.14 · .NET 9 (ASP.NET Core)</dd></div>
        <div><dt>You need</dt><dd>A terminal, VS Code, and one of the three stacks</dd></div>
        <div><dt>Time</dt><dd>About 25–35 hours in one stack; more to compare all three</dd></div>
        <div><dt>You finish with</dt><dd>A working sign-in system for every method, in your stack of choice</dd></div>
      </dl>
    </header>
  );
}
