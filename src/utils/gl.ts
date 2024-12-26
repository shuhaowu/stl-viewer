export class GLError extends Error {}

export type ShaderProgramInfo<AttributeName extends string, UniformName extends string> = {
  program: WebGLProgram;
  attributes: Record<AttributeName, number>;
  uniforms: Record<UniformName, WebGLUniformLocation>;
};

export function createShader(gl: WebGL2RenderingContext, type: GLenum, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader == null) {
    throw new GLError("cannot create shader");
  }

  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new GLError(`cannot compile shader: ${gl.getShaderInfoLog(shader)}`);
  }

  return shader;
}

export function linkShaderProgram<AttributeName extends string, UniformName extends string>(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
  attributeNames: ReadonlyArray<AttributeName>,
  uniformNames: ReadonlyArray<UniformName>,
): ShaderProgramInfo<AttributeName, UniformName> {
  const program = gl.createProgram();
  if (program == null) {
    throw new GLError("cannot create program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const msg = `cannot link program: ${gl.getProgramInfoLog(program)}`;
    gl.deleteProgram(program);
    throw new GLError(msg);
  }

  gl.validateProgram(program);
  if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
    const msg = `cannot validate program: ${gl.getProgramInfoLog(program)}`;
    gl.deleteProgram(program);
    throw new GLError(msg);
  }

  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  const attributes: Record<string, number> = {};
  const uniforms: Record<string, WebGLUniformLocation> = {};

  try {
    for (const attributeName of attributeNames) {
      const loc = gl.getAttribLocation(program, attributeName);
      attributes[attributeName] = loc;
      if (loc === -1) {
        console.warn(`cannot find attribute ${attributeName}`);
      }
    }

    for (const uniformName of uniformNames) {
      const loc = gl.getUniformLocation(program, uniformName);
      if (loc == null) {
        throw new GLError(`cannot find uniform ${uniformName}`);
      }

      uniforms[uniformName] = loc;
    }
  } finally {
    gl.useProgram(null);
  }

  return {
    program,
    attributes,
    uniforms,
  };
}
