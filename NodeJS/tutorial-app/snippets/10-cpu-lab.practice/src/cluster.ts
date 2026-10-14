import cluster from 'node:cluster';
import http from 'node:http';

const PORT = 3152;

if (cluster.isPrimary) {
  // The primary only manages workers; it accepts connections and hands them out.
  console.log(`primary ${process.pid} starting 4 workers`);
  for (let i = 0; i < 4; i++) cluster.fork();

  cluster.on('exit', (worker, code) => {
    if (worker.exitedAfterDisconnect) return;
    console.log(`worker ${worker.process.pid} died (code ${code}), starting another`);
    cluster.fork();
  });
} else {
  // Each worker is a full process with its own memory, all sharing one port.
  http
    .createServer((req, res) => {
      if (req.url === '/crash') process.exit(1);
      res.end(`handled by process ${process.pid}\n`);
    })
    .listen(PORT, () => console.log(`worker ${process.pid} listening on ${PORT}`));
}
