import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { headers } from 'next/headers';
import { checkRateLimit, getRateLimitResponse } from '@/lib/cache';
import { userCollection } from '@/lib/firebase';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Secure with Firebase Auth middleware
  const authResult = await firebaseAuthMiddleware(request);
  if (authResult) return authResult;
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

  try {
    // Get client IP for rate limiting
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for') || 'unknown';
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return getRateLimitResponse();
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'קובץ לא נמצא' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'סוג קובץ לא חוקי. מותר להעלות רק קבצי JPEG ו-PNG.' },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'הקובץ גדול מדי. גודל מקסימלי הוא 5MB.' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.type.split('/')[1];
    const filename = `upload-${timestamp}.${extension}`;
    const storagePath = `uploads/${userId}/${filename}`;

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Firebase Storage
    const bucket = getStorage().bucket();
    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      contentType: file.type,
      public: true, // Make file publicly accessible
    });

    // Get public URL
    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Save metadata to Firestore
    await adminDb.collection('users').doc(userId).collection('uploads').add({
      filename,
      url,
      timestamp: Date.now()
    });

    return NextResponse.json({
      success: true,
      url,
      filename
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'שגיאה בהעלאת הקובץ' },
      { status: 500 }
    );
  }
} 