export {};
import React from 'react';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { act } from 'react-dom/test-utils';
import { ChatWidget } from '@/components/ChatWidget';
import { toast } from 'react-toastify';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
})) as jest.Mock;

describe('ChatWidget', () => {
  const defaultProps = {
    greeting: 'שלום! איך אפשר לעזור?',
    messages: [],
    setMessages: jest.fn(),
    translations: {
      typeMessage: 'הקלד/י הודעה...',
      send: 'שלח',
    },
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  it('renders the chat button when closed', () => {
    render(React.createElement(ChatWidget, defaultProps));
    expect(screen.getByLabelText('פתח צ\'אט')).toBeInTheDocument();
  });

  it('opens the chat window when clicking the button', () => {
    render(React.createElement(ChatWidget, defaultProps));
    fireEvent.click(screen.getByLabelText('פתח צ\'אט'));
    expect(screen.getByLabelText('חלון צ\'אט')).toBeInTheDocument();
  });

  it('loads initial messages on mount', async () => {
    const mockMessages = {
      messages: [
        {
          id: '1',
          content: 'Hello',
          role: 'user',
          timestamp: Date.now(),
        },
        {
          id: '2',
          content: 'Hi there!',
          role: 'assistant',
          timestamp: Date.now() + 1,
        },
      ],
      hasMore: false,
    };

    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      })
    );

    render(React.createElement(ChatWidget, defaultProps));
    fireEvent.click(screen.getByLabelText('פתח צ\'אט'));

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });
  });

  it('handles message sending', async () => {
    const mockResponse = {
      response: 'I can help you with that!',
    };

    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ messages: [], hasMore: false }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
    });

    render(React.createElement(ChatWidget, defaultProps));
    fireEvent.click(screen.getByLabelText('פתח צ\'אט'));

    const input = screen.getByLabelText('תיבת טקסט להודעה');
    const sendButton = screen.getByLabelText('שלח הודעה');

    fireEvent.change(input, { target: { value: 'Can you help me?' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Can you help me?')).toBeInTheDocument();
      expect(screen.getByText('I can help you with that!')).toBeInTheDocument();
    });
  });

  it('handles network errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(React.createElement(ChatWidget, defaultProps));
    fireEvent.click(screen.getByLabelText('פתח צ\'אט'));

    const input = screen.getByLabelText('תיבת טקסט להודעה');
    const sendButton = screen.getByLabelText('שלח הודעה');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('שגיאה בשליחת ההודעה, אנא נסה שוב');
    });
  });

  it('loads more messages on scroll to top', async () => {
    const initialMessages = {
      messages: [
        {
          id: '1',
          content: 'First message',
          role: 'user',
          timestamp: Date.now(),
        },
      ],
      hasMore: true,
    };

    const moreMessages = {
      messages: [
        {
          id: '2',
          content: 'Earlier message',
          role: 'user',
          timestamp: Date.now() - 1000,
        },
      ],
      hasMore: false,
    };

    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(initialMessages),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(moreMessages),
        })
      );

    render(React.createElement(ChatWidget, defaultProps));
    fireEvent.click(screen.getByLabelText('פתח צ\'אט'));

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument();
    });

    const chatContainer = screen.getByRole('dialog').querySelector('.overflow-y-auto');
    expect(chatContainer).toBeTruthy();

    act(() => {
      if (chatContainer) {
        fireEvent.scroll(chatContainer, { target: { scrollTop: 0 } });
      }
    });

    await waitFor(() => {
      expect(screen.getByText('Earlier message')).toBeInTheDocument();
    });
  });

  it('sanitizes input before sending', async () => {
    const mockResponse = {
      response: 'Safe response',
    };

    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ messages: [], hasMore: false }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
    });

    render(React.createElement(ChatWidget, defaultProps));
    fireEvent.click(screen.getByLabelText('פתח צ\'אט'));

    const input = screen.getByLabelText('תיבת טקסט להודעה');
    const sendButton = screen.getByLabelText('שלח הודעה');

    const unsafeInput = '<script>alert("xss")</script>Hello';
    fireEvent.change(input, { target: { value: unsafeInput } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      const messages = screen.getAllByRole('article');
      const lastMessage = messages[messages.length - 2]; // User message
      expect(lastMessage.innerHTML).not.toContain('<script>');
    });
  });
}); 