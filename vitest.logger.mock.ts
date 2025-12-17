export const LogLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug',
} as const;

export type LoggerConfig = Record<string, unknown>;

export type MockLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  child: (context?: Record<string, unknown>) => MockLogger;
};

const mockLogger: MockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => mockLogger,
};

export function getLogger(): MockLogger {
  return mockLogger;
}

export function initializeLogger(_config?: LoggerConfig): MockLogger {
  return mockLogger;
}

export function getLoggerConfig(): LoggerConfig {
  return {};
}

export function getPresetConfig(_environment: string, overrides?: LoggerConfig): LoggerConfig {
  return { ...(overrides ?? {}) };
}

export function createLogger(_environment: string, _context?: Record<string, unknown>): MockLogger {
  return mockLogger;
}

export function createMockLogger(): MockLogger {
  return mockLogger;
}
