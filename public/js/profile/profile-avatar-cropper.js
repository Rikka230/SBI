import { getProfileAvatarCropSource, isLegacyAvatarDataUrl, migrateLegacyAvatarForUser, saveProfileAvatarToStorage } from '/js/avatar-storage.js';
import { escapeHTML, formatFileSize, AVATAR_MAX_INPUT_BYTES, getDisplayName } from './profile-utils.js';
import { hydrateOwnerAvatarInTopbar } from './profile-topbar.js';

export async function maybeMigrateVisibleLegacyAvatar({ uid, data, avatarImg = null, context }) {
  if (!uid || !data) return;
  if (!isLegacyAvatarDataUrl(data.photoURL) && !isLegacyAvatarDataUrl(data.photoOriginal)) return;
  if (!context.isOwner && !context.isAdmin) return;

  try {
    const migrated = await migrateLegacyAvatarForUser(uid, data, {
      migratedFrom: context.isAdmin && !context.isOwner ? 'admin-profile-view' : 'profile-view'
    });

    if (migrated?.downloadURL) {
      context.currentProfileData = {
        ...context.currentProfileData,
        photoURL: migrated.downloadURL,
        photoStoragePath: migrated.storagePath
      };

      if (avatarImg) avatarImg.src = migrated.downloadURL;
      if (context.isOwner) hydrateOwnerAvatarInTopbar(migrated.downloadURL, getDisplayName(data));
    }
  } catch (error) {
    console.warn('[SBI Profile] Migration avatar legacy ignorée :', error);
  }
}

