import type { StatusState } from './status';

/**
 * Describes an organization that can onboard exchange accounts.
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: StatusState;
  createdAt: string;
  updatedAt: string;
}