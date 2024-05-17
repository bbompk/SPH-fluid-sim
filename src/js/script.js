import * as THREE from 'three';
import dat from 'dat.gui';
import { 
    isPointInTriangle, 
    nearestPointInLine,
    isLineIntersectCircle,
    smoothingKernel,
    viscositySmoothingKernel,
    smoothingKernelDerivative 
} from './compute.js';
import { 
    getRandomDirection,
    interpolateColor 
 } from './helper.js';


//=================== Three.js setup ===================//

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const raycaster = new THREE.Raycaster();
const datgui = new dat.GUI();

camera.position.set( 0, 0, 7 )

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
});


//=================== Simulation parameters ===================//

const MAX_WIDTH = 16;
const MAX_HEIGHT = 9;
const PARTICLE_DIV = 10;
const NUM_PARTICLES = 1600;
const PARTICLE_INIT_WIDTH = 40;
const BALL_RADIUS = 0.7;
const BALL_DIV = 20;
const BALL_INIT_POS = new THREE.Vector3(-5, 2, 0);
if (PARTICLE_DIV < 3) throw new Error('PARTICLE_DIV must be greater than 2');

const options = {
    particleRadius: 0.05,
    particleAlpha: 1,
    gravity: 7,
    collisionDamping: 0.85,
    smoothingRadius: 0.35,
    particleMass: 1,
    targetDensity: 36,
    pressureMultiplier: 34,
    viscosityStrength: 2,
    interactionStrength: 530,
    interactionRadius: 6.3,
    boundV: MAX_HEIGHT,
    boundH: MAX_WIDTH,
    gradientSlowColor: "#22DDFF",
    gradientFastColor: "#AA00FF",
    applyBallPhysics: false,
    ballMass: 0.3,
    slopeSize: 0.0
}

const tankPreset = {
    particleRadius: 0.05,
    particleAlpha: 0.8,
    gravity: 7,
    collisionDamping: 0.85,
    smoothingRadius: 0.35,
    particleMass: 1,
    targetDensity: 36,
    pressureMultiplier: 34,
    viscosityStrength: 5,
    interactionStrength: 530,
    interactionRadius: 6.3,
    boundV: MAX_HEIGHT,
    boundH: MAX_WIDTH,
    gradientSlowColor: "#22DDFF",
    gradientFastColor: "#AA00FF",
    applyBallPhysics: true,
    ballMass: 0.3,
    slopeSize: 0.0
}

const platePreset = {
    particleRadius: 0.05,
    particleAlpha: 1,
    gravity: 0,
    collisionDamping: 0.85,
    smoothingRadius: 0.35,
    particleMass: 1,
    targetDensity: 6.6,
    pressureMultiplier: 18,
    viscosityStrength: 0.5,
    interactionStrength: 250,
    interactionRadius: 2.8,
    boundV: MAX_HEIGHT,
    boundH: MAX_WIDTH,
    gradientSlowColor: "#22DDFF",
    gradientFastColor: "#AA00FF",
    applyBallPhysics: false,
    ballMass: 0.8,
    slopeSize: 0.0
}

const particleUniforms = {
    uParticleRadius: { value: options.particleRadius },
    uParticleDivisions: { value: PARTICLE_DIV },
    uOpacity: { value: 1.0 },
}

var spatialGridRows = Math.ceil(options.boundV/ options.smoothingRadius);
var spatialGridCols = Math.ceil(options.boundH / options.smoothingRadius);
var slopeSize = 0.0; // always 45 degrees and appears at the bottom left

