import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- SCENE, CAMERA, RENDERER --- //
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(4, 5, 7); // Adjusted for a better initial view

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- STATE MANAGEMENT --- //
const interactableObjects = []; // Stores top-level furniture groups
let selectedPiece = null;
let isSelected = false;   // Is an object in the "selected" state?
let isDragging = false;   // Is the user actively dragging the selected object?
let holdTimeout = null;
const holdThreshold = 500; // A shorter hold time feels more responsive

// --- UI ELEMENTS --- //
const doneButton = document.createElement('button');
doneButton.innerText = '✔️';
doneButton.style.cssText = `
    position: absolute; top: 20px; right: 20px; display: none;
    font-size: 24px; padding: 10px 15px; border-radius: 50%;
    border: none; cursor: pointer; background-color: #4CAF50; color: white;
`;
document.body.appendChild(doneButton);

doneButton.addEventListener('click', () => {
    if (selectedPiece) {
        selectedPiece = null;
        isSelected = false;
        isDragging = false;
        doneButton.style.display = 'none';
        controls.enabled = true;
    }
});

// --- LIGHTING AND GROUND --- //
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0xcccccc })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- CONTROLS, RAYCASTER --- //
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// --- GLTF LOADER --- //
const loader = new GLTFLoader();
loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    const model = glb.scene;
    while (model.children.length > 0) {
        const furniturePiece = model.children[0];
        interactableObjects.push(furniturePiece);
        furniturePiece.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(furniturePiece);
    }
});

// --- UNIFIED EVENT LISTENERS --- //
renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointerleave', onPointerUp); // Also stop on leave

function onPointerDown(event) {
    updatePointerPosition(event);
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length === 0) return;

    const topLevelObject = findTopLevelObject(intersects[0].object);
    if (!topLevelObject) return;

    // Case 1: An object is selected. Check if we're clicking it to start a drag.
    if (isSelected) {
        if (topLevelObject === selectedPiece) {
            isDragging = true;
            controls.enabled = false;
        }
        return;
    }

    // Case 2: No object is selected. Start the "hold-to-select" process.
    holdTimeout = setTimeout(() => {
        selectedPiece = topLevelObject;
        isSelected = true;
        doneButton.style.display = 'block';
        console.log('Selected:', selectedPiece.name);
        holdTimeout = null;
    }, holdThreshold);
}

function onPointerMove(event) {
    // If we move the pointer, it's not a "hold", so cancel the selection timeout
    if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
    }

    // IMPORTANT: Only move the object if we are actively dragging it.
    if (isDragging) {
        updatePointerPosition(event);
        raycaster.setFromCamera(pointer, camera);
        const intersectionPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, intersectionPoint)) {
            selectedPiece.position.set(
                intersectionPoint.x,
                selectedPiece.position.y,
                intersectionPoint.z
            );
        }
    }
}

function onPointerUp() {
    // If the pointer is released before the hold threshold, cancel the selection.
    if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = null;
    }
    
    // Stop any active drag and re-enable camera controls.
    isDragging = false;
    controls.enabled = true;
}

// --- HELPER FUNCTIONS --- //
function updatePointerPosition(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function findTopLevelObject(object) {
    let parent = object;
    while (parent) {
        if (interactableObjects.includes(parent)) return parent;
        parent = parent.parent;
    }
    return null;
}

// --- ANIMATION LOOP --- //
function animate() {
    controls.update();
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);