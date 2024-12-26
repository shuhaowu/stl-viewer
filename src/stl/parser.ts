import { vec3 } from "gl-matrix";

export class STLParseError extends Error {}

type BoundingBox = {
  min: vec3; // vec3 for x, y, z respectively
  max: vec3;
  center: vec3; // mid point between min and max
  scale: vec3; // max - min for each direction
};

export class STL {
  static async loadFromUrl(url: string): Promise<STL> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();

    return STL.parse(data);
  }

  static parse(data: ArrayBuffer): STL {
    if (data.byteLength < 84) {
      throw new STLParseError(`data has ${data.byteLength} bytes which is less than the required 84 bytes`);
    }

    let i = 80;
    const view = new DataView(data);

    // Take a copy of the header
    const header = data.slice(0, i);

    // Check make sure we don't have a ASCII STL file
    const decoder = new TextDecoder();
    const maybeHeaderStr = decoder.decode(header);
    if (maybeHeaderStr.indexOf("solid") !== -1) {
      throw new STLParseError("plain text STL file is not supported!");
    }

    // Read the triangle count
    const triangleCount = view.getUint32(i, true);
    i += 4;

    // Validate the file size
    const expectedByteLength = 84 + triangleCount * 50;
    if (data.byteLength !== expectedByteLength) {
      throw new STLParseError(
        `expected STL file to be ${expectedByteLength} bytes with ${triangleCount} triangles, but got ${data.byteLength} instead`,
      );
    }

    // Allocate the arrays
    const vertices: Float32Array = new Float32Array(2 * 9 * triangleCount);
    const attributeBytes = new Uint16Array(triangleCount);

    // So we don't allocate over and over in the loop.
    const v12 = new Float32Array(3);
    const v13 = new Float32Array(3);
    const normal = new Float32Array(3);

    for (let j = 0; j < triangleCount; j++) {
      normal[0] = view.getFloat32(i, true);
      i += 4;
      normal[1] = view.getFloat32(i, true);
      i += 4;
      normal[2] = view.getFloat32(i, true);
      i += 4;

      // Read vertices, but in xyzabc format, where xyz are the position and abc are the normal xyzs.
      vertices[j * 18 + 0] = view.getFloat32(i, true);
      i += 4;
      vertices[j * 18 + 1] = view.getFloat32(i, true);
      i += 4;
      vertices[j * 18 + 2] = view.getFloat32(i, true);
      i += 4;

      vertices[j * 18 + 6] = view.getFloat32(i, true);
      i += 4;
      vertices[j * 18 + 7] = view.getFloat32(i, true);
      i += 4;
      vertices[j * 18 + 8] = view.getFloat32(i, true);
      i += 4;

      vertices[j * 18 + 12] = view.getFloat32(i, true);
      i += 4;
      vertices[j * 18 + 13] = view.getFloat32(i, true);
      i += 4;
      vertices[j * 18 + 14] = view.getFloat32(i, true);
      i += 4;

      const v1 = new Float32Array(vertices.buffer, (j * 18 + 0) * Float32Array.BYTES_PER_ELEMENT, 3);
      const v2 = new Float32Array(vertices.buffer, (j * 18 + 6) * Float32Array.BYTES_PER_ELEMENT, 3);
      const v3 = new Float32Array(vertices.buffer, (j * 18 + 12) * Float32Array.BYTES_PER_ELEMENT, 3);

      const n1 = new Float32Array(vertices.buffer, (j * 18 + 3) * Float32Array.BYTES_PER_ELEMENT, 3);

      vec3.subtract(v12, v2, v1);
      vec3.subtract(v13, v3, v1);
      vec3.cross(n1, v12, v13);
      vec3.normalize(n1, n1);

      if (vec3.sqrDist(n1, normal) > 0.1) {
        console.warn(`triangle ${j} has invalid normal (${normal}) when calculate to be ${n1}`);
      }

      // Don't need to set +3, +4, +5 because n1 already set it.

      vertices[j * 18 + 9] = n1[0];
      vertices[j * 18 + 10] = n1[1];
      vertices[j * 18 + 11] = n1[2];

      vertices[j * 18 + 15] = n1[0];
      vertices[j * 18 + 16] = n1[1];
      vertices[j * 18 + 17] = n1[2];

      // Read the attribute byte
      attributeBytes[j] = view.getUint16(i, true);
      i += 2;
    }

    return new STL(header, triangleCount, vertices, attributeBytes);
  }

  readonly header: ArrayBuffer;

  readonly triangleCount: number;

  // These are just all the vertices in xyzabc xyzabc xyzabc order.
  // xyz are the vertex coordinates while abc are the normal.
  // Each group of 3 vertices forms a single triangle.
  readonly vertices: Float32Array;

  readonly attributeBytes: Uint16Array;

  readonly boundingBox: BoundingBox;

  private constructor(header: ArrayBuffer, triangleCount: number, vertices: Float32Array, attributeBytes: Uint16Array) {
    this.header = header;
    this.triangleCount = triangleCount;
    this.vertices = vertices;
    this.attributeBytes = attributeBytes;

    this.boundingBox = {
      min: new Float32Array([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]),
      max: new Float32Array([Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]),
      center: new Float32Array([0, 0, 0]),
      scale: new Float32Array([0, 0, 0]),
    };

    // TODO: this can be optimized by combining into the .parse code.
    for (let i = 0; i < this.triangleCount * 3; i++) {
      const x = this.vertices[i * 6 + 0];
      const y = this.vertices[i * 6 + 1];
      const z = this.vertices[i * 6 + 2];

      if (x < this.boundingBox.min[0]) {
        this.boundingBox.min[0] = x;
      }

      if (x > this.boundingBox.max[0]) {
        this.boundingBox.max[0] = x;
      }

      if (y < this.boundingBox.min[1]) {
        this.boundingBox.min[1] = y;
      }

      if (y > this.boundingBox.max[1]) {
        this.boundingBox.max[1] = y;
      }

      if (z < this.boundingBox.min[2]) {
        this.boundingBox.min[2] = z;
      }

      if (z > this.boundingBox.max[2]) {
        this.boundingBox.max[2] = z;
      }
    }

    this.boundingBox.scale[0] = this.boundingBox.max[0] - this.boundingBox.min[0];
    this.boundingBox.scale[1] = this.boundingBox.max[1] - this.boundingBox.min[1];
    this.boundingBox.scale[2] = this.boundingBox.max[2] - this.boundingBox.min[2];

    this.boundingBox.center[0] = (this.boundingBox.min[0] + this.boundingBox.max[0]) / 2;
    this.boundingBox.center[1] = (this.boundingBox.min[1] + this.boundingBox.max[1]) / 2;
    this.boundingBox.center[2] = (this.boundingBox.min[2] + this.boundingBox.max[2]) / 2;
  }
}
