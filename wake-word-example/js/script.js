// Neural Wake Assistant - Main Script

// Global variables
let recognition;
let isListening = false;
let isRecording = false;
let mediaStream;
let audioContext;
let analyser;
let audioChunks = [];
let lastAudioActivityTime = Date.now();
let silenceTimeoutId;
let audioActivityIntervalId;
let backgroundNoiseLevel = 0; // Track background noise baseline
let noiseCalibrationSamples = [];
let continuousCalibrationIntervalId; // For ongoing background noise monitoring
let currentMediaRecorder = null; // Store current MediaRecorder instance for force stopping

// Configuration settings with defaults
const config = {
    keywords: ["Hey Luna", "Hallo Luna", "Ey Luna", "Okay Luna", "Luna"],
    emergencyKeyword: "luna stop", // Single emergency stop keyword
    stopKeywords: [
        "stop recording", "stop aufnahme", "aufnahme stoppen", 
        "recording stop", "aufnahme stop", "stopp aufnahme",
        "end recording", "recording end", "aufnahme beenden",
        "stop listening", "stop zuhören", "zuhören stoppen",
        "end listening", "zuhören beenden", "beende zuhören",
        "beende aufnahme"
    ], // Multiple stop recording keywords
    silenceTimeout: 4, // seconds - increased from 2 to 4 for more natural speech
    threshold: 0.7,
    language: 'de-DE'
};

// DOM Elements - Initialized in init function
let statusElement;
let transcriptDisplay;
let startBtn;
let stopBtn;
let micInfo;
let recordingBar;
let newKeywordInput;
let addKeywordBtn;
let keywordListElement;
let silenceTimeoutSlider;
let thresholdSlider;
let timeoutValueDisplay;
let thresholdDisplay;

// Modal elements  
let configModal;
let closeButtons;
let addKeywordBtnModal;
let newKeywordModal;
let silenceTimeoutSliderModal;
let thresholdSliderModal;
let timeoutValueDisplayModal;
let thresholdDisplayModal;
let keywordListModal; // This is for modal keywords list

// Emergency stop keyword elements
let emergencyKeywordInput;
let emergencyKeywordDisplay;

// Stop keywords elements
let newStopKeywordModal;
let addStopKeywordBtnModal;
let stopKeywordListModal;

