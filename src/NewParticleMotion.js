import ExifReader from 'exifreader';
import { setProjectionUniforms, buildMapLibreVertexShader, normalizeBounds } from './mapLibreGlGlobeHelper.js';
import { valueRangeFromColorStops, normalizeMinMaxRange } from './colorStops.js';
import { createTexture, createRg32FTexture } from './textureUtils.js';
import { loadGeoTiffWind, assertTextureDimensions, kphToMph, mpsToMph, isSourceFormatGeotiff } from './geoTiffSource.js';

// B channel: 0 = no-data (new pipeline), 255 = valid
const NODATA_B_THRESHOLD = 0.5;
const MIN_WIND_SPEED_MPH = 1.5;


// u_physical_velocity: 1 correspond to geotif that has unnormalized/raw velocity values
// u_physical_velocity: 0 correspond to JPEG source that has normalized velocity values
const velocityUniformGlsl = 'uniform bool u_physical_velocity;';

const velocityDecodeGlsl = `
    vec2 decodeVelocity(vec4 velocityData) {
        if (u_physical_velocity) {
            return vec2(velocityData.r, velocityData.g);
        }
        // Denormalize velocities to actual mph values if it is JPEG source
        return vec2(
            mix(u_value_range_u[0], u_value_range_u[1], velocityData.r),
            mix(u_value_range_v[0], u_value_range_v[1], velocityData.g)
        );
    }

    bool velocityIsInvalid(vec4 velocityData) {
        if (u_physical_velocity) {
            return isnan(velocityData.r) || isnan(velocityData.g);
        }
        return velocityData.b < ${NODATA_B_THRESHOLD};
    }
`;

