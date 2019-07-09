declare module 'json-diff' {
  export function diffString(a: unknown, b: unknown): string;
  export function diff(a: unknown, b: unknown): unknown;
}
