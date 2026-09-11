const { captureFrame, extractFrames } = require('../src/core/frameExtractor');

function createMockCanvas() {
  const ctx = { drawImage: jest.fn() };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: jest.fn(() => 'data:image/jpeg;base64,mockdata'),
    __ctx: ctx
  };
}

function createMockVideo(overrides) {
  const listeners = {};
  return {
    videoWidth: 1280,
    videoHeight: 720,
    duration: 3,
    paused: true,
    currentTime: 0,
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
    removeEventListener(event) {
      delete listeners[event];
    },
    set currentTimeAndFireSeek(value) {
      this.currentTime = value;
      if (listeners.seeked) listeners.seeked();
    },
    play: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('frameExtractor.captureFrame', () => {
  let originalDocument;

  beforeEach(() => {
    originalDocument = global.document;
    global.document = {
      createElement: jest.fn(() => createMockCanvas())
    };
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  test('returns null when document is unavailable', () => {
    global.document = undefined;
    expect(captureFrame(createMockVideo(), {})).toBeNull();
  });

  test('returns null when the video has no dimensions yet', () => {
    expect(captureFrame(createMockVideo({ videoWidth: 0 }), {})).toBeNull();
  });

  test('scales down the canvas to maxWidth while preserving aspect ratio', () => {
    const canvas = createMockCanvas();
    global.document.createElement = jest.fn(() => canvas);
    const video = createMockVideo({ videoWidth: 1280, videoHeight: 720 });

    const dataUrl = captureFrame(video, { maxWidth: 640 });

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(canvas.__ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(dataUrl).toBe('data:image/jpeg;base64,mockdata');
  });

  test('does not upscale when the video is smaller than maxWidth', () => {
    const canvas = createMockCanvas();
    global.document.createElement = jest.fn(() => canvas);
    const video = createMockVideo({ videoWidth: 320, videoHeight: 180 });

    captureFrame(video, { maxWidth: 640 });

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
  });
});

describe('frameExtractor.extractFrames', () => {
  let originalDocument;

  beforeEach(() => {
    originalDocument = global.document;
    global.document = {
      createElement: jest.fn(() => createMockCanvas())
    };
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  test('returns an empty array when document is unavailable', async () => {
    global.document = undefined;
    const frames = await extractFrames(createMockVideo(), {});
    expect(frames).toEqual([]);
  });

  test('does not hang when the browser never fires a "seeked" event', async () => {
    jest.useFakeTimers();
    const video = createMockVideo({ duration: 0, paused: true });
    // Never invoke the 'seeked' handler, simulating a no-op seek.
    video.addEventListener = jest.fn();
    video.removeEventListener = jest.fn();

    const promise = extractFrames(video, { start: 0, end: 0, intervalSeconds: 1, maxWidth: 640 });
    await jest.advanceTimersByTimeAsync(1000);
    const frames = await promise;

    expect(frames).toHaveLength(1);
    jest.useRealTimers();
  });

  test('samples one frame per interval across the duration and restores playback state', async () => {
    const video = createMockVideo({ duration: 2, paused: false, currentTime: 0.5 });
    // Simulate the browser firing "seeked" as soon as currentTime is set.
    let seekedHandler;
    video.addEventListener = jest.fn((event, handler) => {
      if (event === 'seeked') seekedHandler = handler;
    });
    video.removeEventListener = jest.fn();
    Object.defineProperty(video, 'currentTime', {
      get() {
        return this._currentTime;
      },
      set(value) {
        this._currentTime = value;
        if (seekedHandler) seekedHandler();
      },
      configurable: true
    });
    video._currentTime = 0.5;

    const frames = await extractFrames(video, { start: 0, end: 2, intervalSeconds: 1, maxWidth: 640 });

    expect(frames).toHaveLength(3); // t = 0, 1, 2
    expect(frames.map((f) => f.timestamp)).toEqual([0, 1, 2]);
    expect(frames[0].dataUrl).toBe('data:image/jpeg;base64,mockdata');
    expect(video.currentTime).toBe(0.5); // restored to original time
    expect(video.play).toHaveBeenCalled(); // was playing before, so resumed
  });

  test('falls back to a safe interval instead of looping forever when intervalSeconds is 0', async () => {
    const video = createMockVideo({ duration: 2, paused: true });
    let seekedHandler;
    video.addEventListener = jest.fn((event, handler) => {
      if (event === 'seeked') seekedHandler = handler;
    });
    video.removeEventListener = jest.fn();
    Object.defineProperty(video, 'currentTime', {
      get() {
        return this._currentTime;
      },
      set(value) {
        this._currentTime = value;
        if (seekedHandler) seekedHandler();
      },
      configurable: true
    });
    video._currentTime = 0;

    const frames = await extractFrames(video, { start: 0, end: 2, intervalSeconds: 0, maxWidth: 640 });

    expect(frames).toHaveLength(3); // falls back to interval of 1 second: t = 0, 1, 2
  });

  test('caps samples when duration is infinite and end is omitted', async () => {
    const video = createMockVideo({ duration: Infinity, paused: true });
    let seekedHandler;
    video.addEventListener = jest.fn((event, handler) => {
      if (event === 'seeked') seekedHandler = handler;
    });
    video.removeEventListener = jest.fn();
    Object.defineProperty(video, 'currentTime', {
      get() {
        return this._currentTime;
      },
      set(value) {
        this._currentTime = value;
        if (seekedHandler) seekedHandler();
      },
      configurable: true
    });
    video._currentTime = 0;

    const frames = await extractFrames(video, {
      start: 0,
      intervalSeconds: 1,
      maxWidth: 640,
      maxSamples: 3
    });

    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.timestamp)).toEqual([0, 1, 2]);
  });
});
