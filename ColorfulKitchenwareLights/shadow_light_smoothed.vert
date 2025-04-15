attribute vec3 a_Position;
attribute vec3 a_Normal;
attribute vec3 a_color;

uniform mat4 u_Model;
uniform mat4 u_World;
uniform mat4 u_Camera;
uniform mat4 u_Projective;
uniform highp mat4 u_LightTransform; // for calculating position in "light space"

varying vec3 v_Normal;
varying vec3 v_Position;
varying vec2 v_TexCoord;
varying vec4 v_lightPosition;
varying vec3 v_color;
void main() {
    gl_Position = u_Projective * u_Camera * u_World * u_Model * vec4(a_Position, 1.0);
    mat4 texUnitConverter = mat4(0.5, 0., 0., 0., 0., 0.5, 0., 0., 0., 0., 0.5, 0., 0.5, 0.5, 0.5, 1.);
    v_lightPosition = texUnitConverter * u_LightTransform * u_World * u_Model * vec4(a_Position, 1.);
    v_Normal = a_Normal;
    v_Position = a_Position;
    v_color = a_color;
}