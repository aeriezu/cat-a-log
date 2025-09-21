import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- DATA --- //
const CATEGORIZED_FURNITURE = {
    couches: [
        { modelName: 'Object_22', displayName: 'Black Loveseat', scale: 0.05 },
        { modelName: 'Object_28', displayName: 'Blue Couch', scale: 0.05 },
        { modelName: 'Object_32', displayName: 'Gray Couch', scale: 0.05 },
        { modelName: 'Object_34', displayName: 'White Leather Couch', scale: 0.05 },
        { modelName: 'Object_38', displayName: 'Beige Sofa', scale: 0.05 },
        { modelName: 'Object_16', displayName: 'Pink Couch', scale: 0.05 },
        { modelName: 'Object_18', displayName: 'Pink Loveseat', scale: 0.05 },
        { modelName: 'Object_20', displayName: 'Black Couch', scale: 0.05 },
    ],
    chairs: [
        { modelName: 'Object_24', displayName: 'Black Single Sofa', scale: 0.05 },
        { modelName: 'Object_26', displayName: 'Beige Single Chair', scale: 0.05 },
        { modelName: 'Object_30', displayName: 'Gray Single Sofa', scale: 0.05 },
        { modelName: 'Object_36', displayName: 'Beige Single Couch', scale: 0.05 },
    ],
    beds: [
        { modelName: 'Object_40', displayName: 'Blue Twin Bed', scale: 0.05 },
        { modelName: 'Object_42', displayName: 'Black Twin Bed', scale: 0.05 },
        { modelName: 'Object_44', displayName: 'Red Queen Bed', scale: 0.05 },
        { modelName: 'Object_48', displayName: 'Gray Queen Bed', scale: 0.05 },
        { modelName: 'Object_10', displayName: 'Blue Queen Bed', scale: 0.05 },
    ],
    tables: [
        { modelName: 'Object_50', displayName: 'TV Stand', scale: 0.05 },
        { modelName: 'Object_14', displayName: 'White TV Stand', scale: 0.05 },
        { modelName: 'Object_52', displayName: 'Dark Brown TV Stand', scale: 0.05 },
        { modelName: 'Object_54', displayName: 'Wooden Night Stand', scale: 0.05 },
    ],
    storage: [
        { modelName: 'Object_46', displayName: 'Wooden Cabinet', scale: 0.05 },
        { modelName: 'Object_12', displayName: 'Flower Dresser', scale: 0.05 },
        { modelName: 'Object_56', displayName: 'Gray Closet', scale: 0.05 },
    ],
    decor: [
        { modelName: 'Object_58', displayName: 'Fireplace', scale: 0.05 },
        { modelName: 'Object_60', displayName: 'Three-Leg Lamp', scale: 0.05 },
        { modelName: 'Object_62', displayName: 'Square Lamp', scale: 0.05 },
        { modelName: 'Object_4', displayName: 'White Fireplace', scale: 0.05 },
    ],
    bathroom: [
        { modelName: 'Object_8', displayName: 'Toilet Closed Lid', scale: 0.05 },
        { modelName: 'Object_64', displayName: 'Black Sink', scale: 0.05 },
        { modelName: 'Object_66', displayName: 'White Counter Sink', scale: 0.05 },
        { modelName: 'Object_6', displayName: 'Toilet Open Lid', scale: 0.05 },
        { modelName: 'Object_68', displayName: 'Dark Counter Sink', scale: 0.05 }
    ]
};

// --- THREE.JS & XR SETUP --- //
let camera, scene, renderer, controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

const interactableObjects = [];
const furniturePalette = {};
let currentObjectToPlace = null;
let activeObject = null;
const raycaster = new THREE.Raycaster();
let ignoreNextTap = false;
let lastTapTime = 0;
const doubleTapDelay = 300;

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

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

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

    // Action Button Listeners
    document.getElementById('delete-btn').addEventListener('click', () => {
        if (activeObject) {
            scene.remove(activeObject);
            const index = interactableObjects.indexOf(activeObject);
            if (index > -1) interactableObjects.splice(index, 1);
            activeObject = null;
            hideActionMenu();
        }
    });
    document.getElementById('confirm-btn').addEventListener('click', () => { if (activeObject) { activeObject = null; hideActionMenu(); } });
    document.getElementById('scale-slider').addEventListener('input', (e) => { if (activeObject) activeObject.scale.setScalar(parseFloat(e.target.value)); });
    document.getElementById('rotate-slider').addEventListener('input', (e) => { if (activeObject) activeObject.rotation.y = parseFloat(e.target.value); });
    
    setupARandUI();
}

function setupARandUI() {
    const loader = new GLTFLoader();
    // NOTE: This is a large file and may take a moment to load.
    const modelURL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Buggy/glTF-Binary/Buggy.glb'; // Using a sample model URL for demonstration
    // To use your furniture model, you'll need to host it online (e.g., on GitHub) and replace the URL above.

    loader.load('https://raw.githubusercontent.com/alex-preston/furniture-AR-vas/main/low_poly_furnitures_full_bundle.glb', (gltf) => {
        // Populate the palette with all 3D models from the file
        gltf.scene.traverse((child) => {
            for (const category in CATEGORIZED_FURNITURE) {
                if (CATEGORIZED_FURNITURE[category].some(item => item.modelName === child.name)) {
                    furniturePalette[child.name] = child;
                    break;
                }
            }
        });

        // Set up event listeners for the category buttons
        const categoryButtons = document.querySelectorAll('.category-button');
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                categoryButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                populateItemSelector(button.dataset.category);
            });
        });

        populateItemSelector('couches'); // Populate with default category
    });
}

function populateItemSelector(category) {
    const itemTrack = document.getElementById("item-track");
    const scaleSlider = document.getElementById('scale-slider');
    itemTrack.innerHTML = '';

    const items = CATEGORIZED_FURNITURE[category];
    if (!items) return;

    items.forEach(itemData => {
        if (furniturePalette[itemData.modelName]) {
            const button = document.createElement('button');
            button.classList.add('item-button');
            button.textContent = itemData.displayName;

            button.addEventListener('click', () => {
                if (activeObject) return;
                currentObjectToPlace = {
                    model: furniturePalette[itemData.modelName],
                    scale: itemData.scale
                };
                scaleSlider.value = itemData.scale;
                ignoreNextTap = true;
            });
            itemTrack.appendChild(button);
        }
    });
}

function showActionMenu() {
    document.getElementById('action-menu').style.display = 'flex';
    document.getElementById('item-track-container').style.display = 'none';
    document.querySelector('.category-selector').style.display = 'none';
}

function hideActionMenu() {
    document.getElementById('action-menu').style.display = 'none';
    document.getElementById('item-track-container').style.display = 'block';
    document.querySelector('.category-selector').style.display = 'flex';
}

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
                reticle.visible = !activeObject && currentObjectToPlace;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                
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