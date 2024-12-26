import { mat3, mat4, type ReadonlyMat3, type ReadonlyMat4, type ReadonlyVec3, vec3 } from "gl-matrix";
import type { CameraProperty, LightProperty, Model } from "../types.js";
import type { STL } from "./parser.js";
import { createShader, GLError, linkShaderProgram, type ShaderProgramInfo } from "../utils/gl.js";

import fragmentShaderSrc from "./fragment.glsl?raw";
import vertexShaderSrc from "./vertex.glsl?raw";

const __attributeNames = ["aPosition", "aNormal"] as const;
export type AttributeNameSTL = (typeof __attributeNames)[number];
export const ATTRIBUTE_NAMES_STL: ReadonlyArray<AttributeNameSTL> = __attributeNames;

const __uniformNames = [
  "uProjectionMatrix",
  "uCameraMatrix",
  "uModelMatrix",
  "uNormalMatrix",
  "uCameraPosition",
  "uLight.direction",
  "uLight.ambient",
  "uLight.diffuse",
  "uLight.specular",
  "uMaterial.shininess",
  "uMaterial.ambient",
  "uMaterial.diffuse",
  "uMaterial.specular",
] as const;
export type UniformNameSTL = (typeof __uniformNames)[number];
export const UNIFORM_NAMES_STL: ReadonlyArray<UniformNameSTL> = __uniformNames;

type ProgramInfo = ShaderProgramInfo<AttributeNameSTL, UniformNameSTL>;

export type STLOptions = {
  position?: vec3;
  color?: vec3;
  specularColor?: vec3;
  shininess?: number;
};

export class STLModel implements Model {
  color: vec3;
  specularColor: vec3;
  shininess: number;

  #stl: STL;
  #position: vec3;

  #programInfo: ProgramInfo;
  #vao: WebGLVertexArrayObject;
  #vertexBuffer: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext, stl: STL, options?: STLOptions) {
    this.#stl = stl;
    this.#position = options?.position ?? vec3.create();
    this.color = options?.color ?? new Float32Array([1.0, 0.5, 0.31]);
    this.specularColor = options?.specularColor ?? new Float32Array([0.5, 0.5, 0.5]);
    this.shininess = options?.shininess ?? 128;

    this.#programInfo = createProgram(gl);
    const { vao, vertexBuffer } = prepareProgram(gl, this.#programInfo, stl);
    this.#vao = vao;
    this.#vertexBuffer = vertexBuffer;

    this.#updateMatrices();
  }

  // Preallocate the memory
  #modelMatrix: mat4 = mat4.create();
  #normalMatrix: mat3 = mat3.create();

  modelMatrix(): ReadonlyMat4 {
    return this.#modelMatrix;
  }

  normalMatrix(): ReadonlyMat3 {
    return this.#normalMatrix;
  }

  position(): ReadonlyVec3 {
    return this.#position;
  }

  render(gl: WebGL2RenderingContext, camera: Readonly<CameraProperty>, light: Readonly<LightProperty>): void {
    gl.useProgram(this.#programInfo.program);

    // Set uniforms
    gl.uniformMatrix4fv(this.#programInfo.uniforms.uProjectionMatrix, false, camera.projectionMatrix);
    gl.uniformMatrix4fv(this.#programInfo.uniforms.uCameraMatrix, false, camera.cameraMatrix);
    gl.uniformMatrix4fv(this.#programInfo.uniforms.uModelMatrix, false, this.#modelMatrix);
    gl.uniformMatrix3fv(this.#programInfo.uniforms.uNormalMatrix, false, this.#normalMatrix);

    gl.uniform3fv(this.#programInfo.uniforms["uMaterial.ambient"], this.color);
    gl.uniform3fv(this.#programInfo.uniforms["uMaterial.diffuse"], this.color);
    gl.uniform3fv(this.#programInfo.uniforms["uMaterial.specular"], this.specularColor);
    gl.uniform1f(this.#programInfo.uniforms["uMaterial.shininess"], this.shininess);

    gl.uniform3fv(this.#programInfo.uniforms["uLight.ambient"], light.ambient);
    gl.uniform3fv(this.#programInfo.uniforms["uLight.diffuse"], light.diffuse);
    gl.uniform3fv(this.#programInfo.uniforms["uLight.specular"], light.specular);
    gl.uniform3fv(this.#programInfo.uniforms["uLight.direction"], light.direction);

    gl.uniform3fv(this.#programInfo.uniforms.uCameraPosition, camera.position);

    gl.bindVertexArray(this.#vao);
    // What if we want to draw multiple times with different model matrix instead of just once?
    // TODO: it seems like this way of organizing the object is wrong.
    gl.drawArrays(gl.TRIANGLES, 0, this.#stl.triangleCount * 3);

    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  #updateMatrices(): void {
    mat4.identity(this.#modelMatrix);
    mat4.translate(this.#modelMatrix, this.#modelMatrix, this.#position);

    mat3.normalFromMat4(this.#normalMatrix, this.#modelMatrix);
  }
}

function createProgram(gl: WebGL2RenderingContext): ProgramInfo {
  return linkShaderProgram<AttributeNameSTL, UniformNameSTL>(
    gl,
    createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc),
    createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc),
    ATTRIBUTE_NAMES_STL,
    UNIFORM_NAMES_STL,
  );
}

function prepareProgram(
  gl: WebGL2RenderingContext,
  program: ProgramInfo,
  stl: STL,
): { vao: WebGLVertexArrayObject; vertexBuffer: WebGLBuffer } {
  const vao = gl.createVertexArray();
  if (vao == null) {
    throw new GLError("cannot create vao");
  }

  const vertexBuffer = gl.createBuffer();
  if (vertexBuffer == null) {
    throw new GLError("cannot create vertex buffer");
  }

  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, stl.vertices, gl.STATIC_DRAW);

  gl.vertexAttribPointer(program.attributes.aPosition, 3, gl.FLOAT, false, stl.vertices.BYTES_PER_ELEMENT * 6, 0);
  gl.enableVertexAttribArray(program.attributes.aPosition);

  gl.vertexAttribPointer(
    program.attributes.aNormal,
    3,
    gl.FLOAT,
    false,
    stl.vertices.BYTES_PER_ELEMENT * 6,
    stl.vertices.BYTES_PER_ELEMENT * 3,
  );
  gl.enableVertexAttribArray(program.attributes.aNormal);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    vao,
    vertexBuffer,
  };
}
