// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    // Get references to the DOM elements
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const voiceButton = document.getElementById('voice-button');

    // State variables to track listening and speaking status
    let isListening = false;
    let isSpeaking = false;
    let recognition = null; // Variable to hold the SpeechRecognition instance
    let synth = null; // Variable to hold the SpeechSynthesis instance

    // Flag to remember if the voice button was explicitly disabled due to a non-recoverable error like permissions
    let isVoiceButtonPermanentlyDisabled = false;

    console.log("DOM fully loaded. Initializing chatbot.");

    // --- Helper Function to Update Button States ---
    // Centralized function to manage button enabled/disabled states and visual appearance
    function updateButtonStates() {
        // Buttons are disabled if currently listening or speaking,
        // UNLESS the voice button is permanently disabled (text input/send are still disabled if speaking/listening).

        const shouldBeDisabled = isListening || isSpeaking;

        userInput.disabled = shouldBeDisabled;
        sendButton.disabled = shouldBeDisabled;

        // Voice button has slightly more complex logic
        if (isVoiceButtonPermanentlyDisabled) {
            voiceButton.disabled = true; // Stays disabled
            voiceButton.textContent = "Voice Disabled"; // Change text for user feedback
             // Maybe change icon too? Need to get the <i> tag inside. Let's update aria-label only.
             voiceButton.ariaLabel = "Voice input disabled";
             // No pulsing if permanently disabled
             voiceButton.classList.remove('listening');

        } else {
             // If not permanently disabled, button state is controlled by listening/speaking
            voiceButton.disabled = shouldBeDisabled;

            // Update button text and listening class based on temporary state
            if (isListening) {
                 voiceButton.textContent = "Stop Speaking";
                 voiceButton.classList.add('listening');
                 voiceButton.ariaLabel = "Stop Speaking";
            } else {
                 voiceButton.textContent = "Start Speaking";
                 voiceButton.classList.remove('listening');
                 voiceButton.ariaLabel = "Start Speaking";
             }
             // Icon class is managed by CSS based on the 'listening' class.
             // Initial text inside button (<i class="fas fa-microphone"></i> Start Speaking)
             // might be styled to hide text and show only icon depending on CSS.
             // For simplicity with updateButtonStates text updates, let's keep text in JS too,
             // even if CSS hides it partially or relies more on icon. We can add icon dynamically in JS if needed.
             // Or simpler: Make HTML just icon, and update button ariaLabel and classes via JS.

             // Let's refine the HTML to be just an icon button for professionalism.
             // HTML: <button id="voice-button" aria-label="Start Speaking" title="Start Speaking"><i class="fas fa-microphone"></i></button>
             // In this case, JS ONLY updates `ariaLabel` and classes. textContent is ignored.

        }

         console.log(`Button states updated. isListening: ${isListening}, isSpeaking: ${isSpeaking}, voicePermDisabled: ${isVoiceButtonPermanentlyDisabled}. Input/Send Disabled: ${userInput.disabled}. Voice Button Disabled: ${voiceButton.disabled}. Voice Button Text: "${voiceButton.textContent}"`);

         // Ensure focus returns to input unless something is active
         if (!isListening && !isSpeaking && !isVoiceButtonPermanentlyDisabled) {
              userInput.focus();
         }
    }

     // Let's adjust updateButtonStates for icon-only button style where JS only updates ariaLabel and class
    // We need to add the icon element dynamically in JS or assume it's in HTML.
    // Let's assume icon is in HTML, and JS just updates the button properties and class.
    // Redo updateButtonStates to fit the revised icon-button HTML
     function updateButtonStatesRevised() {
        const shouldBeDisabled = isListening || isSpeaking;

        userInput.disabled = shouldBeDisabled;
        sendButton.disabled = shouldBeDisabled;

        if (isVoiceButtonPermanentlyDisabled) {
            voiceButton.disabled = true;
            voiceButton.classList.remove('listening');
            voiceButton.ariaLabel = "Voice input disabled"; // Update for accessibility
            voiceButton.title = "Voice input disabled"; // Update tooltip
        } else {
            voiceButton.disabled = shouldBeDisabled;
            if (isListening) {
                voiceButton.classList.add('listening'); // Adds pulse effect via CSS
                voiceButton.ariaLabel = "Stop Speaking";
                voiceButton.title = "Stop Speaking";
            } else {
                voiceButton.classList.remove('listening'); // Removes pulse effect
                voiceButton.ariaLabel = "Start Speaking";
                voiceButton.title = "Start Speaking";
            }
        }

         console.log(`Button states updated. isListening: ${isListening}, isSpeaking: ${isSpeaking}, voicePermDisabled: ${isVoiceButtonPermanentlyDisabled}. Input/Send Disabled: ${userInput.disabled}. Voice Button Disabled: ${voiceButton.disabled}`);

         if (!isListening && !isSpeaking && !isVoiceButtonPermanentlyDisabled) {
              userInput.focus();
         }
     }



    // --- Feature Detection and Initialization ---

    // Check for Web Speech API support across different browsers
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    const speechSynthesis = window.speechSynthesis;

    // If Web Speech API is not supported, disable voice features
    if (!SpeechRecognition || !SpeechSynthesisUtterance || !speechSynthesis) {
        console.warn("Web Speech API is not fully supported in this browser.");
        isVoiceButtonPermanentlyDisabled = true; // Voice is not supported
        updateButtonStatesRevised(); // Use the revised update function
        addMessage("Voice input/output not fully supported in your browser. Using text only.", 'bot');
        console.log("Voice features disabled due to lack of browser support.");
    } else {
        console.log("Web Speech API detected. Initializing recognition and synthesis.");
        try {
            // Initialize SpeechRecognition
            recognition = new SpeechRecognition();
            recognition.continuous = false; // Stop listening after a single phrase
            recognition.lang = 'en-US'; // Set language (adjust as needed)
            recognition.interimResults = false; // Only return final results
            recognition.maxAlternatives = 1; // Get only the most likely result
            console.log("SpeechRecognition initialized.");

            // Initialize SpeechSynthesis (use the global object)
            synth = speechSynthesis;
            console.log("SpeechSynthesis initialized.");

            // Initial button state update after successful API init - use revised function
            updateButtonStatesRevised();


            // --- SpeechRecognition Event Handlers ---
            recognition.onstart = () => {
                console.log('--- Event: Voice recognition started. ---');
                isListening = true;
                updateButtonStatesRevised(); // Update buttons to reflect listening state
            };

            recognition.onresult = (event) => {
                console.log('--- Event: Voice recognition result. ---');
                // recognition.onend will handle resetting isListening state and button state

                const transcript = event.results[0][0].transcript;
                console.log(`Recognized: "${transcript}"`);

                sendMessage(transcript, 'voice'); // Send transcribed text
            };

            recognition.onerror = (event) => {
                console.error('--- Event: Speech recognition error: ---', event.error);
                // recognition.onend will fire after this

                let errorMessage = "Sorry, I couldn't process your voice input.";
                let shouldAddMessageToChat = true;

                if (event.error === 'no-speech') {
                    console.log("Error type: 'no-speech'. No speech detected.");
                    shouldAddMessageToChat = false; // Don't clutter chat
                } else if (event.error === 'not-allowed') {
                    // Microphone permission was denied
                    errorMessage = "Microphone access denied. Please enable it in your browser settings.";
                    isVoiceButtonPermanentlyDisabled = true; // Mark as permanently disabled
                    console.error("Error type: 'not-allowed'. Microphone access denied.");
                } else if (event.error === 'audio-capture') {
                     errorMessage = "Microphone is busy or not available.";
                     console.error("Error type: 'audio-capture'. Microphone issue.");
                } else if (event.error === 'network') {
                     errorMessage = "Network error during recognition.";
                     console.error("Error type: 'network'.");
                } else {
                     console.error(`Error type: ${event.error}`);
                     errorMessage = `Speech recognition error: ${event.error}`;
                }

                // Add the error message to chat if flagged and bot isn't speaking
                if (shouldAddMessageToChat && !isSpeaking) {
                     addMessage(errorMessage, 'bot');
                } else if (shouldAddMessageToChat && isSpeaking) {
                     console.log("Suppressing recognition error message because bot is speaking.");
                }

                 // recognition.onend handles state update after this error.
            };

            recognition.onend = () => {
                console.log('--- Event: Voice recognition ended. ---');
                isListening = false;
                updateButtonStatesRevised(); // Update buttons to reflect no longer listening

                 // isVoiceButtonPermanentlyDisabled is handled within updateButtonStatesRevised.
            };


            // --- SpeechSynthesis Event Handlers ---

            synth.onstart = (event) => {
                 console.log('--- Event: Bot started speaking. ---');
                 isSpeaking = true;
                 updateButtonStatesRevised(); // Update buttons to reflect speaking state
            }

            // **IMPROVED:** Synth.onend now consistently resets state and uses updateButtonStatesRevised.
            // Timeout remains a fallback.
            synth.onend = (event) => {
                console.log('--- Event: Bot finished speaking. ---');
                isSpeaking = false; // Reset speaking state
                updateButtonStatesRevised(); // Re-enable buttons now that speech is complete
            };

            synth.onerror = (event) => {
                console.error('--- Event: Speech synthesis error: ---', event.error);
                isSpeaking = false; // Ensure state is reset

                updateButtonStatesRevised(); // Re-enable buttons even on error

                addMessage("Sorry, I couldn't speak the response.", 'bot');
            };

             synth.onvoiceschanged = () => {
                 console.log("--- Event: SpeechSynthesis voices changed ---");
                 // Optional: Get voices and set preference
             };

        } catch (e) {
            // Catch errors during *initialization*
            console.error("--- Error during Web Speech API initialization: ---", e);
            isVoiceButtonPermanentlyDisabled = true; // Mark as failed to init
            updateButtonStatesRevised(); // Update button state
            addMessage("Failed to initialize voice features.", 'bot');
        }
    }


    // --- Helper function to add a message bubble to the chat box ---
    // Revised to include message-bubble structure as in updated HTML
    function addMessage(text, sender) {
        const messageContainer = document.createElement('div'); // Outer container
        messageContainer.classList.add('message', `${sender}-message`);

        const messageBubble = document.createElement('div'); // Inner bubble
        messageBubble.classList.add('message-bubble');
        messageBubble.textContent = text; // Use textContent for safety

        messageContainer.appendChild(messageBubble); // Append bubble to container
        chatBox.appendChild(messageContainer); // Append container to chat box

        chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll
    }


    // --- Function to speak the bot's text response ---
    function speakResponse(text) {
        // Check availability and permanent disability before speaking
        if (!synth || !SpeechSynthesisUtterance || !text || text.trim() === '' || isVoiceButtonPermanentlyDisabled) {
            console.warn("speakResponse called but TTS unavailable/empty/disabled.");
            // Add non-empty text to chat even if not speaking
            if (text && text.trim() !== '') addMessage(text, 'bot');
            // Ensure state is updated as speaking is skipped
            isSpeaking = false; // Must be false if we skip speaking
            updateButtonStatesRevised(); // Re-enable buttons as speech isn't happening
            return;
        }

        // Stop ongoing speech before starting new
        synth.cancel(); // Should trigger onend/onerror for previous

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';

        // Add text to chat box immediately
        addMessage(text, 'bot');

        // Start speech
        synth.speak(utterance); // Triggers onstart
        console.log(`Attempting to speak: "${text}"`);

         // State handled by onstart, onend, onerror.

         // **WORKAROUND:** Fallback timeout
         const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
         const estimatedDurationMs = Math.max(wordCount * 200, 2000); // Min 2s

         console.log(`Setting fallback timeout check for speaking state in ~${estimatedDurationMs}ms.`);

         setTimeout(() => {
             // Check if we are *still* marked speaking AND browser API thinks it's speaking AND NOT listening
             if (isSpeaking && synth.speaking && !isListening) {
                  console.warn("Fallback Timeout: Synth seems stuck. Forcing state reset and buttons re-enable.");
                  isSpeaking = false;
                  updateButtonStatesRevised(); // Use revised update
             } else {
                 // console.log("Fallback Timeout check passed or state already correct.");
             }
         }, estimatedDurationMs + 1000); // Buffer
    }


    // --- Function to send message to backend ---
    async function sendMessage(message, source = 'text') {
        // Check for empty message after trim
        if (message.trim() === '') {
            console.log("sendMessage called with empty message. Ignoring.");
             // If voice input results in empty message, update states (buttons re-enable)
             if (source === 'voice') {
                isListening = false; // Recognition should have ended, but ensure state is clear
                isSpeaking = false; // Ensure speaking isn't stuck
                updateButtonStatesRevised();
             }
            return; // Stop
        }

        // Add user message and clear input
        // Note: For voice, addMessage happens here. For text, it happens in listeners.
        addMessage(message, 'user');
        userInput.value = '';

        console.log(`Processing message to send to backend (Source: ${source}): "${message}"`);

        // Disable input and buttons via state update - Speaking state takes precedence
        // UI becomes disabled by updateButtonStatesRevised when isSpeaking becomes true via speakResponse later
        // or implicitly when isListening is true.
        // No need to manually disable here unless we *must* guarantee immediate visual change before fetch.
        // For now, rely on state changes (listening/speaking) to disable buttons.


        // Add thinking indicator
        const typingIndicatorContainer = document.createElement('div'); // Container
        typingIndicatorContainer.classList.add('message', 'bot-message'); // Match message structure
        const typingIndicatorBubble = document.createElement('div'); // Bubble
        typingIndicatorBubble.classList.add('message-bubble', 'typing'); // Add typing class
        typingIndicatorBubble.textContent = 'AI is thinking...';
        typingIndicatorContainer.appendChild(typingIndicatorBubble);
        chatBox.appendChild(typingIndicatorContainer); // Add container to chat box
        chatBox.scrollTop = chatBox.scrollHeight;


        try {
            console.log(`Fetching response from backend endpoint: /chat`);
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
            console.log(`Received HTTP response status from backend: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const data = await response.json();
            console.log("Received response data from backend:", data);

            // Remove thinking indicator
            // Need to find the latest one (could be multiple if user spammed before response)
            const indicators = chatBox.querySelectorAll('.message.bot-message .message-bubble.typing');
             if (indicators.length > 0) {
                 // Remove the last one found (most recent)
                 const lastIndicatorContainer = indicators[indicators.length - 1].closest('.message');
                 if(lastIndicatorContainer && chatBox.contains(lastIndicatorContainer)) {
                      chatBox.removeChild(lastIndicatorContainer);
                 }
             }


            // Process the response text
            if (data && typeof data.response === 'string' && data.response.trim() !== '') {
                 // speakResponse handles adding text to chat & updates state/buttons
                 speakResponse(data.response);
            } else {
                 console.error("Backend response missing/invalid 'response' text:", data);
                 const errorMessage = (data && typeof data.response === 'string') ? "AI provided an empty response." : "Received an unexpected AI response structure.";
                 addMessage(errorMessage, 'bot'); // Add error message text

                 // No text to speak, manually update state and buttons
                 isSpeaking = false; // Ensure state is false
                 updateButtonStatesRevised(); // Re-enable buttons
                 console.log("Backend response empty/invalid, manually re-enabled buttons.");
            }

        } catch (error) {
            console.error('Error during sendMessage fetch/processing:', error);

             // Remove thinking indicator on error
             const indicators = chatBox.querySelectorAll('.message.bot-message .message-bubble.typing');
              if (indicators.length > 0) {
                  const lastIndicatorContainer = indicators[indicators.length - 1].closest('.message');
                  if(lastIndicatorContainer && chatBox.contains(lastIndicatorContainer)) {
                       chatBox.removeChild(lastIndicatorContainer);
                  }
              }

            // Manually update state and buttons on error
            const errorMessage = `Sorry, an error occurred: ${error.message}`;
            addMessage(errorMessage, 'bot');
            isSpeaking = false; // Ensure state is false
            updateButtonStatesRevised(); // Re-enable buttons
            console.log("Fetch/Processing error, manually re-enabled buttons.");
        }
        // Button states are managed by state updates within event handlers and catch blocks calling updateButtonStatesRevised().
    }

    // --- Event Listeners ---

    // Text Send Button click
    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        // Only process click if not currently listening/speaking
        if (message !== '' && !isListening && !isSpeaking) {
             sendMessage(message, 'text');
         } else if ((isListening || isSpeaking)) {
             console.log("Ignoring Send Text click while listening or speaking.");
         }
    });

    // Text Input Enter key press
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const message = userInput.value.trim();
             // Only process if not listening/speaking
             if (message !== '' && !isListening && !isSpeaking) {
                 sendMessage(message, 'text');
             } else if ((isListening || isSpeaking)) {
                 console.log("Ignoring Enter keypress while listening or speaking.");
             }
        }
    });

    // Voice Button click
    voiceButton.addEventListener('click', () => {
        console.log('Voice button clicked. Current state: isListening=', isListening, ', isSpeaking=', isSpeaking, ', isVoiceButtonPermanentlyDisabled=', isVoiceButtonPermanentlyDisabled);

        // Do nothing if the button is permanently disabled
        if (isVoiceButtonPermanentlyDisabled) {
            console.warn("Voice button is permanently disabled. Click ignored.");
            return; // Exit handler
        }

        // --- Handle cases when a process is ALREADY active ---

        // If speaking, cancel speech. User will need to click again after it cancels and buttons re-enable.
        if (isSpeaking) {
             console.log("Bot is speaking, cancelling speech. Click again to start listening.");
             synth.cancel(); // Should trigger synth.onend/onerror
             // State update and re-enable happens via event handler.
             return; // Exit handler

        // If listening, stop recognition. Recognition.onend will handle state.
        } else if (isListening) {
            console.log("Stopping voice recognition due to button click.");
            recognition.stop(); // Triggers recognition.onend
             // State update and re-enable happens via recognition.onend.
            return; // Exit handler
        }

        // --- If not listening or speaking (and not permanently disabled) ---
        // Attempt to start voice recognition
        console.log("Attempting to start voice recognition.");
        try {
           // Start recognition. This triggers recognition.onstart if successful.
           // The recognition.onstart handler will update states and disable buttons.
           recognition.start();

        } catch (e) {
           // Catch errors *specifically* when calling recognition.start()
           console.error("Error trying to call recognition.start():", e);
           // Handle start failure - state should still be false but ensure cleared.
           isListening = false; // Should be false
           isSpeaking = false; // Should be false
           // If this start fails, it might mean the browser or mic is fundamentally blocked/unavailable for new starts.
           // While 'not-allowed' is handled in onerror, other start errors might happen.
           // For now, just report the error and ensure buttons are re-enabled.
           addMessage("Could not start microphone. Please check browser permissions or try again.", 'bot');
           updateButtonStatesRevised(); // Ensure buttons re-enable
        }
    });


    // --- Initial Setup on Load ---
    // Ensure initial state and buttons are correct
    updateButtonStatesRevised();

    // Focus input field on load
    userInput.focus();


    // Optional: Auto-play initial bot message (most browsers require user interaction first)
    // Instead of trying to auto-play on load, a better UX is often to play the first message
    // *after* the user initiates the very first interaction (e.g., sends the first text message).
    // This can be added into the sendMessage handler the *first time* it's called.
    // (This requires a way to track if it's the first message - could use a flag).

});