'use strict'
const { call } = require('C:/Users/20906/source/dsh-web-panel/src/protocol.js')
;(async () => {
  const r = await call('http://127.0.0.1:3080', 'llm.models', {})
  const groups = r.groups || []
  for (const g of groups) {
    console.log('provider:', g.id, g.name)
    for (const m of g.models || []) {
      console.log('   -', m.id, '| modalities=' + JSON.stringify(m.inputModalities || null), '| ctx=' + (m.context && m.context.contextWindow))
    }
  }
  const target = groups.flatMap((g) => (g.models || []).map((m) => ({ g: g.id, m }))).find((x) => x.m.id === 'deepseek-v4.1-flash-expires-on-0910')
  console.log(target ? '[OK] new model present, provider=' + target.g + ' modalities=' + JSON.stringify(target.m.inputModalities) : '[MISSING] new model not in catalog')
  const fails = r.failures || []
  if (fails.length) console.log('failures:', JSON.stringify(fails).slice(0, 300))
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
