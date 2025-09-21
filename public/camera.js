import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- DATA --- //
const CATEGORIZED_FURNITURE = {
    couches: [
        { modelName: 'Object_22', displayName: 'Black Loveseat', scale: 0.05, img: './images/Black_Loveseat.png' },
        { modelName: 'Object_28', displayName: 'Blue Couch', scale: 0.05, img: './images/Blue_Couch.png' },
        { modelName: 'Object_32', displayName: 'Gray Couch', scale: 0.05, img: './images/Gray_Couch.png' },
        { modelName: 'Object_34', displayName: 'White Leather Couch', scale: 0.05, img: './images/White_Leather_Couch.png' },
        { modelName: 'Object_38', displayName: 'Beige Sofa', scale: 0.05, img: './images/Beige_Sofa.png' },
        { modelName: 'Object_16', displayName: 'Pink Couch', scale: 0.05, img: './images/Pink_Couch.png' },
        { modelName: 'Object_18', displayName: 'Pink Loveseat', scale: 0.05, img: './images/Pink_Loveseat.png' },
        { modelName: 'Object_20', displayName: 'Black Couch', scale: 0.05, img: './images/Black_Couch.png' },
    ],
    chairs: [
        { modelName: 'Object_24', displayName: 'Black Single Sofa', scale: 0.05, img: './images/Black_Single_Sofa.png' },
        { modelName: 'Object_26', displayName: 'Beige Single Chair', scale: 0.05, img: './images/Beige_Single_Chair.png' },
        { modelName: 'Object_30', displayName: 'Gray Single Sofa', scale: 0.05, img: './images/Gray_Single_Sofa.png' },
        { modelName: 'Object_36', displayName: 'Beige Single Couch', scale: 0.05, img: './images/Beige_Single_Couch.png' },
    ],
    beds: [
        { modelName: 'Object_40', displayName: 'Blue Twin Bed', scale: 0.05, img: './images/Blue_Twin_Bed.png' },
        { modelName: 'Object_42', displayName: 'Black Twin Bed', scale: 0.05, img: './images/Black_Twin_Bed.png' },
        { modelName: 'Object_44', displayName: 'Red Queen Bed', scale: 0.05, img: './images/Red_Queen_Bed.png' },
        { modelName: 'Object_48', displayName: 'Gray Queen Bed', scale: 0.05, img: './images/Gray_Queen_Bed.png' },
        { modelName: 'Object_10', displayName: 'Blue Queen Bed', scale: 0.05, img: './images/Blue_Queen_Bed.png' },
    ],
    tables: [
        { modelName: 'Object_50', displayName: 'TV Stand', scale: 0.05, img: './images/TV_Stand.png' },
        { modelName: 'Object_14', displayName: 'White TV Stand', scale: 0.05, img: './images/White_TV_Stand.png' },
        { modelName: 'Object_52', displayName: 'Dark Brown TV Stand', scale: 0.05, img: './images/Dark_Brown_TV_Stand.png' },
        { modelName: 'Object_54', displayName: 'Wooden Night Stand', scale: 0.05, img: './images/Wooden_Night_Stand.png' },
    ],
    storage: [
        { modelName: 'Object_46', displayName: 'Wooden Cabinet', scale: 0.05, img: './images/Wooden_Cabinet.png' },
        { modelName: 'Object_12', displayName: 'Flower Dresser', scale: 0.05, img: './images/Flower_Dresser.png' },
        { modelName: 'Object_56', displayName: 'Gray Closet', scale: 0.05, img: './images/Gray_Closet.png' },
    ],
    decor: [
        { modelName: 'Object_58', displayName: 'Big Fireplace', scale: 0.05, img: './images/Big_Fireplace.png' },
        { modelName: 'Object_60', displayName: 'Three-Leg Lamp', scale: 0.05, img: './images/ThreeLeg_Lamp.png' },
        { modelName: 'Object_62', displayName: 'Square Lamp', scale: 0.05, img: './images/Square_Lamp.png' },
        { modelName: 'Object_4', displayName: 'Small Fireplace', scale: 0.05, img: './images/Small_Fireplace.png' },
    ],
    bathroom: [
        { modelName: 'Object_8', displayName: 'Big Toilet', scale: 0.05, img: './images/Big_Toilet.png' },
        { modelName: 'Object_64', displayName: 'Black Sink', scale: 0.05, img: './images/Black_Sink.png' },
        { modelName: 'Object_66', displayName: 'White Counter Sink', scale: 0.05, img: './images/White_Counter_Sink.png' },
        { modelName: 'Object_6', displayName: 'Simple Toilet', scale: 0.05, img: './images/Simple_Toilet.png' },
        { modelName: 'Object_68', displayName: 'Dark Counter Sink', scale: 0.05, img: './images/Dark_Counter_Sink.png' }
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
let exitBtn;
let inRotateMode = false;

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
    document.getElementById('confirm-btn').addEventListener('click', () => {
        if (activeObject) {
            activeObject = null;
            hideActionMenu();
        }
    });
    document.getElementById('scale-slider').addEventListener('input', (event) => {
        if (activeObject) {
            const box = new THREE.Box3().setFromObject(activeObject);
            const oldBottomY = box.min.y;
            activeObject.scale.setScalar(parseFloat(event.target.value));
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

    document.getElementById('rotate-mode-btn').addEventListener('click', () => {
        inRotateMode = true;
        updateUIMode();
    });
    document.getElementById('confirm-rotate-btn').addEventListener('click', () => {
        inRotateMode = false;
        updateUIMode();
    });

    renderer.xr.addEventListener('sessionend', cleanupScene);
    
    setupARandUI();

    const hammer = new Hammer(renderer.domElement);
    hammer.get('swipe').set({ direction: Hammer.DIRECTION_HORIZONTAL });
    hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    const rotationAmount = Math.PI / 12;

    hammer.on('swipeleft', () => {
        if (activeObject && inRotateMode) activeObject.rotation.y += rotationAmount;
    });
    hammer.on('swiperight', () => {
        if (activeObject && inRotateMode) activeObject.rotation.y -= rotationAmount;
    });

    const panPointer = new THREE.Vector2();
    hammer.on('panmove', (event) => {
        if (activeObject && !inRotateMode) {
            const rect = renderer.domElement.getBoundingClientRect();
            panPointer.x = ((event.center.x - rect.left) / rect.width) * 2 - 1;
            panPointer.y = -((event.center.y - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(panPointer, camera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -activeObject.position.y);
            const intersectionPoint = new THREE.Vector3();

            if(raycaster.ray.intersectPlane(plane, intersectionPoint)) {
                activeObject.position.set(intersectionPoint.x, activeObject.position.y, intersectionPoint.z);
            }
        }
    });
}

function setupARandUI() {
    const loader = new GLTFLoader();
    loader.load('low_poly_furnitures_full_bundle.glb', (gltf) => {
        gltf.scene.traverse((child) => {
            for (const category in CATEGORIZED_FURNITURE) {
                if (CATEGORIZED_FURNITURE[category].some(item => item.modelName === child.name)) {
                    furniturePalette[child.name] = child;
                    break;
                }
            }
        });

        const categoryButtons = document.querySelectorAll('.category-button');
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                categoryButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                populateItemSelector(button.dataset.category);
            });
        });
        populateItemSelector('couches');
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
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('item-image-button');
            const itemImage = document.createElement('img');
            itemImage.src = itemData.img;
            itemImage.alt = itemData.displayName;
            buttonContainer.appendChild(itemImage);

            buttonContainer.addEventListener('click', () => {
                if (activeObject) return;
                currentObjectToPlace = {
                    model: furniturePalette[itemData.modelName],
                    scale: itemData.scale
                };
                scaleSlider.value = itemData.scale;
                ignoreNextTap = true;
            });
            itemTrack.appendChild(buttonContainer);
        }
    });
}

function showActionMenu() {
    document.getElementById('action-menu').style.display = 'flex';
    document.getElementById('item-track-container').style.display = 'none';
    document.querySelector('.category-selector').style.display = 'none';
    inRotateMode = false;
    updateUIMode();
}

function hideActionMenu() {
    document.getElementById('action-menu').style.display = 'none';
    document.getElementById('item-track-container').style.display = 'block';
    document.querySelector('.category-selector').style.display = 'flex';
    inRotateMode = false;
}

function updateUIMode() {
    document.getElementById('rotate-mode-btn').style.display = inRotateMode ? 'none' : 'block';
    document.getElementById('scale-control-container').style.display = inRotateMode ? 'none' : 'flex';
    document.getElementById('delete-btn').style.display = inRotateMode ? 'none' : 'block';
    document.getElementById('confirm-btn').style.display = inRotateMode ? 'none' : 'block';

    document.getElementById('rotate-indicator').style.display = inRotateMode ? 'block' : 'none';
    document.getElementById('confirm-rotate-btn').style.display = inRotateMode ? 'block' : 'none';
}

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

function cleanupScene() {
    const objectsToRemove = [...interactableObjects];
    objectsToRemove.forEach(obj => scene.remove(obj));
    interactableObjects.length = 0;
    if(activeObject) {
        activeObject = null;
        hideActionMenu();
    }
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) {
        exitBtn.style.display = 'block';
    } else {
        if(exitBtn) exitBtn.style.display = 'none';
    }

    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
            session.requestReferenceSpace('viewer').then(refSpace => {
                session.requestHitTestSource({ space: refSpace }).then(source => hitTestSource = source);
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
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = !activeObject && currentObjectToPlace;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                
                if (activeObject && !inRotateMode) {
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
    renderer.render(scene, camera);
}