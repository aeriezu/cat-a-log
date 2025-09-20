import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// --- SCENE, CAMERA, RENDERER --- //
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures:['hit-test'] }));

const canvas = renderer.domElement;

['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu'].forEach(evt => {
    canvas.addEventListener(evt, e => e.preventDefault());
});
canvas.addEventListener('gesturestart', e => e.preventDefault());

// --- LIGHT --- //
const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
scene.add(light);

// --- FURNITURE --- //
const loader = new GLTFLoader();
const furniturePieces = [];
const interactableObjects = [];

loader.load('low_poly_furnitures_full_bundle.glb', glb => {
    const model = glb.scene;
    scene.add(model);

    model.traverse(child => {
        if(child.isMesh){
            if(!child.name) child.name = THREE.MathUtils.generateUUID();
            child.castShadow = true;
            child.receiveShadow = true;
            interactableObjects.push(child);
            furniturePieces.push(child);

            // Compute floor offset from bounding box
            const box = new THREE.Box3().setFromObject(child);
            child.userData.floorOffset = box.min.y;

            // Add label
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = '30px Arial';
            context.fillStyle = 'white';
            context.fillText(child.name, 0, 30);
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(1, 0.5, 1);
            sprite.position.set(child.position.x, child.position.y + 1, child.position.z);
            scene.add(sprite);
        }
    });
});

// --- AR HIT TEST --- //
let hitTestSource = null;
let localReferenceSpace = null;
let selectedPiece = null;
let isDragging = false;
let touchStartTime = 0;
const holdThreshold = 800; // milliseconds

renderer.xr.addEventListener('sessionstart', async () => {
    const session = renderer.xr.getSession();
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    localReferenceSpace = await session.requestReferenceSpace('local');
});

renderer.xr.addEventListener('sessionend', () => {
    hitTestSource = null;
    localReferenceSpace = null;
    selectedPiece = null;
    isDragging = false;
});

// --- DONE BUTTON --- //
const doneButton = document.createElement('button');
doneButton.innerText = '✔️';
doneButton.style.position = 'absolute';
doneButton.style.top = '10px';
doneButton.style.right = '10px';
doneButton.style.display = 'none';
document.body.appendChild(doneButton);

doneButton.addEventListener('click', () => {
    selectedPiece = null;
    isDragging = false;
    doneButton.style.display = 'none';
});

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.userSelect = 'none';
renderer.domElement.style.webkitUserSelect = 'none';
renderer.domElement.style.webkitTouchCallout = 'none';

// --- TOUCH EVENTS: HOLD TO SELECT --- //
// --- TOUCH EVENTS: HOLD TO SELECT (REVISED) --- //

let selectTimeout;

renderer.domElement.addEventListener('pointerdown', event => {
    // Prevent default browser actions like text selection, scrolling, or context menu
    event.preventDefault();
    
    // Cancel any pending vibration/haptic feedback on Android
    if (navigator.vibrate) {
        navigator.vibrate(0);
    }

    if (selectedPiece || event.pointerType !== 'touch') return;

    // Start a timer to detect a long press
    selectTimeout = setTimeout(() => {
        const pointer = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(interactableObjects, true);

        if (intersects.length > 0) {
            const target = intersects[0].object.parent; // Assuming parent is the whole object
            selectedPiece = target;
            isDragging = true;
            doneButton.style.display = 'block';
            console.log('Selected:', selectedPiece.name);
        }
    }, holdThreshold);
});

// If the finger is lifted before the timer finishes, it's a tap, not a hold.
renderer.domElement.addEventListener('pointerup', event => {
    event.preventDefault();
    // Cancel the pending selection timer
    clearTimeout(selectTimeout);
});

// If the finger moves too much, it's a drag/swipe, not a hold.
renderer.domElement.addEventListener('pointermove', event => {
    // Optional: cancel the hold if the user starts dragging their finger
    // This prevents accidental selections when trying to swipe.
    // clearTimeout(selectTimeout); 
});

renderer.domElement.addEventListener('touchend', event => {
    event.preventDefault();
    touchStartTime = 0;
});

renderer.domElement.addEventListener('pointerdown', event => {
    event.preventDefault(); // blocks browser default menu

    if(selectedPiece) return; // already holding

    if(event.pointerType !== 'touch') return; // only handle touch for AR

    const pointer = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        - (event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if(intersects.length > 0){
        const target = intersects[0].object.parent;
        touchStartTime = Date.now();

        setTimeout(() => {
            if(Date.now() - touchStartTime >= holdThreshold){
                selectedPiece = target;
                isDragging = true;
                doneButton.style.display = 'block';
            }
        }, holdThreshold);
    }
});

// --- ANIMATE / MOVE FURNITURE --- //
function animate(timestamp, frame){
    if(frame && hitTestSource && selectedPiece && isDragging){
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if(hitTestResults.length > 0){
            const hit = hitTestResults[0];
            const pose = hit.getPose(localReferenceSpace);

            selectedPiece.position.set(
                pose.transform.position.x,
                pose.transform.position.y - selectedPiece.userData.floorOffset,
                pose.transform.position.z
            );
        }
    }

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
