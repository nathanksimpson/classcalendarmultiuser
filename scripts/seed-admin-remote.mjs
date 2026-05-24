/**
 * Create or update an admin user in remote D1 (password is never written to disk).
 * Usage (PowerShell):
 *   $env:ADMIN_EMAIL="you@example.com"
 *   $env:ADMIN_PASSWORD="your-password"
 *   node scripts/seed-admin-remote.mjs
 */
import crypto from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';
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

const PBKDF2_ITERATIONS = 100000;

async function hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    const key = await crypto.subtle.importKey('raw', Buffer.from(pw, 'utf8'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        key,
        256
    );
    const hashHex = Buffer.from(bits).toString('hex');
    return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${hashHex}`;
}

function sqlQuote(value) {
    return String(value).replace(/'/g, "''");
}

function wranglerSqlFile(sql) {
    const file = path.join(root, 'scripts', '.seed-admin-temp.sql');
    writeFileSync(file, sql, 'utf8');
    try {
        execSync(`npx wrangler d1 execute calendar-team --remote --file="${file}"`, {
            cwd: root,
            stdio: 'inherit',
            shell: true
        });
    } finally {
        try {
            unlinkSync(file);
        } catch (_) {
            /* ignore */
        }
    }
}

const em = email.trim().toLowerCase();
const hash = await hashPassword(password);
const created = new Date().toISOString();
const id = crypto.randomUUID();

console.log('Upserting admin user', em);
wranglerSqlFile(
    `UPDATE users SET password_hash = '${sqlQuote(hash)}', role = 'admin', active = 1, display_name = '${sqlQuote(displayName)}' WHERE email = '${sqlQuote(em)}';
INSERT INTO users (id, email, display_name, kakao_user_id, password_hash, role, active, created_at)
SELECT '${sqlQuote(id)}', '${sqlQuote(em)}', '${sqlQuote(displayName)}', NULL, '${sqlQuote(hash)}', 'admin', 1, '${sqlQuote(created)}'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '${sqlQuote(em)}');`
);

console.log('Done. Sign in at /login.html with email + password.');
