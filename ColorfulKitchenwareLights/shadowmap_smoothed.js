// Last edited by Dietrich Geisler 2025

// shaders
var g_vshaderShadow
var g_fshaderShadow
var g_vshaderLighting
var g_fshaderLighting

// programs
var g_programShadow
var g_programLighting

// matrices
var g_modelMatrixTeapot
var g_worldMatrixTeapot
var g_modelMatrixBowl
var g_worldMatrixBowl
var g_modelMatrixFloor
var g_worldMatrixFloor
var g_projectionMatrix
var g_cameraMatrix

// references to general information
var g_canvas
var gl

// shadow pointers
var g_model_ref_shadow
var g_world_ref_shadow
var g_camera_ref_shadow
var g_projection_ref_shadow
var g_inverse_transpose_ref_shadow

// texture pointer
var g_model_ref_depth
var g_texture_ref_depth

// lighting pointers
var g_model_ref_lighting
var g_world_ref_lighting
var g_camera_ref_lighting
var g_projection_ref_lighting
var g_inverse_transpose_ref_lighting
var g_shadow_texture_ref_lighting
var g_shadow_texel_size_ref
var g_light_transform_ref_lighting
var g_light_ref_lighting
var g_ambient_color_ref_lighting
var g_spec_power_ref_lighting
var g_spec_color_ref_lighting

// information about our framebuffers and data texture
var g_framebuffer
var g_dataTexture

// keep track of the camera position, always looking at (0, height, 0)
var g_cameraQuaternion
var g_forward
var g_up
var g_right
var g_cameraPosition

// global parameters
var g_lightPosition
var g_lightTarget
var g_shadowOrtho

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

// constants
const DATA_TEXTURE_WIDTH = 256
const DATA_TEXTURE_HEIGHT = 256
const TEAPOT_Z_OFFSET = -2
const TEAPOT_Z_CENTER = -1
const FLOAT_SIZE = 4

function main() {
    // Listen for slider changes
    slider_input = document.getElementById('sliderLightX')
    slider_input.addEventListener('input', (event) => {
        updateLightX(event.target.value)
    })
    slider_input = document.getElementById('sliderLightY')
    slider_input.addEventListener('input', (event) => {
        updateLightY(event.target.value)
    })
    slider_input = document.getElementById('sliderLightZ')
    slider_input.addEventListener('input', (event) => {
        updateLightZ(event.target.value)
    })

    // Setup key presses and releases
    setupKeyBinds()

    g_canvas = document.getElementById('canvas')

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true)
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL')
        return
    }

    loadOBJFiles()
}

/*
 * Helper function to load OBJ files in sequence
 * For much larger files, you may are welcome to make this more parallel
 * I made everything sequential for this class to make the logic easier to follow
 */
async function loadOBJFiles() {
    // open our OBJ file(s)
    data = await fetch('./resources/glass.obj').then(response => response.text()).then((x) => x)
    g_teapotMesh = []
    g_teapotNormals = []
    // read the obj mesh _and_ normals
    readObjFile(data, g_teapotMesh, g_teapotNormals)

    // load our GLSL files before rendering
    loadGLSLFiles()

    bowl_data = await fetch('./resources/Bowl.obj').then(response => response.text()).then((x) => x)
    g_bowlMesh = []
    g_bowlNormals = []
    // read the obj mesh _and_ normals
    readObjFile(bowl_data, g_bowlMesh, g_bowlNormals)

    // load our GLSL files before rendering
    loadGLSLFiles()
}

async function loadGLSLFiles() {
    g_vshaderShadow = await fetch('./shadow.vert').then(response => response.text()).then((x) => x)
    g_fshaderShadow = await fetch('./shadow.frag').then(response => response.text()).then((x) => x)
    g_vshaderLighting = await fetch('./shadow_light_smoothed.vert').then(response => response.text()).then((x) => x)
    g_fshaderLighting = await fetch('./shadow_light_smoothed.frag').then(response => response.text()).then((x) => x)
    g_vshaderFlat = await fetch('./flat.vert').then(response => response.text()).then((x) => x)
    g_fshaderFlat = await fetch('./flat.frag').then(response => response.text()).then((x) => x)

    // wait until everything is loaded before rendering
    startRendering()
}

