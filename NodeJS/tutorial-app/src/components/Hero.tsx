export function Hero() {
  return (
    <header className="hero">
      <p className="kicker">Hands-on course · TypeScript · Node.js 24 LTS</p>
      <h1>Learn Node.js, from first script to production</h1>
      <p className="lede">
        Twenty chapters, eleven practice projects. Each chapter explains one part of Node.js in depth, then has you build
        it yourself: a CLI, a log analyzer that streams millions of lines, an HTTP server with no framework, and a REST API that
        grows a database, tests, logging, authentication, PostgreSQL and a production setup.
      </p>
      <dl className="facts">
        <div><dt>Tested with</dt><dd>Node 24.21 LTS · TypeScript 7.0 · Express 5.3</dd></div>
        <div><dt>You need</dt><dd>A terminal, VS Code, and some JavaScript or TypeScript</dd></div>
        <div><dt>Time</dt><dd>About 35–45 hours of chapters, plus the capstone</dd></div>
        <div><dt>You finish with</dt><dd>11 projects and a capstone service for GitHub</dd></div>
      </dl>
    </header>
  );
}
