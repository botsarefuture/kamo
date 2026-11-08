import { migrate, closeDb } from '../src/db.js';

try {
  await migrate();
  console.log('Migrations complete.');
} finally {
  await closeDb();
}
