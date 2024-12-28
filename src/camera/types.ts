import type { ReadonlyMat4, ReadonlyVec3 } from "gl-matrix";

/**
 * All methods return readonly vectors and matrices that are only valid until
 * the next time any methods are invoked on the camera.
 */
export interface Camera {
  position(): ReadonlyVec3;
  perspectiveProjectionMatrix(aspectRatio: number, near: number, far: number): ReadonlyMat4;
  cameraMatrix(): ReadonlyMat4;
  fov(): number;

  update(dt: number): void;

  moveTo(position: ReadonlyVec3, up: ReadonlyVec3): ReadonlyVec3;
}