datgui.add(options, 'particleRadius', 0.01, 0.5).onChange(() => {
    particleUniforms.uParticleRadius.value = options.particleRadius;
})
datgui.add(options, 'particleAlpha', 0, 1).onChange(() => {
    particleUniforms.uOpacity.value = options.particleAlpha;
})
datgui.add(options, 'gravity', 0, 20)
datgui.add(options, 'collisionDamping', 0, 1)
datgui.add(options, 'smoothingRadius', 0.1, 1).onChange(() => {
    spatialGridRows = Math.ceil(options.boundV / options.smoothingRadius);
    spatialGridCols = Math.ceil(options.boundH / options.smoothingRadius);
})
datgui.add(options, 'particleMass', 0.1, 10)
datgui.add(options, 'targetDensity', 0.1, 100)
datgui.add(options, 'pressureMultiplier', 0.1, 100)
datgui.add(options, 'viscosityStrength', 0, 10)
datgui.add(options, 'interactionStrength', 100, 1000)
datgui.add(options, 'interactionRadius', 0, 10)
datgui.add(options, 'boundV', 2, MAX_HEIGHT, 1)
datgui.add(options, 'boundH', 2, MAX_WIDTH, 1)
datgui.addColor(options, 'gradientSlowColor')
datgui.addColor(options, 'gradientFastColor')
datgui.add(options, 'applyBallPhysics')
datgui.add(options, 'ballMass', 0.1, 2)
datgui.add(options, 'slopeSize', 0, 100).onChange(() => {
    slopeSize = options.slopeSize * options.boundH / 100;
})


//=================== Simulation controls ===================//

var paused = true;

function pause(forcePause = false) {
    paused = !paused;
    if (forcePause) paused = true;
    if (paused) {
        toggleBtn.innerText = 'PLAY';
        toggleBtn.classList.add('paused');
        toggleBtn.classList.remove('unpaused')
    } else {
        toggleBtn.innerText = 'PAUSE';
        toggleBtn.classList.remove('paused');
        toggleBtn.classList.add('unpaused');
    }
}

const toggleBtn = document.getElementById('toggle-btn')
toggleBtn.onclick = () => {
    pause();
}

const tankBtn = document.getElementById('tank-preset-btn');
tankBtn.onclick = () => {
    Object.assign(options, tankPreset);
    datgui.updateDisplay();
    particleUniforms.uParticleRadius.value = options.particleRadius;
    particleUniforms.uOpacity.value = options.particleAlpha;
    slopeSize = options.slopeSize * options.boundH / 100;
    reset();
}

const plateBtn = document.getElementById('plate-preset-btn');
plateBtn.onclick = () => {
    Object.assign(options, platePreset);
    datgui.updateDisplay();
    particleUniforms.uParticleRadius.value = options.particleRadius;
    particleUniforms.uOpacity.value = options.particleAlpha;
    slopeSize = options.slopeSize * options.boundH / 100;
    reset();
}

const resetBtn = document.getElementById('reset-btn');
resetBtn.onclick = () => {
    reset();
    pause(true);
}

var interactPoint = null;
var ballPickupPoint = null;
var interactionFocus = null;

const mousePosition = new THREE.Vector2(0, 0);
var mouseDown = false;
window.addEventListener('mousemove', (e) => {
    mousePosition.x = ( e.clientX / window.innerWidth ) * 2 - 1;
    mousePosition.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
});
window.addEventListener('mousedown', () => {
    mouseDown = true;
});
window.addEventListener('mouseup', () => {
    mouseDown = false;
    interactPoint = null;
    ballPickupPoint = null;
    interactionFocus = null;
});


//==================== Entities ====================//

class Particle {
    constructor(pos) {
        const particleGeometry = new THREE.BufferGeometry();
        let particleVertices = []
        let particleRadialIndexes = []
        let particleIndices = []
        particleVertices.push( 0, 0, 0 );
        particleRadialIndexes.push(-1);
        for (let i = 0; i < PARTICLE_DIV; i++) {
            particleVertices.push(0, 0, 0)
            particleRadialIndexes.push(i);
            particleIndices.push( 0, i + 1, (i + 1) % PARTICLE_DIV + 1 );
        }
        particleGeometry.setIndex( particleIndices );
        particleGeometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array(particleVertices), 3 ) );
        particleGeometry.setAttribute( 'aRadialIndex', new THREE.BufferAttribute( new Int32Array(particleRadialIndexes), 1 ) );

        const particleMaterial = new THREE.ShaderMaterial({
            vertexShader: document.getElementById('particle-vertex-shader').textContent,
            fragmentShader: document.getElementById('particle-fragment-shader').textContent,
            uniforms: {
                uColor: { value: new THREE.Color( 0x0055FF ) },
                ...particleUniforms
            },
        })
        const particle = new THREE.Mesh( particleGeometry, particleMaterial );
        particle.position.set( pos.x, pos.y, pos.z );

        this.sceneObject = particle;
    }
}

