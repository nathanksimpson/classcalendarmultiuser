/**
 * Application-level blob encryption (AES-256-GCM envelope).
 * Used by local Express server (sync) and Cloudflare Worker (nodejs_compat).
 */
const crypto = require('crypto');

const ENC_PREFIX = 'enc1';
const WRAP_PREFIX = 'w1';
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const DEK_BYTES = 32;
const KEK_BYTES = 32;

function parseMasterKey(masterKeyB64) {
    if (!masterKeyB64 || typeof masterKeyB64 !== 'string') {
        return null;
    }
    const trimmed = masterKeyB64.trim();
    if (!trimmed) {
        return null;
    }
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length !== KEK_BYTES) {
        throw new Error('DATA_ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes');
    }
    return buf;
}

function isEncryptedRow(row) {
    if (!row) {
        return false;
    }
    const v = row.data_enc_version != null ? row.data_enc_version : row.dataEncVersion;
    return Number(v) >= 1;
}

function aadBuffer(entityId) {
    return Buffer.from(String(entityId || ''), 'utf8');
}

function aesGcmEncrypt(key, iv, plaintext, aad) {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    if (aad && aad.length) {
        cipher.setAAD(aad);
    }
    const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext, tag };
}

function aesGcmDecrypt(key, iv, ciphertext, tag, aad, asString) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    if (aad && aad.length) {
        decipher.setAAD(aad);
    }
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return asString ? plain.toString('utf8') : plain;
}

function wrapDek(dek, kek, entityId) {
    const iv = crypto.randomBytes(GCM_IV_BYTES);
    const aad = aadBuffer(entityId);
    const { ciphertext, tag } = aesGcmEncrypt(kek, iv, dek, aad);
    return `${WRAP_PREFIX}$${iv.toString('base64')}$${ciphertext.toString('base64')}$${tag.toString('base64')}`;
}

function unwrapDek(wrapped, kek, entityId) {
    const parts = String(wrapped || '').split('$');
    if (parts.length !== 4 || parts[0] !== WRAP_PREFIX) {
        throw new Error('Invalid wrapped data key');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const aad = aadBuffer(entityId);
    const dek = aesGcmDecrypt(kek, iv, ciphertext, tag, aad, false);
    if (dek.length !== DEK_BYTES) {
        throw new Error('Invalid decrypted data key length');
    }
    return dek;
}

/**
 * Encrypt a JSON string for storage.
 * @returns {{ data: string, dataKeyWrapped: string, dataEncVersion: number } | null}
 */
function encryptBlob(plainJsonString, entityId, masterKeyB64) {
    const kek = parseMasterKey(masterKeyB64);
    if (!kek) {
        return null;
    }
    const dek = crypto.randomBytes(DEK_BYTES);
    const iv = crypto.randomBytes(GCM_IV_BYTES);
    const aad = aadBuffer(entityId);
    const { ciphertext, tag } = aesGcmEncrypt(dek, iv, plainJsonString, aad);
    const data = `${ENC_PREFIX}$${iv.toString('base64')}$${ciphertext.toString('base64')}$${tag.toString('base64')}`;
    const dataKeyWrapped = wrapDek(dek, kek, entityId);
    return { data, dataKeyWrapped, dataEncVersion: 1 };
}

/**
 * Decrypt row.data to a JSON string (or pass through legacy plaintext).
 */
function decryptBlob(row, masterKeyB64, entityId) {
    if (!row || row.data == null) {
        return '';
    }
    if (!isEncryptedRow(row)) {
        return String(row.data);
    }
    const kek = parseMasterKey(masterKeyB64);
    if (!kek) {
        throw new Error('Encrypted row requires DATA_ENCRYPTION_MASTER_KEY');
    }
    const id = entityId != null ? entityId : row.id;
    const wrapped = row.data_key_wrapped != null ? row.data_key_wrapped : row.dataKeyWrapped;
    const dek = unwrapDek(wrapped, kek, id);

    const parts = String(row.data).split('$');
    if (parts.length !== 4 || parts[0] !== ENC_PREFIX) {
        throw new Error('Invalid encrypted blob format');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const aad = aadBuffer(id);
    return aesGcmDecrypt(dek, iv, ciphertext, tag, aad, true);
}

function encryptionRequiredFromEnv(envOrProcessEnv) {
    const val =
        envOrProcessEnv && envOrProcessEnv.DATA_ENCRYPTION_REQUIRED != null
            ? envOrProcessEnv.DATA_ENCRYPTION_REQUIRED
            : process.env.DATA_ENCRYPTION_REQUIRED;
    return String(val || '') === '1';
}

module.exports = {
    encryptBlob,
    decryptBlob,
    isEncryptedRow,
    parseMasterKey,
    encryptionRequiredFromEnv,
    ENC_PREFIX,
    WRAP_PREFIX
};
