import type { StatusState } from './status';

/**
 * Represents an authenticated LiqPass account holder.
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  status: StatusState;
  createdAt: string;
  updatedAt: string;
}