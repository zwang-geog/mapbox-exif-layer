import {Evented} from 'mapbox-gl';
import ExifReader from 'exifreader';

const vertexShader = 
    `#version 300 es
    precision mediump float;
    
    in vec2 a_position;  // Current position [0,1]
    in float a_age;      // Particle age for tracking circular patterns
    out vec2 v_position; // Updated position for transform feedback
    out float v_age;     // Updated age for transform feedback
    
    uniform sampler2D u_velocity_texture;  // Texture with normalized velocities [0,1]
    uniform mediump vec4 u_bounds;
    uniform mediump float u_speed_factor;
    uniform mediump float u_time;
    uniform mediump vec2 u_value_range_u;    // Wind U component range
    uniform mediump vec2 u_value_range_v;    // Wind V component range
    uniform mediump float u_age_threshold;   // Age threshold for reset probability
    uniform mediump float u_max_age;         // Maximum age before forced reset
    uniform mediump float u_percent_reset;   // Percentage of particles to reset on source update
    uniform bool u_should_reset;     // Flag to indicate if we should apply the percentage reset
    
    // Random function based on time and position
    float random(vec2 co) {
        float a = 12.9898;
        float b = 78.233;
        float c = 43758.5453;
        float dt = dot(co, vec2(a,b));
        float sn = mod(dt, 3.14);
        return fract(sin(sn) * c + u_time);
    }
    
    // Convert mph to degrees per frame
    vec2 mphToDegreesPerFrame(vec2 mph, float lat) {
        float kmh_to_degrees = 1.60934 / 111.32;  // Convert mph to km/h, then to degrees
        float latScale = cos(lat * 3.14159 / 180.0);  // Latitude scaling for longitude
        return vec2(mph.x * kmh_to_degrees / latScale, -mph.y * kmh_to_degrees);
    }
    
    // Function to generate random position within extent
    vec2 generateRandomPosition(vec2 seed) {
        return vec2(
            random(seed + vec2(1.23, 4.56)),
            random(seed + vec2(7.89, 0.12))
        );
    }
    
    // Function to generate a position on one of the boundaries
    vec2 generateBoundaryPosition(vec2 seed) {
        // Choose which boundary (0=left, 1=top, 2=right, 3=bottom)
        float boundary = floor(random(seed) * 4.0);
        
        // Position along the boundary
        float pos = random(seed + vec2(boundary));
        
        // Small offset to prevent immediate out-of-bounds
        float offset = 0.001;
        
        if (boundary < 1.0) { // Left
            return vec2(offset, pos);
        } else if (boundary < 2.0) { // Top
            return vec2(pos, offset);
        } else if (boundary < 3.0) { // Right
            return vec2(1.0 - offset, pos);
        } else { // Bottom
            return vec2(pos, 1.0 - offset);
        }
    }
    
    void main() {
        // Sample normalized velocity from texture [0,1]
        vec4 velocity = texture(u_velocity_texture, a_position);
        
        // Denormalize velocities to actual mph values
        float u = mix(u_value_range_u[0], u_value_range_u[1], velocity.r);
        float v = mix(u_value_range_v[0], u_value_range_v[1], velocity.g);
        
        // Calculate wind speed
        float windSpeed = length(vec2(u, v));
        
        // Convert position to geographic coordinates
        float lng = mix(u_bounds[0], u_bounds[2], a_position.x);
        float lat = mix(u_bounds[3], u_bounds[1], 1.0 - a_position.y);
        
        // Convert wind velocity to degree offsets using actual mph values
        vec2 degrees = mphToDegreesPerFrame(vec2(u, v), lat);
        
        // Convert degree offsets back to normalized coordinates
        vec2 normalizedVelocity = vec2(
            degrees.x / (u_bounds[2] - u_bounds[0]),
            degrees.y / (u_bounds[1] - u_bounds[3])
        );
        
        // Update position with velocity
        vec2 newPos = a_position + normalizedVelocity * u_speed_factor;
        
        // Reset rules
        bool shouldReset = false;
        
        // Get current age of particle and increment
        float age = a_age + 1.0;
        
        // Reset if out of bounds or very low wind speed
        if (newPos.x < 0.0 || newPos.x > 1.0 || newPos.y < 0.0 || newPos.y > 1.0 || windSpeed < 1.5) {
            shouldReset = true;
        }
        
        // Reset based on age with increasing probability
        if (age > u_age_threshold) {
            float resetProbability = (age - u_age_threshold) / (u_max_age - u_age_threshold);
            if (random(a_position + vec2(u_time * 0.1, age * 0.01)) < resetProbability) {
                shouldReset = true;
            }
        }
        
        // Force reset of very old particles
        if (age > u_max_age) {
            shouldReset = true;
        }
        
        // Additional reset based on percentParticleWhenSetSource if flag is set
        if (!shouldReset && u_should_reset) {
            if (random(a_position + vec2(u_time)) < u_percent_reset) {
                shouldReset = true;
            }
        }
        
        // Handle reset by generating a new position
        if (shouldReset) {
            newPos = generateRandomPosition(a_position + vec2(u_time));

            age = 0.0; // Reset age
        }
        
        v_position = newPos;
        v_age = age;
    }
`;

