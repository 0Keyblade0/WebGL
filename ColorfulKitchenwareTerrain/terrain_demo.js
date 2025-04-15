// Last edited by Dietrich Geisler 2025

const VSHADER_SOURCE = `
    attribute vec3 a_Position;
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_Camera;
    uniform mat4 u_Projection;
    attribute vec3 a_Color;
    varying vec3 v_Color;
    void main() {
        gl_Position = u_Projection * u_Camera * u_World * u_Model * vec4(a_Position, 1.0);
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
var g_u_camera_ref
var g_u_projection_ref

// camera/projection
// note that we are using an identity matrix for our terrain for this demo
var g_terrainModelMatrix
var g_terrainWorldMatrix
var g_projectionMatrix
var g_cameraMatrix

// Teapot, Cup, Bowl matrices
var g_teapotModelMatrix 
var g_cupModelMatrix
var g_spoonModelMatrix 
var g_teapotWorldMatrix
var g_cupWorldMatrix
var g_spoonWorldMatrix

// keep track of the camera position, always looking at (0, height, 0)
var g_cameraQuaternion
var g_forward
var g_up
var g_right
var g_cameraPosition

// Mesh definition
var data
var g_terrainMesh
var g_teapotMesh
var g_cupMesh
var g_spoonMesh
var teapotColors
var cupColors
var spoonColors

// Key states
var g_movingUp
var g_movingDown
var g_movingLeft
var g_movingRight
var g_movingForward
var g_movingBackward
var g_rotationUp
var g_rotationDown
var g_rotationLeft
var g_rotationRight

// We're using triangles, so our vertices each have 3 elements
const TRIANGLE_SIZE = 3

// The size in bytes of a floating point
const FLOAT_SIZE = 4

document.addEventListener('DOMContentLoaded', () => {
    const roughnessSlider = document.getElementById('roughnessSlider')
    const roughnessValue = document.getElementById('roughnessValue')
    const regenButton = document.getElementById('regenButton')

    // Update roughness value display
    roughnessSlider.addEventListener('input', () => {
        roughnessValue.textContent = roughnessSlider.value
    })

    // Regenerate terrain on button click
    regenButton.addEventListener('click', () => {
        regenerateTerrain(parseInt(roughnessSlider.value));
    })
})

function main() {
    setupKeyBinds()

    g_canvas = document.getElementById('canvas')

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

    // class for building the terrain mesh
    var terrainGenerator = new TerrainGenerator()
    // use the current milliseconds as our seed by default
    // TODO: consider setting this as a constant when testing stuff!
    //   just make sure to change it back to something semi-random before submitting :)
    var seed = new Date().getMilliseconds()

    // Setup the options for our terrain generation
    // TODO: try messing around with these options!  
    //   noisefn and roughness in particular give some interesting results when changed
    let options = { 
        width: 100, 
        height: 10, 
        depth: 100, 
        seed: seed,
        noisefn: "wave", // Other options are "simplex" and "perlin"
        roughness: 20
    }

    // construct a terrain mesh of an array of 3-vectors
    // TODO: integrate this with your code!
    var terrain = terrainGenerator.generateTerrainMesh(options)

    // give basic height-based colors based on the 3-vertex specified terrain
    // TODO: make this more interesting (see the function itself)
    var terrainColors = buildTerrainColors(terrain, options.height)

    // "flatten" the terrain above to construct our usual global mesh
    g_terrainMesh = []
    for (var i = 0; i < terrain.length; i++) {
        g_terrainMesh.push(...terrain[i])
    }

    teapotColors = buildColorAttributes(g_teapotMesh.length / 3)
    cupColors = buildColorAttributes(g_cupMesh.length / 3)
    spoonColors = buildColorAttributes(g_spoonMesh.length / 3)

    // put the terrain and colors into the VBO
    data = g_terrainMesh.concat(g_teapotMesh).concat(g_cupMesh).concat(g_spoonMesh).concat(terrainColors).concat(teapotColors).concat(cupColors).concat(spoonColors)
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (g_terrainMesh.length + g_teapotMesh.length + g_cupMesh.length + g_spoonMesh.length) * FLOAT_SIZE)) {
        return
    }

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_world_ref = gl.getUniformLocation(gl.program, 'u_World')
    g_u_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera')
    g_u_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection')

    // Setup a model and world matrix for our terrain
    // Position can be given by our width/height, 
    //   noting that we are centered initially at the "midpoint"
    // We want to be a bit above the terrain initially so we can see it
    // TODO: resize the terrain as needed to "fit" with your animation
    g_terrainModelMatrix = new Matrix4()
    // move in view of the initial camera
    // TODO: you may want to move your terrain!  This is just placed for the demo
    g_terrainWorldMatrix = new Matrix4().translate(-options.width / 2, -options.height, -options.depth / 2)

    // Initially set our camera to be at the origin, looking in the negative direction
    g_cameraMatrix = new Matrix4().setLookAt(0, 0, 0, 0, 0, -1, 0, 1, 0)

    // Setup a reasonable "basic" perspective projection
    g_projectionMatrix = new Matrix4().setPerspective(90, 1, 1, 1000)

    g_teapotModelMatrix = new Matrix4().setScale(1, 1, 1) 
    g_cupModelMatrix = new Matrix4().setScale(0.05, 0.05, 0.05)
    g_spoonModelMatrix = new Matrix4().setScale(5, 5, 5)

    g_teapotWorldMatrix = new Matrix4().setTranslate(15.0, 5.0, 15.0)
    g_cupWorldMatrix = new Matrix4().setTranslate(-15.0, 5.0, -15.0)
    g_spoonWorldMatrix = new Matrix4().setTranslate(0.0, 5.0, 0.0)

    // Initially place the camera in "front" and above the teapot a bit
    g_cameraQuaternion = new Quaternion(0, 0, 0, 1)
    g_cameraPosition = new Vector3()
    g_cameraPosition.x = 0
    g_cameraPosition.y = 0
    g_cameraPosition.z = 0


    g_forward = new Vector3()
    g_forward.x = 0
    g_forward.y = 0
    g_forward.z = -1

    g_up = new Vector3()
    g_up.x = 0
    g_up.y = 1
    g_up.z = 0

    g_right = new Vector3()
    g_right.x = 1
    g_right.y = 0
    g_right.z = 0

    // Initialize control values
    g_movingUp = false
    g_movingDown = false
    g_movingLeft = false
    g_movingRight = false
    g_movingForward = false
    g_movingBackward = false

    g_rotationUp = false
    g_rotationDown = false
    g_rotationLeft = false
    g_rotationRight = false

    // Enable culling and depth
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    tick()
}

function regenerateTerrain(roughness) {
    var terrainGenerator = new TerrainGenerator();
    var seed = new Date().getMilliseconds(); // Random seed on each regen

    var options = { 
        width: 100, 
        height: 10, 
        depth: 100, 
        seed: seed,
        noisefn: "wave",
        roughness: roughness
    };

    var terrain = terrainGenerator.generateTerrainMesh(options);
    var terrainColors = buildTerrainColors(terrain, options.height);

    g_terrainMesh = [];
    for (var i = 0; i < terrain.length; i++) {
        g_terrainMesh.push(...terrain[i]);
    }

    // Update VBO
    data = g_terrainMesh.concat(g_teapotMesh).concat(g_cupMesh).concat(g_spoonMesh).concat(terrainColors).concat(teapotColors).concat(cupColors).concat(spoonColors)
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (g_terrainMesh.length + g_teapotMesh.length + g_cupMesh.length + g_spoonMesh.length) * FLOAT_SIZE)) {
        return
    }


    // Redraw the terrain
    draw();
}

// tick constants
const ROTATION_SPEED = .05
const CAMERA_SPEED = .01
const CAMERA_ROT_SPEED = .1

// function to apply all the logic for a single frame tick
function tick() {
    // time since the last frame
    var deltaTime

    // calculate deltaTime
    var current_time = Date.now()
    deltaTime = current_time - g_lastFrameMS
    g_lastFrameMS = current_time

    let angle1 = ROTATION_SPEED * deltaTime
    g_cupModelMatrix.concat(new Matrix4().setRotate(angle1, 1, 0, 0))
    g_teapotModelMatrix.concat(new Matrix4().setRotate(-angle1, 1, 0, 0))
    g_spoonModelMatrix.concat(new Matrix4().setRotate(angle1, 1, 0, 0))

    g_teapotWorldMatrix.translate(Math.cos(current_time * 0.000628) * 5 * CAMERA_SPEED * 5, 0, 0)
    g_spoonWorldMatrix.translate(0, Math.cos(current_time * 0.000628) * 5 * CAMERA_SPEED * 5, 0)
    g_cupWorldMatrix.translate(0, 0, Math.cos(current_time * 0.000628) * 5 * CAMERA_SPEED * 5)

    updateCameraPosition(deltaTime)

    draw()

    requestAnimationFrame(tick, g_canvas)
}

// draw to the screen on the next frame
function draw() {
    var cameraMatrix = calculateCameraPosition()
    g_cameraMatrix = cameraMatrix

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Update with our global transformation matrices
    gl.uniformMatrix4fv(g_u_model_ref, false, g_terrainModelMatrix.elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, g_terrainWorldMatrix.elements)
    gl.drawArrays(gl.TRIANGLES, 0, g_terrainMesh.length / 3)

    // Draw Teapot
    gl.uniformMatrix4fv(g_u_model_ref, false, g_teapotModelMatrix.elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, g_teapotWorldMatrix.elements)
    gl.drawArrays(gl.TRIANGLES, g_terrainMesh.length / 3, g_teapotMesh.length / 3)

    // Draw Cup
    gl.uniformMatrix4fv(g_u_model_ref, false, g_cupModelMatrix.elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, g_cupWorldMatrix.elements)
    gl.drawArrays(gl.TRIANGLES, (g_terrainMesh.length / 3) + (g_teapotMesh.length / 3), g_cupMesh.length / 3)

    // Draw Spoon
    gl.uniformMatrix4fv(g_u_model_ref, false, g_spoonModelMatrix.elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, g_spoonWorldMatrix.elements)
    gl.drawArrays(gl.TRIANGLES, (g_terrainMesh.length / 3) + (g_teapotMesh.length / 3) + (g_cupMesh.length / 3), g_spoonMesh.length / 3)

    gl.uniformMatrix4fv(g_u_camera_ref, false, g_cameraMatrix.elements)
    gl.uniformMatrix4fv(g_u_projection_ref, false, g_projectionMatrix.elements)
}

/*
 * Helper function to update the camera position each frame
 */
function updateCameraPosition(deltaTime) {

    let rotateUpQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(1, 0, 0, CAMERA_SPEED * deltaTime * 10)
    let rotateDownQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(1, 0, 0, -CAMERA_SPEED * deltaTime * 10)
    let rotateLeftQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(0, 1, 0, CAMERA_SPEED * deltaTime * 10)
    let rotateRightQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(0, 1, 0, -CAMERA_SPEED * deltaTime * 10)

    // move the camera based on user input
    if (g_rotationUp) {
        g_cameraQuaternion.multiplySelf(rotateUpQuat);
    }
    if (g_rotationDown) {
        g_cameraQuaternion.multiplySelf(rotateDownQuat);
    }
    if (g_rotationRight) {
        g_cameraQuaternion.multiplySelf(rotateRightQuat);
    }
    if (g_rotationLeft) {
        g_cameraQuaternion.multiplySelf(rotateLeftQuat);
    }

    let localForward = new Vector3()
    localForward.x = 0
    localForward.y = 0
    localForward.z = -1

    let localUp = new Vector3()
    localUp.x = 0
    localUp.y = 1
    localUp.z = 0

    let localRight = new Vector3()
    localRight.x = 1
    localRight.y = 0
    localRight.z = 0

    // Compute movement directions based on the camera's current orientation
    g_forward = g_cameraQuaternion.multiplyVector3(localForward, g_forward) // Local -Z is forward
    g_right = g_cameraQuaternion.multiplyVector3(localRight, g_right)    // Local X is right
    g_up = g_cameraQuaternion.multiplyVector3(localUp, g_up)        // Local Y is up

    if (g_movingUp) {
        g_cameraPosition.x += g_up.x * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.y += g_up.y * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.z += g_up.z * CAMERA_SPEED * deltaTime * 5
    }
    if (g_movingDown) {
        g_cameraPosition.x -= g_up.x * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.y -= g_up.y * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.z -= g_up.z * CAMERA_SPEED * deltaTime * 5
    }
    if (g_movingLeft) {
        g_cameraPosition.x -= g_right.x * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.y -= g_right.y * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.z -= g_right.z * CAMERA_SPEED * deltaTime * 5
    }
    if (g_movingRight) {
        g_cameraPosition.x += g_right.x * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.y += g_right.y * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.z += g_right.z * CAMERA_SPEED * deltaTime * 5
    }
    if (g_movingForward) {
        // note that moving "forward" means "towards the teapot"
        // g_cameraDistance -= CAMERA_SPEED * deltaTime
        // we don't want to hit a distance of 0
        // g_cameraDistance = Math.max(g_cameraDistance, 1.0)
        g_cameraPosition.x += g_forward.x * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.y += g_forward.y * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.z += g_forward.z * CAMERA_SPEED * deltaTime * 5
    }
    if (g_movingBackward) {
        g_cameraPosition.x -= g_forward.x * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.y -= g_forward.y * CAMERA_SPEED * deltaTime * 5
        g_cameraPosition.z -= g_forward.z * CAMERA_SPEED * deltaTime * 5
    }
}

/*
 * Helper function to calculate camera position from the properties we update
 * Taken from the lecture 16 demos
 */
function calculateCameraPosition() {
    // Calculate the camera position from our angle and height
    // we get to use a bit of clever 2D rotation math
    // note that we can only do this because we're "fixing" our plane of motion
    // if we wanted to allow arbitrary rotation, we would want quaternions!

    // Build a new lookat matrix each frame
    console.log("g_cameraPosition:", g_cameraPosition)

    let target = new Vector3()
    target.x = g_cameraPosition.x + g_forward.x
    target.y = g_cameraPosition.y + g_forward.y
    target.z = g_cameraPosition.z + g_forward.z

    console.log("target:", target)

    return new Matrix4().setLookAt(g_cameraPosition.x, g_cameraPosition.y, g_cameraPosition.z,
                                target.x, target.y, target.z, 
                                g_up.x, g_up.y, g_up.z)
}

/*
 * Helper function to setup camera movement key binding logic
 * Taken from lecture 16 demos
 */
function setupKeyBinds() {
    // Start movement when the key starts being pressed
    document.addEventListener('keydown', function(event) {
        if (event.key == 'w') {
			g_movingUp = true
		}
        else if (event.key == 's') {
			g_movingDown = true
		}
        else if (event.key == 'a') {
			g_movingLeft = true
		}
        else if (event.key == 'd') {
			g_movingRight = true
		}
		else if (event.key == 'e') {
			g_movingForward = true
		}
		else if (event.key == 'q') {
			g_movingBackward = true
		}
        else if (event.key == 'ArrowUp') {
			g_rotationUp = true
		}
        else if (event.key == 'ArrowDown') {
			g_rotationDown = true
		}
		else if (event.key == 'ArrowRight') {
			g_rotationRight = true
		}
		else if (event.key == 'ArrowLeft') {
			g_rotationLeft = true
		}
	})

    // End movement on key release
    document.addEventListener('keyup', function(event) {
        if (event.key == 'w') {
			g_movingUp = false
		}
        else if (event.key == 's') {
			g_movingDown = false
		}
        else if (event.key == 'a') {
			g_movingLeft = false
		}
        else if (event.key == 'd') {
			g_movingRight = false
		}
		else if (event.key == 'e') {
			g_movingForward = false
		}
		else if (event.key == 'q') {
			g_movingBackward = false
		}
        else if (event.key == 'ArrowUp') {
			g_rotationUp = false
		}
        else if (event.key == 'ArrowDown') {
			g_rotationDown = false
		}
		else if (event.key == 'ArrowRight') {
			g_rotationRight = false
		}
		else if (event.key == 'ArrowLeft') {
			g_rotationLeft = false
		}
	})
}

/*
 * Helper to construct _basic_ per-vertex terrain colors
 * We use the height of the terrain to select a color between white and blue
 * Requires that we pass in the height of the terrain (as a number), but feel free to change this
 * TODO: you should expect to modify this helper with custom (or more interesting) colors
 */
function buildTerrainColors(terrain, height) {
    var colors = []
    for (var i = 0; i < terrain.length; i++) {
        // calculates the vertex color for each vertex independent of the triangle
        // the rasterizer can help make this look "smooth"

        // we use the y axis of each vertex alone for color
        // higher "peaks" have more shade
        var shade = (terrain[i][1] / height) + 1/2
        var color = [shade, shade, 1.0]

        // give each triangle 3 colors
        colors.push(...color)
    }

    return colors
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

/*
 * Initialize the VBO with the provided data
 * Assumes we are going to have "static" (unchanging) data
 */
function initVBO(data) {
    // get the VBO handle
    var VBOloc = gl.createBuffer()
    if (!VBOloc) {
        console.log('Failed to create the vertex buffer object')
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



