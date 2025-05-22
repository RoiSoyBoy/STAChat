export {};
import React from "react";
import { render, screen, fireEvent, waitFor } from "../test-utils";
import { act } from "react-dom/test-utils";
import { FloatingChat } from "@/components/ChatWidget"; // Import the correct component
import { toast } from "react-toastify";
import "@testing-library/jest-dom";

// Mock react-toastify
jest.mock("react-toastify", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ response: "Mock response", sources: [] }),
    text: () =>
      Promise.resolve(
        JSON.stringify({ response: "Mock response", sources: [] })
      ), // Add text() method if needed by SSE
    body: {
      getReader: () => {
        let done = false;
        return {
          read: () => {
            if (!done) {
              done = true;
              // Simulate SSE data chunk
              const encoder = new TextEncoder();
              return Promise.resolve({
                value: encoder.encode(
                  'data: {"response": "Mock stream chunk"}\n\n'
                ),
                done: false,
              });
            } else {
              return Promise.resolve({ value: undefined, done: true });
            }
          },
        };
      },
    },
    headers: new Headers({
      "Content-Type": "text/event-stream", // Simulate SSE header
    }),
  })
) as jest.Mock;

describe("ChatWidget", () => {
  const defaultProps = {
    greeting: "שלום! איך אפשר לעזור?",
    messages: [],
    setMessages: jest.fn(),
    clientId: "test-client-id", // Added clientId based on HEAD context
    primaryColor: "#0066cc", // Added primaryColor based on HEAD context
    translations: {
      // Added translations based on HEAD context
      title: "צ'אט תמיכה",
      inputPlaceholder: "הקלד/י הודעה...",
      sendButton: "שלח",
      errorMessage: "אירעה שגיאה",
      closeChat: "סגור צ'אט", // Assuming this uses apostrophe, verify if needed
      openChat: "פתח צ׳אט", // Changed to Geresh to match component
      poweredBy: "מופעל על ידי",
      sources: "מקורות",
      typeMessage: "הקלד/י הודעה...",
      send: "שלח",
    },
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    defaultProps.setMessages.mockClear();
    (global.fetch as jest.Mock).mockClear();
    // Provide the default mock implementation for fetch
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: "Mock response", sources: [] }),
        text: () =>
          Promise.resolve(
            JSON.stringify({ response: "Mock response", sources: [] })
          ),
        body: {
          getReader: () => {
            let done = false;
            return {
              read: () => {
                if (!done) {
                  done = true;
                  const encoder = new TextEncoder();
                  return Promise.resolve({
                    value: encoder.encode(
                      'data: {"response": "Mock stream chunk"}\n\n'
                    ),
                    done: false,
                  });
                } else {
                  return Promise.resolve({ value: undefined, done: true });
                }
              },
            };
          },
        },
        headers: new Headers({ "Content-Type": "text/event-stream" }),
      })
    );
  });

  it("renders the chat button when closed", () => {
    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    expect(
      screen.getByLabelText(defaultProps.translations.openChat)
    ).toBeInTheDocument();
  });

  it("opens the chat window when clicking the button", () => {
    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    fireEvent.click(screen.getByLabelText(defaultProps.translations.openChat));
    expect(screen.getByLabelText("חלון צ'אט")).toBeInTheDocument(); // Assuming a label for the window
    expect(screen.getByText(defaultProps.greeting)).toBeInTheDocument();
  });

  it("sends a message and displays response (non-streaming)", async () => {
    // Ensure fetch mock returns non-streaming response for this test
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            response: "Standard mock response",
            sources: ["sourceA"],
          }),
        headers: new Headers({ "Content-Type": "application/json" }), // Not SSE
      })
    );

    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    fireEvent.click(screen.getByLabelText(defaultProps.translations.openChat));

    const input = screen.getByPlaceholderText(
      defaultProps.translations.inputPlaceholder
    );
    const sendButton = screen.getByText(defaultProps.translations.sendButton);

    await act(async () => {
      fireEvent.change(input, { target: { value: "Test message" } });
      fireEvent.click(sendButton);
    });

    // Check if user message is added optimistically
    expect(defaultProps.setMessages).toHaveBeenCalledWith(expect.any(Function));
    // Call the state updater function to simulate optimistic update
    const setStateFn = defaultProps.setMessages.mock.calls[0][0];
    const updatedMessages = setStateFn([]); // Pass initial state
    expect(updatedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Test message" }),
      ])
    );

    // Wait for the fetch to complete and response to be processed
    await waitFor(() => {
      // Check if the final state update includes the assistant response
      expect(defaultProps.setMessages).toHaveBeenCalledTimes(2); // Initial + final
      const finalSetStateFn = defaultProps.setMessages.mock.calls[1][0];
      const finalMessages = finalSetStateFn([
        { role: "user", content: "Test message" },
      ]); // Simulate state before final update
      expect(finalMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "Test message" }),
          expect.objectContaining({
            role: "assistant",
            content: "Standard mock response",
            sources: ["sourceA"],
          }),
        ])
      );
    });
  });

  it("sends a message and displays response (streaming)", async () => {
    // Fetch mock is already set up for streaming in beforeEach

    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    fireEvent.click(screen.getByLabelText(defaultProps.translations.openChat));

    const input = screen.getByPlaceholderText(
      defaultProps.translations.inputPlaceholder
    );
    const sendButton = screen.getByText(defaultProps.translations.sendButton);

    await act(async () => {
      fireEvent.change(input, { target: { value: "Streaming test" } });
      fireEvent.click(sendButton);
    });

    // Check optimistic user message update
    expect(defaultProps.setMessages).toHaveBeenCalledWith(expect.any(Function));
    const setStateFn = defaultProps.setMessages.mock.calls[0][0];
    const updatedMessages = setStateFn([]);
    expect(updatedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Streaming test" }),
      ])
    );

    // Wait for streaming response chunks
    await waitFor(() => {
      // Check intermediate state update with streaming chunk
      expect(defaultProps.setMessages).toHaveBeenCalledTimes(2); // Optimistic + first chunk
      const streamSetStateFn = defaultProps.setMessages.mock.calls[1][0];
      const streamMessages = streamSetStateFn([
        { role: "user", content: "Streaming test" },
      ]);
      expect(streamMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "Streaming test" }),
          expect.objectContaining({
            role: "assistant",
            content: "Mock stream chunk",
            sources: [],
          }), // Check streamed content
        ])
      );
    });

    // Potentially wait longer or check for a final state if the stream completion triggers another update
    // await waitFor(() => {
    //   expect(defaultProps.setMessages).toHaveBeenCalledTimes(3); // Optimistic + chunk + final (if applicable)
    // });
  });

  it("handles network errors gracefully", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("Network error")
    );

    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    fireEvent.click(screen.getByLabelText(defaultProps.translations.openChat));

    const input = screen.getByPlaceholderText(
      defaultProps.translations.inputPlaceholder
    );
    const sendButton = screen.getByText(defaultProps.translations.sendButton);

    await act(async () => {
      fireEvent.change(input, { target: { value: "Error test" } });
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        defaultProps.translations.errorMessage
      );
      // Check that the loading state is reset (e.g., button is enabled)
      expect(sendButton).not.toBeDisabled();
      // Check that the message state reflects the error (optional, depends on implementation)
      expect(defaultProps.setMessages).toHaveBeenCalledTimes(2); // Optimistic + error state
      const errorSetStateFn = defaultProps.setMessages.mock.calls[1][0];
      const errorMessages = errorSetStateFn([
        { role: "user", content: "Error test" },
      ]);
      expect(errorMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "Error test" }),
          // Check if an error message is added or if the assistant message is just missing
        ])
      );
    });
  });

  it("handles API errors gracefully", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    fireEvent.click(screen.getByLabelText(defaultProps.translations.openChat));

    const input = screen.getByPlaceholderText(
      defaultProps.translations.inputPlaceholder
    );
    const sendButton = screen.getByText(defaultProps.translations.sendButton);

    await act(async () => {
      fireEvent.change(input, { target: { value: "API error test" } });
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        defaultProps.translations.errorMessage
      );
      expect(sendButton).not.toBeDisabled();
      // Check message state after API error
      expect(defaultProps.setMessages).toHaveBeenCalledTimes(2);
      const errorSetStateFn = defaultProps.setMessages.mock.calls[1][0];
      const errorMessages = errorSetStateFn([
        { role: "user", content: "API error test" },
      ]);
      expect(errorMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "API error test" }),
        ])
      );
    });
  });

  it("disables input and button while loading", async () => {
    // Make fetch take longer to resolve
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    response: "Delayed response",
                    sources: [],
                  }),
                headers: new Headers({ "Content-Type": "application/json" }),
              }),
            100
          )
        )
    );

    render(React.createElement(FloatingChat, defaultProps)); // Use FloatingChat
    fireEvent.click(screen.getByLabelText(defaultProps.translations.openChat));

    const input = screen.getByPlaceholderText(
      defaultProps.translations.inputPlaceholder
    );
    const sendButton = screen.getByText(defaultProps.translations.sendButton);

    await act(async () => {
      fireEvent.change(input, { target: { value: "Loading test" } });
      fireEvent.click(sendButton);
    });

    // Check immediately after click
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(input).not.toBeDisabled();
      expect(sendButton).not.toBeDisabled();
    });
  });

  // Add tests for closing the widget, initial messages, etc.
});
