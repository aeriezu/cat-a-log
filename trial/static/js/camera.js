const video = document.getElementById("camera-feed");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    console.error("Camera access denied: ", err);
  });

// Close button logic
document.querySelector(".close-btn").addEventListener("click", () => {
  window.history.back(); // or redirect to home
});

// Carousel item click (send selected furniture to backend/AR logic)
document.querySelectorAll(".item").forEach(item => {
  item.addEventListener("click", () => {
    console.log("Selected:", item.textContent);
    // Call backend function to display AR object
  });
});