// Plane
const planeGeometry = new THREE.PlaneGeometry( MAX_WIDTH, MAX_HEIGHT, MAX_WIDTH * 10, MAX_HEIGHT * 10 );
const planeMat = new THREE.MeshBasicMaterial( { color: 0, wireframe: false } );
const plane = new THREE.Mesh( planeGeometry, planeMat );
scene.add( plane );
plane.position.set( 0, 0, 0 );

// Ball
var ball = null;
var ballPos = new THREE.Vector3(0, 0, 0);
var ballVel = new THREE.Vector3(0, 0, 0);
function resetBall() {
    if (ball) scene.remove(ball);

    const ballGeometry = new THREE.BufferGeometry();
    let ballVertices = []
    let ballIndices = []

    ballVertices.push( 0, 0, 0 );
    for (let i = 0; i < BALL_DIV; i++) {
        const angle = Math.PI * 2 * i / BALL_DIV;
        ballVertices.push( Math.cos( angle ) * BALL_RADIUS, Math.sin( angle ) * BALL_RADIUS, 0 );
        ballIndices.push( 0, i + 1, (i + 1) % BALL_DIV + 1 );
    }
    ballVertices = new Float32Array( ballVertices );
    ballGeometry.setIndex( ballIndices );
    ballGeometry.setAttribute( 'position', new THREE.BufferAttribute( ballVertices, 3 ) );
    const ballMat = new THREE.MeshBasicMaterial( { color: 0xff4444, wireframe: false } );
    ball = new THREE.Mesh( ballGeometry, ballMat );
    ball.position.copy(BALL_INIT_POS);
    scene.add( ball );
    ballPos = BALL_INIT_POS.clone();
    ballVel = new THREE.Vector3(0, 0, 0);
}

// Bounds
var boundFrame = null
function drawBounds() {
    const lineMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
    const points = [
        new THREE.Vector3(-options.boundH/2, -options.boundV/2, 0),
        new THREE.Vector3(options.boundH/2, -options.boundV/2, 0),
        new THREE.Vector3(options.boundH/2, options.boundV/2, 0),
        new THREE.Vector3(-options.boundH/2, options.boundV/2, 0),
        new THREE.Vector3(-options.boundH/2, -options.boundV/2, 0),
        new THREE.Vector3(-options.boundH/2, -options.boundV/2 + slopeSize, 0),
        new THREE.Vector3(-options.boundH/2 + slopeSize, -options.boundV/2, 0),
    ]
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    if (boundFrame) scene.remove(boundFrame);
    boundFrame = new THREE.Line(lineGeo, lineMat);
    scene.add(boundFrame);
}



//==================== Simulation ====================//

var particles = [];
const densities = new Array(NUM_PARTICLES).fill(0);
const positions = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));
const velocities = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));
const predictedPositions = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));

function reset() {
    particles.forEach(particle => {
        scene.remove(particle.sceneObject);
    })
    particles = [];

    const halfx = Math.ceil(PARTICLE_INIT_WIDTH / 2);
    const halfy = Math.ceil((NUM_PARTICLES / PARTICLE_INIT_WIDTH) / 2);
    var pidx = 0;
    for (let i = -halfx; i <= halfx; i++) {
        for (let j = -halfy; j <= halfy; j++) {
            if (pidx >= NUM_PARTICLES) break;
            const spawnPos = new THREE.Vector3( i * options.particleRadius * 2.5, j * options.particleRadius * 2.5, 0 );
            const particle = new Particle( new THREE.Vector3( spawnPos.x, spawnPos.y, 0 ) );
            scene.add( particle.sceneObject );
            particles.push( particle );
            positions[pidx] = spawnPos.clone();
            velocities[pidx] = new THREE.Vector3(0, 0, 0);
            pidx++;
        }
    }

    resetBall();

    console.log(`Initialized ${particles.length} particles`)

    drawBounds();
    renderer.render( scene, camera );
    pause(true);
}

