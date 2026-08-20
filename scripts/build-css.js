const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const parts = [
  'src/tailwind-local.css',
  'src/app.css',
  'src/production-overrides.css'
];

const banner = `/*\n * Wall Printer Exchange production CSS\n * Built locally for v3.9.2. No Tailwind CDN required.\n */\n`;
const css = banner + parts.map(file => {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing CSS source: ${file}`);
  }
  return `\n/* ---- ${file} ---- */\n` + fs.readFileSync(fullPath, 'utf8').trim() + '\n';
}).join('\n');

fs.writeFileSync(path.join(root, 'public/styles.css'), css);
console.log(`Built public/styles.css (${Buffer.byteLength(css)} bytes)`);
