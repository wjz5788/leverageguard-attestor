import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 读取合约artifacts
const contractArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/CheckoutUSDC.sol/CheckoutUSDC.json', 'utf8'));

// 保存ABI到文件
const abi = contractArtifact.abi;
fs.writeFileSync('CheckoutUSDC.json', JSON.stringify(abi, null, 2));
console.log('ABI已保存到 CheckoutUSDC.json');

// 保存ABI到前端目录
const frontendAbiDir = '../us-frontend/src/abi';
if (!fs.existsSync(frontendAbiDir)) {
  fs.mkdirSync(frontendAbiDir, { recursive: true });
}
fs.writeFileSync(`${frontendAbiDir}/CheckoutUSDC.json`, JSON.stringify(abi, null, 2));
console.log('ABI已保存到前端目录 us-frontend/src/abi/CheckoutUSDC.json');