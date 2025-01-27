import { type ReadonlyVec3, type ReadonlyMat4, mat4, vec3 } from "gl-matrix";
import type { Camera } from "./types.js";

/**
 * Inspired partially from https://computergraphics.stackexchange.com/questions/151/how-to-implement-a-trackball-in-opengl
 */

export type SphericalCameraOptions = {
  position: vec3;
  target: vec3;
  up: vec3;
  fov: number;
};

type InteractionRotating = {
  type: "rotating";

  lastMouseX: number;
  lastMouseY: number;
};

type InteractionPanning = {
  type: "panning";

  lastMouseX: number;
  lastMouseY: number;
};

const interactionRotating: InteractionRotating = {
  type: "rotating",
  lastMouseX: 0,
  lastMouseY: 0,
};

const interactionPanning: InteractionPanning = {
  type: "panning",
  lastMouseX: 0,
  lastMouseY: 0,
};

type Interaction = InteractionRotating | InteractionPanning;

export class SphericalCamera implements Camera {
  #canvas: HTMLCanvasElement;

  #fov: number;

  #center: vec3 = vec3.create(); // Always the origin of the sphere. The camera is always looking at this position.

  // theta, phi, and r in the MATLAB/Octave convention
  // theta is relative to the positive X
  // phi is relative to XY plane.
  #coord: vec3 = vec3.create();

  #interaction?: Interaction;

  // Everything below are derived values.

  // The cartesian coordinate for the position
  #position: vec3 = vec3.create();

  // The up, front, right vectors in cartesian space
  #up: vec3 = vec3.create();
  #front: vec3 = vec3.create();
  #right: vec3 = vec3.create();

  // The world up vector, either 0, 1, 0 or 0, -1, 0. Basically when we are
  // looking from the back side, this will flip direction so the angles are
  // properly added.
  #worldUp: vec3 = new Float32Array([0, 1, 0]);

  constructor(canvas: HTMLCanvasElement, { position, target, up, fov }: SphericalCameraOptions) {
    this.#canvas = canvas;
    this.#fov = fov;

    this.resetView(position, target, up);
  }

  // Implementing the Camera interface
  // =================================

  position(): ReadonlyVec3 {
    return this.#position;
  }

