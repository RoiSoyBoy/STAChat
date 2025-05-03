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

describe('AdminDashboard', () => {
  const defaultProps = {
    initialUrls: ['https://example.com'],
    initialColor: '#0066cc',
    initialLogo: 'https://example.com/logo.png',
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  it('renders all sections', () => {
    render(<AdminDashboard {...defaultProps} />);
    expect(screen.getByText('צבע ראשי')).toBeInTheDocument();
    expect(screen.getByText('לוגו')).toBeInTheDocument();
    expect(screen.getByText('כתובות URL מורשות')).toBeInTheDocument();
    expect(screen.getByText('העלאת קבצי אימון')).toBeInTheDocument();
  });

  it('validates color contrast', async () => {
    render(<AdminDashboard {...defaultProps} />);
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
    render(<AdminDashboard {...defaultProps} />);
    const urlInput = screen.getByLabelText('הכנס כתובת URL חדשה');
    const addButton = screen.getByLabelText('הוסף כתובת URL');

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
    render(<AdminDashboard {...defaultProps} />);
    const urlInput = screen.getByLabelText('הכנס כתובת URL חדשה');
    const addButton = screen.getByLabelText('הוסף כתובת URL');

    // Try to add the same URL that's already in initialUrls
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
    fireEvent.click(addButton);
    expect(toast.error).toHaveBeenCalledWith('כתובת URL זו כבר קיימת');
  });

  it('handles URL pagination', () => {
    const manyUrls = Array.from({ length: 15 }, (_, i) => `https://example${i}.com`);
    render(<AdminDashboard initialUrls={manyUrls} initialColor="#0066cc" initialLogo="" />);

    // Should show pagination controls
    expect(screen.getByText('עמוד 1 מתוך 2')).toBeInTheDocument();

    // Click next page
    fireEvent.click(screen.getByLabelText('לדף הבא'));
    expect(screen.getByText('עמוד 2 מתוך 2')).toBeInTheDocument();

    // Click previous page
    fireEvent.click(screen.getByLabelText('לדף הקודם'));
    expect(screen.getByText('עמוד 1 מתוך 2')).toBeInTheDocument();
  });

  it('handles file uploads', async () => {
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    const mockResponse = { url: 'https://example.com/uploaded.png' };

    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    render(<AdminDashboard {...defaultProps} />);
    const dropzone = screen.getByLabelText('אזור העלאת לוגו');

    await act(async () => {
      const dataTransfer = {
        files: [file],
        items: [
          {
            kind: 'file',
            type: file.type,
            getAsFile: () => file,
          },
        ],
        types: ['Files'],
      };

      fireEvent.drop(dropzone, { dataTransfer });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('הלוגו הועלה בהצלחה');
    });
  });

  it('validates file uploads', async () => {
    const invalidFile = new File(['dummy content'], 'test.txt', { type: 'text/plain' });

    render(<AdminDashboard {...defaultProps} />);
    const dropzone = screen.getByLabelText('אזור העלאת לוגו');

    await act(async () => {
      const dataTransfer = {
        files: [invalidFile],
        items: [
          {
            kind: 'file',
            type: invalidFile.type,
            getAsFile: () => invalidFile,
          },
        ],
        types: ['Files'],
      };

      fireEvent.drop(dropzone, { dataTransfer });
    });

    expect(toast.error).toHaveBeenCalledWith('קובץ לא תקין: אנא העלה PNG או JPEG בלבד');
  });

  it('handles training data uploads', async () => {
    const pdfFile = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });

    render(<AdminDashboard {...defaultProps} />);
    const dropzone = screen.getByLabelText('אזור העלאת קבצי אימון');

    await act(async () => {
      const dataTransfer = {
        files: [pdfFile],
        items: [
          {
            kind: 'file',
            type: pdfFile.type,
            getAsFile: () => pdfFile,
          },
        ],
        types: ['Files'],
      };

      fireEvent.drop(dropzone, { dataTransfer });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('קבצי האימון עובדו בהצלחה');
    });
  });
}); 