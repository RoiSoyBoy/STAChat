import '@testing-library/jest-dom';

declare global {
  namespace jest {
    interface Matchers<R> {
      // DOM matchers
      toBeInTheDocument(): R;
      toHaveTextContent(text: string): R;
      toBeVisible(): R;
      toBeDisabled(): R;
      toBeEnabled(): R;
      toHaveClass(className: string): R;
      toHaveAttribute(attr: string, value?: string): R;
      toHaveStyle(style: Record<string, any>): R;

      // Jest matchers
      toBe(expected: any): R;
      toBeDefined(): R;
      toBeUndefined(): R;
      toBeTruthy(): R;
      toBeFalsy(): R;
      toBeNull(): R;
      toBeNaN(): R;
      toEqual(expected: any): R;
      toContain(item: any): R;
      toContainEqual(item: any): R;
      toHaveLength(number: number): R;
      toHaveBeenCalled(): R;
      toHaveBeenCalledTimes(number: number): R;
      toHaveBeenCalledWith(...args: any[]): R;
      toHaveBeenLastCalledWith(...args: any[]): R;
      toHaveProperty(keyPath: string | string[], value?: any): R;
      toMatch(regexpOrString: string | RegExp): R;
      toMatchObject(object: Record<string, any>): R;
      toThrow(error?: string | Error | RegExp): R;
      toThrowError(error?: string | Error | RegExp): R;

      // Async matchers
      resolves: Matchers<Promise<R>>;
      rejects: Matchers<Promise<R>>;
    }
  }
} 