
document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrape-btn');
    const usernameInput = document.getElementById('username');
    const limitInput = document.getElementById('limit');
    const resultGrid = document.getElementById('result-grid');
    const historyGrid = document.getElementById('history-grid');
    const statusMessage = document.getElementById('status-message');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const filterInput = document.getElementById('filter-input');
    const importBtn = document.getElementById('import-btn');
    const jsonUpload = document.getElementById('json-upload');
    const archiveHeader = document.getElementById('archive-header');
    const currentFolderName = document.getElementById('current-folder-name');
    const backToFoldersBtn = document.getElementById('back-to-folders');
    const deleteFolderBtn = document.getElementById('delete-folder-btn');

    // Manual Enrichment elements
    const manualImageInput = document.getElementById('manual-image-input');
    const manualUploadBtn = document.getElementById('manual-upload-btn');
    const dropZone = document.getElementById('drop-zone');
    const manualGrid = document.getElementById('manual-grid');

    // Modal elements
    const modal = document.getElementById('modal');
    const closeModal = document.querySelector('.close-modal');
    const modalImg = document.getElementById('modal-img');
    const modalUser = document.getElementById('modal-user');
    const modalCaption = document.getElementById('modal-caption');
    const modalDate = document.getElementById('modal-date');
    const modalDownload = document.getElementById('modal-download');
    const modalLink = document.getElementById('modal-link');
    const totalBadge = document.getElementById('total-badge');
    const progressContainer = document.getElementById('progress-container');
    const progressStatus = document.getElementById('progress-status');
    const progressPercent = document.getElementById('progress-percent');
    const progressFill = document.getElementById('progress-fill');

    // Selection Bar elements
    const selectionBar = document.getElementById('selection-bar');
    const selectedCountDisplay = document.getElementById('selected-count');
    const enrichBtn = document.getElementById('enrich-btn'); // Restored
    const annotateBtn = document.getElementById('annotate-btn'); // Restored
    const clearSelectionBtn = document.getElementById('clear-selection');

    // AI Progress elements
    const aiProgressContainer = document.getElementById('ai-progress-container');
    const aiProgressStatus = document.getElementById('ai-progress-status');
    const aiProgressPercent = document.getElementById('ai-progress-percent');
    const aiProgressFill = document.getElementById('ai-progress-fill');
    const aiCurrentWorkingOn = document.getElementById('ai-current-working-on');

    // Auth Elements
    const authOverlay = document.getElementById('auth-overlay');
    const loginForm = document.getElementById('login-form');
    const authUser = document.getElementById('auth-user');
    const authPass = document.getElementById('auth-pass');
    const authRemember = document.getElementById('auth-remember');
    const authError = document.getElementById('auth-error');
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    const displayUser = document.getElementById('display-user');
    const logoutBtn = document.getElementById('logout-btn');
    const mainContainer = document.getElementById('main-container');

    // AI Info elements
    const aiInfoContainer = document.getElementById('ai-info');
    const aiTitle = document.getElementById('ai-title');
    const aiYear = document.getElementById('ai-year');
    const aiGenre = document.getElementById('ai-genre');
    const aiDirector = document.getElementById('ai-director');
    const aiEmotion = document.getElementById('ai-emotion');
    const aiEmotionDesc = document.getElementById('ai-emotion-desc');
    const aiRelatedEmotions = document.getElementById('ai-related-emotions');
    const aiActorsList = document.getElementById('ai-actors-list');
    const aiDialogsList = document.getElementById('ai-dialogs-list');
    const aiTagsList = document.getElementById('ai-tags-list');

    let allPosts = []; // Local cache for filtering
    let selectedPosts = new Set();
    let currentFolder = null;
    let isDragging = false;
    let dragTargetState = true; // true = selecting, false = deselecting
    let currentUser = null;
    let manualPosts = []; // Metadata for manual uploads


    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'history') {
                currentFolder = null;
                archiveHeader.classList.add('hidden');
                loadHistory();
            } else if (tabId === 'dashboard') {
                loadHistory(); // Refresh statuses for dashboard
            } else if (tabId === 'manual') {
                loadManualHistory();
            }
            updateSelectionUI();
        });
    });

    // Scrape Action
    scrapeBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const limit = parseInt(limitInput.value) || 10;

        if (!username) {
            alert('Please enter a username');
            return;
        }

        setLoading(true);
        statusMessage.textContent = `Litzchill: Archiving content from @${username}...`;
        resultGrid.innerHTML = '';

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, limit })
            });

            const data = await response.json();

            if (response.ok) {
                if (data.posts.length === 0) {
                    statusMessage.textContent = 'No new images found or profile is private.';
                } else {
                    statusMessage.textContent = `Successfully archived ${data.posts.length} new posts.`;
                    renderGrid(data.posts, resultGrid);
                    loadHistory();
                }
            } else {
                statusMessage.textContent = `Error: ${data.detail || 'Failed to scrape'}`;
            }
        } catch (error) {
            console.error(error);
            statusMessage.textContent = 'Connection error. Is the server running?';
        } finally {
            setLoading(false);
        }
    });

    // Import Action
    importBtn.addEventListener('click', () => {
        jsonUpload.click();
    });

    jsonUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const items = JSON.parse(event.target.result);
                if (!Array.isArray(items)) {
                    alert('Invalid JSON format. Expected an array of items.');
                    return;
                }

                setLoading(true, importBtn);
                progressContainer.classList.remove('hidden');
                statusMessage.textContent = 'Preparing import...';

                // We use XMLHttpRequest here because fetch doesn't easily stream POST responses in all browsers
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/import-apify');
                xhr.setRequestHeader('Content-Type', 'application/json');

                let lastIndex = 0;
                xhr.onprogress = () => {
                    const response = xhr.responseText.substring(lastIndex);
                    const lines = response.split('\n');

                    lines.forEach(line => {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                if (data.type === 'progress') {
                                    const percent = Math.round((data.current / data.total) * 100);
                                    progressStatus.textContent = `Archiving: ${data.current} / ${data.total} (${data.post_id})`;
                                    progressPercent.textContent = `${percent}%`;
                                    progressFill.style.width = `${percent}%`;
                                } else if (data.type === 'complete') {
                                    statusMessage.textContent = `Successfully imported ${data.scraped_count} new posts.`;
                                    loadHistory();
                                    progressContainer.classList.add('hidden');
                                }
                            } catch (e) { }
                        }
                    });
                    lastIndex = xhr.responseText.length;
                };

                xhr.onload = () => {
                    if (xhr.status >= 400) {
                        statusMessage.textContent = 'Error: Import failed.';
                        progressContainer.classList.add('hidden');
                    }
                    setLoading(false, importBtn);
                    jsonUpload.value = '';
                };

                xhr.onerror = () => {
                    statusMessage.textContent = 'Connection error.';
                    setLoading(false, importBtn);
                    progressContainer.classList.add('hidden');
                };

                xhr.send(JSON.stringify(items));
            } catch (error) {
                console.error(error);
                alert('Failed to parse JSON file.');
            } finally {
                // setLoading(false, importBtn); // This is now handled by xhr.onload/onerror
                jsonUpload.value = ''; // Reset input
            }
        };
        reader.readAsText(file);
    });

    // Manual Upload Logic
    manualUploadBtn.addEventListener('click', () => manualImageInput.click());

    manualImageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) handleManualFiles(files);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) handleManualFiles(files);
    });

    async function handleManualFiles(files) {
        statusMessage.textContent = `Uploading ${files.length} images...`;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error('Upload failed');
            } catch (err) {
                console.error(err);
                alert(`Failed to upload ${file.name}`);
            }
        }

        statusMessage.textContent = 'Upload complete.';
        loadManualHistory();
    }

    // Filtering
    filterInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const activeTab = document.querySelector('.tab-content.active');
        const cards = activeTab.querySelectorAll('.card, .mini-card');

        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            if (text.includes(term)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });

    backToFoldersBtn.addEventListener('click', () => {
        currentFolder = null;
        archiveHeader.classList.add('hidden');
        renderHistory();
    });

    deleteFolderBtn.addEventListener('click', async () => {
        if (!currentFolder) return;
        if (!confirm(`Are you sure you want to delete all archived posts for @${currentFolder}? This cannot be undone.`)) return;

        try {
            const response = await fetch(`/api/folder/${currentFolder}`, { method: 'DELETE' });
            if (response.ok) {
                currentFolder = null;
                archiveHeader.classList.add('hidden');
                loadHistory();
            } else {
                alert('Litzchill: Failed to delete folder');
            }
        } catch (err) {
            console.error(err);
        }
    });

    // Selection Bar Actions
    clearSelectionBtn.addEventListener('click', () => {
        selectedPosts.clear();
        updateSelectionUI();
    });


    // Auth Actions
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = authUser.value.trim();
        const password = authPass.value;

        setLoading(true, loginBtn);
        authError.classList.add('hidden');

        try {
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailOrUsername: username, password })
            });

            if (response.ok) {
                const data = await response.json();
                handleLoginSuccess(data, authRemember.checked);
            } else {
                authError.classList.remove('hidden');
                authError.textContent = 'Litzchill: Sign in failed. Check your credentials.';
            }
        } catch (err) {
            console.error(err);
            authError.classList.remove('hidden');
            authError.textContent = 'Connection error. Is the server running?';
        } finally {
            setLoading(false, loginBtn);
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('insta_auth');
        location.reload();
    });

    function checkAuth() {
        const savedAuth = localStorage.getItem('insta_auth');
        console.log('DEBUG: Auth Check - localStorage content detected');
        if (savedAuth) {
            try {
                const responseData = JSON.parse(savedAuth);
                // Standard Supabase response structure: { data: { session: { access_token: ... }, user: ... } }
                const session = responseData.data?.session;
                const user = responseData.data?.user;

                if (session?.access_token) {
                    currentUser = {
                        access_token: session.access_token,
                        user: user
                    };
                    console.log('DEBUG: Auth Check - Session restored for:', user?.email);
                    showAppUI(currentUser);
                } else {
                    console.warn('DEBUG: Auth Check - access_token missing in nested data structure');
                }
            } catch (e) {
                console.error('DEBUG: Auth Check - JSON Parse/Access error:', e);
                localStorage.removeItem('insta_auth');
            }
        } else {
            console.log('DEBUG: Auth Check - No saved session found');
        }
    }

    function handleLoginSuccess(responseData, remember) {
        console.log('DEBUG: Sign-in Success - Data received');

        // Extract what we need from the nested response
        const session = responseData.data?.session;
        const user = responseData.data?.user;

        if (session?.access_token) {
            currentUser = {
                access_token: session.access_token,
                user: user
            };

            if (remember) {
                localStorage.setItem('insta_auth', JSON.stringify(responseData));
            }
            showAppUI(currentUser);
            updateSelectionUI();
        } else {
            console.error('DEBUG: Sign-in failed - access_token missing in API response');
            authError.classList.remove('hidden');
            authError.textContent = 'Litzchill: Authentication failed on server.';
        }
    }

    function showAppUI(userData) {
        console.log('DEBUG: Revealing Litzchill Dashboard');
        authOverlay.classList.add('hidden');
        mainContainer.classList.remove('hidden');
        userProfile.classList.remove('hidden');
        displayUser.textContent = `@${userData.user?.email?.split('@')[0] || userData.user?.userName || 'user'}`;
        document.body.style.overflow = 'auto';
        loadHistory();
    }

    // Dashboard Actions
    enrichBtn.addEventListener('click', async () => {
        const ids = Array.from(selectedPosts);
        if (ids.length === 0) return;

        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
        const sourcePosts = activeTab === 'manual' ? manualPosts : allPosts;

        const pendingIds = ids.filter(id => {
            const post = sourcePosts.find(p => p.post_id === id);
            return post && (!post.status || post.status === 'pending');
        });

        if (pendingIds.length === 0) {
            alert('Selection contains no pending items.');
            return;
        }
        await startAIProcess('enrich', pendingIds);
    });

    annotateBtn.addEventListener('click', async () => {
        const ids = Array.from(selectedPosts);
        if (ids.length === 0) return;
        const enrichedIds = ids.filter(id => {
            const post = allPosts.find(p => p.post_id === id);
            return post.status === 'enriched';
        });
        if (enrichedIds.length === 0) {
            alert('Selection contains no enriched items.');
            return;
        }
        await startAIProcess('annotate', enrichedIds);
    });

    async function startAIProcess(type, ids) {
        console.log(`DEBUG: AI Process - Type: ${type}, IDs:`, ids);
        console.log('DEBUG: AI Process - Current User State:', currentUser);

        const total = ids.length;
        const batchSize = 20;
        const batches = [];
        for (let i = 0; i < ids.length; i += batchSize) {
            batches.push(ids.slice(i, i + batchSize));
        }

        aiProgressContainer.classList.remove('hidden');
        setLoading(true, type === 'enrich' ? enrichBtn : annotateBtn);

        let totalSuccess = 0;
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
        const isManual = activeTab === 'manual';

        try {
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const currentBatchNum = i + 1;
                const totalBatches = batches.length;

                aiProgressStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${type === 'enrich' ? 'Enriching' : 'Annotating'} batch ${currentBatchNum}/${totalBatches} (${batch.length} items)...`;
                aiCurrentWorkingOn.textContent = `Batch progress: ${Math.round(((currentBatchNum - 1) / totalBatches) * 100)}%`;
                aiProgressFill.style.width = `${((currentBatchNum - 1) / totalBatches) * 100}%`;

                let endpoint = type === 'enrich' ? '/api/enrich' : '/api/annotate';
                if (isManual && type === 'enrich') endpoint = '/api/uploads/enrich';

                const headers = { 'Content-Type': 'application/json' };
                if (type === 'annotate' && currentUser?.access_token) {
                    headers['Authorization'] = `Bearer ${currentUser.access_token}`;
                }

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ post_ids: batch })
                });

                const result = await response.json();

                if (type === 'enrich') {
                    totalSuccess += result.filter(r => r.status === 'success').length;
                } else {
                    if (result.status === 'success') totalSuccess += batch.length;
                }

                // Partial progress update
                aiProgressFill.style.width = `${(currentBatchNum / totalBatches) * 100}%`;
            }

            aiProgressStatus.innerHTML = `<i class="fas fa-check-circle"></i> Complete: ${totalSuccess}/${total} success`;
        } catch (err) {
            console.error(err);
            aiProgressStatus.textContent = 'Process failed during batch execution.';
        } finally {
            aiProgressFill.style.width = `100%`;
            aiCurrentWorkingOn.textContent = '';
            selectedPosts.clear();

            if (activeTab === 'manual') await loadManualHistory();
            else await loadHistory();

            updateSelectionUI();
            setLoading(false, type === 'enrich' ? enrichBtn : annotateBtn);
            setTimeout(() => aiProgressContainer.classList.add('hidden'), 5000);
        }
    }

    function updateSelectionUI() {
        const count = selectedPosts.size;
        selectedCountDisplay.textContent = count;
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');

        if (count > 0) {
            selectionBar.classList.remove('hidden');
            if (activeTab === 'dashboard' || activeTab === 'manual') {
                const sourcePosts = activeTab === 'manual' ? manualPosts : allPosts;
                const selectedList = sourcePosts.filter(p => selectedPosts.has(p.post_id));

                const allPending = selectedList.length > 0 && selectedList.every(p => !p.status || p.status === 'pending');
                const allEnriched = selectedList.length > 0 && selectedList.every(p => p.status === 'enriched');

                enrichBtn.classList.toggle('hidden', !allPending);
                annotateBtn.classList.toggle('hidden', !allEnriched);
            } else {
                enrichBtn.classList.add('hidden');
                annotateBtn.classList.add('hidden');
            }
        } else {
            selectionBar.classList.add('hidden');
        }

        document.querySelectorAll('.card, .mini-card').forEach(card => {
            const postId = card.getAttribute('data-post-id');
            card.classList.toggle('selected', selectedPosts.has(postId));
        });
    }

    function togglePostSelection(postId, forceState = null) {
        if (forceState !== null) {
            if (forceState) selectedPosts.add(postId);
            else selectedPosts.delete(postId);
        } else {
            if (selectedPosts.has(postId)) selectedPosts.delete(postId);
            else selectedPosts.add(postId);
        }
        updateSelectionUI();
    }

    async function loadHistory() {
        try {
            const response = await fetch('/api/history');
            allPosts = await response.json();
            totalBadge.textContent = allPosts.length;
            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
            if (activeTab === 'dashboard') renderDashboard();
            else if (activeTab === 'history') renderHistory();
            else if (activeTab === 'collection') { /* current collection already rendered */ }
        } catch (error) { console.error(error); }
    }

    async function loadManualHistory() {
        try {
            const response = await fetch('/api/uploads/history');
            manualPosts = await response.json();
            renderManualGrid();
        } catch (err) {
            console.error(err);
        }
    }

    function renderManualGrid() {
        renderGrid(manualPosts, manualGrid);
    }

    function renderDashboard() {
        const pendingList = document.getElementById('pending-list');
        const enrichedList = document.getElementById('enriched-list');
        const completedList = document.getElementById('completed-list');

        const pending = allPosts.filter(p => !p.status || p.status === 'pending');
        const enriched = allPosts.filter(p => p.status === 'enriched');
        const completed = allPosts.filter(p => p.status === 'completed');

        document.getElementById('stat-pending').textContent = pending.length;
        document.getElementById('stat-enriched').textContent = enriched.length;
        document.getElementById('stat-completed').textContent = completed.length;

        pendingList.innerHTML = renderWorkflowColumn(pending);
        enrichedList.innerHTML = renderWorkflowColumn(enriched);
        completedList.innerHTML = renderWorkflowColumn(completed);

        [pendingList, enrichedList, completedList].forEach(list => {
            list.querySelectorAll('.mini-card').forEach(card => {
                const postId = card.getAttribute('data-post-id');
                card.querySelector('.mini-select').addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    isDragging = true;
                    dragTargetState = !selectedPosts.has(postId);
                    document.body.classList.add('selecting');
                    togglePostSelection(postId, dragTargetState);
                });
                card.addEventListener('mouseenter', () => { if (isDragging) togglePostSelection(postId, dragTargetState); });
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.mini-select')) return;
                    if (e.target.closest('.mini-delete')) {
                        deleteMeme(postId);
                        return;
                    }
                    const post = allPosts.find(p => p.post_id === postId);
                    if (post) openPostModal(post);
                });
            });
        });

        document.querySelectorAll('.select-all-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.getAttribute('data-status');
                const source = btn.getAttribute('data-source');
                const posts = (source === 'manual' ? manualPosts : allPosts).filter(p => status === 'pending' ? (!p.status || p.status === 'pending') : p.status === status);

                const allSelected = posts.every(p => selectedPosts.has(p.post_id));
                posts.forEach(p => allSelected ? selectedPosts.delete(p.post_id) : selectedPosts.add(p.post_id));
                updateSelectionUI();
                btn.textContent = allSelected ? (source === 'manual' ? 'Select All Pending' : 'Select All') : (source === 'manual' ? 'Deselect All Pending' : 'Deselect All');
            });
        });

        const next100Btn = document.getElementById('select-next-100-btn');
        if (next100Btn) {
            next100Btn.addEventListener('click', () => {
                const pending = allPosts.filter(p => (!p.status || p.status === 'pending') && !selectedPosts.has(p.post_id));
                pending.slice(0, 100).forEach(p => selectedPosts.add(p.post_id));
                updateSelectionUI();
            });
        }

        const next100EnrichedBtn = document.getElementById('select-next-100-enriched-btn');
        if (next100EnrichedBtn) {
            next100EnrichedBtn.addEventListener('click', () => {
                const enriched = allPosts.filter(p => p.status === 'enriched' && !selectedPosts.has(p.post_id));
                enriched.slice(0, 100).forEach(p => selectedPosts.add(p.post_id));
                updateSelectionUI();
            });
        }
    }

    function renderWorkflowColumn(posts) {
        if (posts.length === 0) return '<div class="status-message">Empty</div>';
        return posts.map(p => `
            <div class="mini-card ${selectedPosts.has(p.post_id) ? 'selected' : ''}" data-post-id="${p.post_id}">
                <div class="mini-select"></div>
                <div class="mini-delete"><i class="fas fa-trash"></i></div>
                <img src="${p.image_path}" alt="Thumb">
                <div class="mini-info">
                    <h4>@${p.username}</h4>
                    <p>${p.caption || 'No caption'}</p>
                </div>
            </div>
        `).join('');
    }

    function renderHistory() {
        if (currentFolder) {
            const filtered = allPosts.filter(p => p.username === currentFolder);
            renderGrid(filtered, historyGrid);
            currentFolderName.textContent = `@${currentFolder}`;
            archiveHeader.classList.remove('hidden');
        } else {
            renderFolders();
        }
    }

    function renderFolders() {
        const groups = {};
        allPosts.forEach(post => {
            if (!groups[post.username]) groups[post.username] = [];
            groups[post.username].push(post);
        });

        const usernames = Object.keys(groups).sort();
        if (usernames.length === 0) {
            historyGrid.innerHTML = '<div class="status-message">Archive is empty. Start a collection to see folders here.</div>';
            return;
        }

        const html = usernames.map(user => {
            const posts = groups[user];
            const previews = posts.slice(0, 3).map(p => `<img src="${p.image_path}" alt="Preview">`).join('');
            return `
                <div class="folder-card glass" data-username="${user}">
                    <h3>@${user}</h3>
                    <p>${posts.length} archived posts</p>
                    <div class="folder-preview">${previews}</div>
                </div>
            `;
        }).join('');

        historyGrid.innerHTML = html;

        // Add clicks for folders
        historyGrid.querySelectorAll('.folder-card').forEach(card => {
            card.addEventListener('click', () => {
                currentFolder = card.getAttribute('data-username');
                renderHistory();
            });
        });
    }

    function renderGrid(posts, container) {
        if (!posts || posts.length === 0) {
            container.innerHTML = '<div class="status-message">No items found in this section.</div>';
            return;
        }

        const html = posts.map(post => {
            const status = post.status || 'pending';
            const isSelected = selectedPosts.has(post.post_id);
            return `
                <div class="card glass ${isSelected ? 'selected' : ''}" data-post-id="${post.post_id}">
                    <div class="card-select"></div>
                    <div class="status-badge status-${status}">${status}</div>
                    <img src="${post.image_path}" alt="Post by ${post.username}" onerror="this.src='https://via.placeholder.com/300x300?text=Image+Not+Found'">
                    <div class="card-overlay">
                        <p>${post.caption || 'No caption'}</p>
                        <div class="card-meta">
                            <span class="card-date">${new Date(post.timestamp).toLocaleDateString()}</span>
                            <div class="actions">
                                <button class="view-btn download-btn"><i class="fas fa-expand"></i></button>
                                <button class="delete-meme-btn delete-btn"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        // Add click listeners
        container.querySelectorAll('.card').forEach(card => {
            const postId = card.getAttribute('data-post-id');

            // Selection toggle logic
            card.querySelector('.card-select').addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isDragging = true;
                dragTargetState = !selectedPosts.has(postId);
                document.body.classList.add('selecting');
                togglePostSelection(postId, dragTargetState);
            });

            card.addEventListener('mouseenter', () => {
                if (isDragging) {
                    togglePostSelection(postId, dragTargetState);
                }
            });

            // Card click for modal (only if not clicking select)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.card-select')) return;
                if (e.target.closest('.delete-meme-btn')) {
                    deleteMeme(postId);
                    return;
                }
                const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
                const sourcePosts = activeTab === 'manual' ? manualPosts : allPosts;
                const post = sourcePosts.find(p => p.post_id === postId) || posts.find(p => p.post_id === postId);
                if (post) openPostModal(post);
            });
        });
    }

    function openPostModal(post) {
        modalImg.src = post.image_path;
        modalUser.textContent = `@${post.username}`;
        modalCaption.textContent = post.caption || 'No description provided.';
        modalDate.textContent = `Archived on ${new Date(post.scraped_at).toLocaleString()}`;

        modalDownload.href = post.image_path;
        modalDownload.download = `${post.post_id}.jpg`;
        modalLink.href = post.post_url;

        // AI Attributes
        if (post.ai_data) {
            aiInfoContainer.classList.remove('hidden');
            const data = post.ai_data;

            // Header Summary
            aiTitle.textContent = data.title || 'N/A';
            aiYear.textContent = data.releaseYear || 'N/A';
            aiGenre.textContent = data.genre || 'N/A';
            aiDirector.textContent = data.director || 'N/A';

            // Emotion
            aiEmotion.textContent = data.emotionLabel || 'N/A';
            aiEmotionDesc.textContent = data.emotionDescription || '';
            const related = data.relatedEmotions || [];
            aiRelatedEmotions.innerHTML = related.map(e => `<span class="badge secondary">${e}</span>`).join('');

            // Actors
            const actors = data.actors || [];
            aiActorsList.innerHTML = actors.map(a => `
                <div class="actor-card">
                    <h5>${a.name}</h5>
                    <div class="actor-meta"><i class="fas fa-calendar-alt"></i> ${a.dob || 'Unknown DOB'}</div>
                    <div class="actor-films">${(a.filmography || []).join(' • ')}</div>
                </div>
            `).join('');

            // Dialogs
            const dialogs = data.dialogs || [];
            aiDialogsList.innerHTML = dialogs.map(d => `
                <div class="dialog-bubble">
                    <div class="dialog-actor">${d.actor}</div>
                    <div class="dialog-text">"${d.text}"</div>
                </div>
            `).join('');

            // Grouped Tags
            const tags = data.tags || [];
            aiTagsList.innerHTML = tags.map(t => `
                <span class="tag" title="${t.category}">${t.name}</span>
            `).join('');
        } else {
            aiInfoContainer.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    closeModal.addEventListener('click', (e) => {
        e.stopPropagation();
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto';
        }
    });

    async function deleteMeme(postId) {
        if (!confirm('Litzchill: Are you sure you want to delete this meme?')) return;

        try {
            const response = await fetch(`/api/meme/${postId}`, { method: 'DELETE' });
            if (response.ok) {
                selectedPosts.delete(postId);
                const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
                if (activeTab === 'manual') await loadManualHistory();
                else await loadHistory();
                updateSelectionUI();
            } else {
                alert('Litzchill: Failed to delete meme');
            }
        } catch (err) {
            console.error(err);
        }
    }

    function setLoading(isLoading, btn = scrapeBtn) {
        const btnText = btn.querySelector('.btn-text, span:not(.loader)');
        const loader = btn.querySelector('.loader') || btn.querySelector('i'); // Fallback to icon if no loader

        if (isLoading) {
            btn.disabled = true;
            if (btnText) btnText.classList.add('hidden');
            if (loader) {
                loader.classList.remove('hidden');
                if (loader.tagName === 'I') loader.className = 'fas fa-spinner fa-spin'; // Turn icon into spinner
            }
        } else {
            btn.disabled = false;
            if (btnText) btnText.classList.remove('hidden');
            if (loader) {
                if (loader.tagName === 'I') {
                    loader.className = btn === importBtn ? 'fas fa-file-import' : 'fab fa-instagram';
                } else {
                    loader.classList.add('hidden');
                }
            }
        }
    }

    // Initial load
    checkAuth();
    loadHistory();
});
