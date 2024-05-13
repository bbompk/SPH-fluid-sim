import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import dat from 'dat.gui';

const clock = new THREE.Clock();

renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

camera.position.set( 0, 0, 11 )

const datgui = new dat.GUI();

const MAX_WIDTH = 24;
const MAX_HEIGHT = 16;

const PARTICLE_DIV = 10;
const PARTICLE_RADIUS = 0.1;
const NUM_PARTICLES = 1600;
const PARTICLE_INIT_WIDTH = 40;
if (PARTICLE_DIV < 3) throw new Error('PARTICLE_DIV must be greater than 2');

// serializable options
const options = {
    gravity: 5,
    collisionDamping: 0.85,
    smoothingRadius: 0.35,
    particleMass: 1,
    targetDensity: 1.2,
    pressureMultiplier: 32,
    useSpatialGridLookup: true,
    boundV: MAX_HEIGHT,
    boundH: MAX_WIDTH
}

// variables
var spatialGridRows = Math.ceil(options.boundV/ options.smoothingRadius);
var spatialGridCols = Math.ceil(options.boundH / options.smoothingRadius);
var paused = true;

datgui.add(options, 'gravity', 0, 20)
datgui.add(options, 'collisionDamping', 0, 1)
datgui.add(options, 'smoothingRadius', 0.05, 5).onChange(() => {
    spatialGridRows = Math.ceil(options.boundV / options.smoothingRadius);
    spatialGridCols = Math.ceil(opitons.boundH / options.smoothingRadius);
    console.log(spatialGridRows, spatialGridCols);
})
datgui.add(options, 'particleMass', 0.1, 10)
datgui.add(options, 'targetDensity', 0.1, 30)
datgui.add(options, 'pressureMultiplier', 0.1, 200)
datgui.add(options, 'useSpatialGridLookup')
datgui.add(options, 'boundV', 2, MAX_HEIGHT, 1)
datgui.add(options, 'boundH', 2, MAX_WIDTH, 1)

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


class Particle {
    constructor(pos) {
        const particleGeometry = new THREE.BufferGeometry();
        let particleVertices = []
        let particleIndices = []
        particleVertices.push( 0, 0, 0 );
        for (let i = 0; i < PARTICLE_DIV; i++) {
            const angle = Math.PI * 2 * i / PARTICLE_DIV;
            particleVertices.push( Math.cos( angle ) * PARTICLE_RADIUS, Math.sin( angle ) * PARTICLE_RADIUS, 0 );
            particleIndices.push( 0, i + 1, (i + 1) % PARTICLE_DIV + 1 );
        }
        particleVertices = new Float32Array( particleVertices );
        particleGeometry.setIndex( particleIndices );
        particleGeometry.setAttribute( 'position', new THREE.BufferAttribute( particleVertices, 3 ) );
        const particleMat = new THREE.MeshBasicMaterial( { color: 0x0033ff } );
        const particle = new THREE.Mesh( particleGeometry, particleMat );
        particle.position.set( pos.x, pos.y, pos.z );

        this.sceneObject = particle;
        this.position = new THREE.Vector3( pos.x, pos.y, pos.z );
        this.velocity = new THREE.Vector3( 0, 0, 0 );
        this.mass = options.particleMass;
        this.density = 0;
    }
}

const planeGeometry = new THREE.PlaneGeometry( MAX_WIDTH, MAX_HEIGHT );
const planeMat = new THREE.MeshBasicMaterial( { color: 0xEFEFEF, side: THREE.DoubleSide } );
const plane = new THREE.Mesh( planeGeometry, planeMat );
//scene.add( plane );
plane.position.set( 0, 0, -1 );

var particles = [];
const densities = new Array(NUM_PARTICLES).fill(0);
const positions = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));
const velocities = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));
const predictedPositions = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));
var spatialLookupTable = (new Array(NUM_PARTICLES).fill(0)).map(() => new THREE.Vector2(0));
var spatialTableStartIndices = new Array(NUM_PARTICLES).fill(-1);

// Initialize particles
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
            const particle = new Particle( new THREE.Vector3( i * PARTICLE_RADIUS * 2, j * PARTICLE_RADIUS * 2, 0 ) );
            scene.add( particle.sceneObject );
            particles.push( particle );
            positions[pidx] = particle.position.clone();
            velocities[pidx] = particle.velocity.clone();
            pidx++;
        }
    }

    console.log(`Initialized ${particles.length} particles`)

    renderer.render( scene, camera );
}

