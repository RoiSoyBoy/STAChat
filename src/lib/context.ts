import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function getClientContext(clientId: string): Promise<string> {
  try {
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    
    if (!clientDoc.exists()) {
      throw new Error('Client not found');
    }

    const data = clientDoc.data();
    return data.trainingData || '';
  } catch (error) {
    console.error('Error fetching client context:', error);
    return '';
  }
}
