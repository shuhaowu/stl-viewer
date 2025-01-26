import { type ReadonlyVec3, type ReadonlyMat4, vec3, mat4 } from "gl-matrix";
import type { Camera } from "./types.js";

export type ArcballCameraOptions = {
  position: vec3;
  target: vec3;
  up: vec3;
  fov: number;
};

// See https://octave.sourceforge.io/octave/function/cart2sph.html
// Output is theta, phi, r. theta is angle relative to the X axis (Azimuth).
// phi is angle relative to the x-y plane (elevation)
function cart2sph(out: vec3, cartesian: vec3): vec3 {
  const x = cartesian[0];
  const y = cartesian[1];
  const z = cartesian[2];

  out[0] = Math.atan2(y, x); // theta
  out[1] = Math.atan2(z, Math.sqrt(x * x + y * y)); // phi
  out[2] = Math.sqrt(x * x + y * y + z * z); // r

  return out;
}

function sph2cart(out: vec3, spherical: vec3): vec3 {
  const theta = spherical[0];
  const phi = spherical[1];
  const r = spherical[2];

  out[0] = r * Math.cos(phi) * Math.cos(theta);
  out[1] = r * Math.cos(phi) * Math.sin(theta);
  out[2] = r * Math.sin(phi);

  return out;
}

type AnimationRotating = {
  type: "rotating";
  lastNormalizedCoordinates: vec3;
  currentNormalizedCoordinates: vec3;
};

type AnimationPanning = {
  type: "panning";
};

type AnimationDollying = {
  type: "dollying";
};

// Preallocate the animation structures
const animationRotating: AnimationRotating = {
  type: "rotating",
  lastNormalizedCoordinates: vec3.create(),
  currentNormalizedCoordinates: vec3.create(),
};

const animationPanning: AnimationPanning = {
  type: "panning",
};

const animationDollying: AnimationDollying = {
  type: "dollying",
};

export class ArcballCameraSpherical implements Camera {
  #canvas: HTMLCanvasElement;

  #fov: number;

  /**
   * Spherical position of theta, phi, r, in MATLAB/Octave convention.
   */
  #position: vec3 = vec3.create();

  /**
   * The sphere center position in Cartesian coordinates.
   */
  #center: vec3;

  /**
   * Cartesian direction vectors for the camera
   */
  #up: vec3;
  #front: vec3 = vec3.create();
  #right: vec3 = vec3.create();

  /**
   * Cartesian coordinates of the camera
   */
  #positionCartesian = vec3.create();

  #animation?: AnimationRotating | AnimationPanning | AnimationDollying;

  constructor(canvas: HTMLCanvasElement, { position, target, up, fov }: ArcballCameraOptions) {
    this.#canvas = canvas;

    vec3.copy(this.#positionCartesian, position);
    cart2sph(this.#position, position);

    this.#center = target;
    this.#up = up;
    this.#fov = fov;

    vec3.subtract(this.#front, this.#center, position);
    vec3.normalize(this.#front, this.#front);

    vec3.cross(this.#right, this.#front, this.#up);
    vec3.normalize(this.#right, this.#right);
  }

  position(): ReadonlyVec3 {
    return this.#positionCartesian;
  }

  #projectionMatrix = mat4.create();
  perspectiveProjectionMatrix(aspectRatio: number, near: number, far: number): ReadonlyMat4 {
    return mat4.perspective(this.#projectionMatrix, this.#fov, aspectRatio, near, far);
  }

  #cameraMatrix = mat4.create();
  cameraMatrix(): ReadonlyMat4 {
    return mat4.lookAt(this.#cameraMatrix, this.#positionCartesian, this.#center, this.#up);
  }

  fov(): number {
    return this.#fov;
  }

  update(dt: number): void {
    throw new Error("Method not implemented.");
  }

  attachEventHandlers(): void {
    window.addEventListener("keydown", this.#onKeyDown); // TODO: capture the entire window might not be ideal, but good enough for now.
    window.addEventListener("keyup", this.#onKeyUp);
    window.addEventListener("blur", this.#onBlurAndFocus);
    window.addEventListener("focus", this.#onBlurAndFocus);

    this.#canvas.addEventListener("mousemove", this.#onMouseMove);
    this.#canvas.addEventListener("mousedown", this.#onMouseDown);
    this.#canvas.addEventListener("mouseup", this.#onMouseUp);
    this.#canvas.addEventListener("mouseleave", this.#onMouseUp);

    this.#canvas.addEventListener("wheel", this.#onWheel);
  }

  detachEventHandlers(): void {
    window.removeEventListener("keydown", this.#onKeyDown);
    window.removeEventListener("keyup", this.#onKeyUp);
    window.removeEventListener("blur", this.#onBlurAndFocus);
    window.removeEventListener("focus", this.#onBlurAndFocus);

    this.#canvas.removeEventListener("mousemove", this.#onMouseMove);
    this.#canvas.removeEventListener("mousedown", this.#onMouseDown);
    this.#canvas.removeEventListener("mouseup", this.#onMouseUp);
    this.#canvas.removeEventListener("mouseleave", this.#onMouseUp);
  }

  #onKeyDown = (ev: KeyboardEvent) => {};

  #onKeyUp = (ev: KeyboardEvent) => {};

  #onBlurAndFocus = () => {};

  #onMouseMove = (ev: MouseEvent) => {
    switch (this.#animation?.type) {
      case undefined:
        return;
      case "rotating": {
        this.#calculateNormalizedCoordinates(this.#animation.currentNormalizedCoordinates, ev);
        break;
      }
      case "dollying":
        break;
      case "panning":
        break;
      default:
        this.#animation satisfies never;
    }
  };

  #onMouseDown = (ev: MouseEvent) => {
    if (ev.shiftKey) {
      this.#animation = animationPanning;
    } else {
      this.#animation = animationRotating;
      this.#calculateNormalizedCoordinates(this.#animation.lastNormalizedCoordinates, ev);
    }
  };

  #onMouseUp = (ev: MouseEvent) => {
    this.#animation = undefined;
  };

  #onWheel = (ev: WheelEvent) => {};

  #calculateNormalizedCoordinates(out: vec3, ev: MouseEvent): void {
    const sphereRadius = (Math.min(this.#canvas.width, this.#canvas.height) - 1) / 2;
    const centerX = Math.round(this.#canvas.width / 2 - 0.99);
    const centerY = Math.round(this.#canvas.height / 2 - 0.99);

    out[0] = (ev.offsetX - centerX) / sphereRadius; // now converted to roughly -1, 1
    out[1] = -(ev.offsetY - centerY) / sphereRadius;

    const r2 = out[0] * out[0] + out[1] * out[1];
    if (r2 <= 0.5) {
      // Assume the sphere has a radius of 1 in normalized coordinates
      out[2] = Math.sqrt(1 - r2);
    } else {
      out[2] = 0.5 / Math.sqrt(r2);
    }
  }

  #calculateCartesianPosition(): ReadonlyVec3 {
    // First we get the non-offset position.
    sph2cart(this.#positionCartesian, this.#position);

    // Then we add that to the center;
    vec3.add(this.#positionCartesian, this.#positionCartesian, this.#center);

    return this.#positionCartesian;
  }
}
