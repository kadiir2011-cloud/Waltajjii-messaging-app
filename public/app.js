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
      authPanel.style.display = "none";
      chatPanel.style.display = "block";
      document.getElementById("welcome-user").textContent =
        "Logged in as " + username;
      statusBox.textContent = "Choose a recipient to begin.";
      loadUsers();
      loadGroups();
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
  option.textContent = user.username;
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
  content.textContent = item.body || "";

  if (item.mediaPath && item.mediaType) {
    const mediaUrl =
      "/api/uploads/" + encodeURIComponent(item.mediaPath);

    if (item.mediaType === "image") {
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

    messageForm.addEventListener("submit", async event => {
  event.preventDefault();

  const receiverUsername = recipient.value;
  const body = messageInput.value.trim();
  const file = mediaInput.files[0];

  if (!receiverUsername) {
    statusBox.textContent = "Please select a recipient first.";
    return;
  }

  if (!body && !file) {
    statusBox.textContent = "Write a message or select a file.";
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
          body,
          mediaPath: uploadResult.fileId,
          mediaType: uploadResult.mediaType
        })
      });

      mediaInput.value = "";
      messageInput.value = "";

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

const meteredCredentialApiKey = "PASTE_YOUR_NEW_METERED_API_KEY_HERE";

let rtcConfigurationPromise = null;

async function getRtcConfiguration() {
  if (!rtcConfigurationPromise) {
    rtcConfigurationPromise = fetch(
      "https://waltajjii-calls.metered.live/api/v1/turn/credentials?apiKey=" +
      encodeURIComponent(meteredCredentialApiKey)
    )
      .then(async response => {
        if (!response.ok) {
          throw new Error("Could not load TURN server settings.");
        }

        const iceServers = await response.json();

        if (!Array.isArray(iceServers) || iceServers.length === 0) {
          throw new Error("No ICE servers were returned.");
        }

        return { iceServers };
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