const fragmentShader = 
    `#version 300 es
    precision mediump float;
    
    uniform sampler2D u_wind_color;  // Colormap texture
    uniform sampler2D u_velocity_texture;  // Wind velocity texture
    uniform mediump float u_opacity;         // Global opacity control
    uniform mediump vec2 u_value_range_u;    // Wind U component range
    uniform mediump vec2 u_value_range_v;    // Wind V component range
    uniform mediump vec2 u_speed_range;      // Speed range for normalization
    
    in vec2 v_position;         // Current position
    out vec4 fragColor;         // Output color
    
    void main() {
        // Calculate distance from center for circular particles
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        
        // Discard pixels outside the circle
        if (dist > 0.5) {
            discard;
        }
        
        // Create soft-edged circular particles
        float edgeFactor = 1.0 - smoothstep(0.45, 0.5, dist);
        
        // Sample wind velocity for coloring
        vec4 velocity = texture(u_velocity_texture, v_position);
        float u = mix(u_value_range_u[0], u_value_range_u[1], velocity.r);
        float v = mix(u_value_range_v[0], u_value_range_v[1], velocity.g);
        float speed = length(vec2(u, v));
        float normalizedSpeed = (speed - u_speed_range[0]) / (u_speed_range[1] - u_speed_range[0]);
        
        // Sample color from colormap using normalized speed
        vec4 color = texture(u_wind_color, vec2(normalizedSpeed, 0.5));
        
        // Ensure we have some minimum color intensity
        color.rgb = max(color.rgb, vec3(0.2));
        
        // Combine edge fade with opacity
        float finalAlpha = edgeFactor * u_opacity;
        
        // Output final color with alpha
        fragColor = vec4(color.rgb, finalAlpha);
    }
`;

