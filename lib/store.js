// Tiny JSON-file store. Good enough for a single-user local MVP and keeps
// installation dependency-free (no native database drivers). Writes go to a
// temp file first and are renamed into place so a crash never leaves a
// half-written database.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_PREFERENCES = Object.freeze({
  timezone: 'America/Los_Angeles',
  dayStart: '09:00',
  availableMinutes: 180,
  breakEveryMinutes: 45,
  breakMinutes: 10,
});

export const DEFAULT_CATEGORIES = Object.freeze(['Homework', 'Study', 'Work', 'Personal', 'Health']);

export function emptyDb() {
  return {
    version: 1,
    preferences: { ...DEFAULT_PREFERENCES },
    categories: [...DEFAULT_CATEGORIES],
    tasks: [],
    sessions: [],
    journal: [],
    plans: [],      // AI plan/review/breakdown revisions (input snapshot + output + decision)
    schedules: {},  // date -> accepted schedule for that day
  };
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export class Store {
  constructor(file) {
    this.file = file;
    this.db = this.#load();
  }

  #load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      // Fill in any collections added in later versions.
      const base = emptyDb();
      return { ...base, ...parsed, preferences: { ...base.preferences, ...(parsed.preferences || {}) } };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Keep the unreadable file for inspection instead of silently losing data.
        const backup = `${this.file}.corrupt-${Date.now()}`;
        try { fs.renameSync(this.file, backup); } catch { /* ignore */ }
        console.error(`[store] Could not read ${this.file}; moved it to ${backup}`);
      }
      return emptyDb();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** Run a mutation and persist it. If the mutation throws, nothing changes. */
  update(fn) {
    const snapshot = structuredClone(this.db);
    try {
      const result = fn(this.db);
      this.save();
      return result;
    } catch (err) {
      this.db = snapshot;
      throw err;
    }
  }

  replace(db) {
    this.db = db;
    this.save();
  }
}
