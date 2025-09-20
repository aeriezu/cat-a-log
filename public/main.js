import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


//raycaster setup (object selection)
const raycaster = new THREE.Raycaster();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop(animate);
document.body.appendChild( renderer.domElement );


const controls = new OrbitControls( camera, renderer.domElement );
const loader = new GLTFLoader();

const funiturePieces = [] // store invidual meshes

loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    const model = glb.scene;
    scene.add(model);
    model.traverse((child)=>{
        if(child.isMesh){
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

function animate(){
    controls.update();
    renderer.render(scene,camera);
}

