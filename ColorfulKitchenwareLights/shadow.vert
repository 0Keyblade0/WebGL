attribute vec3 a_Position;
attribute vec3 a_Normal;

uniform mat4 u_Model;
uniform mat4 u_World;
uniform mat4 u_Camera;
uniform mat4 u_Projective;

varying vec3 v_ViewPosition;

// helper function for homogeneous transformation
vec3 hom_reduce(vec4 v) {
    return vec3(v) / v.w;
}
void main() {
    vec4 view_position = u_Projective * u_Camera * u_World * u_Model * vec4(a_Position, 1.0);
    gl_Position = view_position;
    v_ViewPosition = hom_reduce(view_position);
}