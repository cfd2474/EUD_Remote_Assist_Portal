import { pool } from "./pool.js";
import { applyMigrations } from "./schema.js";

async function migrate() {
  await applyMigrations(pool);
  console.log("Database migrations applied.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
