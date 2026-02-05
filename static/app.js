
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

    // Initial load
    loadHistory();

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
        statusMessage.textContent = `Archiving content from @${username}... This may take a moment.`;
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

    // Filtering
    filterInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const activeTab = document.querySelector('.tab-content.active');
        const cards = activeTab.querySelectorAll('.card');

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
                alert('Failed to delete folder');
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

    // Dashboard / Workflow AI Actions
    enrichBtn.addEventListener('click', async () => {
        const ids = Array.from(selectedPosts);
        if (ids.length === 0) return;

        // Verify all are pending
        const pendingIds = ids.filter(id => {
            const post = allPosts.find(p => p.post_id === id);
            return !post.status || post.status === 'pending';
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

        // Verify all are enriched
        const enrichedIds = ids.filter(id => {
            const post = allPosts.find(p => p.post_id === id);
            return post.status === 'enriched';
        });

        if (enrichedIds.length === 0) {
            alert('Selection contains no enriched items ready for upload.');
            return;
        }

        await startAIProcess('annotate', enrichedIds);
    });

    async function startAIProcess(type, ids) {
        const total = ids.length;
        aiProgressContainer.classList.remove('hidden');
        setLoading(true, type === 'enrich' ? enrichBtn : annotateBtn);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < total; i++) {
            const postId = ids[i];
            const current = i + 1;
            const percent = Math.round((current / total) * 100);

            const post = allPosts.find(p => p.post_id === postId);
            const postDisplay = post ? `@${post.username}: ${post.caption?.substring(0, 30) || 'No caption'}...` : postId;

            aiProgressStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${type === 'enrich' ? 'Enriching' : 'Annotating'} meme ${current} of ${total}...`;
            aiCurrentWorkingOn.textContent = `Working on: ${postDisplay}`;
            aiProgressPercent.textContent = `${percent}%`;
            aiProgressFill.style.width = `${percent}%`;

            try {
                const endpoint = type === 'enrich' ? '/api/enrich' : '/api/annotate';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_ids: [postId] })
                });
                const result = await response.json();

                // For enrich, it returns list of results, for annotate it returns a single status object
                if (type === 'enrich') {
                    if (result[0]?.status === 'success') successCount++;
                    else failCount++;
                } else {
                    if (result.status === 'success') successCount++;
                    else failCount++;
                }
            } catch (err) {
                console.error(err);
                failCount++;
            }
        }

        aiProgressStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${type === 'enrich' ? 'Enrichment' : 'Annotation'} complete! (${successCount} success, ${failCount} failed)`;
        aiCurrentWorkingOn.textContent = '';
        selectedPosts.clear();
        await loadHistory();
        updateSelectionUI();
        setLoading(false, type === 'enrich' ? enrichBtn : annotateBtn);

        // Hide progress after a delay
        setTimeout(() => {
            if (!aiProgressStatus.textContent.includes('Processing') && !aiProgressStatus.textContent.includes('...')) {
                aiProgressContainer.classList.add('hidden');
            }
        }, 5000);
    }

    async function callEnrich(postIds) {
        try {
            const response = await fetch('/api/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_ids: postIds })
            });
            const results = await response.json();
            console.log('Enrichment results:', results);
            await loadHistory();
        } catch (error) {
            console.error('Enrichment failed:', error);
            alert('Enrichment failed. Check console.');
        }
    }

    async function callAnnotate(postIds) {
        try {
            const response = await fetch('/api/annotate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_ids: postIds })
            });
            const result = await response.json();
            if (result.status === 'success') {
                alert('Uploaded successfully!');
                await loadHistory();
            } else {
                alert(`Upload failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed. Check console.');
        }
    }

    function updateSelectionUI() {
        const count = selectedPosts.size;
        selectedCountDisplay.textContent = count;

        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');

        if (count > 0) {
            selectionBar.classList.remove('hidden');

            // Contextual buttons for Dashboard
            if (activeTab === 'dashboard') {
                const selectedList = allPosts.filter(p => selectedPosts.has(p.post_id));
                const allPending = selectedList.every(p => !p.status || p.status === 'pending');
                const allEnriched = selectedList.every(p => p.status === 'enriched');

                enrichBtn.classList.toggle('hidden', !allPending);
                annotateBtn.classList.toggle('hidden', !allEnriched);
            } else {
                enrichBtn.classList.add('hidden');
                annotateBtn.classList.add('hidden');
            }
        } else {
            selectionBar.classList.add('hidden');
        }

        // Update all cards in the grid
        document.querySelectorAll('.card, .mini-card').forEach(card => {
            const postId = card.getAttribute('data-post-id');
            if (selectedPosts.has(postId)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    function togglePostSelection(postId, forceState = null) {
        if (forceState !== null) {
            if (forceState) selectedPosts.add(postId);
            else selectedPosts.delete(postId);
        } else {
            if (selectedPosts.has(postId)) {
                selectedPosts.delete(postId);
            } else {
                selectedPosts.add(postId);
            }
        }
        updateSelectionUI();
    }

    // Global drag handlers
    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.classList.remove('selecting');
        }
    });

    async function loadHistory() {
        try {
            const response = await fetch('/api/history');
            allPosts = await response.json();
            totalBadge.textContent = allPosts.length;

            const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
            if (activeTab === 'dashboard') {
                renderDashboard();
            } else {
                renderHistory();
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
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

        // Add clicks for mini cards
        [pendingList, enrichedList, completedList].forEach(list => {
            list.querySelectorAll('.mini-card').forEach(card => {
                const postId = card.getAttribute('data-post-id');

                // Checkbox toggle logic
                card.querySelector('.mini-select').addEventListener('mousedown', (e) => {
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

                // Mini card click for modal
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.mini-select')) return;
                    const post = allPosts.find(p => p.post_id === postId);
                    if (post) openPostModal(post);
                });
            });
        });

        // Select All handler
        document.querySelectorAll('.select-all-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.getAttribute('data-status');
                const postsInColumn = allPosts.filter(p => {
                    if (status === 'pending') return !p.status || p.status === 'pending';
                    return p.status === status;
                });

                // Check if all are already selected
                const allSelected = postsInColumn.every(p => selectedPosts.has(p.post_id));

                postsInColumn.forEach(p => {
                    if (allSelected) selectedPosts.delete(p.post_id);
                    else selectedPosts.add(p.post_id);
                });

                updateSelectionUI();
                btn.textContent = allSelected ? 'Select All' : 'Deselect All';
            });
        });

        // Select Next 100 handler
        const selectNext100Btn = document.getElementById('select-next-100-btn');
        if (selectNext100Btn) {
            selectNext100Btn.addEventListener('click', () => {
                const pendingPosts = allPosts.filter(p => !p.status || p.status === 'pending');
                const currentlySelected = Array.from(selectedPosts);

                // Filter out those already selected
                const remainingPending = pendingPosts.filter(p => !selectedPosts.has(p.post_id));

                // Select next 100
                const toSelect = remainingPending.slice(0, 100);
                toSelect.forEach(p => selectedPosts.add(p.post_id));

                updateSelectionUI();
            });
        }
    }

    function renderWorkflowColumn(posts) {
        if (posts.length === 0) return '<div class="status-message">Empty</div>';
        return posts.map(p => {
            const isSelected = selectedPosts.has(p.post_id);
            return `
                <div class="mini-card ${isSelected ? 'selected' : ''}" data-post-id="${p.post_id}">
                    <div class="mini-select"></div>
                    <img src="${p.image_path}" alt="Thumb">
                    <div class="mini-info">
                        <h4>@${p.username}</h4>
                        <p>${p.caption || 'No caption'}</p>
                    </div>
                </div>
            `;
        }).join('');
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
                                <button class="download-btn view-btn"><i class="fas fa-expand"></i></button>
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
                const post = allPosts.find(p => p.post_id === postId) || posts.find(p => p.post_id === postId);
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
});
