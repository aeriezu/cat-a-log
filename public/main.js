import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


//raycaster setup (object selection)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactableObjects = [];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.setAnimationLoop(animate);
document.body.appendChild( renderer.domElement );

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30,30),
    new THREE.MeshStandardMaterial({color: 0xcccccc})
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);


const controls = new OrbitControls( camera, renderer.domElement );
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

function onPointerDown(event) {
    // Calculate pointer position in normalized device coordinates
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        console.log(`Tapped on: ${clickedObject.name}`);
        
        // Update the UI element
        document.getElementById('info').innerText = `Selected: ${clickedObject.name}`;
    }
}

window.addEventListener('pointerdown', onPointerDown);
function animate(){
    controls.update();
    renderer.render(scene,camera);
}