// Module for UI Operations
const uiOperations = {
    updateStatus(message, type = '') {
        const statusTextElement = document.querySelector('.status-text');
        if (statusTextElement) {
            statusTextElement.textContent = message;
            statusElement.className = `status-display ${type}`;
        }
        this.renderKeywordList();
    },

    deleteKeyword(keyword) {
        const index = config.keywords.indexOf(keyword);
        if (index > -1) {
            config.keywords.splice(index, 1);
            uiOperations.renderKeywordList();
            uiOperations.renderKeywordListModal(); // Update modal list too
            console.log('Deleted keyword:', keyword);
            uiOperations.updateStatus(`Removed keyword: ${keyword}`);
        }
    },

    showTranscript(fullTranscript, detectedKeywords = []) {
        if (!transcriptDisplay) return;
        
        // Get last 70 characters
        let displayText = fullTranscript.length > 70 
            ? '...' + fullTranscript.slice(-67) 
            : fullTranscript;
        
        // Clear any existing timeout
        if (this.transcriptTimeout) {
            clearTimeout(this.transcriptTimeout);
        }
        
        // Highlight keywords if any were detected
        if (detectedKeywords.length > 0) {
            // Create HTML with highlighted keywords
            let htmlContent = displayText;
            
            // Replace each detected keyword with highlighted version
            detectedKeywords.forEach(keyword => {
                const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                htmlContent = htmlContent.replace(regex, '<span class="transcript-keyword flash">$1</span>');
            });
            
            transcriptDisplay.innerHTML = htmlContent;
        } else {
            // No keywords detected, show as plain text
            transcriptDisplay.textContent = displayText;
        }
        
        // Show the transcript
        transcriptDisplay.classList.remove('fade-out');
        transcriptDisplay.classList.add('show');
        
        // Set timeout to fade out after 2 seconds
        this.transcriptTimeout = setTimeout(() => {
            transcriptDisplay.classList.remove('show');
            transcriptDisplay.classList.add('fade-out');
            
            // Clear the text after fade animation completes
            setTimeout(() => {
                if (transcriptDisplay.classList.contains('fade-out')) {
                    transcriptDisplay.textContent = '';
                    transcriptDisplay.innerHTML = '';
                }
            }, 300); // Match CSS transition duration
        }, 2000);
    },

    deleteStopKeyword(keyword) {
        const index = config.stopKeywords.indexOf(keyword);
        if (index > -1) {
            config.stopKeywords.splice(index, 1);
            uiOperations.renderStopKeywordListModal();
            console.log('Deleted stop keyword:', keyword);
            uiOperations.updateStatus(`Removed stop keyword: ${keyword}`);
        }
    },

    addStopKeyword(keyword) {
        if (keyword && !config.stopKeywords.includes(keyword)) {
            config.stopKeywords.push(keyword);
            uiOperations.renderStopKeywordListModal();
            
            // Update status
            uiOperations.updateStatus(`Added stop keyword: ${keyword}`);
            return true;
        }
        return false;
    },

    addStopKeywordFromModal() {
        const keyword = newStopKeywordModal.value.trim();
        if (uiOperations.addStopKeyword(keyword)) {
            newStopKeywordModal.value = '';
            console.log('Added stop keyword:', keyword);
            return true;
        }
        return false;
    },

    updateEmergencyKeyword() {
        const keyword = emergencyKeywordInput.value.trim();
        if (keyword && keyword !== config.emergencyKeyword) {
            config.emergencyKeyword = keyword;
            emergencyKeywordDisplay.textContent = keyword;
            uiOperations.updateStatus(`Emergency keyword updated: ${keyword}`);
        }
    },

    renderStopKeywordListModal() {
        stopKeywordListModal.innerHTML = '';
        
        config.stopKeywords.forEach(keyword => {
            // Create tag-style element for modal with delete button
            const tagContainer = document.createElement('div');
            tagContainer.className = 'keyword-item';
            
            const tagItem = document.createElement('span');
            tagItem.textContent = keyword;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = function() { 
                uiOperations.deleteStopKeyword(keyword); 
            };
            
            tagContainer.appendChild(tagItem);
            tagContainer.appendChild(deleteBtn);
            stopKeywordListModal.appendChild(tagContainer);
        });
    },

    renderKeywordList() {
        keywordListElement.innerHTML = '';
        
        config.keywords.forEach(keyword => {
            // Create tag-style element for main UI (no delete button)
            const tagItem = document.createElement('div');
            tagItem.className = 'keyword-tag';
            tagItem.textContent = keyword;
            
            keywordListElement.appendChild(tagItem);
        });
    },

    renderKeywordListModal() {
        keywordListModal.innerHTML = '';
        
        config.keywords.forEach(keyword => {
            // Create tag-style element for modal with delete button
            const tagContainer = document.createElement('div');
            tagContainer.className = 'keyword-item';
            
            const tagItem = document.createElement('span');
            tagItem.textContent = keyword;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'x';
            deleteBtn.onclick = function() { 
                uiOperations.deleteKeyword(keyword); 
            };
            
            tagContainer.appendChild(tagItem);
            tagContainer.appendChild(deleteBtn);
            keywordListModal.appendChild(tagContainer);
        });
        this.renderKeywordList();
    },

    updateThresholdDisplay() {
        const value = parseFloat(thresholdSlider.value);
        if (!isNaN(value)) {
            thresholdDisplay.textContent = value.toFixed(2);
            config.threshold = value;
        }
    },

    updateThresholdDisplayFromModal() {
        const value = parseFloat(thresholdSliderModal.value);
        if (!isNaN(value)) {
            thresholdDisplayModal.textContent = value.toFixed(2);
            config.threshold = value;
        }
    },

    addKeyword(keyword) {
        if (keyword && !config.keywords.includes(keyword)) {
            config.keywords.push(keyword);
            uiOperations.renderKeywordList();
            uiOperations.renderKeywordListModal(); // Update modal list too
            newKeywordInput.value = '';
            
            // Update status
            uiOperations.updateStatus(`Added keyword: ${keyword}`);
            return true;
        }
        return false;
    },

    addKeywordFromModal() {
        const keyword = newKeywordModal.value.trim();
        if (uiOperations.addKeyword(keyword)) {
            newKeywordModal.value = '';
            console.log('Added keyword:', keyword);
            
            // Close modal - this will be handled by the event listener
            return true;
        }
        return false;
    },

    updateSettings() {
        const silenceTimeout = parseFloat(silenceTimeoutSlider.value);
        if (!isNaN(silenceTimeout) && silenceTimeout >= 1 && silenceTimeout <= 10) {
            config.silenceTimeout = silenceTimeout;
            timeoutValueDisplay.textContent = silenceTimeout.toFixed(1);
        }
    },

    updateSettingsFromModal() {
        const silenceTimeout = parseFloat(silenceTimeoutSliderModal.value);
        if (!isNaN(silenceTimeout) && silenceTimeout >= 1 && silenceTimeout <= 10) {
            config.silenceTimeout = silenceTimeout;
            timeoutValueDisplayModal.textContent = silenceTimeout.toFixed(1);
            timeoutValueDisplay.textContent = silenceTimeout.toFixed(1); // Also update main UI
        }
    },

    initUIElements() {
        // Initialize all DOM elements that depend on the page being loaded
        statusElement = document.getElementById('status');
        transcriptDisplay = document.getElementById('transcriptDisplay');
        startBtn = document.getElementById('startBtn');
        stopBtn = document.getElementById('stopBtn');
        micInfo = document.getElementById('micInfo');
        recordingBar = document.getElementById('recordingBar');
        newKeywordInput = document.getElementById('newKeyword');
        addKeywordBtn = document.getElementById('addKeywordBtn');
        keywordListElement = document.getElementById('keywordList');
        silenceTimeoutSlider = document.getElementById('silenceTimeout');
        thresholdSlider = document.getElementById('thresholdValue');
        timeoutValueDisplay = document.getElementById('timeoutValueDisplay');
        thresholdDisplay = document.getElementById('thresholdDisplay');

        // Modal elements
        configModal = document.getElementById('configModal');
        closeButtons = document.querySelectorAll('.close');
        addKeywordBtnModal = document.getElementById('addKeywordBtnModal');
        newKeywordModal = document.getElementById('newKeywordModal');
        silenceTimeoutSliderModal = document.getElementById('silenceTimeoutModal');
        thresholdSliderModal = document.getElementById('thresholdValueModal');
        timeoutValueDisplayModal = document.getElementById('timeoutValueDisplayModal');
        thresholdDisplayModal = document.getElementById('thresholdDisplayModal');
        keywordListModal = document.getElementById('keywordListModal');

        // Emergency keyword elements
        emergencyKeywordInput = document.getElementById('emergencyKeywordInput');
        emergencyKeywordDisplay = document.getElementById('emergencyKeywordDisplay');

        // Stop keywords elements
        newStopKeywordModal = document.getElementById('newStopKeywordModal');
        addStopKeywordBtnModal = document.getElementById('addStopKeywordBtnModal');
        stopKeywordListModal = document.getElementById('stopKeywordListModal');

        // Set up event listeners
        uiOperations.setupEventListeners();
    },

    setupEventListeners() {
        startBtn.addEventListener('click', appLogic.startListening);
        stopBtn.addEventListener('click', appLogic.stopListening);

        // Add language selection listener
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', function() {
                config.language = this.value;
                uiOperations.updateStatus(`Language set to: ${this.options[this.selectedIndex].text}`);
                
                // If currently listening, restart recognition with new language
                if (isListening && recognition) {
                    recognition.stop();
                    recognition.lang = config.language;
                    recognition.start();
                }
            });
        }

        // Modal event listeners
        addKeywordBtnModal.addEventListener('click', uiOperations.addKeywordFromModal);
        newKeywordModal.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                uiOperations.addKeywordFromModal();
            }
        });

        // Stop keywords event listeners
        if (addStopKeywordBtnModal) {
            addStopKeywordBtnModal.addEventListener('click', uiOperations.addStopKeywordFromModal);
        }
        if (newStopKeywordModal) {
            newStopKeywordModal.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    uiOperations.addStopKeywordFromModal();
                }
            });
        }

        // Emergency keyword event listeners
        if (emergencyKeywordInput) {
            emergencyKeywordInput.addEventListener('blur', uiOperations.updateEmergencyKeyword);
            emergencyKeywordInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    this.blur(); // Trigger the blur event
                }
            });
        }

        // Settings modal listeners
        silenceTimeoutSliderModal.addEventListener('input', uiOperations.updateSettingsFromModal);
        thresholdSliderModal.addEventListener('input', uiOperations.updateThresholdDisplayFromModal);

        // Close modal event listeners
        closeButtons.forEach(button => {
            button.addEventListener('click', function() {
                configModal.style.display = 'none';
            });
        });

        // Close modal when clicking outside of content area
        window.addEventListener('click', function(event) {
            if (event.target === configModal) {
                configModal.style.display = 'none';
            }
        });

        // Configure button in status display
        const configBtn = document.getElementById('configBtn');
        if (configBtn) {
            configBtn.addEventListener('click', function() {
                configModal.style.display = 'block';
            });
        }

        // Initialize keyword lists on page load
        uiOperations.renderKeywordListModal();
        uiOperations.renderStopKeywordListModal();
        
        // Initialize emergency keyword display
        if (emergencyKeywordInput && emergencyKeywordDisplay) {
            emergencyKeywordInput.value = config.emergencyKeyword;
            emergencyKeywordDisplay.textContent = config.emergencyKeyword;
        }
    }
};

