#!/usr/bin/env node
// 运行前关键环境变量闸口（dev/prod 均生效）

const errors = [];

const jwt = process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim();
if (!jwt || jwt.length < 32 || jwt === 'dev-secret') {
  errors.push('JWT_SECRET 缺失或过短（≥32，禁止 dev-secret）');
}

const isHex64 = (v) => !!v && /^0x[a-fA-F0-9]{64}$/.test(String(v));

if (!isHex64(process.env.PRICER_PRIVATE_KEY)) {
  errors.push('PRICER_PRIVATE_KEY 缺失或非法（0x+64hex）');
}
if (!isHex64(process.env.ISSUER_PRIVATE_KEY)) {
  errors.push('ISSUER_PRIVATE_KEY 缺失或非法（0x+64hex）');
}

const rpc = process.env.BASE_RPC || process.env.RPC_BASE;
if (!rpc || String(rpc).trim().length === 0) {
  errors.push('BASE_RPC / RPC_BASE 至少配置一个');
}

const db = process.env.DB_URL || process.env.DB_PATH;
if (!db || String(db).trim().length === 0) {
  errors.push('DB_URL / DB_PATH 至少配置一个');
}

if (errors.length) {
  console.error('\n⛔ 环境检查未通过：');
  for (const e of errors) console.error(' - ' + e);
  process.exit(2);
} else {
  console.log('✅ 关键环境变量检查通过');
}

