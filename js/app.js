/**
 * CesiumJS Story Tour Prototype - App Logic
 */

// ---------------------------------------------------------
// 1. Initialize Cesium Viewer
// ---------------------------------------------------------

// TODO: Replace with a valid Cesium ion Access Token if needed for specific assets
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxZTBiMzA2OS04ZTMxLTQ1NjMtYjU5OC1lMWVlMWViZmI1MjgiLCJpZCI6MzA1NywiaWF0IjoxNzY5NTc0NzY3fQ.2t_Z8vHd3k6LbTHlxTZj76HiAHsCvsxms1lkM80nOB4';


const viewer = new Cesium.Viewer('cesiumContainer', {
    //terrainProvider: Cesium.createWorldTerrain(), // Default terrain
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    geocoder: false,
    selectionIndicator: false
});

// Remove shadows for performance if needed
viewer.shadows = true;

// Load Google Photorealistic 3D Tiles
async function loadGoogle3DTiles() {
    try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
        viewer.scene.primitives.add(tileset);
    } catch (error) {
        console.log(error);
    }
}

// ---------------------------------------------------------
// 2. TourManager Class
// ---------------------------------------------------------

class TourManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.tourData = null;
        this.currentChapterIndex = -1;

        // Status Flags
        this.isPlaying = false;
        this.state = 'IDLE'; // 'FLYING', 'STAYING', 'IDLE'

        // Timer Variables
        this.stateStartTime = 0;
        this.currentBehavior = null;
        this.currentCenter = null;
        this.currentHeading = 0;
        this.currentPitch = 0;
        this.currentRange = 0;

        // UI Elements
        this.elTitle = document.getElementById('tourMainTitle');
        this.elDesc = document.getElementById('tourMainDesc');
        this.elChapIdx = document.getElementById('chapterIndex');
        this.elChapTitle = document.getElementById('chapterTitle');
        this.elChapSub = document.getElementById('chapterSubtitle');
        this.elChapDesc = document.getElementById('chapterDesc');
        this.elBtnPrev = document.getElementById('prevBtn');
        this.elBtnNext = document.getElementById('nextBtn');
        this.elBtnPlay = document.getElementById('playPauseBtn');
        this.elProgressBar = document.getElementById('progressBar');

        // Event Listeners
        this.initEventListeners();

        // Register Tick Event for rotation and progression
        this.viewer.clock.onTick.addEventListener(this.onTick.bind(this));
    }

    async loadTour(jsonUrl) {
        try {
            const response = await fetch(jsonUrl);
            this.tourData = await response.json();

            // Update Main UI
            this.elTitle.innerText = this.tourData.title;
            this.elDesc.innerText = this.tourData.description;

            if (this.tourData.chapters.length > 0) {
                // start with first chapter
                this.goToChapter(0);
                this.togglePlay(); // Auto-start
            }
        } catch (e) {
            console.error("Failed to load tour data:", e);
        }
    }

    initEventListeners() {
        this.elBtnPrev.addEventListener('click', () => {
            this.pause();
            this.prevChapter();
        });

        this.elBtnNext.addEventListener('click', () => {
            this.pause();
            this.nextChapter();
        });

        this.elBtnPlay.addEventListener('click', () => {
            this.togglePlay();
        });
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        this.updatePlayBtnUI();

        if (this.isPlaying) {
            // Resume or start from beginning if idle
            if (this.state === 'IDLE') {
                this.goToChapter(this.currentChapterIndex >= 0 ? this.currentChapterIndex : 0);
            }
        }
    }

    pause() {
        this.isPlaying = false;
        this.updatePlayBtnUI();
    }

    updatePlayBtnUI() {
        const icon = this.elBtnPlay.querySelector('i');
        if (this.isPlaying) {
            icon.className = 'fas fa-pause';
        } else {
            icon.className = 'fas fa-play';
        }
    }

    prevChapter() {
        if (!this.tourData) return;
        let p = this.currentChapterIndex - 1;
        if (p < 0) p = this.tourData.chapters.length - 1; // loop
        this.goToChapter(p);
    }

    nextChapter() {
        if (!this.tourData) return;
        let n = this.currentChapterIndex + 1;
        if (n >= this.tourData.chapters.length) n = 0; // loop
        this.goToChapter(n);
    }

    goToChapter(index) {
        if (!this.tourData) return;
        this.currentChapterIndex = index;
        const chapter = this.tourData.chapters[index];

        // Update UI
        this.elChapIdx.innerText = `Chapter ${index + 1} of ${this.tourData.chapters.length}`;
        this.elChapTitle.innerText = chapter.title;
        this.elChapSub.innerText = chapter.subtitle;
        this.elChapDesc.innerText = chapter.description;

        // Trigger reflow for animation restart
        const infoDiv = document.querySelector('.chapter-info');
        infoDiv.style.animation = 'none';
        infoDiv.offsetHeight; // trigger reflow
        infoDiv.style.animation = null;

        // Reset progress
        this.elProgressBar.style.width = '0%';

        this.startFlyTo(chapter);
    }

    startFlyTo(chapter) {
        this.state = 'FLYING';
        this.currentBehavior = chapter.behavior;

        const loc = chapter.location;
        const cam = chapter.camera;

        this.currentCenter = Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, loc.height);
        this.currentHeading = Cesium.Math.toRadians(cam.heading);
        this.currentPitch = Cesium.Math.toRadians(cam.pitch);
        this.currentRange = cam.range;

        // Cancel existing flights
        this.viewer.camera.cancelFlight();

        // Calculate a bounding sphere for the target
        const bs = new Cesium.BoundingSphere(this.currentCenter, 1);

        const offset = new Cesium.HeadingPitchRange(
            this.currentHeading,
            this.currentPitch,
            this.currentRange
        );

        this.viewer.camera.flyToBoundingSphere(bs, {
            duration: this.currentBehavior.flyDuration,
            offset: offset,
            easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
            complete: () => {
                this.startStaying();
            }
        });
    }

    startStaying() {
        this.state = 'STAYING';
        this.stateStartTime = performance.now();
    }

    onTick(clock) {
        if (!this.isPlaying || this.state !== 'STAYING' || !this.currentBehavior) {
            if (!this.isPlaying && this.state === 'FLYING') {
                // If paused while flying, let it finish flying but don't proceed to auto-stay loop? 
                // Actually Cesium handles flyTo separately.
            }
            return;
        }

        const now = performance.now();
        const elapsedSec = (now - this.stateStartTime) / 1000.0;

        // Update Progress Bar
        const progress = Math.min((elapsedSec / this.currentBehavior.stayDuration) * 100, 100);
        this.elProgressBar.style.width = `${progress}%`;

        if (elapsedSec >= this.currentBehavior.stayDuration) {
            // Stay duration finished, go to next chapter
            this.state = 'IDLE';
            this.nextChapter();
            return;
        }

        // --- Execute Camera Rotation ---
        // Rotation speed is in degrees per second, convert to radians
        const rotationSpeedRad = Cesium.Math.toRadians(this.currentBehavior.rotationSpeed);

        // We use clock multiplier or just dt
        // viewer.clock.multiplier can be used if we want fast forward, but let's stick to real time
        const dt = clock.multiplier > 0 ? (viewer.scene.deltaTime || 16) / 1000.0 : 0;

        if (dt > 0) {
            this.currentHeading += rotationSpeedRad * dt;

            // Apply new camera position looking at the center
            const offset = new Cesium.HeadingPitchRange(
                this.currentHeading,
                this.currentPitch,
                this.currentRange
            );

            this.viewer.camera.lookAt(this.currentCenter, offset);
        }
    }
}

// ---------------------------------------------------------
// 3. Application Entry Point
// ---------------------------------------------------------

async function initApp() {
    await loadGoogle3DTiles();
    const tourManager = new TourManager(viewer);
    tourManager.loadTour('data/story_tour.json');
}

initApp();
