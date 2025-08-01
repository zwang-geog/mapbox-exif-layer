import {Evented} from 'mapbox-gl';
import ExifReader from 'exifreader';

const vertexShader = `
    precision mediump float;
    
    attribute vec2 a_pos;
    uniform mat4 u_matrix;
    uniform vec4 u_bounds;  // [minX, maxY, maxX, minY]
    
    varying vec2 v_tex_pos;
    
    const float PI = 3.141592653589793;
    
    vec2 latLngToMercator(vec2 lnglat) {
        // Convert lng/lat to Web Mercator coordinates in [0, 1] range
        float x = (lnglat.x + 180.0) / 360.0;  // Convert longitude to [0,1]
        
        // Convert latitude to y coordinate using Web Mercator projection
        float latRad = lnglat.y * PI / 180.0;
        float y = 0.5 - (log(tan(PI / 4.0 + latRad / 2.0)) / (2.0 * PI));
        
        // y is already in [0,1] range
        return vec2(x, y);
    }
    
    void main() {
        // Map input position [0,1] to geographic bounds
        float lng = mix(u_bounds[0], u_bounds[2], a_pos.x);
        float lat = mix(u_bounds[3], u_bounds[1], a_pos.y);
        
        // Convert to Web Mercator coordinates in [0,1] range
        vec2 mercator = latLngToMercator(vec2(lng, lat));
        
        // Pass texture coordinates
        v_tex_pos = vec2(a_pos.x, 1.0 - a_pos.y);
        
        // Apply matrix transformation
        gl_Position = u_matrix * vec4(mercator, 0, 1);
    }
`;

const fragmentShader = `
    precision mediump float;
    
    uniform sampler2D u_image;
    uniform sampler2D u_colormap;
    uniform float u_opacity;
    uniform vec2 u_value_range;  // [min, max] of original values
    
    varying vec2 v_tex_pos;
    
    void main() {
        // Get the R value from the source image
        vec4 pixel = texture2D(u_image, v_tex_pos);
        float normalized = pixel.r;
        
        // Use value as index into colormap
        vec4 color = texture2D(u_colormap, vec2(normalized, 0.5));
        
        // Apply global opacity
        gl_FragColor = vec4(color.rgb, color.a * u_opacity);
    }
`;

function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }

    const wrapper = {program: program};

    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
        const attribute = gl.getActiveAttrib(program, i);
        wrapper[attribute.name] = gl.getAttribLocation(program, attribute.name);
    }
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
        const uniform = gl.getActiveUniform(program, i);
        wrapper[uniform.name] = gl.getUniformLocation(program, uniform.name);
    }

    return wrapper;
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function createTexture(gl, filter, data, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    
    if (data instanceof Uint8Array) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    return texture;
}

function createBuffer(gl, data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
}

function createColormap(gl, colors, valueRange) {
    // Sort colors by value
    colors.sort((a, b) => a[0] - b[0]);
    
    // Create a 256x1 texture for the colormap
    const data = new Uint8Array(256 * 4);
    const [minVal, maxVal] = valueRange;
    
    // Fill the colormap texture
    for (let i = 0; i < 256; i++) {
        // Convert texture position [0,255] to actual data value
        const value = minVal + (maxVal - minVal) * (i / 255);
        
        // Find the color stops that bracket this value
        let lowIndex = 0;
        while (lowIndex < colors.length - 1 && colors[lowIndex + 1][0] < value) {
            lowIndex++;
        }
        const highIndex = Math.min(lowIndex + 1, colors.length - 1);
        
        // Interpolate between the two colors
        const low = colors[lowIndex];
        const high = colors[highIndex];
        const t = highIndex > lowIndex ? 
            (value - low[0]) / (high[0] - low[0]) : 0;
            
        const idx = i * 4;
        for (let j = 0; j < 3; j++) {
            data[idx + j] = Math.round(low[1][j] + t * (high[1][j] - low[1][j]));
        }

        if (low[1][3] != null && low[1][3] != 255) {
            data[idx + 3] = low[1][3];
        }
        else {
            data[idx + 3] = 255;
        }
    }
    
    return createTexture(gl, gl.NEAREST, data, 256, 1);
}

