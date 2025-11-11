#!/usr/bin/env node
// Minimal runtime env validation for chain-listener

const errs = [];

const requiredAddr = (name) => {
  const v = process.env[name];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(String(v))) {
    errs.push(`${name} missing/invalid (0x + 40 hex)`);
  }
};

if (!process.env.BASE_RPC || String(process.env.BASE_RPC).trim().length === 0) {
  errs.push('BASE_RPC missing');
}

requiredAddr('CHECKOUT_USDC_ADDRESS');
requiredAddr('USDC_ADDRESS');
requiredAddr('TREASURY_ADDRESS');

if (errs.length) {
  console.error('\n⛔ chain-listener env check failed:');
  for (const e of errs) console.error(' - ' + e);
  process.exit(2);
} else {
  console.log('✅ chain-listener env ok');
}

