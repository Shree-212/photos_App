#!/usr/bin/env node

const { Pool } = require('pg');
const MigrationManager = require('../lib/migration-manager');
require('dotenv').config({ path: '../.env' });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'taskmanager',
  user: process.env.DB_USER || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpassword',
  port: process.env.DB_PORT || 5432,
};

const pool = new Pool(dbConfig);
const migrationManager = new MigrationManager(pool);

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'migrate':
        await migrationManager.runMigrations();
        break;
        
      case 'rollback':
        const targetVersion = args[0];
        await migrationManager.rollback(targetVersion);
        break;
        
      case 'create':
        const migrationName = args.join(' ');
        if (!migrationName) {
          console.error('Please provide a migration name');
          process.exit(1);
        }
        await migrationManager.createMigration(migrationName);
        break;
        
      case 'status':
        await migrationManager.status();
        break;
        
      default:
        console.log('Usage:');
        console.log('  node migrate.js migrate              - Run pending migrations');
        console.log('  node migrate.js rollback [version]   - Rollback to version (or last migration)');
        console.log('  node migrate.js create <name>        - Create new migration');
        console.log('  node migrate.js status               - Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await pool.end();
  process.exit(0);
});

main();