const renderVertexShader = 
    `#version 300 es
    precision mediump float;
    
    in vec2 a_position;      // Position in [0,1] range
    in float a_trail_offset; // Trail offset (0=main particle, 1,2,3=trail segments)
    
    uniform mediump mat4 u_matrix;
    uniform mediump vec4 u_bounds;         // [minX, maxY, maxX, minY]
    uniform mediump float u_point_size;    // Base point size
    uniform mediump float u_speed_factor;  // Speed multiplier
    uniform mediump float u_trail_size_decay; // Size decay rate for trail particles
    uniform sampler2D u_velocity_texture;  // Velocity texture
    uniform mediump vec2 u_value_range_u;  // Wind U component range
    uniform mediump vec2 u_value_range_v;  // Wind V component range
    
    out vec2 v_position;     // Pass position to fragment shader
    // out float v_opacity;     // Varying opacity for trail
    
    const float PI = 3.141592653589793;
    
    vec2 latLngToMercator(vec2 lnglat) {
        // Convert lng/lat to Web Mercator coordinates in [0, 1] range
        float x = (lnglat.x + 180.0) / 360.0;  // Convert longitude to [0,1]
        
        // Convert latitude to y coordinate using Web Mercator projection
        float latRad = lnglat.y * PI / 180.0;
        float y = 0.5 - (log(tan(PI / 4.0 + latRad / 2.0)) / (2.0 * PI));
        
        return vec2(x, y);
    }
    
    // Convert position to geographic coordinates
    vec2 positionToGeo(vec2 pos) {
        float lng = mix(u_bounds[0], u_bounds[2], pos.x);
        float lat = mix(u_bounds[3], u_bounds[1], 1.0 - pos.y); // Invert y for correct mapping
        return vec2(lng, lat);
    }
    
    // Convert mph to degrees per frame
    vec2 mphToDegreesPerFrame(vec2 mph, float lat) {
        float kmh_to_degrees = 1.60934 / 111.32;  // Convert mph to km/h, then to degrees
        float latScale = cos(lat * 3.14159 / 180.0);  // Latitude scaling for longitude
        return vec2(mph.x * kmh_to_degrees / latScale, -mph.y * kmh_to_degrees);
    }
    
    void main() {
        // Trail offset (0 = main particle, >0 = trail segment)
        float trailOffset = a_trail_offset;
        
        // Main particle position from buffer
        vec2 mainPos = a_position;
        
        // Current position is main position for main particle (offset=0)
        vec2 currentPos = mainPos;
        
        // Sample velocity at the main particle's position
        vec4 velocityData = texture(u_velocity_texture, mainPos);
        float u = mix(u_value_range_u[0], u_value_range_u[1], velocityData.r);
        float v = mix(u_value_range_v[0], u_value_range_v[1], velocityData.g);
        
        // Calculate velocity in normalized coordinates
        vec2 geo = positionToGeo(mainPos);
        vec2 degrees = mphToDegreesPerFrame(vec2(u, v), geo.y);
        vec2 velocity = vec2(
            degrees.x / (u_bounds[2] - u_bounds[0]),
            degrees.y / (u_bounds[1] - u_bounds[3])
        );
        
        if (trailOffset > 0.0) {
            // Compute trail position by moving backwards from main particle along its velocity path
            // The strength of the offset is based on trail segment position
            currentPos = mainPos - velocity * u_speed_factor * trailOffset * 1.5;
        }
        
        // Convert normalized position to geographic coordinates
        float lng = mix(u_bounds[0], u_bounds[2], currentPos.x);
        float lat = mix(u_bounds[3], u_bounds[1], 1.0 - currentPos.y);
        
        // Project to Web Mercator
        vec2 mercator = latLngToMercator(vec2(lng, lat));
        gl_Position = u_matrix * vec4(mercator, 0, 1);
        
        // Pass position to fragment shader
        v_position = currentPos;
        
        // Compute opacity for trail particles (1.0 for main particle, decreasing for trail)
        // v_opacity = trailOffset == 0.0 ? 1.0 : 1.0 - (trailOffset / float(3));
        
        // Compute point size (decreasing for trail particles)
        float size = trailOffset == 0.0 ? u_point_size : u_point_size * pow(u_trail_size_decay, trailOffset);
        gl_PointSize = size;
    }
`;

const updateFragmentShader = 
    `#version 300 es
    precision mediump float;
    
    out vec4 fragColor;
    
    void main() {
        // For update step, we don't need to output anything visual
        // We're just using transform feedback to capture the new positions
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
`;

function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // Specify transform feedback varyings if this is the update program
    if (vertexSource.includes('out vec2 v_position')) {
        // Check if we also have age tracking
        if (vertexSource.includes('out float v_age')) {
            gl.transformFeedbackVaryings(program, ['v_position', 'v_age'], gl.SEPARATE_ATTRIBS);
        } else {
            gl.transformFeedbackVaryings(program, ['v_position'], gl.SEPARATE_ATTRIBS);
        }
    }

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
    } else if (data instanceof Image) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
        // For null data (empty texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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
        data[idx + 3] = 255;
    }
    
    return createTexture(gl, gl.LINEAR, data, 256, 1);
}

// Add unit conversion functions before the class definition
function kphToMph(kph) {
    return kph * 0.621371;
}

function mpsToMph(mps) {
    return mps * 2.23694;
}

export default class ParticleMotion extends Evented {
    constructor({id, source, color, bounds, particleCount = 5000, readyForDisplay = false, ageThreshold = 500, maxAge = 1000,
        velocityFactor = 0.05, fadeOpacity = 0.9, updateInterval = 50, pointSize = 5.0, trailLength = 3, trailSizeDecay = 0.8, unit = 'mph'}) {
        super();
        
        this.id = id;
        this.type = 'custom';
        this.renderingMode = '2d';
        
        this.source = source;
        this.color = color;
        this.bounds = bounds;
        this.particleCount = particleCount;
        
        this.sourceLoaded = false;
        this.readyForDisplay = readyForDisplay;
        
        // Particle behavior settings
        this.velocityFactor = velocityFactor;     // Speed multiplier for particle motion
        this.fadeOpacity = fadeOpacity;         // Global opacity for particles
        this.updateInterval = updateInterval;       // Minimum time (ms) between particle updates
        this.pointSize = pointSize;           // Size of particles in pixels
        
        // Trail settings
        this.trailLength = trailLength;           // Number of trailing particles per main particle
        this.trailSizeDecay = trailSizeDecay;      // How quickly the point size decreases for trail particles
        
        // Age-based reset settings
        this.ageThreshold = ageThreshold; // Age threshold before reset probability increases
        this.maxAge = maxAge;           // Maximum age before forced reset
        
        // Default speed range in case we can't read from EXIF
        this.speedRange = [0, 100];
        
        this.unit = unit;  // Store the unit
    }

