export function queryRow<T>(value: unknown): T | undefined {
  return value as T | undefined;
}

export function queryRows<T>(value: unknown): T[] {
  return value as T[];
}
