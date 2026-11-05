
// Phase 7: local appearance preferences. These settings are private to this browser.
(function initWaltajjiiAppearance() {
  const defaults = { theme: "system", accent: "teal", wallpaper: "plain" };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("waltajjii-appearance") || "{}"); } catch { saved = {}; }
  const prefs = { ...defaults, ...saved };
  const accents = { teal: "#087f78", blue: "#2563eb", violet: "#7c3aed", rose: "#e11d48", green: "#15803d" };
  const themeSelect = document.getElementById("wt-theme");
  const accentSelect = document.getElementById("wt-accent");
  const wallpaperSelect = document.getElementById("wt-wallpaper");
  const status = document.getElementById("wt-preferences-status");
  if (!themeSelect || !accentSelect || !wallpaperSelect) return;
  themeSelect.value = ["light", "dark", "system"].includes(prefs.theme) ? prefs.theme : "system";
  accentSelect.value = Object.hasOwn(accents, prefs.accent) ? prefs.accent : "teal";
  wallpaperSelect.value = ["plain", "soft", "sky", "warm"].includes(prefs.wallpaper) ? prefs.wallpaper : "plain";
  function apply() {
    const selectedTheme = themeSelect.value;
    const dark = selectedTheme === "dark" || (selectedTheme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.body.dataset.wtTheme = dark ? "dark" : "light";
    document.body.style.setProperty("--wt-teal", accents[accentSelect.value] || accents.teal);
    document.body.dataset.wtWallpaper = wallpaperSelect.value;
    try {
      localStorage.setItem("waltajjii-appearance", JSON.stringify({ theme: selectedTheme, accent: accentSelect.value, wallpaper: wallpaperSelect.value }));
      status.textContent = "Your appearance preferences are saved on this device.";
    } catch { status.textContent = "Preferences are applied for this session but could not be saved by this browser."; }
  }
  [themeSelect, accentSelect, wallpaperSelect].forEach(control => control.addEventListener("change", apply));
  if (window.matchMedia) {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    systemTheme.addEventListener?.("change", () => { if (themeSelect.value === "system") apply(); });
  }
  apply();
})();
const authPanel = document.getElementById("auth-panel");
    const chatPanel = document.getElementById("chat-panel");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const authStatus = document.getElementById("auth-status");
    const statusBox = document.getElementById("status");
    const recipient = document.getElementById("recipient");
    const messagesBox = document.getElementById("messages");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
const mediaInput = document.getElementById("media-input");
    let recordedVoiceFile = null;
    let voiceRecorder = null;
    let voiceStream = null;
    let voiceChunks = [];

    let token = null;
    let currentUsername = null;
let callSocket = null;
    async function api(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (token) headers.Authorization = "Bearer " + token;
      if (options.body) headers["Content-Type"] = "application/json";

      const response = await fetch(path, { ...options, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Request failed. Please try again.");
      }
      return data;
    }

    function showChat(username) {
      currentUsername = username;
          loadMyProfile();
      authPanel.style.display = "none";
      chatPanel.style.display = "block";
      document.getElementById("welcome-user").textContent =
        "Logged in as " + username;
      statusBox.textContent = "Choose a recipient to begin.";
      loadUsers();
      loadGroups();
      loadChannels();
      loadSocialData();
    }
async function loadMyProfile() {
  const profileStatus = document.getElementById("profile-status");
  const bioInput = document.getElementById("profile-bio-input");
  const bioDisplay = document.getElementById("profile-bio-display");
  const usernameDisplay = document.getElementById("profile-username");
  const picturePreview = document.getElementById("profile-picture-preview");
  const profileFields = {
    title: document.getElementById("profile-title"),
    organization: document.getElementById("profile-organization"),
    department: document.getElementById("profile-department"),
    location: document.getElementById("profile-location"),
    website: document.getElementById("profile-website"),
    mode: document.getElementById("profile-mode")
  };

  try {
    const data = await api("/api/auth/profile");
    const user = data.user;

    usernameDisplay.textContent = user.username;
    bioInput.value = user.bio || "";
    bioDisplay.textContent = user.bio || "No bio added yet.";
    profileFields.title.value = user.professionalTitle || "";
    profileFields.organization.value = user.organization || "";
    profileFields.department.value = user.department || "";
    profileFields.location.value = user.location || "";
    profileFields.website.value = user.website || "";
    profileFields.mode.value = user.profileMode || "both";
    document.getElementById("bio-counter").textContent = (user.bio || "").length;
    const professionalLine = [user.professionalTitle, user.organization].filter(Boolean).join(" · ");
    document.getElementById("profile-professional-line").textContent = professionalLine || "Waltajjii member";

    const sidebarUsername = document.getElementById("wt-sidebar-username");
    const sidebarProfessional = document.getElementById("wt-sidebar-professional");
    const sidebarAvatar = document.getElementById("wt-sidebar-avatar");
    const sidebarFallback = document.getElementById("wt-sidebar-avatar-fallback");
    if (sidebarUsername) sidebarUsername.textContent = user.username || "Your profile";
    if (sidebarProfessional) sidebarProfessional.textContent = professionalLine || "Waltajjii member";

    if (user.avatarPath) {
      const response = await fetch(
        "/api/uploads/profile-picture/" + encodeURIComponent(user.id),
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!response.ok) throw new Error("Your profile picture could not be loaded. Please upload it again.");
      const imageBlob = await response.blob();
      const imageUrl = URL.createObjectURL(imageBlob);
      picturePreview.src = imageUrl;
      if (sidebarAvatar) {
        sidebarAvatar.src = imageUrl;
        sidebarAvatar.hidden = false;
      }
      if (sidebarFallback) sidebarFallback.hidden = true;
    } else {
      picturePreview.removeAttribute("src");
      if (sidebarAvatar) {
        sidebarAvatar.removeAttribute("src");
        sidebarAvatar.hidden = true;
      }
      if (sidebarFallback) sidebarFallback.hidden = false;
    }

    profileStatus.textContent = "";
  } catch (error) {
    profileStatus.textContent = error.message;
  }
}
    function showLogin() {
      token = null;
      currentUsername = null;
      authPanel.style.display = "block";
      chatPanel.style.display = "none";
      loginForm.reset();
      registerForm.reset();
      authStatus.textContent = "";
      messagesBox.replaceChildren();
      messagesBox.textContent = "Log in to view messages.";
    }

    document.getElementById("show-register").addEventListener("click", () => {
      loginForm.hidden = true;
      registerForm.hidden = false;
      authStatus.textContent = "";
    });

    document.getElementById("show-login").addEventListener("click", () => {
      registerForm.hidden = true;
      loginForm.hidden = false;
      authStatus.textContent = "";
    });

    loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      authStatus.textContent = "Logging in...";
      const button = loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: document.getElementById("username").value.trim(),
            password: document.getElementById("password").value
          })
        });
        token = data.token;
if (callSocket) {
  callSocket.disconnect();
}

callSocket = window.io({
  auth: { token: token }
});
registerCallSocketHandlers(callSocket);
callSocket.on("connect", () => {
  console.log("Waltajjii call connection ready.");
});

