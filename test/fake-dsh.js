'use strict'
// Minimal stand-in for the dsh web server: serves an index page carrying the
// __DSH_BOOT__ marker on the port given via --port (like the real CLI).
const args = process.argv.slice(2)
let port = 3199
const i = args.indexOf('--port')
if (i >= 0 && args[i + 1]) port = Number(args[i + 1])
require('node:http').createServer((q, s) => {
  s.setHeader('Content-Type', 'text/html')
  s.end('<!DOCTYPE html><html><head><script>window.__DSH_BOOT__ = {}</script></head><body>fake dsh</body></html>')
}).listen(port, '127.0.0.1', () => console.log('fake dsh listening on ' + port))
