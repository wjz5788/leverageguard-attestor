import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import ccxt from 'ccxt';
import db from '../db.js';

// --- Config and Initialization ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_ROOT = path.resolve(__dirname, '..', '..');

loadEnv({ path: path.resolve(SERVICE_ROOT, '.env.us') });

const exchanges = {};

if (process.env.BINANCE_API_KEY && process.env.BINANCE_SECRET_KEY) {
  exchanges.binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET_KEY,
  });
  console.log('[OK] Binance client initialized.');
}

if (process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY) {
  exchanges.okx = new ccxt.okx({
    apiKey: process.env.OKX_API_KEY,
    secret: process.env.OKX_SECRET_KEY,
    password: process.env.OKX_PASSPHRASE,
  });
  console.log('[OK] OKX client initialized.');
}

// --- Database Queries ---
const queries = {
  getPendingClaims: db.prepare("SELECT * FROM claims WHERE status = 'received'"),
  getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  updateClaimStatus: db.prepare('UPDATE claims SET status = ?, reason = ? WHERE id = ?'),
};

/**
 * A simplified verification function.
 * In a real-world scenario, this would be much more complex.
 * It would need to accurately identify liquidation trades from the user's trade history.
 * This often involves looking for trades with specific flags, fees, or execution types
 * that are unique to liquidations on that exchange.
 *
 * @param {object} exchange - The ccxt exchange instance.
 * @param {object} order - The order record from our database.
 * @returns {Promise<{verified: boolean, reason: string}>}
 */
async function verifyLiquidation(exchange, order) {
  const symbol = order.pair.replace('USDT', '/USDT'); // e.g., BTCUSDT -> BTC/USDT
  console.log(`  Verifying order ${order.id} for symbol ${symbol} on ${exchange.id}...`);

  try {
    // Fetch recent trades. In a real app, you'd manage the `since` parameter carefully.
    const since = new Date(order.createdAt).getTime();
    const trades = await exchange.fetchMyTrades(symbol, since, 50); // Fetch last 50 trades since order creation

    if (trades.length === 0) {
      return { verified: false, reason: 'No trades found for symbol since order was created.' };
    }

    // **VERY SIMPLIFIED LIQUIDATION CHECK**
    // This is a placeholder. A real implementation needs to check for specific liquidation markers.
    // For example, some exchanges might have a specific fee type or a note in the trade info.
    // We are just looking for a trade that might look like a liquidation.
    // For now, we'll just log the trades and approve the first one we find for demo purposes.
    const liquidationTrade = trades.find(trade => {
      // Example condition: check if the trade was a sell order that closed a long position,
      // or if there are specific liquidation flags in the trade's `info` object.
      // This is highly exchange-specific.
      // For now, we'll just log the trades and approve the first one we find for demo purposes.
      console.log(`    - Found trade: ${trade.id} at ${trade.datetime}, Amount: ${trade.amount}, Price: ${trade.price}`);
      return true; // Simplified for MVP - approve if any trade is found.
    });

    if (liquidationTrade) {
      const reason = `Verified via trade ${liquidationTrade.id} on ${exchange.id}.`;
      return { verified: true, reason };
    }

    return { verified: false, reason: 'No liquidating trade found in recent history.' };

  } catch (error) {
    console.error(`  Error verifying with ${exchange.id}:`, error.message);
    return { verified: false, reason: `API Error: ${error.message}` };
  }
}

async function main() {
  console.log('Starting claim verification process...');
  const pendingClaims = queries.getPendingClaims.all();

  if (pendingClaims.length === 0) {
    console.log('No pending claims to verify.');
    return;
  }

  console.log(`Found ${pendingClaims.length} pending claims.`);

  for (const claim of pendingClaims) {
    console.log(`- Processing claim ${claim.id}...`);
    try {
      const order = queries.getOrderById.get(claim.orderId);
      if (!order) {
        console.log(`  - Order ${claim.orderId} not found. Rejecting claim.`);
        queries.updateClaimStatus.run('rejected', 'Original order not found', claim.id);
        continue;
      }

      const exchangeClient = exchanges[order.exchange];
      if (!exchangeClient) {
        console.log(`  - Exchange '${order.exchange}' not configured or supported. Rejecting claim.`);
        queries.updateClaimStatus.run('rejected', `Exchange '${order.exchange}' not supported`, claim.id);
        continue;
      }

      const { verified, reason } = await verifyLiquidation(exchangeClient, order);

      if (verified) {
        console.log(`  - SUCCESS: Claim ${claim.id} approved. Reason: ${reason}`);
        queries.updateClaimStatus.run('approved', reason, claim.id);
      } else {
        console.log(`  - FAILED: Claim ${claim.id} rejected. Reason: ${reason}`);
        queries.updateClaimStatus.run('rejected', reason, claim.id);
      }

    } catch (error) {
      console.error(`  - Unhandled error processing claim ${claim.id}:`, error);
      queries.updateClaimStatus.run('failed', 'Internal script error', claim.id);
    }
  }

  console.log('Claim verification process finished.');
}

main().catch(error => {
  console.error('Script failed unexpectedly:', error);
  process.exit(1);
});