callSocket.on("connect_error", (error) => {
  console.error("Call connection error:", error.message);
});
        showChat(data.user.username);
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });

    registerForm.addEventListener("submit", async event => {
      event.preventDefault();
      authStatus.textContent = "Creating account...";
      const button = registerForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: document.getElementById("new-username").value.trim(),
            password: document.getElementById("new-password").value
          })
        });
        authStatus.textContent = data.message + " You can now log in.";
        registerForm.reset();
        registerForm.hidden = true;
        loginForm.hidden = false;
        document.getElementById("username").value =
          document.getElementById("new-username").value;
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });

    async function loadUsers() {
      recipient.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Loading users...";
      recipient.appendChild(placeholder);
      try {
        const data = await api("/api/messages/users");
        recipient.replaceChildren();
        const first = document.createElement("option");
        first.value = "";
        first.textContent = "Select a recipient";
        recipient.appendChild(first);

       data.users.forEach(user => {
  userIdsByUsername.set(user.username, user.id);

  const option = document.createElement("option");
  option.value = user.username;
  const professionalLabel = [user.professionalTitle, user.organization].filter(Boolean).join(" · ");
  option.textContent = professionalLabel
    ? `${user.username} — ${professionalLabel}`
    : (user.bio ? `${user.username} — ${user.bio}` : user.username);
  recipient.appendChild(option);
}); 
        statusBox.textContent = data.users.length
          ? "Choose a recipient, then load the conversation."
          : "No other users yet. Create a second account to test messaging.";
      } catch (error) {
        statusBox.textContent = error.message;
      }
    }

    function renderMessages(items) {
      messagesBox.replaceChildren();
      if (!items.length) {
        messagesBox.textContent = "No messages in this conversation yet.";
        return;
      }
      
items.forEach(item => {
  const element = document.createElement("div");
  element.className = "message" +
    (item.sender === currentUsername ? " mine" : "");

  const label = document.createElement("strong");
  label.textContent = item.sender + " â†’ " + item.recipient;

  const content = document.createElement("div");
  const isVoiceMessage = Boolean(item.mediaPath && item.mediaType === "document" && String(item.body || "").startsWith("[Voice message]"));
  content.textContent = isVoiceMessage ? String(item.body || "").replace(/^\[Voice message\]\s*/, "") : (item.body || "");

  if (item.mediaPath && item.mediaType) {
    const mediaUrl =
      "/api/uploads/" + encodeURIComponent(item.mediaPath);

    if (isVoiceMessage) {
      const player = document.createElement("div");
      player.className = "voice-player";
      const top = document.createElement("div");
      top.className = "voice-player-top";
      const title = document.createElement("span");
      title.textContent = "🎙 Voice message";
      const speed = document.createElement("select");
      speed.setAttribute("aria-label", "Voice playback speed");
      [["1","1×"],["1.5","1.5×"],["2","2×"]].forEach(([value,label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        speed.appendChild(option);
      });
      top.append(title, speed);
      const waveform = document.createElement("div");
      waveform.className = "voice-waveform";
      for (let i = 0; i < 24; i++) {
        const bar = document.createElement("span");
        bar.style.height = (6 + ((i * 7 + 11) % 17)) + "px";
        waveform.appendChild(bar);
      }
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      speed.addEventListener("change", () => { audio.playbackRate = Number(speed.value); });
      fetch(mediaUrl, { headers: { Authorization: "Bearer " + token } })
        .then(response => {
          if (!response.ok) throw new Error("Voice message request failed: " + response.status);
          return response.blob();
        })
        .then(blob => { audio.src = URL.createObjectURL(blob); })
        .catch(error => {
          console.error("Could not load voice message:", error);
          title.textContent = "Voice message unavailable";
        });
      player.append(top, waveform, audio);
      content.appendChild(player);
    } else if (item.mediaType === "image") {
  const image = document.createElement("img");

  fetch(mediaUrl, {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("Image request failed: " + response.status);
      }
      return response.blob();
    })
    .then(blob => {
      const imageUrl = URL.createObjectURL(blob);

      // Display the image
      image.src = imageUrl;

      // Create a download link
      const downloadLink = document.createElement("a");
      downloadLink.href = imageUrl;
      downloadLink.download = item.mediaPath.split("/").pop();
      downloadLink.textContent = "⬇ Download image";
      downloadLink.style.display = "inline-block";
      downloadLink.style.marginTop = "8px";
      downloadLink.style.padding = "8px 12px";
      downloadLink.style.border = "1px solid #888";
      downloadLink.style.borderRadius = "6px";

      content.appendChild(downloadLink);
    })
    .catch(error => {
      console.error("Could not load shared image:", error);
      image.alt = "Image could not be loaded";
    });

  image.alt = "Image shared in chat";
  image.style.maxWidth = "100%";
  image.style.maxHeight = "400px";
  image.style.display = "block";
  image.style.marginTop = "8px";
  image.style.borderRadius = "8px";

  image.onerror = () => {
    image.alt = "Image could not be loaded";
  };

  content.appendChild(image);
} else if (item.mediaType === "video") {
  const video = document.createElement("video");
  video.controls = true;
  video.preload = "metadata";
  video.style.maxWidth = "100%";
  video.style.maxHeight = "400px";
  video.style.display = "block";
  video.style.marginTop = "8px";

  fetch(mediaUrl, {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("Video request failed: " + response.status);
      }
      return response.blob();
    })
    .then(blob => {
      video.src = URL.createObjectURL(blob);
    })
    .catch(error => {
      console.error("Could not load shared video:", error);
      video.textContent = "Video could not be loaded.";
    });

  content.appendChild(video);

} else if (item.mediaType === "document") {
  const link = document.createElement("a");

  link.textContent = "⬇ Download document: " + item.mediaPath;
  link.style.display = "inline-block";
  link.style.marginTop = "8px";
  link.style.padding = "8px 12px";
  link.style.border = "1px solid #888";
  link.style.borderRadius = "6px";

  fetch(mediaUrl, {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("Document request failed: " + response.status);
      }
      return response.blob();
    })
    .then(blob => {
      link.href = URL.createObjectURL(blob);
      link.download = item.mediaPath;
    })
    .catch(error => {
      console.error("Could not load shared document:", error);
      link.textContent = "Document could not be downloaded.";
    });

   content.appendChild(link);
}
  } // Closes the outer media condition

  const time = document.createElement("small");
  time.className = "muted";
  time.textContent = item.createdAt;

  element.append(label, content, time);
  messagesBox.appendChild(element);
});
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    async function loadConversation() {
      const username = recipient.value;
      if (!username) {
        statusBox.textContent = "Please select a recipient first.";
        return;
      }
      statusBox.textContent = "Loading conversation...";
      try {
        const data = await api(
          "/api/messages/conversation/" + encodeURIComponent(username)
        );
        renderMessages(data.messages);
        statusBox.textContent = "Conversation with " + username + " loaded.";
      } catch (error) {
        statusBox.textContent = error.message;
      }
    }

    document.getElementById("load-button").addEventListener("click", loadConversation);
    recipient.addEventListener("change", loadConversation);

    const recordVoiceButton = document.getElementById("record-voice-button");
    const voiceStatus = document.getElementById("voice-recording-status");
    const voicePreview = document.getElementById("voice-recording-preview");

    function clearVoiceRecording() {
      recordedVoiceFile = null;
      voicePreview.replaceChildren();
      voicePreview.hidden = true;
      voiceStatus.textContent = "";
    }

    recordVoiceButton.addEventListener("click", async () => {
      if (voiceRecorder && voiceRecorder.state === "recording") {
        voiceRecorder.stop();
        return;
      }
      if (!recipient.value) {
        voiceStatus.textContent = "Please select a recipient first.";
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        voiceStatus.textContent = "Voice recording is not supported in this browser.";
        return;
      }
      try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
        const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
        voiceRecorder = mimeType ? new MediaRecorder(voiceStream, { mimeType }) : new MediaRecorder(voiceStream);
        voiceChunks = [];
        voiceRecorder.addEventListener("dataavailable", event => {
          if (event.data && event.data.size) voiceChunks.push(event.data);
        });
        voiceRecorder.addEventListener("stop", () => {
          voiceStream.getTracks().forEach(track => track.stop());
          voiceStream = null;
          const type = voiceRecorder.mimeType || "audio/webm";
          const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const blob = new Blob(voiceChunks, { type });
          recordedVoiceFile = new File([blob], "waltajjii-voice-message." + extension, { type: type.split(";")[0] });
          const previewAudio = document.createElement("audio");
          previewAudio.controls = true;
          previewAudio.src = URL.createObjectURL(blob);
          voicePreview.replaceChildren(previewAudio);
          voicePreview.hidden = false;
          voiceStatus.textContent = "Voice message ready. Press Send to share it.";
          recordVoiceButton.textContent = "🎙 Record again";
          recordVoiceButton.classList.remove("is-recording");
        });
        voiceRecorder.start();
        recordVoiceButton.textContent = "■ Stop recording";
        recordVoiceButton.classList.add("is-recording");
        voiceStatus.textContent = "Recording… speak now.";
      } catch (error) {
        if (voiceStream) voiceStream.getTracks().forEach(track => track.stop());
        voiceStream = null;
        voiceStatus.textContent = error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access and try again."
          : "Could not start recording. Please check your microphone.";
      }
    });

    messageForm.addEventListener("submit", async event => {
  event.preventDefault();

  const receiverUsername = recipient.value;
  const body = messageInput.value.trim();
  const file = recordedVoiceFile || mediaInput.files[0];
  const isVoiceFile = Boolean(recordedVoiceFile && file === recordedVoiceFile);

  if (!receiverUsername) {
    statusBox.textContent = "Please select a recipient first.";
    return;
  }

  if (!body && !file) {
    statusBox.textContent = "Write a message, record a voice note, or select a file.";
    return;
  }

  const button = messageForm.querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    if (file) {
      statusBox.textContent = "Uploading file...";

      const formData = new FormData();
      formData.append("media", file);

      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token
        },
        body: formData
      });

      const uploadResult = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(uploadResult.error || "File upload failed.");
      }

      
      statusBox.textContent = "Attaching file to message...";

      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          receiverUsername,
          body: isVoiceFile ? "[Voice message]" + (body ? " " + body : "") : body,
          mediaPath: uploadResult.fileId,
          mediaType: uploadResult.mediaType
        })
      });

      mediaInput.value = "";
      messageInput.value = "";
      if (isVoiceFile) clearVoiceRecording();

      await loadConversation();
      statusBox.textContent = "Message with media sent.";

    } else {
      statusBox.textContent = "Sending message...";

      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverUsername, body })
      });

      messageInput.value = "";
      await loadConversation();
      statusBox.textContent = "Message sent.";
    }
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    button.disabled = false;
    messageInput.focus();
  }
});
    document.getElementById("logout-button").addEventListener("click", showLogin);


