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

(function () {
  const MAX_FILES = 8;
  const MAX_BYTES = 2 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ALLOWED_LABEL = 'JPG, PNG, WEBP, or GIF';

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${Math.ceil(bytes / 1024)}KB`;
  }

  function setFiles(input, files) {
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
  }

  function setupImageInput(input) {
    const container = input.closest('.form-card') || input.closest('form') || document;
    const preview = container.querySelector('[data-image-preview]');
    const errorBox = container.querySelector('[data-image-error]');
    if (!preview || !errorBox) return;

    let selectedFiles = [];

    function showErrors(errors) {
      errorBox.innerHTML = '';
      if (!errors.length) {
        errorBox.classList.remove('active');
        return;
      }
      errorBox.classList.add('active');
      errors.forEach((message) => {
        const p = document.createElement('p');
        p.textContent = message;
        errorBox.appendChild(p);
      });
    }

    function render() {
      preview.innerHTML = '';
      selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'image-preview-item';

        const img = document.createElement('img');
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);

        const meta = document.createElement('div');
        meta.className = 'image-preview-meta';
        meta.innerHTML = `<strong>${index === 0 ? 'Primary image' : 'Image ' + (index + 1)}</strong><span>${file.name}</span><small>${formatSize(file.size)}</small>`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'image-remove-btn';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          selectedFiles.splice(index, 1);
          setFiles(input, selectedFiles);
          render();
        });

        item.appendChild(img);
        item.appendChild(meta);
        item.appendChild(remove);
        preview.appendChild(item);
      });
    }

    input.addEventListener('change', () => {
      const incoming = Array.from(input.files || []);
      const errors = [];
      const valid = [];

      incoming.forEach((file) => {
        if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push(`${file.name} was skipped. Supported formats: ${ALLOWED_LABEL}.`);
          return;
        }
        if (file.size > MAX_BYTES) {
          errors.push(`${file.name} was skipped. Maximum size is 2MB; this file is ${formatSize(file.size)}.`);
          return;
        }
        valid.push(file);
      });

      selectedFiles = selectedFiles.concat(valid);
      if (selectedFiles.length > MAX_FILES) {
        errors.push(`Only the first ${MAX_FILES} valid images were kept.`);
        selectedFiles = selectedFiles.slice(0, MAX_FILES);
      }

      setFiles(input, selectedFiles);
      showErrors(errors);
      render();
    });
  }

  document.querySelectorAll('[data-image-input]').forEach(setupImageInput);
})();
