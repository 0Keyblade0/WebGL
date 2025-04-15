// Last edited by Dietrich Geisler 2025

const VSHADER_SOURCE = `
    attribute vec3 a_Position;
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_ViewProjection;
    attribute vec3 a_Color;
    varying vec3 v_Color;
    void main() {
        gl_Position = u_ViewProjection * u_World * u_Model * vec4(a_Position, 1.0);
        v_Color = a_Color;
    }
`

const FSHADER_SOURCE = `
    varying mediump vec3 v_Color;
    void main() {
        gl_FragColor = vec4(v_Color, 1.0);
    }
`

// references to general information
var g_canvas
var gl
var g_lastFrameMS

// GLSL uniform references
var g_u_model_ref
var g_u_world_ref

// usual model/world matrices
var g_teapotModelMatrix
var g_teapotModelMatrix1
var g_teapotModelMatrix2
var g_teapotModelMatrix3
var g_cupModelMatrix
var g_spoonModelMatrix
var g_teapotWorldMatrix
var g_teapotWorldMatrix1
var g_teapotWorldMatrix2
var g_teapotWorldMatrix3 
var g_cupWorldMatrix
var g_spoonWorldMatrix

// Mesh definitions
var g_teapotMesh
var g_teapotMesh1
var g_teapotMesh2
var g_teapotMesh3
var g_cupMesh
var g_spoonMesh
var g_gridMesh

var viewMatrix = new Matrix4()
var projectionMatrix = new Matrix4()


// Teapot and Cup model matrices
g_teapotModelMatrix = new Matrix4()
g_cupModelMatrix = new Matrix4()
g_spoonModelMatrix = new Matrix4()

// Set different scaling for teapot and cup
g_teapotModelMatrix = g_teapotModelMatrix.setScale(0.1, 0.1, 0.1)   // Smaller scale for the teapot
g_cupModelMatrix = g_cupModelMatrix.setScale(0.005, 0.005, 0.005)
g_spoonModelMatrix = g_spoonModelMatrix.setScale(0.5, 0.5, 0.5)

// Reposition our mesh (in this case as an identity operation)
g_teapotWorldMatrix = new Matrix4()
g_cupWorldMatrix = new Matrix4()
g_spoonWorldMatrix = new Matrix4()

g_teapotWorldMatrix = g_teapotWorldMatrix.setTranslate(-0.25, 0.0, 0.0)
g_cupWorldMatrix = g_cupWorldMatrix.setTranslate(0.0, 0.0, 0.0)
g_spoonWorldMatrix = g_spoonWorldMatrix.setTranslate(0.25, 0.0, 0.0)

// We're using triangles, so our vertices each have 3 elements
const TRIANGLE_SIZE = 3

// The size in bytes of a floating point
const FLOAT_SIZE = 4

function main() {
    g_canvas = document.getElementById('canvas')

    projectionMatrix = projectionMatrix.setPerspective(45, g_canvas.width / g_canvas.height, 0.1, 100);

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true)
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL')
        return
    }

    // We will call this at the end of most main functions from now on
    loadOBJFiles()
}


/*
 * Helper function to load OBJ files in sequence
 * For much larger files, you may are welcome to make this more parallel
 * I made everything sequential for this class to make the logic easier to follow
 */
async function loadOBJFiles() {
    // open our OBJ file(s)
    var teapot_data = await fetch('./resources/glass.obj').then(response => response.text()).then((x) => x)
    g_teapotMesh = []
    readObjFile(teapot_data, g_teapotMesh)

    var cup_data = await fetch('./resources/Bowl.obj').then(response => response.text()).then((x) => x)
    g_cupMesh = []
    readObjFile(cup_data, g_cupMesh)

    var spoon_data = await fetch('./resources/spoon.obj').then(response => response.text()).then((x) => x)
    g_spoonMesh = []
    readObjFile(spoon_data, g_spoonMesh)

    // Wait to load our models before starting to render
    startRendering()
}

