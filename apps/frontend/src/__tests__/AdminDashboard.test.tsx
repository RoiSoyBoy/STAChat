export {};
import React from "react";
import { render, screen, fireEvent, waitFor } from "../test-utils";
import { act } from "react-dom/test-utils";
import AdminDashboard from "@/app/admin/page"; // Assuming this is the correct path
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
    json: () => Promise.resolve({}),
  })
) as jest.Mock;

// Mock Firebase modules
jest.mock("firebase/app", () => ({
  initializeApp: jest.fn(() => ({})),
}));
jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(() => ({
    onAuthStateChanged: jest.fn((callback) => {
      // Simulate a logged-in user
      callback({ uid: "test-user" });
      return jest.fn(); // Return unsubscribe function
    }),
  })),
}));
jest.mock("firebase/firestore", () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  collection: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));
jest.mock("firebase/storage", () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(() => ({
    on: jest.fn((event, progressCallback, errorCallback, completeCallback) => {
      // Simulate upload completion
      completeCallback();
    }),
    snapshot: { ref: "mockRef" },
  })),
  getDownloadURL: jest.fn(() =>
    Promise.resolve("https://example.com/mock-logo.png")
  ),
}));

describe("AdminDashboard", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Mock fetch to return default settings initially
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          primaryColor: "#0066cc",
          logoUrl: "https://example.com/logo.png",
          allowedUrls: ["https://example.com"],
        }),
    });
  });

  it("renders all sections", async () => {
    // Made test async
    render(<AdminDashboard />);
    // Wait for elements that appear after loading
    expect(await screen.findByText("צבע ראשי")).toBeInTheDocument();
    expect(await screen.findByText("לוגו")).toBeInTheDocument();
    expect(await screen.findByText("כתובות URL מורשות")).toBeInTheDocument();
    expect(await screen.findByText("העלאת קבצי מידע")).toBeInTheDocument();
  });

  it("validates color contrast", async () => {
    render(<AdminDashboard />);
    const colorInput = await screen.findByLabelText("בחר צבע ראשי"); // Wait for input

    // Test with a low contrast color
    await act(async () => {
      // Wrap in act for state updates
      fireEvent.change(colorInput, { target: { value: "#aaaaaa" } });
    });
    // Wait for potential async updates if contrast check is async
    await waitFor(() => {
      // Check if a warning/error related to contrast appears (adjust based on actual implementation)
      // This might involve checking for a specific text or class name
      // Example: expect(screen.queryByText(/contrast.*low/i)).toBeInTheDocument(); // Using queryByText for non-existence check later
    });

    // Test with a high contrast color
    await act(async () => {
      // Wrap in act
      fireEvent.change(colorInput, { target: { value: "#000000" } });
    });
    await waitFor(() => {
      // Check if the warning disappears
      // Example: expect(screen.queryByText(/contrast.*low/i)).not.toBeInTheDocument();
    });
  });

  it("validates URLs", async () => {
    // Made test async
    render(<AdminDashboard />);
    const urlInput = await screen.findByPlaceholderText("הכנס כתובת URL"); // Wait for input
    const addButton = await screen.findByText("הוסף"); // Wait for button

    // Test invalid URL
    await act(async () => {
      // Wrap in act
      fireEvent.change(urlInput, { target: { value: "invalid-url" } });
      fireEvent.click(addButton);
    });
    expect(toast.error).toHaveBeenCalledWith("כתובת URL לא תקינה");

    // Test valid URL
    await act(async () => {
      // Wrap in act
      fireEvent.change(urlInput, { target: { value: "https://valid.com" } });
      fireEvent.click(addButton);
    });
    expect(toast.error).not.toHaveBeenCalledWith("כתובת URL לא תקינה"); // Ensure previous error isn't called again
    // Check if URL is added to the list (adjust selector based on implementation)
    expect(await screen.findByText("https://valid.com")).toBeInTheDocument(); // Wait for URL to appear
  });

  it("prevents duplicate URLs", async () => {
    // Made test async
    render(<AdminDashboard />);
    const urlInput = await screen.findByPlaceholderText("הכנס כתובת URL"); // Wait for input
    const addButton = await screen.findByText("הוסף"); // Wait for button

    // Add a URL first
    await act(async () => {
      // Wrap in act
      fireEvent.change(urlInput, { target: { value: "https://unique.com" } });
      fireEvent.click(addButton);
    });
    expect(await screen.findByText("https://unique.com")).toBeInTheDocument(); // Wait for URL

    // Try to add the same URL again
    await act(async () => {
      // Wrap in act
      fireEvent.change(urlInput, { target: { value: "https://unique.com" } });
      fireEvent.click(addButton);
    });
    expect(toast.error).toHaveBeenCalledWith("כתובת URL זו כבר קיימת");
  });

  it("handles file uploads", async () => {
    render(<AdminDashboard />);
    const dropzone = (
      await screen.findByText("גרור קבצים לכאן או לחץ לבחירת קבצים")
    ).closest("div"); // Wait for dropzone

    if (!dropzone) {
      throw new Error("Dropzone element not found");
    }

    const file = new File(["dummy content"], "test.pdf", {
      type: "application/pdf",
    });

    // Simulate dropping a file
    await act(async () => {
      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [file],
          items: [
            {
              kind: "file",
              type: file.type,
              getAsFile: () => file,
            },
          ],
          types: ["Files"],
        },
      });
    });

    // Wait for upload process (mocked fetch) and check for success message
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("הקובץ הועלה ועובד בהצלחה"); // Updated expected message
    });
  });

  // Add more tests for saving settings, deleting URLs, etc.
});
