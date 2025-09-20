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
const intialScale = 0.2;
const smoothingFactor = 0.1;

// --- Model Loading & UI Creation --- //
const loader = new GLTFLoader();
loader.load('low_poly_furnitures_full_bundle.glb', glb => {
    const furnitureMenu = document.getElementById('furniture-menu');
    
    // Use traverse to find every individual mesh, just like your original code
    glb.scene.traverse(child => {
        // We only care about meshes that have a unique name
        if (child.isMesh && child.name && !furniturePieces.has(child.name)) {
            // Store the original mesh for cloning
            furniturePieces.set(child.name, child);

            // Create a UI button for this mesh
            const button = document.createElement('button');
            button.textContent = child.name;
            button.addEventListener('click', () => {
                document.querySelectorAll('#furniture-menu button').forEach(b => b.classList.remove('selected'));
                objectToPlace = furniturePieces.get(child.name);
                button.classList.add('selected');

                if (ghostObject) scene.remove(ghostObject);
                ghostObject = objectToPlace.clone();
                ghostObject.scale.set(intialScale, intialScale, intialScale);
                ghostObject.material = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.5
                });
                ghostObject.visible = false;
                scene.add(ghostObject);
            });
            furnitureMenu.appendChild(button);
        }
    });
});

// TODO: function to store object 
// method to take in item 
// hashmap?
// store id object pair
// selecting calls a function to place item
// copy item
// copied item is selected obj
// tag: new item

// --- Interaction Logic --- //
let lastTapTime = 0;
const doubleTapThreshold = 300;

renderer.domElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();

    if (objectToPlace && ghostObject && ghostObject.visible) {
        const newObject = objectToPlace.clone();
        newObject.scale.set(initialScale, initialScale, initialScale);
        newObject.position.copy(ghostObject.position);
        scene.add(newObject);
        interactableObjects.push(newObject);
        objectToPlace = null;
        scene.remove(ghostObject);
        ghostObject = null;
        document.querySelectorAll('#furniture-menu button').forEach(b => b.classList.remove('selected'));
        return;
    }

    if (isMovingObject) {
        if (selectedPiece && originalMaterials.has(selectedPiece)) {
            selectedPiece.material = originalMaterials.get(selectedPiece);
            originalMaterials.delete(selectedPiece);
        }
        isMovingObject = false;
        selectedPiece = null;
        return;
    }

    const currentTime = Date.now();
    if (currentTime - lastTapTime < doubleTapThreshold) {
        const pointer = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(interactableObjects, false);

        if (intersects.length > 0) {
            selectedPiece = intersects[0].object; 
            isMovingObject = true;

            selectedPiece.geometry.computeBoundingBox();
            const box = selectedPiece.geometry.boundingBox;
            selectedPiece.userData.floorOffset = box.min.y * selectedPiece.scale.y;

            originalMaterials.set(selectedPiece, selectedPiece.material);
            const highlightMaterial = selectedPiece.material.clone();
            highlightMaterial.emissive = new THREE.Color(0x00ff00);
            highlightMaterial.emissiveIntensity = 0.5;
            selectedPiece.material = highlightMaterial;
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
                const hitPosition = pose.transform.position;

                // Move the selected piece with smoothing
                if (isMovingObject && selectedPiece) {
                    const targetPosition = new THREE.Vector3(
                        hitPosition.x,
                        hitPosition.y - selectedPiece.userData.floorOffset,
                        hitPosition.z
                    );
                    // Use LERP for smooth movement instead of teleporting
                    selectedPiece.position.lerp(targetPosition, smoothingFactor);
                }

                // Move the ghost preview with smoothing
                if (objectToPlace && ghostObject) {
                    ghostObject.visible = true;
                    ghostObject.geometry.computeBoundingBox();
                    const box = ghostObject.geometry.boundingBox;
                    const floorOffset = box.min.y * ghostObject.scale.y;
                    
                    const targetPosition = new THREE.Vector3(
                        hitPosition.x,
                        hitPosition.y - floorOffset,
                        hitPosition.z
                    );
                    // Use LERP for smooth movement instead of teleporting
                    ghostObject.position.lerp(targetPosition, smoothingFactor);
                }

            } else {
                if (ghostObject) ghostObject.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);