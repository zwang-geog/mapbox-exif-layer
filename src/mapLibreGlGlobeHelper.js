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
