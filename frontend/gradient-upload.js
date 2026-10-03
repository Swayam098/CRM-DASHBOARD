document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('gradient-upload-container');
  if (!container) return; // Wait until injected

  const uploadCard = document.getElementById('gradient-upload-card');
  const fileInput = document.getElementById('gu-file-input');
  
  const iconExt = document.getElementById('gu-icon-ext');
  const fileName = document.getElementById('gu-file-name');
  const fileStatus = document.getElementById('gu-file-status');
  const fileSize = document.getElementById('gu-file-size');
  const progressBar = document.getElementById('gu-progress-fill');
  const progressBg = document.getElementById('gu-progress-bg');
  
  const btnAction = document.getElementById('gu-btn-action');
  
  let state = 'idle'; // idle, uploading, success, error
  let selectedFile = null;
  let progress = 0;
  const maxSizeMb = 50;
  
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024, dm = 1, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getExt = (name) => {
    return name.split('.').pop().substring(0, 4).toUpperCase() || "FILE";
  };
  
  const updateUI = () => {
    if (!selectedFile) {
      uploadCard.classList.remove('has-file');
      fileName.textContent = 'Select a file';
      fileStatus.textContent = state === 'dragging' ? 'Release to upload' : 'Ready';
      fileSize.textContent = `Up to ${maxSizeMb} MB`;
      iconExt.textContent = 'FILE';
      btnAction.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7-7 7 7"/></svg>`;
      btnAction.className = 'action-btn btn-upload';
      progressBg.style.width = '0%';
    } else {
      uploadCard.classList.add('has-file');
      fileName.textContent = selectedFile.name;
      iconExt.textContent = getExt(selectedFile.name);
      
      const uploaded = Math.round(selectedFile.size * progress / 100);
      
      if (state === 'uploading') {
        fileStatus.textContent = `Uploading ${Math.round(progress)}%`;
        fileSize.textContent = `${formatBytes(uploaded)} of ${formatBytes(selectedFile.size)}`;
      } else if (state === 'success') {
        fileStatus.textContent = 'Uploaded';
        fileSize.textContent = formatBytes(selectedFile.size);
      } else if (state === 'error') {
        fileStatus.textContent = 'Error';
        fileSize.textContent = formatBytes(selectedFile.size);
      } else {
        fileStatus.textContent = 'Ready';
        fileSize.textContent = formatBytes(selectedFile.size);
      }
      
      progressBg.style.width = `${Math.max(progress, 6)}%`;
      progressBar.style.width = `${progress}%`;
      
      if (state === 'success') {
         progressBar.className = 'progress-fill success';
         progressBg.style.backgroundColor = '#10b981';
      } else if (state === 'error') {
         progressBar.className = 'progress-fill error';
         progressBg.style.backgroundColor = '#ef4444';
      } else {
         progressBar.className = 'progress-fill';
         progressBg.style.backgroundColor = '#0ea5e9';
      }

      if (state === 'uploading') {
        // disable button visually
        btnAction.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        btnAction.className = 'action-btn btn-remove';
        btnAction.style.opacity = '0.5';
      } else {
        btnAction.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        btnAction.className = 'action-btn btn-remove';
        btnAction.style.opacity = '1';
      }
    }
  };
  
  uploadCard.addEventListener('click', () => {
    if (state !== 'uploading' && !selectedFile) {
      fileInput.click();
    }
  });
  
  uploadCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (state !== 'uploading') {
      state = 'dragging';
      uploadCard.classList.add('dragging');
      updateUI();
    }
  });
  
  uploadCard.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (state !== 'uploading') {
      state = 'idle';
      uploadCard.classList.remove('dragging');
      updateUI();
    }
  });
  
  uploadCard.addEventListener('drop', (e) => {
    e.preventDefault();
    if (state !== 'uploading') {
      state = 'idle';
      uploadCard.classList.remove('dragging');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });
  
  btnAction.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectedFile && state !== 'uploading') {
      selectedFile = null;
      state = 'idle';
      fileInput.value = '';
      updateUI();
    } else if (!selectedFile && state !== 'uploading') {
      fileInput.click();
    }
  });
  
  const handleFile = (file) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      alert(`File is larger than ${maxSizeMb}MB.`);
      return;
    }
    selectedFile = file;
    startUpload();
  };
  
  const startUpload = () => {
    state = 'uploading';
    progress = 8;
    updateUI();
    
    const interval = setInterval(() => {
      progress = Math.min(progress + 5 + Math.random() * 10, 92);
      updateUI();
    }, 180);
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    
    const token = localStorage.getItem('crm_token');
    
    fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    }).then(res => {
      clearInterval(interval);
      if (res.ok) {
        progress = 100;
        state = 'success';
        updateUI();
        
        const overlay = document.getElementById("skeleton-overlay");
        if (overlay) overlay.classList.add("active");

        const initialVersion = parseInt(document.getElementById('model-badge').dataset.version || "0", 10);
        
        const checkVersion = setInterval(async () => {
            try {
                const vRes = await fetch('/api/summary', { headers: {'Authorization': `Bearer ${token}`} });
                if (vRes.ok) {
                    const data = await vRes.json();
                    if (data && data.model && data.model.loaded && parseInt(data.model.version) > initialVersion) {
                        clearInterval(checkVersion);
                        setTimeout(() => location.reload(), 500);
                    }
                }
            } catch (err) {}
        }, 2000);
      } else {
        progress = 100;
        state = 'error';
        updateUI();
      }
    }).catch(err => {
      clearInterval(interval);
      progress = 100;
      state = 'error';
      updateUI();
    });
  };
  
  updateUI();
});
