// DOM Elements
const textInput = document.getElementById('text-input');
const textDisplay = document.getElementById('text-display');
const readButton = document.getElementById('read-button');

// Speech Synthesis Globals
let utterance = null; // Holds the current SpeechSynthesisUtterance instance
let wordSpans = [];   // Array to store <span> elements created for each word
let currentWordIndex = -1; // Index of the currently highlighted word span

// Speech synthesis states to manage UI and actions
const SpeechState = {
    IDLE: 'idle',       // Not speaking or paused
    PLAYING: 'playing', // Actively speaking
    PAUSED: 'paused',   // Speech is paused
};
let speechState = SpeechState.IDLE; // Initial state

// Event listener for text input changes
textInput.addEventListener('input', () => {
    const text = textInput.value.trim();
    if (text !== '') {
        readButton.classList.remove('hidden'); // Show read button if there's text
        // If user types or modifies text while speech is active (playing or paused),
        // stop the current speech and reset the UI.
        if (speechState !== SpeechState.IDLE) {
            stopSpeech();
        }
    } else {
        readButton.classList.add('hidden'); // Hide read button if text area is empty
        stopSpeech(); // Also stop speech if text is cleared completely
    }
});

/**
 * Prepares the text from the textarea for display with highlighting.
 * It wraps each word in a <span> tag and stores these spans.
 * Spaces are preserved as text nodes to maintain layout.
 * Character indices are stored on spans to map with speech boundary events.
 * @param {string} text - The text to prepare.
 */
function prepareTextForDisplay(text) {
    textDisplay.innerHTML = ''; // Clear any previous content from the display area
    wordSpans = [];             // Reset the array of word spans
    let charAccumulator = 0;    // Accumulates character count to set correct charIndex for spans

    // Split the text by sequences of one or more whitespace characters (\s+).
    // The capturing group () ensures that the delimiters (spaces) are also included in the resulting array.
    // This is crucial for accurately calculating character indices.
    const parts = text.split(/(\s+)/);

    parts.forEach(part => {
        if (part.trim() !== '') {
            // This part is a word
            const span = document.createElement('span');
            span.textContent = part;
            // Store the character index at the start of this word in the original text
            span.dataset.charIndexStart = charAccumulator;
            // Store the character index at the end of this word (inclusive)
            span.dataset.charIndexEnd = charAccumulator + part.length - 1;
            textDisplay.appendChild(span);
            wordSpans.push(span);
        } else {
            // This part is whitespace, preserve it as a text node for layout
            textDisplay.appendChild(document.createTextNode(part));
        }
        // Increment accumulator by the length of the current part (word or space)
        // This ensures charIndexStart for the next word is correct.
        charAccumulator += part.length;
    });
}

/**
 * Highlights the current word being spoken based on character index from speech event.
 * It removes highlighting from the previous word and applies it to the current one.
 * @param {number} charIndex - The character index of the word to highlight, from the speech event.
 */
function highlightCurrentWord(charIndex) {
    // Remove highlight from the previously highlighted word, if any
    if (currentWordIndex >= 0 && currentWordIndex < wordSpans.length) {
        wordSpans[currentWordIndex].classList.remove('highlighted-word');
    }

    // Find the new word to highlight.
    // The charIndex from the speech synthesis event usually marks the beginning of the spoken word.
    currentWordIndex = wordSpans.findIndex(span => {
        const start = parseInt(span.dataset.charIndexStart, 10);
        // Check if the event's charIndex matches the start of this span's word.
        // Some engines might provide charIndex that is slightly off for complex scripts or punctuation,
        // so a range check could be more robust if issues are found, e.g.
        // return charIndex >= start && charIndex <= parseInt(span.dataset.charIndexEnd, 10);
        // For now, exact start match is used.
        return charIndex === start;
    });

    // If a matching word span is found, add the highlight class
    if (currentWordIndex !== -1) {
        wordSpans[currentWordIndex].classList.add('highlighted-word');
    }
}