function startRendering() {
    // Initialize GPU's vertex and fragment shaders programs
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }

    // initialize the VBO
    var gridInfo = buildGridAttributes(1, 1, [0.0, 1.0, 0.0])
    g_gridMesh = gridInfo[0]
    var teapotColors = buildColorAttributes(g_teapotMesh.length / 3)
    var cupColors = buildColorAttributes(g_cupMesh.length / 3)
    var spoonColors = buildColorAttributes(g_spoonMesh.length / 3)
    var data = g_teapotMesh.concat(g_cupMesh).concat(g_spoonMesh).concat(gridInfo[0]).concat(teapotColors).concat(cupColors).concat(spoonColors).concat(gridInfo[1])

    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (g_teapotMesh.length + g_cupMesh.length + g_spoonMesh.length + gridInfo[0].length) * FLOAT_SIZE)) {
        return -1
    }

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_world_ref = gl.getUniformLocation(gl.program, 'u_World')
    g_u_viewProj_ref = gl.getUniformLocation(gl.program, 'u_ViewProjection');

    // Enable culling and depth tests
    // gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    tick()
}

// extra constants for cleanliness
var ROTATION_SPEED = .05

// function to apply all the logic for a single frame tick
function tick() {
    // time since the last frame
    var deltaTime

    // calculate deltaTime
    var current_time = Date.now()
    deltaTime = current_time - g_lastFrameMS
    g_lastFrameMS = current_time

    // rotate the arm constantly around the given axis (of the model)
    angle = ROTATION_SPEED * deltaTime
    g_cupModelMatrix.concat(new Matrix4().setRotate(angle, 1, 0, 0))
    g_teapotModelMatrix.concat(new Matrix4().setRotate(-angle, 1, 0, 0))
    g_spoonModelMatrix.concat(new Matrix4().setRotate(angle, 1, 0, 0))

    draw()

    requestAnimationFrame(tick, g_canvas)
}

// draw to the screen on the next frame
function draw() {
    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Compute View-Projection Matrix
    var viewProjMatrix = new Matrix4().set(projectionMatrix).multiply(viewMatrix);
    gl.uniformMatrix4fv(g_u_viewProj_ref, false, viewProjMatrix.elements);

    // Draw Teapot
    gl.uniformMatrix4fv(g_u_model_ref, false, g_teapotModelMatrix.elements);
    gl.uniformMatrix4fv(g_u_world_ref, false, g_teapotWorldMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, 0, g_teapotMesh.length / 3);

    // Draw Cup
    gl.uniformMatrix4fv(g_u_model_ref, false, g_cupModelMatrix.elements);
    gl.uniformMatrix4fv(g_u_world_ref, false, g_cupWorldMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, g_teapotMesh.length / 3, g_cupMesh.length / 3);

    // Draw Spoon
    gl.uniformMatrix4fv(g_u_model_ref, false, g_spoonModelMatrix.elements);
    gl.uniformMatrix4fv(g_u_world_ref, false, g_spoonWorldMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, (g_teapotMesh.length / 3) + (g_cupMesh.length / 3), g_spoonMesh.length / 3);

    // the grid has a constant identity matrix for model and world
    // world includes our Y offset
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, new Matrix4().translate(0, GRID_Y_OFFSET, 0).elements)

    // draw the grid
    gl.drawArrays(gl.LINES, (g_teapotMesh.length / 3) + (g_cupMesh.length / 3) + (g_spoonMesh.length / 3), g_gridMesh.length / 3)  // Draw grid mesh
}

// Helper to construct colors
// makes every triangle a slightly different shade of blue
function buildColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = (i * 3) / vertex_count
            colors.push((Math.random() * shade) % 1, (Math.random() * shade) % 1, (Math.random() * shade) % 1)
        }
    }

    return colors
}

// How far in the X and Z directions the grid should extend
// Recall that the camera "rests" on the X/Z plane, since Z is "out" from the camera
const GRID_X_RANGE = 1000
const GRID_Z_RANGE = 1000

// The default y-offset of the grid for rendering
const GRID_Y_OFFSET = -0.5

/*
 * Helper to build a grid mesh and colors
 * Returns these results as a pair of arrays
 * Each vertex in the mesh is constructed with an associated grid_color
 */
function buildGridAttributes(grid_row_spacing, grid_column_spacing, grid_color) {
    var mesh = []
    var colors = []

    // Construct the rows
    for (var x = -GRID_X_RANGE; x < GRID_X_RANGE; x += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(x, 0, -GRID_Z_RANGE)
        mesh.push(x, 0, GRID_Z_RANGE)
    }

    // Construct the columns extending "outward" from the camera
    for (var z = -GRID_Z_RANGE; z < GRID_Z_RANGE; z += grid_column_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(-GRID_X_RANGE, 0, z)
        mesh.push(GRID_X_RANGE, 0, z)
    }

    // We need one color per vertex
    // since we have 3 components for each vertex, this is length/3
    for (var i = 0; i < mesh.length / 3; i++) {
        colors.push(grid_color[0], grid_color[1], grid_color[2])
    }

    return [mesh, colors]
}

