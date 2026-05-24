process.env.DOTENV_CONFIG_PATH ??= '/dev/null';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.ADMIN_PASSWORD ??= 'test-admin-password';
process.env.ENCRYPTION_KEY ??= '01234567890123456789012345678901';
process.env.LOG_LEVEL ??= 'silent';
process.env.MORGAN_FORMAT ??= 'off';
