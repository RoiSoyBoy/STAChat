import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase'; // Should resolve to apps/backend/src/lib/firebase.ts

export async function getClientContext(clientId: string): Promise<string> {
  try {
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    
    if (!clientDoc.exists()) {
      throw new Error('Client not found');
    }

    const data = clientDoc.data();
    // Ensure data and trainingData exist and are of expected type, or provide a default.
    // For example, if trainingData is expected to be a string:
    if (data && typeof data.trainingData === 'string') {
      return data.trainingData;
    } else if (data && data.trainingData) {
      // If trainingData exists but isn't a string, log a warning or handle as an error.
      console.warn(`Client context for ${clientId} 'trainingData' is not a string.`);
      return ''; // Or throw an error, depending on desired behavior.
    }
    return ''; // Default if no trainingData field or data is null/undefined
  } catch (error) {
    console.error('Error fetching client context:', error);
    // Depending on requirements, you might want to rethrow the error or return a specific error indicator.
    // For now, returning empty string as per original logic for caught errors.
    return '';
  }
}