//----- Spatial Hashing -----//

var spatialLookupTable = (new Array(NUM_PARTICLES).fill(0)).map(() => new THREE.Vector2(0));
var spatialTableStartIndices = new Array(NUM_PARTICLES).fill(-1);

function getCellCoord(pos) {
    return new THREE.Vector2(Math.floor(pos.x / options.smoothingRadius), Math.floor(pos.y / options.smoothingRadius));
}

function getCellHash(celcoord) {
    const primeA = 4591;
    const primeB = 3643;

    return celcoord.x * primeA + celcoord.y * primeB;
}

function updateSpatialLookupTable(poslist) {
    const spatialGridSize = spatialGridCols * spatialGridRows;

    spatialTableStartIndices = new Array(spatialGridSize).fill(-1);
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const pos = poslist[i].clone();
        const cellCoord = getCellCoord(pos);
        const hash = getCellHash(cellCoord);
        const cellKey = hash % (spatialGridSize);
        spatialLookupTable[i] = new THREE.Vector2(i, cellKey); 
    }

    spatialLookupTable.sort((a, b) => a.y - b.y);

    for (let i = 0; i < NUM_PARTICLES; i++) {
        const cellKey = spatialLookupTable[i].y;
        const keyPrev = i == 0 ? -1 : spatialLookupTable[i - 1].y;
        if (cellKey != keyPrev) spatialTableStartIndices[cellKey] = i;
    }
}

function getParticleIndexesInRadius(samplePoint) {
    const cellOffSets = [
        new THREE.Vector2(-1, -1),
        new THREE.Vector2(-1, 0),
        new THREE.Vector2(-1, 1),
        new THREE.Vector2(0, -1),
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0, 1),
        new THREE.Vector2(1, -1),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(1, 1)
    ]
    const centerCellCoord = getCellCoord(samplePoint);
    const indices = [];
    cellOffSets.forEach(offset => {
        const cellCoord = centerCellCoord.clone().add(offset);
        const hash = getCellHash(cellCoord);
        const cellKey = hash % (spatialGridCols * spatialGridRows);

        const startIdx = spatialTableStartIndices[cellKey];
        if (startIdx === -1) return indices;

        for (let i = startIdx; i < spatialLookupTable.length; i++) {
            if (spatialLookupTable[i].y != cellKey) break;
            const idx = spatialLookupTable[i].x;
            const dst = predictedPositions[idx].distanceTo(samplePoint);
            if (dst < options.smoothingRadius) indices.push(idx);
        }
    })
    return indices;
}

//----- resolve collisions -----//

function resolveParticleBoundCollisions(i) {
    let halfBound = new THREE.Vector2(options.boundH/2, options.boundV/2);
    halfBound.subVectors(halfBound, new THREE.Vector2(options.particleRadius, options.particleRadius));

    let dirX = Math.sign(positions[i].x);
    let dirY = Math.sign(positions[i].y);

    if (Math.abs(positions[i].x) > halfBound.x) {
        positions[i].x = halfBound.x * dirX;
        velocities[i].x = -velocities[i].x * options.collisionDamping;
    }
    if (Math.abs(positions[i].y) > halfBound.y) {
        positions[i].y = halfBound.y * dirY;
        velocities[i].y = -velocities[i].y * options.collisionDamping;
    }

    //barycentric coordinates of slope
    const p = new THREE.Vector2(positions[i].x, positions[i].y)
    const p1 = new THREE.Vector2(-options.boundH/2, -options.boundV/2);
    const p2 = new THREE.Vector2(-options.boundH/2, -options.boundV/2 + slopeSize);
    const p3 = new THREE.Vector2(-options.boundH/2 + slopeSize, -options.boundV/2);
    if (isPointInTriangle(p, p1, p2, p3)) {
        const normal = new THREE.Vector3(1, 1, 0).normalize();
        const nearestPoint = nearestPointInLine(p, p2, p3);
        nearestPoint.add(normal.clone().multiplyScalar(options.particleRadius));
        positions[i].x = nearestPoint.x;
        positions[i].y = nearestPoint.y;
        const dot = velocities[i].dot(normal);
        const reflectVel = velocities[i].clone().sub(normal.clone().multiplyScalar(2 * dot));
        velocities[i] = reflectVel.multiplyScalar(options.collisionDamping);
    }
}

