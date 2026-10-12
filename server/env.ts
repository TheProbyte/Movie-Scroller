// Minimal D1 typings so the server compiles without Cloudflare's type package.
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface D1 {
  prepare(sql: string): D1Stmt;
  batch(statements: D1Stmt[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1;
  APP_PASSCODE?: string;
  TMDB_API_KEY?: string;
  TMDB_READ_TOKEN?: string;
  TMDB_BASE_URL?: string;
  TMDB_IMAGE_BASE?: string;
}

let current: Env | undefined;
export const bindEnv = (e: Env) => {
  current = e;
};
export const env = (): Env => {
  if (!current) throw new Error('Environment not bound');
  return current;
};
