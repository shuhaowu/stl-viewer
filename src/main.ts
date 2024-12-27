import { managedAnimationFrameMetrics } from "./utils/ManagedAnimationFrames.js";
import { Renderer } from "./Renderer.js";
import { STL } from "./stl/parser.js";
import teapotStlUrl from "./assets/teapot.stl?url";
import { ArcballCamera } from "./camera/ArcballCamera.js";
import { vec3 } from "gl-matrix";

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

  const camera = new ArcballCamera(canvas, {
    position: new Float32Array([0, 0, 4]),
    target: new Float32Array([0, 0, 0]),
    up: new Float32Array([0, 1, 0]),
    fov: (45 * Math.PI) / 180,
  });

  const renderer = new Renderer(canvas, camera);
  renderer.start();

  const stl = await stlProm;
  renderer.loadModel(stl);

  const axis: vec3 = new Float32Array([1, 1, 1]);
  vec3.normalize(axis, axis);

  camera.rotateWithAnimation(axis, (360 * Math.PI) / 180, 3000);
}

main();