function startRendering() {
    // Compile all of the vshaders and fshaders
    g_programShadow = createProgram(gl, g_vshaderShadow, g_fshaderShadow)
    if (!g_programShadow) {
        console.log('Failed to intialize shaders.')
        return
    }
    g_programLighting = createProgram(gl, g_vshaderLighting, g_fshaderLighting)
    if (!g_programLighting) {
        console.log('Failed to intialize shaders.')
        return
    }
    g_programFlat = createProgram(gl, g_vshaderFlat, g_fshaderFlat)
    if (!g_programFlat) {
        console.log('Failed to intialize shaders.')
        return
    }

    let teapotColors = buildColorAttributes(g_teapotMesh.length / 3)
    let bowlColors = buildColorAttributes(g_bowlMesh.length / 3)
    let cubeColors = buildColorAttributesSpecify(CUBE_MESH.length / 3, 0.71, 0.54, 0.38)

    // note that we need the texture mapping to draw the screen fragments
    var data = g_teapotMesh.concat(g_bowlMesh).concat(CUBE_MESH)
        .concat(g_teapotNormals).concat(g_bowlNormals).concat(CUBE_NORMALS)
        .concat(teapotColors).concat(bowlColors).concat(cubeColors)
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // reference to the shadow shader pointers
    g_model_ref_shadow = gl.getUniformLocation(g_programShadow, 'u_Model')
    g_world_ref_shadow = gl.getUniformLocation(g_programShadow, 'u_World')
    g_camera_ref_shadow = gl.getUniformLocation(g_programShadow, 'u_Camera')
    g_projection_ref_shadow = gl.getUniformLocation(g_programShadow, 'u_Projective')

    // reference to the lighting shader pointers
    g_lighting_ref = gl.getUniformLocation(g_programLighting, 'u_Lighting')
    g_model_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_Model')
    g_world_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_World')
    g_camera_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_Camera')
    g_projection_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_Projective')
    g_inverse_transpose_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_ModelWorldInverseTranspose')
    g_shadow_texture_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_ShadowTexture')
    g_shadow_texel_size_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_ShadowTexelSize')
    g_light_transform_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_LightTransform')
    g_light_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_Light')
    g_ambient_color_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_AmbientColor')
    g_spec_power_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_SpecPower')
    g_spec_color_ref_lighting = gl.getUniformLocation(g_programLighting, 'u_SpecColor')

    // reference to the flat shader pointers
    g_model_ref_flat = gl.getUniformLocation(g_programFlat, 'u_Model')
    g_world_ref_flat = gl.getUniformLocation(g_programFlat, 'u_World')
    g_camera_ref_flat = gl.getUniformLocation(g_programFlat, 'u_Camera')
    g_projection_ref_flat = gl.getUniformLocation(g_programFlat, 'u_Projection')

    // setup our teapot with heavy scaling
    g_modelMatrixTeapot = new Matrix4().setScale(.25, .25, .25)
    g_worldMatrixTeapot = new Matrix4().translate(0, 0.5, TEAPOT_Z_OFFSET)

    // setup our bowl with heavy scaling
    g_modelMatrixBowl = new Matrix4().setScale(.025, .025, .025)
    g_worldMatrixBowl = new Matrix4().translate(3, -1, 0)

    // Make a large and thin floor, below the teapot
    g_modelMatrixFloor = new Matrix4().setScale(30., 2., 30.)
    g_worldMatrixFloor = new Matrix4().translate(0, -3., 10)

    // Initially set our camera to be at the origin, looking in the negative direction
    g_cameraMatrix = new Matrix4().setLookAt(0, 0, 0, 0, 0, -1, 0, 1, 0)

    // Setup a "reasonable" perspective matrix
    g_projectionMatrix = new Matrix4().setPerspective(90, 1, .1, 500)

    // setup an orthographic matrix for the light
    g_shadowOrtho = new Matrix4().setOrtho(-10, 10, -10, 10, -200, 200)

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

    // https://webglfundamentals.org/webgl/lessons/webgl-render-to-texture.html
    // Create a texture to write data to
    g_dataTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, g_dataTexture)

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
        DATA_TEXTURE_WIDTH, DATA_TEXTURE_HEIGHT, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null); // Note the null data, webgl will update this texture

    // Filter so we don't need a mipmap (nearest is fine)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // create a framebuffer so we can refer to the data from rendering the scene
    g_framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, g_framebuffer)

    // setup a framebuffer location to map to g_data_texture
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g_dataTexture, 0)

    // create a depth renderbuffer so we get proper depth culling in the framebuffer
    var depth_buffer = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth_buffer)
        
    // make a depth buffer and the same size as the targetTexture
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, DATA_TEXTURE_WIDTH, DATA_TEXTURE_HEIGHT)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth_buffer)

    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    // Initialize our data
    g_cameraDistance = 5
    g_cameraAngle = 100
    g_cameraHeight = 1
    g_lightPosition = [0, 0, 0]
    g_lightTarget = [0, 0, TEAPOT_Z_CENTER]
    updateLightX(3)
    updateLightY(3)
    updateLightZ(0)

    tick()
}

