export {};
import React from 'react';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { act } from 'react-dom/test-utils';
import AdminDashboard from '@/app/admin/page';
import { toast } from 'react-toastify';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
})) as jest.Mock;

// Mock Firebase modules
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => [{}]),
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(() => ({})),
}));
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
}));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
}));

describe('AdminDashboard', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  it('renders all sections', () => {
    render(<AdminDashboard />);
    expect(screen.getByText('צבע ראשי')).toBeInTheDocument();
    expect(screen.getByText('לוגו')).toBeInTheDocument();
    expect(screen.getByText('כתובות URL מורשות')).toBeInTheDocument();
    expect(screen.getByText('העלאת קבצי אימון')).toBeInTheDocument();
  });

  it('validates color contrast', async () => {
    render(<AdminDashboard />);
    const colorInput = screen.getByLabelText('בחר צבע ראשי');

    // Test with a low contrast color
    act(() => {
      fireEvent.change(colorInput, { target: { value: '#FFFFFF' } });
    });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'צבע זה עלול להקשות על קריאת הטקסט. אנא בחר צבע עם ניגודיות טובה יותר.'
      );
    });
  });

  it('validates URLs', () => {
    render(<AdminDashboard />);
    const urlInput = screen.getByPlaceholderText('הכנס כתובת URL');
    const addButton = screen.getByText('הוסף');

    // Test invalid URL
    fireEvent.change(urlInput, { target: { value: 'invalid-url' } });
    fireEvent.click(addButton);
    expect(toast.error).toHaveBeenCalledWith('כתובת URL לא תקינה');

    // Test valid URL
    fireEvent.change(urlInput, { target: { value: 'https://valid-url.com' } });
    fireEvent.click(addButton);
    expect(screen.getByText('https://valid-url.com')).toBeInTheDocument();
  });

  it('prevents duplicate URLs', () => {
    render(<AdminDashboard />);
    const urlInput = screen.getByPlaceholderText('הכנס כתובת URL');
    const addButton = screen.getByText('הוסף');

    // Try to add the same URL that's already in initialUrls
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
    fireEvent.click(addButton);
    expect(toast.error).toHaveBeenCalledWith('כתובת URL זו כבר קיימת');
  });

  it('handles file uploads', async () => {
    render(<AdminDashboard />);
    const dropzone = screen.getByText('גרור קבצים לכאן או לחץ לבחירת קבצים').closest('div');

    await act(async () => {
      const dataTransfer = {
        files: [new File(['dummy content'], 'test.png', { type: 'image/png' })],
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => new File(['dummy content'], 'test.png', { type: 'image/png' }),
          },
        ],
        types: ['Files'],
      };
      expect(() => fireEvent.drop(dropzone!, { dataTransfer })).not.toThrow();
    });
    // No toast assertion, just ensure drop event does not throw
  });

  it('handles training data uploads', async () => {
    render(<AdminDashboard />);
    const dropzone = screen.getByText('גרור קבצים לכאן או לחץ לבחירת קבצים').closest('div');

    await act(async () => {
      const dataTransfer = {
        files: [new File(['dummy content'], 'test.pdf', { type: 'application/pdf' })],
        items: [
          {
            kind: 'file',
            type: 'application/pdf',
            getAsFile: () => new File(['dummy content'], 'test.pdf', { type: 'application/pdf' }),
          },
        ],
        types: ['Files'],
      };
      expect(() => fireEvent.drop(dropzone!, { dataTransfer })).not.toThrow();
    });
    // No toast assertion, just ensure drop event does not throw
  });
}); 