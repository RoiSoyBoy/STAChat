import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const SETTINGS_FILE = join(process.cwd(), 'settings.json');
const UPLOADS_DIR = join(process.cwd(), 'public/uploads');

// Ensure directories exist
try {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (error) {
  console.error('Error creating uploads directory:', error);
}

// Helper to ensure settings file exists
async function ensureSettingsFile() {
  const defaultSettings = {
    primaryColor: '#0066cc',
    greeting: 'שלום! איך אני יכול/ה לעזור לך היום?',
    logoUrl: '',
    urls: []
  };

  try {
    if (!existsSync(SETTINGS_FILE)) {
      await writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Error ensuring settings file:', error);
  }
}

export async function GET() {
  try {
    await ensureSettingsFile();
    const settings = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'));
    return NextResponse.json(settings);
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
    await ensureSettingsFile();
    
    // Read current settings
    const currentSettings = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'));
    
    // Update settings
    const newSettings = {
      ...currentSettings,
      ...updates
    };
    
    // Validate color format
    if (updates.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(updates.primaryColor)) {
      return NextResponse.json(
        { error: 'Invalid color format' },
        { status: 400 }
      );
    }
    
    // Write updated settings
    await writeFile(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    
    return NextResponse.json({ success: true, settings: newSettings });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
} 