function resolveParticleBallCollision(positions, i, updateVelocity=false){
    var contact = false;
    if (positions[i].distanceTo(ballPos) < BALL_RADIUS + options.particleRadius) {
        const normal = positions[i].clone().sub(ballPos).normalize();
        positions[i] = ballPos.clone().add(normal.clone().multiplyScalar(BALL_RADIUS + options.particleRadius));
        const dot = velocities[i].dot(normal);
        const reflectVel = velocities[i].clone().sub(normal.clone().multiplyScalar(2 * dot));
        contact = true;
        if(updateVelocity) velocities[i] = reflectVel.multiplyScalar(options.collisionDamping);
    }
    return contact;
}

//----- Ball physics -----//

function resolveBallBoundCollision() {
    let halfBound = new THREE.Vector2(options.boundH/2, options.boundV/2);
    halfBound.subVectors(halfBound, new THREE.Vector2(BALL_RADIUS, BALL_RADIUS));

    let dirX = Math.sign(ballPos.x);
    let dirY = Math.sign(ballPos.y);

    if (Math.abs(ballPos.x) > halfBound.x) {
        ballPos.x = halfBound.x * dirX;
        ballVel.x = -ballVel.x * options.collisionDamping;
    }

    if (Math.abs(ballPos.y) > halfBound.y) {
        ballPos.y = halfBound.y * dirY;
        ballVel.y = -ballVel.y * options.collisionDamping;
    }

    //barycentric coordinates of slope
    const p = new THREE.Vector2(ballPos.x, ballPos.y)
    const p1 = new THREE.Vector2(-options.boundH/2, -options.boundV/2);
    const p2 = new THREE.Vector2(-options.boundH/2, -options.boundV/2 + slopeSize);
    const p3 = new THREE.Vector2(-options.boundH/2 + slopeSize, -options.boundV/2);
    if (isLineIntersectCircle(p2, p3, ballPos, BALL_RADIUS)) {
        const nearestPoint = nearestPointInLine(p, p2, p3);
        const normal = new THREE.Vector3(1, 1, 0).normalize();
        nearestPoint.add(normal.clone().multiplyScalar(BALL_RADIUS));
        ballPos.x = nearestPoint.x;
        ballPos.y = nearestPoint.y;
        const dot = ballVel.dot(normal);
        const reflectVel = ballVel.clone().sub(normal.clone().multiplyScalar(2 * dot));
        ballVel = reflectVel.multiplyScalar(options.collisionDamping);
    }
}

function calculateBallImpulses(contactPoints, incomingVelo) {
    const force = new THREE.Vector3();
    if(contactPoints.length != incomingVelo.length) return force;
    for(let i = 0; i < contactPoints.length; i++) {
        const dirToCenter = ballPos.clone().sub(contactPoints[i]).normalize();
        const veloToCenter = incomingVelo[i].clone().projectOnVector(dirToCenter);
        force.add(veloToCenter.clone());
    }
    return force;
}

//----- Hydrodynamics -----//

