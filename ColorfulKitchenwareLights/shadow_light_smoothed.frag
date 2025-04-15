precision highp float;

// Setup our varyings
varying vec3 v_Normal;
varying vec3 v_Position;
varying vec2 v_TexCoord;
varying vec3 v_color;

// determine whether or not to use lighting
uniform int u_Lighting;

// depth texture
uniform sampler2D u_ShadowTexture;
uniform float u_ShadowTexelSize; // for sampling

// Note that our uniforms need not be declared in the vertex shader
uniform mat4 u_Model;
uniform mat4 u_World;
uniform mat4 u_Camera;
uniform mat4 u_CameraInverse;
uniform mat4 u_ModelWorldInverseTranspose; // for normal transformation, model and world
uniform mat4 u_LightTransform; // for calculating position in "light space"
uniform vec3 u_Light; // where the light is located
uniform vec3 u_AmbientColor; // the lighting from the world
uniform float u_SpecPower; // the specular "power" of the light on this model
uniform vec3 u_SpecColor; // the specular color on this model

varying vec4 v_lightPosition;

// helper function for homogeneous transformation
vec3 hom_reduce(vec4 v) {
    return vec3(v) / v.w;
}

// modified from https://www.chinedufn.com/webgl-shadow-mapping-tutorial/
float decodeFloat (vec4 color) {
    float total = 0.0;
    total += color.r / (256.0 * 256.0 * 256.0);
    total += color.g / (256.0 * 256.0);
    total += color.b / (256.0);
    total += color.a;
    return total;
}

void main() {
     // Calculate our world information
    vec3 worldPosition = vec3(u_World * u_Model * vec4(v_Position, 1.0));
    vec3 worldNormal = normalize(vec3(u_ModelWorldInverseTranspose * vec4(v_Normal, 0.0)));
    vec3 lightDir = normalize(u_Light - worldPosition);

    // Calculate our diffuse amount
    float diffuse = max(dot(lightDir, worldNormal), 0.0);

    // Calculate camera reflections and position
    vec3 reflectDir = normalize(reflect(-lightDir, worldNormal));
    vec3 cameraReflectDir = vec3(u_Camera * vec4(reflectDir, 0.0));

    // Calculate camera direction
    vec3 cameraSpacePosition = vec3(u_Camera * vec4(worldPosition, 1.0));
    vec3 cameraDir = normalize(vec3(0.0, 0.0, 0.0) - cameraSpacePosition);

    // Calculate specular with power
    float angle = max(dot(cameraDir, cameraReflectDir), 0.0);
    float specular = max(pow(angle, u_SpecPower), 0.0);

    vec3 ambient = v_color * v_color * 0.1;  // Ambient adapts to object color
    vec3 diffuseColor = diffuse * v_color;    // Diffuse lighting
    vec3 specularColor = diffuse * specular * u_SpecColor;  // Specular depends on diffuse

    vec3 color = clamp(ambient + diffuseColor + specularColor, 0.0, 1.0);

    // always calculate the shadow
    vec4 lightPosHom = u_LightTransform * u_World * u_Model * vec4(v_Position, 1.);
    vec3 lightPos = hom_reduce(lightPosHom);
    vec4 adjusted = lightPosHom;

    // adjust the light position into texture coordinates
    adjusted.x = adjusted.x * 0.5 + 0.5;
    adjusted.y = adjusted.y * 0.5 + 0.5;
    // divide each coordinate by w to get the perspective right
    vec2 texLookup = hom_reduce(adjusted).xy;
    float shadowTex = decodeFloat(texture2D(u_ShadowTexture, texLookup));

    // by default, we're not lit
    float lightAmount = 0.0;
    // add a small offset to help with z-fighting and floating-point error
    float offset = 0.007;

    const int range = 2;
    float range_size = (2.0 * float(range) + 1.0);
    // to smooth, loop over a series of adjacent texels
    for (int i = -range; i <= range; i++) {
        for (int j = -range; j <= range; j++) {
            // add the texel size to get the "next" texel
            vec2 texelLookup = texLookup.xy + vec2(i, j) * u_ShadowTexelSize;
            float shadowTex = decodeFloat(texture2D(u_ShadowTexture, texelLookup));
            // check to see if the pixel Z "matches" the shadow texture pixel
            // if so, add lighting for that pixel
            if (lightPos.z - offset < 1.0 - shadowTex) {

                lightAmount += 1.0 / (range_size * range_size);
            }
        }
    }

    gl_FragColor = vec4(lightAmount * color, 1.0);
}