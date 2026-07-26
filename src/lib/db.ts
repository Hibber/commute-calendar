import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Store DB in the project root so it persists during dev
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'calendar.db');

const db = new Database(dbPath, { verbose: console.log });

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'shift', 'austin', 'karey'
    date TEXT NOT NULL, -- YYYY-MM-DD
    startTime TEXT NOT NULL, -- HH:MM
    endTime TEXT NOT NULL, -- HH:MM
    notes TEXT
  );
`);

export default db;