  #projectionMatrix: mat4 = mat4.create();
  perspectiveProjectionMatrix(aspectRatio: number, near: number, far: number): ReadonlyMat4 {
    return mat4.perspective(this.#projectionMatrix, this.#fov, aspectRatio, near, far);
  }

  #cameraMatrix: mat4 = mat4.create();
  cameraMatrix(): ReadonlyMat4 {
    return mat4.lookAt(this.#cameraMatrix, this.#position, this.#center, this.#up);
  }

  fov(): number {
    return this.#fov;
  }

  update(_dt: number): void {
    // No update?
  }

  resetView(position: ReadonlyVec3, target: ReadonlyVec3, up: ReadonlyVec3): void {
    // Move the center and up vector first.
    vec3.copy(this.#center, target);
    vec3.copy(this.#up, up);

    // Then store the cartesian coordinate so we don't have to recalculate it
    vec3.copy(this.#position, position);

    // Then we figure out the relative position
    const x = position[0] - target[0];
    const y = position[1] - target[1];
    const z = position[2] - target[2];

    // Calculate the coordinate in spherical coordinate space.
    cart2sph(this.#coord, x, y, z);

    console.log(this.#coord, x, y, z);

    // Now calculate the directional vectors
    vec3.subtract(this.#front, this.#position, this.#center);
    vec3.normalize(this.#front, this.#front);

    vec3.cross(this.#right, this.#front, this.#up);
    vec3.normalize(this.#right, this.#right);
  }

  // Movement logic
  // ==============

  rotate(dtheta: number, dphi: number): void {
    this.#coord[0] = wrappedAngleAdd(this.#coord[0], this.#worldUp[1] * dtheta);
    this.#coord[1] = wrappedAngleAdd(this.#coord[1], dphi);

    // TODO: need to change world up?

    this.#recalculate();
  }

  dolly(dr: number): void {
    this.#coord[2] += dr;

    this.#recalculate();
  }

  // x and y are in camera coordinate space
  pan(dx: number, dy: number): void {
    vec3.scaleAndAdd(this.#center, this.#center, this.#right, dx);
    vec3.scaleAndAdd(this.#center, this.#center, this.#up, dy);
  }

  #recalculate(): void {
    // Recalculate the cartesian position
    console.log(this.#coord);
    sph2cart(this.#position, this.#coord[0], this.#coord[1], this.#coord[2]);
    vec3.add(this.#position, this.#center, this.#position);
    console.log(this.#position);

    // Recalculate directional vectors
    vec3.subtract(this.#front, this.#position, this.#center);
    vec3.normalize(this.#front, this.#front);

    // This kind of assumes the previous up vector is still relatively correct
    // TODO: what if up needs to change drastically?
    vec3.cross(this.#right, this.#front, this.#up);
    vec3.normalize(this.#right, this.#right);

    // Now we update the up vector as well
    vec3.cross(this.#up, this.#right, this.#front);
    vec3.normalize(this.#up, this.#up);
  }

  // Event handling code below
  // =========================

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

  #onBlurAndFocus = () => {
    this.#interaction = undefined;
  };

  #onMouseMove = (ev: MouseEvent) => {
    switch (this.#interaction?.type) {
      case "rotating": {
        const dx = ev.offsetX - this.#interaction.lastMouseX;
        const dy = this.#interaction.lastMouseY - ev.offsetY;

        const dtheta = -(dx / this.#canvas.width) * Math.PI;
        const dphi = -(dy / this.#canvas.height) * Math.PI;

        this.rotate(dtheta, dphi);

        this.#interaction.lastMouseX = ev.offsetX;
        this.#interaction.lastMouseY = ev.offsetY;

        break;
      }

      case "panning": {
        const dx = ev.offsetX - this.#interaction.lastMouseX;
        const dy = this.#interaction.lastMouseY - ev.offsetY;

        this.pan(dx, dy);

        this.#interaction.lastMouseX = ev.offsetX;
        this.#interaction.lastMouseY = ev.offsetY;
        break;
      }

      case undefined:
        return;

      default:
        this.#interaction satisfies never;
    }
  };

  #onMouseDown = (ev: MouseEvent) => {
    if (ev.shiftKey) {
      this.#interaction = interactionPanning;
      this.#interaction.lastMouseX = ev.offsetX;
      this.#interaction.lastMouseY = ev.offsetY;
    } else {
      this.#interaction = interactionRotating;
      this.#interaction.lastMouseX = ev.offsetX;
      this.#interaction.lastMouseY = ev.offsetY;
    }
  };

  #onMouseUp = (ev: MouseEvent) => {
    this.#interaction = undefined;
  };

  #onWheel = (ev: WheelEvent) => {};
}

// Keep angle between in between -PI, PI
function wrappedAngleAdd(angle: number, dangle: number): number {
  let res = angle + dangle;
  while (res > Math.PI) {
    res -= 2 * Math.PI;
  }

  while (res < -Math.PI) {
    res += 2 * Math.PI;
  }

  return res;
}

function cart2sph(out: vec3, x: number, y: number, z: number): vec3 {
  out[0] = Math.atan2(x, z); // theta
  out[1] = Math.atan2(y, Math.sqrt(x * x + z * z)); // phi
  out[2] = Math.sqrt(x * x + y * y + z * z); // r

  // out[0] = Math.atan2(y, x); // theta
  // out[1] = Math.atan2(z, Math.sqrt(x * x + y * y)); // phi
  // out[2] = Math.sqrt(x * x + y * y + z * z); // r

  return out;
}

function sph2cart(out: vec3, theta: number, phi: number, r: number): vec3 {
  out[0] = r * Math.cos(phi) * Math.sin(theta);
  out[1] = r * Math.sin(phi);
  out[2] = r * Math.cos(phi) * Math.cos(theta);

  // out[0] = r * Math.cos(phi) * Math.cos(theta);
  // out[1] = r * Math.cos(phi) * Math.sin(theta);
  // out[2] = r * Math.sin(phi);

  return out;
}
