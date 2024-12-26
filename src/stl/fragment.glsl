#version 300 es
precision mediump float;

struct MaterialProperty {
  vec3 ambient;
  vec3 diffuse;
  vec3 specular;
  float shininess;
};

struct LightProperty {
  vec3 ambient;
  vec3 diffuse;
  vec3 specular;

  vec3 direction;
};

uniform vec3 uCameraPosition; // Can this be derived from the camera matrix?

uniform LightProperty uLight;
uniform MaterialProperty uMaterial;

in vec3 vFragPosition;
in vec3 vNormal;

out vec4 fragColor;

void main() {
  vec3 norm = normalize(vNormal);
  vec3 lightDir = normalize(-uLight.direction);
  vec3 viewDir = normalize(uCameraPosition - vFragPosition);
  vec3 reflectDir = reflect(-lightDir, norm);

  vec3 ambient = uLight.ambient * uMaterial.ambient;

  float diff = max(dot(norm, lightDir), 0.0);
  vec3 diffuse = uLight.diffuse * diff * uMaterial.diffuse;

  float spec = pow(max(dot(viewDir, reflectDir), 0.0), uMaterial.shininess);
  vec3 specular = uLight.specular * spec * uMaterial.specular;

  fragColor = vec4(ambient + diffuse + specular, 1.0);
}
