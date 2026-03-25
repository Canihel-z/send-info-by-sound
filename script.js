let audioCtx;
let isListening = false;
let listenInterval;

// CONFIGURATION TECHNIQUE
const FREQ_START = 20000; // Signal de début (Start Frame)
const FREQ_0 = 18500;     // Bit 0
const FREQ_1 = 19500;     // Bit 1
const BIT_DURATION = 0.1; // 100ms par bit
const THRESHOLD = 80;     // Sensibilité du micro (à ajuster si besoin)

const statusEl = document.getElementById('status');
const receivedEl = document.getElementById('receivedText');

// --- FONCTION ÉMISSION ---
async function transmit(text) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    statusEl.innerText = "⚡ Émission en cours...";
    
    // 1. Conversion Texte -> Binaire
    let binary = "";
    for (let i = 0; i < text.length; i++) {
        binary += text[i].charCodeAt(0).toString(2).padStart(8, '0');
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.5, now);

    // 2. Envoi du PRÉAMBULE (Signal de réveil pour l'autre tel)
    osc.frequency.setValueAtTime(FREQ_START, now);
    
    // 3. Envoi des BITS (on commence après le préambule de 0.5s)
    const startDelay = 0.5;
    for (let j = 0; j < binary.length; j++) {
        let freq = (binary[j] === '1') ? FREQ_1 : FREQ_0;
        osc.frequency.setValueAtTime(freq, now + startDelay + (j * BIT_DURATION));
    }

    osc.start(now);
    osc.stop(now + startDelay + (binary.length * BIT_DURATION));
    
    osc.onended = () => {
        statusEl.innerText = "✅ Message envoyé";
    };
}

// --- FONCTION RÉCEPTION ---
async function startListening() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    statusEl.innerText = "🔍 Attente du signal...";
    receivedEl.innerText = "";

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
        });

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048; 
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const hzPerBin = audioCtx.sampleRate / analyser.fftSize;

        let isDecoding = false;
        let bitBuffer = "";
        let finalMessage = "";

        // Boucle de détection ultra-rapide pour le signal de départ
        const detectSignal = () => {
            if (!isListening) return;
            analyser.getByteFrequencyData(dataArray);

            const valStart = dataArray[Math.round(FREQ_START / hzPerBin)];
            
            // Si on détecte le signal de départ et qu'on ne décode pas encore
            if (valStart > THRESHOLD && !isDecoding) {
                isDecoding = true;
                statusEl.innerText = "📥 Réception de données...";
                
                // On attend la fin du préambule (500ms) + un petit décalage pour tomber au milieu du 1er bit
                setTimeout(() => {
                    decodeBits();
                }, 550); 
                return;
            }
            if (!isDecoding) requestAnimationFrame(detectSignal);
        };

        // Fonction de lecture cadencée des bits
        const decodeBits = () => {
            listenInterval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                const v0 = dataArray[Math.round(FREQ_0 / hzPerBin)];
                const v1 = dataArray[Math.round(FREQ_1 / hzPerBin)];

                // Si plus de son détecté, on arrête
                if (v0 < 30 && v1 < 30) {
                    clearInterval(listenInterval);
                    isDecoding = false;
                    statusEl.innerText = "✅ Réception terminée";
                    detectSignal(); // Se remet en attente du prochain message
                    return;
                }

                // Détection du bit dominant
                bitBuffer += (v1 > v0) ? "1" : "0";

                // Toutes les 8 lectures (1 octet), on convertit en lettre
                if (bitBuffer.length === 8) {
                    finalMessage += String.fromCharCode(parseInt(bitBuffer, 2));
                    receivedEl.innerText = finalMessage;
                    bitBuffer = "";
                }
            }, BIT_DURATION * 1000);
        };

        isListening = true;
        detectSignal();

    } catch (err) {
        statusEl.innerText = "❌ Erreur Micro";
        console.error(err);
    }
}

// --- BOUTONS ---
document.getElementById('btnEmit').onclick = () => {
    const text = document.getElementById('message').value;
    if (text) transmit(text);
};

document.getElementById('btnListen').onclick = () => {
    if (!isListening) startListening();
};