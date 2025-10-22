import { API_BASE_URL } from '../config';

export interface Sku {
  id: string;
  title: string;
  premium: number;
  payout: number;
  exchange: string;
}

export async function getSkus(): Promise<Sku[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/catalog/skus`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data as Sku[];
  } catch (error) {
    console.error('Failed to fetch SKUs:', error);
    return []; // Return an empty array on error
  }
}
