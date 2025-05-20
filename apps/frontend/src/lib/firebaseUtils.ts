import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { ChatMessage, ChatSettings, TrainingData } from './types';

// Chat Messages
export async function saveMessage(message: Omit<ChatMessage, 'id'>) {
  const docRef = await addDoc(collection(db, 'messages'), {
    ...message,
    timestamp: Date.now()
  });
  return docRef.id;
}

export async function getMessages(clientId: string) {
  const q = query(
    collection(db, 'messages'),
    where('clientId', '==', clientId),
    orderBy('timestamp', 'asc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as ChatMessage));
}

// Settings
export async function saveSettings(settings: ChatSettings) {
  await setDoc(doc(db, 'settings', 'global'), settings);
}

export async function getSettings(): Promise<ChatSettings> {
  const docRef = doc(db, 'settings', 'global');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as ChatSettings;
  }
  return {
    primaryColor: '#0F172A',
    greeting: 'שלום! איך אוכל לעזור?',
    botName: 'Assistant',
    language: 'he'
  };
}

// Training Data
export async function saveTrainingData(data: Omit<TrainingData, 'id'>) {
  const docRef = await addDoc(collection(db, 'training'), {
    ...data,
    timestamp: Date.now()
  });
  return docRef.id;
}

export async function updateTrainingStatus(id: string, status: TrainingData['status']) {
  const docRef = doc(db, 'training', id);
  await updateDoc(docRef, { status });
}

export async function getTrainingData() {
  const q = query(
    collection(db, 'training'),
    orderBy('timestamp', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as TrainingData));
}

// File Upload
export async function uploadFile(file: File) {
  const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