// extra constants for cleanliness
const ROTATION_SPEED = .05
const CAMERA_SPEED = .003
const CAMERA_ROT_SPEED = .1

// function to apply all the logic for a single frame tick
function tick() {
    // time since the last frame
    var deltaTime

    // calculate deltaTime
    var current_time = Date.now()
    deltaTime = current_time - g_lastFrameMS
    g_lastFrameMS = current_time

    // rotate the teapot constantly around a set point
    g_worldMatrixTeapot.rotate(-deltaTime * ROTATION_SPEED, 0, 1, 0)
    g_worldMatrixBowl.translate(0, 0, TEAPOT_Z_CENTER - TEAPOT_Z_OFFSET)
        .rotate(-deltaTime * ROTATION_SPEED, 0, 1, 0)
        .translate(0, 0, TEAPOT_Z_OFFSET - TEAPOT_Z_CENTER)


    updateCameraPosition(deltaTime)

    draw()

    requestAnimationFrame(tick, g_canvas)
}

// draw to the screen on the next frame
function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, g_framebuffer)
    gl.viewport(0, 0, DATA_TEXTURE_WIDTH, DATA_TEXTURE_HEIGHT)
    gl.disable(gl.CULL_FACE) // cull face doesn't make sense with shadows!
    drawShadow()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, g_canvas.width, g_canvas.height)
    gl.enable(gl.CULL_FACE)
    drawScene()
}

function drawShadow() {
    gl.useProgram(g_programShadow)
    
    // put the shadow attributes on the VBO
    if (setupVec(3, g_programShadow, 'a_Position', 0) < 0) {
        return -1
    }

    // setup our light source "direction"
    // always look at the teapot (a constant number because I'm lazy)
    var cameraMatrix = new Matrix4().setLookAt(...g_lightPosition,...g_lightTarget, 0, 1, 0)
    gl.uniformMatrix4fv(g_camera_ref_shadow, false, cameraMatrix.elements)

    // use an orthogonal camera for shadows (there's no perspective in a shadow!)
    gl.uniformMatrix4fv(g_projection_ref_shadow, false, g_shadowOrtho.elements)

    gl.enable(gl.DEPTH_TEST)

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // Draw the teapot
    gl.uniformMatrix4fv(g_model_ref_shadow, false, g_modelMatrixTeapot.elements)
    gl.uniformMatrix4fv(g_world_ref_shadow, false, g_worldMatrixTeapot.elements)
    gl.drawArrays(gl.TRIANGLES, 0, g_teapotMesh.length / 3)

    // Draw the bowl
    gl.uniformMatrix4fv(g_model_ref_shadow, false, g_modelMatrixBowl.elements)
    gl.uniformMatrix4fv(g_world_ref_shadow, false, g_worldMatrixBowl.elements)
    gl.drawArrays(gl.TRIANGLES, g_teapotMesh.length / 3, g_bowlMesh.length / 3)

    // Draw the floor
    gl.uniformMatrix4fv(g_model_ref_shadow, false, g_modelMatrixFloor.elements)
    gl.uniformMatrix4fv(g_world_ref_shadow, false, g_worldMatrixFloor.elements)
    gl.drawArrays(gl.TRIANGLES, (g_teapotMesh.length + g_bowlMesh.length) / 3, CUBE_MESH.length / 3)
}