// Module for App Logic
const appLogic = {
    startListening() {
        try {
            // First, get microphone access
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaStream = stream;
                    
                    // Initialize audio context if needed
                    if (!audioContext) {
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }
                    
                    micInfo.textContent = 'Microphone access granted';
                    uiOperations.updateStatus('Calibrating background noise...', 'status-listening');
                    
                    // Calibrate background noise level first
                    appLogic.calibrateBackgroundNoise(stream).then(() => {
                        uiOperations.updateStatus('Listening...', 'status-listening');
                        
                        // Start continuous background monitoring
                        appLogic.startContinuousNoiseMonitoring(stream);
                    });
                    
                    // Initialize speech recognition if not already done
                    if (!recognition) {
                        appLogic.initSpeechRecognition();
                    }
                    
                    // Start speech recognition with selected language
                    recognition.lang = config.language;
                    recognition.start();
                    isListening = true;
                    
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                })
                .catch(err => {
                    console.error('Error accessing microphone:', err);
                    uiOperations.updateStatus('Microphone access denied', 'status-listening');
                    micInfo.textContent = `Microphone error: ${err.message}`;
                });
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            uiOperations.updateStatus('Speech recognition failed to start', 'status-listening');
            micInfo.textContent = 'Error: ' + error.message;
        }
    },

    processRecognitionResults(event) {
        let transcript = '';
        
        // Handle multiple result sets correctly
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].length > 0) {
                transcript += event.results[i][0].transcript;
            }
        }
        
        transcript = transcript.toLowerCase().trim();
        console.log("Transcript:", transcript);
        
        // Check for emergency stop command first (highest priority)
        if (transcript.includes(config.emergencyKeyword)) {
            console.log("Emergency stop command detected:", config.emergencyKeyword);
            
            // Force stop everything and reset to initial state
            appLogic.emergencyStop();
            uiOperations.updateStatus('Emergency stop - System reset', 'status-listening');
            setTimeout(() => {
                uiOperations.updateStatus('Ready to start listening', 'status-listening');
            }, 2000);
            return; // Exit early, don't process other commands
        }
        
        // Check for detected keywords first
        let detectedKeywords = [];
        let keywordDetected = false;
        
        // Check if any wake word is detected in the transcript
        for (let i = 0; i < config.keywords.length; i++) {
            if (transcript.includes(config.keywords[i].toLowerCase())) {
                detectedKeywords.push(config.keywords[i]);
                keywordDetected = true;
            }
        }
        
        // Show the transcript with keyword highlighting only when recording
        if (transcript && isRecording) {
            uiOperations.showTranscript(transcript, detectedKeywords);
        }
        
        // Process wake word detection
        if (keywordDetected) {
            const firstDetectedKeyword = detectedKeywords[0];
            uiOperations.updateStatus(`Wake word detected: ${firstDetectedKeyword}`, 'status-recording');
            
            console.log("Wake word activated:", firstDetectedKeyword);
            
            // Start recording with context
            appLogic.startRecordingWithContext(transcript);
        }
        
        // Check for special commands
        if (transcript.includes('background-calibration') || transcript.includes('background calibration')) {
            console.log("Background calibration command detected");
            uiOperations.updateStatus('Recalibrating background noise...', 'status-listening');
            
            // Recalibrate background noise
            if (mediaStream) {
                appLogic.calibrateBackgroundNoise(mediaStream).then(() => {
                    uiOperations.updateStatus('Background noise recalibrated - Listening...', 'status-listening');
                    setTimeout(() => {
                        uiOperations.updateStatus('Listening...', 'status-listening');
                    }, 2000); // Show confirmation message for 2 seconds
                });
            }
        }
        
        // Check for manual stop recording commands (fallback when automatic detection fails)
        for (const stopCommand of config.stopKeywords) {
            if (transcript.includes(stopCommand)) {
                console.log("Manual stop recording command detected:", stopCommand);
                
                if (isRecording) {
                    // Force stop the current recording
                    appLogic.forceStopRecording();
                    uiOperations.updateStatus('Recording stopped manually - Listening...', 'status-listening');
                    setTimeout(() => {
                        uiOperations.updateStatus('Listening...', 'status-listening');
                    }, 2000);
                } else {
                    console.log("Stop command detected but not currently recording");
                }
                break;
            }
        }
    },

    startRecordingWithContext(transcript) {
        if (!mediaStream) return;
        
        try {
            isRecording = true;
            
            // Reset silence timer when starting to record  
            lastAudioActivityTime = Date.now();
            
            uiOperations.updateStatus('Recording...', 'status-recording');
            
            // Create a MediaRecorder to capture audio
            const mediaRecorder = new MediaRecorder(mediaStream);
            currentMediaRecorder = mediaRecorder; // Store for force stopping
            audioChunks = [];
            
            // Setup the ondataavailable handler for actual audio capture
            mediaRecorder.ondataavailable = function(event) {
                if (event.data.size > 0) {
                    // Collect all the chunks for later processing 
                    audioChunks.push(event.data);
                    
                    // Don't reset silence timer here - let the audio analysis handle it
                    // lastAudioActivityTime = Date.now();
                }
            };
            
            mediaRecorder.onerror = function(error) {
                console.error('MediaRecorder error:', error);
            };
            
            // Set up audio analysis for better activity detection
            if (mediaStream && !analyser) {
                audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048; // Higher resolution for better accuracy
                analyser.smoothingTimeConstant = 0.8; // Smoother analysis
                
                const source = audioContext.createMediaStreamSource(mediaStream);
                source.connect(analyser);
                
                // Create an AudioBuffer for processing
                const bufferSize = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferSize);
                
                function checkAudioActivity() {
                    if (isRecording) {
                        analyser.getByteFrequencyData(dataArray);
                        
                        let total = 0;
                        let maxValue = 0;
                        let speechFrequencyCount = 0;
                        
                        // Analyze frequency spectrum for speech patterns
                        for (let i = 0; i < bufferSize; i++) {
                            total += dataArray[i];
                            maxValue = Math.max(maxValue, dataArray[i]);
                            
                            // Count frequencies in speech range (roughly 300Hz-3400Hz)
                            // Assuming 44.1kHz sample rate, speech range is roughly bins 15-155
                            if (i >= 15 && i <= 155 && dataArray[i] > 20) {
                                speechFrequencyCount++;
                            }
                        }
                        
                        const average = total / bufferSize;
                        
                        // Adaptive thresholds based on background noise
                        const noiseMargin = 15; // Margin above background noise
                        const adaptiveThreshold = Math.max(25, backgroundNoiseLevel + noiseMargin);
                        const peakThreshold = Math.max(45, backgroundNoiseLevel + (noiseMargin * 2));
                        const speechFrequencyThreshold = 10; // Minimum speech-like frequencies
                        
                        // Emergency detection: if average is way above our threshold, environment changed
                        // Allow recording to stop if noise suddenly increased mid-recording
                        const emergencyThreshold = backgroundNoiseLevel + 40; // Much higher threshold
                        const isEmergencyNoise = average > emergencyThreshold && speechFrequencyCount < 5;
                        
                        // Log audio levels for debugging (but less frequently to avoid spam)
                        if (Math.random() < 0.05) { // Log only 5% of the time
                            console.log('Audio - Avg:', average.toFixed(1), 'Peak:', maxValue, 'Speech freqs:', speechFrequencyCount, 'BG noise:', backgroundNoiseLevel.toFixed(1), 'Threshold:', adaptiveThreshold.toFixed(1));
                        }
                        
                        if (isEmergencyNoise) {
                            console.log(`Emergency noise detected - avg: ${average.toFixed(1)}, emergency threshold: ${emergencyThreshold.toFixed(1)}, speech freqs: ${speechFrequencyCount}`);
                            // Don't reset lastAudioActivityTime, let recording timeout naturally
                        } else {
                            // Normal speech detection logic
                            const hasStrongSignal = (average > adaptiveThreshold || maxValue > peakThreshold);
                            const hasSpeechPattern = speechFrequencyCount > speechFrequencyThreshold;
                            
                            if (hasStrongSignal && hasSpeechPattern) { 
                                lastAudioActivityTime = Date.now();
                                console.log('Speech detected - Avg:', average.toFixed(1), 'Peak:', maxValue, 'Speech freqs:', speechFrequencyCount);
                            }
                        }
                    }
                }
                
                // Check audio every 100ms for better responsiveness  
                if (audioActivityIntervalId) {
                    clearInterval(audioActivityIntervalId);
                }
                audioActivityIntervalId = setInterval(checkAudioActivity, 100);
            }
            
            // Set up silence detection with configurable timeout for the recording
            appLogic.setupSilenceDetection(mediaRecorder);
            
            // Start recording with a timeslice to ensure ondataavailable is called
            mediaRecorder.start(100); // Request data every 100ms
            
        } catch (error) {
            console.error('Error starting recording with context:', error);
            uiOperations.updateStatus('Recording failed', 'status-listening');
        }
    },

    setupSilenceDetection(mediaRecorder) {
        // Clear any existing timeout
        if (silenceTimeoutId) {
            clearTimeout(silenceTimeoutId);
        }
        
        const checkSilence = () => {
            if (!isRecording) return;
            
            const now = Date.now();
            const elapsedSinceLastActivity = now - lastAudioActivityTime;            
            
            // Update the recording bar indicator (progressive)
            const progressPercentage = Math.min(100, (elapsedSinceLastActivity / (config.silenceTimeout * 1000)) * 100);
            recordingBar.style.width = `${progressPercentage}%`;
            
            // Log progress for debugging
            if (elapsedSinceLastActivity > 1000) { // Only log after 1 second
                console.log(`Silence progress: ${(elapsedSinceLastActivity/1000).toFixed(1)}s / ${config.silenceTimeout}s (${progressPercentage.toFixed(0)}%)`);
            }
            
            // If no audio activity detected for silence timeout period
            if (elapsedSinceLastActivity > config.silenceTimeout * 1000) {
                console.log('Silence timeout reached, stopping recording');
                
                try {
                    // Stop the media recorder
                    mediaRecorder.stop();
                    
                    // Combine all collected chunks into one audio blob
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    console.log('Audio recorded successfully', audioBlob.size, 'bytes');
                    
                    // Reset recording state
                    isRecording = false;
                    uiOperations.updateStatus('Listening...', 'status-listening');
                    recordingBar.style.width = '0%';
                    
                    // Clear the audio activity interval when recording stops
                    if (audioActivityIntervalId) {
                        clearInterval(audioActivityIntervalId);
                        audioActivityIntervalId = null;
                    }
                } catch (error) {
                    console.error('Error stopping recorder:', error);
                }
                
                return;
            }
            
            // Check again in 500ms
            silenceTimeoutId = setTimeout(checkSilence, 500);
        };
        
        // Start checking for silence after a short delay to allow recording to start properly
        silenceTimeoutId = setTimeout(checkSilence, 1000); 
    },

    forceStopRecording() {
        console.log('Force stopping recording...');
        
        if (!isRecording) {
            console.log('Not currently recording, nothing to stop');
            return;
        }
        
        try {
            // Clear the silence timeout
            if (silenceTimeoutId) {
                clearTimeout(silenceTimeoutId);
                silenceTimeoutId = null;
            }
            
            // Clear the audio activity interval
            if (audioActivityIntervalId) {
                clearInterval(audioActivityIntervalId);
                audioActivityIntervalId = null;
            }
            
            // Stop the MediaRecorder properly (like silence detection)
            if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
                currentMediaRecorder.stop();
                console.log('MediaRecorder stopped via force stop');
            } else {
                // Fallback: if MediaRecorder not available, create blob from chunks
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                console.log('Recording force stopped, audio saved:', audioBlob.size, 'bytes');
                // Note: MediaRecorder's onstop event will handle the upload
            }
            
            // Reset recording state (same as silence detection)
            isRecording = false;
            uiOperations.updateStatus('Listening...', 'status-listening');
            recordingBar.style.width = '0%';
            
            // Reset the last activity time for next recording
            lastAudioActivityTime = Date.now();
            
        } catch (error) {
            console.error('Error force stopping recording:', error);
            // Ensure we reset the state even if there's an error
            isRecording = false;
            recordingBar.style.width = '0%';
        }
    },

    emergencyStop() {
        console.log('Emergency stop activated - resetting all systems');
        
        // Force stop recording if active
        if (isRecording && currentMediaRecorder) {
            try {
                if (currentMediaRecorder.state === 'recording') {
                    currentMediaRecorder.stop();
                }
                currentMediaRecorder = null;
            } catch (error) {
                console.warn('Error stopping MediaRecorder during emergency stop:', error);
            }
        }
        
        // Reset all recording state
        isRecording = false;
        isListening = false;
        
        // Clear all timeouts and intervals
        if (silenceTimeoutId) {
            clearTimeout(silenceTimeoutId);
            silenceTimeoutId = null;
        }
        
        if (audioActivityIntervalId) {
            clearInterval(audioActivityIntervalId);
            audioActivityIntervalId = null;
        }
        
        if (continuousCalibrationIntervalId) {
            clearInterval(continuousCalibrationIntervalId);
            continuousCalibrationIntervalId = null;
        }
        
        // Clear transcript timeout if exists
        if (uiOperations.transcriptTimeout) {
            clearTimeout(uiOperations.transcriptTimeout);
            uiOperations.transcriptTimeout = null;
        }
        
        // Reset UI elements
        recordingBar.style.width = '0%';
        transcriptDisplay.textContent = '';
        transcriptDisplay.innerHTML = '';
        transcriptDisplay.classList.remove('show', 'fade-out');
        
        // Stop all media streams
        if (mediaStream) {
            const tracks = mediaStream.getTracks();
            tracks.forEach(track => track.stop());
            mediaStream = null;
        }
        
        // Reset audio analysis
        if (analyser) {
            analyser = null;
        }
        
        // Close audio context
        if (audioContext) {
            audioContext.close().then(() => {
                audioContext = null;
            }).catch(err => {
                console.warn('Error closing audio context during emergency stop:', err);
                audioContext = null;
            });
        }
        
        // Stop speech recognition
        if (recognition) {
            try {
                recognition.stop();
            } catch (error) {
                console.warn('Error stopping speech recognition during emergency stop:', error);
            }
        }
        
        // Reset UI buttons
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        // Reset background noise calibration
        backgroundNoiseLevel = 0;
        noiseCalibrationSamples = [];
        audioChunks = [];
        
        // Reset timing variables
        lastAudioActivityTime = Date.now();
        
        console.log('Emergency stop completed - system reset to initial state');
    },

    calibrateBackgroundNoise(stream) {
        return new Promise((resolve) => {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Create a new temporary analyser for calibration
            const tempAnalyser = audioContext.createAnalyser();
            tempAnalyser.fftSize = 2048;
            tempAnalyser.smoothingTimeConstant = 0.8;
            
            // Create a new source node for calibration
            const tempSource = audioContext.createMediaStreamSource(stream);
            tempSource.connect(tempAnalyser);
            
            const bufferSize = tempAnalyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferSize);
            noiseCalibrationSamples = [];
            
            let sampleCount = 0;
            const maxSamples = 30; // Calibrate for 3 seconds (30 samples at 100ms intervals)
            
            console.log('Starting background noise calibration...');
            
            const calibrationInterval = setInterval(() => {
                tempAnalyser.getByteFrequencyData(dataArray);
                
                let total = 0;
                for (let i = 0; i < bufferSize; i++) {
                    total += dataArray[i];
                }
                const average = total / bufferSize;
                noiseCalibrationSamples.push(average);
                
                sampleCount++;
                
                // Show progress in console
                if (sampleCount % 10 === 0) {
                    console.log(`Calibration progress: ${sampleCount}/30 samples`);
                }
                
                if (sampleCount >= maxSamples) {
                    clearInterval(calibrationInterval);
                    
                    // Calculate background noise level (median of samples to avoid outliers)
                    noiseCalibrationSamples.sort((a, b) => a - b);
                    const oldNoiseLevel = backgroundNoiseLevel;
                    const rawNoiseLevel = noiseCalibrationSamples[Math.floor(noiseCalibrationSamples.length / 2)];
                    
                    // Add a buffer of 5-7 points for good measure (random between 5-7)
                    const noiseBuffer = 5 + Math.random() * 2; // Random between 5 and 7
                    backgroundNoiseLevel = rawNoiseLevel + noiseBuffer;
                    
                    console.log(`Background noise calibrated: ${backgroundNoiseLevel.toFixed(1)} (raw: ${rawNoiseLevel.toFixed(1)} + buffer: ${noiseBuffer.toFixed(1)}, was: ${oldNoiseLevel.toFixed(1)})`);
                    
                    // Disconnect the temporary analyzer
                    tempSource.disconnect();
                    
                    resolve();
                }
            }, 100);
        });
    },

    startContinuousNoiseMonitoring(stream) {
        // Only monitor when listening but not recording
        if (continuousCalibrationIntervalId) {
            clearInterval(continuousCalibrationIntervalId);
        }
        
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create a dedicated analyser for continuous monitoring
        const monitorAnalyser = audioContext.createAnalyser();
        monitorAnalyser.fftSize = 2048;
        monitorAnalyser.smoothingTimeConstant = 0.9; // More smoothing for background monitoring
        
        const monitorSource = audioContext.createMediaStreamSource(stream);
        monitorSource.connect(monitorAnalyser);
        
        const bufferSize = monitorAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferSize);
        let monitorSamples = [];
        let sampleCount = 0;
        const recalibrationThreshold = 50; // Recalibrate every 50 samples (5 seconds)
        
        console.log('Starting continuous background noise monitoring...');
        
        continuousCalibrationIntervalId = setInterval(() => {
            // Only monitor when listening but not recording
            if (isListening && !isRecording) {
                monitorAnalyser.getByteFrequencyData(dataArray);
                
                let total = 0;
                for (let i = 0; i < bufferSize; i++) {
                    total += dataArray[i];
                }
                const average = total / bufferSize;
                monitorSamples.push(average);
                sampleCount++;
                
                // Recalibrate every 5 seconds (50 samples at 100ms intervals)
                if (sampleCount >= recalibrationThreshold) {
                    // Calculate new background noise level
                    monitorSamples.sort((a, b) => a - b);
                    const rawNoiseLevel = monitorSamples[Math.floor(monitorSamples.length / 2)];
                    
                    // Add buffer
                    const noiseBuffer = 5 + Math.random() * 2;
                    const newBackgroundLevel = rawNoiseLevel + noiseBuffer;
                    
                    // Only update if the change is significant (more than 3 points difference)
                    const difference = Math.abs(newBackgroundLevel - backgroundNoiseLevel);
                    if (difference > 3) {
                        const oldLevel = backgroundNoiseLevel;
                        
                        // Prevent setting background noise too low (minimum of 10)
                        // This prevents issues when environment gets louder during recording
                        backgroundNoiseLevel = Math.max(10, newBackgroundLevel);
                        
                        // Also prevent huge jumps upward (max 50% increase at once)
                        if (oldLevel > 0 && backgroundNoiseLevel > oldLevel * 1.5) {
                            backgroundNoiseLevel = oldLevel * 1.5;
                            console.log(`Background noise increase capped at 50%: ${backgroundNoiseLevel.toFixed(1)} (would have been: ${newBackgroundLevel.toFixed(1)})`);
                        } else {
                            console.log(`Background noise auto-updated: ${backgroundNoiseLevel.toFixed(1)} (was: ${oldLevel.toFixed(1)}, change: ${(backgroundNoiseLevel - oldLevel).toFixed(1)})`);
                        }
                    }
                    
                    // Reset for next calibration cycle
                    monitorSamples = [];
                    sampleCount = 0;
                }
            }
        }, 100); // Check every 100ms
    },

    stopListening() {
        isListening = false;
        isRecording = false;
        
        uiOperations.updateStatus('Ready to start listening', 'status-listening');
        
        // Clear any existing timeouts and intervals
        if (silenceTimeoutId) {
            clearTimeout(silenceTimeoutId);
            silenceTimeoutId = null;
        }
        
        if (audioActivityIntervalId) {
            clearInterval(audioActivityIntervalId);
            audioActivityIntervalId = null;
        }
        
        if (continuousCalibrationIntervalId) {
            clearInterval(continuousCalibrationIntervalId);
            continuousCalibrationIntervalId = null;
        }
        
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        if (mediaStream) {
            const tracks = mediaStream.getTracks();
            tracks.forEach(track => track.stop());
            mediaStream = null;
        }
        
        // Reset audio analysis
        if (analyser) {
            analyser = null;
        }
        
        if (audioContext) {
            audioContext.close().then(() => {
                audioContext = null;
            }).catch(err => {
                console.warn('Error closing audio context:', err);
                audioContext = null;
            });
        }
        
        // Stop speech recognition
        if (recognition) {
            recognition.stop();
        }
        
        // Reset recording state and clear intervals
        isRecording = false;
        recordingBar.style.width = '0%';
        
        // Reset background noise calibration
        backgroundNoiseLevel = 0;
        noiseCalibrationSamples = [];
    },

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            uiOperations.updateStatus('Speech recognition not supported', 'status-listening');
            micInfo.textContent = 'This feature requires SpeechRecognition API support';
            startBtn.disabled = true;
            return null;
        }
        
        // Initialize speech recognition
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false; 
        
        recognition.onresult = appLogic.processRecognitionResults;
        
        recognition.onerror = function(event) {
            console.log('Speech recognition event:', event.error);
            
            // Don't treat "no-speech" as an error - it's normal when recording
            if (event.error === 'no-speech') {
                console.log('No speech detected - this is normal during recording');
                return;
            }
            
            console.error('Speech recognition error:', event.error);
            uiOperations.updateStatus(`Speech recognition error: ${event.error}`, 'status-listening');
            micInfo.textContent = 'Speech recognition failed';
            
            // Only restart on certain errors and if we're still listening
            if (isListening && !isRecording && ['network', 'audio-capture', 'not-allowed'].includes(event.error)) {
                setTimeout(() => {
                    try {
                        if (isListening && recognition) {
                            recognition.start();
                        }
                    } catch (err) {
                        console.warn('Could not restart speech recognition:', err.message);
                    }
                }, 1000);
            }
        };
        
        recognition.onend = function() {
            // Only restart if we're listening but not recording
            if (isListening && !isRecording) {
                setTimeout(() => {
                    try {
                        if (isListening && !isRecording) {
                            recognition.start();
                        }
                    } catch (err) {
                        console.warn('Could not restart speech recognition:', err.message);
                    }
                }, 100); 
            }
        };
        
        return recognition;
    },

    init(configData) {
        Object.assign(config, configData);
        uiOperations.initUIElements();
        
        // Initialize the recognition object when app starts
        if (!recognition) {
            appLogic.initSpeechRecognition();
        }
        
        console.log("WakeWordExample initialized with configuration:", config);
    }
};

// Initialize the application
window.addEventListener('load', function() {
    // Ensure all required elements are loaded before initialization
    const initApp = function() {
        // Check if DOM is ready first  
        if (document.getElementById('startBtn') && document.getElementById('stopBtn')) {
            appLogic.init(config);
        } else {
            setTimeout(initApp, 100); // Retry if not ready yet
        }
    };
    
    initApp();
});

// Export modules for use in background.js or other files
window.appLogic = appLogic;
window.uiOperations = uiOperations;
