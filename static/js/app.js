/**
 * BigQuery Release Notes Viewer & Tweet Sharer
 * Vanilla JavaScript implementation with UX Enhancements:
 * - Theme Switcher (Dark / Light Mode)
 * - Skeleton Screen Loaders
 * - Bookmarks / Favorites in localStorage
 * - Live Search Highlighting
 * - Twitter 280-char calculation with 23-char URL reservation
 * - CSV Export
 * - Keyboard Shortcuts & Scroll to Top
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let allUpdates = [];
    let currentFilteredUpdates = [];
    let selectedUpdateId = null;
    let currentCategory = 'ALL';
    let searchQuery = '';
    let isFetching = false;
    let lastCategories = [];
    let lastCategoryCounts = {};
    let favorites = new Set(JSON.parse(localStorage.getItem('bq_favorites') || '[]'));

    // DOM Elements
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIconSun = document.getElementById('themeIconSun');
    const themeIconMoon = document.getElementById('themeIconMoon');
    const themeToggleLabel = document.getElementById('themeToggleLabel');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
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
    const emptyStateTitle = document.getElementById('emptyStateTitle');
    const emptyStateDesc = document.getElementById('emptyStateDesc');
    const searchSuggestions = document.getElementById('searchSuggestions');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const statusAlert = document.getElementById('statusAlert');
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

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

    // Theme Toggle (Dark / Light Mode)
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeIconSun) themeIconSun.style.display = 'none';
            if (themeIconMoon) themeIconMoon.style.display = 'inline-block';
            if (themeToggleLabel) themeToggleLabel.textContent = 'Claro';
            if (themeToggleBtn) themeToggleBtn.title = 'Cambiar a modo claro';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeIconSun) themeIconSun.style.display = 'inline-block';
            if (themeIconMoon) themeIconMoon.style.display = 'none';
            if (themeToggleLabel) themeToggleLabel.textContent = 'Oscuro';
            if (themeToggleBtn) themeToggleBtn.title = 'Cambiar a modo oscuro';
        }
    }

    const savedTheme = localStorage.getItem('bq_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isCurrentDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const nextTheme = isCurrentDark ? 'light' : 'dark';
            applyTheme(nextTheme);
            localStorage.setItem('bq_theme', nextTheme);
            showToast(nextTheme === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado');
        });
    }

    // Skeleton Screen Loaders
    function renderSkeletons(count = 4) {
        cardsContainer.style.display = 'grid';
        emptyState.style.display = 'none';
        cardsContainer.innerHTML = Array.from({ length: count }, () => `
            <div class="skeleton-card" aria-hidden="true">
                <div class="skeleton-header">
                    <div class="skeleton-line skeleton-tag"></div>
                    <div class="skeleton-line skeleton-date"></div>
                </div>
                <div class="skeleton-body">
                    <div class="skeleton-line skeleton-text-lg"></div>
                    <div class="skeleton-line skeleton-text-md"></div>
                    <div class="skeleton-line skeleton-text-sm"></div>
                </div>
                <div class="skeleton-footer">
                    <div class="skeleton-line skeleton-btn"></div>
                    <div class="skeleton-line skeleton-btn"></div>
                </div>
            </div>
        `).join('');
    }

    // Set Refresh Button Loading State
    function setRefreshing(loading) {
        isFetching = loading;
        if (loading) {
            btnSpinner.style.display = 'inline-block';
            btnIcon.style.display = 'none';
            refreshBtnLabel.textContent = 'Actualizando...';
            refreshBtn.disabled = true;
            lastUpdatedText.textContent = 'Consultando feed oficial...';
            renderSkeletons(4);
        } else {
            btnSpinner.style.display = 'none';
            btnIcon.style.display = 'inline-block';
            refreshBtnLabel.textContent = 'Actualizar Notas';
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
                throw new Error(res.error || 'Error al obtener las notas de BigQuery');
            }

            const data = res.data;
            allUpdates = data.updates || [];
            lastCategories = data.categories || [];
            lastCategoryCounts = data.category_counts || {};

            // Update metadata
            const timeStr = data.fetched_at ? data.fetched_at : new Date().toLocaleTimeString();
            const sourceLabel = data.from_cache ? `Caché (${data.cache_age_sec}s)` : 'Feed en vivo';
            lastUpdatedText.textContent = `Actualizado: ${timeStr} · ${sourceLabel}`;

            if (data.warning) {
                statusAlert.className = 'alert alert-warning';
                statusAlert.textContent = data.warning;
                statusAlert.style.display = 'block';
            }

            // Render category filters
            renderCategoryFilters(lastCategories, lastCategoryCounts);

            // Render cards
            applyFilterAndRender();

            if (forceRefresh) {
                showToast(`¡Feed actualizado! ${allUpdates.length} novedades cargadas.`);
            }
        } catch (err) {
            console.error('Fetch error:', err);
            statusAlert.className = 'alert alert-error';
            statusAlert.textContent = `Error al cargar el feed: ${err.message}. Comprueba tu conexión y pulsa Actualizar.`;
            statusAlert.style.display = 'block';
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No se pudo obtener el feed de BigQuery</h3>
                    <p>${escapeHtml(err.message)}</p>
                    <button class="btn btn-primary" onclick="window.fetchNotes(true)">Reintentar</button>
                </div>
            `;
        } finally {
            setRefreshing(false);
        }
    }

    // Expose for inline retry button
    window.fetchNotes = (force) => fetchReleaseNotes(force);

    // Bookmarks / Favorites Management
    function toggleFavorite(id) {
        if (favorites.has(id)) {
            favorites.delete(id);
            showToast('Eliminada de favoritas');
        } else {
            favorites.add(id);
            showToast('Guardada en favoritas ⭐');
        }
        localStorage.setItem('bq_favorites', JSON.stringify([...favorites]));
        updateFavoriteButtonStates();
        renderCategoryFilters(lastCategories, lastCategoryCounts);
        if (currentCategory === 'FAVORITES') {
            applyFilterAndRender();
        }
    }

    function updateFavoriteButtonStates() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            const id = btn.getAttribute('data-id');
            const isFav = favorites.has(id);
            if (isFav) {
                btn.classList.add('favorited');
                btn.title = 'Quitar de favoritos';
                const svg = btn.querySelector('svg');
                if (svg) svg.setAttribute('fill', 'currentColor');
            } else {
                btn.classList.remove('favorited');
                btn.title = 'Guardar en favoritos';
                const svg = btn.querySelector('svg');
                if (svg) svg.setAttribute('fill', 'none');
            }
        });
    }

    // Render category filter buttons
    function renderCategoryFilters(categories, categoryCounts) {
        categoryFilters.innerHTML = '';

        // All updates pill
        const allBtn = document.createElement('button');
        allBtn.className = `pill ${currentCategory === 'ALL' ? 'active' : ''}`;
        allBtn.textContent = `Todas (${allUpdates.length})`;
        allBtn.addEventListener('click', () => {
            currentCategory = 'ALL';
            updateActivePill();
            applyFilterAndRender();
        });
        categoryFilters.appendChild(allBtn);

        // Favorites pill
        const favCount = allUpdates.filter(u => favorites.has(u.id)).length;
        const favBtn = document.createElement('button');
        favBtn.className = `pill ${currentCategory === 'FAVORITES' ? 'active' : ''}`;
        favBtn.textContent = `⭐ Guardadas (${favCount})`;
        favBtn.addEventListener('click', () => {
            currentCategory = 'FAVORITES';
            updateActivePill();
            applyFilterAndRender();
        });
        categoryFilters.appendChild(favBtn);

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
            let matches = false;
            if (currentCategory === 'ALL' && pill.textContent.startsWith('Todas')) matches = true;
            else if (currentCategory === 'FAVORITES' && pill.textContent.startsWith('⭐ Guardadas')) matches = true;
            else if (pill.textContent.startsWith(currentCategory)) matches = true;

            if (matches) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
    }

    // Highlight Matching Keywords
    function highlightMatches(htmlOrText, query) {
        if (!query) return htmlOrText;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Matches query only when not inside an HTML tag
        const regex = new RegExp(`(?![^<]*>)(${escaped})`, 'gi');
        return htmlOrText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    // Apply Filter and Render Cards
    function applyFilterAndRender() {
        const query = searchQuery.trim().toLowerCase();

        const filtered = allUpdates.filter(item => {
            // Category check
            if (currentCategory === 'FAVORITES') {
                if (!favorites.has(item.id)) return false;
            } else if (currentCategory !== 'ALL') {
                if (item.category !== currentCategory) return false;
            }

            // Search query check
            if (!query) return true;
            return (
                (item.date && item.date.toLowerCase().includes(query)) ||
                (item.category && item.category.toLowerCase().includes(query)) ||
                (item.plain_text && item.plain_text.toLowerCase().includes(query))
            );
        });

        currentFilteredUpdates = filtered;

        // Update stats
        const total = allUpdates.length;
        if (currentCategory === 'FAVORITES') {
            statsBadge.textContent = `Mostrando ${filtered.length} de ${favorites.size} guardadas`;
        } else {
            statsBadge.textContent = `Mostrando ${filtered.length} de ${total} novedades`;
        }

        if (filtered.length === 0) {
            cardsContainer.style.display = 'none';
            emptyState.style.display = 'block';

            if (currentCategory === 'FAVORITES') {
                emptyStateTitle.textContent = 'No tienes novedades guardadas';
                emptyStateDesc.textContent = 'Haz clic en la estrella ⭐ de cualquier tarjeta para guardarla en esta lista.';
                searchSuggestions.style.display = 'none';
            } else {
                emptyStateTitle.textContent = 'No se encontraron novedades para tu búsqueda';
                emptyStateDesc.textContent = query 
                    ? `No hay coincidencias para "${query}". Prueba con una sugerencia:`
                    : 'Prueba buscando otros términos o restablece los filtros:';
                searchSuggestions.style.display = 'flex';
            }
            return;
        }

        cardsContainer.style.display = 'grid';
        emptyState.style.display = 'none';
        cardsContainer.innerHTML = '';

        filtered.forEach(item => {
            const isSelected = item.id === selectedUpdateId;
            const isFav = favorites.has(item.id);
            const card = document.createElement('article');
            card.className = `card ${isSelected ? 'selected' : ''}`;
            card.id = `card-${item.id}`;

            const catClass = getCategoryClass(item.category);
            const contentHtml = query ? highlightMatches(item.content_html, query) : item.content_html;
            const dateText = query ? highlightMatches(escapeHtml(item.date), query) : escapeHtml(item.date);

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-meta">
                        <span class="category-tag ${catClass}">${escapeHtml(item.category)}</span>
                        <span class="card-date">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            ${dateText}
                        </span>
                    </div>
                    <div class="card-actions-right">
                        <button class="favorite-btn ${isFav ? 'favorited' : ''}" data-action="toggle-favorite" data-id="${item.id}" title="${isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}" aria-label="Guardar en favoritos">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                        </button>
                        <button class="card-select-btn" data-action="toggle-select" data-id="${item.id}" title="${isSelected ? 'Deseleccionar esta novedad' : 'Seleccionar esta novedad'}">
                            <span>${isSelected ? '✓ Seleccionada' : '○ Seleccionar'}</span>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    ${contentHtml}
                </div>
                <div class="card-footer">
                    <div class="card-action-links">
                        <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="link-btn" title="Ver en documentación oficial de Google Cloud">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            Doc Oficial
                        </a>
                        <button class="link-btn copy-card-btn" data-action="copy-card" data-id="${item.id}" title="Copiar al portapapeles">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            <span class="copy-card-label">Copiar al portapapeles</span>
                        </button>
                    </div>
                    <button class="btn btn-tweet" data-action="tweet-card" data-id="${item.id}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span>Twittear Novedad</span>
                    </button>
                </div>
            `;

            // Event delegation on card
            card.addEventListener('click', (e) => {
                const tweetBtn = e.target.closest('[data-action="tweet-card"]');
                const selectBtn = e.target.closest('[data-action="toggle-select"]');
                const favBtn = e.target.closest('[data-action="toggle-favorite"]');
                const copyBtn = e.target.closest('[data-action="copy-card"]');
                const anchor = e.target.closest('a');

                if (anchor) return; // Allow normal link navigation

                if (tweetBtn) {
                    e.stopPropagation();
                    selectUpdate(item.id);
                    openTweetModal(item);
                } else if (favBtn) {
                    e.stopPropagation();
                    toggleFavorite(item.id);
                } else if (selectBtn) {
                    e.stopPropagation();
                    toggleSelect(item.id);
                } else if (copyBtn) {
                    e.stopPropagation();
                    const formattedText = `[${item.category}] ${item.date}\n${item.plain_text}\n${item.link}`;
                    navigator.clipboard.writeText(formattedText).then(() => {
                        const label = copyBtn.querySelector('.copy-card-label');
                        if (label) {
                            const originalLabel = label.textContent;
                            label.textContent = '¡Copiado!';
                            copyBtn.classList.add('copied');
                            setTimeout(() => {
                                label.textContent = originalLabel;
                                copyBtn.classList.remove('copied');
                            }, 2000);
                        }
                        showToast('Nota copiada al portapapeles');
                    }).catch(err => {
                        console.error('Clipboard error:', err);
                        showToast('Error al copiar al portapapeles');
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
                if (selectBtn) selectBtn.textContent = '✓ Seleccionada';
            } else {
                card.classList.remove('selected');
                if (selectBtn) selectBtn.textContent = '○ Seleccionar';
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

        selectionCount.textContent = '1 novedad seleccionada';
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

    // Twitter 280-char calculation (counting URLs as 23 chars per Twitter specification)
    function calculateTwitterLength(text) {
        if (!text) return 0;
        const urlRegex = /https?:\/\/[^\s]+/g;
        const normalized = text.replace(urlRegex, 'x'.repeat(23));
        return normalized.length;
    }

    function updateCharCount() {
        const text = tweetTextArea.value;
        const count = calculateTwitterLength(text);
        charCountBadge.textContent = `${count} / 280`;

        charCountBadge.className = 'char-badge';
        if (count > 280) {
            charCountBadge.classList.add('danger');
        } else if (count > 260) {
            charCountBadge.classList.add('warning');
        }
    }

    tweetTextArea.addEventListener('input', updateCharCount);

    // Launch Tweet on Twitter / X
    function launchTweet() {
        const text = tweetTextArea.value.trim();
        if (!text) {
            showToast('Por favor escribe texto en la publicación.');
            return;
        }

        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(intentUrl, '_blank', 'noopener,noreferrer,width=600,height=450');
        showToast('¡Compositor de X (Twitter) abierto!');
    }

    // Copy Tweet to Clipboard
    copyTweetBtn.addEventListener('click', () => {
        const text = tweetTextArea.value;
        navigator.clipboard.writeText(text).then(() => {
            copyBtnLabel.textContent = '¡Copiado!';
            showToast('Borrador copiado al portapapeles');
            setTimeout(() => {
                copyBtnLabel.textContent = 'Copiar Texto';
            }, 2000);
        }).catch(err => {
            console.error('Clipboard error:', err);
            showToast('Error al copiar al portapapeles');
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

    // Search Box & Debounce
    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            applyFilterAndRender();
        }, 150);
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

    // Suggestion Chips in Empty State
    if (searchSuggestions) {
        searchSuggestions.addEventListener('click', (e) => {
            const chip = e.target.closest('.suggestion-chip');
            if (chip) {
                const term = chip.getAttribute('data-search');
                if (term) {
                    searchInput.value = term;
                    searchQuery = term;
                    clearSearchBtn.style.display = 'block';
                    currentCategory = 'ALL';
                    updateActivePill();
                    applyFilterAndRender();
                    searchInput.focus();
                }
            }
        });
    }

    // Export to CSV
    function exportToCsv() {
        const listToExport = (currentFilteredUpdates && currentFilteredUpdates.length > 0) ? currentFilteredUpdates : allUpdates;
        if (!listToExport || listToExport.length === 0) {
            showToast('No hay notas disponibles para exportar.');
            return;
        }

        const headers = ['ID', 'Fecha', 'Categoria', 'Descripcion', 'Enlace Oficial', 'Borrador Tweet'];
        const rows = listToExport.map(item => [
            item.id || '',
            item.date || '',
            item.category || '',
            (item.plain_text || '').replace(/\r?\n|\r/g, ' '),
            item.link || '',
            (item.tweet_draft || '').replace(/\r?\n|\r/g, ' ')
        ]);

        const escapeCsvField = (val) => {
            const stringVal = String(val);
            return `"${stringVal.replace(/"/g, '""')}"`;
        };

        const csvContent = [
            headers.map(escapeCsvField).join(','),
            ...rows.map(row => row.map(escapeCsvField).join(','))
        ].join('\r\n');

        // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        const today = new Date().toISOString().split('T')[0];
        downloadAnchor.href = url;
        downloadAnchor.download = `bigquery-release-notes-${today}.csv`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(url);

        showToast(`Exportado a CSV exitosamente (${listToExport.length} notas)`);
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportToCsv);
    }

    // Scroll to Top Floating Button
    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopBtn.classList.add('show');
            } else {
                scrollToTopBtn.classList.remove('show');
            }
        });
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (tweetModal.classList.contains('show')) {
                closeTweetModal();
            } else if (searchInput.value) {
                searchInput.value = '';
                searchQuery = '';
                clearSearchBtn.style.display = 'none';
                applyFilterAndRender();
            } else if (selectedUpdateId) {
                selectedUpdateId = null;
                updateCardSelectionStates();
                updateSelectionBar();
            }
        } else if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== tweetTextArea) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
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
