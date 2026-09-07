'use strict';
// Dump all storage keys of the CURRENT window related to aux/chat/dsh/claude.
const { DatabaseSync } = require('node:sqlite');
const dir = '585c816fe0f3aa55a26f39023a111c2d';
const db = new DatabaseSync('C:/Users/20906/AppData/Roaming/Code/User/workspaceStorage/' + dir + '/state.vscdb', { readOnly: true });
const rows = db.prepare('SELECT key, value FROM ItemTable').all();
for (const r of rows) {
  const k = String(r.key);
  if (/aux|claude|dsh|panel\.chat|activitybar|secondary/i.test(k)) {
    console.log('\n### ' + k + '\n' + String(r.value).slice(0, 600));
  }
}
db.close();
