console.log("voice_bot.js loaded:", new Date().toISOString());

let recognition = null;
let isRecording = false;
let audioQueue = [];
let responseQueue = [];
let isPlaying = false;
let statusElement = null;
let transcriptContentElement = null;
let transcriptPanel = null;
let controlButton = null;
let isProcessing = false;
let recognitionTimeout = null;

window.appData = {
    sessionId: null,
    transcript: "",
    medicalData: {
        symptoms: [],
        severity: [],
        duration: [],
        triggers: []
    },
    currentState: "INITIAL",
    authToken: null,
    uid: null
};

// Generate a new sessionId on page load/refresh
function generateSessionId() {
    return Date.now().toString();
}

// Initialize the voice bot
function initializeVoiceBot() {
    console.log("Voice bot initializing:", new Date().toISOString());

    // Generate a new sessionId on initialization
    window.appData.sessionId = generateSessionId();
    console.log("Generated new sessionId:", window.appData.sessionId);

    statusElement = document.getElementById('status-message');
    transcriptContentElement = document.getElementById('transcriptContent');
    transcriptPanel = document.getElementById('transcriptPanel');
    controlButton = document.getElementById('controlButton');

    if (!statusElement) {
        console.error("Status element not found. Ensure <div id='status-message'> exists in the HTML.");
    }
    if (!transcriptContentElement) {
        console.error("Transcript content element not found. Ensure <div id='transcriptContent'> exists in the HTML.");
    }
    if (!transcriptPanel) {
        console.error("Transcript panel not found. Ensure <div id='transcriptPanel'> exists in the HTML.");
    }
    if (!controlButton) {
        console.error("Control button not found. Ensure <button id='controlButton'> exists in the HTML.");
    } else {
        controlButton.disabled = false;
        controlButton.textContent = "Start Recording";
        controlButton.classList.remove('stop'); // Ensure stop class is removed
        controlButton.classList.add('start'); // Ensure start class is added
        console.log("Control button initialized: text='Start Recording', class='start'");
    }

    updateStatus("Ready");

    setupSpeechRecognition();
    startConversation();

    window.voiceBotInitialized = true;
    console.log("Voice bot initialized successfully");
}

// Update status display
function updateStatus(status) {
    if (statusElement) {
        statusElement.textContent = `Status: ${status}`;
    }
    console.log("Status:", status);
    // Update transcript panel class for recording animation
    if (transcriptPanel) {
        if (status === "Recording...") {
            transcriptPanel.classList.add('recording');
        } else {
            transcriptPanel.classList.remove('recording');
        }
        if (status === "Processing...") {
            transcriptPanel.classList.add('processing');
        } else {
            transcriptPanel.classList.remove('processing');
        }
    }
}

// Update transcript display
function updateTranscript(speaker, message) {
    if (transcriptContentElement) {
        const messageElement = document.createElement('div');
        messageElement.className = speaker === 'user' ? 'user' : 'ai';
        messageElement.textContent = `${speaker === 'user' ? 'You' : 'AI'}: ${message}`;
        transcriptContentElement.appendChild(messageElement);
        transcriptContentElement.scrollTop = transcriptContentElement.scrollHeight;
        console.log(`Transcript updated - ${speaker}: ${message}`);
        // Force DOM repaint to ensure visibility
        transcriptContentElement.style.display = 'none';
        transcriptContentElement.offsetHeight; // Trigger reflow
        transcriptContentElement.style.display = 'block';
    } else {
        console.error("Cannot update transcript: transcriptContentElement is null");
    }
}

// Check microphone permissions
async function checkMicPermission() {
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        if (permissionStatus.state === 'denied') {
            updateStatus("Microphone access denied. Please allow microphone access to proceed.");
            return false;
        } else if (permissionStatus.state === 'prompt') {
            updateStatus("Please grant microphone access to continue.");
        }
        return true;
    } catch (error) {
        console.error("Error checking microphone permission:", error);
        updateStatus("Error checking microphone permission. Please ensure microphone access is enabled.");
        return false;
    }
}

// Setup speech recognition
function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("Speech recognition not supported in this browser.");
        updateStatus("Speech recognition not supported");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isRecording = true;
        updateStatus("Recording...");
        if (controlButton) {
            controlButton.textContent = "Stop Recording";
            controlButton.classList.remove('start');
            controlButton.classList.add('stop');
            console.log("Recording started: controlButton text='Stop Recording', class='stop'");
        }
        recognitionTimeout = setTimeout(() => {
            if (isRecording) {
                console.log("No speech detected after 10 seconds, stopping recognition...");
                stopRecognition();
            }
        }, 10000);
    };

    recognition.onresult = (event) => {
        clearTimeout(recognitionTimeout);
        const transcript = event.results[0][0].transcript.trim();
        console.log("Speech recognized:", transcript);
        window.appData.transcript = transcript;
        updateStatus("Processing...");
        updateTranscript('user', transcript);
        isRecording = false;
        startConversation(transcript);
    };

    recognition.onend = () => {
        clearTimeout(recognitionTimeout);
        isRecording = false;
        updateStatus("Ready");
        if (controlButton) {
            controlButton.textContent = "Start Recording";
            controlButton.classList.remove('stop');
            controlButton.classList.add('start');
            console.log("Recording ended: controlButton text='Start Recording', class='start'");
        }
        if (!isPlaying && !isProcessing && audioQueue.length > 0) {
            playNextAudio();
        }
    };

    recognition.onerror = (event) => {
        clearTimeout(recognitionTimeout);
        console.error("Recognition error:", event.error);
        updateStatus(`Speech recognition error: ${event.error}`);
        if (event.error === 'no-speech') {
            console.log("No speech detected, restarting recognition...");
            updateStatus("No speech detected, please try again.");
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            updateStatus("Microphone access denied. Please allow microphone access to proceed.");
        }
        isRecording = false;
        if (controlButton) {
            controlButton.textContent = "Start Recording";
            controlButton.classList.remove('stop');
            controlButton.classList.add('start');
            console.log("Recording error: controlButton text='Start Recording', class='start'");
        }
        if (!isPlaying && !isProcessing && audioQueue.length > 0) {
            playNextAudio();
        }
    };
}