    onAdd(map, gl) {
        this.map = map;
        this.gl = gl;

        // Create programs with appropriate fragment shaders
        this.updateProgram = createProgram(gl, vertexShader, updateFragmentShader);
        this.renderProgram = createProgram(gl, renderVertexShader, fragmentShader);

        // Initialize particle positions with a uniform grid distribution
        const positions = new Float32Array(this.particleCount * 2);
        const ages = new Float32Array(this.particleCount);
        const gridSize = Math.ceil(Math.sqrt(this.particleCount));
        
        for (let i = 0; i < this.particleCount; i++) {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            
            // Calculate base position in [0,1] range
            const baseX = x / (gridSize - 1);
            const baseY = y / (gridSize - 1);
            
            // Add very small jitter to prevent negative values
            const gridSpacing = 1.0 / (gridSize - 1);
            const jitterX = (Math.random() - 0.5) * 0.25 * gridSpacing;
            const jitterY = (Math.random() - 0.5) * 0.25 * gridSpacing;
            
            // Combine base position with jitter
            positions[i * 2] = Math.max(0, Math.min(1, baseX + jitterX));
            positions[i * 2 + 1] = Math.max(0, Math.min(1, baseY + jitterY));
            
            // Initialize ages to random values to prevent synchronized updates
            ages[i] = Math.floor(Math.random() * 100);
        }
        
        // Create double-buffered particle position buffers (for main particles only)
        this.particleBufferA = createBuffer(gl, positions);
        this.particleBufferB = createBuffer(gl, positions);
        this.currentBuffer = this.particleBufferA;
        this.nextBuffer = this.particleBufferB;
        
        // Create age buffers for tracking particle lifecycles
        this.ageBufferA = createBuffer(gl, ages);
        this.ageBufferB = createBuffer(gl, ages);
        this.currentAgeBuffer = this.ageBufferA;
        this.nextAgeBuffer = this.ageBufferB;
        
        // Create trail offset buffer (for trail rendering)
        // We'll use instanced rendering to draw main particle + trails
        const trailOffsets = new Float32Array(this.trailLength + 1);
        for (let i = 0; i <= this.trailLength; i++) {
            trailOffsets[i] = i; // 0 = main particle, 1,2,3... = trail segments
        }
        this.trailOffsetBuffer = createBuffer(gl, trailOffsets);
        
        // Create transform feedback object
        this.transformFeedback = gl.createTransformFeedback();
        
        // Initialize time for animation
        this.lastTime = 0;

        // Load source image
        this.setSource(this.source, 0.0);
    }

