import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd(), '.');
const specPath = path.join(root, 'openapi.json');

try {
  const raw = fs.readFileSync(specPath, 'utf-8');
  const spec = JSON.parse(raw);
  const paths = spec.paths ? Object.keys(spec.paths) : [];
  const required = ['/api/v1/pricing/quote', '/api/v1/orders', '/api/v1/health'];
  const missing = required.filter(p => !paths.includes(p));
  if (missing.length) {
    console.error('OpenAPI missing paths:', missing);
    process.exit(2);
  }
  console.log('OpenAPI check passed');
} catch (e) {
  console.error('OpenAPI check failed:', e.message);
  process.exit(2);
}

