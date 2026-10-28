import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

const TEST_CHART_WIDTH = 900
const TEST_CHART_HEIGHT = 400

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    const contentRect = {
      width: TEST_CHART_WIDTH,
      height: TEST_CHART_HEIGHT,
      top: 0,
      left: 0,
      bottom: TEST_CHART_HEIGHT,
      right: TEST_CHART_WIDTH,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }
    const entry = {
      target,
      contentRect,
      borderBoxSize: [{ inlineSize: TEST_CHART_WIDTH, blockSize: TEST_CHART_HEIGHT }],
      contentBoxSize: [{ inlineSize: TEST_CHART_WIDTH, blockSize: TEST_CHART_HEIGHT }],
      devicePixelContentBoxSize: [
        { inlineSize: TEST_CHART_WIDTH, blockSize: TEST_CHART_HEIGHT },
      ],
    } as unknown as ResizeObserverEntry

    queueMicrotask(() => {
      this.callback([entry], this as unknown as ResizeObserver)
    })
  }

  unobserve(): void {}

  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

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
  })) as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
})
