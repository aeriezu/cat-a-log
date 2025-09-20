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

// This is our main array, now consistently named
const furniturePieces = [];

loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    // This robust while-loop transfers children safely from the loaded scene to your main scene
    while (glb.scene.children.length > 0) {
        const item = glb.scene.children[0];

        // The scene.add(item) call automatically removes it from glb.scene.children
        scene.add(item);

        if (item.isGroup || item.isMesh) {
            furniturePieces.push(item);

            if (!item.name) item.name = `item-${THREE.MathUtils.generateUUID()}`;

            // Configure the helper for this top-level item
            const box = new THREE.Box3().setFromObject(item);
            const helper = new THREE.Box3Helper(box, 0xff0000); // Red color
            helper.material.transparent = true;
            helper.material.opacity = 0;
            scene.add(helper);
            
            item.userData.boxHelper = helper;
            item.userData.isColliding = false;

            // Traverse this item to set properties on all its children
            item.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        }
    }
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
    //... (pointer calculation code) ...

    raycaster.setFromCamera(pointer, camera);
    // Use the furniturePieces array for raycasting
    const intersects = raycaster.intersectObjects(furniturePieces, true);

    if (intersects.length > 0) {
        touchStartTime = Date.now();
        // Find the top-level parent from our list
        let target = intersects[0].object;
        while (target.parent && !furniturePieces.includes(target)) {
            target = target.parent;
        }

        setTimeout(() => {
            if (Date.now() - touchStartTime >= holdThreshold && !isSelected) {
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
    targetObject.userData.isColliding = false;

    const testBox = new THREE.Box3();
    const originalBox = new THREE.Box3().setFromObject(targetObject);
    const displacement = new THREE.Vector3().subVectors(potentialPosition, targetObject.position);
    testBox.copy(originalBox).translate(displacement);

    // First pass: Reset collision state
    for (const otherObject of furniturePieces) {
        if (otherObject !== targetObject) {
            otherObject.userData.isColliding = false;
        }
    }

    // Second pass: Check for new collisions
    for (const otherObject of furniturePieces) {
        if (otherObject === targetObject) continue;

        const otherBox = new THREE.Box3().setFromObject(otherObject);
        if (testBox.intersectsBox(otherBox)) {
            otherObject.userData.isColliding = true;
            targetObject.userData.isColliding = true;
            collisionDetected = true;
        }
    }
    
    return collisionDetected;
}
// --- TOUCHMOVE --- //
renderer.domElement.addEventListener('touchmove', (event) => {
    // Initiate the drag on the first touch move after selection
    if (selectedPiece && !isDragging) {
        isDragging = true;
    }

    if (!selectedPiece || !isDragging) return;
    event.preventDefault();

    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        const potentialPosition = new THREE.Vector3(
            intersectionPoint.x,
            selectedPiece.position.y,
            intersectionPoint.z
        );
        
        // FIX: was checkCollisions, should be updateCollisions
        const collision = updateCollisions(selectedPiece, potentialPosition);

        if (!collision) {
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
    // Only run if a piece is selected and we have started dragging
    if (!selectedPiece || !isDragging) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        const potentialPosition = new THREE.Vector3(
            intersectionPoint.x,
            selectedPiece.position.y,
            intersectionPoint.z
        );

        // Call the new function. It returns true if there is a collision.
        const collision = updateCollisions(selectedPiece, potentialPosition);
        
        if (!collision) {
            selectedPiece.position.copy(potentialPosition);
        }
    }
}

const clock = new THREE.Clock(); // Add this at the top of your script

function animate() {
    const deltaTime = clock.getDelta();
    const fadeSpeed = deltaTime * 5;

    // IMPORTANT: Loop over 'furniturePieces', not the empty 'interactableObjects'
    furniturePieces.forEach(object => {
        const helper = object.userData.boxHelper;
        if (helper) {
            helper.box.setFromObject(object);

            const targetOpacity = object.userData.isColliding ? 1.0 : 0.0;
            
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