/**
 * Stops the speech synthesis.
 * If speech is active (speaking or paused), it cancels the synthesis.
 * The UI reset is primarily handled by the 'onend' event of the utterance.
 * This function also includes a fallback call to resetUIAfterSpeech
 * to ensure cleanup if 'onend' doesn't fire as expected or if speech was never really active.
 */
function stopSpeech() {
    if (speechSynthesis.speaking || speechSynthesis.paused) {
        speechSynthesis.cancel(); // This should trigger the utterance.onend event
    }
    // Fallback UI reset: if speechState was PLAYING or PAUSED, but cancel() somehow
    // doesn't trigger onend (e.g., if utterance was null or already finished without state change),
    // this ensures the UI is reset.
    if (speechState !== SpeechState.IDLE) {
       resetUIAfterSpeech();
    }
}

/**
 * Resets the UI to its initial state after speech has ended or been stopped.
 * Shows the text input area, hides the text display area, clears word spans,
 * and resets the read button's text and visibility. Sets state to IDLE.
 */
function resetUIAfterSpeech() {
    textInput.style.display = 'block';    // Show the editable textarea
    textDisplay.style.display = 'none'; // Hide the non-editable text display
    textDisplay.innerHTML = '';           // Clear highlighted text content
    wordSpans = [];                       // Clear the array of word spans
    currentWordIndex = -1;                // Reset the current word index

    // Manage Read button visibility and text based on whether textInput has content
    if (textInput.value.trim() !== '') {
        readButton.classList.remove('hidden');
        readButton.textContent = 'Read';
    } else {
        readButton.classList.add('hidden');
    }
    speechState = SpeechState.IDLE; // Set state back to idle
    utterance = null;               // Clear the reference to the old utterance, allowing it to be GC'd
}

// Event listener for the Read/Pause/Resume button clicks
readButton.addEventListener('click', () => {
    const textToRead = textInput.value.trim(); // Get trimmed text from input

    if (speechState === SpeechState.IDLE) {
        // --- Action: Start new speech ---
        if (textToRead === '') {
            alert('Please enter some text to read.');
            return;
        }
        // Check for browser support for SpeechSynthesis API
        if (!('speechSynthesis'in window)) {
            alert('Sorry, your browser does not support text-to-speech.');
            return;
        }

        // It's good practice to cancel any (potentially stuck) previous utterance
        // before starting a new one, though onend should typically handle cleanup.
        speechSynthesis.cancel();

        prepareTextForDisplay(textToRead); // Prepare the #text-display div with word spans
        textInput.style.display = 'none';  // Hide textarea
        textDisplay.style.display = 'block'; // Show text display with spans

        utterance = new SpeechSynthesisUtterance(textToRead);

        // Event handler for when a word boundary is reached during speech
        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                // event.charIndex gives the starting character position of the word
                highlightCurrentWord(event.charIndex);
            }
        };

        // Event handler for when speech finishes successfully
        utterance.onend = () => {
            resetUIAfterSpeech(); // Clean up UI and state
        };

        // Event handler for any errors during speech synthesis
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            alert(`An error occurred during speech synthesis: ${event.error}`);
            resetUIAfterSpeech(); // Clean up UI and state on error as well
        };

        speechSynthesis.speak(utterance);
        readButton.textContent = 'Pause'; // Change button text
        speechState = SpeechState.PLAYING;  // Update state

    } else if (speechState === SpeechState.PLAYING) {
        // --- Action: Pause currently playing speech ---
        speechSynthesis.pause();
        readButton.textContent = 'Resume'; // Change button text
        speechState = SpeechState.PAUSED;   // Update state
    } else if (speechState === SpeechState.PAUSED) {
        // --- Action: Resume previously paused speech ---
        speechSynthesis.resume();
        readButton.textContent = 'Pause'; // Button text back to 'Pause' as it's now playing again
        speechState = SpeechState.PLAYING;  // Update state
    }
});

// Event listener to stop speech if the page is about to be unloaded (e.g. tab closed, navigated away)
// This helps prevent speech from continuing in the background or errors.
window.addEventListener('beforeunload', () => {
    stopSpeech();
});
