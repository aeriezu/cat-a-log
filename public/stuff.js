import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Scene, Camera, Renderer Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // A nice sky blue background
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set(5, 5, 5); // Start camera further back to see the scene

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
document.body.appendChild( renderer.domElement );

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// --- Ground ---
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30,30),
    new THREE.MeshStandardMaterial({color: 0xcccccc})
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Controls ---
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set(0, 1, 0); // Look slightly up from the ground

// --- Raycasting and Interaction Variables ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const originalInteractableObjects = []; // Stores original furniture groups
let selectedObject = null; // The object currently being dragged

// --- GLTF Loading ---
const loader = new GLTFLoader();

loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    const model = glb.scene;
    
    // Unpack the loaded model so each piece of furniture is a direct child of the scene.
    // This makes them easier to manage, clone, and interact with individually.
    while(model.children.length > 0) {
        const furniturePiece = model.children[0];
        
        // Save original pieces to the array we'll use for creating clones
        originalInteractableObjects.push(furniturePiece);
        
        // Enable shadows for all meshes within the furniture piece
        furniturePiece.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        scene.add(furniturePiece);
    }
});


// --- Event Listeners ---
window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('resize', onWindowResize);


// --- Event Handler Functions ---

/**
 * Handles the start of a touch or click action.
 * It checks if you're clicking on an original object to create a clone,
 * or an existing clone to move it.
 */
function onPointerDown(event) {
    // We only want to handle the primary pointer (e.g., left mouse, first touch)
    if (event.isPrimary === false) return;

    updatePointerPosition(event);
    raycaster.setFromCamera(pointer, camera);

    // Get all cloned objects in the scene (we identify them with `userData`)
    const allClones = scene.children.filter(obj => obj.userData.isClone);
    const intersectsClones = raycaster.intersectObjects(allClones, true);

    // --- Case 1: Select an existing clone to move it ---
    if (intersectsClones.length > 0) {
        selectedObject = findTopLevelObject(intersectsClones[0].object, obj => obj.userData.isClone);
        controls.enabled = false; // Disable camera controls while moving an object
        document.getElementById('info').innerText = `Moving: ${selectedObject.name}`;
        return;
    }

    // --- Case 2: Select an original object to create a new clone ---
    const intersectsOriginals = raycaster.intersectObjects(originalInteractableObjects, true);

    if (intersectsOriginals.length > 0) {
        const originalToClone = findTopLevelObject(intersectsOriginals[0].object, obj => originalInteractableObjects.includes(obj));
        
        if (originalToClone) {
            const clone = originalToClone.clone();
            clone.userData.isClone = true; // Mark it as a clone
            
            // Raycast to the ground to find a place for the new clone
            const intersectsGround = raycaster.intersectObject(ground);
            if (intersectsGround.length > 0) {
                clone.position.copy(intersectsGround[0].point);
            }
            
            scene.add(clone);
            selectedObject = clone; // The new clone is now selected for moving
            controls.enabled = false; // Disable camera controls
            document.getElementById('info').innerText = `Created & Moving: ${clone.name || 'Cloned Object'}`;
        }
    }
}

/**
 * Handles the dragging motion. If an object is selected, it moves
 * it along the ground plane based on your pointer's position.
 */
function onPointerMove(event) {
    if (selectedObject === null || event.isPrimary === false) return;

    updatePointerPosition(event);
    raycaster.setFromCamera(pointer, camera);
    const intersectsGround = raycaster.intersectObject(ground);

    // Move the selected object along the ground plane
    if (intersectsGround.length > 0) {
        selectedObject.position.copy(intersectsGround[0].point);
    }
}

/**
 * Handles the end of a touch or click action. It "releases" the
 * selected object and re-enables the camera controls.
 */
function onPointerUp(event) {
    if (event.isPrimary === false) return;

    if (selectedObject !== null) {
        document.getElementById('info').innerText = `Placed: ${selectedObject.name || 'Cloned Object'}`;
        selectedObject = null; // "Release" the object
    }

    // Always re-enable camera controls on pointer up
    controls.enabled = true;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- Helper Functions ---

/**
 * Calculates the normalized device coordinates from a pointer event.
 */
function updatePointerPosition(event) {
    const touch = event.touches ? event.touches[0] : event;
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
}

/**
 * Traverses up the scene graph from a clicked mesh to find the top-level
 * object that we want to interact with (clone or move).
 */
function findTopLevelObject(object, validationFn) {
    let parent = object;
    while (parent.parent && parent.parent.type !== 'Scene') {
        if (validationFn(parent)) {
            return parent;
        }
        parent = parent.parent;
    }
    // If the loop finishes, it's because the object itself is the top-level one
    if (validationFn(parent)) {
       return parent;
    }
    return null;
}


// --- Animation Loop ---
function animate(){
    controls.update();
    renderer.render(scene,camera);
}

// Use setAnimationLoop for a consistent frame rate
renderer.setAnimationLoop(animate);