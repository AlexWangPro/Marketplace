document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  const mainPhoto = document.querySelector('.main-photo');
  document.querySelectorAll('.thumbs img').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      if (mainPhoto && thumb.src) mainPhoto.src = thumb.src;
    });
  });
});
