export function validateConfig(config: Record<string, unknown>) {
  const required = [
    'DATABASE_URL',
    'REDIS_HOST',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'PAYMONGO_SECRET_KEY',
    'PAYMONGO_PUBLIC_KEY',
    'PAYMONGO_WEBHOOK_SECRET',
    'HMS_APP_ACCESS_KEY',
    'HMS_APP_SECRET',
  ];

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    NODE_ENV: config['NODE_ENV'] ?? 'development',
    PORT: Number(config['PORT']) || 3000,
    DATABASE_URL: config['DATABASE_URL'] as string,
    REDIS_HOST: config['REDIS_HOST'] as string,
    REDIS_PORT: Number(config['REDIS_PORT']) || 6379,
    JWT_SECRET: config['JWT_SECRET'] as string,
    JWT_EXPIRES_IN: (config['JWT_EXPIRES_IN'] as string) ?? '15m',
    JWT_REFRESH_SECRET: config['JWT_REFRESH_SECRET'] as string,
    JWT_REFRESH_EXPIRES_IN:
      (config['JWT_REFRESH_EXPIRES_IN'] as string) ?? '7d',
    PAYMONGO_SECRET_KEY: config['PAYMONGO_SECRET_KEY'] as string,
    PAYMONGO_PUBLIC_KEY: config['PAYMONGO_PUBLIC_KEY'] as string,
    PAYMONGO_WEBHOOK_SECRET: config['PAYMONGO_WEBHOOK_SECRET'] as string,
    HMS_APP_ACCESS_KEY: config['HMS_APP_ACCESS_KEY'] as string,
    HMS_APP_SECRET: config['HMS_APP_SECRET'] as string,
  };
}
