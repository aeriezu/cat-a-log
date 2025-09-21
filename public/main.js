import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- DATA CONFIGURATION --- //
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
const loader = new GLTFLoader();
const furniturePalette = {};
let currentObjectToPlace = null;
let activeObject = null;
const raycaster = new THREE.Raycaster();
let ignoreNextTap = false;
let lastTapTime = 0;
const doubleTapDelay = 300;
let exitBtn;

init();
animate();

// --- CORE SETUP --- //
function init() {
    const arContainer = document.getElementById('ar-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    scene.add(new THREE.HemisphereLight(0x808080, 0x606060, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(0, 6, 0);
    light.castShadow = true;
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

    loadFurniturePalette();

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

    // --- Action Button Listeners ---
    document.getElementById('delete-btn').addEventListener('click', () => {
        if (activeObject) {
            scene.remove(activeObject);
            if (activeObject.userData.boxHelper) scene.remove(activeObject.userData.boxHelper);
            const index = interactableObjects.indexOf(activeObject);
            if (index > -1) interactableObjects.splice(index, 1);
            activeObject = null;
            hideActionMenu();
        }
    });

    document.getElementById('confirm-btn').addEventListener('click', () => {
        if (activeObject) {
            setObjectOpacity(activeObject, 1.0);
            activeObject = null;
            hideActionMenu();
        }
    });

    const scaleSlider = document.getElementById('scale-slider');
    scaleSlider.addEventListener('input', (event) => {
        if (activeObject) {
            const box = new THREE.Box3().setFromObject(activeObject);
            const oldBottomY = box.min.y;
            const newScale = parseFloat(event.target.value);
            activeObject.scale.setScalar(newScale);
            box.setFromObject(activeObject);
            const newBottomY = box.min.y;
            activeObject.position.y += (oldBottomY - newBottomY);
        }
    });
    
    exitBtn = document.getElementById('exit-ar-btn');
    exitBtn.addEventListener('click', () => {
        const session = renderer.xr.getSession();
        if (session) session.end();
    });

    renderer.xr.addEventListener('sessionend', cleanupScene);

    // ✨ NEW: Setup Hammer.js for swipe gestures
    const hammer = new Hammer(renderer.domElement);
    hammer.get('swipe').set({ direction: Hammer.DIRECTION_HORIZONTAL });

    // Set rotation amount (15 degrees)
    const rotationAmount = Math.PI / 12; 

    hammer.on('swipeleft', () => {
        if (activeObject) {
            activeObject.rotation.y -= rotationAmount;
        }
    });

    hammer.on('swiperight', () => {
        if (activeObject) {
            activeObject.rotation.y += rotationAmount;
        }
    });
}

// --- UI & PALETTE LOADING --- //
function loadFurniturePalette() {
    const menuContainer = document.getElementById('furniture-menu');
    const scaleSlider = document.getElementById('scale-slider');
    
    loader.load('low_poly_furnitures_full_bundle.glb', (gltf) => {
        gltf.scene.traverse((child) => {
            if (FURNITURE_DATA[child.name]) {
                furniturePalette[child.name] = child;
            }
        });

        for (const modelName in FURNITURE_DATA) {
            if (furniturePalette[modelName]) {
                const data = FURNITURE_DATA[modelName];
                const button = document.createElement('button');
                button.textContent = data.displayName;
                button.onclick = () => {
                    if (activeObject) return;
                    currentObjectToPlace = {
                        model: furniturePalette[modelName],
                        scale: data.scale
                    };
                    scaleSlider.value = data.scale;
                    ignoreNextTap = true;
                };
                menuContainer.appendChild(button);
            }
        }
    });
}

// --- UI & INTERACTION HELPERS --- //
function showActionMenu() {
    document.getElementById('action-menu').style.display = 'flex';
    document.getElementById('furniture-menu').style.display = 'none';
}

function hideActionMenu() {
    document.getElementById('action-menu').style.display = 'none';
    document.getElementById('furniture-menu').style.display = 'flex';
}

function setObjectOpacity(object, opacity) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = opacity;
        }
    });
}

function cleanupScene() {
    const objectsToRemove = [...interactableObjects];
    objectsToRemove.forEach(object => {
        scene.remove(object);
        if (object.userData.boxHelper) {
            scene.remove(object.userData.boxHelper);
        }
    });
    interactableObjects.length = 0;
    if (activeObject) {
        activeObject = null;
        hideActionMenu();
    }
}

// --- PLACEMENT & INTERACTION --- //
function onSelect(event) {
    if (ignoreNextTap) {
        ignoreNextTap = false;
        return;
    }

    if (reticle.visible && currentObjectToPlace) {
        const model = currentObjectToPlace.model.clone();
        model.scale.setScalar(currentObjectToPlace.scale || 1.0);
        
        const box = new THREE.Box3().setFromObject(model);
        const verticalOffset = -box.min.y;
        model.position.setFromMatrixPosition(reticle.matrix);
        model.position.y += verticalOffset;

        model.visible = true;
        scene.add(model);
        interactableObjects.push(model);

        activeObject = model;
        setObjectOpacity(activeObject, 0.7);
        showActionMenu();
        
        const boxHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(model), 0xff0000);
        boxHelper.material.transparent = true;
        boxHelper.material.opacity = 0;
        scene.add(boxHelper);
        model.userData.boxHelper = boxHelper;
        model.userData.isColliding = false;

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.polygonOffset = true;
                child.material.polygonOffsetFactor = -1.0;
                child.material.polygonOffsetUnits = -1.0;
            }
        });
        currentObjectToPlace = null; 
        return;
    }

    const currentTime = new Date().getTime();
    const timeSinceLastTap = currentTime - lastTapTime;
    lastTapTime = currentTime;

    if (timeSinceLastTap < doubleTapDelay) {
        if (activeObject) return;
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.intersectObjects(interactableObjects, true);

        if (intersects.length > 0) {
            let tappedObject = intersects[0].object;
            while (tappedObject.parent && !interactableObjects.includes(tappedObject)) {
                tappedObject = tappedObject.parent;
            }
            activeObject = tappedObject;
            setObjectOpacity(activeObject, 0.7);
            document.getElementById('scale-slider').value = activeObject.scale.x;
            showActionMenu();
        }
    }
}

// --- RENDER LOOP & UTILS --- //
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
        exitBtn.style.display = 'block';
    } else {
        if (exitBtn && exitBtn.style.display !== 'none') {
            exitBtn.style.display = 'none';
        }
    }

    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        
        if (!hitTestSourceRequested) {
            const session = renderer.xr.getSession();
            session.requestReferenceSpace('viewer').then(refSpace => {
                session.requestHitTestSource({ space: refSpace }).then(source => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
                cleanupScene(); 
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            const hit = hitTestResults.length > 0 ? hitTestResults[0] : null;

            if (hit) {
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                reticle.visible = !activeObject;

                if (activeObject) {
                    const box = new THREE.Box3().setFromObject(activeObject);
                    const offset = activeObject.position.y - box.min.y;
                    activeObject.position.setFromMatrixPosition(reticle.matrix);
                    activeObject.position.y += offset;
                }
            } else {
                reticle.visible = false;
            }
        }
    }

    interactableObjects.forEach(object => {
        const helper = object.userData.boxHelper;
        if (helper) {
            helper.box.setFromObject(object);
            const targetOpacity = 0.0;
            helper.material.opacity += (targetOpacity - helper.material.opacity) * 0.1;
        }
    });

    renderer.render(scene, camera);
}