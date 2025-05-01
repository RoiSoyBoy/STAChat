import '@testing-library/jest-dom'

// Mock window.matchMedia
window.matchMedia = window.matchMedia || function() {
  return {
    matches: false,
    addListener: function() {},
    removeListener: function() {},
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() {},
  };
};

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
}

window.IntersectionObserver = MockIntersectionObserver;

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

// Mock ResizeObserver
class MockResizeObserver {
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
}

window.ResizeObserver = MockResizeObserver;

// Setup Jest DOM environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Extend Jest matchers
expect.extend({
  toBeInTheDocument(received) {
    const pass = Boolean(received && received.ownerDocument && received.ownerDocument.contains(received));
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in the document`,
    };
  },
  toHaveBeenCalledWith(...args) {
    const received = this.actual;
    const pass = received && received.mock && received.mock.calls.some(call =>
      call.length === args.length && call.every((arg, i) => this.equals(arg, args[i]))
    );
    return {
      pass,
      message: () => `expected ${received} ${pass ? 'not ' : ''}to have been called with ${args.join(', ')}`,
    };
  },
  toBeTruthy() {
    const pass = Boolean(this.actual);
    return {
      pass,
      message: () => `expected ${this.actual} ${pass ? 'not ' : ''}to be truthy`,
    };
  },
  toBe(expected) {
    const pass = Object.is(this.actual, expected);
    return {
      pass,
      message: () => `expected ${this.actual} ${pass ? 'not ' : ''}to be ${expected}`,
    };
  },
  toContain(expected) {
    const received = this.actual;
    const pass = received && typeof received === 'string' 
      ? received.includes(expected)
      : Array.isArray(received)
      ? received.includes(expected)
      : false;
    return {
      pass,
      message: () => `expected ${received} ${pass ? 'not ' : ''}to contain ${expected}`,
    };
  },
}); 