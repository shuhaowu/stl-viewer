import { mat4, type ReadonlyMat4, type ReadonlyVec3, vec3 } from "gl-matrix";

/**
 * All methods return readonly vectors and matrices that are only valid until
 * the next time any methods are invoked on the camera.
 */
export interface Camera {
  position(): ReadonlyVec3;
  perspectiveProjectionMatrix(aspectRatio: number, near: number, far: number): ReadonlyMat4;
  cameraMatrix(): ReadonlyMat4;
  fov(): number;

  moveTo(position: ReadonlyVec3): ReadonlyVec3;
}

export class FixedCamera implements Camera {
  #position: vec3;
  #front: vec3;
  #up: vec3;
  #right: vec3;
  #fov: number;

  // Pre-allocate some "temporary" variable space so it doesn't get allocated
  // over and over.
  #target: vec3 = vec3.create();
  #projectionMatrix: mat4 = mat4.create();
  #cameraMatrix: mat4 = mat4.create();

  constructor(position: vec3, front: vec3, up: vec3, fov: number) {
    this.#position = position;
    this.#front = front;
    this.#up = up;
    this.#right = vec3.cross(vec3.create(), this.#front, this.#up);
    vec3.normalize(this.#right, this.#right);

    this.#fov = fov;
  }

  position(): ReadonlyVec3 {
    return this.#position;
  }

  perspectiveProjectionMatrix(aspectRatio: number, near: number, far: number): ReadonlyMat4 {
    return mat4.perspective(this.#projectionMatrix, this.#fov, aspectRatio, near, far);
  }

  cameraMatrix(): ReadonlyMat4 {
    vec3.add(this.#target, this.#position, this.#front);
    return mat4.lookAt(this.#cameraMatrix, this.#position, this.#target, this.#up);
  }

  fov(): number {
    return this.#fov;
  }

  moveTo(position: ReadonlyVec3): ReadonlyVec3 {
    vec3.copy(this.#position, position);
    return this.#position;
  }
}
