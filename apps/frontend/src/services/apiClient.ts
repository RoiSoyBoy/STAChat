import { ChatRequestBody, ChatResponseBody, ApiErrorResponse } from 'shared-types';
// You'll need to have Firebase initialized in your frontend
// import { getAuth } from 'firebase/auth'; 
// import firebaseApp from '../lib/firebase'; // Assuming you have firebase initialized

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3003/api/v1'; // Defaulting to 3003

async function getAuthToken(): Promise<string | null> {
  // const auth = getAuth(firebaseApp);
  // if (auth.currentUser) {
  //   return auth.currentUser.getIdToken();
  // }
  console.warn('Using placeholder token for API client. Implement actual Firebase token retrieval.');
  return localStorage.getItem('authToken'); // Or however you store your JWT
}

export async function postChatMessage(
  payload: ChatRequestBody
): Promise<ChatResponseBody> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('User not authenticated. Cannot send chat message.');
  }

  const response = await fetch(`${BACKEND_API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = await response.json();
    } catch (e) {
      // Ignore if response is not JSON
    }
    const errorMessage = errorData?.message || errorData?.error || `API request failed with status ${response.status}`;
    console.error('postChatMessage failed:', errorMessage, 'Status:', response.status, 'Response Data:', errorData);
    throw new Error(errorMessage);
  }

  return response.json() as Promise<ChatResponseBody>;
}
