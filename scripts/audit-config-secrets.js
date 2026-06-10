const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_EXTENSIONS = new Set(['.ts', '.js', '.json', '.md', '.ps1', '.yml', '.yaml']);
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.angular',
  '.cache',
  'logs',
  'chamanagro-web-dist',
  'demo-repository',
  'Testing',
  'sdc-doc',
  'sdc-web-admin',
  'sdc-web-cliente',
  'sdc-api-admin',
  'sdc-api-externa',
  'sdc-ftp',
]);

const patterns = [
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: 'Likely password default', regex: /(PASSWORD|PASS|SECRET|PRIVATE_KEY|CLIENT_SECRET|MQTT_PASS)\s*=\s*['"][^'"]{8,}['"]/gi },
  { name: 'Mongo URI with credentials', regex: /mongodb(\+srv)?:\/\/[^/\s:]+:[^@\s]+@/gi },
  { name: 'Bearer token literal', regex: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
  { name: 'PEM private key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Google service account JSON', regex: /"type"\s*:\s*"service_account"[\s\S]{0,2000}"private_key"\s*:/g },
];

const allowList = [
  'deploy/railway',
  'SECURITY.md',
  'docs/SECURITY_BASELINE.md',
  'docs/AUDIT_CHECKLIST.md',
  'scripts/audit-config-secrets.js',
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), files);
      }
      continue;
    }
    const filePath = path.join(dir, entry.name);
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(filePath);
    }
  }
  return files;
}

function isAllowed(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.endsWith('.example.json')) return true;
  return allowList.some((prefix) => normalized.startsWith(prefix));
}

const findings = [];

for (const filePath of walk(ROOT)) {
  const relativePath = path.relative(ROOT, filePath);
  if (isAllowed(relativePath)) continue;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern.regex)];
    for (const match of matches) {
      const before = text.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      findings.push({ file: relativePath, line, type: pattern.name });
    }
  }
}

if (findings.length) {
  console.error('Potential secrets found:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}`);
  }
  process.exit(1);
}

console.log('No obvious config secrets found in tracked source scan.');
