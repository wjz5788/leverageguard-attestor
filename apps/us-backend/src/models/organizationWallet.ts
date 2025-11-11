/**
 * Represents an on-chain wallet associated with an organization.
 */
export interface OrganizationWallet {
  id: string;
  organizationId: string;
  walletAddress: string;
  label?: string | null;
  createdAt: string;
  updatedAt: string;
}