import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { MemoryDocumentConflictError, type MemoryDocumentBackend } from "eve/memory/file";

export function durableMemory(directory: string): MemoryDocumentBackend {
  let database: DatabaseSync | undefined;
  const db = () => {
    if (!database) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      database = new DatabaseSync(join(directory, "profile.sqlite"));
      database.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS memory (key TEXT PRIMARY KEY, content TEXT NOT NULL, version TEXT NOT NULL)",
      );
    }
    return database;
  };
  return {
    async read({ key }) {
      const row = db().prepare("SELECT content, version FROM memory WHERE key = ?").get(key);
      return row ? { content: String(row.content), version: String(row.version) } : null;
    },
    async write({ key, content, expectedVersion }) {
      const database = db();
      const version = randomUUID();
      database.exec("BEGIN IMMEDIATE");
      try {
        const current = database.prepare("SELECT version FROM memory WHERE key = ?").get(key);
        if ((current?.version ?? null) !== expectedVersion)
          throw new MemoryDocumentConflictError(key);
        database
          .prepare(
            "INSERT INTO memory (key, content, version) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET content=excluded.content, version=excluded.version",
          )
          .run(key, content, version);
        database.exec("COMMIT");
        return { content, version };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
