import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// --- Core Three.js Components --- //
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

// --- Lighting --- //
const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
light.position.set(0.5, 1, 0.25);
scene.add(light);

// --- Model Loading --- //
const loader = new GLTFLoader();
const interactableObjects = [];
// This map will store original materials to restore them after deselection
const originalMaterials = new Map();

loader.load('low_poly_furnitures_full_bundle.glb', glb => {
    const model = glb.scene;
    scene.add(model);
    model.traverse(child => {
        if(child.isMesh){
            interactableObjects.push(child);
        }
    });
});

// --- UI Elements --- //
const doneButton = document.createElement('button');
doneButton.id = 'done-button';
doneButton.innerText = 'Place Furniture ✔️';
document.body.appendChild(doneButton);

// --- AR Hit-Test & State Variables --- //
let hitTestSource = null;
let hitTestSourceRequested = false;
let selectedPiece = null;
let isMovingObject = false;

// --- Interaction Logic Variables --- //
let lastTapTime = 0;
const doubleTapThreshold = 300; // milliseconds

// --- Event Listeners for Double-Tap --- //

renderer.domElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();

    // If we are already moving an object, a single tap will place it.
    if (isMovingObject) {
        // Restore original materials before placing
        if (selectedPiece && originalMaterials.has(selectedPiece)) {
            selectedPiece.traverse(child => {
                if (child.isMesh) {
                    child.material = originalMaterials.get(selectedPiece).get(child);
                }
            });
            originalMaterials.delete(selectedPiece);
        }
        isMovingObject = false;
        selectedPiece = null;
        doneButton.style.display = 'none';
        return;
    }

    // Check for double-tap
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTapTime;

    if (timeSinceLastTap < doubleTapThreshold) {
        // --- DOUBLE-TAP CONFIRMED ---
        const pointer = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(interactableObjects, true);

        if (intersects.length > 0) {
            selectedPiece = intersects[0].object.parent; // Select the whole furniture group
            isMovingObject = true;
            doneButton.style.display = 'block';

            // --- FIX: Calculate floor offset for the whole object at selection time ---
            const box = new THREE.Box3().setFromObject(selectedPiece);
            selectedPiece.userData.floorOffset = box.min.y;

            // --- FEATURE: Visual Feedback on Selection (Glow Effect) ---
            const childMaterials = new Map();
            selectedPiece.traverse(child => {
                if (child.isMesh) {
                    // Store the original material
                    childMaterials.set(child, child.material);
                    // Clone it and make it glow green
                    const highlightMaterial = child.material.clone();
                    highlightMaterial.emissive = new THREE.Color(0x00ff00);
                    highlightMaterial.emissiveIntensity = 0.5;
                    child.material = highlightMaterial;
                }
            });
            originalMaterials.set(selectedPiece, childMaterials);
        }
    }

    lastTapTime = currentTime;
});


// Done button also places the furniture
doneButton.addEventListener('click', () => {
    if (isMovingObject) {
        // Restore materials when done button is clicked
        if (selectedPiece && originalMaterials.has(selectedPiece)) {
             selectedPiece.traverse(child => {
                if (child.isMesh) {
                    child.material = originalMaterials.get(selectedPiece).get(child);
                }
            });
            originalMaterials.delete(selectedPiece);
        }
        isMovingObject = false;
        selectedPiece = null;
        doneButton.style.display = 'none';
    }
});


// --- Animation Loop --- //
function animate(timestamp, frame) {
    if (frame) {
        if (!hitTestSourceRequested) {
            const session = renderer.xr.getSession();
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource && isMovingObject && selectedPiece) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const referenceSpace = renderer.xr.getReferenceSpace();
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);
                
                // --- FIX: Use the new, more accurate floor offset ---
                // The hit test gives the floor position. We subtract the distance from the
                // object's origin to its bottom edge, placing it perfectly on the floor.
                selectedPiece.position.set(
                    pose.transform.position.x,
                    pose.transform.position.y - selectedPiece.userData.floorOffset,
                    pose.transform.position.z
                );
            }
        }
    }
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);