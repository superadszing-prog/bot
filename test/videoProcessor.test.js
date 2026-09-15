const { VideoProcessor } = require('../src/core/videoProcessor');

function createMockCanvas() {
  const ctx = {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    set filter(value) {},
    set fillStyle(value) {},
    set font(value) {},
    set textAlign(value) {},
    set imageSmoothingEnabled(value) {}
  };
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    __ctx: ctx
  };
}

function createMockVideo(overrides) {
  return {
    videoWidth: 320,
    videoHeight: 240,
    clientWidth: 320,
    clientHeight: 240,
    currentTime: 0,
    parentElement: null,
    ...overrides
  };
}

function createMockParent() {
  return {
    children: [],
    style: {},
    appendChild(node) {
      node.parentElement = this;
      this.children.push(node);
    },
    removeChild(node) {
      this.children = this.children.filter((child) => child !== node);
      node.parentElement = null;
    }
  };
}

describe('VideoProcessor', () => {
  let originalDocument;
  let originalWindow;

  beforeEach(() => {
    originalDocument = global.document;
    originalWindow = global.window;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  test('trim ranges mark the corresponding timestamps as trimmed', () => {
    const processor = new VideoProcessor(createMockVideo());
    processor.addTrimRange(5, 10);
    expect(processor._isTrimmed(0)).toBe(false);
    expect(processor._isTrimmed(5)).toBe(true);
    expect(processor._isTrimmed(7)).toBe(true);
    expect(processor._isTrimmed(10)).toBe(true);
    expect(processor._isTrimmed(11)).toBe(false);
  });

  test('setRegions replaces the tracked regions array', () => {
    const processor = new VideoProcessor(createMockVideo());
    expect(processor.regions).toEqual([]);
    processor.setRegions([{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, method: 'blur' }]);
    expect(processor.regions).toHaveLength(1);
    processor.setRegions(null);
    expect(processor.regions).toEqual([]);
  });

  test('_renderFrame blacks out the frame while within a trim range', () => {
    const canvas = createMockCanvas();
    const video = createMockVideo({ currentTime: 6 });
    const processor = new VideoProcessor(video);
    processor.canvas = canvas;
    processor.ctx = canvas.__ctx;
    processor.addTrimRange(5, 10);

    processor._renderFrame();

    expect(canvas.__ctx.fillRect).toHaveBeenCalled();
    expect(canvas.__ctx.fillText).toHaveBeenCalledWith('ส่วนนี้ถูกตัดออก', expect.any(Number), expect.any(Number));
  });

  test('_applyRegionEffect draws a blurred region by default', () => {
    const canvas = createMockCanvas();
    canvas.width = 320;
    canvas.height = 240;
    const video = createMockVideo();
    const processor = new VideoProcessor(video);
    processor.canvas = canvas;
    processor.ctx = canvas.__ctx;

    processor._applyRegionEffect({ x: 0, y: 0, width: 0.5, height: 0.5, method: 'blur' });

    expect(canvas.__ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 160, 120, 0, 0, 160, 120);
  });

  test('stop removes mounted overlay canvas and clears references', () => {
    const canvas = createMockCanvas();
    const parent = createMockParent();
    const video = createMockVideo({ parentElement: parent });
    global.document = {
      createElement: jest.fn(() => canvas)
    };
    global.window = {
      getComputedStyle: jest.fn(() => ({ position: 'relative' }))
    };
    global.requestAnimationFrame = jest.fn(() => 1);
    global.cancelAnimationFrame = jest.fn();

    const processor = new VideoProcessor(video);
    processor.start();
    expect(parent.children).toContain(canvas);

    processor.stop();

    expect(parent.children).not.toContain(canvas);
    expect(processor.canvas).toBeNull();
    expect(processor.ctx).toBeNull();
  });
});
