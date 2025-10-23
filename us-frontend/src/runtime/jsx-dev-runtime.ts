// Minimal JSX runtime for development environment

import { jsx } from './jsx-runtime';

type AnyProps = Record<string, unknown> | null | undefined;
type ComponentType<P = AnyProps> = (props: P & { children?: unknown }) => unknown;
type ElementType = string | ComponentType;

// jsxDEV implementation for development environment
export function jsxDEV(
  type: ElementType,
  props: AnyProps,
  key?: unknown,
  isStaticChildren?: boolean,
  source?: { fileName?: string; lineNumber?: number; columnNumber?: number },
  self?: unknown
) {
  // For development, we'll keep it simple and just call the regular jsx function
  // In a real implementation, you might add additional debugging information
  return jsx(type, props, key);
}

export { jsxs, Fragment } from './jsx-runtime';