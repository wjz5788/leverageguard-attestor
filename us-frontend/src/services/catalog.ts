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
    // Provide more user-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to backend service, please check your network connection');
      }
      if (error.message.includes('HTTP error')) {
        throw new Error(`Server error: ${error.message}`);
      }
    }
    throw new Error('Failed to fetch product list, please try again later');
  }
}