    setSource(source, percentParticleWhenSetSource = 0.5) {
        if (this.source != source) {
            this.source = source;
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

                image.onload = () => {
                    URL.revokeObjectURL(objectURL);
                    this.sourceTexture = createTexture(this.gl, this.gl.LINEAR, image);
                    this.sourceLoaded = true;
                    
                    // Only apply percentParticleWhenSetSource if this is not the first source set
                    if (percentParticleWhenSetSource > 0.0) {
                        this.percentParticleWhenSetSource = percentParticleWhenSetSource;
                        this.shouldResetParticles = true;
                    }
                    
                    this.map.triggerRepaint();
                };

                image.onerror = (err) => {
                    console.warn('ParticleMotion: Error loading source image:', err);
                    URL.revokeObjectURL(objectURL);
                };

                (async () => {
                    try {
                        const tags = await ExifReader.load(arrayBuffer);
                        
                        if (tags["ImageDescription"] && tags["ImageDescription"].description) {
                            const description = tags["ImageDescription"].description;
                            
                            const matches = description.match(/(-?\d+\.?\d*),(-?\d+\.?\d*);(-?\d+\.?\d*),(-?\d+\.?\d*);(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                            if (matches) {
                                let min_u = parseFloat(matches[1]);
                                let max_u = parseFloat(matches[2]);
                                let min_v = parseFloat(matches[3]);
                                let max_v = parseFloat(matches[4]);
                                let min_speed = parseFloat(matches[5]);
                                let max_speed = parseFloat(matches[6]);
                                
                                // Convert units if necessary
                                if (this.unit === 'kph') {
                                    min_u = kphToMph(min_u);
                                    max_u = kphToMph(max_u);
                                    min_v = kphToMph(min_v);
                                    max_v = kphToMph(max_v);
                                    min_speed = kphToMph(min_speed);
                                    max_speed = kphToMph(max_speed);
                                } else if (this.unit === 'mps') {
                                    min_u = mpsToMph(min_u);
                                    max_u = mpsToMph(max_u);
                                    min_v = mpsToMph(min_v);
                                    max_v = mpsToMph(max_v);
                                    min_speed = mpsToMph(min_speed);
                                    max_speed = mpsToMph(max_speed);
                                }
                                
                                if (!isNaN(min_u) && !isNaN(max_u) && !isNaN(min_v) && !isNaN(max_v) && !isNaN(min_speed) && !isNaN(max_speed)) {
                                    this.valueRange_u = [min_u, max_u];
                                    this.valueRange_v = [min_v, max_v];
                                    this.speedRange = [min_speed, max_speed];
                                    
                                    this.colormapTexture = createColormap(this.gl, this.color, this.speedRange);
                                    
                                    image.src = objectURL;
                                    return;
                                }
                            }
                        }
                        
                        console.warn('ParticleMotion: No valid value ranges found in EXIF data');
                        URL.revokeObjectURL(objectURL);
                        
                    } catch (error) {
                        console.warn('ParticleMotion: Error reading EXIF data:', error);
                        URL.revokeObjectURL(objectURL);
                    }
                })();
            })
            .catch(error => {
                console.warn('ParticleMotion: Error fetching image:', error);
            });
    }

    render(gl, matrix) {
        if (!this.sourceLoaded || !this.readyForDisplay) {
            return;
        }

        // Update particle positions with throttling
        const currentTime = performance.now();
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = currentTime - this.lastTime;
        
        // Only update particles if enough time has passed
        const shouldUpdate = deltaTime >= this.updateInterval;
        if (shouldUpdate) {
            this.lastTime = currentTime;

            // ---------- UPDATE STEP ----------
            // Prevent rendering during update step
            gl.colorMask(false, false, false, false);
            gl.disable(gl.BLEND);
            
            gl.useProgram(this.updateProgram.program);
            
            // Set uniforms for update
            gl.uniform1f(this.updateProgram.u_time, currentTime / 1000);
            gl.uniform1f(this.updateProgram.u_speed_factor, this.velocityFactor);
            gl.uniform4fv(this.updateProgram.u_bounds, this.bounds);
            gl.uniform2fv(this.updateProgram.u_value_range_u, this.valueRange_u);
            gl.uniform2fv(this.updateProgram.u_value_range_v, this.valueRange_v);
            gl.uniform2fv(this.updateProgram.u_speed_range, this.speedRange);
            gl.uniform1f(this.updateProgram.u_age_threshold, this.ageThreshold);
            gl.uniform1f(this.updateProgram.u_max_age, this.maxAge);
            
            // Set new uniforms for particle reset
            gl.uniform1f(this.updateProgram.u_percent_reset, this.percentParticleWhenSetSource || 0.0);
            gl.uniform1i(this.updateProgram.u_should_reset, this.shouldResetParticles ? 1 : 0);
            // Reset the flag after setting it
            this.shouldResetParticles = false;
            
            // Bind velocity texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
            gl.uniform1i(this.updateProgram.u_velocity_texture, 0);
            
            // Bind current particle positions buffer as input
            gl.bindBuffer(gl.ARRAY_BUFFER, this.currentBuffer);
            gl.enableVertexAttribArray(this.updateProgram.a_position);
            gl.vertexAttribPointer(this.updateProgram.a_position, 2, gl.FLOAT, false, 0, 0);
            
            // Bind current age buffer as input
            gl.bindBuffer(gl.ARRAY_BUFFER, this.currentAgeBuffer);
            gl.enableVertexAttribArray(this.updateProgram.a_age);
            gl.vertexAttribPointer(this.updateProgram.a_age, 1, gl.FLOAT, false, 0, 0);
            
            // Bind transform feedback and next buffers
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.nextBuffer);  // Position
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.nextAgeBuffer); // Age
            
            // Begin transform feedback
            gl.beginTransformFeedback(gl.POINTS);
            
            // Draw particles to update positions (but nothing will be rendered due to colorMask)
            gl.drawArrays(gl.POINTS, 0, this.particleCount);
            
            // End transform feedback
            gl.endTransformFeedback();
            
            // Clean up state
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
            
            // Re-enable drawing to color buffer
            gl.colorMask(true, true, true, true);
            
            // Swap buffers
            [this.currentBuffer, this.nextBuffer] = [this.nextBuffer, this.currentBuffer];
            [this.currentAgeBuffer, this.nextAgeBuffer] = [this.nextAgeBuffer, this.currentAgeBuffer];
        }
        