/*
 * Initialize the VBO with the provided data
 * Assumes we are going to have "static" (unchanging) data
 */
function initVBO(data) {
    // get the VBO handle
    var VBOloc = gl.createBuffer()
    if (!VBOloc) {
        return false
    }

    // Bind the VBO to the GPU array and copy `data` into that VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)

    return true
}

/*
 * Helper function to load the given vec3 data chunk onto the VBO
 * Requires that the VBO already be setup and assigned to the GPU
 */
function setupVec3(name, stride, offset) {
    // Get the attribute by name
    var attributeID = gl.getAttribLocation(gl.program, `${name}`)
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`)
        return false
    }

    // Set how the GPU fills the a_Position variable with data from the GPU 
    gl.vertexAttribPointer(attributeID, 3, gl.FLOAT, false, stride, offset)
    gl.enableVertexAttribArray(attributeID)

    return true
}

function reverse() {
    ROTATION_SPEED = -ROTATION_SPEED
    requestAnimationFrame(draw, g_canvas)
}

function plus1() {
    g_teapotWorldMatrix = g_teapotWorldMatrix.setTranslate(g_teapotWorldMatrix.elements[12] + 0.25, g_teapotWorldMatrix.elements[13], g_teapotWorldMatrix.elements[14]);
    requestAnimationFrame(draw, g_canvas);
}

function plus2() {
    g_cupWorldMatrix = g_cupWorldMatrix.setTranslate(g_cupWorldMatrix.elements[12], g_cupWorldMatrix.elements[13] + 0.25, g_cupWorldMatrix.elements[14]);
    requestAnimationFrame(draw, g_canvas);
}

function plus3() {
    g_spoonWorldMatrix = g_spoonWorldMatrix.setTranslate(g_spoonWorldMatrix.elements[12], g_spoonWorldMatrix.elements[13], g_spoonWorldMatrix.elements[14] + 0.25);
    requestAnimationFrame(draw, g_canvas);
}

function minus1() {
    g_teapotWorldMatrix = g_teapotWorldMatrix.setTranslate(g_teapotWorldMatrix.elements[12] - 0.25, g_teapotWorldMatrix.elements[13], g_teapotWorldMatrix.elements[14]);
    requestAnimationFrame(draw, g_canvas);
}

function minus2() {
    g_cupWorldMatrix = g_cupWorldMatrix.setTranslate(g_cupWorldMatrix.elements[12], g_cupWorldMatrix.elements[13] - 0.25, g_cupWorldMatrix.elements[14]);
    requestAnimationFrame(draw, g_canvas);
}

function minus3() {
    g_spoonWorldMatrix = g_spoonWorldMatrix.setTranslate(g_spoonWorldMatrix.elements[12], g_spoonWorldMatrix.elements[13], g_spoonWorldMatrix.elements[14] - 0.25);
    requestAnimationFrame(draw, g_canvas);
}

function moveCameraUp() {
    viewMatrix = viewMatrix.translate(0, 0, 0.25)
    requestAnimationFrame(draw);
}

function moveCameraDown() {
    viewMatrix = viewMatrix.translate(0, 0.0, -0.25)
    requestAnimationFrame(draw);
}

let perspective = true;

function switchCameraMode() {
    if (perspective) {
        projectionMatrix = new Matrix4().setOrtho(-1, 1, -1, 1, 0.1, 100);
    } else {
        projectionMatrix = new Matrix4().setPerspective(45, g_canvas.width / g_canvas.height, 0.1, 100);
    }

    perspective = !perspective;  // Toggle the perspective flag
    console.log("Perspective mode:", perspective);
    requestAnimationFrame(draw);
}


document.addEventListener('keydown', function(event) {
    if (event.key === 'ArrowUp') {
        moveCameraUp();
    } else if (event.key === 'ArrowDown') {
        moveCameraDown();
    } else if (event.key === 'c') {
        switchCameraMode();
    }
});
