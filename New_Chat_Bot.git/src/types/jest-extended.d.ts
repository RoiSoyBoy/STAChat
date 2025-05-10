/// <reference types="jest" />
/// <reference types="@testing-library/jest-dom" />

declare namespace jest {
  interface Matchers<R, T = any> {
    // Jest DOM matchers
    toBeInTheDocument(): R;
    toHaveTextContent(text: string | RegExp): R;
    toBeVisible(): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toHaveClass(className: string): R;
    toHaveAttribute(attr: string, value?: string): R;
    toHaveStyle(style: Record<string, any>): R;
    toContainHTML(html: string): R;
    toContainElement(element: HTMLElement | null): R;

    // Jest matchers
    toBe(expected: any): R;
    toBeDefined(): R;
    toBeUndefined(): R;
    toBeTruthy(): R;
    toBeFalsy(): R;
    toBeNull(): R;
    toBeNaN(): R;
    toEqual(expected: any): R;
    toStrictEqual(expected: any): R;
    toContain(item: any): R;
    toContainEqual(item: any): R;
    toHaveLength(number: number): R;
    toHaveProperty(keyPath: string | Array<string>, value?: any): R;
    toMatch(regexpOrString: string | RegExp): R;
    toMatchObject(object: Record<string, any>): R;
    toThrow(error?: string | Error | RegExp): R;
    toThrowError(error?: string | Error | RegExp): R;

    // Jest Mock matchers
    toHaveBeenCalled(): R;
    toHaveBeenCalledTimes(number: number): R;
    toHaveBeenCalledWith(...args: any[]): R;
    toHaveBeenLastCalledWith(...args: any[]): R;
    toHaveBeenNthCalledWith(nthCall: number, ...args: any[]): R;
    toHaveReturned(): R;
    toHaveReturnedTimes(number: number): R;
    toHaveReturnedWith(value: any): R;
    toHaveLastReturnedWith(value: any): R;
    toHaveNthReturnedWith(nthCall: number, value: any): R;

    // Async matchers
    resolves: Matchers<Promise<R>, T>;
    rejects: Matchers<Promise<R>, T> & {
      toThrow(error?: string | Error | RegExp): Promise<R>;
      toThrowError(error?: string | Error | RegExp): Promise<R>;
    };
  }
} 