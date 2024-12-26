#version 300 es
precision mediump float;

in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uProjectionMatrix;
uniform mat4 uCameraMatrix;
uniform mat4 uModelMatrix;
uniform mat3 uNormalMatrix;

out vec3 vNormal;
out vec3 vFragPosition;

void main() {
  vec4 fragPosition = uModelMatrix * vec4(aPosition, 1.0);

  gl_Position = uProjectionMatrix * uCameraMatrix * fragPosition;

  vNormal = normalize(uNormalMatrix * aNormal);
  vFragPosition = vec3(gl_Position);
}