const resetBtn = document.getElementById('reset-btn');
resetBtn.onclick = () => {
    reset();
    pause(true);
}



function getCellCoord(pos) {
    return new THREE.Vector2(Math.floor(pos.x / options.smoothingRadius), Math.floor(pos.y / options.smoothingRadius));
}

function getCellHash(celcoord) {
    const primeA = 4591;
    const primeB = 3643;

    return celcoord.x * primeA + celcoord.y * primeB;
}

function updateSpatialLookupTable() {
    const spatialGridSize = spatialGridCols * spatialGridRows;

    spatialTableStartIndices = new Array(spatialGridSize).fill(-1);
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const pos = predictedPositions[i].clone();
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

function resolveCollisions(i) {
    let halfBound = new THREE.Vector2(options.boundH/2, options.boundV/2);
    halfBound.subVectors(halfBound, new THREE.Vector2(PARTICLE_RADIUS, PARTICLE_RADIUS));

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
}

function smoothingKernel(radius, dist) {
    if (dist >= radius) return 0;

    const vol = (Math.PI * Math.pow(radius, 4)) / 6;
    return (radius - dist) * (radius -dist) / vol;
}

function smoothingKernelDerivative(dist, radius) {
    if (dist >= radius) return 0
    
    const scale = 12 / (Math.pow(radius, 4) * Math.PI);
    return (dist - radius) * scale;
}

function calculateDensity(samplePoint) {
    let density = 0;
    let particlesInRadius = getParticleIndexesInRadius(samplePoint);

    if (!options.useSpatialGridLookup) {
        particlesInRadius = [...Array(NUM_PARTICLES).keys()];
    }

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

function getRandomDirection() {
    return (new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0)).normalize();
}

function calculateSharedPressure(densityA, densityB) {
    const pressureA = convertDensityToPressure(densityA);
    const pressureB = convertDensityToPressure(densityB);
    return (pressureA + pressureB) / 2;
}

function calculatePressureForce(particleIdx) {
    let pressureForce = new THREE.Vector3();
    const samplePoint = predictedPositions[particleIdx].clone();
    let particlesInRadius = getParticleIndexesInRadius(samplePoint);

    if (!options.useSpatialGridLookup) {
        particlesInRadius = [...Array(NUM_PARTICLES).keys()];
    }

    particlesInRadius.forEach(i => {
        if (i === particleIdx) return;

        const dst = predictedPositions[i].distanceTo(samplePoint);
        let dir = new THREE.Vector3();
        if (dst === 0) dir = getRandomDirection();
        else dir = predictedPositions[i].clone().sub(samplePoint).multiplyScalar(1/dst);
        
        const slope = smoothingKernelDerivative(dst, options.smoothingRadius);
        const density = densities[i];
        const sharedPressure = calculateSharedPressure(density, densities[particleIdx])
        pressureForce.add(dir.clone().multiplyScalar(sharedPressure * slope * options.particleMass / density))
    })

    return pressureForce;
}


function update(delta) {

    // apply gravity and calculate densities
    for (let i=0; i < NUM_PARTICLES; i++) {
        velocities[i].add( new THREE.Vector3( 0, -options.gravity * delta, 0 ) );
        predictedPositions[i] = positions[i].clone().add( velocities[i].clone().multiplyScalar( 1 / 60.0 ) );
    }

    updateSpatialLookupTable();

    //calculate densities
    for (let i=0; i < NUM_PARTICLES; i++) {
        densities[i] = calculateDensity(predictedPositions[i]);
    }

    // calculate pressure forces
    for (let i=0; i < NUM_PARTICLES; i++) {
        const pressureForce = calculatePressureForce(i);
        // a = F / m
        const acceleration = pressureForce.multiplyScalar(1/densities[i]);
        velocities[i].add(acceleration.clone().multiplyScalar(delta));
    }

    // update positions and resolve collisions
    for (let i = 0; i < NUM_PARTICLES; i++) {
        positions[i].add( velocities[i].clone().multiplyScalar( delta ) );
        resolveCollisions(i);

        particles[i].sceneObject.position.set( positions[i].x, positions[i].y, positions[i].z );
    }
}

updateSpatialLookupTable();

var labels = {
    fps: 0
}
datgui.add(labels, 'fps').listen();

reset();

var then = 0;
function step(now) {
    now *= 0.001;  // convert to seconds
    const delta = now - then;
    then = now;

    if (paused) return;

    labels.fps = 1 / delta;
    
    if (!isNaN(delta)) update(delta);
    renderer.render( scene, camera );
}

renderer.setAnimationLoop(step);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
});
