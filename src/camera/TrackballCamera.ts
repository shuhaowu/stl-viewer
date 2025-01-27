import { type ReadonlyVec3, type ReadonlyMat4, mat4, vec3, quat } from "gl-matrix";
import type { Camera } from "./types.js";

export type TrackballCameraOptions = {
  position: vec3;
  target: vec3;
  up: vec3;
  fov: number;

  sensitivity: {
    pan: number;
    dolly: number;
  };
};

type InteractionRotating = {
  type: "rotating";

  lastNormalizedCoordinates: vec3;
  currentNormalizedCoordinates: vec3;
  rotationAxis: vec3;

  initialCameraRotation: quat;
};

const interactionRotating: InteractionRotating = {
  type: "rotating",

  lastNormalizedCoordinates: vec3.create(),
  currentNormalizedCoordinates: vec3.create(),
  rotationAxis: vec3.create(),

  initialCameraRotation: quat.create(),
};

type InteractionPanning = {
  type: "panning";
  lastMouseX: number;
  lastMouseY: number;
};

const interactionPanning: InteractionPanning = {
  type: "panning",
  lastMouseX: 0,
  lastMouseY: 0,
};

type InteractionPanningVelocity = {
  type: "panningVelocity";

  direction: vec3;
  speed: number;
};

const interactionPanningVelocity: InteractionPanningVelocity = {
  type: "panningVelocity",
  direction: vec3.create(),
  speed: 0,
};

type InteractionRotatingVelocity = {
  type: "rotatingVelocity";

  speed: number;
  axis: vec3;
};

const interactionRotatingVelocity: InteractionRotatingVelocity = {
  type: "rotatingVelocity",
  speed: 0,
  axis: vec3.create(),
};

const positiveZ: vec3 = new Float32Array([0, 0, 1]);

type Interaction = InteractionRotating | InteractionPanning | InteractionRotatingVelocity | InteractionPanningVelocity;

export class TrackballCamera implements Camera {
  #canvas: HTMLCanvasElement;

  #sensivity: TrackballCameraOptions["sensitivity"];

  #fov: number;

  // Always the origin of the sphere. The camera is always looking at this position.
  #center: vec3 = vec3.create();

  // The cartesian coordinate for the position
  #position: vec3 = vec3.create();

  #interaction?: Interaction;

  // The up, front, right vectors in cartesian space
  #up: vec3 = vec3.create();
  #front: vec3 = vec3.create();
  #right: vec3 = vec3.create();