/* Waltajjii one-to-one video call setup */

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const callStatus = document.getElementById("call-status");

const startCallButton = document.getElementById("start-call-button");
const startVoiceCallButton = document.getElementById("start-voice-call-button");
const acceptCallButton = document.getElementById("accept-call-button");
const rejectCallButton = document.getElementById("reject-call-button");
const endCallButton = document.getElementById("end-call-button");

let peerConnection = null;
let localStream = null;
let activeCallUserId = null;
let incomingCallOffer = null;
let activeCallUsername = null;
const userIdsByUsername = new Map();
const pendingIceCandidates = [];

let rtcConfigurationPromise = null;

async function getRtcConfiguration() {
  if (!rtcConfigurationPromise) {
    rtcConfigurationPromise = api("/api/calls/turn-credentials")
      .then(data => {
        if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
          throw new Error("No ICE servers were returned.");
        }
        return { iceServers: data.iceServers };
      })
      .catch(error => {
        rtcConfigurationPromise = null;
        throw error;
      });
  }

  return rtcConfigurationPromise;
}
function setCallStatus(message) {
  if (callStatus) callStatus.textContent = message;
}

function registerCallSocketHandlers(socket) {
  if (!socket) return;

  socket.on("call:incoming", data => {
    if (peerConnection || incomingCallOffer) {
      socket.emit("call:end", { targetUserId: data.callerId });
      return;
    }

    incomingCallOffer = data.offer;
    activeCallUserId = data.callerId;
    activeCallUsername = data.callerUsername;

    setCallStatus("Incoming call from " + data.callerUsername);
    acceptCallButton.disabled = false;
    rejectCallButton.disabled = false;
  });

  socket.on("call:accepted", async data => {
    try {
      if (!peerConnection) return;

      await peerConnection.setRemoteDescription(data.answer);
      await applyPendingIceCandidates();

      setCallStatus("Call accepted. Connecting...");
    } catch (error) {
      console.error("Could not process call answer:", error);
      endVideoCall(true);
      setCallStatus("Could not connect the call.");
    }
  });

  socket.on("call:ice-candidate", async data => {
    if (!data.candidate) return;

    try {
      if (peerConnection?.remoteDescription) {
        await peerConnection.addIceCandidate(data.candidate);
      } else {
        pendingIceCandidates.push(data.candidate);
      }
    } catch (error) {
      console.error("Could not add ICE candidate:", error);
    }
  });

  socket.on("call:ended", () => {
    endVideoCall(false);
    setCallStatus("The other participant ended the call.");
  });
}

async function applyPendingIceCandidates() {
  if (!peerConnection?.remoteDescription) return;

  while (pendingIceCandidates.length) {
    const candidate = pendingIceCandidates.shift();

    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error("Could not apply pending ICE candidate:", error);
    }
  }
}

async function prepareMediaConnection(videoEnabled = true) {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: videoEnabled,
    audio: true
  });

  localVideo.srcObject = videoEnabled ? localStream : null;

  const rtcConfiguration = await getRtcConfiguration();
