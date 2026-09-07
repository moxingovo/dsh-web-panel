'use strict';
// Read the GLOBAL storage DB (scope-0 keys live here).
const { DatabaseSync } = require('node:sqlite');
const p = 'C:/Users/20906/AppData/Roaming/Code/User/globalStorage/state.vscdb';
const db = new DatabaseSync(p, { readOnly: true });
const rows = db.prepare('SELECT key, value FROM ItemTable').all();
for (const r of rows) {
  const k = String(r.key);
  if (/auxiliary|panel\.chat|pinned|secondary|claude|dsh/i.test(k)) {
    console.log('\n### ' + k + '\n' + String(r.value).slice(0, 900));
  }
}
db.close();
