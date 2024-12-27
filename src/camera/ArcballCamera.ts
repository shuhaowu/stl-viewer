import { mat4, quat, type ReadonlyMat4, type ReadonlyVec3, vec3 } from "gl-matrix";
import type { Camera } from "./types.js";

export type ArcballCameraOptions = {
  position: vec3;
  target: vec3;
  up: vec3;
  fov: number;
};

type AnimationAnimating = {
  type: "animating";

  startTime: number;
  duration: number;

  angularVelocity: number;

  axis: vec3;
  currentAngle: number;
  targetAngle: number;
};

type AnimationPanning = {
  type: "panning";
};

type AnimationRotating = {
  type: "rotating";
};

type Animation = AnimationAnimating | AnimationRotating | AnimationPanning;

export class ArcballCamera implements Camera {
  #canvas: HTMLCanvasElement;

  #position: vec3;
  #target: vec3;
  #up: vec3;
  #fov: number;

  #front: vec3 = vec3.create();
  #right: vec3 = vec3.create();

  // Pre-allocated memory for calculations
  // =====================================

  // These are only used for returning the camera and projection matrix calculations.
  #cameraMatrix: mat4 = mat4.create();
  #projectionMatrix: mat4 = mat4.create();

  // These are only used for the rotate function to compute temporary rotation.
  #rotation: quat = quat.create(); // The rotation quaternion q
  #positionQuaternion: quat = quat.create(); // The position quaternion p constructed from the #position
  #tempQuaternion: quat = quat.create(); // The temporary scratch space coming from pq(p^-1). Could probably be optimized.

  // Temporary variables to handle interactive rotation
  // ==================================================
  #animation?: Animation;

  constructor(canvas: HTMLCanvasElement, { position, target, up, fov }: ArcballCameraOptions) {
    this.#canvas = canvas;

    this.#position = position;
    this.#target = target;
    this.#up = up;
    this.#fov = fov;

    this.#updateOrthonormalBasis();
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

  // Interface methods
  position(): ReadonlyVec3 {
    return this.#position;
  }

  perspectiveProjectionMatrix(aspectRatio: number, near: number, far: number): ReadonlyMat4 {
    return mat4.perspective(this.#projectionMatrix, this.#fov, aspectRatio, near, far);
  }

  cameraMatrix(): ReadonlyMat4 {
    return mat4.lookAt(this.#cameraMatrix, this.#position, this.#target, this.#up);
  }

  fov(): number {
    return this.#fov;
  }

  moveTo(position: ReadonlyVec3): ReadonlyVec3 {
    vec3.copy(this.#position, position);
    this.#updateOrthonormalBasis();
    return this.#position;
  }

  update(dt: number): void {
    const now = performance.now();

    switch (this.#animation?.type) {
      case undefined:
        return;
      case "animating": {
        if (
          now >= this.#animation.duration + this.#animation.startTime ||
          this.#animation.currentAngle >= this.#animation.targetAngle
        ) {
          this.#animation = undefined;
          console.debug("rotation animation complete");
          return;
        }

        const deltaAngle = this.#animation.angularVelocity * dt;
        this.#animation.currentAngle += deltaAngle;

        this.rotate(this.#animation.axis, deltaAngle);
        break;
      }
      case "panning":
        break;
      case "rotating":
        break;
      default:
        this.#animation satisfies never;
    }
  }

  rotate(axis: ReadonlyVec3, theta: number): ReadonlyVec3 {
    quat.setAxisAngle(this.#rotation, axis, theta);
    quat.set(this.#positionQuaternion, this.#position[0], this.#position[1], this.#position[2], 0);

    quat.invert(this.#tempQuaternion, this.#rotation);
    quat.multiply(this.#tempQuaternion, this.#positionQuaternion, this.#tempQuaternion);
    quat.multiply(this.#tempQuaternion, this.#rotation, this.#tempQuaternion);

    this.#position[0] = this.#tempQuaternion[0];
    this.#position[1] = this.#tempQuaternion[1];
    this.#position[2] = this.#tempQuaternion[2];

    this.#updateOrthonormalBasis();
    return this.#position;
  }

  rotateWithAnimation(axis: ReadonlyVec3, theta: number, duration: number): void {
    if (this.#animation?.type === "animating") {
      console.warn("already animating, not following orders...");
    }

    this.#animation = {
      type: "animating",

      startTime: performance.now(),
      duration,

      angularVelocity: theta / duration,

      axis: new Float32Array(axis),
      currentAngle: 0,
      targetAngle: theta,
    } satisfies AnimationAnimating;
    console.debug(`starting rotation animation on ${axis} with ${theta} rad over ${duration} ms`);
  }

  // Event handlers
  #onKeyDown = (ev: KeyboardEvent) => {};

  #onKeyUp = (ev: KeyboardEvent) => {};

  #onBlurAndFocus = () => {
    if (this.#animation?.type === "animating") {
      return;
    }

    this.#animation = undefined;
  };

  #onMouseMove = (ev: MouseEvent) => {
    if (this.#animation?.type === "animating") {
      return;
    }
  };

  #onMouseDown = (ev: MouseEvent) => {
    if (this.#animation?.type === "animating") {
      return;
    }

    if (ev.shiftKey) {
      // TODO: this is an allocation!
      this.#animation = {
        type: "panning",
      };
    } else {
      this.#animation = {
        type: "rotating",
      };
    }
  };

  #onMouseUp = (ev: MouseEvent) => {
    if (this.#animation?.type === "animating") {
      return;
    }

    this.#animation = undefined;
  };

  #onWheel = (ev: WheelEvent) => {
    if (this.#animation?.type === "animating") {
      return;
    }
  };

  // Helper functions
  #updateOrthonormalBasis(): void {
    // TODO: Implment https://en.wikipedia.org/wiki/Gram%E2%80%93Schmidt_process
    vec3.subtract(this.#front, this.#target, this.#position);
    vec3.normalize(this.#front, this.#front);
    vec3.cross(this.#right, this.#front, this.#up); // Need to be careful when front is in the same direction as up.
    vec3.normalize(this.#right, this.#right);
    vec3.cross(this.#up, this.#right, this.#front);
    vec3.normalize(this.#up, this.#up);
  }
}
