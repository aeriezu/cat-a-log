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
let selectedPiece = null;
let activeObject = null;
let isDragging = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let ignoreNextTap = false;

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
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd);

    // --- Action Button Listeners ---
    document.getElementById('delete-btn').addEventListener('click', () => {
        if (activeObject) {
            scene.remove(activeObject);
            scene.remove(activeObject.userData.boxHelper);
            const index = interactableObjects.indexOf(activeObject);
            if (index > -1) {
                interactableObjects.splice(index, 1);
            }
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
            // ✨ --- FIX STARTS HERE --- ✨
            const box = new THREE.Box3();
            
            // 1. Get the position of the bottom edge *before* scaling
            box.setFromObject(activeObject);
            const oldBottomY = box.min.y;

            // 2. Apply the new scale from the slider
            const newScale = parseFloat(event.target.value);
            activeObject.scale.setScalar(newScale);

            // 3. Get the position of the bottom edge *after* scaling
            box.setFromObject(activeObject);
            const newBottomY = box.min.y;

            // 4. Adjust the object's overall height to counteract the change,
            //    keeping the bottom firmly in place.
            activeObject.position.y += (oldBottomY - newBottomY);
            // ✨ --- FIX ENDS HERE --- ✨
        }
    });

    const rotateSlider = document.getElementById('rotate-slider');
    rotateSlider.addEventListener('input', (event) => {
        if (activeObject) {
            const newRotation = parseFloat(event.target.value);
            activeObject.rotation.y = newRotation;
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
                    console.log(`Selected "${data.displayName}" for placement.`);
                };
                menuContainer.appendChild(button);
            }
        }
    });
}

// UI Management Functions
function showActionMenu() {
    document.getElementById('action-menu').style.display = 'flex';
    document.getElementById('furniture-menu').style.display = 'none';
}

function hideActionMenu() {
    document.getElementById('action-menu').style.display = 'none';
    document.getElementById('furniture-menu').style.display = 'flex';
}

// Helper function to change object opacity
function setObjectOpacity(object, opacity) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = opacity;
        }
    });
}

// --- PLACEMENT & INTERACTION --- //
function onSelect() {
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

        document.getElementById('rotate-slider').value = 0;
        
        const boxHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(model), 0xff0000);
        boxHelper.material.transparent = true;
        boxHelper.material.opacity = 0;
        scene.add(boxHelper);
        model.userData.boxHelper = boxHelper;
        model.userData.isColliding = false;

        currentObjectToPlace = null; 
    }
}

function onTouchStart(event) {
    if (activeObject) return;

    if (event.touches.length !== 1 || !renderer.xr.isPresenting) return;
    const touch = event.touches[0];

    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(interactableObjects, true);
    if (intersects.length > 0) {
        if (ignoreNextTap) {
            ignoreNextTap = false;
            return;
        }
        isDragging = true;
        selectedPiece = intersects[0].object;
        while (selectedPiece.parent && !interactableObjects.includes(selectedPiece.parent)) {
            selectedPiece = selectedPiece.parent;
        }
    }
}

function onTouchMove(event) {
    if (!isDragging || !selectedPiece || selectedPiece === activeObject) return;
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

    const otherObjects = interactableObjects.filter(obj => obj !== targetObject);

    for (const otherObject of otherObjects) {
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
            
            reticle.material.visible = !activeObject;

            if (activeObject && reticle.visible) {
                const box = new THREE.Box3().setFromObject(activeObject);
                const offset = activeObject.position.y - box.min.y;
                activeObject.position.setFromMatrixPosition(reticle.matrix);
                activeObject.position.y += offset;
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