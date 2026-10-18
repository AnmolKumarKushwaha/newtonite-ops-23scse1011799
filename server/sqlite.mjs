import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/** Small adapter: the same parameterized SQL runs against SQLite locally and D1 when hosted. */
export function database(path=':memory:') {
  const raw=new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  raw.exec('CREATE TABLE IF NOT EXISTS relay_migrations(name TEXT PRIMARY KEY)');
  const dir=fileURLToPath(new URL('../drizzle/',import.meta.url));
  for(const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) if(!raw.prepare('SELECT name FROM relay_migrations WHERE name=?').get(file)) {
    raw.exec('BEGIN');
    try {
      raw.exec(readFileSync(dir+'/'+file,'utf8'));
      raw.prepare('INSERT INTO relay_migrations VALUES (?)').run(file);
      raw.exec('COMMIT');

    } catch(e) {
      raw.exec('ROLLBACK');
      throw e;

    }
  }
  const prepare=(sql,args=[]) => ({
    bind(...a) {
      return prepare(sql,a)

    },async first() {
      return raw.prepare(sql).get(...args)||null

    },async all() {
      return { results: raw.prepare(sql).all(...args) }

    },async run() {
      const r=raw.prepare(sql).run(...args);
      return { meta: { changes: r.changes,last_row_id: Number(r.lastInsertRowid) } }

    },_sql: sql,_args: args
  });
  return {
    raw,prepare,async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out=statements.map(s => {
          const r=raw.prepare(s._sql).run(...s._args);
          return { meta: { changes: r.changes } }

        });
        raw.exec('COMMIT');
        return out;

      } catch(e) {
        raw.exec('ROLLBACK');
        throw e;

      }
    }
  };

}