export default class SmoothRaster extends Evented {
    constructor({id, source, color, bounds, opacity = 1.0, readyForDisplay = false}) {
        super();
        
        this.id = id;
        this.type = 'custom';
        this.renderingMode = '2d';
        
        this.source = source;
        this.color = color;
        this.opacity = opacity;
        this.bounds = bounds;
        
        this.sourceLoaded = false;
        this.readyForDisplay = readyForDisplay;
    }

    onAdd(map, gl) {
        this.map = map;
        this.gl = gl;

        // Create program
        this.program = createProgram(gl, vertexShader, fragmentShader);

        // Create vertex buffer for a full-screen quad
        const vertices = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            0, 1,
            1, 0,
            1, 1
        ]);
        this.vertexBuffer = createBuffer(gl, vertices);

        // Load source image
        this.setSource(this.source);
    }

    setSource(source, color = null) {
        if (this.source != source) {
            this.source = source;
        }

        if (color != null) {
            this.color = color;
        }

        const image = new Image();
        image.crossOrigin = "anonymous";
        
        fetch(source, {
            cache: 'no-store'
        })
            .then(response => 
                Promise.all([
                    response.clone().blob(),
                    response.arrayBuffer().then(buffer => new Uint8Array(buffer).buffer)
                ])
            )
            .then(([blob, arrayBuffer]) => {
                const objectURL = URL.createObjectURL(blob);

                // Set default value range if EXIF reading fails
                this.valueRange = [0, 255];  // Default range
                
                (async () => {
                    try {
                        const tags = await ExifReader.load(arrayBuffer);
                        
                        if (tags["ImageDescription"] && tags["ImageDescription"].description) {
                            const description = tags["ImageDescription"].description;
                            
                            const matches = description.match(/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                            if (matches) {
                                const min = parseFloat(matches[1]);
                                const max = parseFloat(matches[2]);
                                
                                if (!isNaN(min) && !isNaN(max)) {
                                    this.valueRange = [min, max];
                                }
                            }
                        }
                        
                        // Then define onload handler
                        image.onload = () => {
                            URL.revokeObjectURL(objectURL);
                            if (this.gl) {
                                this.sourceTexture = createTexture(this.gl, this.gl.LINEAR, image);
                                if (this.valueRange) {
                                    this.colormapTexture = createColormap(this.gl, this.color, this.valueRange);
                                }
                                this.sourceLoaded = true;
                                if (this.map) {
                                    this.map.triggerRepaint();
                                }
                            }
                        };

                        image.onerror = (err) => {
                            URL.revokeObjectURL(objectURL);
                            console.error('Error loading source image:', err);
                        };
                        // Always proceed to load the image, even if EXIF parsing fails
                        image.src = objectURL;
                    } catch (error) {
                        console.warn('Error reading EXIF data:', error);
                        // Still proceed with loading the image
                        image.src = objectURL;
                    }
                })();
            })
            .catch(error => {
                console.error('Error fetching image:', error);
            });
    }

    onRemove() {
        // Clean up WebGL resources
        const gl = this.gl;
        if (!gl) return;

        // Delete textures
        if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
        if (this.colormapTexture) gl.deleteTexture(this.colormapTexture);

        // Delete buffer
        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);

        // Delete shaders and program
        if (this.program) {
            const shaders = gl.getAttachedShaders(this.program.program);
            if (shaders) {
                shaders.forEach(shader => gl.deleteShader(shader));
            }
            gl.deleteProgram(this.program.program);
        }

        // Clear references
        this.sourceTexture = null;
        this.colormapTexture = null;
        this.vertexBuffer = null;
        this.program = null;
        this.gl = null;
        this.map = null;
        this.sourceLoaded = false;
    }

    render(gl, matrix) {
        // Only render if source is loaded
        if (!this.sourceLoaded || !this.readyForDisplay) return;
        
        gl.useProgram(this.program.program);

        // Set up blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        //gl.blendEquation(gl.FUNC_ADD);

        // Set uniforms
        gl.uniformMatrix4fv(this.program.u_matrix, false, matrix);
        gl.uniform4fv(this.program.u_bounds, this.bounds);
        gl.uniform1f(this.program.u_opacity, this.opacity);
        gl.uniform2fv(this.program.u_value_range, this.valueRange);

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.uniform1i(this.program.u_image, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.colormapTexture);
        gl.uniform1i(this.program.u_colormap, 1);

        // Draw quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(this.program.a_pos);
        gl.vertexAttribPointer(this.program.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.disable(gl.BLEND);
    }
} 