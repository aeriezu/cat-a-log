// Camera Feed 
const video = document.getElementById("camera-feed");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    console.error("Camera access denied: ", err);
  });

// Close Button 
document.querySelector(".close-btn").addEventListener("click", () => {
  window.history.back();
});

// Furniture Data (Images) 
const furnitureData = {
  chairs: [
    { name: "Modern Chair", img: "./images/chairs/chair1.png" },
    { name: "Office Chair", img: "./images/chairs/chair2.png" },
    { name: "Dining Chair", img: "./images/chairs/chair3.png" }
  ],
  tables: [
    { name: "Coffee Table", img: "./images/tables/table1.png" },
    { name: "Dining Table", img: "./images/tables/table2.png" }
  ],
  couches: [
    { name: "Sofa", img: "./images/couches/couch1.png" },
    { name: "Sectional", img: "./images/couches/couch2.png" }
  ],
  lamps: [
    { name: "Standing Lamp", img: "./images/lamps/lamp1.png" },
    { name: "Table Lamp", img: "./images/lamps/lamp2.png" }
  ]
};

// DOM Elements 
const itemTrack = document.getElementById("item-track");
const categories = document.querySelectorAll(".category");

// ===== Functions =====

// Populate bottom carousel based on selected category
function loadItems(category) {
  itemTrack.innerHTML = ""; // clear previous items
  furnitureData[category].forEach(itemData => {
    const div = document.createElement("div");
    div.classList.add("item");

    const img = document.createElement("img");
    img.src = itemData.img;
    img.alt = itemData.name;
    img.classList.add("item-img");

    div.appendChild(img);

    div.addEventListener("click", () => {
      console.log("Selected item:", itemData.name);
      // Call AR logic to place this item
    });

    itemTrack.appendChild(div);
  });
}

// Handle category clicks
categories.forEach(cat => {
  cat.addEventListener("click", () => {
    categories.forEach(c => c.classList.remove("active"));
    cat.classList.add("active");
    loadItems(cat.dataset.category);
  });
});

// Load default category on page load
categories[0].classList.add("active");
loadItems(categories[0].dataset.category);
