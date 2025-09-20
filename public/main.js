import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DeviceOrientationControls } from 'three/addons/controls/DeviceOrientationControls.js';

// --- Get HTML Elements --- //
const arContainer = document.getElementById('ar-container');
const videoElement = document.getElementById('video-background');

// --- Core Three.js Components --- //
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, arContainer.clientWidth / arContainer.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(arContainer.clientWidth, arContainer.clientHeight);
arContainer.appendChild(renderer.domElement); // Append canvas to our container

// --- Controls --- //
// DeviceOrientationControls links the 3D camera to the phone's motion sensors
const controls = new DeviceOrientationControls(camera);

// --- Lighting --- //
const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
light.position.set(0.5, 1, 0.25);
scene.add(light);

// --- Live Camera Feed Setup --- //
async function setupCameraFeed() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // Use the rear camera
        });
        videoElement.srcObject = stream;
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access the camera. Please ensure you've given permission.");
    }
}
// Start the camera feed
setupCameraFeed();

// --- State Variables & Configuration --- //
const interactableObjects = [];
const originalMaterials = new Map();
const furniturePieces = new Map();
let selectedPiece = null;
let isMovingObject = false;
let objectToPlace = null;
const INITIAL_SCALE = 0.2;

// --- Model Loading & UI Creation --- //
const loader = new GLTFLoader();
loader.load(
    // The path to your model
    'low_poly_furnitures_full_bundle.glb', 
    
    //
    // 1. onSuccess callback (this runs when the model loads)
    //
    (glb) => {
        console.log("Model loaded successfully.");
        const furnitureMenu = document.getElementById('furniture-menu');
        glb.scene.traverse(child => {
            if (child.isMesh && child.name && !furniturePieces.has(child.name)) {
                furniturePieces.set(child.name, child);

                const button = document.createElement('button');
                button.textContent = child.name;
                button.addEventListener('click', () => {
                    document.querySelectorAll('#furniture-menu button').forEach(b => b.classList.remove('selected'));
                    objectToPlace = furniturePieces.get(child.name);
                    button.classList.add('selected');
                });
                furnitureMenu.appendChild(button);
            }
        });
    },

    //
    // 2. onProgress callback (optional)
    //
    undefined, 

    //
    // 3. onError callback (THIS IS THE IMPORTANT PART)
    //
    (error) => {
        console.error("Failed to load 3D model.", error);
        alert("ERROR: Could not load the furniture file. Please check the Developer Console for a 404 or other error.");
    }
);

// --- Interaction Logic --- //
// NOTE: Interaction is now simplified as we don't have real-world surface detection.
renderer.domElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();

    // -- Placing a NEW object --
    if (objectToPlace) {
        const newObject = objectToPlace.clone();
        newObject.scale.set(INITIAL_SCALE, INITIAL_SCALE, INITIAL_SCALE);
        
        // Place the object 2 meters in front of the camera
        const position = new THREE.Vector3(0, -0.5, -2); // Adjust Y to appear lower
        position.applyMatrix4(camera.matrixWorld); // Position relative to camera
        newObject.position.copy(position);

        scene.add(newObject);
        interactableObjects.push(newObject);

        objectToPlace = null;
        document.querySelectorAll('#furniture-menu button').forEach(b => b.classList.remove('selected'));
        return;
    }

    // -- Moving an object (No longer supported in this simplified mode) --
    // We could re-implement this, but it would require raycasting against a virtual floor plane.
});


// --- Animation Loop --- //
function animate() {
    requestAnimationFrame(animate);

    // Update the controls to match the device's orientation
    controls.update();

    renderer.render(scene, camera);
}

animate(); // Start the animation loop

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = arContainer.clientWidth / arContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(arContainer.clientWidth, arContainer.clientHeight);
});