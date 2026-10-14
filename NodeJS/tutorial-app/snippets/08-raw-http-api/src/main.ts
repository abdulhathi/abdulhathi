import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const server = createApp();

// A server is an EventEmitter: without this listener, a busy port would crash the process.
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use` : error);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Bookmarks API listening on http://localhost:${port}`);
});

// Ctrl+C sends SIGINT. Stop accepting connections and let open requests finish.
process.on('SIGINT', () => {
  console.log('\nshutting down');
  server.close(() => console.log('server closed'));
});
