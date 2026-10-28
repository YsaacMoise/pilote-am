/* Types de bun:test (le paquet de types n'est pas nécessaire au site). */

declare module 'bun:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toBeLessThan(n: number): void;
    toBeLessThanOrEqual(n: number): void;
    toContain(item: unknown): void;
    toHaveLength(n: number): void;
    toThrow(message?: string | RegExp): void;
    not: Matchers;
  }
  export function expect(value: unknown): Matchers;
}