export function initProfileAvatarCropper({ context, reloadProfile }) {
  const modal = document.getElementById('crop-modal');
  const input = document.getElementById('pfp-file-input');
  const imageElement = document.getElementById('crop-image');

  if (!modal || !input || !imageElement) return;
  if (modal.dataset.cropperBound === 'true') return;
  modal.dataset.cropperBound = 'true';

  let cropperInstance = null;
  let originalImageDataUrl = null;
  let revokeCurrentCropSource = null;
  let currentCropCanExport = true;
  let cropFeedbackElement = null;
  const resetImageElementStyles = () => {
    imageElement.style.position = '';
    imageElement.style.top = '';
    imageElement.style.left = '';
    imageElement.style.width = '';
    imageElement.style.height = '';
    imageElement.style.maxWidth = '100%';
    imageElement.style.maxHeight = '';
    imageElement.style.objectFit = '';
    imageElement.style.transform = '';
  };

  const showRemoteAvatarPreview = (src) => {
    if (!src) return;
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }

    imageElement.onload = null;
    imageElement.onerror = null;
    imageElement.removeAttribute('crossorigin');
    imageElement.src = src;
    imageElement.style.position = 'static';
    imageElement.style.display = 'block';
    imageElement.style.width = '100%';
    imageElement.style.height = '350px';
    imageElement.style.maxWidth = '100%';
    imageElement.style.objectFit = 'contain';
    imageElement.style.transform = 'none';
  };


  const ensureCropFeedback = () => {
    if (cropFeedbackElement) return cropFeedbackElement;
    cropFeedbackElement = document.getElementById('crop-feedback');

    if (!cropFeedbackElement) {
      cropFeedbackElement = document.createElement('div');
      cropFeedbackElement.id = 'crop-feedback';
      cropFeedbackElement.style.cssText = 'display:none; width: min(90vw, 420px); box-sizing:border-box; margin: 0.8rem 0 0 0; padding: 0.75rem 0.9rem; border-radius: 10px; font-size: 0.88rem; line-height: 1.35; text-align: left; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.08); color: #fff;';
      const cropZone = document.getElementById('crop-zone');
      if (cropZone?.parentNode) cropZone.parentNode.insertBefore(cropFeedbackElement, cropZone.nextSibling);
      else modal.appendChild(cropFeedbackElement);
    }

    return cropFeedbackElement;
  };

  const setCropFeedback = (message, type = 'info') => {
    const feedback = ensureCropFeedback();
    if (!feedback) return;
    const palette = {
      info: ['rgba(42, 87, 255, 0.18)', 'rgba(42, 87, 255, 0.35)'],
      success: ['rgba(16, 185, 129, 0.18)', 'rgba(16, 185, 129, 0.35)'],
      warning: ['rgba(245, 158, 11, 0.18)', 'rgba(245, 158, 11, 0.35)'],
      error: ['rgba(239, 68, 68, 0.18)', 'rgba(239, 68, 68, 0.35)']
    }[type] || ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.12)'];
    feedback.textContent = message;
    feedback.style.display = 'block';
    feedback.style.background = palette[0];
    feedback.style.borderColor = palette[1];
  };

  const clearCropFeedback = () => {
    const feedback = ensureCropFeedback();
    if (!feedback) return;
    feedback.textContent = '';
    feedback.style.display = 'none';
  };

  const releaseCurrentCropSource = () => {
    if (typeof revokeCurrentCropSource === 'function') revokeCurrentCropSource();
    revokeCurrentCropSource = null;
  };

  const resetCropper = () => {
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    imageElement.onload = null;
    imageElement.onerror = null;
    imageElement.removeAttribute('crossorigin');
    imageElement.src = '';
    resetImageElementStyles();
    originalImageDataUrl = null;
    currentCropCanExport = true;
    clearCropFeedback();
    releaseCurrentCropSource();
  };

  const restoreSaveButton = (button, text = 'Appliquer') => {
    if (!button) return;
    button.textContent = text;
    button.disabled = false;
    button.removeAttribute('title');
  };

  const lockSaveForRemoteAvatar = (button) => {
    if (!button) return;
    button.textContent = 'Changer l’image';
    button.disabled = true;
    button.title = 'La photo actuelle vient de Firebase Storage. Elle est affichée en aperçu simple pour éviter les erreurs CORS. Clique sur “Changer d’image” pour envoyer une nouvelle image.';
    setCropFeedback('La photo actuelle est affichée en aperçu. Pour la recadrer, clique sur “Changer d’image” et renvoie l’image depuis ton ordinateur.', 'info');
  };

  const compressImage = (file, maxWidth, callback, onError = null) => {
    const reader = new FileReader();
    reader.onerror = () => { if (typeof onError === 'function') onError(new Error('Lecture du fichier impossible.')); };
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => { if (typeof onError === 'function') onError(new Error('Image illisible.')); };
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round(height * maxWidth / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/webp', 0.9));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const launchCropper = (src, options = {}) => new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Aucune image à afficher.'));
      return;
    }

    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }

    let finished = false;
    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      imageElement.onload = null;
      imageElement.onerror = null;
      reject(new Error("Chargement de l'image trop long."));
    }, 10000);

    imageElement.onload = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeoutId);
      window.setTimeout(() => {
        currentCropCanExport = options.canvasSafe !== false;
        if (!currentCropCanExport) {
          showRemoteAvatarPreview(src);
          resolve({ canvasSafe: false, previewOnly: true });
          return;
        }
        cropperInstance = new Cropper(imageElement, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 1,
          cropBoxMovable: false,
          cropBoxResizable: false,
          guides: false,
          highlight: false,
          background: true,
          checkCrossOrigin: false
        });
        resolve({ canvasSafe: true, previewOnly: false });
      }, 50);
    };

    imageElement.onerror = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeoutId);
      reject(new Error("Impossible d'afficher l'image dans l'éditeur."));
    };

    imageElement.removeAttribute('crossorigin');
    resetImageElementStyles();
    imageElement.src = '';
    imageElement.src = src;
  });

  const openCurrentAvatarInEditor = async () => {
    const btnSave = document.getElementById('btn-save-crop');
    const btnUpload = document.getElementById('btn-upload-new');
    const previousSaveText = btnSave?.textContent || 'Appliquer';
    const previousUploadText = btnUpload?.textContent || 'Changer d’image';

    modal.style.display = 'flex';
    setCropFeedback('Chargement de la photo actuelle...', 'info');

    if (btnSave) {
      btnSave.textContent = 'Chargement...';
      btnSave.disabled = true;
      btnSave.removeAttribute('title');
    }
    if (btnUpload) {
      btnUpload.textContent = 'Chargement de la photo...';
      btnUpload.disabled = true;
    }

    try {
      releaseCurrentCropSource();
      const avatarSource = await getProfileAvatarCropSource(context.currentProfileId, context.currentProfileData);
      if (!avatarSource?.src) {
        modal.style.display = 'none';
        input.click();
        return;
      }

      revokeCurrentCropSource = avatarSource.revoke;
      originalImageDataUrl = avatarSource.src;
      currentCropCanExport = avatarSource.canvasSafe !== false;
      await launchCropper(avatarSource.src, { canvasSafe: currentCropCanExport });

      if (!currentCropCanExport) {
        showRemoteAvatarPreview(avatarSource.src);
        lockSaveForRemoteAvatar(btnSave);
      } else {
        clearCropFeedback();
        restoreSaveButton(btnSave, previousSaveText);
      }
    } catch (error) {
      console.warn('[SBI Profile] Avatar actuel non affichable dans le cropper :', error);
      modal.style.display = 'none';
      resetCropper();
      modal.style.display = 'flex';
      setCropFeedback('Impossible d’ouvrir la photo actuelle. Clique sur “Changer d’image” pour en choisir une nouvelle.', 'warning');
    } finally {
      if (btnUpload) {
        btnUpload.textContent = previousUploadText;
        btnUpload.disabled = false;
      }
      if (btnSave && currentCropCanExport) restoreSaveButton(btnSave, previousSaveText);
    }
  };

  document.getElementById('btn-trigger-crop')?.addEventListener('click', openCurrentAvatarInEditor);
  document.getElementById('btn-upload-new')?.addEventListener('click', () => {
    clearCropFeedback();
    input.click();
  });

  input.addEventListener('change', (event) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const selectedFile = event.target.files[0];
    modal.style.display = 'flex';
    const btnSave = document.getElementById('btn-save-crop');
    const originalText = btnSave?.textContent || 'Appliquer';

    if (btnSave) {
      btnSave.textContent = 'Traitement...';
      btnSave.disabled = true;
      btnSave.removeAttribute('title');
    }

    if (!selectedFile.type?.startsWith('image/')) {
      setCropFeedback('Ce fichier n’est pas une image. Choisis un fichier JPG, PNG ou WebP.', 'error');
      input.value = '';
      restoreSaveButton(btnSave, originalText === 'Changer l’image' ? 'Appliquer' : originalText);
      return;
    }

    if (selectedFile.size > AVATAR_MAX_INPUT_BYTES) {
      setCropFeedback('Image trop lourde (' + formatFileSize(selectedFile.size) + '). Compresse-la ou choisis une image de moins de ' + formatFileSize(AVATAR_MAX_INPUT_BYTES) + '.', 'warning');
      input.value = '';
      restoreSaveButton(btnSave, originalText === 'Changer l’image' ? 'Appliquer' : originalText);
      return;
    }

    setCropFeedback('Préparation de l’image...', 'info');
    releaseCurrentCropSource();
    currentCropCanExport = true;

    compressImage(selectedFile, 800, async (compressedBase64) => {
      try {
        originalImageDataUrl = compressedBase64;
        currentCropCanExport = true;
        await launchCropper(compressedBase64, { canvasSafe: true });
        clearCropFeedback();
        input.value = '';
      } catch (error) {
        console.error(error);
        setCropFeedback('Impossible d’afficher cette image dans l’éditeur. Essaie un JPG, PNG ou WebP plus léger.', 'error');
      } finally {
        restoreSaveButton(btnSave, originalText === 'Changer l’image' ? 'Appliquer' : originalText);
      }
    }, (error) => {
      console.error(error);
      setCropFeedback('Impossible de lire cette image. Essaie une image JPG, PNG ou WebP plus légère.', 'error');
      restoreSaveButton(btnSave, originalText === 'Changer l’image' ? 'Appliquer' : originalText);
    });
  });

  document.getElementById('btn-cancel-crop')?.addEventListener('click', () => {
    modal.style.display = 'none';
    resetCropper();
  });

  document.getElementById('btn-save-crop')?.addEventListener('click', async () => {
    if (!cropperInstance || !context.currentProfileId || !originalImageDataUrl) return;
    if (!currentCropCanExport) {
      setCropFeedback('La photo actuelle est en aperçu. Clique sur “Changer d’image” pour envoyer une nouvelle image recadrable.', 'info');
      return;
    }

    const btnSave = document.getElementById('btn-save-crop');
    btnSave.textContent = 'Mise à jour...';
    btnSave.disabled = true;
    setCropFeedback('Sauvegarde de la nouvelle photo...', 'info');

    try {
      const croppedCanvas = cropperInstance.getCroppedCanvas({ width: 200, height: 200 });
      const croppedWebpData = croppedCanvas.toDataURL('image/webp', 0.8);
      await saveProfileAvatarToStorage(context.currentProfileId, croppedWebpData, context.currentProfileData?.photoStoragePath || null, {
        prefix: 'avatar',
        migratedFrom: 'profile-cropper'
      });
      await reloadProfile(context.currentProfileId);
      modal.style.display = 'none';
      resetCropper();
    } catch (error) {
      console.error(error);
      setCropFeedback('Impossible de sauvegarder cette image. Essaie une image plus légère, puis relance l’envoi.', 'error');
    } finally {
      restoreSaveButton(btnSave, 'Appliquer');
    }
  });
}
