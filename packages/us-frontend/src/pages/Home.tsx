import type { PageDescriptor } from '../router';
import { initHome } from './home';

export function HomePage(): PageDescriptor {
  return {
    id: 'home',
    label: {
      zh: '产品总览',
      en: 'Overview',
    },
    init: initHome,
  };
}
