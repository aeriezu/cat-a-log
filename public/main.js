import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- SCENE, CAMERA, RENDERER --- //
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- LIGHTING --- //
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// --- GROUND --- //
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0xcccccc })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- CONTROLS --- //
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);

// --- RAYCAST & POINTER --- //
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedObject = null;
let touchStartTime = 0;
const holdThreshold = 300;

// --- DONE BUTTON --- //
const doneButton = document.createElement('button');
doneButton.innerText = '✔️';
doneButton.style.position = 'absolute';
doneButton.style.top = '10px';
doneButton.style.right = '10px';
doneButton.style.display = 'none';
document.body.appendChild(doneButton);

doneButton.addEventListener('click', () => {
    selectedObject = null;
    doneButton.style.display = 'none';
    controls.enabled = true;
});

// --- OBJECTS --- //
const originalObjects = [];
const interactableObjects = []; // clones we can move
const allObjects = []; // for collision check

// --- HELPER FUNCTIONS --- //
function updatePointer(event) {
    const touch = event.touches ? event.touches[0] : event;
    pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
}

function findTopLevel(object, validationFn) {
    let parent = object;
    while (parent.parent && parent.parent.type !== 'Scene') {
        if (validationFn(parent)) return parent;
        parent = parent.parent;
    }
    if (validationFn(parent)) return parent;
    return null;
}

function createLabel(mesh) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '30px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(mesh.name || 'Obj', 0, 30);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1, 0.5, 1);
    sprite.position.set(mesh.position.x, mesh.position.y + 1, mesh.position.z);

    scene.add(sprite);
}

// --- GLTF LOADING --- //
loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    const model = glb.scene;
    scene.add(model);

    model.traverse((child) => {
        if (child.isMesh) {
            interactableObjects.push(child);
            child.castShadow = true;
            child.receiveShadow = true;

            if (!child.name) child.name = THREE.MathUtils.generateUUID();

            // Add a label for each mesh
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = '30px Arial';
            ctx.fillStyle = 'white';
            ctx.fillText(child.name, 0, 30);
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(1, 0.5, 1);
            sprite.position.set(child.position.x, child.position.y + 1, child.position.z);
            scene.add(sprite);
        }
    });
});

// --- EVENT HANDLERS --- //
function onPointerDown(event) {
    if (event.isPrimary === false) return;

    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);

    // Check existing interactable clones first
    const intersectsClones = raycaster.intersectObjects(interactableObjects, true);
    if (intersectsClones.length > 0) {
        selectedObject = findTopLevel(intersectsClones[0].object, obj => interactableObjects.includes(obj));
        controls.enabled = false;
        document.getElementById('info').innerText = `Moving: ${selectedObject.name}`;
        doneButton.style.display = 'block';
        return;
    }

    // Check originals to clone
    const intersectsOriginals = raycaster.intersectObjects(originalObjects, true);
    if (intersectsOriginals.length > 0) {
        const original = findTopLevel(intersectsOriginals[0].object, obj => originalObjects.includes(obj));
        if (original) {
            const clone = original.clone();
            clone.userData.isClone = true;
            interactableObjects.push(clone);
            allObjects.push(clone);

            const intersectsGround = raycaster.intersectObject(ground);
            if (intersectsGround.length > 0) clone.position.copy(intersectsGround[0].point);

            scene.add(clone);
            createLabel(clone);

            selectedObject = clone;
            controls.enabled = false;
            doneButton.style.display = 'block';
            document.getElementById('info').innerText = `Created & Moving: ${clone.name}`;
        }
    }
}

function onPointerMove(event) {
    if (!selectedObject || event.isPrimary === false) return;

    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(ground);
    if (intersects.length > 0) {
        const newPos = intersects[0].point.clone();

        const bbox = new THREE.Box3().setFromObject(selectedObject);
        bbox.translate(newPos.clone().sub(selectedObject.position));

        let collision = false;
        for (const obj of allObjects) {
            if (obj !== selectedObject) {
                const otherBox = new THREE.Box3().setFromObject(obj);
                if (bbox.intersectsBox(otherBox)) {
                    collision = true;
                    break;
                }
            }
        }

        if (!collision) selectedObject.position.copy(newPos);
    }
}

function onPointerUp(event) {
    if (event.isPrimary === false) return;
    if (selectedObject) selectedObject = null;
    controls.enabled = true;
    doneButton.style.display = 'none';
}

// --- EVENT LISTENERS --- //
window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- ANIMATE --- //
function animate() {
    controls.update();
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
