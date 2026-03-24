let audioCtx;
let isRunning = false;

// Configuration des fréquences (proches des ultrasons)
const FREQ_0 = 18500; // Fréquence pour le bit 0
const FREQ_1 = 19500; // Fréquence pour le bit 1
const BIT_DURATION = 0.1; // Durée d'un bit en secondes (100ms)

const statusEl = document.getElementById('status');
const receivedEl = document.getElementById('receivedText');

// --- ÉMISSION ---
async function transmit(text) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    statusEl.innerText = "Mode : Émission...";
    
    // Convertir texte en binaire
    let binary = "";
    for (let i = 0; i < text.length; i++) {
        binary += text[i].charCodeAt(0).toString(2).padStart(8, '0');
    }

    let now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // On baisse un peu le volume pour éviter la distorsion
    gain.gain.setValueAtTime(0.5, now);
    osc.start();

    // Séquence de fréquences
    for (let j = 0; j < binary.length; j++) {
        let freq = (binary[j] === '1') ? FREQ_1 : FREQ_0;
        osc.frequency.setValueAtTime(freq, now + (j * BIT_DURATION));
    }

    // Arrêt après la fin
    osc.stop(now + (binary.length * BIT_DURATION));
    osc.onended = () => { statusEl.innerText = "Mode : Terminé"; };
}

// --- RÉCEPTION ---
async function startListening() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    statusEl.innerText = "Mode : Écoute...";

    try {
        // C'est ici qu'on désactive les filtres du navigateur
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
            }
        });

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048; // Précision de l'analyse
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let binaryResult = "";
        let lastCharBinary = "";

        function checkFrequency() {
            if (!isRunning) return;
            analyser.getByteFrequencyData(dataArray);

            // Trouver quelle fréquence domine
            let index0 = Math.round(FREQ_0 / (audioCtx.sampleRate / analyser.fftSize));
            let index1 = Math.round(FREQ_1 / (audioCtx.sampleRate / analyser.fftSize));

            let val0 = dataArray[index0];
            let val1 = dataArray[index1];

            // Seuil simple de détection
            if (val0 > 100 || val1 > 100) {
                let bit = (val1 > val0) ? "1" : "0";
                binaryResult += bit; // Note: ceci est une version simplifiée
                // Dans un vrai projet, il faudrait gérer le timing pour ne pas lire 100 fois le même bit
            }

            requestAnimationFrame(checkFrequency);
        }

        isRunning = true;
        checkFrequency();

    } catch (err) {
        console.error("Micro refusé :", err);
        statusEl.innerText = "Erreur micro.";
    }
}

// --- EVENTS ---
document.getElementById('btnEmit').onclick = () => {
    const text = document.getElementById('message').value;
    if(text) transmit(text);
};

document.getElementById('btnListen').onclick = () => {
    isRunning = true;
    startListening();
};