// Start conversation with the server
async function startConversation(transcript = "") {
    if (isProcessing) {
        console.log("Request already in progress, skipping...");
        return;
    }

    isProcessing = true;
    try {
        const payload = {
            sessionId: window.appData.sessionId,
            transcript: transcript,
            medicalData: window.appData.medicalData,
            currentState: window.appData.currentState || "INITIAL"
        };
        console.log("Sending conversation request:", payload);

        const response = await fetch('/start_conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.appData.authToken}`
            },
            body: JSON.stringify(payload)
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || "Failed to start conversation");
        }

        console.log("Conversation response:", responseData);
        window.appData.medicalData = responseData.medical_data;
        window.appData.currentState = responseData.nextState;
        updateStatus("Ready");
        updateTranscript('ai', responseData.response);

        if (responseData.response) {
            responseQueue.push(responseData.response);
        }

        if (responseData.audio_url) {
            audioQueue.push(responseData.audio_url);
            if (!isPlaying && !isRecording) {
                playNextAudio();
            }
        }

        if (responseData.redirect) {
            setTimeout(() => {
                window.location.href = responseData.redirect;
            }, 3000);
        }
    } catch (error) {
        console.error("Error in startConversation:", error);
        updateStatus("Error: " + error.message);
    } finally {
        isProcessing = false;
    }
}

// Generate audio locally using SpeechSynthesis API with a female voice
function generateLocalAudio(text) {
    return new Promise((resolve, reject) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';

            // Select a female voice if available
            const voices = window.speechSynthesis.getVoices();
            let femaleVoice = voices.find(voice => voice.name.toLowerCase().includes('female') || voice.gender === 'female');
            if (!femaleVoice) {
                femaleVoice = voices.find(voice => voice.name.includes('Samantha') || voice.name.includes('Google US English') || voice.default);
            }
            if (femaleVoice) {
                utterance.voice = femaleVoice;
                console.log("Using female voice for SpeechSynthesis:", femaleVoice.name);
            } else {
                console.log("No female voice found, using default voice");
            }

            utterance.onend = () => resolve();
            utterance.onerror = (event) => reject(new Error(`Speech synthesis error: ${event.error}`));
            window.speechSynthesis.speak(utterance);
        } else {
            reject(new Error("Speech synthesis not supported in this browser"));
        }
    });
}

// Ensure voices are loaded before using SpeechSynthesis
function loadVoices() {
    return new Promise(resolve => {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                voices = window.speechSynthesis.getVoices();
                resolve(voices);
            };
        }
    });
}

// Play the next audio in the queue with fallback to local generation
async function playNextAudio() {
    if (audioQueue.length === 0 || responseQueue.length === 0) {
        isPlaying = false;
        if (!isRecording && !isProcessing) {
            recognition.start();
        }
        return;
    }

    isPlaying = true;
    const audioUrl = audioQueue.shift();
    const responseText = responseQueue.shift();
    const audio = new Audio(audioUrl);

    try {
        await audio.play();
        audio.onended = () => {
            isPlaying = false;
            playNextAudio();
        };
        audio.onerror = async (error) => {
            console.error("Audio playback failed:", error);
            try {
                console.log("Falling back to local audio generation for text:", responseText);
                await loadVoices();
                await generateLocalAudio(responseText);
                isPlaying = false;
                playNextAudio();
            } catch (localError) {
                console.error("Local audio generation failed:", localError);
                updateStatus("Error: Unable to play audio response");
                isPlaying = false;
                playNextAudio();
            }
        };
    } catch (error) {
        console.error("Audio playback failed:", error);
        try {
            console.log("Falling back to local audio generation for text:", responseText);
            await loadVoices();
            await generateLocalAudio(responseText);
            isPlaying = false;
            playNextAudio();
        } catch (localError) {
            console.error("Local audio generation failed:", localError);
            updateStatus("Error: Unable to play audio response");
            isPlaying = false;
            playNextAudio();
        }
    }
}

// Stop speech recognition
function stopRecognition() {
    if (recognition && isRecording) {
        recognition.stop();
        isRecording = false;
        updateStatus("Ready");
        console.log("Speech recognition stopped manually.");
        clearTimeout(recognitionTimeout);
    }
}

// Firebase authentication state change handler
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        user.getIdToken().then(token => {
            window.appData.authToken = token;
            window.appData.uid = user.uid;
            console.log("Firebase idToken updated:", token.substring(0, 20) + "...");
            console.log("User authenticated:", user.uid);
            initializeVoiceBot();
        });
    } else {
        console.log("User not authenticated");
        window.location.href = '/login';
    }
});

// Add event listener for stop button
document.addEventListener('DOMContentLoaded', () => {
    const stopButton = document.getElementById('stopButton');
    if (stopButton) {
        stopButton.addEventListener('click', stopRecognition);
    }

    // Check microphone permissions on load
    checkMicPermission().then(hasPermission => {
        if (hasPermission && !isRecording && !isPlaying && !isProcessing) {
            recognition.start();
        }
    });
});