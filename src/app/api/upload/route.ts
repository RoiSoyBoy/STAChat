import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { headers } from 'next/headers';
import { checkRateLimit, getRateLimitResponse } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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