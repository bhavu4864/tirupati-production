import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const database = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const id = randomUUID();

try {
  await database.query("BEGIN");

  const result = await database.query(
    `
    INSERT INTO machine_master
      (id, machine_name, machine_code, machine_type, status, location, notes)
    VALUES
      ($1, $2, $3, 'Other', 'Active', '', '')
    RETURNING id, machine_name, machine_code, status;
    `,
    [id, "LMW", "LMW"]
  );

  console.log("INSERT SUCCESS — PostgreSQL accepts LMW:");
  console.table(result.rows);

  await database.query("ROLLBACK");
  console.log("ROLLBACK complete — LMW was NOT saved.");
} catch (error) {
  await database.query("ROLLBACK");

  console.log("INSERT FAILED:");
  console.log("code:", error.code);
  console.log("constraint:", error.constraint);
  console.log("detail:", error.detail);
  console.log("message:", error.message);
} finally {
  await database.end();
}