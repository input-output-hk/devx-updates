import type { NativeInput, Scope } from "./types";

export interface AdapterContext {
  input: NativeInput;
  node(locator: string, name: string, version: string | null, source: string, integrity: string | null): string;
  edge(from: string, to: string, scope: Scope, optional?: boolean, condition?: string | null, constraint?: string | null): void;
  root(locator: string): void;
  gap(reason: string): void;
}