function drawScene() {
    gl.useProgram(g_programLighting)

    // put the lighting attributes on the VBO
    if (setupVec(3, g_programLighting, 'a_Position', 0, 0) < 0) {
        return -1
    }
    if (setupVec(3, g_programLighting, 'a_Normal', 0, (g_teapotMesh.length + g_bowlMesh.length + CUBE_MESH.length) * FLOAT_SIZE) < 0) {
        return -1
    }
    if (setupVec(3, g_programLighting, 'a_color', 0, (g_teapotMesh.length + g_bowlMesh.length + CUBE_MESH.length + g_teapotNormals.length + g_bowlNormals.length + CUBE_NORMALS.length) * FLOAT_SIZE) < 0) {
        return -1
    }

    // setup our shadowTexture
    gl.uniform1i(g_shadow_texture_ref_lighting, g_dataTexture)
    gl.uniform1f(g_shadow_texel_size_ref_lighting, 1.0 / DATA_TEXTURE_WIDTH)

    // setup our light matrix (the same matrix used to calculate shadows)
    var lightViewMatrix = new Matrix4().setLookAt(...g_lightPosition,...g_lightTarget, 0, 1, 0)
    var lightMatrix = new Matrix4(g_shadowOrtho).multiply(lightViewMatrix)
    gl.uniformMatrix4fv(g_light_transform_ref_lighting, false, lightMatrix.elements)

    // setup our camera and projections
    g_cameraMatrix = calculateCameraPosition()
    gl.uniformMatrix4fv(g_camera_ref_lighting, false, g_cameraMatrix.elements)
    gl.uniformMatrix4fv(g_projection_ref_lighting, false, g_projectionMatrix.elements)

    // setup our light source
    gl.uniform3fv(g_light_ref_lighting, new Float32Array(g_lightPosition))

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // Setup the teapot matrices
    gl.uniformMatrix4fv(g_model_ref_lighting, false, g_modelMatrixTeapot.elements)
    gl.uniformMatrix4fv(g_world_ref_lighting, false, g_worldMatrixTeapot.elements)
    var inv = new Matrix4(g_worldMatrixTeapot)
        .concat(g_modelMatrixTeapot)
        .invert().transpose()
    gl.uniformMatrix4fv(g_inverse_transpose_ref_lighting, false, inv.elements)

    // use lighting for the teapot and cube
    gl.uniform1i(g_lighting_ref, 1)

    // set a position and colors for the teapot, and draw
    gl.uniform3fv(g_ambient_color_ref_lighting, new Float32Array([0.5, 0.5, 0.6]))
    gl.uniform1f(g_spec_power_ref_lighting, 256.0)
    gl.uniform3fv(g_spec_color_ref_lighting, new Float32Array([1.0, 1.0, 1.0]))

    gl.drawArrays(gl.TRIANGLES, 0, g_teapotMesh.length / 3)

    // Setup the teapot matrices
    gl.uniformMatrix4fv(g_model_ref_lighting, false, g_modelMatrixBowl.elements)
    gl.uniformMatrix4fv(g_world_ref_lighting, false, g_worldMatrixBowl.elements)
    var inv = new Matrix4(g_worldMatrixBowl)
        .concat(g_modelMatrixBowl)
        .invert().transpose()
    gl.uniformMatrix4fv(g_inverse_transpose_ref_lighting, false, inv.elements)

    // set a position and colors for the teapot, and draw
    gl.uniform3fv(g_ambient_color_ref_lighting, new Float32Array([0.5, 0.5, 0.6]))
    gl.uniform1f(g_spec_power_ref_lighting, 256.0)
    gl.uniform3fv(g_spec_color_ref_lighting, new Float32Array([1, 1, 1]))

    gl.drawArrays(gl.TRIANGLES, g_teapotMesh.length / 3, g_bowlMesh.length / 3)


    // Setup the floor matrices
    gl.uniformMatrix4fv(g_model_ref_lighting, false, g_modelMatrixFloor.elements)
    gl.uniformMatrix4fv(g_world_ref_lighting, false, g_worldMatrixFloor.elements)
    var inv = new Matrix4(g_worldMatrixFloor)
        .concat(g_modelMatrixFloor)
        .invert().transpose()
    gl.uniformMatrix4fv(g_inverse_transpose_ref_lighting, false, inv.elements)

    // set a position and colors for the floor, and draw
    gl.uniform3fv(g_ambient_color_ref_lighting, new Float32Array([0.5, 0.5, 0.6]))
    gl.uniform1f(g_spec_power_ref_lighting, 64.0)
    gl.uniform3fv(g_spec_color_ref_lighting, new Float32Array([.4, .25, .1]))

    gl.drawArrays(gl.TRIANGLES, (g_teapotMesh.length + g_bowlMesh.length) / 3, CUBE_MESH.length / 3)

    // switch to flat lighting
    gl.useProgram(g_programFlat)
    if (!setupVec(3, g_programFlat, 'a_Position', 0, 0)) {
        return
    }

    // draw our cube light
    gl.uniformMatrix4fv(g_model_ref_flat, false, new Matrix4().scale(.1, .1, .1).elements)
    gl.uniformMatrix4fv(g_world_ref_flat, false, new Matrix4().translate(...g_lightPosition).elements)
    gl.uniformMatrix4fv(g_camera_ref_flat, false, g_cameraMatrix.elements)
    gl.uniformMatrix4fv(g_projection_ref_flat, false, g_projectionMatrix.elements)

    gl.drawArrays(gl.TRIANGLES, (g_teapotMesh.length + g_bowlMesh.length) / 3, CUBE_MESH.length / 3)
}

