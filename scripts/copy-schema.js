const fs = require('fs');
const path = require('path');

const src = path.join('src', 'db', 'schema.sql');
const destDir = path.join('dist', 'db');
const dest = path.join(destDir, 'schema.sql');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied ${src} → ${dest}`);
