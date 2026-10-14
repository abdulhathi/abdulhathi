export function Hero() {
  return (
    <header className="hero">
      <p className="kicker">Hands-on tutorial · TypeScript · RabbitMQ 4</p>
      <h1>Learn RabbitMQ by building ShopFlow</h1>
      <p className="lede">
        You will build a small order pipeline for an online shop, one RabbitMQ concept at a time. Each chapter adds a few
        files, gives you the commands to run, and tells you what to look for in the terminal and in the management UI.
      </p>
      <dl className="facts">
        <div><dt>Tested with</dt><dd>RabbitMQ 4.2 · amqplib 2.2 · Node 25</dd></div>
        <div><dt>You need</dt><dd>Docker, Node 18 or newer, basic TypeScript</dd></div>
        <div><dt>Time</dt><dd>About 6–8 hours across 15 chapters</dd></div>
        <div><dt>You finish with</dt><dd>A pinnable repo: <code>rabbitmq-shopflow</code></dd></div>
      </dl>
    </header>
  );
}
