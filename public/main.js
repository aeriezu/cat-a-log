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
        child.recieveShadow = true;

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
window.addEventListener('pointerup', () => {
    //selectedPiece = null;
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

renderer.domElement.addEventListener('touchmove', (event) => {
    if (!selectedPiece) return;
    event.preventDefault(); // prevent scrolling

    const touch = event.touches[0];
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    const intersectionPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        selectedPiece.position.set(
            intersectionPoint.x,
            selectedPiece.position.y,
            intersectionPoint.z
        );
    }
});

renderer.domElement.addEventListener('touchend', () => {
    touchStartTime = 0;
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

function onPointerMove(event) {                                            
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    // Plane at y = 0 (ground)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        selectedPiece.position.set(
            intersectionPoint.x,
            selectedPiece.position.y, // keep original height
            intersectionPoint.z
        );
    }
}

function animate(){
    controls.update();
    renderer.render(scene,camera);
}
