export type RenderFunc = (dt: number) => void;

export type RenderOptions = {
  /**
   * The target FPS. If animation frame is faster, it will be slowed down. If
   * not specified, then there's no limit other than the animation frame.
   */
  fps?: number;
};

type RenderObject = {
  /**
   * The actual callback to run.
   */
  callback: RenderFunc;

  /**
   * Calculated from FPS to avoid calculating it over and over.
   */
  msPerFrame: number;

  /**
   * The last frame's timestamp in ms for this callback.
   */
  lastFrameTime: number;
};

export type ManagedAnimationFrameMetrics = {
  /**
   * The last frame's timestamp in ms
   */
  lastFrameTime: number;

  /**
   * The last frame's duration. This is calculated as the amount of time passed
   * since the last frame rendering started. This includes both the time it took
   * the render loop function to run and the time we waited until the next
   * frame. This means it is bounded minimally by the animation loop frame rate.
   *
   * Can be useful to calculate the FPS
   */
  lastFrameDuration: number;

  /**
   * This is the total amount of time for all callbacks to run in the last
   * frame. If a callback didn't run in the last frame because, it won't
   * register in this number.
   *
   * This is synchronized with lastFrameDuration so can be used to calculate
   * a load percentage.
   */
  lastFrameAllCallbacksDuration: number;

  /**
   * This is the total duration for all callbacks to run in the current frame.
   */
  frameAllCallbacksDuration: number;

  /**
   * This is the last callback durations for the individual callbacks.
   */
  callbackDurations: Map<string, number>;
};

const renderObjects: Map<RenderFunc, RenderObject> = new Map();
let animationHandle: ReturnType<typeof requestAnimationFrame> | undefined;

const _metrics: ManagedAnimationFrameMetrics = {
  lastFrameTime: 0,
  lastFrameDuration: 0,
  lastFrameAllCallbacksDuration: 0,
  frameAllCallbacksDuration: 0,
  callbackDurations: new Map(),
};

export function runOnManagedAnimationFrame(callback: RenderFunc, { fps }: Readonly<RenderOptions> = {}): void {
  if (renderObjects.has(callback)) {
    console.warn("render callback already running, please cancel it first before making changes");
    return;
  }

  const renderObject: RenderObject = {
    callback,
    msPerFrame: fps ? 1000 / fps : 0,
    lastFrameTime: performance.now(),
  };

  renderObjects.set(callback, renderObject);

  if (animationHandle == null) {
    _metrics.lastFrameTime = performance.now();
    animationHandle = requestAnimationFrame(render);
  }
}

export function cancelManagedAnimationFrame(callback: RenderFunc): void {
  renderObjects.delete(callback);
  _metrics.callbackDurations.delete(callback.name);

  if (renderObjects.size === 0 && animationHandle != null) {
    cancelAnimationFrame(animationHandle);
    animationHandle = undefined;

    _metrics.lastFrameTime = 0;
    _metrics.lastFrameDuration = 0;
    _metrics.lastFrameAllCallbacksDuration = 0;
    _metrics.frameAllCallbacksDuration = 0;
  }
}

export function managedAnimationFrameMetrics(): Readonly<
  Omit<ManagedAnimationFrameMetrics, "frameAllCallbacksDuration">
> {
  return _metrics;
}

function render() {
  const now = performance.now();

  const frameDeltaTimeMs = now - _metrics.lastFrameTime;

  _metrics.lastFrameDuration = frameDeltaTimeMs;
  _metrics.lastFrameAllCallbacksDuration = _metrics.frameAllCallbacksDuration;
  _metrics.lastFrameTime = now;

  for (const renderObject of renderObjects.values()) {
    const deltaTimeMs = now - renderObject.lastFrameTime;
    if (renderObject.msPerFrame > 0 && deltaTimeMs <= renderObject.msPerFrame) {
      continue;
    }

    renderObject.lastFrameTime = now;

    const t1 = performance.now();
    renderObject.callback(deltaTimeMs);
    const callbackDuration = performance.now() - t1;

    _metrics.callbackDurations.set(renderObject.callback.name, callbackDuration);
  }

  _metrics.frameAllCallbacksDuration = performance.now() - now;
  animationHandle = requestAnimationFrame(render);
}
