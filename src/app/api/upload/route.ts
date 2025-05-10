import { NextRequest, NextResponse } from 'next/server';
<<<<<<< HEAD
import { adminDb } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { headers } from 'next/headers';
import { checkRateLimit, getRateLimitResponse } from '@/lib/cache';
import { userCollection } from '@/lib/firebase';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';
=======
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { headers } from 'next/headers';
import { checkRateLimit, getRateLimitResponse } from '@/lib/cache';
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
<<<<<<< HEAD
  // Secure with Firebase Auth middleware
  const authResult = await firebaseAuthMiddleware(request);
  if (authResult) return authResult;
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

=======
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
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
<<<<<<< HEAD

=======
    
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
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

<<<<<<< HEAD
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
=======
    // Create uploads directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `upload-${timestamp}.${file.type.split('/')[1]}`;
    const filepath = join(uploadDir, filename);

    // Convert File to Uint8Array
    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);

    // Write file
    await writeFile(filepath, buffer);

    // Return the URL that can be used to access the file
    const url = `/uploads/${filename}`;

    return NextResponse.json({ 
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
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