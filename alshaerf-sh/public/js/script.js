console.log("JS Loaded!");
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".btn-comment");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      alert("تم إرسال تعليقك!");
    });
  });
});