function calculateDensity(samplePoint) {
    let density = 0;
    let particlesInRadius = getParticleIndexesInRadius(samplePoint);

    particlesInRadius.forEach(i => {
        const d = samplePoint.distanceTo(predictedPositions[i]);
        const influence = smoothingKernel(options.smoothingRadius, d);
        density += influence * options.particleMass;
    })
    return density;
}

function convertDensityToPressure(density) {
    const densityError = density - options.targetDensity;
    const pressure = options.pressureMultiplier * densityError;
    return pressure;
}

function calculateSharedPressure(densityA, densityB) {
    const pressureA = convertDensityToPressure(densityA);
    const pressureB = convertDensityToPressure(densityB);
    return (pressureA + pressureB) / 2;
}

function calculatePressureForce(particleIdx) {
    let pressureForce = new THREE.Vector3();
    var samplePoint = predictedPositions[particleIdx].clone();

    let particlesInRadius = getParticleIndexesInRadius(samplePoint);

    particlesInRadius.forEach(i => {
        if (i === particleIdx) return;

        const dst = predictedPositions[i].distanceTo(samplePoint);
        let dir = new THREE.Vector3();
        if (dst === 0) dir = getRandomDirection();
        else dir = predictedPositions[i].clone().sub(samplePoint).multiplyScalar(1/dst);
        
        const slope = smoothingKernelDerivative(dst, options.smoothingRadius);
        const density = densities[i];
        const otherDensity = densities[particleIdx]
        const sharedPressure = calculateSharedPressure(density, otherDensity)
        pressureForce.add(dir.clone().multiplyScalar(sharedPressure * slope * options.particleMass / density))
    })

    return pressureForce;
}

function calculateViscosityForce(particleIdx) {
    let viscosityForce = new THREE.Vector3();
    const samplePoint = positions[particleIdx].clone();

    let particlesInRadius = getParticleIndexesInRadius(samplePoint);

    particlesInRadius.forEach(i => {
        if (i === particleIdx) return;
        const targetVelo = velocities[particleIdx];
        const dst = positions[i].distanceTo(samplePoint);
        const influence = viscositySmoothingKernel(dst, options.smoothingRadius);
        viscosityForce.add(velocities[i].clone().sub(targetVelo).multiplyScalar(influence));
    })

    return viscosityForce.multiplyScalar(options.viscosityStrength);
}

function interactionForce(inputPos, radius, strength, particleIdx) {
    const interactF = new THREE.Vector3();
    const offset = inputPos.clone().sub(positions[particleIdx]);
    const sqrDst = offset.clone().dot(offset);

    if (sqrDst < radius * radius) {
        const dist = Math.sqrt(sqrDst);
        const dirToInput = dist == 0 ? new THREE.Vector3() : offset.clone().multiplyScalar(1/dist);
        const centerT = 1 - dist / radius;
        interactF.add(dirToInput.clone().multiplyScalar(strength).sub(velocities[particleIdx].clone()).multiplyScalar(centerT));
    }

    return interactF;
}

//----- simulation step function -----//

