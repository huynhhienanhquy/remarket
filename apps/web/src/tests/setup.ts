import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node's native channel cannot dispatch jsdom MessageEvents and crosses test
// workers. Tests of cross-tab behavior install an isolated browser-like stub.
Object.defineProperty(window, "BroadcastChannel", { configurable: true, writable: true, value: undefined });

afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia; components use it for responsive logic.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Element.scrollIntoView is used by the chat thread anchor logic.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
