// MapLibre custom-layer projection uniforms (used when render vertex shader uses projectTile).
export function setProjectionUniforms(gl, program, defaultProjectionData) {
    gl.uniformMatrix4fv(
        gl.getUniformLocation(program, 'u_projection_fallback_matrix'),
        false,
        defaultProjectionData.fallbackMatrix
    );
    gl.uniformMatrix4fv(
        gl.getUniformLocation(program, 'u_projection_matrix'),
        false,
        defaultProjectionData.mainMatrix
    );
    gl.uniform4f(
        gl.getUniformLocation(program, 'u_projection_tile_mercator_coords'),
        ...defaultProjectionData.tileMercatorCoords
    );
    gl.uniform4f(
        gl.getUniformLocation(program, 'u_projection_clipping_plane'),
        ...defaultProjectionData.clippingPlane
    );
    gl.uniform1f(
        gl.getUniformLocation(program, 'u_projection_transition'),
        defaultProjectionData.projectionTransition
    );
}

// Inject MapLibre projection prelude so projectTile() handles mercator and globe.
// vertexShaderInner must contain a {{PROJECTION}} placeholder for gl_Position.
export function buildMapLibreVertexShader(shaderData, vertexShaderInner) {
    return `#version 300 es
    ${shaderData.vertexShaderPrelude}
    ${shaderData.define}
    ${vertexShaderInner.replace('{{PROJECTION}}', 'gl_Position = projectTile(mercator);')}`;
}

const GLOBE_SUBDIVISION_MIN = 4;
const GLOBE_SUBDIVISION_MAX = 128;

export function computeGlobeSubdivisions(bounds) {
    const lonSpan = bounds[2] - bounds[0];
    const latSpan = bounds[3] - bounds[1];
    const nCols = Math.min(GLOBE_SUBDIVISION_MAX, Math.max(GLOBE_SUBDIVISION_MIN, Math.round(lonSpan)));
    const nRows = Math.min(GLOBE_SUBDIVISION_MAX, Math.max(GLOBE_SUBDIVISION_MIN, Math.round(latSpan)));
    return {nCols, nRows};
}

// Subdivide bounds-normalized [0,1]² into an nCols×nRows grid for MapLibre globe projection.
export function createGlobeMesh(bounds) {
    const {nCols, nRows} = computeGlobeSubdivisions(bounds);
    const vertexCols = nCols + 1;
    const vertexRows = nRows + 1;
    const vertices = new Float32Array(vertexCols * vertexRows * 2);

    let i = 0;
    for (let row = 0; row < vertexRows; row++) {
        for (let col = 0; col < vertexCols; col++) {
            vertices[i++] = col / nCols;
            vertices[i++] = row / nRows;
        }
    }

    const indices = [];
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const topLeft = row * vertexCols + col;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + vertexCols;
            const bottomRight = bottomLeft + 1;
            indices.push(topLeft, bottomLeft, topRight);
            indices.push(topRight, bottomLeft, bottomRight);
        }
    }

    return {
        vertices,
        indices: new Uint16Array(indices),
        indexCount: indices.length,
        nCols,
        nRows,
    };
}

export function createIndexBuffer(gl, indices) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return buffer;
}
