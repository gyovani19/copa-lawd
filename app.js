// Copa LAWD Sticker Album Core Logic

document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let currentUser = '';
    let inventory = {}; // { id: count }
    let lastOpenedPackTime = null; // timestamp
    let claimedCheckpoints = [];
    let activeTab = 'album';
    let currentRevealCards = []; // temporarily holds cards being revealed
    let flippedCount = 0;

    // DOM Elements
    const profileModal = document.getElementById('profile-modal');
    const profileForm = document.getElementById('profile-form');
    const userNameInput = document.getElementById('user-name');
    
    const appWrapper = document.getElementById('app-wrapper');
    const userNameDisplay = document.getElementById('user-name-display');
    const headerAvatar = document.getElementById('header-avatar');
    
    const statsProgressText = document.getElementById('stats-progress-text');
    const statsProgressPercent = document.getElementById('stats-progress-percent');
    const statsProgressBar = document.getElementById('stats-progress-bar');
    
    const packStatusText = document.getElementById('pack-status-text');
    const countdownTimer = document.getElementById('countdown-timer');
    
    const tabBtns = document.querySelectorAll('.nav-tabs .tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    const albumGrid = document.getElementById('album-grid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    const packClaimView = document.getElementById('pack-claim-view');
    const packRevealView = document.getElementById('pack-reveal-view');
    const boosterPack = document.getElementById('booster-pack');
    const btnOpenPack = document.getElementById('btn-open-pack');
    const cardsRevealGrid = document.getElementById('cards-reveal-grid');
    const revealActions = document.getElementById('reveal-actions');
    const btnCollectAll = document.getElementById('btn-collect-all');
    
    // Swipe elements inside the pack
    const swipeContainer = document.getElementById('tear-line-container');
    const swipeTrack = document.getElementById('booster-pack');
    const swipeHandle = document.getElementById('pack-tear-handle');
    const swipeTextLabel = document.getElementById('pack-drag-instruction');
    
    let isDragging = false;
    let startX = 0;
    let maxDrag = 0;
    
    const editProfileForm = document.getElementById('edit-profile-form');
    const editUserNameInput = document.getElementById('edit-user-name');
    const btnExportJson = document.getElementById('btn-export-json');
    const importJsonInput = document.getElementById('import-json-input');
    const btnResetAlbum = document.getElementById('btn-reset-album');
    
    const cardModal = document.getElementById('card-modal');
    const cardDetailLayout = document.getElementById('card-detail-layout');
    const btnCloseModal = document.getElementById('btn-close-modal');

    // Init App
    init();

    function init() {
        // Check if user profile exists
        const savedUser = localStorage.getItem('copa-lawd-username');
        if (savedUser) {
            loginUser(savedUser);
        } else {
            // Show setup modal
            profileModal.classList.add('active');
            appWrapper.classList.add('hidden');
        }

        // Setup Event Listeners
        profileForm.addEventListener('submit', handleProfileSetup);
        editProfileForm.addEventListener('submit', handleProfileEdit);
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderAlbum(btn.dataset.filter);
            });
        });

        // Remove direct click pack opening, trigger hint on click instead
        boosterPack.addEventListener('click', () => {
            const { lastRelease } = getDailyReleaseThresholds();
            const isPackAvailable = !lastOpenedPackTime || (lastOpenedPackTime < lastRelease.getTime());
            if (isPackAvailable) {
                boosterPack.classList.add('shaking');
                setTimeout(() => boosterPack.classList.remove('shaking'), 500);
            }
        });
        
        btnOpenPack.addEventListener('click', triggerPackOpening);
        btnCollectAll.addEventListener('click', saveRevealedCardsToInventory);
        
        // Swipe listeners
        if (swipeHandle) {
            swipeHandle.addEventListener('mousedown', startDrag);
            swipeHandle.addEventListener('touchstart', startDrag, { passive: true });
        }
        
        btnExportJson.addEventListener('click', exportCollection);
        importJsonInput.addEventListener('change', importCollection);
        btnResetAlbum.addEventListener('click', resetAlbum);
        
        btnCloseModal.addEventListener('click', () => cardModal.classList.remove('active'));
        cardModal.addEventListener('click', (e) => {
            if (e.target === cardModal) cardModal.classList.remove('active');
        });

        // Start countdown timer updates
        setInterval(updatePackStatus, 1000);
    }

    // Drag / Swipe handlers
    function startDrag(e) {
        const { lastRelease } = getDailyReleaseThresholds();
        const isPackAvailable = !lastOpenedPackTime || (lastOpenedPackTime < lastRelease.getTime());
        if (!isPackAvailable) return;
        
        isDragging = true;
        startX = e.clientX || e.touches[0].clientX;
        maxDrag = swipeTrack.clientWidth - swipeHandle.clientWidth - 8; // margins offset
        
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
        
        swipeHandle.style.transition = 'none';
    }
    
    function dragMove(e) {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();
        
        const currentX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : startX);
        let diffX = currentX - startX;
        
        if (diffX < 0) diffX = 0;
        if (diffX > maxDrag) diffX = maxDrag;
        
        swipeHandle.style.left = `${diffX + 4}px`;
        
        // As you drag, booster pack scales and shakes slightly
        const progress = diffX / maxDrag;
        boosterPack.style.transform = `scale(${1 + progress * 0.04}) rotate(${progress * 2}deg)`;
        
        if (progress >= 0.99) {
            triggerSwipeUnlock();
        }
    }
    
    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('touchmove', dragMove);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);
        
        // Reset positioning
        swipeHandle.style.transition = 'left 0.3s ease';
        swipeHandle.style.left = '4px';
        boosterPack.style.transform = 'none';
    }
    
    function triggerSwipeUnlock() {
        endDrag();
        triggerPackOpening();
    }

    // Login Setup
    function loginUser(username) {
        currentUser = username;
        localStorage.setItem('copa-lawd-username', username);
        
        // Load Inventory
        const savedInventory = localStorage.getItem(`copa-lawd-inventory:${username}`);
        inventory = savedInventory ? JSON.parse(savedInventory) : {};
        
        // Load last pack claim timestamp
        const savedTime = localStorage.getItem(`copa-lawd-last-pack:${username}`);
        lastOpenedPackTime = savedTime ? parseInt(savedTime, 10) : null;

        // Load claimed checkpoints
        const savedClaimed = localStorage.getItem(`copa-lawd-claimed:${username}`);
        if (savedClaimed) {
            claimedCheckpoints = JSON.parse(savedClaimed);
        } else {
            claimedCheckpoints = [];
            if (lastOpenedPackTime) {
                // Legacy compatibility migration
                const lastDate = new Date(lastOpenedPackTime);
                const dateStr = formatDateString(lastDate);
                const hour = lastDate.getHours();
                if (hour >= 19) {
                    claimedCheckpoints.push(`${dateStr}-12`);
                    claimedCheckpoints.push(`${dateStr}-19`);
                } else if (hour >= 12) {
                    claimedCheckpoints.push(`${dateStr}-12`);
                }
                localStorage.setItem(`copa-lawd-claimed:${username}`, JSON.stringify(claimedCheckpoints));
            }
        }

        // Setup display
        userNameDisplay.textContent = username;
        
        // Initials for avatar
        const parts = username.split(' ');
        const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
        headerAvatar.textContent = initials;
        editUserNameInput.value = username;

        // Hide overlay, show app
        profileModal.classList.remove('active');
        appWrapper.classList.remove('hidden');

        // Render initial view
        updateStats();
        renderAlbum('all');
        updatePackStatus();

        // Default to packs tab if today's pack is available
        const activeCheckpoints = getReleaseCheckpoints();
        const unclaimed = activeCheckpoints.filter(cp => !claimedCheckpoints.includes(cp.id));
        const isPackAvailable = unclaimed.length > 0;
        if (isPackAvailable) {
            switchTab('packs');
        } else {
            switchTab('album');
        }
    }

    function handleProfileSetup(e) {
        e.preventDefault();
        const rawName = userNameInput.value.trim();
        const parts = rawName.split(/\s+/).filter(Boolean);
        
        if (parts.length < 2) {
            alert('Por favor, insira pelo menos dois nomes (ex: Gyovani Santos).');
            return;
        }
        
        const configuredName = `${parts[0]} ${parts[1]}`;
        loginUser(configuredName);
    }

    function handleProfileEdit(e) {
        e.preventDefault();
        const rawName = editUserNameInput.value.trim();
        const parts = rawName.split(/\s+/).filter(Boolean);
        
        if (parts.length < 2) {
            alert('Por favor, insira pelo menos dois nomes.');
            return;
        }
        
        const newName = `${parts[0]} ${parts[1]}`;
        if (newName === currentUser) return;

        // Migrate storage key to new name if needed
        const prevInventory = localStorage.getItem(`copa-lawd-inventory:${currentUser}`);
        const prevTime = localStorage.getItem(`copa-lawd-last-pack:${currentUser}`);
        
        if (prevInventory) {
            localStorage.setItem(`copa-lawd-inventory:${newName}`, prevInventory);
            localStorage.removeItem(`copa-lawd-inventory:${currentUser}`);
        }
        if (prevTime) {
            localStorage.setItem(`copa-lawd-last-pack:${newName}`, prevTime);
            localStorage.removeItem(`copa-lawd-last-pack:${currentUser}`);
        }

        loginUser(newName);
        alert('Perfil atualizado com sucesso!');
    }

    // Switch View Tabs
    function switchTab(tabId) {
        activeTab = tabId;
        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });

        if (tabId === 'album') {
            renderAlbum(document.querySelector('.filter-btn.active').dataset.filter);
        }
    }

    // Calc Album Stats
    function updateStats() {
        const totalStickers = MEMBROS.length;
        let ownedCount = 0;
        
        MEMBROS.forEach(m => {
            if (inventory[m.id] > 0) {
                ownedCount++;
            }
        });

        const percent = totalStickers > 0 ? Math.round((ownedCount / totalStickers) * 100) : 0;
        
        statsProgressText.textContent = `${ownedCount}/${totalStickers}`;
        statsProgressPercent.textContent = `${percent}%`;
        statsProgressBar.style.width = `${percent}%`;
    }

    // Render Album Grid
    function renderAlbum(filter = 'all') {
        albumGrid.innerHTML = '';
        
        MEMBROS.forEach(member => {
            const isSuperShiny = ['presidente', 'vice-presidente'].includes(member.status.toLowerCase());
            const isShiny = ['diretor'].includes(member.status.toLowerCase());
            const count = inventory[member.id] || 0;
            const isUnlocked = count > 0;
            
            // Check filters
            if (filter === 'unlocked' && !isUnlocked) return;
            if (filter === 'locked' && isUnlocked) return;
            
            const isDiretoria = ['presidente', 'vice-presidente', 'diretor'].includes(member.status.toLowerCase());
            if (filter === 'diretoria' && (!isDiretoria || member.category !== 'membro')) return;
            if (filter === 'membros' && (isDiretoria || member.category !== 'membro')) return;
            if (filter === 'eventos' && member.category !== 'evento') return;
            if (filter === 'lugares' && member.category !== 'lugar') return;

            // Create card element
            const card = document.createElement('div');
            card.className = `sticker-card ${isUnlocked ? '' : 'locked'} ${isSuperShiny ? 'super-shiny' : (isShiny ? 'shiny' : '')} ${member.isRectangular ? 'rectangular' : ''}`;
            card.dataset.id = member.id;
            
            // Number badge
            const numBadge = document.createElement('span');
            numBadge.className = 'sticker-number';
            numBadge.textContent = `Nº ${member.id.toString().padStart(2, '0')}`;
            card.appendChild(numBadge);

            // Shiny/Legendary badge
            if (isSuperShiny) {
                const shinyBadge = document.createElement('span');
                shinyBadge.className = 'sticker-shiny-badge';
                shinyBadge.style.background = 'linear-gradient(135deg, #ff007f, #7928ca)';
                shinyBadge.style.color = '#fff';
                shinyBadge.textContent = 'Lendário';
                card.appendChild(shinyBadge);
            } else if (isShiny) {
                const shinyBadge = document.createElement('span');
                shinyBadge.className = 'sticker-shiny-badge';
                shinyBadge.textContent = 'Shiny';
                card.appendChild(shinyBadge);
            }

            // Image Container
            const imgContainer = document.createElement('div');
            imgContainer.className = 'sticker-img-container';
            
            const img = document.createElement('img');
            img.className = 'sticker-img';
            // If unlocked, use the image path; else fallback/silhouette
            if (isUnlocked) {
                img.src = member.image;
                img.onerror = () => {
                    // Fallback to avatar with initials
                    imgContainer.innerHTML = `<div class="user-avatar" style="width:100%;height:100%;border-radius:0;font-size:2rem;">${member.name.split(' ').map(n=>n[0]).join('')}</div>`;
                };
            } else {
                img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%231a1127"/></svg>';
            }
            imgContainer.appendChild(img);
            card.appendChild(imgContainer);

            // Repeat count badge
            if (count > 1) {
                const countBadge = document.createElement('div');
                countBadge.className = 'sticker-count-badge';
                countBadge.textContent = `+${count - 1}`;
                card.appendChild(countBadge);
            }

            // Name info
            const info = document.createElement('div');
            info.className = 'sticker-info';
            
            const nameEl = document.createElement('span');
            nameEl.className = 'sticker-name';
            nameEl.textContent = member.name;
            info.appendChild(nameEl);
            
            card.appendChild(info);

            // Click Handler
            card.addEventListener('click', () => {
                showStickerDetails(member, isUnlocked);
            });

            albumGrid.appendChild(card);
        });
    }

    // Detail Modal for Stickers
    function showStickerDetails(member, isUnlocked) {
        cardDetailLayout.innerHTML = '';
        
        const isSuperShiny = ['presidente', 'vice-presidente'].includes(member.status.toLowerCase());
        const isShiny = ['diretor'].includes(member.status.toLowerCase());
        
        // Image Column
        const imgCol = document.createElement('div');
        imgCol.className = 'detail-img-col';
        
        const cardMock = document.createElement('div');
        cardMock.className = `sticker-card ${isUnlocked ? '' : 'locked'} ${isSuperShiny ? 'super-shiny' : (isShiny ? 'shiny' : '')} ${member.isRectangular ? 'rectangular' : ''} detail-card-mock`;
        
        const numBadge = document.createElement('span');
        numBadge.className = 'sticker-number';
        numBadge.textContent = `Nº ${member.id.toString().padStart(2, '0')}`;
        cardMock.appendChild(numBadge);
        
        if (isSuperShiny) {
            const shinyBadge = document.createElement('span');
            shinyBadge.className = 'sticker-shiny-badge';
            shinyBadge.style.background = 'linear-gradient(135deg, #ff007f, #7928ca)';
            shinyBadge.style.color = '#fff';
            shinyBadge.textContent = 'Lendário';
            cardMock.appendChild(shinyBadge);
        } else if (isShiny) {
            const shinyBadge = document.createElement('span');
            shinyBadge.className = 'sticker-shiny-badge';
            shinyBadge.textContent = 'Shiny';
            cardMock.appendChild(shinyBadge);
        }
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'sticker-img-container';
        const img = document.createElement('img');
        img.className = 'sticker-img';
        
        if (isUnlocked) {
            img.src = member.image;
            img.onerror = () => {
                imgContainer.innerHTML = `<div class="user-avatar" style="width:100%;height:100%;border-radius:0;font-size:3rem;">${member.name.split(' ').map(n=>n[0]).join('')}</div>`;
            };
        } else {
            img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%231a1127"/></svg>';
        }
        imgContainer.appendChild(img);
        cardMock.appendChild(imgContainer);
        
        const info = document.createElement('div');
        info.className = 'sticker-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'sticker-name';
        nameEl.textContent = member.name;
        info.appendChild(nameEl);
        cardMock.appendChild(info);
        
        imgCol.appendChild(cardMock);
        cardDetailLayout.appendChild(imgCol);

        // Info Column
        const infoCol = document.createElement('div');
        infoCol.className = 'detail-info-col';
        
        const header = document.createElement('div');
        header.className = 'detail-header';
        
        const nameTitle = document.createElement('h4');
        nameTitle.className = 'detail-name';
        nameTitle.textContent = isUnlocked ? member.fullName : 'Figurinha Bloqueada';
        header.appendChild(nameTitle);
        
        const roleBadge = document.createElement('span');
        roleBadge.className = `detail-badge ${isSuperShiny ? 'super-shiny' : (isShiny ? 'shiny' : '')}`;
        if (isSuperShiny) {
            roleBadge.style.background = 'linear-gradient(135deg, rgba(255, 0, 127, 0.2), rgba(121, 40, 202, 0.2))';
            roleBadge.style.borderColor = '#ff007f';
            roleBadge.style.color = '#ff007f';
        }
        roleBadge.textContent = member.status;
        header.appendChild(roleBadge);
        
        infoCol.appendChild(header);

        const body = document.createElement('div');
        body.className = 'detail-body';
        
        if (isUnlocked) {
            // Email
            if (member.email) {
                body.appendChild(createDetailRow('Email', member.email));
            }
            // Birthday
            if (member.birthday) {
                body.appendChild(createDetailRow('Aniversário', member.birthday));
            }
            // Techs
            if (member.techs && member.techs.length > 0) {
                const row = document.createElement('div');
                row.className = 'detail-row';
                const label = document.createElement('span');
                label.className = 'detail-label';
                label.textContent = 'Tecnologias';
                row.appendChild(label);
                
                const tags = document.createElement('div');
                tags.className = 'detail-tags';
                member.techs.forEach(t => {
                    const tag = document.createElement('span');
                    tag.className = 'tech-tag';
                    tag.textContent = t;
                    tags.appendChild(tag);
                });
                row.appendChild(tags);
                body.appendChild(row);
            }
            // Interests
            if (member.interests) {
                body.appendChild(createDetailRow('Áreas de Interesse', member.interests));
            }
            // Projects
            if (member.projects) {
                body.appendChild(createDetailRow('Projetos', member.projects));
            }
        } else {
            const lockMsg = document.createElement('p');
            lockMsg.style.color = 'var(--text-muted)';
            lockMsg.style.fontStyle = 'italic';
            lockMsg.textContent = 'Abra pacotes diários para desbloquear as informações desta figurinha!';
            body.appendChild(lockMsg);
        }
        
        infoCol.appendChild(body);
        cardDetailLayout.appendChild(infoCol);
        
        cardModal.classList.add('active');
    }

    function createDetailRow(labelText, valueText) {
        const row = document.createElement('div');
        row.className = 'detail-row';
        
        const label = document.createElement('span');
        label.className = 'detail-label';
        label.textContent = labelText;
        
        const val = document.createElement('span');
        val.className = 'detail-value';
        val.textContent = valueText;
        
        row.appendChild(label);
        row.appendChild(val);
        return row;
    }

    // Daily Pack Locking Logic
    function formatDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getReleaseCheckpoints() {
        const now = new Date();
        const checkpoints = [];
        
        const today12 = new Date(now);
        today12.setHours(12, 0, 0, 0);
        const today19 = new Date(now);
        today19.setHours(19, 0, 0, 0);
        
        const todayStr = formatDateString(now);
        
        if (now.getTime() >= today12.getTime()) {
            checkpoints.push({ id: `${todayStr}-12`, time: today12 });
        }
        if (now.getTime() >= today19.getTime()) {
            checkpoints.push({ id: `${todayStr}-19`, time: today19 });
        }
        
        return checkpoints;
    }

    function getNextReleaseTime() {
        const now = new Date();
        const today12 = new Date(now);
        today12.setHours(12, 0, 0, 0);
        const today19 = new Date(now);
        today19.setHours(19, 0, 0, 0);
        
        if (now.getTime() < today12.getTime()) {
            return today12;
        } else if (now.getTime() < today19.getTime()) {
            return today19;
        } else {
            const tomorrow12 = new Date(today12.getTime() + 24 * 60 * 60 * 1000);
            return tomorrow12;
        }
    }

    function updatePackStatus() {
        if (!currentUser) return;
        
        const activeCheckpoints = getReleaseCheckpoints();
        const unclaimed = activeCheckpoints.filter(cp => !claimedCheckpoints.includes(cp.id));
        const isPackAvailable = unclaimed.length > 0;
        const nextRelease = getNextReleaseTime();
        const now = new Date();
        
        if (isPackAvailable) {
            const countStr = unclaimed.length > 1 ? ` (${unclaimed.length} disponíveis)` : '';
            packStatusText.textContent = `Liberado!${countStr}`;
            packStatusText.className = 'pack-status-indicator';
            countdownTimer.textContent = 'Pacote Pronto!';
            
            // Enable actions in packs tab
            btnOpenPack.removeAttribute('disabled');
            if (swipeContainer) {
                swipeContainer.classList.remove('disabled');
                swipeTextLabel.textContent = 'DESLIZE PARA ABRIR ➡️';
            }
            boosterPack.classList.remove('waiting-lock');
            document.getElementById('pack-timer-desc').textContent = unclaimed.length > 1
                ? 'Você tem 2 pacotes disponíveis para abrir hoje (12h e 19h)!'
                : 'Você tem um pacote disponível para abrir hoje!';
        } else {
            packStatusText.textContent = 'Próximo pacote em:';
            packStatusText.className = 'pack-status-indicator waiting';
            
            // Countdown time left
            const diffMs = nextRelease.getTime() - now.getTime();
            
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            countdownTimer.textContent = timeStr;
            
            // Disable opening actions
            btnOpenPack.setAttribute('disabled', 'true');
            if (swipeContainer) {
                swipeContainer.classList.add('disabled');
                swipeTextLabel.textContent = 'BLOQUEADO 🔒';
            }
            boosterPack.classList.add('waiting-lock');
            
            const releaseHour = nextRelease.getHours();
            const dateLabel = nextRelease.getDate() === now.getDate() ? 'hoje' : 'amanhã';
            document.getElementById('pack-timer-desc').textContent = `Liberado às 12:00h e 19:00h. Próximo pacote: ${dateLabel} às ${releaseHour}:00h.`;
        }
    }

    // Trigger Pack Opening Sequence
    function triggerPackOpening() {
        const activeCheckpoints = getReleaseCheckpoints();
        const unclaimed = activeCheckpoints.filter(cp => !claimedCheckpoints.includes(cp.id));
        const isPackAvailable = unclaimed.length > 0;
        
        // Extra check
        if (!isPackAvailable) {
            alert('Você já abriu seus pacotes disponíveis! Aguarde o próximo às 12h ou 19h.');
            return;
        }
        
        // Play tearing animation on booster pack
        boosterPack.classList.add('torn');
        
        setTimeout(() => {
            // Generate 5 random stickers
            currentRevealCards = [];
            flippedCount = 0;
            
            // Pick 5 unique random cards from MEMBROS
            const availableStickers = [...MEMBROS];
            for (let i = 0; i < 5; i++) {
                const randomIndex = Math.floor(Math.random() * availableStickers.length);
                currentRevealCards.push(availableStickers.splice(randomIndex, 1)[0]);
            }
            
            // Swap screens
            packClaimView.classList.add('hidden');
            packRevealView.classList.remove('hidden');
            revealActions.classList.add('hidden');
            
            // Clean up torn class for future opens
            boosterPack.classList.remove('torn');

            // Render Cards face down
            cardsRevealGrid.innerHTML = '';
            
            currentRevealCards.forEach((member, index) => {
                 const isSuperShiny = ['presidente', 'vice-presidente'].includes(member.status.toLowerCase());
                 const isShiny = ['diretor'].includes(member.status.toLowerCase());
                 
                 const container = document.createElement('div');
                 container.className = `flip-card-container ${member.isRectangular ? 'rectangular' : ''} ${isSuperShiny ? 'back-super-shiny' : (isShiny ? 'back-shiny' : '')}`;
                
                const inner = document.createElement('div');
                inner.className = 'flip-card-inner';
                
                // Back of the card (visible initially)
                const back = document.createElement('div');
                back.className = 'flip-card-back';
                back.innerHTML = `
                    <div class="card-back-design">
                        <img src="assets/logo-globe-purple.png" class="card-back-logo-img" alt="LAWD Logo">
                    </div>
                `;
                inner.appendChild(back);

                // Front of the card (revealed on flip)
                const front = document.createElement('div');
                front.className = `flip-card-front sticker-card ${isSuperShiny ? 'super-shiny' : (isShiny ? 'shiny' : '')} ${member.isRectangular ? 'rectangular' : ''}`;
                
                // Number badge
                const numBadge = document.createElement('span');
                numBadge.className = 'sticker-number';
                numBadge.textContent = `Nº ${member.id.toString().padStart(2, '0')}`;
                front.appendChild(numBadge);

                if (isSuperShiny) {
                    const shinyBadge = document.createElement('span');
                    shinyBadge.className = 'sticker-shiny-badge';
                    shinyBadge.style.background = 'linear-gradient(135deg, #ff007f, #7928ca)';
                    shinyBadge.style.color = '#fff';
                    shinyBadge.textContent = 'Lendário';
                    front.appendChild(shinyBadge);
                } else if (isShiny) {
                    const shinyBadge = document.createElement('span');
                    shinyBadge.className = 'sticker-shiny-badge';
                    shinyBadge.textContent = 'Shiny';
                    front.appendChild(shinyBadge);
                }

                // Check if card is brand new in inventory
                const isNew = !(inventory[member.id] > 0);
                if (isNew) {
                    const newBadge = document.createElement('span');
                    newBadge.className = 'sticker-shiny-badge';
                    newBadge.style.background = 'var(--success)';
                    newBadge.style.top = (isSuperShiny || isShiny) ? '35px' : '12px';
                    newBadge.textContent = 'NOVA!';
                    front.appendChild(newBadge);
                }

                const imgContainer = document.createElement('div');
                imgContainer.className = 'sticker-img-container';
                
                const img = document.createElement('img');
                img.className = 'sticker-img';
                img.src = member.image;
                img.onerror = () => {
                    imgContainer.innerHTML = `<div class="user-avatar" style="width:100%;height:100%;border-radius:0;font-size:2rem;">${member.name.split(' ').map(n=>n[0]).join('')}</div>`;
                };
                imgContainer.appendChild(img);
                front.appendChild(imgContainer);

                const info = document.createElement('div');
                info.className = 'sticker-info';
                const nameEl = document.createElement('span');
                nameEl.className = 'sticker-name';
                nameEl.textContent = member.name;
                info.appendChild(nameEl);
                front.appendChild(info);

                inner.appendChild(front);
                container.appendChild(inner);
                
                // Click to reveal card
                container.addEventListener('click', () => {
                    if (!container.classList.contains('revealed')) {
                        container.classList.add('revealed');
                        flippedCount++;
                        
                        // Particle effect
                        createConfetti(container);
                        
                        if (flippedCount === 5) {
                            revealActions.classList.remove('hidden');
                        }
                    }
                });
                
                cardsRevealGrid.appendChild(container);
            });
        }, 1000);
    }

    // Save pack items to inventory
    function saveRevealedCardsToInventory() {
        // Find the first active checkpoint that is unclaimed, and claim it
        const activeCheckpoints = getReleaseCheckpoints();
        const unclaimed = activeCheckpoints.filter(cp => !claimedCheckpoints.includes(cp.id));
        if (unclaimed.length > 0) {
            const checkpointToClaim = unclaimed[0].id;
            claimedCheckpoints.push(checkpointToClaim);
            localStorage.setItem(`copa-lawd-claimed:${currentUser}`, JSON.stringify(claimedCheckpoints));
        }

        // Record last opened timestamp
        lastOpenedPackTime = Date.now();
        localStorage.setItem(`copa-lawd-last-pack:${currentUser}`, lastOpenedPackTime.toString());
        
        // Add to inventory
        currentRevealCards.forEach(member => {
            inventory[member.id] = (inventory[member.id] || 0) + 1;
        });
        
        localStorage.setItem(`copa-lawd-inventory:${currentUser}`, JSON.stringify(inventory));
        
        // Update dashboard
        updateStats();
        updatePackStatus();
        
        // Return to normal claim screen
        packRevealView.classList.add('hidden');
        packClaimView.classList.remove('hidden');
        
        // Redirect to album to view them!
        switchTab('album');
    }

    // Particles/Confetti Burst on Card Reveal
    function createConfetti(el) {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        for (let i = 0; i < 15; i++) {
            const conf = document.createElement('div');
            conf.className = 'confetti';
            document.body.appendChild(conf);
            
            const angle = Math.random() * Math.PI * 2;
            const velocity = 3 + Math.random() * 5;
            const size = 4 + Math.random() * 6;
            
            conf.style.width = `${size}px`;
            conf.style.height = `${size}px`;
            conf.style.left = `${centerX}px`;
            conf.style.top = `${centerY}px`;
            
            // Random purple / gold color
            const colors = ['#a855f7', '#c77dff', '#ffb703', '#ffffff', '#ec4899'];
            conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            
            let posX = centerX;
            let posY = centerY;
            let velX = Math.cos(angle) * velocity;
            let velY = Math.sin(angle) * velocity - 2; // gravity offset
            
            const animate = () => {
                velY += 0.2; // gravity
                posX += velX;
                posY += velY;
                
                conf.style.left = `${posX}px`;
                conf.style.top = `${posY}px`;
                conf.style.opacity = parseFloat(conf.style.opacity || 1) - 0.03;
                
                if (parseFloat(conf.style.opacity) > 0) {
                    requestAnimationFrame(animate);
                } else {
                    conf.remove();
                }
            };
            
            conf.style.opacity = '1';
            requestAnimationFrame(animate);
        }
    }

    // Export JSON
    function exportCollection() {
        const dataStr = JSON.stringify({
            username: currentUser,
            inventory: inventory,
            lastOpenedPackTime: lastOpenedPackTime,
            claimedCheckpoints: claimedCheckpoints,
            exportedAt: new Date().toISOString()
        }, null, 2);
        
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `copa-lawd-${currentUser.replace(/\s+/g, '-').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Import JSON
    function importCollection(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.username && data.inventory) {
                    // Restore data
                    currentUser = data.username;
                    inventory = data.inventory;
                    lastOpenedPackTime = data.lastOpenedPackTime || null;
                    claimedCheckpoints = data.claimedCheckpoints || [];
                    
                    localStorage.setItem('copa-lawd-username', currentUser);
                    localStorage.setItem(`copa-lawd-inventory:${currentUser}`, JSON.stringify(inventory));
                    if (lastOpenedPackTime) {
                        localStorage.setItem(`copa-lawd-last-pack:${currentUser}`, lastOpenedPackTime.toString());
                    } else {
                        localStorage.removeItem(`copa-lawd-last-pack:${currentUser}`);
                    }
                    localStorage.setItem(`copa-lawd-claimed:${currentUser}`, JSON.stringify(claimedCheckpoints));
                    
                    // Reload screen
                    loginUser(currentUser);
                    alert('Dados da coleção importados com sucesso!');
                    switchTab('album');
                } else {
                    alert('Arquivo JSON inválido. Verifique o formato do backup.');
                }
            } catch (err) {
                alert('Erro ao carregar o arquivo JSON. Certifique-se de que é um JSON válido.');
            }
        };
        reader.readAsText(file);
    }

    // Reset Album progress
    function resetAlbum() {
        if (confirm('Tem certeza de que deseja apagar todo o seu progresso? Isso limpará todas as figurinhas coletadas e redefinirá o cronômetro.')) {
            localStorage.clear();
            location.reload();
        }
    }
});
