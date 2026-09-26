import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { MemoryDocumentConflictError, type MemoryDocumentBackend } from "eve/memory/file";

const EMPTY_WITH_BLANK_LINE =
  /^(<!-- eve-memory-file-v1 lastAllocatedIndex=(?:-1|0|[1-9]\d*) -->\n)\n$/;

export function durableMemory(directory: string): MemoryDocumentBackend {
  let database: DatabaseSync | undefined;
  const db = () => {
    if (!database) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      // The busy timeout covers setup too, and the connection is kept only once
      // set up, so a lock held by the Next.js process never leaves it tableless.
      const connection = new DatabaseSync(join(directory, "profile.sqlite"), { timeout: 5000 });
      try {
        connection.exec(
          "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS memory (key TEXT PRIMARY KEY, content TEXT NOT NULL, version TEXT NOT NULL)",
        );
      } catch (error) {
        connection.close();
        throw error;
      }
      database = connection;
    }
    return database;
  };
  return {
    async read({ key }) {
      const row = db().prepare("SELECT content, version FROM memory WHERE key = ?").get(key);
      if (!row) return null;
      // Releases before security-2026-09-26 saved an emptied document with a
      // trailing blank line, which eve's parser rejects on every turn.
      const content = String(row.content).replace(EMPTY_WITH_BLANK_LINE, "$1");
      return { content, version: String(row.version) };
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
        // Already rolled back by SQLite on some errors, such as a full disk.
        if (database.isTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