  constructor(canvas: HTMLCanvasElement, { position, target, up, fov, sensitivity }: TrackballCameraOptions) {
    this.#canvas = canvas;
    this.#fov = fov;
    this.#sensivity = sensitivity;

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

  update(dt: number): void {
    switch (this.#interaction?.type) {
      case "rotatingVelocity": {
        const angle = (this.#interaction.speed * dt) / 1000;
        this.rotate(this.#interaction.axis, angle);
        break;
      }

      case "panningVelocity": {
        const distance = (this.#interaction.speed * dt) / 1000;
        vec3.scaleAndAdd(this.#center, this.#center, this.#interaction.direction, distance);
        vec3.scaleAndAdd(this.#position, this.#position, this.#interaction.direction, distance);
        break;
      }
    }
  }

  resetView(position: ReadonlyVec3, target: ReadonlyVec3, up: ReadonlyVec3): void {
    vec3.copy(this.#center, target);
    vec3.copy(this.#up, up);
    vec3.copy(this.#position, position);

    this.#recalculate();
  }

  // Movement logic
  // ==============

  // Not really needed if we write the calculation inline, but since we are using
  // the vec3 library, we will allocate this as if it is a static variable.
  #_staticDollyFront: vec3 = vec3.create();
  dolly(dz: number): void {
    vec3.scaleAndAdd(this.#position, this.#position, this.#front, dz);

    // Need to make sure we don't go through the center so there's a limit on
    // how close we can get.
    //
    // If we go through the center, then there are some concerns as we are
    // calculating front by subtracting the position from center, but we don't
    // really change the right and up vector....

    // So we calculate the dot product between the new front (non-normalized)
    // and the old front vector (normalized). This gives us the distance to the
    // center point from the current position. If it is negative, then it passed
    // the center position.
    //
    // So we clamp the closest distance to some value and force the position
    // there if so.
    //
    // TODO: make the distance configurable.
    vec3.subtract(this.#_staticDollyFront, this.#center, this.#position);
    if (vec3.dot(this.#_staticDollyFront, this.#front) < 5) {
      vec3.scaleAndAdd(this.#position, this.#center, this.#front, -5);
    }

    this.#recalculate();
  }

  // x and y are in camera coordinate space
  pan(dx: number, dy: number): void {
    const scaledX = dx * this.#sensivity.pan;
    const scaledY = -dy * this.#sensivity.pan;

    vec3.scaleAndAdd(this.#center, this.#center, this.#right, scaledX);
    vec3.scaleAndAdd(this.#center, this.#center, this.#up, scaledY);

    vec3.scaleAndAdd(this.#position, this.#position, this.#right, scaledX);
    vec3.scaleAndAdd(this.#position, this.#position, this.#up, scaledY);
  }

  #_staticRotateQuat: quat = quat.create();
  rotate(axis: vec3, angle: number): void {
    quat.setAxisAngle(this.#_staticRotateQuat, axis, angle);

    rotateWithQuat(this.#position, this.#position, this.#_staticRotateQuat);

    rotateWithQuat(this.#up, this.#up, this.#_staticRotateQuat);
    vec3.normalize(this.#up, this.#up);

    rotateWithQuat(this.#front, this.#front, this.#_staticRotateQuat);
    vec3.normalize(this.#front, this.#front);

    rotateWithQuat(this.#right, this.#right, this.#_staticRotateQuat);
    vec3.normalize(this.#right, this.#right);
  }

  #recalculate(): void {
    // Recalculate directional vectors
    vec3.subtract(this.#front, this.#center, this.#position);
    vec3.normalize(this.#front, this.#front);

    // This kind of assumes the up is not aligned with front
    // TODO: fix this assumption.
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

  #onKeyDown = (ev: KeyboardEvent) => {
    if (this.#interaction !== undefined) {
      return;
    }

    switch (ev.code) {
      case "KeyW": {
        this.#interaction = interactionRotatingVelocity;
        vec3.copy(this.#interaction.axis, this.#right);
        this.#interaction.speed = Math.PI / 2;

        break;
      }

      case "KeyA": {
        this.#interaction = interactionRotatingVelocity;
        vec3.copy(this.#interaction.axis, this.#up);
        this.#interaction.speed = Math.PI / 2;
        break;
      }

      case "KeyS": {
        this.#interaction = interactionRotatingVelocity;
        vec3.copy(this.#interaction.axis, this.#right);
        this.#interaction.speed = -Math.PI / 2;
        break;
      }

      case "KeyD": {
        this.#interaction = interactionRotatingVelocity;
        vec3.copy(this.#interaction.axis, this.#up);
        this.#interaction.speed = -Math.PI / 2;
        break;
      }

      case "ArrowUp": {
        this.#interaction = interactionPanningVelocity;
        vec3.copy(this.#interaction.direction, this.#up);
        this.#interaction.speed = 10;
        console.log(this.#up);
        break;
      }

      case "ArrowLeft": {
        this.#interaction = interactionPanningVelocity;
        vec3.copy(this.#interaction.direction, this.#right);
        this.#interaction.speed = -10;
        break;
      }

      case "ArrowDown": {
        this.#interaction = interactionPanningVelocity;
        vec3.copy(this.#interaction.direction, this.#up);
        this.#interaction.speed = -10;
        console.log(this.#up);
        break;
      }

      case "ArrowRight": {
        this.#interaction = interactionPanningVelocity;
        vec3.copy(this.#interaction.direction, this.#right);
        this.#interaction.speed = 10;
      }
    }
  };

  #onKeyUp = (ev: KeyboardEvent) => {
    if (this.#interaction?.type === "rotatingVelocity" || this.#interaction?.type === "panningVelocity") {
      this.#interaction = undefined;
    }
  };

  #onBlurAndFocus = () => {
    this.#interaction = undefined;
  };

  #onMouseMove = (ev: MouseEvent) => {
    switch (this.#interaction?.type) {
      case "rotating": {
        this.#calculateNormalizedCoordinates(this.#interaction.currentNormalizedCoordinates, ev.offsetX, ev.offsetY);
        rotateWithQuat(
          this.#interaction.currentNormalizedCoordinates,
          this.#interaction.currentNormalizedCoordinates,
          this.#interaction.initialCameraRotation,
        );

        vec3.cross(
          this.#interaction.rotationAxis,
          this.#interaction.lastNormalizedCoordinates,
          this.#interaction.currentNormalizedCoordinates,
        );

        vec3.normalize(this.#interaction.rotationAxis, this.#interaction.rotationAxis);

        const angle = Math.acos(
          Math.min(
            vec3.dot(this.#interaction.lastNormalizedCoordinates, this.#interaction.currentNormalizedCoordinates),
            1.0,
          ),
        );

        this.rotate(this.#interaction.rotationAxis, angle);

        vec3.copy(this.#interaction.lastNormalizedCoordinates, this.#interaction.currentNormalizedCoordinates);

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

      default:
        return;
    }
  };

  #negativeFront: vec3 = vec3.create();

  #onMouseDown = (ev: MouseEvent) => {
    if (ev.shiftKey) {
      this.#interaction = interactionPanning;
      this.#interaction.lastMouseX = ev.offsetX;
      this.#interaction.lastMouseY = ev.offsetY;
    } else {
      this.#interaction = interactionRotating;

      vec3.scale(this.#negativeFront, this.#front, -1);
      vec3.cross(this.#interaction.rotationAxis, this.#negativeFront, positiveZ);
      const angle = Math.acos(Math.min(vec3.dot(this.#negativeFront, positiveZ), 1.0));
      quat.setAxisAngle(this.#interaction.initialCameraRotation, this.#interaction.rotationAxis, angle);

      this.#calculateNormalizedCoordinates(this.#interaction.lastNormalizedCoordinates, ev.offsetX, ev.offsetY);
      rotateWithQuat(
        this.#interaction.lastNormalizedCoordinates,
        this.#interaction.lastNormalizedCoordinates,
        this.#interaction.initialCameraRotation,
      );
    }
  };

  #onMouseUp = (_ev: MouseEvent) => {
    this.#interaction = undefined;
  };

  #onWheel = (ev: WheelEvent) => {
    this.dolly(-ev.deltaY * this.#sensivity.dolly);
  };

  // Helper methods
  // ==============

  #calculateNormalizedCoordinates(out: vec3, offsetX: number, offsetY: number): vec3 {
    // The sphere radius is the largest sphere that fits in the screen.
    const sphereRadius = (Math.min(this.#canvas.width, this.#canvas.height) - 1) / 2;
    const centerX = Math.round(this.#canvas.width / 2 - 0.99);
    const centerY = Math.round(this.#canvas.height / 2 - 0.99);

    out[0] = (offsetX - centerX) / sphereRadius; // now converted to roughly -1, 1
    out[1] = -(offsetY - centerY) / sphereRadius;

    const r2 = out[0] * out[0] + out[1] * out[1];
    if (r2 <= 0.5) {
      // Assume the sphere has a radius of 1 in normalized coordinates
      out[2] = Math.sqrt(1 - r2);
    } else {
      out[2] = 0.5 / Math.sqrt(r2);
    }

    return vec3.normalize(out, out);
  }
}

const _rotateWithQuatTemp1: quat = quat.create();
const _rotateWithQuatTemp2: quat = quat.create();
// Active rotation: rotate a point around a coordinate system
function rotateWithQuat(out: vec3, p: vec3, q: quat): vec3 {
  quat.invert(_rotateWithQuatTemp1, q); // q^-1
  quat.set(_rotateWithQuatTemp2, p[0], p[1], p[2], 0); // p

  quat.multiply(_rotateWithQuatTemp2, _rotateWithQuatTemp2, q); // pq
  quat.multiply(_rotateWithQuatTemp1, _rotateWithQuatTemp1, _rotateWithQuatTemp2); // q^1 pq
  vec3.set(out, _rotateWithQuatTemp1[0], _rotateWithQuatTemp1[1], _rotateWithQuatTemp1[2]); // Get it in vector form!
  return out;
}
