import { managedAnimationFrameMetrics } from "./utils/ManagedAnimationFrames.js";
import { Renderer } from "./Renderer.js";
import { STL } from "./stl/parser.js";
import teapotStlUrl from "./assets/teapot.stl?url";

function mustGetElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T;
  if (el == null) {
    throw new Error(`${id} not found`);
  }

  return el;
}

async function main() {
  const canvas = mustGetElement<HTMLCanvasElement>("canvas");
  const frameDurDisplay = mustGetElement<HTMLSpanElement>("frame-dur-display");
  const loadDisplay = mustGetElement<HTMLSpanElement>("load-display");

  function renderOverlay() {
    const metrics = managedAnimationFrameMetrics();
    frameDurDisplay.textContent = metrics.lastFrameDuration.toFixed(1);
    loadDisplay.textContent = ((metrics.lastFrameAllCallbacksDuration / metrics.lastFrameDuration) * 100).toFixed(1);
  }

  setInterval(renderOverlay, 1000);

  const stlProm = STL.loadFromUrl(teapotStlUrl);

  const renderer = new Renderer(canvas);
  renderer.start();

  const stl = await stlProm;
  renderer.loadModel(stl);
}

main();
