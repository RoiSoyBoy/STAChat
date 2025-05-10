import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const SETTINGS_DOC = 'main';

function sanitizeString(str: any) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
}

function isValidImageUrl(url: string) {
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

export async function GET() {
  try {
    const doc = await adminDb.collection('settings').doc(SETTINGS_DOC).get();
    if (!doc.exists) {
      // Default settings if not present
      const defaultSettings = {
        primaryColor: '#0066cc',
        greeting: 'שלום! איך אני יכול/ה לעזור לך היום?',
        logoUrl: '',
        urls: [],
        botName: 'הבוט שלי',
        tone: 'formal',
        avatarUrl: '',
        description: '',
        introMessage: 'שלום! אני כאן כדי לעזור.'
      };
      await adminDb.collection('settings').doc(SETTINGS_DOC).set(defaultSettings);
      return NextResponse.json(defaultSettings);
    }
    return NextResponse.json(doc.data());
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();

    // Validate color format
    if (updates.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(updates.primaryColor)) {
      return NextResponse.json(
        { error: 'Invalid color format' },
        { status: 400 }
      );
    }
    // Validate avatarUrl
    if (updates.avatarUrl && !isValidImageUrl(updates.avatarUrl)) {
      return NextResponse.json(
        { error: 'Invalid avatar image URL' },
        { status: 400 }
      );
    }
    // Sanitize all string fields
    const safeUpdates: any = { ...updates };
    ['botName', 'tone', 'avatarUrl', 'description', 'introMessage', 'greeting', 'logoUrl'].forEach(key => {
      if (safeUpdates[key]) safeUpdates[key] = sanitizeString(safeUpdates[key]);
    });
    // Update Firestore
    await adminDb.collection('settings').doc(SETTINGS_DOC).set(safeUpdates, { merge: true });
    const updatedDoc = await adminDb.collection('settings').doc(SETTINGS_DOC).get();

    return NextResponse.json({ success: true, settings: updatedDoc.data() });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
} 