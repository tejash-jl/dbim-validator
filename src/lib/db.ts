import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { ScanOptions, ScanReport } from "./dbim/types";
import type { OrgType } from "./dbim/spec";

export const DATA_DIR = process.env.DBIM_DATA_DIR || path.join(process.cwd(), "data");
export const scanDir = (id: string) => path.join(DATA_DIR, "scans", id);

export type ScanStatus = "queued" | "running" | "done" | "error";

export type ScanRow = {
  id: string;
  url: string;
  url_key: string;
  org_type: OrgType;
  options: ScanOptions;
  status: ScanStatus;
  progress_step: string | null;
  progress_pct: number;
  error: string | null;
  score: number | null;
  batch_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  report: ScanReport | null;
};

type RawRow = Omit<ScanRow, "options" | "report"> & { options: string; report: string | null };

let db: Database.Database | null = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, "dbim.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      url_key TEXT NOT NULL,
      org_type TEXT NOT NULL,
      options TEXT NOT NULL,
      status TEXT NOT NULL,
      progress_step TEXT,
      progress_pct INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      score INTEGER,
      batch_id TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      report TEXT
    );
    CREATE INDEX IF NOT EXISTS scans_status ON scans(status, created_at);
    CREATE INDEX IF NOT EXISTS scans_url_key ON scans(url_key, created_at);
    CREATE INDEX IF NOT EXISTS scans_batch ON scans(batch_id);
  `);
  return db;
}

function parse(r: RawRow | undefined): ScanRow | null {
  if (!r) return null;
  return { ...r, options: JSON.parse(r.options), report: r.report ? JSON.parse(r.report) : null };
}

/** Normalised key used to compare scans of the same site over time. */
export function urlKey(u: string) {
  const x = new URL(u);
  return `${x.host.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`.toLowerCase();
}

export function createScan(url: string, options: ScanOptions, batchId: string | null): string {
  const id = crypto.randomBytes(9).toString("base64url");
  getDb()
    .prepare(
      `INSERT INTO scans (id, url, url_key, org_type, options, status, progress_step, batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 'Waiting in queue', ?, ?)`,
    )
    .run(id, url, urlKey(url), options.orgType, JSON.stringify(options), batchId, new Date().toISOString());
  return id;
}

export function getScan(id: string): ScanRow | null {
  return parse(getDb().prepare(`SELECT * FROM scans WHERE id = ?`).get(id) as RawRow | undefined);
}

export function listScans(opts: { batch?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const sql = `SELECT id, url, org_type, status, progress_step, progress_pct, error, score, batch_id, created_at, finished_at
               FROM scans ${opts.batch ? "WHERE batch_id = ?" : ""} ORDER BY created_at DESC LIMIT ${limit}`;
  const stmt = getDb().prepare(sql);
  return (opts.batch ? stmt.all(opts.batch) : stmt.all()) as Omit<ScanRow, "options" | "report" | "url_key" | "started_at">[];
}

/** Most recent completed scan of the same URL before this one, for before/after comparison. */
export function previousScan(row: ScanRow): ScanRow | null {
  return parse(
    getDb()
      .prepare(`SELECT * FROM scans WHERE url_key = ? AND status = 'done' AND created_at < ? AND id != ? ORDER BY created_at DESC LIMIT 1`)
      .get(row.url_key, row.created_at, row.id) as RawRow | undefined,
  );
}

export function queueDepth(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM scans WHERE status IN ('queued','running')`).get() as { n: number }).n;
}

/** Atomically claim the oldest queued scan. */
export function claimNext(): ScanRow | null {
  const d = getDb();
  const tx = d.transaction(() => {
    const r = d.prepare(`SELECT * FROM scans WHERE status = 'queued' ORDER BY created_at LIMIT 1`).get() as RawRow | undefined;
    if (!r) return null;
    d.prepare(`UPDATE scans SET status = 'running', started_at = ?, progress_step = 'Starting', progress_pct = 1 WHERE id = ? AND status = 'queued'`).run(new Date().toISOString(), r.id);
    return { ...r, status: "running" } as RawRow;
  });
  return parse(tx() ?? undefined);
}

export function updateProgress(id: string, step: string, pct: number) {
  getDb().prepare(`UPDATE scans SET progress_step = ?, progress_pct = ? WHERE id = ?`).run(step, pct, id);
}

export function completeScan(id: string, report: ScanReport) {
  getDb()
    .prepare(`UPDATE scans SET status = 'done', report = ?, score = ?, progress_step = 'Done', progress_pct = 100, finished_at = ? WHERE id = ?`)
    .run(JSON.stringify(report), report.score, new Date().toISOString(), id);
}

export function failScan(id: string, error: string) {
  getDb().prepare(`UPDATE scans SET status = 'error', error = ?, progress_step = 'Failed', finished_at = ? WHERE id = ?`).run(error.slice(0, 500), new Date().toISOString(), id);
}

/** Scans left 'running' by a crashed worker go back to the queue. */
export function requeueStale() {
  return getDb().prepare(`UPDATE scans SET status = 'queued', progress_step = 'Re-queued after worker restart', progress_pct = 0 WHERE status = 'running'`).run().changes;
}