const vertexShader = 
    `#version 300 es
    precision mediump float;
    
    in vec2 a_position;  // Current position [0,1]
    in float a_age;      // Particle age for tracking circular patterns
    out vec2 v_position; // Updated position for transform feedback
    out float v_age;     // Updated age for transform feedback
    
    uniform sampler2D u_velocity_texture;  // Texture with normalized velocities [0,1]
    uniform mediump vec4 u_bounds;
    uniform highp vec4 u_viewport; // west, south, east, north in degrees. east >= west; values may lie outside [-180, 180]
    uniform mediump float u_speed_factor;
    uniform mediump float u_time;
    uniform mediump vec2 u_value_range_u;    // Wind U component range
    uniform mediump vec2 u_value_range_v;    // Wind V component range
    uniform mediump float u_age_threshold;   // Age threshold for reset probability
    uniform mediump float u_max_age;         // Maximum age before forced reset
    uniform mediump float u_percent_reset;   // Percentage of particles to reset on source update
    uniform bool u_should_reset;     // Flag to indicate if we should apply the percentage reset
    uniform bool u_wrap_longitude;   // True when bounds span wraps east/west across the dateline
    ${velocityUniformGlsl}
    ${velocityDecodeGlsl}
    
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
    
    // Shift value into [rangeStart, rangeStart + rangeSpan).
    float wrapToRange(float value, float rangeStart, float rangeSpan) {
        return rangeStart + mod(value - rangeStart, rangeSpan);
    }

    // Camera longitude is an increasing window and may sit outside [-180, 180].
    // Compare a particle by sliding it into that same window, instead of folding
    // the camera back into the raster first.
    bool outsideCamera(vec2 pos) {
        highp float lng = mix(u_bounds[0], u_bounds[2], pos.x);
        highp float lat = mix(u_bounds[3], u_bounds[1], 1.0 - pos.y);
        highp float shifted = wrapToRange(lng, u_viewport.x, 360.0);
        return shifted > u_viewport.z || lat < u_viewport.y || lat > u_viewport.w;
    }

    // Store a geographic point back into data-extent UV. Longitude is folded
    // into the raster so a spawn past ±180 still lands on the matching cell.
    vec2 lngLatToPosition(float lng, float lat) {
        float span = u_bounds[2] - u_bounds[0];
        float folded = wrapToRange(lng, u_bounds[0], span);
        float u = (folded - u_bounds[0]) / span;
        float v = (u_bounds[1] - lat) / (u_bounds[1] - u_bounds[3]);
        return vec2(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0));
    }

    vec2 generateRandomPosition(vec2 seed) {
        vec2 r = vec2(
            random(seed + vec2(1.23, 4.56)),
            random(seed + vec2(7.89, 0.12))
        );
        float lng = mix(u_viewport.x, u_viewport.z, r.x);
        float lat = mix(u_viewport.y, u_viewport.w, r.y);
        return lngLatToPosition(lng, lat);
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
        // Sample velocity from texture
        vec4 velocity = texture(u_velocity_texture, a_position);
        vec2 wind = decodeVelocity(velocity);
        float u = wind.x;
        float v = wind.y;
        
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
        
        // Reset if outside the camera, no-data, or very low wind speed.
        // Wrap only at the raster edge. The camera test runs in degrees and
        // accepts a longitude on either side of the dateline.
        bool leftRasterX = newPos.x < 0.0 || newPos.x > 1.0;
        if (u_wrap_longitude && leftRasterX) {
            newPos.x = fract(newPos.x);
        }

        if (outsideCamera(newPos) || velocityIsInvalid(velocity) || windSpeed < ${MIN_WIND_SPEED_MPH}) {
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
    ${velocityUniformGlsl}
    ${velocityDecodeGlsl}
    
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

        // Hide particles over no-data cells
        if (velocityIsInvalid(velocity)) {
            discard;
        }

        vec2 wind = decodeVelocity(velocity);
        float u = wind.x;
        float v = wind.y;
        float speed = length(vec2(u, v));

        if (speed < ${MIN_WIND_SPEED_MPH}) {
            discard;
        }

        float normalizedSpeed = clamp(
            (speed - u_speed_range[0]) / (u_speed_range[1] - u_speed_range[0]),
            0.0,
            1.0
        );
        
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

const renderVertexShaderInner = 
    `precision mediump float;
    
    in vec2 a_position;      // Position in [0,1] range
    in float a_trail_offset; // Trail offset (0=main particle, 1,2,3=trail segments)
    
    uniform mediump vec4 u_bounds;         // [minX, maxY, maxX, minY]
    uniform mediump float u_point_size;    // Base point size
    uniform mediump float u_trail_size_decay; // Size decay rate for trail particles
    uniform highp vec2 u_viewport_px;      // Drawing buffer size, for a fixed-length trail
    uniform sampler2D u_velocity_texture;  // Velocity texture
    uniform mediump vec2 u_value_range_u;  // Wind U component range
    uniform mediump vec2 u_value_range_v;  // Wind V component range
    ${velocityUniformGlsl}
    ${velocityDecodeGlsl}
    
    out vec2 v_position;     // Pass position to fragment shader
    // out float v_opacity;     // Varying opacity for trail
    
    vec2 latLngToMercator(vec2 lnglat) {
        // Convert lng/lat to Web Mercator coordinates in [0, 1] range
        float x = (lnglat.x + 180.0) / 360.0;  // Convert longitude to [0,1]
        
        // Convert latitude to y coordinate using Web Mercator projection
        float latRad = lnglat.y * 0.017453292519943295; // radians (pi/180)
        float y = 0.5 - (log(tan(0.7853981633974483 + latRad / 2.0)) / 6.283185307179586); // pi/4, 2*pi
        
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

    vec4 projectMercator(vec2 lngLat) {
        vec2 mercator = latLngToMercator(lngLat);
        {{PROJECTION}}
        return gl_Position;
    }
    
    void main() {
        // Trail offset (0 = main particle, >0 = trail segment)
        float trailOffset = a_trail_offset;
        
        // Main particle position from buffer
        vec2 mainPos = a_position;
        
        // Sample velocity at the main particle's position
        vec4 velocityData = texture(u_velocity_texture, mainPos);
        vec2 wind = decodeVelocity(velocityData);
        
        // Project the head, then place each trail dot a fixed number of pixels upwind.
        // Spacing does not depend on wind speed, so every tail has the same screen length.
        vec2 geo = positionToGeo(mainPos);
        highp vec4 clipHead = projectMercator(geo);
        highp vec4 clip = clipHead;

        if (trailOffset > 0.0 && clipHead.w != 0.0) {
            vec2 degrees = mphToDegreesPerFrame(wind, geo.y);
            vec2 span = vec2(u_bounds[2] - u_bounds[0], u_bounds[1] - u_bounds[3]);
            vec2 velocity = vec2(degrees.x / span.x, degrees.y / span.y);
            float speed = length(velocity);
            if (speed > 1e-6) {
                vec2 uvDir = velocity / speed;
                vec2 degreeStep = vec2(uvDir.x * span.x, -uvDir.y * span.y);
                float degreeLen = max(length(degreeStep), 1e-4);
                vec2 probePos = mainPos - uvDir / degreeLen;
                highp vec4 clipProbe = projectMercator(positionToGeo(probePos));
                if (clipProbe.w != 0.0) {
                    vec2 viewportPx = max(u_viewport_px, vec2(1.0));
                    vec2 pixelDelta = (clipProbe.xy / clipProbe.w - clipHead.xy / clipHead.w) * viewportPx * 0.5;
                    float pixelLen = length(pixelDelta);
                    if (pixelLen > 0.25) {
                        vec2 ndc = clipHead.xy / clipHead.w + pixelDelta / pixelLen * (u_point_size * 0.8 * trailOffset) / (viewportPx * 0.5);
                        clip = vec4(ndc * clipHead.w, clipHead.z, clipHead.w);
                    }
                }
            }
        }

        gl_Position = clip;
        
        // Color the whole tail from the head, so a streak stays one color.
        v_position = mainPos;
        
        // Compute opacity for trail particles (1.0 for main particle, decreasing for trail)
        // v_opacity = trailOffset == 0.0 ? 1.0 : 1.0 - (trailOffset / float(3));
        
        // Compute point size (decreasing for trail particles)
        float size = trailOffset == 0.0 ? u_point_size : u_point_size * pow(u_trail_size_decay, trailOffset);
        gl_PointSize = size;
    }`;

const renderVertexShader = 
    `#version 300 es
    uniform mediump mat4 u_matrix;
    ${renderVertexShaderInner.replace('{{PROJECTION}}', 'gl_Position = u_matrix * vec4(mercator, 0, 1);')}`;

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

function boundsEqual(a, b, epsilon = 1e-7) {
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    return a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}

function computeWrapLongitude(bounds) {
    if (!bounds || bounds.length < 4) {
        return false;
    }
    return Math.round(bounds[2] - bounds[0]) >= 360;
}

const VIEWPORT_PADDING = 0.08;
// Default live count, log-interpolated between these stops. Zoom at or above
// the first stop stays on that count. Zoom at or below the last stop stays on
// that count. The zoom-12 stop keeps 8–12 near 5000; the drop to 10 is the
// last level. Integer zooms:
// 13→10, 12→4000, 11→4229, 10→4472, 9→4729, 8→5000,
// 7→5946, 6→7071, 5→8409, 4→10000, 3→31623, 2 and below→100000.
const DEFAULT_PARTICLE_COUNT_STOPS = [
    { zoom: 13, count: 10 },
    { zoom: 12, count: 4000 },
    { zoom: 8, count: 5000 },
    { zoom: 4, count: 10000 },
    { zoom: 2, count: 100000 },
];
const PARTICLE_ZOOM_SAMPLE_MAX = 24;

// Raw camera window in degrees: [west, south, east, north].
// Longitude is not folded into [-180, 180]. A mercator camera with west > east
// is made increasing by adding 360 to east. The shader decides which particles
// fall inside, including longitudes on both sides of the dateline.
function cameraLngLatWindow(map, bounds, padding = VIEWPORT_PADDING) {
    const dataWest = bounds && bounds[0];
    const dataNorth = bounds && bounds[1];
    const dataEast = bounds && bounds[2];
    const dataSouth = bounds && bounds[3];
    const fallback = {
        window: [dataWest, dataSouth, dataEast, dataNorth],
        reseed: false,
    };

    if (!map || typeof map.getBounds !== 'function' || !bounds || bounds.length < 4) {
        return fallback;
    }

    const camera = map.getBounds();
    let west = camera.getWest();
    let south = camera.getSouth();
    let east = camera.getEast();
    let north = camera.getNorth();
    if (![west, south, east, north].every(Number.isFinite)) {
        return fallback;
    }

    if (east < west) {
        east += 360;
    }

    const padLng = (east - west) * padding;
    const padLat = (north - south) * padding;
    west -= padLng;
    east += padLng;
    south = Math.max(-90, south - padLat);
    north = Math.min(90, north + padLat);

    return {
        window: [west, south, east, north],
        reseed: true,
    };
}

function normalizeParticleCount(count) {
    const value = Math.round(Number(count));
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.max(1, value);
}

function logCountBetween(zoom, highZoom, highCount, lowZoom, lowCount) {
    const t = (highZoom - zoom) / (highZoom - lowZoom);
    const logCount = Math.log(highCount) + t * (Math.log(lowCount) - Math.log(highCount));
    return normalizeParticleCount(Math.exp(logCount));
}

function defaultParticleCountForZoom(zoom) {
    const stops = DEFAULT_PARTICLE_COUNT_STOPS;
    if (!Number.isFinite(zoom) || zoom <= stops[stops.length - 1].zoom) {
        return stops[stops.length - 1].count;
    }
    if (zoom >= stops[0].zoom) {
        return stops[0].count;
    }
    for (let i = 0; i < stops.length - 1; i++) {
        const high = stops[i];
        const low = stops[i + 1];
        if (zoom >= low.zoom) {
            return logCountBetween(zoom, high.zoom, high.count, low.zoom, low.count);
        }
    }
    return stops[stops.length - 1].count;
}

// Buffer size is the largest count the function returns on integer zooms 0..24.
function bufferCapacityFor(countForZoom) {
    let capacity = 1;
    for (let zoom = 0; zoom <= PARTICLE_ZOOM_SAMPLE_MAX; zoom += 1) {
        capacity = Math.max(capacity, normalizeParticleCount(countForZoom(zoom)));
    }
    return capacity;
}

function liveCountForZoom(countForZoom, zoom, capacity) {
    const count = normalizeParticleCount(countForZoom(Number.isFinite(zoom) ? zoom : 0));
    return Math.min(capacity, count);
}

function convertVelocityBoundsToMph(min, max, unit) {
    if (unit === 'kph') {
        return [kphToMph(min), kphToMph(max)];
    }
    if (unit === 'mps') {
        return [mpsToMph(min), mpsToMph(max)];
    }
    return [min, max];
}

export default class NewParticleMotion {
    constructor({id, source, color, bounds, particleCount = defaultParticleCountForZoom, readyForDisplay = false, ageThreshold = 500, maxAge = 1000,
        velocityFactor = 0.05, fadeOpacity = 0.9, updateInterval = 50, pointSize = 5.0, trailLength = 3, trailSizeDecay = 0.8, 
        unit = 'mph', cacheOption = 'no-cache', slot, mapRuntime = 'mapbox', sourceType = 'auto', uBand = 0, vBand = 1,
        velocityRange}) {
        this.id = id;
        this.type = 'custom';
        this.renderingMode = '2d';

        if (slot !== undefined) {
            this.slot = slot;
        }
        
        this.source = source;
        this.sourceType = sourceType;
        this.uBand = uBand;
        this.vBand = vBand;
        this.physicalVelocity = false;
        this.color = color;
        this.layerBounds = normalizeBounds(bounds); // User-supplied extent for JPEG; restored when switching back from GeoTIFF
        this.bounds = this.layerBounds;      // Active extent used by shaders (from layerBounds or GeoTIFF file)
        this.wrapLongitude = computeWrapLongitude(this.bounds);
        // A number keeps a fixed count. A function maps zoom to the live count.
        // The buffer is allocated once, to the largest sampled value of that function.
        this.particleCountForZoom = typeof particleCount === 'function'
            ? particleCount
            : () => normalizeParticleCount(particleCount);
        this.bufferCapacity = bufferCapacityFor(this.particleCountForZoom);
        this.liveCount = liveCountForZoom(this.particleCountForZoom, 0, this.bufferCapacity);
        
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
        this.velocityRange = normalizeMinMaxRange(velocityRange);  // [min, max] for u/v denormalization when EXIF is absent
        this.cacheOption = cacheOption;  // Store the cache option

        // 'mapbox' (default) or 'maplibre' — selects which render implementation is bound below
        this.mapRuntime = mapRuntime;
        // Cached MapLibre render programs keyed by shaderData.variantName (globe / mercator transition)
        this.renderShaderMap = new Map();

        this.render = mapRuntime === 'maplibre' ? this.renderMapLibre : this.renderMapbox;

        // First update after the layer is on the map reseeds into the camera.
        // onAdd's grid seed covers the whole raster, before the viewport is known.
        this.reseedViewport = true;
    }

    onAdd(map, gl) {
        this.map = map;
        this.gl = gl;
        const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 0;
        this.liveCount = liveCountForZoom(this.particleCountForZoom, zoom, this.bufferCapacity);

        // Create programs with appropriate fragment shaders
        this.updateProgram = createProgram(gl, vertexShader, updateFragmentShader);
        if (this.mapRuntime === 'mapbox') {
            this.renderProgram = createProgram(gl, renderVertexShader, fragmentShader);
        }

        // Initialize particle positions with a uniform grid distribution
        const positions = new Float32Array(this.bufferCapacity * 2);
        const ages = new Float32Array(this.bufferCapacity);
        const gridSize = Math.ceil(Math.sqrt(this.bufferCapacity));
        
        for (let i = 0; i < this.bufferCapacity; i++) {
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

        this.onMoveEnd = () => {
            this.reseedViewport = true;
        };
        this.map.on('moveend', this.onMoveEnd);
        this.reseedViewport = true;

        // Load source image
        this.setSource(this.source, 0.0);
    }

    // Update geographic extent; re-seed all particles when the extent changes.
    applySourceBounds(bounds) {
        if (!bounds) {
            return false;
        }

        if (!this.bounds) {
            this.bounds = bounds;
            this.wrapLongitude = computeWrapLongitude(bounds);
            return false;
        }

        const extentChanged = !boundsEqual(this.bounds, bounds);
        if (extentChanged) {
            this.bounds = bounds;
            this.wrapLongitude = computeWrapLongitude(bounds);
            this.shouldResetParticles = true;
            this.percentParticleWhenSetSource = 1.0;
        }

        return extentChanged;
    }

    finalizeSourceLoad() {
        this.sourceLoaded = true;
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    applyParticleRangesFromExif(description) {
        const matches = description.match(/(-?\d+\.?\d*),(-?\d+\.?\d*);(-?\d+\.?\d*),(-?\d+\.?\d*);(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (!matches) {
            return false;
        }

        let min_u = parseFloat(matches[1]);
        let max_u = parseFloat(matches[2]);
        let min_v = parseFloat(matches[3]);
        let max_v = parseFloat(matches[4]);
        let min_speed = parseFloat(matches[5]);
        let max_speed = parseFloat(matches[6]);

        [min_u, max_u] = convertVelocityBoundsToMph(min_u, max_u, this.unit);
        [min_v, max_v] = convertVelocityBoundsToMph(min_v, max_v, this.unit);
        [min_speed, max_speed] = convertVelocityBoundsToMph(min_speed, max_speed, this.unit);

        if (isNaN(min_u) || isNaN(max_u) || isNaN(min_v) || isNaN(max_v) || isNaN(min_speed) || isNaN(max_speed)) {
            return false;
        }

        this.valueRange_u = [min_u, max_u];
        this.valueRange_v = [min_v, max_v];
        this.speedRange = [min_speed, max_speed];
        if (this.gl) {
            this.colormapTexture = createColormap(this.gl, this.color, this.speedRange);
        }
        return true;
    }

    applyParticleRangesFromVelocityRange(velocityRange) {
        if (!Array.isArray(velocityRange) || velocityRange.length !== 2) {
            console.warn('NewParticleMotion: velocityRange must be a two-element array [min, max]');
            return false;
        }

        const minVal = parseFloat(velocityRange[0]);
        const maxVal = parseFloat(velocityRange[1]);
        if (isNaN(minVal) || isNaN(maxVal)) {
            console.warn('NewParticleMotion: velocityRange contains non-numeric values');
            return false;
        }

        const [minMph, maxMph] = convertVelocityBoundsToMph(minVal, maxVal, this.unit);
        this.valueRange_u = [minMph, maxMph];
        this.valueRange_v = [minMph, maxMph];
        this.speedRange = valueRangeFromColorStops(this.color);
        if (this.gl) {
            this.colormapTexture = createColormap(this.gl, this.color, this.speedRange);
        }
        return true;
    }

    resolveJpegParticleRanges(exifDescription) {
        if (exifDescription && this.applyParticleRangesFromExif(exifDescription)) {
            return true;
        }

        if (this.velocityRange && this.applyParticleRangesFromVelocityRange(this.velocityRange)) {
            return true;
        }

        if (exifDescription) {
            console.warn('NewParticleMotion: No valid velocity ranges found in EXIF data');
        } else if (!this.velocityRange) {
            console.warn('NewParticleMotion: No EXIF velocity metadata and no velocityRange option provided');
        }
        return false;
    }

    setSource(source, percentParticleWhenSetSource = 0.5) {
        if (this.source != source) {
            this.source = source;
        }

        if (isSourceFormatGeotiff(source, this.sourceType)) {
            this.loadGeoTiffSource(source, percentParticleWhenSetSource);
            return;
        }

        this.physicalVelocity = false;
        this.loadJpegSource(source, percentParticleWhenSetSource);
    }

    loadGeoTiffSource(source, percentParticleWhenSetSource = 0.5) {
        fetch(source, {cache: this.cacheOption})
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`NewParticleMotion: failed to fetch GeoTIFF (${response.status})`);
                }
                return response.arrayBuffer();
            })
            .then(async (arrayBuffer) => {
                const result = await loadGeoTiffWind(arrayBuffer, {
                    uBand: this.uBand,
                    vBand: this.vBand,
                    unit: this.unit,
                });
                if (!this.gl) {
                    return;
                }

                assertTextureDimensions(result.width, result.height, this.gl);

                const extentChanged = this.applySourceBounds(result.bounds);

                if (this.sourceTexture) {
                    this.gl.deleteTexture(this.sourceTexture);
                }

                this.physicalVelocity = true;
                this.speedRange = valueRangeFromColorStops(this.color);
                this.valueRange_u = [0, 1];
                this.valueRange_v = [0, 1];
                this.sourceTexture = createRg32FTexture(this.gl, result.data, result.width, result.height);
                this.colormapTexture = createColormap(this.gl, this.color, this.speedRange);

                if (!extentChanged && percentParticleWhenSetSource > 0.0) {
                    this.percentParticleWhenSetSource = percentParticleWhenSetSource;
                    this.shouldResetParticles = true;
                }

                this.finalizeSourceLoad();
            })
            .catch((error) => {
                console.warn('NewParticleMotion: Error loading GeoTIFF source:', error);
            });
    }

    loadJpegSource(source, percentParticleWhenSetSource = 0.5) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        
        fetch(source, {
            cache: this.cacheOption
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
                    if (!this.gl) {
                        return;
                    }

                    const extentChanged = this.applySourceBounds(this.layerBounds);

                    if (this.sourceTexture) {
                        this.gl.deleteTexture(this.sourceTexture);
                    }
                    this.sourceTexture = createTexture(this.gl, this.gl.LINEAR, image);

                    if (!extentChanged && percentParticleWhenSetSource > 0.0) {
                        this.percentParticleWhenSetSource = percentParticleWhenSetSource;
                        this.shouldResetParticles = true;
                    }

                    this.finalizeSourceLoad();
                };

                image.onerror = (err) => {
                    console.warn('NewParticleMotion: Error loading source image:', err);
                    URL.revokeObjectURL(objectURL);
                };

                (async () => {
                    let exifDescription;
                    try {
                        const tags = await ExifReader.load(arrayBuffer);
                        if (tags["ImageDescription"] && tags["ImageDescription"].description) {
                            exifDescription = tags["ImageDescription"].description;
                        }
                    } catch (error) {
                        console.warn('NewParticleMotion: Error reading EXIF data:', error);
                    }

                    if (!this.resolveJpegParticleRanges(exifDescription)) {
                        URL.revokeObjectURL(objectURL);
                        return;
                    }

                    image.src = objectURL;
                })();
            })
            .catch(error => {
                console.warn('NewParticleMotion: Error fetching image:', error);
            });
    }

    updateParticles(gl) {
        // Update particle positions with throttling
        const currentTime = performance.now();
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = currentTime - this.lastTime;

        // Only update particles if enough time has passed
        if (deltaTime < this.updateInterval) {
            return;
        }

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

        const viewport = cameraLngLatWindow(this.map, this.bounds);
        let percentReset = this.percentParticleWhenSetSource || 0.0;
        let shouldReset = !!this.shouldResetParticles;
        if (this.reseedViewport && viewport.reseed) {
            percentReset = 1.0;
            shouldReset = true;
            this.reseedViewport = false;
            const zoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : 0;
            this.liveCount = liveCountForZoom(this.particleCountForZoom, zoom, this.bufferCapacity);
        }

        gl.uniform4fv(this.updateProgram.u_viewport, viewport.window);
        gl.uniform1f(this.updateProgram.u_percent_reset, percentReset);
        gl.uniform1i(this.updateProgram.u_should_reset, shouldReset ? 1 : 0);
        gl.uniform1i(this.updateProgram.u_wrap_longitude, this.wrapLongitude ? 1 : 0);
        gl.uniform1i(this.updateProgram.u_physical_velocity, this.physicalVelocity ? 1 : 0);  // 1 correspond to geotif that has unnormalized velocity values
        // Reset the flag after setting it. Leave reseedViewport set when this
        // frame cannot place particles in one viewport rectangle.
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
        gl.drawArrays(gl.POINTS, 0, this.liveCount);

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

    getRenderProgram(gl, shaderData) {
        // Pick a shader based on the current projection variant (mercator / globe / transition)
        if (this.renderShaderMap.has(shaderData.variantName)) {
            return this.renderShaderMap.get(shaderData.variantName);
        }

        const vertexSource = buildMapLibreVertexShader(shaderData, renderVertexShaderInner);
        const program = createProgram(gl, vertexSource, fragmentShader);
        this.renderShaderMap.set(shaderData.variantName, program);
        return program;
    }

    setParticleRenderUniforms(gl, renderProgram) {
        gl.uniform4fv(renderProgram.u_bounds, this.bounds);
        gl.uniform1f(renderProgram.u_point_size, this.pointSize);
        gl.uniform1f(renderProgram.u_opacity, this.fadeOpacity);
        gl.uniform1f(renderProgram.u_trail_size_decay, this.trailSizeDecay);
        gl.uniform2f(renderProgram.u_viewport_px, gl.canvas.width, gl.canvas.height);
        gl.uniform2fv(renderProgram.u_value_range_u, this.valueRange_u);
        gl.uniform2fv(renderProgram.u_value_range_v, this.valueRange_v);
        gl.uniform2fv(renderProgram.u_speed_range, this.speedRange);
        gl.uniform1i(renderProgram.u_physical_velocity, this.physicalVelocity ? 1 : 0);
    }

    bindAndDrawParticles(gl, renderProgram) {
        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.uniform1i(renderProgram.u_velocity_texture, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.colormapTexture);
        gl.uniform1i(renderProgram.u_wind_color, 1);

        // Bind current particle positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.currentBuffer);
        gl.enableVertexAttribArray(renderProgram.a_position);
        gl.vertexAttribPointer(renderProgram.a_position, 2, gl.FLOAT, false, 0, 0);

        // Set up instanced rendering for trails
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailOffsetBuffer);
        gl.enableVertexAttribArray(renderProgram.a_trail_offset);
        gl.vertexAttribPointer(renderProgram.a_trail_offset, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(renderProgram.a_trail_offset, 1); // This makes it instanced

        // Draw trails using instanced rendering
        // Each main particle will be drawn (trailLength+1) times with different offsets
        gl.drawArraysInstanced(gl.POINTS, 0, this.liveCount, this.trailLength + 1);

        // Reset vertex attrib divisor
        gl.vertexAttribDivisor(renderProgram.a_trail_offset, 0);
    }

    drawParticlesMapbox(gl, matrix) {
        // ---------- RENDER STEP ----------
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.useProgram(this.renderProgram.program);

        // Set up blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Set uniforms for rendering
        gl.uniformMatrix4fv(this.renderProgram.u_matrix, false, matrix);
        this.setParticleRenderUniforms(gl, this.renderProgram);
        this.bindAndDrawParticles(gl, this.renderProgram);

        gl.disable(gl.BLEND);
    }

    drawParticlesMapLibre(gl, renderProgram, defaultProjectionData) {
        // ---------- RENDER STEP ----------
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.useProgram(renderProgram.program);
        
        // Set up blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // MapLibre projection uniforms for projectTile() in the vertex shader
        setProjectionUniforms(gl, renderProgram.program, defaultProjectionData);
        this.setParticleRenderUniforms(gl, renderProgram);
        this.bindAndDrawParticles(gl, renderProgram);
        
        gl.disable(gl.BLEND);
    }
    
    renderMapbox(gl, matrix) {
        if (!this.sourceLoaded || !this.readyForDisplay) {
            return;
        }

        this.updateParticles(gl);
        this.drawParticlesMapbox(gl, matrix);

        // Request next frame
        this.map.triggerRepaint();
    }
    
    renderMapLibre(gl, args) {
        if (!this.sourceLoaded || !this.readyForDisplay) {
            return;
        }

        this.updateParticles(gl);
        const renderProgram = this.getRenderProgram(gl, args.shaderData);
        this.drawParticlesMapLibre(gl, renderProgram, args.defaultProjectionData);
        
        // Request next frame
        this.map.triggerRepaint();
    }

    onRemove(map, gl) {
        if (this.onMoveEnd) {
            map.off('moveend', this.onMoveEnd);
            this.onMoveEnd = null;
        }

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
        for (const program of this.renderShaderMap.values()) {
            const shaders = gl.getAttachedShaders(program.program);
            if (shaders) {
                shaders.forEach(shader => gl.deleteShader(shader));
            }
            gl.deleteProgram(program.program);
        }
        this.renderShaderMap.clear();

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