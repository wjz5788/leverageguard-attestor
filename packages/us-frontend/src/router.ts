import type { SupportedLanguage } from './utils/language';

export type LocalizedText = Record<SupportedLanguage, string>;

export interface AnchorDefinition {
  id: string;
  label: LocalizedText;
}

export interface PageDescriptor {
  id: string;
  label: LocalizedText;
  component?: React.ComponentType;
  init?: () => void;
  anchors?: AnchorDefinition[];
}

export interface RouteProps {
  path: string;
  element: PageDescriptor;
}

export interface RouteDefinition extends PageDescriptor {
  path: string;
  component?: React.ComponentType;
}

function ensureLeadingSlash(path: string): string {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export function normalizePath(path: string): string {
  const normalized = ensureLeadingSlash(path.trim());
  const withoutTrailing = normalized.replace(/\/+$/, '');
  return withoutTrailing || '/';
}

export function Route(props: RouteProps): RouteDefinition {
  const anchors = props.element.anchors?.map((anchor) => ({ ...anchor })) ?? undefined;
  return {
    path: normalizePath(props.path),
    id: props.element.id,
    label: { ...props.element.label },
    component: props.element.component,
    init: props.element.init,
    anchors,
  };
}
