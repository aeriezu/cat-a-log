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

loader.load('low_poly_furnitures_full_bundle.glb', function (glb) {
    scene.add(glb.scene);
    glb.scene.traverse((child)=>{
        if(child.isMesh){
            console.log(child);
        }
        child.castShadow = true;
        child.recieveShadow = true;
    })
});
function animate(){
    controls.update();
    renderer.render(scene,camera);
}