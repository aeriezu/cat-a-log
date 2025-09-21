import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------- //
// ------------------- DATA CONFIGURATION ------------------------- //
// ---------------------------------------------------------------- //

// This is the data configuration based on the names from your .glb file.
// Feel free to change the `displayName` and `scale` for each item.
const FURNITURE_DATA = {
    'Object_4':   { displayName: 'Chair', scale: 1.0 },
    'Object_6':   { displayName: 'Stool', scale: 1.0 },
    'Object_8':   { displayName: 'Side Table', scale: 0.8 },
    'Object_16':  { displayName: 'Potted Plant', scale: 1.0 },
    'Object_20':  { displayName: 'Cabinet', scale: 1.2 },
    'Object_44':  { displayName: 'Coffee Table', scale: 1.0 },
    'Object_48':  { displayName: 'Bookshelf', scale: 1.2 },
    'Object_60':  { displayName: 'Floor Lamp', scale: 1.1 },
    'Object_62':  { displayName: 'Sofa', scale: 1.2 },
    'Object_68':  { displayName: 'Dining Table', scale: 1.0 }
    // Add more entries here for any other furniture you want to include.
};


// --- CORE THREE.JS & XR COMPONENTS --- //
let camera, scene, renderer;
let controller;
let reticle;

let hitTestSource = null;
let hitTestSourceRequested = false;

// --- OBJECT & INTERACTION STATE --- //
const interactableObjects = []; // Stores placed furniture
const loader = new GLTFLoader();
const furniturePalette = {}; // This will store the actual THREE.Object3D models
let currentObjectToPlace = null;
let selectedPiece = null;
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
    document.body.appendChild(
        ARButton.createButton(renderer, {
            requiredFeatures: ['hit-test'],
            // Add these two lines to enable the DOM Overlay
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.getElementById('overlay') }
        })
    );
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
    
    loader.load('low_poly_furnitures_full_bundle.glb', (gltf) => {
        // Search the loaded scene for objects defined in FURNITURE_DATA
        gltf.scene.traverse((child) => {
            if (FURNITURE_DATA[child.name]) {
                furniturePalette[child.name] = child;
            }
        });

        // Now, create buttons based on our FURNITURE_DATA, not the file structure
        for (const modelName in FURNITURE_DATA) {
            if (furniturePalette[modelName]) { // Ensure the model was actually found
                const data = FURNITURE_DATA[modelName];
                const button = document.createElement('button');
                button.textContent = data.displayName; // Use the pretty name for the button
                button.onclick = () => {
                    currentObjectToPlace = {
                        model: furniturePalette[modelName],
                        scale: data.scale
                    };
                    console.log(`Selected "${data.displayName}" for placement.`);
                };
                menuContainer.appendChild(button);
            }
        }
        console.log("Furniture palette processed!", furniturePalette);
    });
}


// ---------------------------------------------------------------- //
// ----------------- PLACEMENT & INTERACTION ---------------------- //
// ---------------------------------------------------------------- //

function onSelect() {
    if (reticle.visible && currentObjectToPlace) {
        const model = currentObjectToPlace.model.clone();
        model.scale.setScalar(currentObjectToPlace.scale || 1.0); // Apply the scale from our data
        model.position.setFromMatrixPosition(reticle.matrix);
        model.visible = true;
        scene.add(model);

        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const boxHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(model), 0xff0000);
        boxHelper.material.transparent = true;
        boxHelper.material.opacity = 0;
        scene.add(boxHelper);
        model.userData.boxHelper = boxHelper;
        model.userData.isColliding = false;

        interactableObjects.push(model);
        currentObjectToPlace = null;
    }
}

function onTouchStart(event) {
    if (event.touches.length !== 1 || !renderer.xr.isPresenting) return;
    const touch = event.touches[0];

    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(interactableObjects, true);
    if (intersects.length > 0) {
        isDragging = true;
        selectedPiece = intersects[0].object;
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

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -selectedPiece.position.y);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        const potentialPosition = intersectionPoint;
        if (!updateCollisions(selectedPiece, potentialPosition)) {
            selectedPiece.position.copy(potentialPosition);
        }
    }
}

function onTouchEnd() {
    isDragging = false;
    if (selectedPiece) {
        selectedPiece.userData.isColliding = false;
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
    testBox.translate(displacement);

    for (const otherObject of interactableObjects) {
        if (otherObject === targetObject) continue;

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
    if (frame) {
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

    interactableObjects.forEach(object => {
        const helper = object.userData.boxHelper;
        if (helper) {
            helper.box.setFromObject(object);
            const targetOpacity = object.userData.isColliding ? 0.75 : 0.0;
            helper.material.opacity += (targetOpacity - helper.material.opacity) * 0.1;
        }
    });

    renderer.render(scene, camera);
}