import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function localDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(new URL('../migrations', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    prepare(query) {
      return {
        bind(...parameters) {
          const statement = db.prepare(query);
          return {
            async first() { return statement.get(...parameters) ?? null; },
            all() { return { results: statement.all(...parameters) }; },
            async run() { return statement.run(...parameters); },
          };
        },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.all());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() { db.close(); },
  };
}
