// Minimal JSX runtime to allow declarative route configuration without React.

type AnyProps = Record<string, unknown> | null | undefined;

type ComponentType<P = AnyProps> = (props: P & { children?: unknown }) => unknown;

type ElementType = string | ComponentType;

function invokeComponent(type: ElementType, props: AnyProps, key: unknown) {
  const normalizedProps = props ? { ...props } : {};
  if (key !== undefined && key !== null) {
    (normalizedProps as Record<string, unknown>).key = key as unknown;
  }

  if (typeof type === 'function') {
    return type(normalizedProps as never);
  }

  return {
    type,
    props: normalizedProps,
  };
}

export function jsx(type: ElementType, props: AnyProps, key?: unknown) {
  return invokeComponent(type, props, key);
}

export const jsxs = jsx;

export function Fragment(props: { children?: unknown }) {
  return props.children ?? null;
}
