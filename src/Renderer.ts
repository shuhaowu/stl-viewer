import type { Camera } from "./camera/types.js";
import { STLModel } from "./stl/model.js";
import type { STL } from "./stl/parser.js";
import type { LightProperty } from "./types.js";
import { GLError } from "./utils/gl.js";
import { cancelManagedAnimationFrame, runOnManagedAnimationFrame } from "./utils/ManagedAnimationFrames.js";

export class Renderer {
  #canvas: HTMLCanvasElement;
  #gl: WebGL2RenderingContext;
  #camera: Camera;
  #light: LightProperty;
  #stlModel?: STLModel;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.#canvas = canvas;

    const gl = this.#canvas.getContext("webgl2");
    if (gl == null) {
      throw new GLError("cannot get webgl2 context");
    }

    this.#gl = gl;

    this.#gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.#gl.enable(gl.DEPTH_TEST);

    // WebGL expects texture coordinate system origin to be at the bottom left.
    // When loading from an HTMLImageElement, the image data is origin'ed on
    // the top left. This flips the Y axis and makes it behave correctly.
    this.#gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // For managed animation frame rendering.
    Object.defineProperty(this.#loop, "name", {
      value: "Renderer.loop",
    });

    // Setup the camera
    this.#camera = camera;

    // Setup the light
    this.#light = {
      ambient: new Float32Array([0.2, 0.2, 0.2]),
      diffuse: new Float32Array([0.5, 0.5, 0.5]),
      specular: new Float32Array([1.0, 1.0, 1.0]),
      direction: new Float32Array([-0.2, -0.1, -0.3]),
    };
  }

  start(): void {
    runOnManagedAnimationFrame(this.#loop);
  }

  stop(): void {
    cancelManagedAnimationFrame(this.#loop);
  }

  loadModel(stl: STL): void {
    // Need to calculate how far to move the camera such that the object is not
    // clipped.
    const h = stl.boundingBox.scale[1] / 2;
    const theta2 = this.#camera.fov() / 2;
    const z = (h / Math.tan(theta2)) * 2;

    this.#camera.resetView(new Float32Array([0, 0, z]), new Float32Array([0, 0, 0]), new Float32Array([0, 1, 0]));

    this.#stlModel = new STLModel(this.#gl, stl);
  }

  #update(dt: number): void {
    this.#camera.update(dt);
  }

  #render(_dt: number): void {
    const aspectRatio = this.#updateCanvasSize();
    this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);

    if (this.#stlModel == null) {
      return;
    }

    const projectionMatrix = this.#camera.perspectiveProjectionMatrix(aspectRatio, 0.1, 100);
    const cameraMatrix = this.#camera.cameraMatrix();

    this.#stlModel.render(
      this.#gl,
      {
        projectionMatrix,
        cameraMatrix,
        position: this.#camera.position(),
      },
      this.#light,
    );
  }

  #loop = (dt: number) => {
    this.#update(dt);
    this.#render(dt);
  };

  // Returns the aspect ratio
  #updateCanvasSize(): number {
    const width = this.#canvas.clientWidth;
    const height = this.#canvas.clientHeight;

    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;

      // Update viewport when size changes
      this.#gl.viewport(0, 0, width, height);
    }

    return width / height;
  }
}
