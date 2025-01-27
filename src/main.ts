import { Renderer } from "./Renderer.js";
import teapotStlUrl from "./assets/teapot.stl?url";
import { TrackballCamera } from "./camera/TrackballCamera.js";
import { STL } from "./stl/parser.js";
import { managedAnimationFrameMetrics } from "./utils/ManagedAnimationFrames.js";

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

  const camera = new TrackballCamera(canvas, {
    position: new Float32Array([0, 0, 4]),
    target: new Float32Array([0, 0, 0]),
    up: new Float32Array([0, 1, 0]),
    fov: (45 * Math.PI) / 180,
    sensitivity: {
      pan: 0.02,
      dolly: 0.01,
    },
  });

  camera.attachEventHandlers();

  const renderer = new Renderer(canvas, camera);
  renderer.start();

  const stl = await stlProm;
  renderer.loadModel(stl);
}

main();
