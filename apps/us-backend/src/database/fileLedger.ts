import { promises as fsp } from 'fs'
import { dirname, join } from 'path'
import { OrderRecord } from '../types/orders.js'

function getLedgerPath(): string {
  const dbFile = (process.env.DB_FILE || './data/us-backend.db').trim()
  const dir = dirname(dbFile)
  return join(dir, 'orders.json')
}

async function ensureDirAndFile(path: string): Promise<void> {
  const dir = dirname(path)
  try {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 })
  } catch {}
  try {
    await fsp.access(path)
  } catch {
    await fsp.writeFile(path, '[]', { encoding: 'utf-8' })
  }
}

export async function loadOrders(): Promise<OrderRecord[]> {
  const ledger = getLedgerPath()
  await ensureDirAndFile(ledger)
  try {
    const txt = await fsp.readFile(ledger, 'utf-8')
    const data = JSON.parse(txt)
    return Array.isArray(data) ? (data as OrderRecord[]) : []
  } catch (e: any) {
    console.warn('[fileLedger] 订单账本损坏，进行备份并重置:', e?.message || e)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = ledger.replace(/orders\.json$/, `orders.corrupted-${ts}.json`)
    try {
      const txt = await fsp.readFile(ledger, 'utf-8')
      await fsp.writeFile(backup, txt, { encoding: 'utf-8' })
    } catch {}
    await fsp.writeFile(ledger, '[]', { encoding: 'utf-8' })
    return []
  }
}

export async function saveOrders(orders: OrderRecord[]): Promise<void> {
  const ledger = getLedgerPath()
  await ensureDirAndFile(ledger)
  const tmp = ledger + '.tmp'
  const payload = JSON.stringify(orders, null, 2)
  await fsp.writeFile(tmp, payload, { encoding: 'utf-8' })
  await fsp.rename(tmp, ledger)
}

export async function appendOrder(order: OrderRecord): Promise<void> {
  const list = await loadOrders()
  const idx = list.findIndex((o) => o.id === order.id)
  if (idx >= 0) list[idx] = order
  else list.unshift(order)
  await saveOrders(list)
}

