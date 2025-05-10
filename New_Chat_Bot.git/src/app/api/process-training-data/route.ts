import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // For now, we'll return mock processed content
    // In production, you would use a service like AWS Lambda or Firebase Functions
    // to handle file processing
    return NextResponse.json({
      type: file.name.split('.').pop(),
      content: 'Mock processed content for ' + file.name,
      filename: file.name,
    });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    );
  }
} 