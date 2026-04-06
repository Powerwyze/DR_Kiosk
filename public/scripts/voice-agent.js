const askButton = document.getElementById("ask-button");
let ws = null;
let audioContext = null;
let mediaRecorder = null;
let isActive = false;
let isStarting = false;
let audioQueue = [];
let audioMetadataQueue = [];
let isPlaying = false;

if (askButton) {
  askButton.addEventListener("click", async () => {
    if (isActive || isStarting) {
      stopConversation();
    } else {
      startConversation();
    }
  });
}

function setButtonState(nextLabel, background, disabled = false) {
  if (!askButton) return;
  askButton.textContent = nextLabel;
  askButton.style.background = background;
  askButton.disabled = disabled;
}

function setIdle() {
  setButtonState("Ask about me", "linear-gradient(135deg, #2563eb, #1d4ed8)");
}

function setListening() {
  setButtonState("Stop conversation", "linear-gradient(135deg, #dc2626, #b91c1c)");
}

async function startConversation() {
  try {
    if (!window.navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Microphone API is not available in this browser.");
    }

    isStarting = true;
    setButtonState("Starting...", "linear-gradient(135deg, #1d4ed8, #1e40af)", true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    ws = new WebSocket(
      "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_7101khvtsxn4ezkvha67cv07cdmv"
    );

    ws.onopen = () => {
      console.log("Connected to ElevenLabs");
      ws.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
      isActive = true;
      isStarting = false;
      setListening();
    };

    ws.onmessage = async (event) => {
      const data = safeJson(event.data);
      if (!data || !data.type) return;

      if (data.type === "user_transcript") {
        console.log("You said:", data.user_transcription_event?.user_transcript || "");
        return;
      }

      if (data.type === "agent_response") {
        console.log("Agent:", data.agent_response_event?.agent_response || "");
        return;
      }

      if (data.type === "audio") {
        const audioPayload = data.audio_event?.audio_base_64 || data.audio_event?.audio_base64 || "";
        if (!audioPayload) return;
        const metadata = {
          sampleRate:
            data.audio_event?.sample_rate || data.audio_event?.sampleRate || 24000,
          channels:
            data.audio_event?.channels || data.audio_event?.num_channels || 1,
          encoding:
            data.audio_event?.encoding || data.audio_event?.audio_encoding || "pcm16",
        };
        await playAudio(audioPayload, metadata);
        return;
      }

      if (data.type === "ping" && data.ping_event) {
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "pong",
              event_id: data.ping_event.event_id,
            }));
          }
        }, data.ping_event.ping_ms);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      stopConversation();
    };

    ws.onclose = () => {
      console.log("Connection closed");
      stopConversation();
    };

    startAudioCapture(stream);
  } catch (error) {
    console.error("Error starting conversation:", error);
    stopConversation();
    alert("Could not access microphone or connect to ElevenLabs. Please grant permission and try again.");
  }
}

function startAudioCapture(stream) {
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);
  const targetSampleRate = 16000;
  const sourceSampleRate = audioContext.sampleRate;

  source.connect(processor);
  processor.connect(audioContext.destination);

  processor.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !isActive) return;
    const inputData = event.inputBuffer.getChannelData(0);
    let resampledData = inputData;

    if (sourceSampleRate !== targetSampleRate) {
      const ratio = sourceSampleRate / targetSampleRate;
      const newLength = Math.floor(inputData.length / ratio);
      const downsampled = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const srcIndex = Math.floor(i * ratio);
        downsampled[i] = inputData[Math.min(srcIndex, inputData.length - 1)];
      }
      resampledData = downsampled;
    }

    const pcmData = new Int16Array(resampledData.length);
    for (let i = 0; i < resampledData.length; i++) {
      const s = Math.max(-1, Math.min(1, resampledData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const bytes = new Uint8Array(pcmData.buffer);
    const chunk = btoa(String.fromCharCode.apply(null, bytes));
    ws.send(JSON.stringify({ user_audio_chunk: chunk }));
  };

  mediaRecorder = { processor, source, stream };
}

async function playAudio(base64Audio, metadata = {}) {
  audioQueue.push(base64Audio);
  audioMetadataQueue.push(metadata);
  if (!isPlaying) {
    processAudioQueue();
  }
}

async function processAudioQueue() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const base64Audio = audioQueue.shift();
  const metadata = audioMetadataQueue.shift() || {};

  try {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let audioBuffer;
    if (looksLikeContainer(bytes)) {
      audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } else {
      audioBuffer = decodePcm16ToAudioBuffer(bytes, Number(metadata.sampleRate) || 24000, Number(metadata.channels) || 1);
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => processAudioQueue();
    source.start(0);
  } catch (error) {
    console.error("Error playing audio chunk:", error);
    processAudioQueue();
  }
}

function decodePcm16ToAudioBuffer(bytes, sampleRate, channels = 1) {
  const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 24000;
  const safeChannels = Math.max(1, Math.min(2, Number.isFinite(channels) ? Math.floor(channels) : 1));
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const frameCount = Math.floor(int16.length / safeChannels);
  const audioBuffer = audioContext.createBuffer(safeChannels, frameCount, safeSampleRate);

  for (let ch = 0; ch < safeChannels; ch++) {
    const channel = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      const sample = int16[i * safeChannels + ch] / 32768;
      channel[i] = Math.max(-1, Math.min(1, sample));
    }
    audioBuffer.copyToChannel(channel, ch);
  }

  return audioBuffer;
}

function looksLikeContainer(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const b = bytes;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true; // RIFF/WAV
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // ID3 tag (mp3)
  if (b[0] === 0xff && (b[1] & 0xf0) === 0xf0) return true; // MPEG audio frame sync
  return false;
}

function stopConversation() {
  if (mediaRecorder) {
    if (mediaRecorder.processor) {
      mediaRecorder.processor.disconnect();
      mediaRecorder.source.disconnect();
      mediaRecorder.processor.onaudioprocess = null;
    }
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    mediaRecorder = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  audioQueue = [];
  audioMetadataQueue = [];
  isPlaying = false;
  isActive = false;
  isStarting = false;

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  setIdle();
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
