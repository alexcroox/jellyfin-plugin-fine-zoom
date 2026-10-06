(() => {
    'use strict';

    const minimumZoom = 100;
    const maximumZoom = 200;
    const storagePrefix = 'jellyfin-fine-zoom:item:';
    const styleId = 'fine-zoom-styles';
    const panelId = 'fine-zoom-panel';
    const buttonClass = 'fine-zoom-toggle';
    const activeVideoClass = 'fine-zoom-active';

    let boundVideo = null;
    let activeMediaKey = null;
    let currentZoom = minimumZoom;
    let mountScheduled = false;
    let panel = null;
    let toggleButton = null;
    let slider = null;
    let valueLabel = null;

    function clampZoom(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return minimumZoom;
        return Math.min(maximumZoom, Math.max(minimumZoom, Math.round(numeric)));
    }

    function ensureStyles() {
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .videoPlayerContainer { overflow: hidden !important; }
            video.${activeVideoClass} {
                object-fit: contain !important;
                transform: scale(var(--fine-zoom-scale, 1)) !important;
                transform-origin: center center !important;
            }
            .${buttonClass}.fine-zoom-changed .material-icons { color: #00a4dc; }
            .fine-zoom-panel {
                position: fixed;
                right: max(1.25rem, env(safe-area-inset-right));
                bottom: calc(6.5rem + env(safe-area-inset-bottom));
                z-index: 100000;
                box-sizing: border-box;
                width: min(23rem, calc(100vw - 2.5rem));
                padding: 1rem 1.1rem .9rem;
                border-radius: .45rem;
                color: rgba(255, 255, 255, .95);
                background: rgba(20, 20, 20, .94);
                box-shadow: 0 .35rem 1.5rem rgba(0, 0, 0, .5);
                backdrop-filter: blur(.5rem);
            }
            .fine-zoom-panel.hide { display: none !important; }
            .fine-zoom-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                margin-bottom: .7rem;
                font-size: 1.05rem;
                font-weight: 600;
            }
            .fine-zoom-value {
                min-width: 3.5rem;
                text-align: right;
                font-variant-numeric: tabular-nums;
                color: #00a4dc;
            }
            .fine-zoom-controls {
                display: grid;
                grid-template-columns: 2.25rem minmax(8rem, 1fr) 2.25rem;
                align-items: center;
                gap: .65rem;
            }
            .fine-zoom-slider {
                width: 100%;
                margin: 0;
                accent-color: #00a4dc;
                cursor: pointer;
            }
            .fine-zoom-step,
            .fine-zoom-reset {
                border: 0;
                border-radius: .25rem;
                color: inherit;
                background: rgba(255, 255, 255, .12);
                cursor: pointer;
            }
            .fine-zoom-step {
                width: 2.25rem;
                height: 2.25rem;
                padding: 0;
                font-size: 1.4rem;
                line-height: 2.25rem;
            }
            .fine-zoom-reset {
                display: block;
                margin: .8rem 0 0 auto;
                padding: .45rem .8rem;
                font-size: .88rem;
            }
            .fine-zoom-step:hover,
            .fine-zoom-step:focus,
            .fine-zoom-reset:hover,
            .fine-zoom-reset:focus { background: rgba(255, 255, 255, .22); }
            .fine-zoom-help {
                margin-top: .6rem;
                font-size: .78rem;
                line-height: 1.35;
                opacity: .7;
            }
            @media (max-width: 600px) {
                .fine-zoom-panel {
                    right: 1rem;
                    bottom: calc(5.5rem + env(safe-area-inset-bottom));
                    width: calc(100vw - 2rem);
                }
            }
        `;
        document.head.appendChild(style);
    }

    function extractItemId(candidate) {
        if (!candidate) return null;

        const patterns = [
            /[?&#]id=([0-9a-f-]{32,36})(?:[&#]|$)/i,
            /\/videos\/([0-9a-f-]{32,36})(?:\/|$)/i,
            /\/items\/([0-9a-f-]{32,36})\/images\//i
        ];

        for (const pattern of patterns) {
            const match = String(candidate).match(pattern);
            if (match) return match[1].replace(/-/g, '').toLowerCase();
        }

        return null;
    }

    function getMediaKey(video) {
        const candidates = [
            window.location.href,
            window.location.hash,
            video.currentSrc,
            video.getAttribute('src'),
            video.poster
        ];

        for (const candidate of candidates) {
            const itemId = extractItemId(candidate);
            if (itemId) return itemId;
        }

        const source = video.currentSrc || video.getAttribute('src');
        if (source && !source.startsWith('blob:')) {
            try {
                const url = new URL(source, window.location.href);
                return `source-${url.pathname}`;
            } catch {
                return null;
            }
        }

        return null;
    }

    function readStoredZoom(mediaKey) {
        if (!mediaKey) return minimumZoom;
        try {
            return clampZoom(window.localStorage.getItem(storagePrefix + mediaKey));
        } catch {
            return minimumZoom;
        }
    }

    function storeZoom(mediaKey, zoom) {
        if (!mediaKey) return;
        try {
            const key = storagePrefix + mediaKey;
            if (zoom === minimumZoom) {
                window.localStorage.removeItem(key);
            } else {
                window.localStorage.setItem(key, String(zoom));
            }
        } catch {
            // Playback remains fully functional if browser storage is unavailable.
        }
    }

    function updateUi() {
        if (slider) slider.value = String(currentZoom);
        if (valueLabel) valueLabel.textContent = `${currentZoom}%`;
        if (toggleButton) {
            const changed = currentZoom !== minimumZoom;
            toggleButton.classList.toggle('fine-zoom-changed', changed);
            toggleButton.title = changed ? `Fine Zoom (${currentZoom}%)` : 'Fine Zoom';
            toggleButton.setAttribute('aria-label', toggleButton.title);
        }
    }

    function applyZoom(value, persist = true) {
        currentZoom = clampZoom(value);

        if (boundVideo) {
            if (currentZoom === minimumZoom) {
                boundVideo.classList.remove(activeVideoClass);
                boundVideo.style.removeProperty('--fine-zoom-scale');
            } else {
                boundVideo.style.setProperty('--fine-zoom-scale', String(currentZoom / 100));
                boundVideo.classList.add(activeVideoClass);
            }
        }

        if (persist) storeZoom(activeMediaKey, currentZoom);
        updateUi();
    }

    function syncMedia(force = false) {
        if (!boundVideo) return;
        const mediaKey = getMediaKey(boundVideo);
        if (!mediaKey || (!force && mediaKey === activeMediaKey)) return;

        activeMediaKey = mediaKey;
        applyZoom(readStoredZoom(mediaKey), false);
    }

    function bindVideo(video) {
        if (video === boundVideo) {
            syncMedia();
            return;
        }

        if (boundVideo) {
            boundVideo.removeEventListener('loadstart', handleMediaChange);
            boundVideo.removeEventListener('loadedmetadata', handleMediaChange);
            boundVideo.removeEventListener('emptied', handleMediaChange);
        }

        boundVideo = video;
        activeMediaKey = null;
        applyZoom(minimumZoom, false);

        if (boundVideo) {
            boundVideo.addEventListener('loadstart', handleMediaChange);
            boundVideo.addEventListener('loadedmetadata', handleMediaChange);
            boundVideo.addEventListener('emptied', handleMediaChange);
            syncMedia(true);
        }
    }

    function handleMediaChange() {
        window.setTimeout(() => syncMedia(), 0);
    }

    function findActivePage() {
        const pages = Array.from(document.querySelectorAll('#videoOsdPage'));
        for (let index = pages.length - 1; index >= 0; index -= 1) {
            const candidate = pages[index];
            if (!candidate.hidden && !candidate.classList.contains('hide')) return candidate;
        }

        return pages.length ? pages[pages.length - 1] : null;
    }

    function findVideo() {
        return document.querySelector(
            '.videoPlayerContainer video.htmlvideoplayer, .videoPlayerContainer video, #videoOsdPage video'
        );
    }

    function setPanelOpen(open) {
        if (!panel || !toggleButton) return;
        panel.classList.toggle('hide', !open);
        toggleButton.setAttribute('aria-expanded', String(open));
        if (open) slider?.focus();
    }

    function createPanel(page) {
        panel = document.createElement('section');
        panel.id = panelId;
        panel.className = 'fine-zoom-panel hide';
        panel.setAttribute('aria-label', 'Fine Zoom controls');

        const heading = document.createElement('div');
        heading.className = 'fine-zoom-heading';

        const title = document.createElement('span');
        title.textContent = 'Fine Zoom';

        valueLabel = document.createElement('output');
        valueLabel.className = 'fine-zoom-value';
        valueLabel.textContent = '100%';

        heading.append(title, valueLabel);

        const controls = document.createElement('div');
        controls.className = 'fine-zoom-controls';

        const decrease = document.createElement('button');
        decrease.type = 'button';
        decrease.className = 'fine-zoom-step';
        decrease.textContent = '−';
        decrease.title = 'Decrease zoom by 1%';
        decrease.setAttribute('aria-label', decrease.title);

        slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'fine-zoom-slider';
        slider.min = String(minimumZoom);
        slider.max = String(maximumZoom);
        slider.step = '1';
        slider.value = String(currentZoom);
        slider.setAttribute('aria-label', 'Video zoom percentage');

        const increase = document.createElement('button');
        increase.type = 'button';
        increase.className = 'fine-zoom-step';
        increase.textContent = '+';
        increase.title = 'Increase zoom by 1%';
        increase.setAttribute('aria-label', increase.title);

        controls.append(decrease, slider, increase);

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'fine-zoom-reset';
        reset.textContent = 'Reset to 100%';

        const help = document.createElement('div');
        help.className = 'fine-zoom-help';
        help.textContent = 'Preserves the picture shape and remembers this setting for the current video.';

        panel.append(heading, controls, reset, help);
        page.appendChild(panel);

        panel.addEventListener('pointerdown', event => event.stopPropagation());
        panel.addEventListener('click', event => event.stopPropagation());
        slider.addEventListener('input', () => applyZoom(slider.value));
        decrease.addEventListener('click', () => applyZoom(currentZoom - 1));
        increase.addEventListener('click', () => applyZoom(currentZoom + 1));
        reset.addEventListener('click', () => applyZoom(minimumZoom));
    }

    function createToggle(settingsButton) {
        try {
            toggleButton = document.createElement('button', { is: 'paper-icon-button-light' });
        } catch {
            toggleButton = document.createElement('button');
        }

        toggleButton.type = 'button';
        toggleButton.setAttribute('is', 'paper-icon-button-light');
        toggleButton.className = `${buttonClass} autoSize`;
        toggleButton.title = 'Fine Zoom';
        toggleButton.setAttribute('aria-label', toggleButton.title);
        toggleButton.setAttribute('aria-controls', panelId);
        toggleButton.setAttribute('aria-expanded', 'false');
        toggleButton.innerHTML = '<span class="largePaperIconButton material-icons zoom_in" aria-hidden="true"></span>';

        toggleButton.addEventListener('pointerdown', event => event.stopPropagation());
        toggleButton.addEventListener('click', event => {
            event.stopPropagation();
            setPanelOpen(panel?.classList.contains('hide') ?? true);
        });

        settingsButton.insertAdjacentElement('beforebegin', toggleButton);
    }

    function mount() {
        mountScheduled = false;
        ensureStyles();

        const page = findActivePage();
        const settingsButton = page?.querySelector('.btnVideoOsdSettings');
        const video = findVideo();
        if (!page || !settingsButton) {
            bindVideo(video);
            return;
        }

        if (!panel?.isConnected || panel.parentElement !== page) {
            document.querySelectorAll(`#${panelId}`).forEach(element => element.remove());
            createPanel(page);
        }

        if (!toggleButton?.isConnected || toggleButton.parentElement !== settingsButton.parentElement) {
            document.querySelectorAll(`.${buttonClass}`).forEach(element => element.remove());
            createToggle(settingsButton);
        }

        bindVideo(video);
        toggleButton.classList.toggle('hide', !video);
        if (!video) setPanelOpen(false);
        updateUi();
    }

    function scheduleMount() {
        if (mountScheduled) return;
        mountScheduled = true;
        window.requestAnimationFrame(mount);
    }

    document.addEventListener('click', event => {
        if (!panel || panel.classList.contains('hide')) return;
        if (!panel.contains(event.target) && !toggleButton?.contains(event.target)) setPanelOpen(false);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel && !panel.classList.contains('hide')) setPanelOpen(false);
    });

    new MutationObserver(scheduleMount).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'src', 'poster']
    });

    window.addEventListener('hashchange', scheduleMount);
    window.addEventListener('pageshow', scheduleMount);
    window.addEventListener('focus', scheduleMount);
    document.addEventListener('visibilitychange', scheduleMount);
    window.setInterval(scheduleMount, 1000);
    scheduleMount();
})();
