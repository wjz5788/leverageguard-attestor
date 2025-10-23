import { API_BASE_URL } from '../config';

export interface AppealPayload {
  claimId: string;
  reason: string;
  contact?: string;
  screenshots: string[]; // base64 encoded images
}

export interface AppealResponse {
  appealId: string;
  status: string;
  createdAt: string;
}

export async function submitAppeal(payload: AppealPayload): Promise<AppealResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/appeal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error('Failed to submit appeal:', errorBody);
      
      let errorMessage = 'Failed to submit appeal';
      if (response.status === 400) {
        errorMessage = 'Appeal information is incomplete, please check your input';
      } else if (response.status === 404) {
        errorMessage = 'Claim not found';
      } else if (response.status === 409) {
        errorMessage = 'Appeal already exists, please do not submit duplicate appeals';
      } else if (response.status >= 500) {
        errorMessage = 'Server error, please try again later';
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as AppealResponse;
  } catch (error) {
    let errorMessage = 'Failed to submit appeal';
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to backend service, please check your network connection';
      } else {
        errorMessage = 'Failed to submit appeal, please try again later';
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
}

export interface AppealStatus {
  appealId: string;
  claimId: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  reason?: string;
  contact?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getAppealStatus(appealId: string): Promise<AppealStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/appeal/${appealId}`);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error('Failed to get appeal status:', errorBody);
      
      let errorMessage = 'Failed to get appeal status';
      if (response.status === 404) {
        errorMessage = 'Appeal not found';
      } else if (response.status >= 500) {
        errorMessage = 'Server error, please try again later';
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as AppealStatus;
  } catch (error) {
    let errorMessage = 'Failed to get appeal status';
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to backend service, please check your network connection';
      } else {
        errorMessage = 'Failed to get appeal status, please try again later';
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
}