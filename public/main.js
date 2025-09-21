import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 1. YOUR CORRECT FURNITURE DATA --- //
// This is the single source of truth for all furniture.
const FURNITURE_DATA = {
    'Object_22':  { displayName: 'Black Loveseat', scale: 0.05 },
    'Object_24':  { displayName: 'Black Single Sofa', scale: 0.05 },
    'Object_26':  { displayName: 'Beige Single Chair', scale: 0.05 },
    'Object_28':  { displayName: 'Blue Couch', scale: 0.05 },
    'Object_30':  { displayName: 'Gray Single Sofa', scale: 0.05 },
    'Object_32':  { displayName: 'Gray Couch', scale: 0.05 },
    'Object_34':  { displayName: 'White Leather Couch', scale: 0.05 },
    'Object_36':  { displayName: 'Beige Single Couch', scale: 0.05 },
    'Object_38':  { displayName: 'Beige Sofa', scale: 0.05 },
    'Object_40':  { displayName: 'Blue Twin Bed', scale: 0.05 },
    'Object_42':  { displayName: 'Black Twin Bed', scale: 0.05 },
    'Object_44':  { displayName: 'Red Queen Bed', scale: 0.05 },
    'Object_46':  { displayName: 'Wooden Cabinet', scale: 0.05 },
    'Object_48':  { displayName: 'Gray Queen Bed', scale: 0.05 },
    'Object_50':  { displayName: 'TV Stand', scale: 0.05 },
    'Object_8':   { displayName: 'Toilet Closed Lid', scale: 0.05 },
    'Object_10':  { displayName: 'Blue Queen Bed', scale: 0.05 },
    'Object_12':  { displayName: 'Flower Dresser', scale: 0.05 },
    'Object_14':  { displayName: 'White TV Stand', scale: 0.05 },
    'Object_16':  { displayName: 'Pink Couch', scale: 0.05 },
    'Object_18':  { displayName: 'Pink Loveseat', scale: 0.05 },
    'Object_20':  { displayName: 'Black Couch', scale: 0.05 },
    'Object_52':  { displayName: 'Dark Brown TV Stand', scale: 0.05 },
    'Object_54':  { displayName: 'Wooden Night Stand', scale: 0.05 },
    'Object_56':  { displayName: 'Gray Closet', scale: 0.05 },
    'Object_58':  { displayName: 'Fireplace', scale: 0.05 },
    'Object_60':  { displayName: 'Three-Leg Lamp', scale: 0.05 },
    'Object_62':  { displayName: 'Square Lamp', scale: 0.05 },
    'Object_64':  { displayName: 'Black Sink', scale: 0.05 },
    'Object_66':  { displayName: 'White Counter Sink', scale: 0.05 },
    'Object_6':   { displayName: 'Toilet Open Lid', scale: 0.05 },
    'Object_4':   { displayName: 'White Fireplace', scale: 0.05 },
    'Object_68':  { displayName: 'Dark Counter Sink', scale: 0.05 }
};

// --- CORE THREE.JS & XR COMPONENTS --- //
let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

// --- OBJECT & INTERACTION STATE --- //
const interactableObjects = [];
const furniturePalette = {}; // This will be filled with the loaded 3D models
let currentObjectToPlace = null;
let activeObject = null;
const raycaster = new THREE.Raycaster();
let ignoreNextTap = false;
let lastTapTime = 0;
const doubleTapDelay = 300;

// --- INITIALIZATION --- //
init();
animate();

function init() {
    const arContainer = document.getElementById('ar-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    scene.add(new THREE.HemisphereLight(0x808080, 0x606060, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(0, 6, 0);
    scene.add(light);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    arContainer.appendChild(renderer.domElement);

    document.body.appendChild(
        ARButton.createButton(renderer, {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.getElementById('overlay') }
        })
    );

    // --- 2. LOAD MODELS AND DYNAMICALLY CREATE UI --- //
    setupARandUI();

    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    window.addEventListener('resize', onWindowResize);

    // --- Action Button Listeners (Unchanged) --- //
    document.getElementById('delete-btn').addEventListener('click', () => {
        if (activeObject) {
            scene.remove(activeObject);
            const index = interactableObjects.indexOf(activeObject);
            if (index > -1) interactableObjects.splice(index, 1);
            activeObject = null;
            hideActionMenu();
        }
    });

    document.getElementById('confirm-btn').addEventListener('click', () => {
        if (activeObject) activeObject = null; hideActionMenu();
    });

    document.getElementById('scale-slider').addEventListener('input', (event) => {
        if (activeObject) activeObject.scale.setScalar(parseFloat(event.target.value));
    });

    document.getElementById('rotate-slider').addEventListener('input', (event) => {
        if (activeObject) activeObject.rotation.y = parseFloat(event.target.value);
    });
}

