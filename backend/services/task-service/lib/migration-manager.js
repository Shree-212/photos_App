const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class MigrationManager {
  constructor(pool) {
    this.pool = pool;
    this.migrationsPath = path.join(__dirname, 'migrations');
  }

  async initialize() {
    // Create migrations table if it doesn't exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getAppliedMigrations() {
    const result = await this.pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return result.rows.map(row => row.version);
  }

  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort()
        .map(file => {
          const version = file.split('_')[0];
          const name = file.replace('.sql', '').replace(/^\d+_/, '');
          return { version, name, filename: file };
        });
    } catch (error) {
      console.log('No migrations directory found, creating it...');
      await fs.mkdir(this.migrationsPath, { recursive: true });
      return [];
    }
  }

  async runMigrations() {
    await this.initialize();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const migrationFiles = await this.getMigrationFiles();
    
    const pendingMigrations = migrationFiles.filter(
      migration => !appliedMigrations.includes(migration.version)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Running ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }

    console.log('All migrations completed successfully');
  }

  async runMigration(migration) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const migrationPath = path.join(this.migrationsPath, migration.filename);
      const sql = await fs.readFile(migrationPath, 'utf8');
      
      console.log(`Running migration ${migration.version}: ${migration.name}`);
      
      // Execute the migration SQL
      await client.query(sql);
      
      // Record the migration as applied
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name]
      );
      
      await client.query('COMMIT');
      console.log(`✓ Migration ${migration.version} completed`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Migration ${migration.version} failed:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async rollback(targetVersion = null) {
    const appliedMigrations = await this.getAppliedMigrations();
    
    if (appliedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    let migrationsToRollback;
    if (targetVersion) {
      const targetIndex = appliedMigrations.indexOf(targetVersion);
      if (targetIndex === -1) {
        throw new Error(`Migration version ${targetVersion} not found`);
      }
      migrationsToRollback = appliedMigrations.slice(targetIndex + 1);
    } else {
      // Rollback just the last migration
      migrationsToRollback = [appliedMigrations[appliedMigrations.length - 1]];
    }

    if (migrationsToRollback.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    console.log(`Rolling back ${migrationsToRollback.length} migrations...`);

    // Rollback in reverse order
    for (const version of migrationsToRollback.reverse()) {
      await this.rollbackMigration(version);
    }

    console.log('Rollback completed successfully');
  }

  async rollbackMigration(version) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Look for rollback file
      const rollbackFile = `${version}_down.sql`;
      const rollbackPath = path.join(this.migrationsPath, rollbackFile);
      
      try {
        const sql = await fs.readFile(rollbackPath, 'utf8');
        console.log(`Rolling back migration ${version}`);
        
        await client.query(sql);
        await client.query(
          'DELETE FROM schema_migrations WHERE version = $1',
          [version]
        );
        
        await client.query('COMMIT');
        console.log(`✓ Migration ${version} rolled back`);
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(`⚠ No rollback file found for migration ${version}, skipping...`);
          await client.query('COMMIT');
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Rollback of migration ${version} failed:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async createMigration(name) {
    if (!name) {
      throw new Error('Migration name is required');
    }

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const version = timestamp;
    const filename = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
    const rollbackFilename = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}_down.sql`;
    
    const migrationPath = path.join(this.migrationsPath, filename);
    const rollbackPath = path.join(this.migrationsPath, rollbackFilename);

    // Ensure migrations directory exists
    await fs.mkdir(this.migrationsPath, { recursive: true });

    const migrationTemplate = `-- Migration: ${name}
-- Version: ${version}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
`;

    const rollbackTemplate = `-- Rollback for: ${name}
-- Version: ${version}
-- Created: ${new Date().toISOString()}

-- Add your rollback SQL here
-- Example:
-- DROP TABLE IF EXISTS example;
`;

    await fs.writeFile(migrationPath, migrationTemplate);
    await fs.writeFile(rollbackPath, rollbackTemplate);

    console.log(`Created migration files:`);
    console.log(`  Up: ${filename}`);
    console.log(`  Down: ${rollbackFilename}`);

    return { version, filename, rollbackFilename };
  }

  async status() {
    await this.initialize();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const migrationFiles = await this.getMigrationFiles();
    
    console.log('Migration Status:');
    console.log('================');
    
    if (migrationFiles.length === 0) {
      console.log('No migration files found');
      return;
    }

    migrationFiles.forEach(migration => {
      const status = appliedMigrations.includes(migration.version) ? '✓' : '✗';
      console.log(`${status} ${migration.version} - ${migration.name}`);
    });

    const pendingCount = migrationFiles.filter(
      migration => !appliedMigrations.includes(migration.version)
    ).length;

    console.log(`\nTotal: ${migrationFiles.length}, Applied: ${appliedMigrations.length}, Pending: ${pendingCount}`);
  }
}

module.exports = MigrationManager;
