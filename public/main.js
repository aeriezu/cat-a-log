import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- CORE THREE.JS & XR COMPONENTS --- //
let camera, scene, renderer;
let controller;
let reticle;

let hitTestSource = null;
let hitTestSourceRequested = false;

// --- OBJECT & INTERACTION STATE --- //
const interactableObjects = []; // Stores placed furniture
const loader = new GLTFLoader();

// This object will hold our "palette" of loaded furniture
const furniturePalette = {}; 

let currentObjectToPlace = null; // A REFERENCE to an object in the palette
let selectedPiece = null;      // The piece currently being dragged
let isDragging = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

init();
animate();

// ---------------------------------------------------------------- //
// ----------------------- CORE SETUP ----------------------------- //
// ---------------------------------------------------------------- //

function init() {
    const arContainer = document.getElementById('ar-container');

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // --- Lighting --- //
    scene.add(new THREE.HemisphereLight(0x808080, 0x606060, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(0, 6, 0);
    light.castShadow = true;
    scene.add(light);
    
    // --- Renderer --- //
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    arContainer.appendChild(renderer.domElement);

    // --- WebXR "Enter AR" Button --- //
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // --- LOAD THE FURNITURE BUNDLE --- //
    loadFurniturePalette();

    // --- XR Controller (Handles Taps) --- //
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // --- Placement Reticle --- //
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // --- Event Listeners --- //
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd);
}


// ---------------------------------------------------------------- //
// ----------------- UI & PALETTE LOADING ------------------------- //
// ---------------------------------------------------------------- //

function loadFurniturePalette() {
    const menuContainer = document.getElementById('furniture-menu');
    
    // Load your single, large GLB file
    loader.load('low_poly_furnitures_full_bundle.glb', (gltf) => {
        // We do NOT add gltf.scene to our main scene.
        // It lives off-screen as our source for cloning.

        gltf.scene.children.forEach((model, index) => {
            // Make sure each model has a unique name
            const modelName = model.name || `Item ${index + 1}`;
            model.name = modelName;

            // Store the model in our palette object
            furniturePalette[modelName] = model;

            // Now, create a button for this model
            const button = document.createElement('button');
            button.textContent = modelName;
            button.onclick = () => {
                // When clicked, set this model as the one to be placed.
                // We're setting a REFERENCE to the model in the palette.
                currentObjectToPlace = furniturePalette[modelName];
                console.log(`Selected "${modelName}" for placement.`);
            };
            menuContainer.appendChild(button);
        });

        console.log("Furniture palette loaded!", furniturePalette);
    });
}


// ---------------------------------------------------------------- //
// ----------------- PLACEMENT & INTERACTION ---------------------- //
// ---------------------------------------------------------------- //

function onSelect() {
    // Called when the user taps the screen in AR mode.
    if (reticle.visible && currentObjectToPlace) {
        // **IMPORTANT**: We CLONE the object from the palette.
        const model = currentObjectToPlace.clone();

        model.position.setFromMatrixPosition(reticle.matrix);
        model.visible = true; // Make sure it's visible
        scene.add(model);

        // Enable shadows for all meshes in the clone
        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Setup for collisions
        const boxHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(model), 0xff0000);
        boxHelper.material.transparent = true;
        boxHelper.material.opacity = 0;
        scene.add(boxHelper);
        model.userData.boxHelper = boxHelper;
        model.userData.isColliding = false;

        interactableObjects.push(model);
        currentObjectToPlace = null; // Clear selection after placing
    }
}

function onTouchStart(event) {
    if (event.touches.length !== 1 || !renderer.xr.isPresenting) return;
    const touch = event.touches[0];

    // Check if we are touching an existing object to start dragging it
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(interactableObjects, true);
    if (intersects.length > 0) {
        isDragging = true;
        selectedPiece = intersects[0].object;
        // Traverse up to find the top-level group/object
        while (selectedPiece.parent && !interactableObjects.includes(selectedPiece.parent)) {
            selectedPiece = selectedPiece.parent;
        }
    }
}

function onTouchMove(event) {
    if (!isDragging || !selectedPiece) return;
    event.preventDefault();

    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // Project the touch onto a plane at the object's current height
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -selectedPiece.position.y);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        // This is where the object *wants* to go
        const potentialPosition = intersectionPoint;

        // Check for collisions BEFORE moving the object
        if (!updateCollisions(selectedPiece, potentialPosition)) {
            selectedPiece.position.copy(potentialPosition);
        }
    }
}

function onTouchEnd() {
    isDragging = false;
    if (selectedPiece) {
        // When we let go, reset the collision state
        selectedPiece.userData.isColliding = false;
        // Also reset the collision state of all other objects for a clean slate
        interactableObjects.forEach(obj => {
            if (obj !== selectedPiece) obj.userData.isColliding = false;
        });
    }
    selectedPiece = null;
}

function updateCollisions(targetObject, potentialPosition) {
    let collisionDetected = false;
    const testBox = new THREE.Box3().setFromObject(targetObject);
    const displacement = new THREE.Vector3().subVectors(potentialPosition, targetObject.position);
    testBox.translate(displacement); // Move the test box to the potential position

    for (const otherObject of interactableObjects) {
        if (otherObject === targetObject) continue; // Don't check against self

        const otherBox = new THREE.Box3().setFromObject(otherObject);
        if (testBox.intersectsBox(otherBox)) {
            otherObject.userData.isColliding = true;
            collisionDetected = true;
        } else {
            otherObject.userData.isColliding = false;
        }
    }
    targetObject.userData.isColliding = collisionDetected;
    return collisionDetected;
}

// ---------------------------------------------------------------- //
// ------------------- RENDER LOOP & UTILS ------------------------ //
// ---------------------------------------------------------------- //

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) { // --- AR Session is Active ---
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
            session.requestReferenceSpace('viewer').then(refSpace => {
                session.requestHitTestSource({ space: refSpace }).then(source => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    // Update collision box helpers
    interactableObjects.forEach(object => {
        const helper = object.userData.boxHelper;
        if (helper) {
            helper.box.setFromObject(object);
            const targetOpacity = object.userData.isColliding ? 0.75 : 0.0;
            // Smoothly fade the helper's opacity
            helper.material.opacity += (targetOpacity - helper.material.opacity) * 0.1;
        }
    });

    renderer.render(scene, camera);
}