function step(delta) {

    // apply gravity and calculate densities
    for (let i=0; i < NUM_PARTICLES; i++) {
        velocities[i].add( new THREE.Vector3( 0, -options.gravity * delta, 0 ) );
        predictedPositions[i] = positions[i].clone().add( velocities[i].clone().multiplyScalar( 1 / 30.0 ) );
        if(options.applyBallPhysics) resolveParticleBallCollision(predictedPositions, i, false);
    }

    // update spatial lookup table
    updateSpatialLookupTable(predictedPositions);

    //calculate densities
    for (let i=0; i < NUM_PARTICLES; i++) {
        densities[i] = calculateDensity(predictedPositions[i]);
    }

    // calculate pressure and viscosity forces
    for (let i=0; i < NUM_PARTICLES; i++) {
        if (interactPoint) {
            const interactF = interactionForce(new THREE.Vector3( interactPoint.x, interactPoint.y, 0 ), options.interactionRadius, options.interactionStrength, i);
            const interactAcceleration = interactF.multiplyScalar(1/densities[i]);
            velocities[i].add(interactAcceleration.clone().multiplyScalar(delta));
        }

        const pressureForce = calculatePressureForce(i);
        const pressureAcceleration = pressureForce.multiplyScalar(1/densities[i]);
        velocities[i].add(pressureAcceleration.clone().multiplyScalar(delta));

        const viscosityForce = calculateViscosityForce(i);
        const viscosityAcceleration = viscosityForce.multiplyScalar(1/densities[i]);
        velocities[i].add(viscosityAcceleration.clone().multiplyScalar(delta));
    }

    const ballIncomingParticleVelos = [];
    const ballContactPoints = [];

    // update positions and resolve collisions
    for (let i = 0; i < NUM_PARTICLES; i++) {
        positions[i].add( velocities[i].clone().multiplyScalar( delta ) );

        let beforeBallCollisionVelo = velocities[i].clone();
        const contact = resolveParticleBallCollision(positions, i, true);
        if (contact) {
            ballIncomingParticleVelos.push(beforeBallCollisionVelo.clone());
            ballContactPoints.push(positions[i].clone());
        }
        resolveParticleBoundCollisions(i);

        particles[i].sceneObject.position.set( positions[i].x, positions[i].y, positions[i].z );
    }

    // apply ball physics
    if (options.applyBallPhysics) {
        ballVel.add(new THREE.Vector3(0, -options.gravity * delta, 0));
        const particleForce = calculateBallImpulses(ballContactPoints, ballIncomingParticleVelos);
        const particleForceAcceleration = particleForce.multiplyScalar(1/options.ballMass);
        ballVel.add(particleForceAcceleration.clone().multiplyScalar(delta));
        ballPos.add(ballVel.clone().multiplyScalar(delta));
    }

    // resolve ball collisions
    resolveBallBoundCollision();
    ball.position.set(ballPos.x, ballPos.y, ballPos.z);

    // update particle colors
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const maxVelocity = 4.5;
        const f = Math.min(Math.max(velocities[i].length() / maxVelocity, 0), 1);
        const color = interpolateColor(options.gradientSlowColor, options.gradientFastColor, f);
        particles[i].sceneObject.material.uniforms.uColor.value = new THREE.Color(`#${color}`);
    }
}


//==================== Main loop ====================//

var then = 0;
var accumDelta = 0;
var frameCount = 0;
const fpsRefreshRate = 1;
var labels = {
    fps: 0
}
datgui.add(labels, 'fps').listen();

function update(now) {

    // delta time
    now *= 0.001;  // convert to seconds
    const delta = 1/30;
    const trueDelta = now - then;
    then = now;

    // mouse interaction
    if (mouseDown) {
        raycaster.setFromCamera( mousePosition, camera );
        const intersects = raycaster.intersectObjects([ball, plane]);
        if (intersects.length > 0) {
            if(intersects.length > 1 && (interactionFocus === "ball" || !interactionFocus)) {
                ballPickupPoint = intersects[0].point.clone();
                interactionFocus = "ball"
                ballPos = ballPickupPoint.clone().setZ(0);
                ballVel = new THREE.Vector3(0, 0, 0);
                ball.position.set(ballPos.x, ballPos.y, ballPos.z);
            } else if (interactionFocus === "plane" || !interactionFocus){
                ballPickupPoint = null;
                interactPoint = intersects[0].point.clone();
                interactionFocus = "plane"
            }
        } else {
            ballPickupPoint = null;
            interactPoint = null;
        }
    }

    // simulation step
    if (!paused) {
        accumDelta += trueDelta;
        frameCount++;
        if (accumDelta >= fpsRefreshRate) {
            labels.fps = frameCount * accumDelta;
            frameCount = 0;
            accumDelta = 0;
        }
        
        if (!isNaN(delta)) step(delta);
    }

    // render
    drawBounds();
    renderer.render( scene, camera );
}


//==================== Run ====================//

updateSpatialLookupTable(predictedPositions);
reset();

renderer.setAnimationLoop(update);
