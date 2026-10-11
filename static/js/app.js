/**
 * BigQuery Release Notes Viewer & Tweet Sharer
 * Vanilla JavaScript implementation
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let allUpdates = [];
    let selectedUpdateId = null;
    let currentCategory = 'ALL';
    let searchQuery = '';
    let isFetching = false;

    // DOM Elements
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshBtnLabel = document.getElementById('refreshBtnLabel');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnIcon = document.getElementById('btnIcon');
    const lastUpdatedText = document.getElementById('lastUpdatedText');
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const categoryFilters = document.getElementById('categoryFilters');
    const statsBadge = document.getElementById('statsBadge');
    const cardsContainer = document.getElementById('cardsContainer');
    const emptyState = document.getElementById('emptyState');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const statusAlert = document.getElementById('statusAlert');
    
    // Selection Bar Elements
    const selectionBar = document.getElementById('selectionBar');
    const selectionCount = document.getElementById('selectionCount');
    const selectionTitlePreview = document.getElementById('selectionTitlePreview');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    const tweetSelectedBtn = document.getElementById('tweetSelectedBtn');

    // Tweet Modal Elements
    const tweetModal = document.getElementById('tweetModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const modalUpdateContext = document.getElementById('modalUpdateContext');
    const tweetTextArea = document.getElementById('tweetTextArea');
    const charCountBadge = document.getElementById('charCountBadge');
    const copyTweetBtn = document.getElementById('copyTweetBtn');
    const copyBtnLabel = document.getElementById('copyBtnLabel');
    const launchTweetBtn = document.getElementById('launchTweetBtn');
    const toast = document.getElementById('toast');

    // Category styling mapping
    function getCategoryClass(category) {
        const cat = (category || '').toLowerCase();
        if (cat.includes('feature')) return 'cat-feature';
        if (cat.includes('change')) return 'cat-change';
        if (cat.includes('security')) return 'cat-security';
        if (cat.includes('announcement')) return 'cat-announcement';
        if (cat.includes('deprecated')) return 'cat-deprecated';
        if (cat.includes('fixed')) return 'cat-fixed';
        return 'cat-default';
    }

    // Toast Notification
    let toastTimeout = null;
    function showToast(message) {
        if (toastTimeout) clearTimeout(toastTimeout);
        toast.textContent = message;
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2800);
    }

    // Set Refresh Button Loading State
    function setRefreshing(loading) {
        isFetching = loading;
        if (loading) {
            btnSpinner.style.display = 'inline-block';
            btnIcon.style.display = 'none';
            refreshBtnLabel.textContent = 'Refreshing...';
            refreshBtn.disabled = true;
            lastUpdatedText.textContent = 'Fetching latest feed...';
        } else {
            btnSpinner.style.display = 'none';
            btnIcon.style.display = 'inline-block';
            refreshBtnLabel.textContent = 'Refresh Notes';
            refreshBtn.disabled = false;
        }
    }

    // Fetch Feed Data
    async function fetchReleaseNotes(forceRefresh = false) {
        if (isFetching) return;
        setRefreshing(true);
        statusAlert.style.display = 'none';

        try {
            const url = forceRefresh ? '/api/notes?refresh=1' : '/api/notes';
            const response = await fetch(url);
            const res = await response.json();

            if (!res.success) {
                throw new Error(res.error || 'Failed to load BigQuery release notes');
            }

            const data = res.data;
            allUpdates = data.updates || [];
            
            // Update metadata
            const timeStr = data.fetched_at ? data.fetched_at : new Date().toLocaleTimeString();
            const sourceLabel = data.from_cache ? `Cached (${data.cache_age_sec}s ago)` : 'Live Feed';
            lastUpdatedText.textContent = `Updated: ${timeStr} · ${sourceLabel}`;

            if (data.warning) {
                statusAlert.className = 'alert alert-warning';
                statusAlert.textContent = data.warning;
                statusAlert.style.display = 'block';
            }

            // Render category filters
            renderCategoryFilters(data.categories || [], data.category_counts || {});

            // Render cards
            applyFilterAndRender();

            if (forceRefresh) {
                showToast(`Refreshed! Loaded ${allUpdates.length} updates.`);
            }
        } catch (err) {
            console.error('Fetch error:', err);
            statusAlert.className = 'alert alert-error';
            statusAlert.textContent = `Error loading feed: ${err.message}. Please check connection and click Refresh.`;
            statusAlert.style.display = 'block';
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Unable to fetch BigQuery feed</h3>
                    <p>${err.message}</p>
                    <button class="btn btn-primary" onclick="window.fetchNotes(true)">Try Again</button>
                </div>
            `;
        } finally {
            setRefreshing(false);
        }
    }

    // Expose for inline retry button
    window.fetchNotes = (force) => fetchReleaseNotes(force);

    // Render category filter buttons
    function renderCategoryFilters(categories, categoryCounts) {
        categoryFilters.innerHTML = '';

        // All pill
        const allBtn = document.createElement('button');
        allBtn.className = `pill ${currentCategory === 'ALL' ? 'active' : ''}`;
        allBtn.textContent = `All Updates (${allUpdates.length})`;
        allBtn.addEventListener('click', () => {
            currentCategory = 'ALL';
            updateActivePill();
            applyFilterAndRender();
        });
        categoryFilters.appendChild(allBtn);

        // Individual category pills
        categories.forEach(cat => {
            const count = categoryCounts[cat] || 0;
            const btn = document.createElement('button');
            btn.className = `pill ${currentCategory === cat ? 'active' : ''}`;
            btn.textContent = `${cat} (${count})`;
            btn.addEventListener('click', () => {
                currentCategory = cat;
                updateActivePill();
                applyFilterAndRender();
            });
            categoryFilters.appendChild(btn);
        });
    }

    function updateActivePill() {
        const pills = categoryFilters.querySelectorAll('.pill');
        pills.forEach(pill => {
            if (pill.textContent.startsWith(currentCategory === 'ALL' ? 'All Updates' : currentCategory)) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
    }

    // Apply Filter and Render Cards
    function applyFilterAndRender() {
        const query = searchQuery.trim().toLowerCase();

        const filtered = allUpdates.filter(item => {
            // Category check
            const matchesCategory = (currentCategory === 'ALL') || (item.category === currentCategory);
            if (!matchesCategory) return false;

            // Search query check
            if (!query) return true;
            return (
                (item.date && item.date.toLowerCase().includes(query)) ||
                (item.category && item.category.toLowerCase().includes(query)) ||
                (item.plain_text && item.plain_text.toLowerCase().includes(query))
            );
        });

        // Update stats
        statsBadge.textContent = `Showing ${filtered.length} of ${allUpdates.length} updates`;

        if (filtered.length === 0) {
            cardsContainer.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        cardsContainer.style.display = 'grid';
        emptyState.style.display = 'none';
        cardsContainer.innerHTML = '';

        filtered.forEach(item => {
            const isSelected = item.id === selectedUpdateId;
            const card = document.createElement('article');
            card.className = `card ${isSelected ? 'selected' : ''}`;
            card.id = `card-${item.id}`;

            const catClass = getCategoryClass(item.category);

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-meta">
                        <span class="category-tag ${catClass}">${escapeHtml(item.category)}</span>
                        <span class="card-date">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            ${escapeHtml(item.date)}
                        </span>
                    </div>
                    <button class="card-select-btn" data-action="toggle-select" data-id="${item.id}" title="${isSelected ? 'Deselect this update' : 'Select this update'}">
                        <span>${isSelected ? '✓ Selected' : '○ Select'}</span>
                    </button>
                </div>
                <div class="card-content">
                    ${item.content_html}
                </div>
                <div class="card-footer">
                    <div class="card-action-links">
                        <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="link-btn" title="View in Google Cloud official documentation">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            Official Docs
                        </a>
                        <button class="link-btn" data-action="copy-summary" data-id="${item.id}" title="Copy summary to clipboard">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Copy Text
                        </button>
                    </div>
                    <button class="btn btn-tweet" data-action="tweet-card" data-id="${item.id}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span>Tweet Update</span>
                    </button>
                </div>
            `;

            // Event delegation on card
            card.addEventListener('click', (e) => {
                const tweetBtn = e.target.closest('[data-action="tweet-card"]');
                const selectBtn = e.target.closest('[data-action="toggle-select"]');
                const copyBtn = e.target.closest('[data-action="copy-summary"]');
                const anchor = e.target.closest('a');

                if (anchor) return; // Allow normal link navigation

                if (tweetBtn) {
                    e.stopPropagation();
                    selectUpdate(item.id);
                    openTweetModal(item);
                } else if (selectBtn) {
                    e.stopPropagation();
                    toggleSelect(item.id);
                } else if (copyBtn) {
                    e.stopPropagation();
                    navigator.clipboard.writeText(item.plain_text).then(() => {
                        showToast('Update text copied to clipboard!');
                    });
                } else {
                    // Clicking on card selects it
                    toggleSelect(item.id);
                }
            });

            cardsContainer.appendChild(card);
        });

        updateSelectionBar();
    }

    // Toggle Selection of an Update
    function toggleSelect(id) {
        if (selectedUpdateId === id) {
            selectedUpdateId = null;
        } else {
            selectedUpdateId = id;
        }
        updateCardSelectionStates();
        updateSelectionBar();
    }

    function selectUpdate(id) {
        selectedUpdateId = id;
        updateCardSelectionStates();
        updateSelectionBar();
    }

    function updateCardSelectionStates() {
        document.querySelectorAll('.card').forEach(card => {
            const cardId = card.id.replace('card-', '');
            const selectBtn = card.querySelector('[data-action="toggle-select"] span');
            if (cardId === selectedUpdateId) {
                card.classList.add('selected');
                if (selectBtn) selectBtn.textContent = '✓ Selected';
            } else {
                card.classList.remove('selected');
                if (selectBtn) selectBtn.textContent = '○ Select';
            }
        });
    }

    function updateSelectionBar() {
        if (!selectedUpdateId) {
            selectionBar.classList.remove('visible');
            return;
        }

        const selectedItem = allUpdates.find(item => item.id === selectedUpdateId);
        if (!selectedItem) {
            selectionBar.classList.remove('visible');
            return;
        }

        selectionCount.textContent = '1 update selected';
        selectionTitlePreview.textContent = `${selectedItem.date} · [${selectedItem.category}] ${selectedItem.plain_text}`;
        selectionBar.classList.add('visible');
    }

    // Tweet Modal Handlers
    function openTweetModal(item) {
        if (!item) return;

        modalUpdateContext.innerHTML = `
            <div class="update-context-header">
                <span class="category-tag ${getCategoryClass(item.category)}">${escapeHtml(item.category)}</span>
                <span class="update-context-date">${escapeHtml(item.date)}</span>
            </div>
            <div class="update-context-text">${escapeHtml(item.plain_text)}</div>
        `;

        tweetTextArea.value = item.tweet_draft || '';
        updateCharCount();

        tweetModal.setAttribute('aria-hidden', 'false');
        tweetModal.classList.add('show');
        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            tweetTextArea.focus();
        }, 100);
    }

    function closeTweetModal() {
        tweetModal.setAttribute('aria-hidden', 'true');
        tweetModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function updateCharCount() {
        const text = tweetTextArea.value;
        const count = text.length;
        charCountBadge.textContent = `${count} / 280`;

        charCountBadge.className = 'char-badge';
        if (count > 280) {
            charCountBadge.classList.add('danger');
        } else if (count > 250) {
            charCountBadge.classList.add('warning');
        }
    }

    tweetTextArea.addEventListener('input', updateCharCount);

    // Launch Tweet on Twitter / X
    function launchTweet() {
        const text = tweetTextArea.value.trim();
        if (!text) {
            showToast('Please enter tweet text first.');
            return;
        }

        // Twitter Web Intent URL
        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(intentUrl, '_blank', 'noopener,noreferrer,width=600,height=450');
        showToast('Opened Twitter / X composer!');
    }

    // Copy Tweet to Clipboard
    copyTweetBtn.addEventListener('click', () => {
        const text = tweetTextArea.value;
        navigator.clipboard.writeText(text).then(() => {
            copyBtnLabel.textContent = 'Copied!';
            showToast('Tweet draft copied to clipboard!');
            setTimeout(() => {
                copyBtnLabel.textContent = 'Copy Text';
            }, 2000);
        }).catch(err => {
            console.error('Clipboard error:', err);
            showToast('Failed to copy to clipboard.');
        });
    });

    launchTweetBtn.addEventListener('click', launchTweet);

    closeModalBtn.addEventListener('click', closeTweetModal);
    cancelModalBtn.addEventListener('click', closeTweetModal);
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeTweetModal();
        }
    });

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && tweetModal.classList.contains('show')) {
            closeTweetModal();
        }
    });

    // Refresh Button Click
    refreshBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Selection Bar Actions
    clearSelectionBtn.addEventListener('click', () => {
        selectedUpdateId = null;
        updateCardSelectionStates();
        updateSelectionBar();
    });

    tweetSelectedBtn.addEventListener('click', () => {
        if (selectedUpdateId) {
            const item = allUpdates.find(u => u.id === selectedUpdateId);
            if (item) openTweetModal(item);
        }
    });

    // Search Box
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
        applyFilterAndRender();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        applyFilterAndRender();
    });

    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        currentCategory = 'ALL';
        updateActivePill();
        applyFilterAndRender();
    });

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Initial load
    fetchReleaseNotes(false);
});
