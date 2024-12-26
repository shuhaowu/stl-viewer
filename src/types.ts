import type { ReadonlyMat3, ReadonlyMat4, ReadonlyVec3, vec3 } from "gl-matrix";

export interface Model {
  modelMatrix(): ReadonlyMat4;
  normalMatrix(): ReadonlyMat3;

  position(): ReadonlyVec3;
}

export type LightProperty = {
  ambient: vec3;
  diffuse: vec3;
  specular: vec3;

  direction: vec3;
};

export type CameraProperty = {
  projectionMatrix: ReadonlyMat4;
  cameraMatrix: ReadonlyMat4;
  position: ReadonlyVec3;
};
