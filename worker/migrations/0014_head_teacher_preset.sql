-- Reset stored permissions so head_teacher accounts use the updated role preset.
UPDATE users SET permissions = NULL WHERE role = 'head_teacher';
