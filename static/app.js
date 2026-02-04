
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

    let allPosts = []; // Local cache for filtering

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
            }
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

    async function loadHistory() {
        try {
            const response = await fetch('/api/history');
            allPosts = await response.json();
            totalBadge.textContent = allPosts.length;
            renderHistory();
        } catch (error) {
            console.error('Failed to load history:', error);
        }
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
        if (!posts || posts.length === 0) return;

        const html = posts.map(post => `
            <div class="card glass" data-post-id="${post.post_id}">
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
        `).join('');

        container.innerHTML = html;

        // Add click listeners for modal
        container.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', (e) => {
                const postId = card.getAttribute('data-post-id');
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

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    closeModal.addEventListener('click', () => {
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