// --- 3. REVISED SETUP FUNCTION --- //
function setupARandUI() {
    const loader = new GLTFLoader();
    const itemTrack = document.getElementById("item-track");
    const scaleSlider = document.getElementById('scale-slider');
    
    loader.load('low_poly_furnitures_full_bundle.glb', (gltf) => {
        // Step 1: Populate the palette with all available 3D models from the file
        gltf.scene.traverse((child) => {
            if (FURNITURE_DATA[child.name]) {
                furniturePalette[child.name] = child;
            }
        });

        // Step 2: Dynamically create a UI button for each piece of furniture
        for (const modelName in FURNITURE_DATA) {
            if (furniturePalette[modelName]) { // Check if the model was actually found in the file
                const itemData = FURNITURE_DATA[modelName];
                
                const button = document.createElement('button');
                button.classList.add('item-button');
                button.textContent = itemData.displayName;

                // *** THIS IS THE KEY INTEGRATION POINT ***
                button.addEventListener('click', () => {
                    if (activeObject) return; // Don't select while editing

                    // Set the object that will be placed on the next tap
                    currentObjectToPlace = {
                        model: furniturePalette[modelName],
                        scale: itemData.scale
                    };

                    scaleSlider.value = itemData.scale; // Set slider to default scale
                    ignoreNextTap = true; // Prevents placing immediately
                    console.log(`Ready to place: ${itemData.displayName}`);
                });
                itemTrack.appendChild(button);
            }
        }
    });
}

// --- UI VISIBILITY --- //
function showActionMenu() {
    document.getElementById('action-menu').style.display = 'flex';
    document.getElementById('item-track-container').style.display = 'none'; // Hide selection UI
}

function hideActionMenu() {
    document.getElementById('action-menu').style.display = 'none';
    document.getElementById('item-track-container').style.display = 'block'; // Show selection UI
}

// --- PLACEMENT & INTERACTION (Unchanged) --- //
function onSelect() {
    if (ignoreNextTap) {
        ignoreNextTap = false;
        return;
    }

    if (reticle.visible && currentObjectToPlace) {
        const model = currentObjectToPlace.model.clone();
        model.scale.setScalar(currentObjectToPlace.scale || 1.0);
        model.position.setFromMatrixPosition(reticle.matrix);
        scene.add(model);
        interactableObjects.push(model);
        activeObject = model;
        showActionMenu();
        currentObjectToPlace = null;
        return;
    }

    const currentTime = new Date().getTime();
    if (currentTime - lastTapTime < doubleTapDelay) {
        if (activeObject) return;
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.intersectObjects(interactableObjects, true);
        if (intersects.length > 0) {
            let tappedObject = intersects[0].object;
            while (tappedObject.parent && !interactableObjects.includes(tappedObject)) {
                tappedObject = tappedObject.parent;
            }
            activeObject = tappedObject;
            document.getElementById('scale-slider').value = activeObject.scale.x;
            document.getElementById('rotate-slider').value = activeObject.rotation.y;
            showActionMenu();
        }
    }
    lastTapTime = currentTime;
}

// --- RENDER LOOP & UTILS (Unchanged) --- //
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
                session.requestHitTestSource({ space: refSpace }).then(source => hitTestSource = source);
            });
            session.addEventListener('end', () => { hitTestSourceRequested = false; hitTestSource = null; });
            hitTestSourceRequested = true;
        }
        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                reticle.visible = !activeObject;
                if (activeObject) {
                    activeObject.position.setFromMatrixPosition(reticle.matrix);
                }
            } else {
                reticle.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}