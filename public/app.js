(function () {
  const body = document.body;
  const openButtons = document.querySelectorAll('[data-open-modal]');
  const overlays = document.querySelectorAll('[data-modal]');

  function openModal(name) {
    const modal = document.querySelector(`[data-modal="${name}"]`);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    body.classList.add('modal-open');
    const first = modal.querySelector('input, select, textarea, button:not([data-close-modal])');
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    body.classList.remove('modal-open');
  }

  openButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openModal(button.getAttribute('data-open-modal'));
    });
  });

  overlays.forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.matches('[data-close-modal]')) closeModal(modal);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(closeModal);
    }
  });

  const sellerModal = document.querySelector('[data-modal="list-machine"]');
  if (sellerModal) {
    const termsStep = sellerModal.querySelector('[data-step="terms"]');
    const formStep = sellerModal.querySelector('[data-step="form"]');
    const termsConfirm = sellerModal.querySelector('[data-terms-confirm]');
    const nextButton = sellerModal.querySelector('[data-next-seller-step]');
    const prevButton = sellerModal.querySelector('[data-prev-seller-step]');

    function showSellerStep(step) {
      const showForm = step === 'form';
      termsStep.classList.toggle('active', !showForm);
      formStep.classList.toggle('active', showForm);
      sellerModal.querySelector('.modal-panel').scrollTop = 0;
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        if (!termsConfirm.checked) {
          termsConfirm.focus();
          termsConfirm.closest('.check-row').classList.add('needs-attention');
          return;
        }
        termsConfirm.closest('.check-row').classList.remove('needs-attention');
        showSellerStep('form');
      });
    }
    if (prevButton) prevButton.addEventListener('click', () => showSellerStep('terms'));
  }
})();
