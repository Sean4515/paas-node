const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

const UUID = process.env.UUID;
if (!UUID) { console.error('UUID env var is required'); process.exit(1); }
const PORT = parseInt(process.env.PORT || '8080', 10);
const WS_PATH = process.env.WS_PATH || '/ws';
const DIR = '/tmp/xray-bin';
const ZIP_URL = 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip';

function download(url, dest, cb) {
  https.get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400) return download(res.headers.location, dest, cb);
    if (res.statusCode !== 200) return cb(new Error('download HTTP ' + res.statusCode));
    const out = fs.createWriteStream(dest);
    res.pipe(out);
    out.on('finish', () => out.close(cb));
  }).on('error', cb);
}

function extractZip(zipPath, outDir) {
  const buf = fs.readFileSync(zipPath);
  let off = 0;
  while (off < buf.length - 4) {
    if (buf.readUInt32LE(off) !== 0x04034b50) break;
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error('unsupported zip method ' + method);
    const dest = path.join(outDir, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!name.endsWith('/')) fs.writeFileSync(dest, data);
    off = dataStart + compSize;
  }
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const zipPath = path.join(DIR, 'xray.zip');
  await new Promise((res, rej) => download(ZIP_URL, zipPath, (e) => e ? rej(e) : res()));
  extractZip(zipPath, DIR);
  const bin = path.join(DIR, 'xray');
  fs.chmodSync(bin, 0o755);
  const config = {
    log: { loglevel: 'warning' },
    inbounds: [{ listen: '0.0.0.0', port: PORT, protocol: 'vless',
      settings: { clients: [{ id: UUID }], decryption: 'none' },
      streamSettings: { network: 'ws', wsSettings: { path: WS_PATH } } }],
    outbounds: [{ protocol: 'freedom' }]
  };
  const cfgPath = '/tmp/config.json';
  fs.writeFileSync(cfgPath, JSON.stringify(config));
  const child = spawn(bin, ['run', '-c', cfgPath], { stdio: 'inherit' });
  child.on('exit', (c) => process.exit(c == null ? 1 : c));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));
})().catch((e) => { console.error(e); process.exit(1); });
