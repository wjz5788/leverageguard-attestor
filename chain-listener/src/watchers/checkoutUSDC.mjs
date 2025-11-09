// src/watchers/checkoutUSDC.mjs
import 'dotenv/config';
import sqlite3 from 'sqlite3';
import fs from 'node:fs';
import { JsonRpcProvider, Interface, id, formatUnits } from 'ethers';
import { createOrderService } from '../services/orderService.mjs';

const RPC = process.env.BASE_RPC;
const CONTRACT_ADDR = (process.env.CHECKOUT_USDC_ADDRESS || '').toLowerCase();
const USDC = (process.env.USDC_ADDRESS || '').toLowerCase();
const TREASURY = (process.env.TREASURY_ADDRESS || '').toLowerCase();
const START_BLOCK = Number(process.env.START_BLOCK || 0);
const DB_PATH = process.env.SQLITE_PATH || './database.db';

if (!RPC || !CONTRACT_ADDR || !USDC || !TREASURY) {
  console.error('Missing ENV. Please copy .env.example to .env and fill values.');
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);

async function getCursor() {
  return new Promise((resolve, reject) => {
    db.get('SELECT last_block FROM chain_cursor WHERE id=1', (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.last_block : 0);
    });
  });
}

async function setCursor(blockNumber) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE chain_cursor SET last_block=? WHERE id=1', [blockNumber], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

async function insertPremiumPaid(id, txHash, logIndex, blockNumber, orderId, payer, token, treasury, amount, rawArgsJson) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR IGNORE INTO premium_paid
      (id, tx_hash, log_index, block_number, order_id, payer, token, treasury, amount, raw_args_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [id, txHash, logIndex, blockNumber, orderId, payer, token, treasury, amount, rawArgsJson], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

// --- ABI loading (optional)
let iface = null;
try {
  const abiStr = fs.readFileSync('src/abi/CheckoutUSDC.json', 'utf8');
  const abi = JSON.parse(abiStr);
  iface = new Interface(abi);
  console.log('ABI loaded: using Interface decoding for PremiumPaid.');
} catch {
  console.warn('ABI not found at src/abi/CheckoutUSDC.json. Will store raw logs and rely on USDC Transfer verification.');
}

const provider = new JsonRpcProvider(RPC);
const svc = createOrderService(DB_PATH);

const ERC20_IFACE = new Interface([
  'event Transfer(address indexed from,address indexed to,uint256 value)'
]);
const TRANSFER_TOPIC0 = id('Transfer(address,address,uint256)');

function decodePremiumPaid(log) {
  if (!iface) {
    return {
      orderId: null, payer: null, token: null, treasury: null, amount: null,
      raw: JSON.stringify({ topics: log.topics, data: log.data })
    };
  }
  try {
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed || parsed.name !== 'PremiumPaid') {
      return null;
    }
    const args = parsed.args;
    const orderId = (args.orderId ?? args[0])?.toString?.() ?? null;
    const payer = (args.payer ?? args[1] ?? '')?.toString?.().toLowerCase() ?? null;
    const amount = (args.amount ?? args[2]) ? (args.amount ?? args[2]).toString() : null;
    const token = (args.token ?? args[3] ?? '')?.toString?.().toLowerCase() ?? null;
    const treasury = (args.treasury ?? args[4] ?? '')?.toString?.().toLowerCase() ?? null;
    return {
      orderId, payer, amount, token, treasury,
      raw: JSON.stringify(args, (_, v) => typeof v === 'bigint' ? v.toString() : v)
    };
  } catch {
    return null;
  }
}

async function verifyUSDCTransfer(txHash, payer, amountStr) {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    const tlog = receipt.logs.find(
      (l) => l.address.toLowerCase() === USDC && l.topics[0] === TRANSFER_TOPIC0
    );
    if (!tlog) return { ok: false, reason: 'no USDC Transfer in tx' };
    const { args } = ERC20_IFACE.parseLog(tlog);
    const from = args.from.toLowerCase();
    const to = args.to.toLowerCase();
    const value = args.value;
    const amountOk = amountStr ? (value === BigInt(amountStr)) : true;
    const payerOk = payer ? (from === payer.toLowerCase()) : true;
    const treasuryOk = to === TREASURY;
    return { ok: amountOk && payerOk && treasuryOk, from, to, value };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function backfillAndWatch() {
  const net = await provider.getNetwork();
  console.log(`→ connected Base chainId=${net.chainId}`);

  const current = await getCursor();
  let fromBlock = Math.max(START_BLOCK, current);
  let tip = await provider.getBlockNumber();

  const filter = { address: CONTRACT_ADDR };

  while (fromBlock <= tip) {
    const end = Math.min(fromBlock + 999, tip); // 限制为999个区块，避免超过1000限制
    console.log(`scan blocks [${fromBlock}, ${end}]`);
    
    // 添加延迟避免速率限制
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const logs = await provider.getLogs({ ...filter, fromBlock, toBlock: end });
    for (const log of logs) {
      const parsed = decodePremiumPaid(log);
      if (!parsed) continue;
      const id = `${log.transactionHash}:${log.index}`;
      await insertPremiumPaid(
        id, log.transactionHash, log.index, log.blockNumber,
        parsed.orderId, parsed.payer, parsed.token, parsed.treasury, parsed.amount, parsed.raw
      );
      const ver = await verifyUSDCTransfer(log.transactionHash, parsed.payer, parsed.amount);
      if (ver.ok) {
        console.log(`✓ PremiumPaid@${log.blockNumber} ${id} ${formatUnits(ver.value, 6)} USDC`);
      } else {
        console.warn(`! verify failed ${id}`, ver);
      }
      await svc.onPremiumPaid(
        {
          id, txHash: log.transactionHash, logIndex: log.index, blockNumber: log.blockNumber,
          orderId: parsed.orderId, payer: parsed.payer, token: parsed.token,
          treasury: parsed.treasury, amount: parsed.amount
        },
        provider,
        { USDC, TREASURY }
      );
    }
    await setCursor(end + 1);
    fromBlock = end + 1;
  }

  provider.on(filter, async (log) => {
    if (log.address.toLowerCase() !== CONTRACT_ADDR) return;
    const parsed = decodePremiumPaid(log);
    if (!parsed) return;
    const id = `${log.transactionHash}:${log.index}`;
    await insertPremiumPaid(
      id, log.transactionHash, log.index, log.blockNumber,
      parsed.orderId, parsed.payer, parsed.token, parsed.treasury, parsed.amount, parsed.raw
    );
    const ver = await verifyUSDCTransfer(log.transactionHash, parsed.payer, parsed.amount);
    if (ver.ok) {
      console.log(`✓ [LIVE] PremiumPaid ${id} ${formatUnits(ver.value, 6)} USDC`);
    } else {
      console.warn(`! [LIVE] verify failed ${id}`, ver);
    }
    await svc.onPremiumPaid(
      {
        id, txHash: log.transactionHash, logIndex: log.index, blockNumber: log.blockNumber,
        orderId: parsed.orderId, payer: parsed.payer, token: parsed.token,
        treasury: parsed.treasury, amount: parsed.amount
      },
      provider,
      { USDC, TREASURY }
    );
  });
}

backfillAndWatch().catch((e) => {
  console.error(e);
  process.exit(1);
});