/*
 * Helper function to update the camera position each frame
 */
function updateCameraPosition(deltaTime) {

    let rotateUpQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(1, 0, 0, CAMERA_SPEED * deltaTime * 50)
    let rotateDownQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(1, 0, 0, -CAMERA_SPEED * deltaTime * 50)
    let rotateLeftQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(0, 1, 0, CAMERA_SPEED * deltaTime * 50)
    let rotateRightQuat = new Quaternion(0, 0, 0, 1).setFromAxisAngle(0, 1, 0, -CAMERA_SPEED * deltaTime * 50)

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
        g_cameraPosition.y += g_up.y * CAMERA_SPEED * deltaTime * 5
    }
    if (g_movingDown) {
        g_cameraPosition.y -= g_up.y * CAMERA_SPEED * deltaTime * 5
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
                                0, 1, 0)
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

function buildColorAttributesSpecify(vertex_count, r, g, b) {
    var colors = []
    
    for (var i = 0; i < vertex_count; i++) {
        colors.push(r, g, b) // Use the provided color for every vertex
    }

    return colors
}

function updateLightX(amount) {
    label = document.getElementById('lightX')
    label.textContent = `Light X: ${Number(amount).toFixed(2)}`
    g_lightPosition[0] = Number(amount)
}

function updateLightY(amount) {
    label = document.getElementById('lightY')
    label.textContent = `Light Y: ${Number(amount).toFixed(2)}`
    g_lightPosition[1] = Number(amount)
}

function updateLightZ(amount) {
    label = document.getElementById('lightZ')
    label.textContent = `Light Z: ${Number(amount).toFixed(2)}`
    g_lightPosition[2] = Number(amount)
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
 * For multiple shaders, requires that we provide a program from which to load the attribute
 */
function setupVec(size, program, name, stride, offset) {
    // Get the attribute by name
    var attributeID = gl.getAttribLocation(program, `${name}`)
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`)
        return false
    }

    // Set how the GPU fills the a_Position variable with data from the GPU 
    gl.vertexAttribPointer(attributeID, size, gl.FLOAT, false, stride, offset)
    gl.enableVertexAttribArray(attributeID)

    return true
}