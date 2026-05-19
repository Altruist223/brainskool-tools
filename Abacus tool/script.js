document.addEventListener('DOMContentLoaded', () => {
    const NUM_RODS = 15;
    const rodsContainer = document.getElementById('rods-container');
    const totalValueDisplay = document.getElementById('total-value');
    const resetButton = document.getElementById('reset-button');

    // Array to store the value of each rod
    // Index 0 represents the highest place value (Ten Millions)
    // Index 7 represents the Ones place
    // Index 14 represents Ten-millionths
    let rodValues = new Array(NUM_RODS).fill(0);

    let audioCtx = null;

    function playClickSound() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(2.0, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    }

    // Initialize the abacus
    function initAbacus() {
        for (let i = 0; i < NUM_RODS; i++) {
            const rodEl = document.createElement('div');
            rodEl.className = 'rod';
            rodEl.dataset.rodIndex = i;

            // Rod stick
            const stick = document.createElement('div');
            stick.className = 'rod-stick';
            rodEl.appendChild(stick);

            // Add unit dots to indicate thousands, ones, thousandths, etc.
            // With 15 rods, Ones is at index 7. We place dots every 3 rods (1, 4, 7, 10, 13).
            if ((7 - i) % 3 === 0) {
                const dot = document.createElement('div');
                dot.className = 'unit-dot';
                rodEl.appendChild(dot);
            }

            // Upper deck
            const upperDeck = document.createElement('div');
            upperDeck.className = 'deck upper-deck';
            const upperBead = document.createElement('div');
            upperBead.className = 'bead upper';
            upperBead.dataset.type = 'upper';
            upperBead.dataset.rodIndex = i;
            upperDeck.appendChild(upperBead);
            rodEl.appendChild(upperDeck);

            // Lower deck
            const lowerDeck = document.createElement('div');
            lowerDeck.className = 'deck lower-deck';
            
            // Create 4 lower beads
            // data-index="3" is top-most (closest to bar)
            // data-index="0" is bottom-most
            for (let j = 3; j >= 0; j--) {
                const lowerBead = document.createElement('div');
                lowerBead.className = 'bead lower';
                lowerBead.dataset.type = 'lower';
                lowerBead.dataset.index = j;
                lowerBead.dataset.rodIndex = i;
                lowerDeck.appendChild(lowerBead);
            }
            rodEl.appendChild(lowerDeck);

            rodsContainer.appendChild(rodEl);
        }

        // Add event listeners to all beads
        const beads = document.querySelectorAll('.bead');
        beads.forEach(bead => {
            bead.addEventListener('click', handleBeadClick);
        });

        resetButton.addEventListener('click', resetAbacus);
        updateDisplay();
    }

    function handleBeadClick(e) {
        const bead = e.target;
        const type = bead.dataset.type;
        const rodIndex = parseInt(bead.dataset.rodIndex);

        if (type === 'upper') {
            const isActive = bead.classList.contains('active');
            if (isActive) {
                bead.classList.remove('active');
                rodValues[rodIndex] -= 5;
            } else {
                bead.classList.add('active');
                rodValues[rodIndex] += 5;
            }
        } else if (type === 'lower') {
            const indexClicked = parseInt(bead.dataset.index);
            const isActive = bead.classList.contains('active');
            
            const rodEl = rodsContainer.children[rodIndex];
            const lowerBeads = Array.from(rodEl.querySelectorAll('.bead.lower'));

            if (!isActive) {
                // Moving UP (making active)
                // Any bead with index >= indexClicked should also move UP
                lowerBeads.forEach(b => {
                    const idx = parseInt(b.dataset.index);
                    if (idx >= indexClicked && !b.classList.contains('active')) {
                        b.classList.add('active');
                        rodValues[rodIndex] += 1;
                    }
                });
            } else {
                // Moving DOWN (making inactive)
                // Any bead with index <= indexClicked should also move DOWN
                lowerBeads.forEach(b => {
                    const idx = parseInt(b.dataset.index);
                    if (idx <= indexClicked && b.classList.contains('active')) {
                        b.classList.remove('active');
                        rodValues[rodIndex] -= 1;
                    }
                });
            }
        }

        playClickSound();
        updateDisplay();
    }

    function resetAbacus() {
        const beads = document.querySelectorAll('.bead');
        beads.forEach(bead => {
            bead.classList.remove('active');
        });
        rodValues = new Array(NUM_RODS).fill(0);
        playClickSound();
        updateDisplay();
    }

    function updateDisplay() {
        let totalInt = 0;
        let multiplier = 100000000000000; // 10^14

        // Iterate from left to right
        for (let i = 0; i < NUM_RODS; i++) {
            totalInt += rodValues[i] * multiplier;
            multiplier /= 10;
        }

        let total = totalInt / 10000000; // Divide by 10^7 to get actual float value

        // Format the number with commas and up to 7 decimal places
        totalValueDisplay.textContent = total.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 7
        });
    }

    initAbacus();
});
