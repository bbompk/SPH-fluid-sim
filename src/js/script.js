import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import dat from 'dat.gui';

const clock = new THREE.Clock();

renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const orbit = new OrbitControls( camera, renderer.domElement );

const axesHelper = new THREE.AxesHelper( 5 );
scene.add( axesHelper );

camera.position.set( 0, 0, 12 )
orbit.update();

const datgui = new dat.GUI();

const CANVAS_WIDTH = 24;
const CANVAS_HEIGHT = 16;

const BOUND_X = 24
const BOUND_Y = 16

const PARTICLE_DIV = 10;
const PARTICLE_RADIUS = 0.1;
const NUM_PARTICLES = 1600;
const PARTICLE_INIT_DIMENSION = new THREE.Vector2(40, 40)
if (PARTICLE_INIT_DIMENSION.x * PARTICLE_INIT_DIMENSION.y != NUM_PARTICLES) throw new Error('PARTICLE_INIT_DIMENSION must be a factor of NUM_PARTICLES')
if (PARTICLE_DIV < 3) throw new Error('PARTICLE_DIV must be greater than 2');

// serializable options
const options = {
    gravity: 0,
    collisionDamping: 0.85,
    smoothingRadius: 0.85,
    particleMass: 1,
    targetDensity: 1.2,
    pressureMultiplier: 1,
    useSpatialGridLookup: true
}

// variables
var spatialGridRows = Math.ceil(BOUND_Y / options.smoothingRadius);
var spatialGridCols = Math.ceil(BOUND_X / options.smoothingRadius);

datgui.add(options, 'gravity', 0, 20)
datgui.add(options, 'collisionDamping', 0, 1)
datgui.add(options, 'smoothingRadius', 0.05, 5).onChange(() => {
    spatialGridRows = Math.ceil(BOUND_Y / options.smoothingRadius);
    spatialGridCols = Math.ceil(BOUND_X / options.smoothingRadius);
    console.log(spatialGridRows, spatialGridCols);
})
datgui.add(options, 'particleMass', 0.1, 10)
datgui.add(options, 'targetDensity', 0.1, 30)
datgui.add(options, 'pressureMultiplier', 0.1, 40)
datgui.add(options, 'useSpatialGridLookup')

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
        const particleMat = new THREE.MeshBasicMaterial( { color: 0x0033ff, side: THREE.DoubleSide } );
        const particle = new THREE.Mesh( particleGeometry, particleMat );
        particle.position.set( pos.x, pos.y, pos.z );

        this.sceneObject = particle;
        this.position = new THREE.Vector3( pos.x, pos.y, pos.z );
        this.velocity = new THREE.Vector3( 0, 0, 0 );
        this.mass = options.particleMass;
        this.density = 0;
    }
}

const planeGeometry = new THREE.PlaneGeometry( CANVAS_WIDTH, CANVAS_HEIGHT );
const planeMat = new THREE.MeshBasicMaterial( { color: 0xEFEFEF, side: THREE.DoubleSide } );
const plane = new THREE.Mesh( planeGeometry, planeMat );
scene.add( plane );
plane.position.set( 0, 0, -1 );

const particles = [];
const densities = new Array(NUM_PARTICLES).fill(0);
const predictedPositions = new Array(NUM_PARTICLES).fill(new THREE.Vector3(0));
var spatialLookupTable = (new Array(NUM_PARTICLES).fill(0)).map(() => new THREE.Vector2(0));
var spatialTableStartIndices = new Array(NUM_PARTICLES).fill(-1);

// Initialize particles
const halfx = Math.ceil(PARTICLE_INIT_DIMENSION.x / 2);
const halfy = Math.ceil(PARTICLE_INIT_DIMENSION.y / 2);
var pidx = 0;
for (let i = -halfx; i <= halfx; i++) {
    for (let j = -halfy; j <= halfy; j++) {
        if (pidx >= NUM_PARTICLES) break;
        const particle = new Particle( new THREE.Vector3( i * PARTICLE_RADIUS * 2, j * PARTICLE_RADIUS * 2, 0 ) );
        scene.add( particle.sceneObject );
        particles.push( particle );
        pidx++;
    }
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
        const pos = particles[i].position.clone();
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
            const dst = particles[idx].position.distanceTo(samplePoint);
            if (dst < options.smoothingRadius) indices.push(idx);
        }
    })
    return indices;
}

function resolveCollisions(i) {
    let halfBound = new THREE.Vector2(BOUND_X/2, BOUND_Y/2);
    halfBound.subVectors(halfBound, new THREE.Vector2(PARTICLE_RADIUS, PARTICLE_RADIUS));

    let dirX = Math.sign(particles[i].position.x);
    let dirY = Math.sign(particles[i].position.y);

    if (Math.abs(particles[i].position.x) > halfBound.x) {
        particles[i].position.x = halfBound.x * dirX;
        particles[i].velocity.x = -particles[i].velocity.x * options.collisionDamping;
    }
    if (Math.abs(particles[i].position.y) > halfBound.y) {
        particles[i].position.y = halfBound.y * dirY;
        particles[i].velocity.y = -particles[i].velocity.y * options.collisionDamping;
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
        const d = samplePoint.distanceTo(particles[i].position);
        const influence = smoothingKernel(options.smoothingRadius, d);
        density += influence * particles[i].mass;
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
    const samplePoint = particles[particleIdx].position.clone();
    let particlesInRadius = getParticleIndexesInRadius(samplePoint);

    if (!options.useSpatialGridLookup) {
        particlesInRadius = [...Array(NUM_PARTICLES).keys()];
    }

    particlesInRadius.forEach(i => {
        if (i === particleIdx) return;

        const dst = particles[i].position.distanceTo(samplePoint);
        let dir = new THREE.Vector3();
        if (dst === 0) dir = getRandomDirection();
        else dir = particles[i].position.clone().sub(samplePoint).multiplyScalar(1/dst);
        
        const slope = smoothingKernelDerivative(dst, options.smoothingRadius);
        const density = densities[i];
        const sharedPressure = calculateSharedPressure(density, densities[particleIdx])
        pressureForce.add(dir.clone().multiplyScalar(sharedPressure * slope * particles[i].mass / density))
    })

    return pressureForce;
}


function update(delta) {
    updateSpatialLookupTable();

    // apply gravity and calculate densities
    for (let i=0; i < NUM_PARTICLES; i++) {
        particles[i].velocity.add( new THREE.Vector3( 0, -options.gravity * delta, 0 ) );
        densities[i] = calculateDensity(particles[i].position);
    }

    // calculate pressure forces
    for (let i=0; i < NUM_PARTICLES; i++) {
        const pressureForce = calculatePressureForce(i);
        // a = F / m
        const acceleration = pressureForce.multiplyScalar(1/densities[i]);
        particles[i].velocity.add(acceleration.clone().multiplyScalar(delta));
    }

    // update positions and resolve collisions
    for (let i = 0; i < NUM_PARTICLES; i++) {
        particles[i].position.add( particles[i].velocity.clone().multiplyScalar( delta ) );
        resolveCollisions(i);

        particles[i].sceneObject.position.set( particles[i].position.x, particles[i].position.y, particles[i].position.z );
    }
}

var then = 0;
function step(now) {
    requestAnimationFrame( step );

    now *= 0.001;  // convert to seconds
    const delta = now - then;
    then = now;
    
    if (!isNaN(delta)) update(delta);
    renderer.render( scene, camera );
}

step();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
});
