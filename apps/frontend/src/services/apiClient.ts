import {
  ChatRequestBody,
  ChatResponseBody,
  ApiErrorResponse,
} from "shared-types";
// You'll need to have Firebase initialized in your frontend
import { getAuth } from 'firebase/auth'; // Removed onAuthStateChanged as it's not used in the simplified getAuthToken
import { app as firebaseApp } from '../lib/firebase'; // Corrected import for named export 'app'

const envApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
const fallbackApiUrl = "http://localhost:3001/api/v1"; // Defaulting to 3001 (corrected)
const BACKEND_API_URL = envApiUrl || fallbackApiUrl;

console.log(
  "[apiClient] NEXT_PUBLIC_BACKEND_API_URL (from process.env):",
  envApiUrl
);
console.log("[apiClient] Fallback API URL:", fallbackApiUrl);
console.log("[apiClient] Effective BACKEND_API_URL:", BACKEND_API_URL);

async function getAuthToken(): Promise<string | null> {
  const auth = getAuth(firebaseApp); // firebaseApp should be correctly initialized
  const currentUser = auth.currentUser;

  // Since there's no login mechanism, currentUser will likely always be null.
  // For development where backend bypasses auth, we don't need a real token.
  // Returning null means no Authorization header will be sent.
  if (currentUser) { 
    try {
      // This block will likely not be hit if there's no login.
      const token = await currentUser.getIdToken(true); 
      console.log("[apiClient] Firebase user found, token obtained.");
      return token;
    } catch (error) {
      console.error("[apiClient] Error getting Firebase ID token for logged-in user:", error);
      return null; 
    }
  } else {
    console.log("[apiClient] No Firebase user currently signed in. Proceeding without token (for dev bypass mode).");
    return null;
  }
}

// Remove the unused onAuthStateChanged example to simplify
// export const getCurrentUserToken = (): Promise<string | null> => { ... };


export async function postChatMessage(
  payload: ChatRequestBody
): Promise<ChatResponseBody> {
  const token = await getAuthToken(); // This will be null if no login mechanism

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    console.warn("[apiClient.postChatMessage] No auth token available. Sending request without Authorization header (expected in dev bypass mode).");
  }

  const response = await fetch(`${BACKEND_API_URL}/chat`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = await response.json();
    } catch (e) {
      // Ignore if response is not JSON
    }
    const errorMessage =
      errorData?.message ||
      errorData?.error ||
      `API request failed with status ${response.status}`;
    console.error(
      "postChatMessage failed:",
      errorMessage,
      "Status:",
      response.status,
      "Response Data:",
      errorData
    );
    throw new Error(errorMessage);
  }

  return response.json() as Promise<ChatResponseBody>;
}
