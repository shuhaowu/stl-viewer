import { mat4, quat, type ReadonlyMat4, type ReadonlyVec3, vec3 } from "gl-matrix";
import type { Camera } from "./types.js";

export type ArcballCameraOptions2 = {
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

  rotationAxis: vec3;
  currentAngle: number;
  targetAngle: number;
};

type AnimationPanning = {
  type: "panning";
};

type AnimationRotating = {
  type: "rotating";

  lastNormalizedCoordinates: vec3;
  currentNormalizedCoordinates: vec3;

  rotationAxis: vec3;
};

type Animation = AnimationAnimating | AnimationRotating | AnimationPanning;

// basically some static variables for us to use.
const temporaryQuat1 = quat.create();
const temporaryPositionQuat = quat.create();

const kNegativeZFrontVector: vec3 = new Float32Array([0.0, 0.0, -1.0]);

function rotateWithQuat(out: vec3, p: vec3, q: quat): vec3 {
  quat.invert(temporaryQuat1, q);
  quat.set(temporaryPositionQuat, p[0], p[1], p[2], 0);

  quat.multiply(temporaryQuat1, temporaryPositionQuat, temporaryQuat1);
  quat.multiply(temporaryQuat1, q, temporaryQuat1);
  vec3.set(out, temporaryQuat1[0], temporaryQuat1[1], temporaryQuat1[2]);
  return out;
}

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

  // Temporary variables to handle interactive rotation
  // ==================================================
  #animation?: Animation;

  constructor(canvas: HTMLCanvasElement, { position, target, up, fov }: ArcballCameraOptions) {
    this.#canvas = canvas;

    this.#position = position;
    this.#target = target;
    this.#up = up;
    this.#fov = fov;

    vec3.subtract(this.#front, this.#target, this.#position);
    vec3.normalize(this.#front, this.#front);

    vec3.cross(this.#right, this.#front, this.#up);
    vec3.normalize(this.#right, this.#right);
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

  moveTo(position: ReadonlyVec3, up: ReadonlyVec3): ReadonlyVec3 {
    vec3.copy(this.#position, position);
    vec3.copy(this.#up, up);

    vec3.subtract(this.#front, this.#target, this.#position);
    vec3.normalize(this.#front, this.#front);

    vec3.cross(this.#right, this.#front, this.#up);
    vec3.normalize(this.#right, this.#right);

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

        this.rotate(this.#animation.rotationAxis, deltaAngle);
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

    rotateWithQuat(this.#position, this.#position, this.#rotation);
    rotateWithQuat(this.#up, this.#up, this.#rotation);
    rotateWithQuat(this.#front, this.#front, this.#rotation);
    rotateWithQuat(this.#right, this.#right, this.#rotation);
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

      rotationAxis: new Float32Array(axis),
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
    switch (this.#animation?.type) {
      case undefined:
        return;
      case "animating":
        return;
      case "rotating": {
        this.#calculateNormalizedCoordinates(this.#animation.currentNormalizedCoordinates, ev);
        vec3.cross(
          this.#animation.rotationAxis,
          this.#animation.lastNormalizedCoordinates,
          this.#animation.currentNormalizedCoordinates,
        );
        vec3.normalize(this.#animation.rotationAxis, this.#animation.rotationAxis);

        // TODO: need to negate the angle for some reason
        const angle = -Math.acos(
          Math.min(
            vec3.dot(this.#animation.lastNormalizedCoordinates, this.#animation.currentNormalizedCoordinates),
            1.0,
          ),
        );

        this.rotate(this.#animation.rotationAxis, angle);
        vec3.copy(this.#animation.lastNormalizedCoordinates, this.#animation.currentNormalizedCoordinates);
        break;
      }
      case "panning": {
        break;
      }
      default:
        this.#animation satisfies never;
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

        lastNormalizedCoordinates: vec3.create(),
        currentNormalizedCoordinates: vec3.create(),
        rotationAxis: vec3.create(),
      };

      this.#calculateNormalizedCoordinates(this.#animation.lastNormalizedCoordinates, ev);
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

  #calculateNormalizedCoordinates(out: vec3, ev: MouseEvent): void {
    if (this.#animation?.type !== "rotating") {
      throw new Error("programming error: this method is only allowed during rotating");
    }

    // The sphere radius is the largest sphere that fits in the screen.
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

    // Right now out is in "normalized screen space". I use quotes because it's
    // not the actual screen space necessarily. We are normalizing it with
    // respect to a sphere of 1. This space is viewed with a camera with the
    // view vector of [0, 0, -1]. However, the current camera is actually
    // viewing in the direction of this.#front. So instead of getting the
    // semi-sphere in the direction of [0, 0, -1], we need to rotate the
    // "normalized screen space".

    // The reason this is different from most other Arcball implementation is
    // because other arcball implementations are moving the object instead of
    // moving the camera.

    // The initial view vector is always [0, 0, -1]
    // The current camera view vector is at this.#front
    // Crossing these two vectors gives a rotation axis.
    // Solving for the dot product gives the rotation angle
    // Then we can rotate the out vector to the right place.

    vec3.cross(this.#animation.rotationAxis, this.#front, kNegativeZFrontVector);
    const angle = -Math.acos(Math.min(vec3.dot(this.#front, kNegativeZFrontVector), 1.0));

    quat.setAxisAngle(this.#rotation, this.#animation.rotationAxis, angle);
    rotateWithQuat(out, out, this.#rotation);

    console.log(out);

    vec3.normalize(out, out); // TODO: is this actually needed?
  }
}
