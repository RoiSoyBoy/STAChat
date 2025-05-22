import DOMPurify from 'isomorphic-dompurify';

export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input.trim());
}

export function validateMessage(message: string): { isValid: boolean; error?: string } {
  if (!message || message.trim().length === 0) {
    return { isValid: false, error: 'Message cannot be empty' };
  }

  if (message.length > 1000) {
    return { isValid: false, error: 'Message is too long (max 1000 characters)' };
  }

  return { isValid: true };
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateColorContrast(color: string): boolean {
  // Simple validation - ensure it's a valid hex color
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexColorRegex.test(color);
}

export function validateFileUpload(file: File): { isValid: boolean; error?: string } {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/png'];

  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'Invalid file type: please upload PNG or JPEG only' };
  }

  if (file.size > maxSize) {
    return { isValid: false, error: 'File is too large: maximum size is 5MB' };
  }

  return { isValid: true };
}
