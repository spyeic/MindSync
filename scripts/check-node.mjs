import { existsSync } from 'node:fs';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error(`MindSync requires Node.js 24 LTS. Current version: ${process.version}.`);
  console.error('With nvm, run: nvm install 24 && nvm use 24');
  console.error('After switching versions, run npm ci to reinstall the SQLite native module.');
  process.exit(1);
}

if (process.argv.includes('--production') && (!existsSync('dist/server.js') || !existsSync('.next/BUILD_ID'))) {
  console.error('MindSync production build is missing. Run npm run build before npm run start.');
  process.exit(1);
}
