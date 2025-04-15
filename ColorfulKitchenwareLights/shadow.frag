precision mediump float;
varying vec3 v_ViewPosition;

// modified from https://www.chinedufn.com/webgl-shadow-mapping-tutorial/

vec4 encodeFloat(float value) {
    vec4 bitShift = vec4(
        256 * 256 * 256,
        256 * 256,
        256,
        1.0
    );
    // fract gives us the fractional component of each element
    vec4 comp = fract(value * bitShift);
    // mask off the bits "above" each component
    comp.w -= comp.z * 1.0 / 256.0;
    comp.z -= comp.y * 1.0 / 256.0;
    comp.y -= comp.x * 1.0 / 256.0;
    return comp;
}

void main() {
    gl_FragColor = encodeFloat(-v_ViewPosition.z);
}