peerConnection = new RTCPeerConnection(rtcConfiguration);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate && activeCallUserId && callSocket?.connected) {
      callSocket.emit("call:ice-candidate", {
        targetUserId: activeCallUserId,
        candidate: event.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (!peerConnection) return;

    if (peerConnection.connectionState === "connected") {
      setCallStatus(localStream?.getVideoTracks().length ? "Video call connected." : "Voice call connected.");
    } else if (peerConnection.connectionState === "failed") {
      setCallStatus("Connection failed. A TURN server may be needed.");
    }
  };
}

async function startVideoCall() {
  return startCall(true);
}

async function startVoiceCall() {
  return startCall(false);
}

async function startCall(videoEnabled) {
  const selectedUsername = recipient.value;
  const selectedUserId = userIdsByUsername.get(selectedUsername);

  if (!selectedUserId) {
    setCallStatus("Please choose a valid recipient first.");
    return;
  }

  if (!callSocket?.connected) {
    setCallStatus("Call connection is not ready. Please log in again.");
    return;
  }

  if (peerConnection || incomingCallOffer) {
    setCallStatus("Please end the current call before starting another.");
    return;
  }

  try {
    startCallButton.disabled = true;
    setCallStatus(videoEnabled ? "Requesting camera and microphone access..." : "Requesting microphone access...");

    activeCallUserId = selectedUserId;
    activeCallUsername = selectedUsername;

    await prepareMediaConnection(videoEnabled);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    callSocket.emit("call:offer", {
      targetUserId: activeCallUserId,
      offer: peerConnection.localDescription
    }, response => {
      if (!response?.ok) {
        const message = response?.error || "Could not start the call.";
        endVideoCall(false);
        setCallStatus(message);
        return;
      }

      setCallStatus("Calling... waiting for the recipient to accept.");
      endCallButton.disabled = false;
    });
  } catch (error) {
    console.error("Could not start video call:", error);
    endVideoCall(false);
    setCallStatus("Could not start the call: " + error.message);
  } finally {
    startCallButton.disabled = false;
  }
}

async function acceptIncomingCall() {
  if (!incomingCallOffer || !activeCallUserId) return;

  try {
    acceptCallButton.disabled = true;
    rejectCallButton.disabled = true;
    const incomingVideoEnabled = /m=video/i.test(incomingCallOffer.sdp || "");
    setCallStatus(incomingVideoEnabled ? "Requesting camera and microphone access..." : "Requesting microphone access...");
    await prepareMediaConnection(incomingVideoEnabled);
    await peerConnection.setRemoteDescription(incomingCallOffer);
    await applyPendingIceCandidates();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    callSocket.emit("call:answer", {
      targetUserId: activeCallUserId,
      answer: peerConnection.localDescription
    }, response => {
      if (!response?.ok) {
        const message = response?.error || "Could not answer the call.";
        endVideoCall(true);
        setCallStatus(message);
        return;
      }

      incomingCallOffer = null;
      endCallButton.disabled = false;
      setCallStatus("Call accepted. Connecting...");
    });
  } catch (error) {
    console.error("Could not accept the call:", error);
    endVideoCall(true);
    setCallStatus("Could not accept the call: " + error.message);
  }
}

function endVideoCall(notifyRemote = true) {
  const otherUserId = activeCallUserId;

  if (notifyRemote && callSocket?.connected && otherUserId) {
    callSocket.emit("call:end", { targetUserId: otherUserId });
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;

  pendingIceCandidates.length = 0;
  activeCallUserId = null;
  activeCallUsername = null;
  incomingCallOffer = null;

  if (startCallButton) startCallButton.disabled = false;
  if (acceptCallButton) acceptCallButton.disabled = true;
  if (rejectCallButton) rejectCallButton.disabled = true;
  if (endCallButton) endCallButton.disabled = true;
}

if (startCallButton) {
  startCallButton.addEventListener("click", startVideoCall);
}

if (startVoiceCallButton) {
  startVoiceCallButton.addEventListener("click", startVoiceCall);
}

if (acceptCallButton) {
  acceptCallButton.addEventListener("click", acceptIncomingCall);
}

if (rejectCallButton) {
  rejectCallButton.addEventListener("click", () => {
    endVideoCall(true);
    setCallStatus("Incoming call rejected.");
  });
}

if (endCallButton) {
  endCallButton.addEventListener("click", () => endVideoCall(true));
}




/* Waltajjii group messaging: group creation and member administration. */
const groupSelect = document.getElementById("group-select");
const groupStatus = document.getElementById("group-status");
const groupMessagesBox = document.getElementById("group-messages");
const groupMessageForm = document.getElementById("group-message-form");
const groupMessageInput = document.getElementById("group-message-input");
let activeGroupId = null;
let cachedGroups = [];

async function loadGroups() {
  if (!token) return;
  try {
    const data = await api("/api/groups");
    cachedGroups = data.groups || [];
    const previous = groupSelect.value;
    groupSelect.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Select a group";
    groupSelect.appendChild(first);
    cachedGroups.forEach(group => {
      const option = document.createElement("option");
      option.value = String(group.id);
      option.textContent = `${group.name} (${group.memberCount})`;
      groupSelect.appendChild(option);
    });
    if (cachedGroups.some(g => String(g.id) === previous)) groupSelect.value = previous;
    groupStatus.textContent = cachedGroups.length
      ? "Select a group and choose Open group."
      : "You are not in any groups yet. Choose Create group.";
  } catch (error) {
    groupStatus.textContent = error.message;
  }
}

function renderGroupMessages(items) {
  groupMessagesBox.replaceChildren();
  if (!items.length) {
    groupMessagesBox.textContent = "No messages in this group yet.";
    return;
  }
  items.forEach(item => {
    const wrap = document.createElement("div");
    wrap.className = "message" + (item.sender === currentUsername ? " mine" : "");
    const label = document.createElement("strong");
    label.textContent = `${item.sender} · ${item.createdAt}`;
    const body = document.createElement("div");
    body.textContent = item.body;
    wrap.append(label, body);
    groupMessagesBox.appendChild(wrap);
  });
  groupMessagesBox.scrollTop = groupMessagesBox.scrollHeight;
}

async function openSelectedGroup() {
  const id = Number(groupSelect.value);
  if (!id) {
    activeGroupId = null;
    groupMessagesBox.textContent = "Select a group first.";
    groupStatus.textContent = "Please select a group.";
    return;
  }
  try {
    const data = await api(`/api/groups/${id}/messages`);
    activeGroupId = id;
    renderGroupMessages(data.messages || []);
    const group = cachedGroups.find(g => g.id === id);
    groupStatus.textContent = `Opened group: ${group ? group.name : id}`;
  } catch (error) {
    groupStatus.textContent = error.message;
  }
}

document.getElementById("refresh-groups-button").addEventListener("click", loadGroups);
document.getElementById("load-group-button").addEventListener("click", openSelectedGroup);
groupSelect.addEventListener("change", () => {
  activeGroupId = null;
  groupMessagesBox.textContent = "Choose Open group to load messages.";
});

document.getElementById("create-group-button").addEventListener("click", async () => {
  if (!token) return;
  const name = prompt("Enter a group name (up to 80 characters):");
  if (name === null) return;
  const cleanName = name.trim();
  if (!cleanName) {
    groupStatus.textContent = "Group name is required.";
    return;
  }
  const membersText = prompt("Enter usernames to add, separated by commas. Leave blank to create a group with only you:");
  if (membersText === null) return;
  const memberUsernames = [...new Set(membersText.split(",").map(v => v.trim()).filter(Boolean))];
  try {
    const data = await api("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: cleanName, memberUsernames })
    });
    await loadGroups();
    groupSelect.value = String(data.group.id);
    await openSelectedGroup();
    groupStatus.textContent = `Group "${data.group.name}" created. You are its admin.`;
  } catch (error) {
    groupStatus.textContent = error.message;
  }
});

document.getElementById("manage-group-button").addEventListener("click", async () => {
  const id = Number(groupSelect.value);
  if (!id) {
    groupStatus.textContent = "Select a group first.";
    return;
  }
  try {
    const data = await api(`/api/groups/${id}/members`);
    const memberList = data.members.map(m => `${m.username} (${m.role})`).join("\n");
    alert("Group members:\n" + memberList);
    if (!data.canManage) {
      groupStatus.textContent = "Only group admins can add or remove members.";
      return;
    }
    const action = prompt("Type ADD to add a member, REMOVE to remove a member, or CANCEL:");
    if (!action || action.toUpperCase() === "CANCEL") return;
    if (action.toUpperCase() === "ADD") {
      const username = prompt("Username to add:");
      if (!username) return;
      await api(`/api/groups/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ username: username.trim() })
      });
      groupStatus.textContent = `${username.trim()} added to the group.`;
    } else if (action.toUpperCase() === "REMOVE") {
      const username = prompt("Username to remove (you cannot remove yourself):");
      if (!username) return;
      const member = data.members.find(m => m.username.toLowerCase() === username.trim().toLowerCase());
      if (!member) {
        groupStatus.textContent = "That username is not a member of this group.";
        return;
      }
      await api(`/api/groups/${id}/members/${member.id}`, { method: "DELETE" });
      groupStatus.textContent = `${member.username} removed from the group.`;
    } else {
      groupStatus.textContent = "No change made. Type ADD or REMOVE next time.";
      return;
    }
    await loadGroups();
    groupSelect.value = String(id);
  } catch (error) {
    groupStatus.textContent = error.message;
  }
});

groupMessageForm.addEventListener("submit", async event => {
  event.preventDefault();
  const body = groupMessageInput.value.trim();
  if (!activeGroupId) {
    groupStatus.textContent = "Open a group before sending a message.";
    return;
  }
  if (!body) {
    groupStatus.textContent = "Write a message first.";
    return;
  }
  const button = groupMessageForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api(`/api/groups/${activeGroupId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    groupMessageInput.value = "";
    await openSelectedGroup();
    groupStatus.textContent = "Group message sent.";
  } catch (error) {
    groupStatus.textContent = error.message;
  } finally {
    button.disabled = false;
    groupMessageInput.focus();
  }
});
// Keep the biography character counter in sync with typing.
document.getElementById("profile-bio-input").addEventListener("input", event => {
  document.getElementById("bio-counter").textContent = event.target.value.length;
});

// Save the user's profile.
document.getElementById("save-profile-button").addEventListener("click", async () => {
  const status = document.getElementById("profile-status");
  const payload = {
    bio: document.getElementById("profile-bio-input").value,
    professionalTitle: document.getElementById("profile-title").value,
    organization: document.getElementById("profile-organization").value,
    department: document.getElementById("profile-department").value,
    location: document.getElementById("profile-location").value,
    website: document.getElementById("profile-website").value,
    profileMode: document.getElementById("profile-mode").value
  };

  try {
    const data = await api("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    document.getElementById("profile-bio-display").textContent =
      data.bio || "No bio added yet.";
    const professionalLine = [data.professionalTitle, data.organization].filter(Boolean).join(" · ");
    document.getElementById("profile-professional-line").textContent = professionalLine || "Waltajjii member";

    status.textContent = "Profile saved successfully.";
  } catch (error) {
    status.textContent = error.message;
  }
});

// Upload or replace the profile picture with clear validation and feedback.
const profilePictureInput = document.getElementById("profile-picture-input");
const uploadProfilePictureButton = document.getElementById("upload-profile-picture-button");

profilePictureInput.addEventListener("change", () => {
  const file = profilePictureInput.files && profilePictureInput.files[0];
  const status = document.getElementById("profile-status");
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    profilePictureInput.value = "";
    status.textContent = "Please choose a JPG, PNG or WebP image.";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    profilePictureInput.value = "";
    status.textContent = "Please choose an image smaller than 2 MB.";
    return;
  }
  status.textContent = "Picture selected: " + file.name;
});

uploadProfilePictureButton.addEventListener("click", async () => {
  const input = profilePictureInput;
  const status = document.getElementById("profile-status");
  const file = input.files && input.files[0];

  if (!token) {
    status.textContent = "Please log in again before uploading your picture.";
    return;
  }
  if (!file) {
    status.textContent = "Choose a JPG, PNG or WebP picture first.";
    input.focus();
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    status.textContent = "Unsupported image format. Please use JPG, PNG or WebP.";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    status.textContent = "This picture is too large. The maximum size is 2 MB.";
    return;
  }

  const formData = new FormData();
  formData.append("avatar", file, file.name);
  uploadProfilePictureButton.disabled = true;
  status.textContent = "Uploading your profile picture…";

  try {
    const response = await fetch("/api/uploads/profile-picture", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Upload failed (HTTP " + response.status + "). Please try again.");
    }
    await loadMyProfile();
    input.value = "";
    status.textContent = "Profile picture uploaded successfully.";
  } catch (error) {
    status.textContent = error.message || "Could not upload your profile picture. Please try again.";
  } finally {
    uploadProfilePictureButton.disabled = false;
  }
});

// Remove the profile picture.
document.getElementById("remove-profile-picture-button").addEventListener("click", async () => {
  const status = document.getElementById("profile-status");

  try {
    const response = await fetch("/api/uploads/profile-picture", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Removal failed.");

    await loadMyProfile();
    status.textContent = "Profile picture removed.";
  } catch (error) {
    status.textContent = error.message;
  }
});



/* Waltajjii Phase 3: channels and admin broadcast announcements. */
const channelSelect = document.getElementById("channel-select");
const channelStatus = document.getElementById("channel-status");
const channelMessagesBox = document.getElementById("channel-messages");
const channelMessageForm = document.getElementById("channel-message-form");
const channelMessageInput = document.getElementById("channel-message-input");
let activeChannelId = null;
let cachedChannels = [];
let activeChannelCanPublish = false;

async function loadChannels() {
  if (!token) return;
  try {
    const data = await api("/api/channels");
    cachedChannels = data.channels || [];
    const previous = channelSelect.value;
    channelSelect.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Select a channel";
    channelSelect.appendChild(first);
    cachedChannels.forEach(channel => {
      const option = document.createElement("option");
      option.value = String(channel.id);
      option.textContent = `${channel.name} · ${channel.visibility} · ${channel.memberCount} members${channel.myRole ? " · joined" : ""}`;
      channelSelect.appendChild(option);
    });
    if (cachedChannels.some(c => String(c.id) === previous)) channelSelect.value = previous;
    channelStatus.textContent = cachedChannels.length ? "Choose a channel. Join public channels or open channels you belong to." : "No channels yet. Create the first channel.";
  } catch (error) { channelStatus.textContent = error.message; }
}

async function openSelectedChannel() {
  const id = Number(channelSelect.value);
  if (!id) { channelStatus.textContent = "Select a channel first."; return; }
  const channel = cachedChannels.find(item => item.id === id);
  if (!channel || !channel.myRole) {
    channelStatus.textContent = "Join this public channel first, or ask an admin to invite you to a private channel.";
    return;
  }
  try {
    const data = await api(`/api/channels/${id}/messages`);
    activeChannelId = id;
    activeChannelCanPublish = Boolean(data.canPublish);
    channelMessagesBox.replaceChildren();
    if (!data.messages.length) channelMessagesBox.textContent = "No announcements yet.";
    data.messages.forEach(item => {
      const article = document.createElement("article");
      article.className = "message";
      const heading = document.createElement("strong");
      heading.textContent = item.sender + " · " + item.createdAt;
      const body = document.createElement("div");
      body.textContent = item.body;
      article.append(heading, body);
      channelMessagesBox.appendChild(article);
    });
    channelMessageInput.disabled = !activeChannelCanPublish;
    channelMessageForm.querySelector("button").disabled = !activeChannelCanPublish;
    channelMessageInput.placeholder = activeChannelCanPublish ? "Publish a channel announcement..." : "Only channel admins can publish announcements";
    channelStatus.textContent = channel.myRole + (activeChannelCanPublish ? " — you can publish announcements." : " — read-only channel access.");
  } catch (error) { channelStatus.textContent = error.message; }
}

document.getElementById("create-channel-button").addEventListener("click", async () => {
  const name = prompt("Channel name (maximum 80 characters):");
  if (!name || !name.trim()) return;
  const description = prompt("Short channel description (optional, maximum 300 characters):") || "";
  const visibility = (prompt("Type PUBLIC or PRIVATE:", "PUBLIC") || "PUBLIC").trim().toLowerCase();
  if (!["public", "private"].includes(visibility)) { channelStatus.textContent = "Choose PUBLIC or PRIVATE."; return; }
  try {
    const data = await api("/api/channels", { method: "POST", body: JSON.stringify({ name: name.trim(), description: description.trim(), visibility }) });
    await loadChannels();
    channelSelect.value = String(data.channel.id);
    await openSelectedChannel();
    channelStatus.textContent = "Channel created. You are its owner.";
  } catch (error) { channelStatus.textContent = error.message; }
});
document.getElementById("refresh-channels-button").addEventListener("click", loadChannels);
document.getElementById("open-channel-button").addEventListener("click", openSelectedChannel);
document.getElementById("join-channel-button").addEventListener("click", async () => {
  const id = Number(channelSelect.value);
  const channel = cachedChannels.find(item => item.id === id);
  if (!channel || channel.visibility !== "public") { channelStatus.textContent = "Select a public channel to join."; return; }
  try {
    await api(`/api/channels/${id}/join`, { method: "POST" });
    await loadChannels();
    channelSelect.value = String(id);
    await openSelectedChannel();
    channelStatus.textContent = "You joined the channel.";
  } catch (error) { channelStatus.textContent = error.message; }
});
document.getElementById("manage-channel-button").addEventListener("click", async () => {
  const id = Number(channelSelect.value);
  if (!id) { channelStatus.textContent = "Select a channel first."; return; }
  try {
    const data = await api(`/api/channels/${id}/members`);
    alert("Channel members:\n" + data.members.map(m => `${m.username} (${m.role})`).join("\n"));
    if (!data.canManage) { channelStatus.textContent = "Only channel admins can invite or remove members."; return; }
    const action = (prompt("Type INVITE to add a member, REMOVE to remove a member, or CANCEL:") || "").toUpperCase();
    if (action === "INVITE") {
      const username = prompt("Username to invite:");
      if (!username) return;
      await api(`/api/channels/${id}/members`, { method: "POST", body: JSON.stringify({ username: username.trim() }) });
      channelStatus.textContent = username.trim() + " invited.";
    } else if (action === "REMOVE") {
      const username = prompt("Username to remove:");
      if (!username) return;
      const target = data.members.find(m => m.username.toLowerCase() === username.trim().toLowerCase());
      if (!target) { channelStatus.textContent = "That user is not a channel member."; return; }
      await api(`/api/channels/${id}/members/${target.id}`, { method: "DELETE" });
      channelStatus.textContent = target.username + " removed.";
    }
    await loadChannels();
    channelSelect.value = String(id);
  } catch (error) { channelStatus.textContent = error.message; }
});
channelMessageForm.addEventListener("submit", async event => {
  event.preventDefault();
  const body = channelMessageInput.value.trim();
  if (!activeChannelId || !activeChannelCanPublish) { channelStatus.textContent = "Only channel admins can publish announcements."; return; }
  if (!body) return;
  try {
    await api(`/api/channels/${activeChannelId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    channelMessageInput.value = "";
    await openSelectedChannel();
    channelStatus.textContent = "Announcement published.";
  } catch (error) { channelStatus.textContent = error.message; }
});


// Waltajjii Phase 2: social discovery, connections, feed and notifications.
function socialElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function socialUserCard(user, mode) {
  const card = socialElement("article", "social-card");
  const head = socialElement("div", "social-card-head");
  const avatar = socialElement("img", "social-avatar");
  avatar.alt = user.username + " profile picture";
  if (user.avatarPath) {
    avatar.src = "/api/uploads/profile-picture/" + encodeURIComponent(user.id);
    avatar.onerror = () => avatar.removeAttribute("src");
  }
  const identity = socialElement("div");
  identity.appendChild(socialElement("strong", "", user.username));
  const professional = [user.professionalTitle, user.organization].filter(Boolean).join(" · ");
  if (professional) identity.appendChild(socialElement("div", "social-muted", professional));
  if (user.bio) identity.appendChild(socialElement("div", "social-muted", user.bio));
  head.append(avatar, identity);
  card.appendChild(head);

  if (mode === "discover") {
    card.appendChild(socialElement("p", "social-muted",
      (user.followersCount || 0) + " followers · " + (user.followingCount || 0) + " following"));
    const actions = socialElement("div", "social-actions");
    const follow = socialElement("button", "", user.isFollowing ? "Unfollow" : "Follow");
    follow.type = "button";
    follow.addEventListener("click", async () => {
      try {
        if (user.isFollowing) {
          await api("/api/social/follow/" + user.id, { method: "DELETE" });
        } else {
          await api("/api/social/follow/" + user.id, { method: "POST" });
        }
        await loadDiscover();
        await loadFollowing();
      } catch (error) { alert(error.message); }
    });
    actions.appendChild(follow);

    if (user.connectionStatus === "accepted") {
      actions.appendChild(socialElement("span", "social-muted", "Connected"));
    } else if (user.incomingRequestId) {
      actions.appendChild(socialElement("span", "social-muted", "Request received — respond in Requests"));
    } else if (user.connectionStatus === "pending") {
      actions.appendChild(socialElement("span", "social-muted", "Request pending"));
    } else {
      const connect = socialElement("button", "", "Connect");
      connect.type = "button";
      connect.addEventListener("click", async () => {
        try {
          await api("/api/social/connect/" + user.id, { method: "POST" });
          await loadDiscover();
          await loadRequests();
        } catch (error) { alert(error.message); }
      });
      actions.appendChild(connect);
    }
    card.appendChild(actions);
  } else if (mode === "following") {
    const unfollow = socialElement("button", "", "Unfollow");
    unfollow.type = "button";
    unfollow.addEventListener("click", async () => {
      try {
        await api("/api/social/follow/" + user.id, { method: "DELETE" });
        await loadFollowing();
        await loadDiscover();
      } catch (error) { alert(error.message); }
    });
    card.appendChild(unfollow);
  }
  return card;
}

async function loadDiscover() {
  const host = document.getElementById("discover-results");
  host.replaceChildren(socialElement("p", "social-empty", "Searching..."));
  try {
    const q = document.getElementById("social-search").value.trim();
    const data = await api("/api/social/discover?q=" + encodeURIComponent(q));
    host.replaceChildren();
    if (!data.users.length) {
      host.appendChild(socialElement("p", "social-empty", "No matching members found."));
      return;
    }
    data.users.forEach(user => host.appendChild(socialUserCard(user, "discover")));
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}

async function loadRequests() {
  const host = document.getElementById("social-request-list");
  host.replaceChildren(socialElement("p", "social-empty", "Loading requests..."));
  try {
    const data = await api("/api/social/requests");
    host.replaceChildren();
    host.appendChild(socialElement("h4", "", "Incoming requests"));
    if (!data.incoming.length) host.appendChild(socialElement("p", "social-empty", "No incoming requests."));
    data.incoming.forEach(request => {
      const card = socialElement("article", "social-card");
      card.appendChild(socialElement("strong", "", request.username));
      const actions = socialElement("div", "social-actions");
      ["accept", "decline"].forEach(action => {
        const button = socialElement("button", "", action === "accept" ? "Accept" : "Decline");
        button.type = "button";
        button.addEventListener("click", async () => {
          try {
            await api("/api/social/requests/" + request.id + "/respond", {
              method: "POST", body: JSON.stringify({ action })
            });
            await loadRequests();
            await loadDiscover();
            await loadFollowing();
            await loadNotifications();
          } catch (error) { alert(error.message); }
        });
        actions.appendChild(button);
      });
      card.appendChild(actions);
      host.appendChild(card);
    });
    host.appendChild(socialElement("h4", "", "Sent requests"));
    if (!data.outgoing.length) host.appendChild(socialElement("p", "social-empty", "No pending sent requests."));
    data.outgoing.forEach(request => host.appendChild(socialElement("p", "social-muted", request.username + " — awaiting response")));
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}

async function loadFollowing() {
  const host = document.getElementById("social-following-list");
  host.replaceChildren(socialElement("p", "social-empty", "Loading..."));
  try {
    const data = await api("/api/social/following");
    host.replaceChildren();
    if (!data.users.length) {
      host.appendChild(socialElement("p", "social-empty", "You are not following anyone yet. Discover members to get started."));
      return;
    }
    data.users.forEach(user => host.appendChild(socialUserCard(user, "following")));
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}

async function loadComments(postId, listHost) {
  listHost.replaceChildren(socialElement("p", "social-muted", "Loading comments..."));
  try {
    const data = await api("/api/social/posts/" + postId + "/comments");
    listHost.replaceChildren();
    if (!data.comments.length) listHost.appendChild(socialElement("p", "social-muted", "No comments yet."));
    data.comments.forEach(comment => {
      const item = socialElement("div", "social-comment");
      item.appendChild(socialElement("strong", "", comment.username));
      item.appendChild(socialElement("div", "", comment.content));
      listHost.appendChild(item);
    });
  } catch (error) {
    listHost.replaceChildren(socialElement("p", "social-muted", error.message));
  }
}

async function loadFeed() {
  const host = document.getElementById("social-feed-posts");
  host.replaceChildren(socialElement("p", "social-empty", "Loading feed..."));
  try {
    const data = await api("/api/social/feed");
    host.replaceChildren();
    if (!data.posts.length) {
      host.appendChild(socialElement("p", "social-empty", "Your feed is empty. Follow members or publish your first update."));
      return;
    }
    data.posts.forEach(post => {
      const card = socialElement("article", "social-card");
      const head = socialElement("div", "social-card-head");
      head.appendChild(socialElement("strong", "", post.username));
      head.appendChild(socialElement("span", "social-muted", post.createdAt));
      card.appendChild(head);
      card.appendChild(socialElement("div", "social-post", post.content));
      const actions = socialElement("div", "social-actions");
      const like = socialElement("button", "", (post.likedByMe ? "Unlike" : "Like") + " · " + post.likeCount);
      like.type = "button";
      like.addEventListener("click", async () => {
        try { await api("/api/social/posts/" + post.id + "/like", { method: "POST" }); await loadFeed(); await loadNotifications(); }
        catch (error) { alert(error.message); }
      });
      const commentsButton = socialElement("button", "", "Comments · " + post.commentCount);
      commentsButton.type = "button";
      actions.append(like, commentsButton);
      card.appendChild(actions);
      const commentsHost = socialElement("div", "social-section");
      commentsHost.hidden = true;
      const commentsList = socialElement("div", "social-comments-list");
      commentsHost.appendChild(commentsList);
      commentsButton.addEventListener("click", async () => {
        commentsHost.hidden = !commentsHost.hidden;
        if (!commentsHost.hidden) await loadComments(post.id, commentsList);
      });
      const commentForm = document.createElement("form");
      const commentInput = socialElement("input", "social-input");
      commentInput.maxLength = 1000;
      commentInput.placeholder = "Write a comment...";
      const commentSubmit = socialElement("button", "", "Comment");
      commentSubmit.type = "submit";
      commentForm.append(commentInput, commentSubmit);
      commentForm.addEventListener("submit", async event => {
        event.preventDefault();
        const content = commentInput.value.trim();
        if (!content) return;
        try {
          await api("/api/social/posts/" + post.id + "/comments", {
            method: "POST", body: JSON.stringify({ content })
          });
          commentInput.value = "";
          await loadComments(post.id, commentsList);
          await loadFeed();
          await loadNotifications();
        } catch (error) { alert(error.message); }
      });
      commentsHost.appendChild(commentForm);
      card.appendChild(commentsHost);
      host.appendChild(card);
    });
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}


async function loadFollowers() {
  const host = document.getElementById("social-followers-list");
  host.replaceChildren(socialElement("p", "social-empty", "Loading..."));
  try {
    const data = await api("/api/social/followers");
    host.replaceChildren();
    if (!data.users.length) {
      host.appendChild(socialElement("p", "social-empty", "You do not have followers yet."));
      return;
    }
    data.users.forEach(user => {
      const card = socialElement("article", "social-card");
      const head = socialElement("div", "social-card-head");
      const avatar = socialElement("img", "social-avatar");
      avatar.alt = user.username + " profile picture";
      if (user.avatarPath) avatar.src = "/api/uploads/profile-picture/" + encodeURIComponent(user.id);
      const identity = socialElement("div");
      identity.appendChild(socialElement("strong", "", user.username));
      const details = [user.professionalTitle, user.organization, user.bio].filter(Boolean).join(" · ");
      if (details) identity.appendChild(socialElement("div", "social-muted", details));
      head.append(avatar, identity);
      card.appendChild(head);
      host.appendChild(card);
    });
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}

async function loadNotifications() {
  const host = document.getElementById("social-notification-list");
  host.replaceChildren(socialElement("p", "social-empty", "Loading..."));
  try {
    const data = await api("/api/social/notifications");
    host.replaceChildren();
    if (!data.notifications.length) {
      host.appendChild(socialElement("p", "social-empty", "No notifications yet."));
      return;
    }
    data.notifications.forEach(item => {
      const row = socialElement("article", "social-card");
      row.appendChild(socialElement("strong", "", item.actorUsername || "Waltajjii"));
      row.appendChild(socialElement("span", "", " " + item.message));
      row.appendChild(socialElement("div", "social-muted", item.createdAt + (item.isRead ? "" : " · New")));
      host.appendChild(row);
    });
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}

let momentMediaUrls = [];

async function loadMoments() {
  const host = document.getElementById("moment-list");
  const status = document.getElementById("moment-status");
  momentMediaUrls.forEach(url => URL.revokeObjectURL(url));
  momentMediaUrls = [];
  host.replaceChildren(socialElement("p", "social-empty", "Loading Moments..."));
  try {
    const data = await api("/api/moments");
    host.replaceChildren();
    if (!data.moments.length) {
      host.appendChild(socialElement("p", "social-empty", "No active Moments yet. Share the first one."));
      return;
    }
    data.moments.forEach(moment => {
      const card = socialElement("article", "moment-card");
      const head = socialElement("div", "moment-card-head");
      head.appendChild(socialElement("strong", "", moment.username));
      const expires = new Date(String(moment.expiresAt).replace(" ", "T") + "Z");
      const remaining = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 3600000));
      head.appendChild(socialElement("span", "social-muted", remaining + "h left · " + (moment.audience === "everyone" ? "Everyone" : "Followers")));
      card.appendChild(head);
      if (moment.content) card.appendChild(socialElement("p", "moment-content", moment.content));
      if (moment.mediaPath) {
        const mediaHost = socialElement("div", "moment-media-host");
        mediaHost.appendChild(socialElement("p", "social-muted", "Loading media..."));
        card.appendChild(mediaHost);
        fetch("/api/moments/media/" + moment.id, {
          headers: { Authorization: "Bearer " + token }
        }).then(response => {
          if (!response.ok) throw new Error("Media unavailable");
          return response.blob();
        }).then(blob => {
          const url = URL.createObjectURL(blob);
          momentMediaUrls.push(url);
          const media = document.createElement(moment.mediaType === "video" ? "video" : "img");
          media.className = "moment-media";
          if (moment.mediaType === "video") {
            media.controls = true;
            media.playsInline = true;
            media.preload = "metadata";
          } else {
            media.alt = "Moment shared by " + moment.username;
            media.loading = "lazy";
          }
          media.src = url;
          mediaHost.replaceChildren(media);
        }).catch(() => {
          mediaHost.replaceChildren(socialElement("p", "social-muted", "This media could not be loaded."));
        });
      }
      if (moment.isMine) {
        const actions = socialElement("div", "social-actions");
        const remove = socialElement("button", "moment-delete", "Delete Moment");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!confirm("Delete this Moment?")) return;
          remove.disabled = true;
          try {
            await api("/api/moments/" + moment.id, { method: "DELETE" });
            await loadMoments();
            status.textContent = "Moment deleted.";
          } catch (error) {
            status.textContent = error.message;
            remove.disabled = false;
          }
        });
        actions.appendChild(remove);
        card.appendChild(actions);
      }
      host.appendChild(card);
    });
  } catch (error) {
    host.replaceChildren(socialElement("p", "social-empty", error.message));
  }
}

document.getElementById("moment-form").addEventListener("submit", async event => {
  event.preventDefault();
  const content = document.getElementById("moment-content");
  const mediaInput = document.getElementById("moment-media");
  const audience = document.getElementById("moment-audience");
  const status = document.getElementById("moment-status");
  const file = mediaInput.files[0];
  if (!content.value.trim() && !file) {
    status.textContent = "Write a short update or choose a photo/video.";
    return;
  }
  if (file && file.size > 10 * 1024 * 1024) {
    status.textContent = "Please choose a file smaller than 10 MB.";
    return;
  }
  const button = document.getElementById("publish-moment-button");
  button.disabled = true;
  status.textContent = "Publishing your Moment...";
  try {
    const formData = new FormData();
    formData.append("content", content.value.trim());
    formData.append("audience", audience.value);
    if (file) formData.append("media", file);
    const response = await fetch("/api/moments", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not publish this Moment.");
    content.value = "";
    mediaInput.value = "";
    status.textContent = "Your Moment is live. It will expire after 24 hours.";
    await loadMoments();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function loadSocialData() {
  await Promise.all([loadMoments(), loadDiscover(), loadFeed(), loadRequests(), loadFollowing(), loadFollowers(), loadNotifications()]);
}

document.getElementById("social-search-button").addEventListener("click", loadDiscover);
document.getElementById("social-search").addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); loadDiscover(); }
});
document.getElementById("social-post-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = document.getElementById("social-post-content");
  const content = input.value.trim();
  if (!content) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api("/api/social/posts", { method: "POST", body: JSON.stringify({ content }) });
    input.value = "";
    await loadFeed();
    statusBox.textContent = "Your post was published.";
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.getElementById("social-mark-read-button").addEventListener("click", async () => {
  try {
    await api("/api/social/notifications/read", { method: "POST" });
    await loadNotifications();
  } catch (error) { alert(error.message); }
});
document.getElementById("social-moments-tab").addEventListener("click", loadMoments);
document.getElementById("social-discover-tab").addEventListener("click", loadDiscover);
document.getElementById("social-feed-tab").addEventListener("click", loadFeed);
document.getElementById("social-requests-tab").addEventListener("click", loadRequests);
document.getElementById("social-following-tab").addEventListener("click", loadFollowing);
document.getElementById("social-followers-tab").addEventListener("click", loadFollowers);
document.getElementById("social-notifications-tab").addEventListener("click", loadNotifications);


// Phase 10: profile-first menu; workspace details open only after a menu selection.
(function initWaltajjiiNavigation() {
  const shell = document.querySelector(".wt-app-shell");
  const toggle = document.getElementById("wt-nav-toggle");
  const sidebar = document.getElementById("wt-sidebar");
  const home = document.getElementById("wt-home-placeholder");
  const account = document.getElementById("wt-account-section");
  if (!shell || !toggle || !sidebar) return;

  function showTarget(link) {
    const targetId = decodeURIComponent((link.getAttribute("href") || "").slice(1));
    const target = document.getElementById(targetId);
    if (!target) return;
    if (home) home.hidden = true;

    document.querySelectorAll(".wt-content-section").forEach(section => {
      section.classList.remove("wt-section-active");
    });
    if (account) {
      account.querySelectorAll(":scope > #profile-panel, :scope > #personalization-panel")
        .forEach(panel => panel.classList.add("wt-subsection-hidden"));
    }

    const section = target.closest(".wt-content-section");
    if (section) section.classList.add("wt-section-active");
    if (section && section.id === "wt-account-section") {
      target.classList.remove("wt-subsection-hidden");
    }

    sidebar.querySelectorAll("a[aria-current='location']").forEach(item => item.removeAttribute("aria-current"));
    link.setAttribute("aria-current", "location");
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  toggle.addEventListener("click", () => {
    const isOpen = shell.classList.toggle("wt-sidebar-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.textContent = isOpen ? "✕ Close menu" : "☰ Menu";
  });

  sidebar.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      showTarget(link);
      if (window.matchMedia("(max-width: 820px)").matches) {
        shell.classList.remove("wt-sidebar-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "☰ Menu";
      }
    });
  });

  sidebar.querySelectorAll(".wt-nav-group").forEach(group => {
    group.addEventListener("toggle", () => {
      if (!group.open) return;
      sidebar.querySelectorAll(".wt-nav-group").forEach(other => {
        if (other !== group) other.open = false;
      });
    });
  });
})();
