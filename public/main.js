import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- SCENE, CAMERA, RENDERER --- //
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.setAnimationLoop(animate);
document.body.appendChild( renderer.domElement );

// --- OBJECT SELECT --- //
const interactableObjects = [];
let selectedPiece = null;
let touchStartTime = 0;
const holdThreshold = 800;
let isSelected = false;
let isDragging = false;

// --- OBJECT DONE BUTTON --- //
const doneButton = document.createElement('button');
doneButton.innerText = '✔️';
doneButton.style.position = 'absolute';
doneButton.style.top = '10px';
doneButton.style.right = '10px';
doneButton.style.display = 'none';
document.body.appendChild(doneButton);

doneButton.addEventListener('click', () => {
    selectedPiece = null;
    isSelected = false;
    doneButton.style.pointerEvents = 'auto';
    isDragging = false; // <-- ADD THIS LINE
    doneButton.style.display = 'none';
    controls.enabled = true;
});

// --- GROUND --- //
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30,30),
    new THREE.MeshStandardMaterial({color: 0xcccccc})
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- CONTROLS --- //
const controls = new OrbitControls( camera, renderer.domElement );

// --- RAYCASTING AND POINTER -- //
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// --- GLTF LOADER --- //
const loader = new GLTFLoader();

const funiturePieces = [] // store invidual meshes

loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    const model = glb.scene;
    scene.add(model);

    model.traverse((child)=>{
        if(child.isMesh){
            interactableObjects.push(child);
            console.log(child);
        }
        child.castShadow = true;
        child.receiveShadow = true;

        if(!child.name) child.name = THREE.MathUtils.generateUUID();

        funiturePieces.push(child);
    })
    
    console.log(funiturePieces);

    funiturePieces.forEach((mesh)=>{
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '30px Arial';
        context.fillStyle = 'white';
        context.fillText(mesh.name, 0, 30);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);

        sprite.scale.set(1, 0.5, 1);
        sprite.position.set(mesh.position.x, mesh.position.y + 1, mesh.position.z);

        scene.add(sprite);
    });

});


// --- EVENT LISTENERS --- //
window.addEventListener('pointermove', onPointerMove);
// --- MOUSE UP --- //
window.addEventListener('pointerup', () => {
    isDragging = false; // <-- ADD THIS LINE (your old one was empty)
});

renderer.domElement.addEventListener('touchstart', (event) => {
    if(isSelected) return;
    if (event.touches.length !== 1) return;
    
    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
        touchStartTime = Date.now();
        const target = intersects[0].object.parent; // top-level object
        selectedPiece = null; // not yet selected

        // check after holdThreshold
        setTimeout(() => {
            if (Date.now() - touchStartTime >= holdThreshold) {
                selectedPiece = target;
                isSelected = true;
                doneButton.style.display = 'block';
                controls.enabled = false;
                console.log('Selected:', selectedPiece.name);
            }
        }, holdThreshold);
    }
});

// renderer.domElement.addEventListener('touchmove', (event) => {
//     // 1. Only run if a piece is selected
//     if (!selectedPiece) return;
//     event.preventDefault(); // prevent scrolling

//     const touch = event.touches[0];
//     pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
//     pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
//     raycaster.setFromCamera(pointer, camera);

//     // 2. Check if the pointer is intersecting with any interactable object
//     const intersects = raycaster.intersectObjects(interactableObjects, true);

//     // 3. Check if we hit an object AND if that object's parent is our selected piece
//     if (intersects.length > 0 && intersects[0].object.parent === selectedPiece) {
//         // 4. If the check passes, THEN move the piece along the ground plane
//         const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
//         const intersectionPoint = new THREE.Vector3();
        
//         if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
//             selectedPiece.position.set(
//                 intersectionPoint.x,
//                 selectedPiece.position.y, // Keep original height
//                 intersectionPoint.z
//             );
//         }
//     }
// });
// --- TOUCHMOVE --- //
renderer.domElement.addEventListener('touchmove', (event) => {
    if (!selectedPiece) return;
    event.preventDefault();

    // Always update pointer location
    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // If we have an object selected but aren't dragging it yet,
    // check if the pointer is on the object to INITIATE the drag.
    if (!isDragging) {
        const intersects = raycaster.intersectObjects(interactableObjects, true);
        if (intersects.length > 0 && intersects[0].object.parent === selectedPiece) {
            isDragging = true;
        }
    }

    // If we are actively dragging, move the object.
    if (isDragging) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
            selectedPiece.position.set(
                intersectionPoint.x,
                selectedPiece.position.y,
                intersectionPoint.z
            );
        }
    }
});

// --- TOUCH END --- //
renderer.domElement.addEventListener('touchend', () => {
    touchStartTime = 0;
    isDragging = false; // <-- ADD THIS LINE
});

function onPointerDown(event) {
    if (!selectedPiece) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
        selectedPiece = intersects[0].object.parent; // pick parent mesh
        console.log(`Selected: ${selectedPiece.name}`);

        document.getElementById('info').innerText = `Selected: ${selectedPiece.name}`;
    } else {
        selectedPiece = null;
    }
}

// function onPointerMove(event) {
//     // 1. Only run if a piece is selected
//     if (!selectedPiece) return;
                                           
//     pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
//     pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

//     raycaster.setFromCamera(pointer, camera);

//     // 2. Check if the pointer is intersecting with our selected piece
//     const intersects = raycaster.intersectObjects(interactableObjects, true);

//     // 3. If the pointer is over the selected piece, then move it
//     if (intersects.length > 0 && intersects[0].object.parent === selectedPiece) {
//         // Plane at y = 0 (ground)
//         const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
//         const intersectionPoint = new THREE.Vector3();

//         if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
//             selectedPiece.position.set(
//                 intersectionPoint.x,
//                 selectedPiece.position.y, // keep original height
//                 intersectionPoint.z
//             );
//         }
//     }
// }
function onPointerMove(event) {
    if (!selectedPiece) return;

    // Always update pointer location
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // Initiate drag on first move over the object
    if (!isDragging) {
        const intersects = raycaster.intersectObjects(interactableObjects, true);
        if (intersects.length > 0 && intersects[0].object.parent === selectedPiece) {
            isDragging = true;
        }
    }

    // If dragging, move the object
    if (isDragging) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
            selectedPiece.position.set(
                intersectionPoint.x,
                selectedPiece.position.y,
                intersectionPoint.z
            );
        }
    }
}

function animate(){
    controls.update();
    renderer.render(scene,camera);
}
