/**
 * Create or update an admin user in remote D1 (password is never written to disk).
 * Usage (PowerShell):
 *   $env:ADMIN_EMAIL="you@example.com"
 *   $env:ADMIN_PASSWORD="your-password"
 *   node scripts/seed-admin-remote.mjs
 */
import crypto from 'crypto';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_NAME || 'Admin';

if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
    process.exit(1);
}

function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function sqlQuote(value) {
    return String(value).replace(/'/g, "''");
}

const em = email.trim().toLowerCase();
const hash = hashPassword(password);
const created = new Date().toISOString();

function wranglerSql(command) {
    execSync(`npx wrangler d1 execute calendar-team --remote --command "${command.replace(/"/g, '\\"')}"`, {
        cwd: root,
        stdio: 'inherit'
    });
}

const existing = execSync(
    `npx wrangler d1 execute calendar-team --remote --command "SELECT id FROM users WHERE email = '${sqlQuote(em)}' LIMIT 1" --json`,
    { cwd: root, encoding: 'utf8' }
);
let rows = [];
try {
    const parsed = JSON.parse(existing);
    rows = parsed[0]?.results || [];
} catch (_) {
    rows = [];
}

if (rows.length > 0) {
    const id = rows[0].id;
    console.log('Updating existing user', em, '→ admin with new password hash.');
    wranglerSql(
        `UPDATE users SET password_hash = '${sqlQuote(hash)}', role = 'admin', active = 1, display_name = '${sqlQuote(displayName)}' WHERE id = '${sqlQuote(id)}'`
    );
} else {
    const id = crypto.randomUUID();
    console.log('Creating admin user', em);
    wranglerSql(
        `INSERT INTO users (id, email, display_name, kakao_user_id, password_hash, role, active, created_at) VALUES ('${sqlQuote(id)}', '${sqlQuote(em)}', '${sqlQuote(displayName)}', NULL, '${sqlQuote(hash)}', 'admin', 1, '${sqlQuote(created)}')`
    );
}

console.log('Done. Sign in at /login.html with email + password.');
