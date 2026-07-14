import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type { AbilityRecord, CacheRunRecord, DefenseProfile, MatchupEdge, PokemonRecord } from "./types.js";

const require = createRequire(import.meta.url);
type SqlParam = string | number | Uint8Array | null;

export class PokemonDatabase {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;

  constructor(private readonly dbPath: string) {}

  async init() {
    if (this.db) return;

    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    this.SQL = await initSqlJs({ locateFile: () => wasmPath });

    if (fs.existsSync(this.dbPath)) {
      this.db = new this.SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new this.SQL.Database();
    }

    this.migrate();
    this.persist();
  }

  createRun(run: CacheRunRecord) {
    const db = this.requireDb();
    db.run(
      `INSERT INTO cache_runs (id, status, started_at, finished_at, error, pokemon_count, edge_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [run.id, run.status, run.startedAt, run.finishedAt, run.error, run.pokemonCount, run.edgeCount]
    );
    this.persist();
  }

  markRunFailed(id: string, finishedAt: string, error: string) {
    const db = this.requireDb();
    db.run(
      `UPDATE cache_runs
       SET status = 'failed', finished_at = ?, error = ?
       WHERE id = ?`,
      [finishedAt, error, id]
    );
    this.persist();
  }

  replaceCache(runId: string, finishedAt: string, pokemon: PokemonRecord[], edges: MatchupEdge[]) {
    const db = this.requireDb();
    db.run("BEGIN TRANSACTION");
    try {
      db.run("DELETE FROM matchup_edges");
      db.run("DELETE FROM pokemon");

      const insertPokemon = db.prepare(
        `INSERT INTO pokemon (key, name, dex_id, types, image_url, defense_profile, abilities)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of pokemon) {
        insertPokemon.run([
          item.key,
          item.name,
          item.dexId,
          JSON.stringify(item.types),
          item.imageUrl,
          JSON.stringify(item.defenseProfile),
          JSON.stringify(item.abilities)
        ]);
      }
      insertPokemon.free();

      const insertEdge = db.prepare(
        `INSERT OR IGNORE INTO matchup_edges (source_key, target_key, battle_format)
         VALUES (?, ?, 'single')`
      );
      for (const edge of edges) {
        insertEdge.run([edge.sourceKey, edge.targetKey]);
      }
      insertEdge.free();

      db.run(
        `UPDATE cache_runs
         SET status = 'completed', finished_at = ?, error = NULL, pokemon_count = ?, edge_count = ?
         WHERE id = ?`,
        [finishedAt, pokemon.length, edges.length, runId]
      );
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
    this.persist();
  }

  getLatestCompletedRun(): CacheRunRecord | null {
    return this.getRunByStatus("completed");
  }

  getLatestRun(): CacheRunRecord | null {
    const rows = this.execRows<CacheRunRecord>(
      `SELECT id, status, started_at AS startedAt, finished_at AS finishedAt, error,
              pokemon_count AS pokemonCount, edge_count AS edgeCount
       FROM cache_runs
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return rows[0] ?? null;
  }

  listPokemon(): PokemonRecord[] {
    return this.execRows<{
      key: string;
      name: string;
      dexId: number;
      types: string;
      imageUrl: string | null;
      defenseProfile: string;
      abilities: string;
    }>(
      `SELECT key, name, dex_id AS dexId, types, image_url AS imageUrl,
              defense_profile AS defenseProfile, abilities
       FROM pokemon
       ORDER BY dex_id, name`
    ).map((item) => ({
      ...item,
      types: parseJson<string[]>(item.types, []),
      defenseProfile: parseJson<DefenseProfile>(item.defenseProfile, emptyDefenseProfile()),
      abilities: parseJson<AbilityRecord[]>(item.abilities, [])
    }));
  }

  listEdges(): MatchupEdge[] {
    return this.execRows<MatchupEdge>(
      `SELECT source_key AS sourceKey, target_key AS targetKey
       FROM matchup_edges
       WHERE battle_format = 'single'
       ORDER BY source_key, target_key`
    );
  }

  counts() {
    return {
      pokemonCount: this.scalar("SELECT COUNT(*) FROM pokemon"),
      edgeCount: this.scalar("SELECT COUNT(*) FROM matchup_edges WHERE battle_format = 'single'"),
      typeProfileCount: this.scalar(
        `SELECT COUNT(*) FROM pokemon
         WHERE defense_profile IS NOT NULL
           AND defense_profile != '{"weaknesses":[],"resistances":[],"immunities":[]}'`
      )
    };
  }

  hasTypeDefenseData() {
    return this.counts().typeProfileCount > 0;
  }

  private migrate() {
    const db = this.requireDb();
    db.run(`
      CREATE TABLE IF NOT EXISTS pokemon (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dex_id INTEGER NOT NULL,
        types TEXT NOT NULL,
        image_url TEXT,
        defense_profile TEXT NOT NULL DEFAULT '{"weaknesses":[],"resistances":[],"immunities":[]}',
        abilities TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS matchup_edges (
        source_key TEXT NOT NULL,
        target_key TEXT NOT NULL,
        battle_format TEXT NOT NULL DEFAULT 'single',
        PRIMARY KEY (source_key, target_key, battle_format)
      );

      CREATE TABLE IF NOT EXISTS cache_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT,
        pokemon_count INTEGER NOT NULL DEFAULT 0,
        edge_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_edges_source ON matchup_edges (source_key);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON matchup_edges (target_key);
      CREATE INDEX IF NOT EXISTS idx_cache_runs_status_finished ON cache_runs (status, finished_at);
    `);

    this.ensureColumn(
      "pokemon",
      "defense_profile",
      `ALTER TABLE pokemon ADD COLUMN defense_profile TEXT NOT NULL DEFAULT '{"weaknesses":[],"resistances":[],"immunities":[]}'`
    );
    this.ensureColumn("pokemon", "abilities", `ALTER TABLE pokemon ADD COLUMN abilities TEXT NOT NULL DEFAULT '[]'`);
  }

  private ensureColumn(tableName: string, columnName: string, alterSql: string) {
    const columns = this.execRows<{ name: string }>(`PRAGMA table_info(${tableName})`).map((row) => row.name);
    if (!columns.includes(columnName)) {
      this.requireDb().run(alterSql);
    }
  }

  private getRunByStatus(status: CacheRunRecord["status"]) {
    const rows = this.execRows<CacheRunRecord>(
      `SELECT id, status, started_at AS startedAt, finished_at AS finishedAt, error,
              pokemon_count AS pokemonCount, edge_count AS edgeCount
       FROM cache_runs
       WHERE status = ?
       ORDER BY finished_at DESC, started_at DESC
       LIMIT 1`,
      [status]
    );
    return rows[0] ?? null;
  }

  private scalar(sql: string) {
    const db = this.requireDb();
    const result = db.exec(sql);
    return Number(result[0]?.values[0]?.[0] ?? 0);
  }

  private execRows<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
    const db = this.requireDb();
    const statement = db.prepare(sql);
    statement.bind(params);
    const rows: T[] = [];
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
    statement.free();
    return rows;
  }

  private persist() {
    const db = this.requireDb();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(db.export()));
  }

  private requireDb() {
    if (!this.db) throw new Error("Database is not initialized");
    return this.db;
  }
}

function emptyDefenseProfile(): DefenseProfile {
  return {
    weaknesses: [],
    resistances: [],
    immunities: []
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
