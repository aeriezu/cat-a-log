import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- SCENE, CAMERA, RENDERER --- //
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.setAnimationLoop(animate);
document.body.appendChild( renderer.domElement );

// --- OBJECT SELECT --- //
const interactableObjects = [];
let selectedPiece = null;
let touchStartTime = 0;
const holdThreshold = 800;
let isSelected = false;
let isDragging = false;

// --- OBJECT DONE BUTTON --- //
const doneButton = document.createElement('button');
doneButton.innerText = '✔️';
doneButton.style.position = 'absolute';
doneButton.style.top = '10px';
doneButton.style.right = '10px';
doneButton.style.display = 'none';
document.body.appendChild(doneButton);

doneButton.addEventListener('click', () => {
    selectedPiece = null;
    isSelected = false;
    doneButton.style.pointerEvents = 'auto';
    isDragging = false; // <-- ADD THIS LINE
    doneButton.style.display = 'none';
    controls.enabled = true;
});

// --- GROUND --- //
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30,30),
    new THREE.MeshStandardMaterial({color: 0xcccccc})
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- CONTROLS --- //
const controls = new OrbitControls( camera, renderer.domElement );

// --- RAYCASTING AND POINTER -- //
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// --- GLTF LOADER --- //
const loader = new GLTFLoader();

const funiturePieces = [] // store invidual meshes

loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    const model = glb.scene;
    scene.add(model);

    model.traverse((child) => {
        if (child.isMesh) {
            interactableObjects.push(child);
            child.castShadow = true;
            child.receiveShadow = true;
            if (!child.name) child.name = THREE.MathUtils.generateUUID();
            funiturePieces.push(child);

            // --- NEW: Create and configure the helper ---
            const box = new THREE.Box3().setFromObject(child);
            const helper = new THREE.Box3Helper(box, 0xff0000); // Red color for collision

            // Make material transparent so we can fade it
            helper.material.transparent = true;
            helper.material.opacity = 0; // Start fully transparent
            scene.add(helper);

            // Store the helper and collision state on the object itself
            child.userData.boxHelper = helper;
            child.userData.isColliding = false;
            // ---------------------------------------------
        }
    });
});


// --- EVENT LISTENERS --- //
window.addEventListener('pointermove', onPointerMove);
// --- MOUSE UP --- //
window.addEventListener('pointerup', () => {
    // When we let go, reset the collision state of the piece we were holding
    if (selectedPiece) {
        selectedPiece.userData.isColliding = false;
    }
    isDragging = false;
});

renderer.domElement.addEventListener('touchstart', (event) => {
    if(isSelected) return;
    if (event.touches.length !== 1) return;
    
    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
        touchStartTime = Date.now();
        const target = intersects[0].object.parent; // top-level object
        selectedPiece = null; // not yet selected

        // check after holdThreshold
        setTimeout(() => {
            if (Date.now() - touchStartTime >= holdThreshold) {
                selectedPiece = target;
                isSelected = true;
                doneButton.style.display = 'block';
                controls.enabled = false;
                console.log('Selected:', selectedPiece.name);
            }
        }, holdThreshold);
    }
});

//--COLLISION LOGIC--
/**
 * Checks for collisions and updates the .isColliding state on all objects.
 * @param {THREE.Object3D} targetObject - The object being moved.
 * @param {THREE.Vector3} potentialPosition - The position to test.
 * @returns {boolean} - True if a collision was detected.
 */
function updateCollisions(targetObject, potentialPosition) {
    let collisionDetected = false;
    
    const originalBox = new THREE.Box3().setFromObject(targetObject);
    const displacement = new THREE.Vector3().subVectors(potentialPosition, targetObject.position);
    const testBox = originalBox.clone().translate(displacement);

    // Check against all other objects
    for (const otherObject of interactableObjects) {
        if (otherObject === targetObject) continue;

        const otherBox = new THREE.Box3().setFromObject(otherObject);
        if (testBox.intersectsBox(otherBox)) {
            // A collision is happening with this specific object
            otherObject.userData.isColliding = true;
            collisionDetected = true;
        } else {
            // No collision with this specific object
            otherObject.userData.isColliding = false;
        }
    }

    // Update the state of the object being dragged
    targetObject.userData.isColliding = collisionDetected;

    return collisionDetected;
}
// --- TOUCHMOVE --- //
renderer.domElement.addEventListener('touchmove', (event) => {
    if (!selectedPiece || !isDragging) return; // Only move if we are in a dragging state
    event.preventDefault();

    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        // This is where the object *wants* to go
        const potentialPosition = new THREE.Vector3(
            intersectionPoint.x,
            selectedPiece.position.y,
            intersectionPoint.z
        );

        // Check for collisions BEFORE moving the object
        if (!checkCollisions(selectedPiece, potentialPosition)) {
            // If no collisions, update the position
            selectedPiece.position.copy(potentialPosition);
        }
    }
});

// --- TOUCH END --- //
renderer.domElement.addEventListener('touchend', () => {
    touchStartTime = 0;
    if (selectedPiece) {
        selectedPiece.userData.isColliding = false;
    }
    isDragging = false;
});

function onPointerDown(event) {
    if (!selectedPiece) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
        selectedPiece = intersects[0].object.parent; // pick parent mesh
        console.log(`Selected: ${selectedPiece.name}`);

        document.getElementById('info').innerText = `Selected: ${selectedPiece.name}`;
    } else {
        selectedPiece = null;
    }
}


function onPointerMove(event) {
    if (!selectedPiece || !isDragging) return;
    // ... (pointer calculation code) ...

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        const potentialPosition = new THREE.Vector3(/*...*/);

        // Call the new function. It returns true if there is a collision.
        const collision = updateCollisions(selectedPiece, potentialPosition);
        
        if (!collision) {
            selectedPiece.position.copy(potentialPosition);
        }
    }
}

const clock = new THREE.Clock(); // Add this at the top of your script

function animate() {
    const deltaTime = clock.getDelta(); // Use delta time for smooth, frame-rate independent animation
    const fadeSpeed = deltaTime * 5; // Adjust this value to change fade speed

    // Update all box helpers
    interactableObjects.forEach(object => {
        const helper = object.userData.boxHelper;
        if (helper) {
            // Keep the helper's box in sync with the object's position
            helper.box.setFromObject(object);

            // Determine target opacity based on collision state
            const targetOpacity = object.userData.isColliding ? 1.0 : 0.0;
            
            // Smoothly move current opacity towards the target
            if (helper.material.opacity < targetOpacity) {
                helper.material.opacity = Math.min(targetOpacity, helper.material.opacity + fadeSpeed);
            } else if (helper.material.opacity > targetOpacity) {
                helper.material.opacity = Math.max(targetOpacity, helper.material.opacity - fadeSpeed);
            }
        }
    });

    controls.update();
    renderer.render(scene, camera);
}
