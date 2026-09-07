'use strict'
const fs = require('node:fs')
const asarPath = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/app.asar'
if (!fs.existsSync(asarPath)) { console.log('no app.asar'); process.exit(0) }
const buf = fs.readFileSync(asarPath)
// asar header: 16 bytes then JSON length
const size = buf.readUInt32LE(12)
const header = JSON.parse(buf.subarray(16, 16 + size).toString('utf8'))
const keys = Object.keys(header.files || {})
console.log('asar entries:', keys.length)
console.log('chat/copilot related:', keys.filter((k) => k.toLowerCase().includes('chat') || k.toLowerCase().includes('copilot')).join(', '))
// disable-extensions support?
const hay = buf.subarray(0, Math.min(buf.length, 40000000)).toString('latin1')
console.log('has disable-extensions string:', hay.includes('disable-extensions'))
