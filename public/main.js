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

// --- State Variables --- //
const interactableObjects = [];
const originalMaterials = new Map();
const furniturePieces = new Map(); // Stores the original furniture pieces for cloning
let selectedPiece = null;
let isMovingObject = false;
let objectToPlace = null; // The object we intend to place from the menu
let ghostObject = null; // The semi-transparent preview

// --- Model Loading & UI Creation (Corrected) --- //
const loader = new GLTFLoader();
loader.load('low_poly_furnitures_full_bundle.glb', glb => {
    const furnitureMenu = document.getElementById('furniture-menu');
    const model = glb.scene;

    // --- FIX: Use the correct path to the individual furniture pieces ---
    // The path is scene > children[0] > children[0] > children
    const individualPieces = model.children[0].children[0].children;

    individualPieces.forEach(piece => {
        if (piece.isObject3D && piece.name) {
            // Store the original piece for cloning
            furniturePieces.set(piece.name, piece);

            // Create a UI button for this piece
            const button = document.createElement('button');
            button.textContent = piece.name;
            button.addEventListener('click', () => {
                document.querySelectorAll('#furniture-menu button').forEach(b => b.classList.remove('selected'));
                objectToPlace = furniturePieces.get(piece.name);
                button.classList.add('selected');

                if (ghostObject) scene.remove(ghostObject);
                ghostObject = objectToPlace.clone();
                ghostObject.traverse(child => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
                    }
                });
                ghostObject.visible = false;
                scene.add(ghostObject);
            });
            furnitureMenu.appendChild(button);
        }
    });
});

// --- Interaction Logic --- //
let lastTapTime = 0;
const doubleTapThreshold = 300;

renderer.domElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();

    // -- Priority 1: Placing a NEW object --
    if (objectToPlace && ghostObject && ghostObject.visible) {
        // Clone the object and place it
        const newObject = objectToPlace.clone();
        newObject.position.copy(ghostObject.position);
        scene.add(newObject);

        // Make the new object interactable
        newObject.traverse(child => {
            if (child.isMesh) interactableObjects.push(child);
        });

        // Reset placing mode
        objectToPlace = null;
        scene.remove(ghostObject);
        ghostObject = null;
        document.querySelectorAll('#furniture-menu button').forEach(b => b.classList.remove('selected'));
        return;
    }

    // -- Priority 2: Placing an EXISTING moved object --
    if (isMovingObject) {
        // (This logic is the same as before)
        if (selectedPiece && originalMaterials.has(selectedPiece)) {
            selectedPiece.traverse(child => {
                if (child.isMesh) child.material = originalMaterials.get(selectedPiece).get(child);
            });
            originalMaterials.delete(selectedPiece);
        }
        isMovingObject = false;
        selectedPiece = null;
        return;
    }

    // -- Priority 3: Check for double-tap to START moving an object --
    const currentTime = Date.now();
    if (currentTime - lastTapTime < doubleTapThreshold) {
        const pointer = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(interactableObjects, true);

        if (intersects.length > 0) {
            selectedPiece = intersects[0].object.parent;
            isMovingObject = true;

            const box = new THREE.Box3().setFromObject(selectedPiece);
            selectedPiece.userData.floorOffset = box.min.y;

            const childMaterials = new Map();
            selectedPiece.traverse(child => {
                if (child.isMesh) {
                    childMaterials.set(child, child.material);
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

// --- Animation Loop --- //
let hitTestSource = null;
let hitTestSourceRequested = false;

function animate(timestamp, frame) {
    if (frame) {
        if (!hitTestSourceRequested) {
            const session = renderer.xr.getSession();
            session.requestReferenceSpace('viewer').then(refSpace => {
                session.requestHitTestSource({ space: refSpace }).then(source => {
                    hitTestSource = source;
                });
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const referenceSpace = renderer.xr.getReferenceSpace();
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);

                // If moving an object, update its position
                if (isMovingObject && selectedPiece) {
                    selectedPiece.position.set(pose.transform.position.x, pose.transform.position.y - selectedPiece.userData.floorOffset, pose.transform.position.z);
                }

                // If placing a new object, update the ghost's position
                if (objectToPlace && ghostObject) {
                    ghostObject.visible = true;
                    const box = new THREE.Box3().setFromObject(ghostObject);
                    const floorOffset = box.min.y;
                    ghostObject.position.set(pose.transform.position.x, pose.transform.position.y - floorOffset, pose.transform.position.z);
                }

            } else {
                // If hit test finds no surface, hide the ghost
                if (ghostObject) ghostObject.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);