import type { StatusState } from './status';

/**
 * Links a user to an organization with a specific role and status.
 */
export interface UserOrgMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  status: StatusState;
  createdAt: string;
  updatedAt: string;
}