        // ---------- RENDER STEP ----------
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        
        gl.useProgram(this.renderProgram.program);
        
        // Set up blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Set uniforms for rendering
        gl.uniformMatrix4fv(this.renderProgram.u_matrix, false, matrix);
        gl.uniform4fv(this.renderProgram.u_bounds, this.bounds);
        gl.uniform1f(this.renderProgram.u_point_size, this.pointSize);
        gl.uniform1f(this.renderProgram.u_opacity, this.fadeOpacity);
        gl.uniform1f(this.renderProgram.u_speed_factor, this.velocityFactor);
        gl.uniform1f(this.renderProgram.u_trail_size_decay, this.trailSizeDecay);
        gl.uniform2fv(this.renderProgram.u_value_range_u, this.valueRange_u);
        gl.uniform2fv(this.renderProgram.u_value_range_v, this.valueRange_v);
        gl.uniform2fv(this.renderProgram.u_speed_range, this.speedRange);
        
        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.uniform1i(this.renderProgram.u_velocity_texture, 0);
        
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.colormapTexture);
        gl.uniform1i(this.renderProgram.u_wind_color, 1);
        
        // Bind current particle positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.currentBuffer);
        gl.enableVertexAttribArray(this.renderProgram.a_position);
        gl.vertexAttribPointer(this.renderProgram.a_position, 2, gl.FLOAT, false, 0, 0);
        
        // Set up instanced rendering for trails
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailOffsetBuffer);
        gl.enableVertexAttribArray(this.renderProgram.a_trail_offset);
        gl.vertexAttribPointer(this.renderProgram.a_trail_offset, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(this.renderProgram.a_trail_offset, 1); // This makes it instanced
        
        // Draw trails using instanced rendering
        // Each main particle will be drawn (trailLength+1) times with different offsets
        gl.drawArraysInstanced(gl.POINTS, 0, this.particleCount, this.trailLength + 1);
        
        // Reset vertex attrib divisor
        gl.vertexAttribDivisor(this.renderProgram.a_trail_offset, 0);
        
        gl.disable(gl.BLEND);
        
        // Request next frame
        this.map.triggerRepaint();
    }

    onRemove(map, gl) {
        // Clean up WebGL resources
        if (this.updateProgram) {
            const shaders = gl.getAttachedShaders(this.updateProgram.program);
            if (shaders) {
                shaders.forEach(shader => gl.deleteShader(shader));
            }
            gl.deleteProgram(this.updateProgram.program);
        }
        if (this.renderProgram) {
            const shaders = gl.getAttachedShaders(this.renderProgram.program);
            if (shaders) {
                shaders.forEach(shader => gl.deleteShader(shader));
            }
            gl.deleteProgram(this.renderProgram.program);
        }

        // Delete buffers
        if (this.particleBufferA) gl.deleteBuffer(this.particleBufferA);
        if (this.particleBufferB) gl.deleteBuffer(this.particleBufferB);
        if (this.ageBufferA) gl.deleteBuffer(this.ageBufferA);
        if (this.ageBufferB) gl.deleteBuffer(this.ageBufferB);
        if (this.trailOffsetBuffer) gl.deleteBuffer(this.trailOffsetBuffer);

        // Delete transform feedback
        if (this.transformFeedback) gl.deleteTransformFeedback(this.transformFeedback);

        // Delete textures
        if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
        if (this.colormapTexture) gl.deleteTexture(this.colormapTexture);

        // Clear references
        this.particleBufferA = null;
        this.particleBufferB = null;
        this.ageBufferA = null;
        this.ageBufferB = null;
        this.currentBuffer = null;
        this.nextBuffer = null;
        this.currentAgeBuffer = null;
        this.nextAgeBuffer = null;
        this.trailOffsetBuffer = null;
        this.transformFeedback = null;
        this.sourceTexture = null;
        this.colormapTexture = null;
        this.updateProgram = null;
        this.renderProgram = null;
        this.gl = null;
        this.map = null;
        this.sourceLoaded = false;
    }
} 