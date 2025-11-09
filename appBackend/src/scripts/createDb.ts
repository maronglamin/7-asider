import 'dotenv/config';
import { Client } from 'pg';

// This script connects to postgres default db and creates the target DB if missing

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  // Parse database name and connect to postgres database
  const match = url.match(/^(.*:\/\/[^/?#]+:\d+\/)([^/?#]+)(.*)$/);
  if (!match) {
    console.error('Invalid DATABASE_URL');
    process.exit(1);
  }
  const prefix = match[1];
  const dbName = match[2];

  const adminUrl = `${prefix}postgres`;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`Database ${dbName} already exists.`);
    } else {
      await client.query(`CREATE DATABASE ${dbName};`);
      console.log(`Database ${dbName} created.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


