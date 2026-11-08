import { createApp } from './src/app.js';
import { migrate, closeDb } from './src/db.js';
import { config } from './src/config.js';

await migrate();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Kamo listening on http://localhost:${config.port}`);
  if (config.baseDomain) console.log(`Organizations: *.${config.baseDomain}`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
