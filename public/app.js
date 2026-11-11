
// Phase 7: local appearance preferences. These settings are private to this browser.
(function initWaltajjiiAppearance() {
  const defaults = { theme: "system", accent: "teal", wallpaper: "plain", lowData: false };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("waltajjii-appearance") || "{}"); } catch { saved = {}; }
  const prefs = { ...defaults, ...saved };
  const accents = { teal: "#087f78", blue: "#2563eb", violet: "#7c3aed", rose: "#e11d48", green: "#15803d" };
  const themeSelect = document.getElementById("wt-theme");
  const accentSelect = document.getElementById("wt-accent");
  const wallpaperSelect = document.getElementById("wt-wallpaper");
  const lowDataSelect = document.getElementById("wt-low-data");
  const status = document.getElementById("wt-preferences-status");
  if (!themeSelect || !accentSelect || !wallpaperSelect || !lowDataSelect) return;
  themeSelect.value = ["light", "dark", "system"].includes(prefs.theme) ? prefs.theme : "system";
  accentSelect.value = Object.hasOwn(accents, prefs.accent) ? prefs.accent : "teal";
  wallpaperSelect.value = ["plain", "soft", "sky", "warm"].includes(prefs.wallpaper) ? prefs.wallpaper : "plain";
  lowDataSelect.checked = prefs.lowData === true;
  function apply() {
    document.body.dataset.wtLowData = lowDataSelect.checked ? "true" : "false";
    const selectedTheme = themeSelect.value;
    const dark = selectedTheme === "dark" || (selectedTheme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.body.dataset.wtTheme = dark ? "dark" : "light";
    document.body.style.setProperty("--wt-teal", accents[accentSelect.value] || accents.teal);
    document.body.dataset.wtWallpaper = wallpaperSelect.value;
    try {
      localStorage.setItem("waltajjii-appearance", JSON.stringify({ theme: selectedTheme, accent: accentSelect.value, wallpaper: wallpaperSelect.value, lowData: lowDataSelect.checked }));
      status.textContent = "Your appearance and data preferences are saved on this device.";
    } catch { status.textContent = "Preferences are applied for this session but could not be saved by this browser."; }
  }
  [themeSelect, accentSelect, wallpaperSelect, lowDataSelect].forEach(control => control.addEventListener("change", apply));
  if (window.matchMedia) {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    systemTheme.addEventListener?.("change", () => { if (themeSelect.value === "system") apply(); });
  }
  apply();
})();
function isLowDataMode() { return document.getElementById("wt-low-data")?.checked === true; }
function createMediaLoadButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary media-load-button";
  button.textContent = label;
  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = "Loading…";
    onClick(() => button.remove(), error => {
      button.disabled = false;
      button.textContent = "Retry loading";
      console.error("Could not load media:", error);
    });
  });
  return button;
}
const authPanel = document.getElementById("auth-panel");
    const chatPanel = document.getElementById("chat-panel");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const authStatus = document.getElementById("auth-status");
    const statusBox = document.getElementById("status");
    const recipient = document.getElementById("recipient");
    const messagesBox = document.getElementById("messages");
    const messageForm = document.getElementById("message-form");
    let replyingToMessage = null;
    let replyComposer = null;
    const messageInput = document.getElementById("message-input");
const mediaInput = document.getElementById("media-input");
    let recordedVoiceFile = null;
    let voiceRecorder = null;
    let voiceStream = null;
    let voiceChunks = [];

    let token = null;
    let currentUsername = null;
let callSocket = null;
const onlineUserIds = new Set();
let presenceLine = null;
let typingLine = null;
let typingTargetUserId = null;
let typingStopTimer = null;

function ensurePresenceElements() {
  if (!presenceLine && messagesBox?.parentNode) {
    presenceLine = document.createElement("div");
    presenceLine.className = "wt-presence-status";
    presenceLine.style.cssText = "font-size:0.9rem;margin:0.35rem 0;color:#64748b;";
    messagesBox.parentNode.insertBefore(presenceLine, messagesBox);
  }

  if (!typingLine && messageForm?.parentNode) {
    typingLine = document.createElement("div");
    typingLine.className = "wt-typing-indicator";
    typingLine.setAttribute("aria-live", "polite");
    typingLine.style.cssText = "min-height:1.25rem;font-size:0.88rem;color:#087f78;margin:0.2rem 0;";
    messageForm.parentNode.insertBefore(typingLine, messageForm);
  }
}

function refreshPresenceUI() {
  ensurePresenceElements();

  Array.from(recipient.options).forEach(option => {
    if (!option.value) return;
    const userId = userIdsByUsername.get(option.value);
    const baseLabel = option.dataset.baseLabel || option.textContent.replace(/ · (Online|Offline)$/, "");
    option.dataset.baseLabel = baseLabel;
    option.textContent = baseLabel + (onlineUserIds.has(String(userId)) ? " · Online" : " · Offline");
  });

  if (!presenceLine) return;
  const selectedUsername = recipient.value;
  if (!selectedUsername) {
    presenceLine.textContent = "Contact status will appear here.";
    presenceLine.style.color = "#64748b";
    return;
  }

  const selectedUserId = userIdsByUsername.get(selectedUsername);
  const online = onlineUserIds.has(String(selectedUserId));
  presenceLine.textContent = selectedUsername + (online ? " is online" : " is offline");
  presenceLine.style.color = online ? "#15803d" : "#64748b";
}

const liveOnlineList = document.getElementById("wt-online-list");
const liveOnlineCount = document.getElementById("wt-online-count");
let liveOnlineRequest = null;

async function loadOnlinePeople() {
  if (!liveOnlineList || !token) return;
  if (liveOnlineRequest) return liveOnlineRequest;
  liveOnlineRequest = (async () => {
    try {
      const data = await api("/api/presence/online");
      const users = Array.isArray(data.users) ? data.users : [];
      liveOnlineList.replaceChildren();
      if (liveOnlineCount) liveOnlineCount.textContent = users.length + (users.length === 1 ? " online" : " online");
      if (!users.length) {
        const empty = document.createElement("p");
        empty.className = "wt-online-empty";
        empty.textContent = "No other members are online right now. This list updates automatically as people join.";
        liveOnlineList.appendChild(empty);
        return;
      }
      users.forEach(user => {
        const card = document.createElement("article");
        card.className = "wt-online-card";
        const avatar = document.createElement("div");
        avatar.className = "wt-online-avatar";
        const fallback = document.createElement("span");
        fallback.textContent = (user.fullName || "W").trim().charAt(0).toUpperCase();
        avatar.appendChild(fallback);
        if (user.avatarPath) {
          const image = document.createElement("img");
          image.src = user.avatarPath;
          image.alt = "";
          image.loading = "lazy";
          image.onerror = () => image.remove();
          avatar.appendChild(image);
        }
        const dot = document.createElement("span");
        dot.className = "wt-online-dot";
        dot.setAttribute("aria-label", "Online");
        avatar.appendChild(dot);
        const copy = document.createElement("div");
        copy.className = "wt-online-copy";
        const name = document.createElement("strong");
        name.className = "wt-online-name";
        name.textContent = user.fullName || "Waltajjii member";
        const role = document.createElement("span");
        role.className = "wt-online-role";
        role.textContent = [user.professionalTitle, user.organization].filter(Boolean).join(" · ") || "Waltajjii member";
        copy.append(name, role);
        const actions = document.createElement("div");
        actions.className = "wt-online-actions";

        async function activateOnlineMember(action) {
          let entry = [...userIdsByUsername.entries()].find(([, id]) => String(id) === String(user.userId));
          if (!entry) {
            statusBox.textContent = "Connecting to this member…";
            await loadUsers();
            entry = [...userIdsByUsername.entries()].find(([, id]) => String(id) === String(user.userId));
          }
          if (!entry) {
            statusBox.textContent = "This member is online, but their account could not be selected. Please try again.";
            return;
          }

          // Open Direct messages and select the member before messaging or calling.
          document.querySelector('#wt-sidebar a[href="#wt-communication-section"]')?.click();
          recipient.value = entry[0];
          recipient.dispatchEvent(new Event("change"));

          if (action === "video") {
            startVideoCall();
          } else if (action === "voice") {
            startVoiceCall();
          } else {
            document.getElementById("message-input")?.focus();
            document.getElementById("wt-communication-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }

        [
          { label: "Message", action: "message", icon: "✉" },
          { label: "Video call", action: "video", icon: "▣" },
          { label: "Voice call", action: "voice", icon: "☎" }
        ].forEach(item => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "wt-online-action wt-online-action-" + item.action;
          button.textContent = item.icon + " " + item.label;
          button.setAttribute("aria-label", item.label + " " + (user.fullName || "online member"));
          button.addEventListener("click", () => activateOnlineMember(item.action));
          actions.appendChild(button);
        });
        card.append(avatar, copy, actions);
        liveOnlineList.appendChild(card);
      });
    } catch (error) {
      liveOnlineList.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "wt-online-empty";
      empty.textContent = "Live presence is temporarily unavailable. " + error.message;
      liveOnlineList.appendChild(empty);
    } finally {
      liveOnlineRequest = null;
    }
  })();
  return liveOnlineRequest;
}

function stopTypingIndicator() {
  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }

  if (callSocket && typingTargetUserId) {
    callSocket.emit("typing:stop", { targetUserId: typingTargetUserId });
  }

  typingTargetUserId = null;
  if (typingLine) typingLine.textContent = "";
}

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
      statusBox.textContent = "Choose a recipient to begin.";
      loadUsers();
      loadOnlinePeople();
      loadGroups();
      loadChannels();
      loadSocialData();
      processGroupInvitationLink();
    }
async function loadMyProfile() {
  const profileStatus = document.getElementById("profile-status");
  const bioInput = document.getElementById("profile-bio-input");
  const bioDisplay = document.getElementById("profile-bio-display");
  const usernameDisplay = document.getElementById("profile-username");
  const fullNameInput = document.getElementById("profile-full-name-input");
  const backgroundInput = document.getElementById("profile-background");
  const fullNameDisplay = document.getElementById("profile-full-name-display");
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
    fullNameInput.value = user.fullName || "";
    fullNameDisplay.textContent = user.fullName || "Waltajjii member";
    backgroundInput.value = user.profileBackground || "mist";
    document.getElementById("profile-hero").dataset.profileBackground = backgroundInput.value;
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
    document.getElementById("profile-professional-line").textContent = professionalLine || "Add your profession and institution";

    const sidebarUsername = document.getElementById("wt-sidebar-username");
    const sidebarProfessional = document.getElementById("wt-sidebar-professional");
    const sidebarAvatar = document.getElementById("wt-sidebar-avatar");
    const sidebarFallback = document.getElementById("wt-sidebar-avatar-fallback");
    if (sidebarUsername) sidebarUsername.textContent = user.fullName || "Your profile";
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
      stopTypingIndicator();
      if (callSocket) {
        callSocket.disconnect();
        callSocket = null;
      }
      onlineUserIds.clear();
      refreshPresenceUI();
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
registerMessagingSocketHandlers(callSocket);
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
  option.dataset.baseLabel = option.textContent;
  recipient.appendChild(option);
});
        refreshPresenceUI();
        loadOnlinePeople();
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

  if (item.forwardedFromUsername) {
    const forwarded = document.createElement("small");
    forwarded.textContent = "↪ Forwarded from " + item.forwardedFromUsername;
    forwarded.style.cssText = "display:block;margin:3px 0 7px;color:#64748b;font-size:.78rem;";
    element.appendChild(forwarded);
  }

  if (item.replyToMessageId) {
    const quote = document.createElement("div");
    quote.className = "wt-reply-quote";
    quote.style.cssText = "padding:7px 10px;margin:0 0 8px;border-left:3px solid #0d9488;background:rgba(100,116,139,.10);border-radius:6px;font-size:.85rem;";
    quote.textContent = "↪ " + (item.replyToSender || "Original message") + ": " + (item.replyToBody || "Message unavailable");
    element.appendChild(quote);
  }

  const content = document.createElement("div");
  const isVoiceMessage = Boolean(item.mediaPath && item.mediaType === "document" && String(item.body || "").startsWith("[Voice message]"));
  content.textContent = isVoiceMessage ? String(item.body || "").replace(/^\[Voice message\]\s*/, "") : (item.body || "");

  if (item.mediaPath && item.mediaType && !item.deletedAt) {
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
      const loadVoiceMedia = (done, fail) => {
        fetch(mediaUrl, { headers: { Authorization: "Bearer " + token } })
          .then(response => { if (!response.ok) throw new Error("Voice message request failed: " + response.status); return response.blob(); })
          .then(blob => { audio.src = URL.createObjectURL(blob); if (done) done(); })
          .catch(error => { title.textContent = "Voice message unavailable"; if (fail) fail(error); });
      };
      if (isLowDataMode()) player.appendChild(createMediaLoadButton("Load voice message", loadVoiceMedia));
      else loadVoiceMedia();
      player.append(top, waveform, audio);
      content.appendChild(player);
    } else if (item.mediaType === "image") {
  const image = document.createElement("img");

  const loadImageMedia = (done, fail) => {
    fetch(mediaUrl, { headers: { Authorization: "Bearer " + token } })
      .then(response => { if (!response.ok) throw new Error("Image request failed: " + response.status); return response.blob(); })
      .then(blob => {
        const imageUrl = URL.createObjectURL(blob);
        image.src = imageUrl;
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
        if (done) done();
      })
      .catch(error => { image.alt = "Image could not be loaded"; if (fail) fail(error); });
  };
  if (isLowDataMode()) content.appendChild(createMediaLoadButton("Load image (uses data)", loadImageMedia));
  else loadImageMedia();

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

  const durationLabel = document.createElement("small");
  durationLabel.textContent = "Duration: loading…";
  durationLabel.style.cssText = "display:block;margin-top:5px;color:#64748b;font-size:.82rem;";

  function formatVideoDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours > 0
      ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0")
      : minutes + ":" + String(secs).padStart(2, "0");
  }

  video.addEventListener("loadedmetadata", () => {
    const duration = formatVideoDuration(video.duration);
    durationLabel.textContent = duration ? "Duration: " + duration : "Duration unavailable";
  });
  video.addEventListener("error", () => {
    durationLabel.textContent = "Video duration unavailable";
  });

  const loadVideoMedia = (done, fail) => {
    fetch(mediaUrl, { headers: { Authorization: "Bearer " + token } })
      .then(response => { if (!response.ok) throw new Error("Video request failed: " + response.status); return response.blob(); })
      .then(blob => { video.src = URL.createObjectURL(blob); video.load(); if (done) done(); })
      .catch(error => { video.textContent = "Video could not be loaded."; durationLabel.textContent = "Video duration unavailable"; if (fail) fail(error); });
  };
  content.append(video, durationLabel);
  if (isLowDataMode()) content.appendChild(createMediaLoadButton("Load video (uses data)", loadVideoMedia));
  else loadVideoMedia();

} else if (item.mediaType === "document") {
  const link = document.createElement("a");

  link.textContent = "⬇ Download document: " + item.mediaPath;
  link.style.display = "inline-block";
  link.style.marginTop = "8px";
  link.style.padding = "8px 12px";
  link.style.border = "1px solid #888";
  link.style.borderRadius = "6px";

  link.hidden = true;
  const loadDocumentMedia = (done, fail) => {
    fetch(mediaUrl, { headers: { Authorization: "Bearer " + token } })
      .then(response => { if (!response.ok) throw new Error("Document request failed: " + response.status); return response.blob(); })
      .then(blob => { link.href = URL.createObjectURL(blob); link.download = item.mediaPath; link.hidden = false; if (done) done(); })
      .catch(error => { link.textContent = "Document could not be downloaded."; if (fail) fail(error); });
  };
  content.appendChild(link);
  if (isLowDataMode()) content.appendChild(createMediaLoadButton("Prepare document download", loadDocumentMedia));
  else loadDocumentMedia();
}
  } // Closes the outer media condition

  const time = document.createElement("small");
  time.className = "muted";
  time.textContent = item.createdAt;
  element.append(label, content, time);
  if (item.editedAt && !item.deletedAt) {
    const edited = document.createElement("small");
    edited.textContent = "Edited";
    edited.title = "Edited at " + item.editedAt;
    edited.style.cssText = "display:inline-block;margin-left:7px;color:#64748b;font-size:.75rem;";
    element.appendChild(edited);
  }

  const messageActions = document.createElement("div");
  messageActions.className = "wt-message-actions";
  messageActions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;";
  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.textContent = "↩ Reply";
  replyButton.style.cssText = "font-size:.78rem;padding:4px 8px;";
  replyButton.addEventListener("click", () => {
    replyingToMessage = item;
    showReplyComposer();
    messageInput.focus();
  });
  messageActions.appendChild(replyButton);

  if (item.sender === currentUsername && !item.deletedAt && !item.mediaPath) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "✏️ Edit";
    editButton.style.cssText = "font-size:.78rem;padding:4px 8px;";
    editButton.addEventListener("click", async () => {
      const revisedText = prompt("Edit your message (maximum 2000 characters):", item.body || "");
      if (revisedText === null) return;
      if (!revisedText.trim()) {
        alert("Message cannot be empty.");
        return;
      }
      editButton.disabled = true;
      try {
        await api("/api/messages/" + item.id + "/edit", {
          method: "PATCH",
          body: JSON.stringify({ body: revisedText })
        });
        await loadConversation();
      } catch (error) {
        statusBox.textContent = error.message;
        editButton.disabled = false;
      }
    });
    messageActions.appendChild(editButton);
  }

  ["👍","❤️","😂","😮","😢","🎉","🙏","🔥"].forEach(emoji => {
    const reactionButton = document.createElement("button");
    reactionButton.type = "button";
    reactionButton.textContent = emoji;
    reactionButton.title = "React with " + emoji;
    reactionButton.style.cssText = "font-size:.9rem;padding:3px 6px;min-width:30px;";
    reactionButton.addEventListener("click", async () => {
      try {
        const result = await api("/api/messages/" + item.id + "/reactions", {
          method: "POST", body: JSON.stringify({ emoji })
        });
        item.reactions = result.reactions;
        loadConversation();
      } catch (error) { statusBox.textContent = error.message; }
    });
    messageActions.appendChild(reactionButton);
  });

  (item.reactions || []).forEach(reaction => {
    const chip = document.createElement("span");
    chip.textContent = reaction.emoji + " " + reaction.count;
    chip.title = reaction.usernames || "Reaction";
    chip.style.cssText = "font-size:.78rem;padding:3px 7px;border:1px solid " + (reaction.reactedByMe ? "#0d9488" : "rgba(100,116,139,.5)") + ";border-radius:14px;background:" + (reaction.reactedByMe ? "rgba(13,148,136,.12)" : "transparent");
    messageActions.appendChild(chip);
  });

  const forwardButton = document.createElement("button");
  forwardButton.type = "button";
  forwardButton.textContent = "↗ Forward";
  forwardButton.title = "Forward this message to another conversation";
  forwardButton.style.cssText = "font-size:.78rem;padding:4px 8px;";
  forwardButton.addEventListener("click", async () => {
    const targetUsername = prompt("Enter the recipient username:");
    if (!targetUsername || !targetUsername.trim()) return;
    forwardButton.disabled = true;
    try {
      await api("/api/messages/" + item.id + "/forward", {
        method: "POST",
        body: JSON.stringify({ receiverUsername: targetUsername.trim() })
      });
      statusBox.textContent = "Message forwarded to " + targetUsername.trim() + ".";
    } catch (error) {
      statusBox.textContent = error.message;
    } finally {
      forwardButton.disabled = false;
    }
  });
  messageActions.appendChild(forwardButton);
  if (!item.deletedAt) {
    const deleteMeButton = document.createElement("button");
    deleteMeButton.type = "button";
    deleteMeButton.textContent = "🗑 Delete for me";
    deleteMeButton.style.cssText = "font-size:.78rem;padding:4px 8px;";
    deleteMeButton.addEventListener("click", async () => {
      if (!confirm("Remove this message from your conversation?")) return;
      deleteMeButton.disabled = true;
      try {
        await api("/api/messages/" + item.id + "/delete", {
          method: "DELETE", body: JSON.stringify({ scope: "me" })
        });
        await loadConversation();
      } catch (error) {
        statusBox.textContent = error.message;
        deleteMeButton.disabled = false;
      }
    });
    messageActions.appendChild(deleteMeButton);

    if (item.sender === currentUsername) {
      const deleteEveryoneButton = document.createElement("button");
      deleteEveryoneButton.type = "button";
      deleteEveryoneButton.textContent = "🗑 Delete for everyone";
      deleteEveryoneButton.style.cssText = "font-size:.78rem;padding:4px 8px;";
      deleteEveryoneButton.addEventListener("click", async () => {
        if (!confirm("Delete this message for both you and the recipient?")) return;
        deleteEveryoneButton.disabled = true;
        try {
          await api("/api/messages/" + item.id + "/delete", {
            method: "DELETE", body: JSON.stringify({ scope: "everyone" })
          });
          await loadConversation();
        } catch (error) {
          statusBox.textContent = error.message;
          deleteEveryoneButton.disabled = false;
        }
      });
      messageActions.appendChild(deleteEveryoneButton);
    }
  }
  element.appendChild(messageActions);
  if (item.sender === currentUsername) {
    const receipt = document.createElement("small");
    receipt.className = "wt-message-receipt";
    const state = item.readAt ? "read" : item.deliveredAt ? "delivered" : "sent";
    receipt.textContent = state === "read" ? "  ✓✓ Read" : state === "delivered" ? "  ✓✓ Delivered" : "  ✓ Sent";
    receipt.title = item.readAt
      ? "Read at " + item.readAt
      : item.deliveredAt
        ? "Delivered at " + item.deliveredAt
        : "Sent";
    receipt.style.cssText = "display:block;margin-top:3px;color:#64748b;font-size:0.78rem;";
    element.appendChild(receipt);
  }
  messagesBox.appendChild(element);
});
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    function showReplyComposer() {
      if (!replyComposer) {
        replyComposer = document.createElement("div");
        replyComposer.id = "reply-composer";
        replyComposer.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;margin:8px 0;border-left:3px solid #0d9488;background:rgba(13,148,136,.09);border-radius:7px;";
        messageForm.parentNode.insertBefore(replyComposer, messageForm);
      }
      replyComposer.replaceChildren();
      const preview = document.createElement("span");
      const excerpt = String(replyingToMessage?.body || "Shared media").slice(0, 120);
      preview.textContent = "Replying to " + (replyingToMessage?.sender || "message") + ": " + excerpt;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", clearReplyComposer);
      replyComposer.append(preview, cancel);
      replyComposer.hidden = false;
    }

    function clearReplyComposer() {
      replyingToMessage = null;
      if (replyComposer) replyComposer.hidden = true;
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
        await api("/api/messages/conversation/" + encodeURIComponent(username) + "/read", {
          method: "POST"
        });
        statusBox.textContent = "Conversation with " + username + " loaded.";
      } catch (error) {
        statusBox.textContent = error.message;
      }
    }

    document.getElementById("load-button").addEventListener("click", loadConversation);
    recipient.addEventListener("change", () => {
      stopTypingIndicator();
      if (typingLine) typingLine.textContent = "";
      clearReplyComposer();
      refreshPresenceUI();
      loadConversation();
    });

    messageInput.addEventListener("input", () => {
      const targetUserId = userIdsByUsername.get(recipient.value);
      if (!recipient.value || !targetUserId || !messageInput.value.trim()) {
        stopTypingIndicator();
        return;
      }

      if (String(typingTargetUserId) !== String(targetUserId)) {
        stopTypingIndicator();
        typingTargetUserId = targetUserId;
        if (callSocket) callSocket.emit("typing:start", { targetUserId });
      }

      if (typingStopTimer) clearTimeout(typingStopTimer);
      typingStopTimer = setTimeout(stopTypingIndicator, 1200);
    });

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
          const blob = new Blob(voiceChunks, { type: type.split(";")[0] });

          recordVoiceButton.textContent = "🎙 Record again";
          recordVoiceButton.classList.remove("is-recording");

          if (!blob.size) {
            recordedVoiceFile = null;
            voicePreview.replaceChildren();
            voicePreview.hidden = true;
            voiceStatus.textContent = "No audio was captured. Check your microphone input and try again.";
            return;
          }

          recordedVoiceFile = new File([blob], "waltajjii-voice-message." + extension, { type: type.split(";")[0] });
          const previewAudio = document.createElement("audio");
          previewAudio.controls = true;
          previewAudio.preload = "metadata";
          previewAudio.addEventListener("loadedmetadata", () => {
            const duration = Number.isFinite(previewAudio.duration) ? previewAudio.duration : 0;
            if (duration > 0) {
              voiceStatus.textContent = "Voice message ready (" + Math.round(duration) + " seconds). Press Send to share it.";
            } else {
              voiceStatus.textContent = "Audio was recorded, but its duration could not be read. Please record again.";
            }
          }, { once: true });
          previewAudio.addEventListener("error", () => {
            voiceStatus.textContent = "The recording could not be played. Please record again and check your microphone.";
          }, { once: true });
          previewAudio.src = URL.createObjectURL(blob);
          previewAudio.load();
          voicePreview.replaceChildren(previewAudio);
          voicePreview.hidden = false;
          voiceStatus.textContent = "Checking recording…";
        });
        voiceRecorder.start(250);
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
          replyToMessageId: replyingToMessage?.id || null,
          mediaPath: uploadResult.fileId,
          mediaType: uploadResult.mediaType
        })
      });

      mediaInput.value = "";
      messageInput.value = "";
      if (isVoiceFile) clearVoiceRecording();
      clearReplyComposer();

      await loadConversation();
      statusBox.textContent = "Message with media sent.";

    } else {
      statusBox.textContent = "Sending message...";

      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverUsername, body, replyToMessageId: replyingToMessage?.id || null })
      });

      messageInput.value = "";
      clearReplyComposer();
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

function registerMessagingSocketHandlers(socket) {
  if (!socket) return;

  socket.on("presence:snapshot", data => {
    onlineUserIds.clear();
    (data?.users || []).forEach(user => onlineUserIds.add(String(user.userId)));
    refreshPresenceUI();
    loadOnlinePeople();
  });

  socket.on("presence:update", data => {
    if (!data || data.userId == null) return;
    if (data.online) onlineUserIds.add(String(data.userId));
    else onlineUserIds.delete(String(data.userId));
    refreshPresenceUI();
    loadOnlinePeople();
  });

  // Refresh the in-app notification list immediately when a reminder is delivered.
  socket.on("notifications:update", () => {
    loadNotifications();
  });

  // Group activity is delivered only to authenticated members of each group room.
  socket.on("groups:updated", data => {
    loadGroups();
    if (data?.removed && String(data.groupId) === String(activeGroupId)) {
      activeGroupId = null;
      groupMessagesBox.textContent = "You are no longer a member of this group.";
      groupMembersBox.replaceChildren();
    }
  });

  socket.on("group:message", data => {
    if (!data || !data.groupId) return;
    if (data.sender !== currentUsername) {
      api(`/api/groups/${data.groupId}/messages/${data.id}/delivered`, { method: "POST" })
        .catch(error => console.warn("Group delivery receipt failed:", error.message));
    }
    if (String(data.groupId) === String(activeGroupId)) openSelectedGroup();
    loadGroups();
  });

  socket.on("group:members:updated", data => {
    if (data && String(data.groupId) === String(activeGroupId)) {
      loadGroupMembers(activeGroupId);
      loadGroups();
    }
  });

  socket.on("group:message:updated", data => {
    if (data && String(data.groupId) === String(activeGroupId)) openSelectedGroup();
  });

  socket.on("group:receipts:updated", data => {
    if (data && String(data.groupId) === String(activeGroupId)) openSelectedGroup();
    loadGroups();
  });

  socket.on("typing:update", data => {
    if (!data || !recipient.value) return;
    const selectedUserId = userIdsByUsername.get(recipient.value);
    if (String(data.userId) !== String(selectedUserId)) return;

    ensurePresenceElements();
    if (typingLine) {
      typingLine.textContent = data.isTyping
        ? data.username + " is typing…"
        : "";
    }
  });

  // Confirm durable delivery as soon as this authenticated client receives the message.
  socket.on("message:new", data => {
    if (!data || !currentUsername) return;

    if (data.recipient === currentUsername && data.id != null) {
      socket.emit("message:delivered", { messageId: data.id });
    }

    if (!recipient || !recipient.value) return;
    const selectedUsername = recipient.value;
    const belongsToOpenConversation =
      (data.sender === selectedUsername && data.recipient === currentUsername) ||
      (data.sender === currentUsername && data.recipient === selectedUsername);

    if (belongsToOpenConversation) {
      loadConversation();
    }
  });

  socket.on("message:deleted", data => {
    if (!data || !recipient?.value) return;
    loadConversation();
  });

  socket.on("message:edited", data => {
    if (!data || !recipient?.value) return;
    const selectedUsername = recipient.value;
    const belongsToOpenConversation =
      (data.sender === currentUsername && data.recipient === selectedUsername) ||
      (data.sender === selectedUsername && data.recipient === currentUsername);
    if (belongsToOpenConversation) loadConversation();
  });

  socket.on("message:reaction:update", data => {
    if (!data || !recipient?.value) return;
    const belongsToOpenConversation =
      (data.sender === currentUsername && data.recipient === recipient.value) ||
      (data.sender === recipient.value && data.recipient === currentUsername);
    if (belongsToOpenConversation) loadConversation();
  });

  socket.on("message:status", data => {
    if (!data || !currentUsername || !recipient?.value) return;
    if (data.sender === currentUsername && data.recipient === recipient.value) {
      loadConversation();
    }
  });
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
const groupMembersBox = document.getElementById("group-members");
const groupRecordVoiceButton = document.getElementById("group-record-voice-button");
const groupVoiceStatus = document.getElementById("group-voice-recording-status");
const groupVoicePreview = document.getElementById("group-voice-recording-preview");
const groupMediaInput = document.getElementById("group-media-input");
let groupRecordedVoiceFile = null;
let groupVoiceRecorder = null;
let groupVoiceStream = null;
let groupVoiceChunks = [];
let groupVoicePreviewUrl = null;
let activeGroupId = null;
let activeGroupCanManage = false;
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
      option.textContent = `${group.name} (${group.memberCount})${group.unreadCount ? " · " + group.unreadCount + " unread" : ""}`;
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

async function loadGroupMembers(groupId) {
  if (!groupId || !groupMembersBox) return;
  try {
    const data = await api(`/api/groups/${groupId}/members`);
    activeGroupCanManage = Boolean(data.canManage);
    const announcementOption = document.querySelector(".group-announcement-option");
    if (announcementOption) announcementOption.hidden = !activeGroupCanManage;
    groupMembersBox.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `Members (${data.members.length})`;
    groupMembersBox.appendChild(heading);
    const list = document.createElement("div");
    list.className = "group-member-list";
    data.members.forEach(member => {
      const item = document.createElement("span");
      item.className = "group-member-chip";
      item.textContent = member.username + (member.role === "admin" ? " · Admin" : "");
      list.appendChild(item);
    });
    groupMembersBox.appendChild(list);
    if (data.memberListRestricted) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "The administrator has limited the member list to group admins.";
      groupMembersBox.appendChild(note);
    }
  } catch (error) {
    groupMembersBox.textContent = error.message;
  }
}

function renderGroupMessages(items) {
  groupMessagesBox.replaceChildren();
  const pinnedItems = items.filter(item => item.pinnedAt && !item.deletedAt);
  if (pinnedItems.length) {
    const pinnedPanel = document.createElement("section");
    pinnedPanel.className = "group-pinned-panel";
    const heading = document.createElement("strong");
    heading.textContent = "📌 Pinned messages";
    pinnedPanel.appendChild(heading);
    pinnedItems.forEach(item => {
      const entry = document.createElement("div");
      entry.className = "group-pinned-entry";
      entry.textContent = item.sender + ": " + item.body + (item.pinnedByUsername ? " · pinned by " + item.pinnedByUsername : "");
      pinnedPanel.appendChild(entry);
    });
    groupMessagesBox.appendChild(pinnedPanel);
  }
  if (!items.length) { groupMessagesBox.appendChild(document.createTextNode("No messages in this group yet.")); return; }
  items.forEach(item => {
    const wrap = document.createElement("div");
    wrap.className = "message" + (item.sender === currentUsername ? " mine" : "");
    const label = document.createElement("strong");
    label.textContent = `${item.isAnnouncement ? "📢 ANNOUNCEMENT · " : ""}${item.sender} · ${item.createdAt}${item.editedAt ? " · Edited" : ""}${item.pinnedAt ? " · 📌 Pinned" : ""}`;
    const body = document.createElement("div");
    body.textContent = item.body;
    wrap.append(label, body);
    if (item.sender === currentUsername) {
      const deliveredNames = (item.receipts || []).filter(receipt => receipt.deliveredAt).map(receipt => receipt.username);
      const readNames = (item.receipts || []).filter(receipt => receipt.readAt).map(receipt => receipt.username);
      const receiptLine = document.createElement("small");
      receiptLine.className = "group-message-receipts";
      receiptLine.textContent = `Delivered ${deliveredNames.length}/${(item.receipts || []).length}${readNames.length ? " · Read: " + readNames.join(", ") : ""}`;
      wrap.appendChild(receiptLine);
    }
    if (item.replyToMessageId) {
      const reply = document.createElement("small");
      reply.textContent = `↪ Reply to ${item.replyToSender || "message"}: ${item.replyToBody || ""}`;
      wrap.appendChild(reply);
    }
    if (item.mediaPath && !item.deletedAt) {
      const media = document.createElement("a");
      media.href = "#";
      media.textContent = item.mediaType === "video" ? "▶ Open video" : item.mediaType === "image" ? "🖼 Open image" : item.mediaType === "audio" ? "🎧 Play voice message" : "📎 Download document";
      media.addEventListener("click", async ev => {
        ev.preventDefault();
        try {
          const response = await fetch("/api/uploads/" + encodeURIComponent(item.mediaPath), {headers:{Authorization:"Bearer "+token}});
          if (!response.ok) throw new Error("Media could not be loaded.");
          const url = URL.createObjectURL(await response.blob());
          if (item.mediaType === "image") {
            const img = document.createElement("img"); img.src=url; img.alt="Group image"; img.style.maxWidth="240px"; img.style.display="block"; wrap.appendChild(img);
          } else if (item.mediaType === "video" || item.mediaType === "audio") {
            const player = document.createElement(item.mediaType === "video" ? "video" : "audio");
            player.controls=true; player.src=url; player.style.maxWidth="100%"; wrap.appendChild(player);
          } else {
            const download=document.createElement("a"); download.href=url; download.download=item.mediaPath; download.textContent="Download file"; wrap.appendChild(download); download.click();
          }
        } catch(error) { groupStatus.textContent=error.message; }
      });
      wrap.appendChild(media);
    }
    if (!item.deletedAt) {
      const actions = document.createElement("div");
      ["👍","❤️","😂","😮","😢","🙏","🎉","🔥"].forEach(emoji => {
        const button=document.createElement("button"); button.type="button"; button.textContent=emoji;
        button.addEventListener("click", async()=>{try{await api(`/api/groups/${activeGroupId}/messages/${item.id}/reactions`,{method:"POST",body:JSON.stringify({emoji})});}catch(e){groupStatus.textContent=e.message;}});
        actions.appendChild(button);
      });
      (item.reactions||[]).forEach(r=>{const count=document.createElement("small");count.textContent=`${r.emoji} ${r.count}`;actions.appendChild(count);});
      if (activeGroupCanManage) {
        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.textContent = item.pinnedAt ? "Unpin" : "Pin";
        pinButton.addEventListener("click", async () => {
          try {
            await api(`/api/groups/${activeGroupId}/messages/${item.id}/pin`, { method: item.pinnedAt ? "DELETE" : "POST" });
          } catch (error) { groupStatus.textContent = error.message; }
        });
        actions.appendChild(pinButton);
      }
      const replyButton=document.createElement("button");replyButton.type="button";replyButton.textContent="Reply";
      replyButton.addEventListener("click",()=>{groupMessageInput.dataset.replyTo=String(item.id);groupMessageInput.placeholder=`Replying to ${item.sender}…`;groupMessageInput.focus();});
      actions.appendChild(replyButton);
      if (item.sender === currentUsername) {
        const edit=document.createElement("button");edit.type="button";edit.textContent="Edit";
        edit.addEventListener("click",async()=>{const body=prompt("Edit your message:",item.body);if(body===null)return;try{await api(`/api/groups/${activeGroupId}/messages/${item.id}`,{method:"PATCH",body:JSON.stringify({body})});}catch(e){groupStatus.textContent=e.message;}});
        actions.appendChild(edit);
      }
      const del=document.createElement("button");del.type="button";del.textContent="Delete";
      del.addEventListener("click",async()=>{if(!confirm("Delete this group message?"))return;try{await api(`/api/groups/${activeGroupId}/messages/${item.id}`,{method:"DELETE"});}catch(e){groupStatus.textContent=e.message;}});
      actions.appendChild(del); wrap.appendChild(actions);
    }
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
    activeGroupId = id;
    const data = await api(`/api/groups/${id}/messages`);
    await loadGroups();
    await loadGroupMembers(id);
    await loadGroupDetails(id, false);
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
    await loadGroupMembers(id);
    const memberList = data.members.map(m => `${m.username} (${m.role})`).join("\n");
    alert("Group members:\n" + memberList);
    const choices = data.canManage
      ? "ADD, REMOVE, PROMOTE, DEMOTE, LEAVE, or CANCEL"
      : "LEAVE or CANCEL";
    const action = (prompt("Choose an action: " + choices) || "").toUpperCase();
    if (!action || action === "CANCEL") return;
    if (action === "LEAVE") {
      if (!confirm("Leave this group? You will lose access unless an admin adds you again.")) return;
      await api(`/api/groups/${id}/leave`, { method: "DELETE" });
      activeGroupId = null;
      groupMessagesBox.textContent = "You left this group.";
      groupMembersBox.replaceChildren();
      await loadGroups();
      groupStatus.textContent = "You left the group.";
      return;
    }
    if (!data.canManage) {
      groupStatus.textContent = "Only group admins can manage members and roles.";
      return;
    }
    if (action === "ADD") {
      const username = prompt("Username to add:");
      if (!username) return;
      await api(`/api/groups/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ username: username.trim() })
      });
      groupStatus.textContent = `${username.trim()} added to the group.`;
    } else if (["REMOVE", "PROMOTE", "DEMOTE"].includes(action)) {
      const promptText = action === "REMOVE" ? "Username to remove:" : "Username whose role should change:";
      const username = prompt(promptText);
      if (!username) return;
      const member = data.members.find(m => m.username.toLowerCase() === username.trim().toLowerCase());
      if (!member) {
        groupStatus.textContent = "That username is not a member of this group.";
        return;
      }
      if (action === "REMOVE") {
        if (member.username === currentUsername) {
          groupStatus.textContent = "Use LEAVE to leave the group.";
          return;
        }
        await api(`/api/groups/${id}/members/${member.id}`, { method: "DELETE" });
        groupStatus.textContent = `${member.username} removed from the group.`;
      } else {
        const role = action === "PROMOTE" ? "admin" : "member";
        await api(`/api/groups/${id}/members/${member.id}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role })
        });
        groupStatus.textContent = action === "PROMOTE"
          ? `${member.username} promoted to admin.`
          : `${member.username} is now a regular member.`;
      }
    } else {
      groupStatus.textContent = "No change made. Choose ADD, REMOVE, PROMOTE, DEMOTE, or LEAVE.";
      return;
    }
    await loadGroups();
    groupSelect.value = String(id);
    await loadGroupMembers(id);
  } catch (error) {
    groupStatus.textContent = error.message;
  }
});

function clearGroupVoiceRecording() {
  groupRecordedVoiceFile = null;
  if (groupVoicePreviewUrl) URL.revokeObjectURL(groupVoicePreviewUrl);
  groupVoicePreviewUrl = null;
  groupVoicePreview.replaceChildren();
  groupVoicePreview.hidden = true;
  groupVoiceStatus.textContent = "";
  groupRecordVoiceButton.textContent = "🎙 Record voice";
  groupRecordVoiceButton.classList.remove("is-recording");
}

groupMediaInput.addEventListener("change", () => {
  if (groupMediaInput.files && groupMediaInput.files.length) clearGroupVoiceRecording();
});

groupRecordVoiceButton.addEventListener("click", async () => {
  if (groupVoiceRecorder && groupVoiceRecorder.state === "recording") {
    groupVoiceRecorder.stop();
    return;
  }
  if (!activeGroupId) {
    groupVoiceStatus.textContent = "Open a group before recording.";
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    groupVoiceStatus.textContent = "Voice recording is not supported in this browser.";
    return;
  }
  try {
    groupMediaInput.value = "";
    clearGroupVoiceRecording();
    groupVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
    groupVoiceRecorder = mimeType ? new MediaRecorder(groupVoiceStream, { mimeType }) : new MediaRecorder(groupVoiceStream);
    groupVoiceChunks = [];
    groupVoiceRecorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size) groupVoiceChunks.push(event.data);
    });
    groupVoiceRecorder.addEventListener("stop", () => {
      if (groupVoiceStream) groupVoiceStream.getTracks().forEach(track => track.stop());
      groupVoiceStream = null;
      const type = groupVoiceRecorder.mimeType || "audio/webm";
      const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(groupVoiceChunks, { type: type.split(";")[0] });
      groupRecordVoiceButton.textContent = "🎙 Record again";
      groupRecordVoiceButton.classList.remove("is-recording");
      if (!blob.size) {
        groupVoiceStatus.textContent = "No audio was captured. Check your microphone and try again.";
        return;
      }
      groupRecordedVoiceFile = new File([blob], "waltajjii-group-voice." + extension, { type: type.split(";")[0] });
      const previewAudio = document.createElement("audio");
      previewAudio.controls = true;
      previewAudio.preload = "metadata";
      previewAudio.addEventListener("loadedmetadata", () => {
        const duration = Number.isFinite(previewAudio.duration) ? previewAudio.duration : 0;
        groupVoiceStatus.textContent = duration > 0
          ? "Voice recording ready (" + Math.round(duration) + " seconds). Press Send to group."
          : "Recording ready. Press Send to group.";
      }, { once: true });
      previewAudio.addEventListener("error", () => {
        groupVoiceStatus.textContent = "The recording preview could not be played. Please record again.";
      }, { once: true });
      groupVoicePreviewUrl = URL.createObjectURL(blob);
      previewAudio.src = groupVoicePreviewUrl;
      previewAudio.load();
      groupVoicePreview.replaceChildren(previewAudio);
      groupVoicePreview.hidden = false;
      groupVoiceStatus.textContent = "Checking recording…";
    });
    groupVoiceRecorder.start(250);
    groupRecordVoiceButton.textContent = "■ Stop recording";
    groupRecordVoiceButton.classList.add("is-recording");
    groupVoiceStatus.textContent = "Recording… speak now.";
  } catch (error) {
    if (groupVoiceStream) groupVoiceStream.getTracks().forEach(track => track.stop());
    groupVoiceStream = null;
    groupVoiceStatus.textContent = error.name === "NotAllowedError"
      ? "Microphone access was denied. Allow microphone access and try again."
      : "Could not start recording. Please check your microphone.";
  }
});

groupMessageForm.addEventListener("submit", async event => {
  event.preventDefault();
  const body = groupMessageInput.value.trim();
  const file = groupRecordedVoiceFile || groupMediaInput.files[0];
  if (!activeGroupId) { groupStatus.textContent = "Open a group before sending."; return; }
  if (!body && !file) { groupStatus.textContent = "Write a message or choose a file."; return; }
  const button = groupMessageForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    let mediaPath="", mediaType="";
    if(file){
      const fd=new FormData();fd.append("media",file);
      const response=await fetch("/api/uploads",{method:"POST",headers:{Authorization:"Bearer "+token},body:fd});
      const uploaded=await response.json();if(!response.ok)throw new Error(uploaded.error||"Upload failed.");
      mediaPath=uploaded.fileId;mediaType=uploaded.mediaType;
      if(file.type.startsWith("audio/"))mediaType="audio";
    }
    await api(`/api/groups/${activeGroupId}/messages`,{
      method:"POST",
      body:JSON.stringify({body,mediaPath,mediaType,replyToMessageId:groupMessageInput.dataset.replyTo||null,isAnnouncement:Boolean(document.getElementById("group-announcement-checkbox")?.checked)})
    });
    groupMessageInput.value="";delete groupMessageInput.dataset.replyTo;groupMessageInput.placeholder="Write a group message...";
    groupMediaInput.value="";
    const announcementCheckbox = document.getElementById("group-announcement-checkbox");
    if (announcementCheckbox) announcementCheckbox.checked = false;
    clearGroupVoiceRecording();
    await openSelectedGroup();groupStatus.textContent="Group message sent.";
  } catch(error){groupStatus.textContent=error.message;}
  finally{button.disabled=false;groupMessageInput.focus();}
});

// Keep the biography character counter in sync with typing.
document.getElementById("profile-bio-input").addEventListener("input", event => {
  document.getElementById("bio-counter").textContent = event.target.value.length;
});

document.getElementById("profile-background").addEventListener("change", event => {
  document.getElementById("profile-hero").dataset.profileBackground = event.target.value;
});

// Save profile.
document.getElementById("save-profile-button").addEventListener("click", async () => {
  const status = document.getElementById("profile-status");
  const payload = {
    fullName: document.getElementById("profile-full-name-input").value,
    profileBackground: document.getElementById("profile-background").value,
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

    document.getElementById("profile-full-name-display").textContent = data.fullName || "Waltajjii member";
    document.getElementById("wt-sidebar-username").textContent = data.fullName || "Your profile";
    document.getElementById("profile-hero").dataset.profileBackground = data.profileBackground || "mist";
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
  card.dataset.profileBackground = user.profileBackground || "mist";
  const head = socialElement("div", "social-card-head");
  const avatar = socialElement("img", "social-avatar");
  avatar.alt = (user.fullName || "Waltajjii member") + " profile picture";
  if (user.avatarPath) {
    avatar.src = "/api/uploads/profile-picture/" + encodeURIComponent(user.id);
    avatar.onerror = () => avatar.removeAttribute("src");
  }
  const identity = socialElement("div");
  identity.appendChild(socialElement("strong", "", user.fullName || "Waltajjii member"));
  const professional = [user.professionalTitle, user.organization].filter(Boolean).join(" · ");
  if (professional) identity.appendChild(socialElement("div", "social-muted", professional));
  head.append(avatar, identity);
  const privateDetails = socialElement("details", "profile-private-details");
  privateDetails.appendChild(socialElement("summary", "", "View profile details"));
  privateDetails.appendChild(socialElement("div", "social-muted", "Username: @" + (user.username || "")));
  if (user.bio) privateDetails.appendChild(socialElement("div", "social-muted", user.bio));
  if (user.department) privateDetails.appendChild(socialElement("div", "social-muted", "Department: " + user.department));
  if (user.location) privateDetails.appendChild(socialElement("div", "social-muted", "Location: " + user.location));
  if (user.website) privateDetails.appendChild(socialElement("div", "social-muted", "Website: " + user.website));
  card.appendChild(head);
  if (privateDetails.childNodes.length > 1) card.appendChild(privateDetails);

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
      card.appendChild(socialElement("strong", "", request.fullName || "Waltajjii member"));
      const requestDetails = socialElement("details", "profile-private-details");
      requestDetails.appendChild(socialElement("summary", "", "View profile details"));
      requestDetails.appendChild(socialElement("div", "social-muted", "Username: @" + (request.username || "")));
      if (request.bio) requestDetails.appendChild(socialElement("div", "social-muted", request.bio));
      card.appendChild(requestDetails);
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
    data.outgoing.forEach(request => host.appendChild(socialElement("p", "social-muted", (request.fullName || "Waltajjii member") + " — awaiting response")));
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
      item.appendChild(socialElement("strong", "", comment.fullName || "Waltajjii member"));
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
      head.appendChild(socialElement("strong", "", post.fullName || "Waltajjii member"));
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
      row.appendChild(socialElement("strong", "", item.actorFullName || "Waltajjii"));
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
      head.appendChild(socialElement("strong", "", moment.fullName || "Waltajjii member"));
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


// Phase 25A: admin invitation-link management (QR presentation follows in the next slice).
const groupInvitationsButton = document.getElementById("group-invitations-button");
const groupInvitationsPanel = document.getElementById("group-invitations-panel");

if (groupInvitationsButton) {
  groupInvitationsButton.addEventListener("click", async () => {
    const id = Number(groupSelect.value);
    if (!id) {
      groupStatus.textContent = "Select a group first.";
      return;
    }
    try {
      const memberData = await api(`/api/groups/${id}/members`);
      if (!memberData.canManage) {
        groupStatus.textContent = "Only group admins can manage invitation links.";
        return;
      }
      groupInvitationsPanel.hidden = false;
      groupInvitationsPanel.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = "Secure group invitations";
      groupInvitationsPanel.appendChild(heading);

      const expiryLabel = document.createElement("label");
      expiryLabel.textContent = "Invitation expiry";
      const expiry = document.createElement("select");
      expiry.setAttribute("aria-label", "Invitation expiry");
      [[1,"1 hour"],[24,"1 day"],[168,"7 days"],[720,"30 days"]].forEach(([value,label]) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = label;
        expiry.appendChild(option);
      });
      expiryLabel.appendChild(expiry);
      groupInvitationsPanel.appendChild(expiryLabel);

      const limitLabel = document.createElement("label");
      limitLabel.textContent = "Maximum uses (optional)";
      const limit = document.createElement("input");
      limit.type = "number";
      limit.min = "1";
      limit.max = "1000";
      limit.placeholder = "Unlimited";
      limitLabel.appendChild(limit);
      groupInvitationsPanel.appendChild(limitLabel);

      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.textContent = "Create invitation link";
      groupInvitationsPanel.appendChild(createButton);
      const linkArea = document.createElement("p");
      linkArea.className = "muted";
      groupInvitationsPanel.appendChild(linkArea);
      createButton.addEventListener("click", async () => {
        createButton.disabled = true;
        try {
          const payload = { expiresInHours: Number(expiry.value) };
          if (limit.value.trim()) payload.useLimit = Number(limit.value);
          const created = await api(`/api/groups/${id}/invitations`, {
            method: "POST", body: JSON.stringify(payload)
          });
          linkArea.replaceChildren();
          const link = document.createElement("a");
          link.href = created.invitation.url;
          link.textContent = created.invitation.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          linkArea.appendChild(link);
          const copy = document.createElement("button");
          copy.type = "button";
          copy.textContent = "Copy link";
          copy.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(created.invitation.url);
              groupStatus.textContent = "Invitation link copied. Save it now; it cannot be displayed again.";
            } catch {
              groupStatus.textContent = "Copy was blocked by this browser. Select and copy the link above.";
            }
          });
          linkArea.appendChild(copy);
          const qrWrap = document.createElement("div");
          qrWrap.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:12px 0;";
          const qrLabel = document.createElement("strong");
          qrLabel.textContent = "Scan to join this group";
          qrWrap.appendChild(qrLabel);
          const qrStatus = document.createElement("small");
          qrStatus.textContent = "Generating secure QR code…";
          qrWrap.appendChild(qrStatus);
          linkArea.appendChild(qrWrap);
          try {
            const qrResult = await api("/api/groups/invitation/qr", {
              method: "POST",
              body: JSON.stringify({ url: created.invitation.url })
            });
            const qrImage = document.createElement("img");
            qrImage.src = qrResult.dataUrl;
            qrImage.alt = "QR code for this secure group invitation";
            qrImage.width = 240;
            qrImage.height = 240;
            qrImage.style.cssText = "width:240px;height:240px;max-width:100%;background:#fff;padding:8px;border-radius:8px;";
            qrWrap.replaceChildren(qrLabel, qrImage);
          } catch (qrError) {
            qrStatus.textContent = "QR code unavailable: " + qrError.message + " Use the invitation link above.";
          }
          const expiryInfo = document.createElement("small");
          expiryInfo.textContent = " Expires: " + new Date(created.invitation.expiresAt).toLocaleString();
          linkArea.appendChild(expiryInfo);
          groupStatus.textContent = "Invitation created. The secure link is shown once; only its hash is stored.";
          await renderInvitationList(id, groupInvitationsPanel);
        } catch (error) {
          groupStatus.textContent = error.message;
        } finally {
          createButton.disabled = false;
        }
      });
      await renderInvitationList(id, groupInvitationsPanel);
    } catch (error) {
      groupStatus.textContent = error.message;
    }
  });
}

async function renderInvitationList(groupId, panel) {
  const data = await api(`/api/groups/${groupId}/invitations`);
  const old = panel.querySelector("[data-invitation-list]");
  if (old) old.remove();
  const list = document.createElement("div");
  list.dataset.invitationList = "true";
  const title = document.createElement("strong");
  title.textContent = "Invitation history";
  list.appendChild(title);
  (data.invitations || []).forEach(invite => {
    const row = document.createElement("p");
    const status = invite.revokedAt ? "Revoked" :
      (Date.parse(invite.expiresAt) <= Date.now() ? "Expired" : "Active");
    row.textContent = `#${invite.id} · ${status} · ${invite.useCount}${invite.useLimit == null ? "" : "/" + invite.useLimit} uses · expires ${new Date(invite.expiresAt).toLocaleString()}`;
    if (status === "Active") {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.textContent = "Revoke";
      revoke.addEventListener("click", async () => {
        if (!confirm("Revoke this invitation? Anyone holding it will no longer be able to join.")) return;
        try {
          await api(`/api/groups/${groupId}/invitations/${invite.id}`, { method: "DELETE" });
          await renderInvitationList(groupId, panel);
          groupStatus.textContent = "Invitation revoked.";
        } catch (error) { groupStatus.textContent = error.message; }
      });
      row.appendChild(revoke);
    }
    list.appendChild(row);
  });
  panel.appendChild(list);
}


// Phase 25B: invitation landing and authenticated join flow.
async function processGroupInvitationLink() {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("groupInvite");
  if (!inviteToken || !token) return;
  const existing = document.getElementById("wt-group-invite-dialog");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "wt-group-invite-dialog";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(8,24,36,.68);display:grid;place-items:center;padding:18px;";
  const card = document.createElement("section");
  card.style.cssText = "width:min(100%,440px);background:var(--wt-surface,#fff);color:var(--wt-text,#172b3a);border-radius:18px;padding:24px;box-shadow:0 18px 60px #0004;";
  const heading = document.createElement("h2");
  heading.textContent = "Group invitation";
  const detail = document.createElement("p");
  detail.textContent = "Checking this secure invitation…";
  detail.setAttribute("role","status");
  const join = document.createElement("button");
  join.type = "button";
  join.textContent = "Join group";
  join.disabled = true;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "Not now";
  cancel.style.marginLeft = "8px";
  cancel.addEventListener("click", () => overlay.remove());
  join.addEventListener("click", async () => {
    join.disabled = true;
    try {
      const result = await api("/api/groups/invitation/" + encodeURIComponent(inviteToken) + "/join", { method: "POST" });
      overlay.remove();
      await loadGroups();
      if (result.groupId && !result.pending) {
        groupSelect.value = String(result.groupId);
        await openSelectedGroup();
      }
      groupStatus.textContent = result.message || "You joined the group successfully.";
      params.delete("groupInvite");
      const cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
    } catch (error) {
      detail.textContent = error.message;
      join.disabled = false;
    }
  });
  card.append(heading, detail, join, cancel);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  try {
    const preview = await api("/api/groups/invitation/" + encodeURIComponent(inviteToken));
    detail.textContent = "You have been invited to join “" + preview.invitation.groupName + "”. This invitation expires " + new Date(preview.invitation.expiresAt).toLocaleString() + ".";
    join.disabled = false;
  } catch (error) {
    detail.textContent = error.message;
    join.hidden = true;
  }
}


// Phase 25B-D: group settings, approval queue, and membership activity UI.
const groupGovernancePanel = document.getElementById("group-governance-panel");
const groupSettingsFields = document.getElementById("group-settings-fields");
const groupRequestsList = document.getElementById("group-join-requests-list");
const groupActivityList = document.getElementById("group-activity-list");
const groupGovernanceStatus = document.getElementById("group-governance-status");

function showGroupGovernanceView(view) {
  if (!groupGovernancePanel) return;
  groupGovernancePanel.hidden = false;
  groupSettingsFields.hidden = view !== "settings";
  groupRequestsList.hidden = view !== "requests";
  groupActivityList.hidden = view !== "activity";
}

async function loadGroupDetails(groupId, showPanel = true) {
  const data = await api("/api/groups/" + groupId + "/details");
  const details = data.details;
  document.getElementById("group-description-input").value = details.description || "";
  document.getElementById("group-rules-input").value = details.rules || "";
  document.getElementById("group-member-list-visibility").value = details.memberListVisibility || "members";
  document.getElementById("group-approval-required").checked = Boolean(details.approvalRequired);
  const canEdit = Boolean(activeGroupCanManage);
  ["group-description-input","group-rules-input","group-member-list-visibility","group-approval-required"].forEach(id => {
    document.getElementById(id).disabled = !canEdit;
  });
  document.getElementById("save-group-settings-button").hidden = !canEdit;
  document.getElementById("group-settings-button").hidden = false;
  document.getElementById("group-requests-button").hidden = !canEdit;
  if (showPanel) showGroupGovernanceView("settings");
}

document.getElementById("group-settings-button").addEventListener("click", async () => {
  if (!activeGroupId) { groupStatus.textContent = "Open a group first."; return; }
  try {
    await loadGroupDetails(activeGroupId, true);
    groupGovernanceStatus.textContent = activeGroupCanManage ? "Only group admins can change these settings." : "Group details are read-only.";
  } catch (error) { groupStatus.textContent = error.message; }
});

document.getElementById("save-group-settings-button").addEventListener("click", async () => {
  if (!activeGroupId || !activeGroupCanManage) return;
  const button = document.getElementById("save-group-settings-button");
  button.disabled = true;
  try {
    const result = await api("/api/groups/" + activeGroupId + "/details", {
      method: "PATCH",
      body: JSON.stringify({
        description: document.getElementById("group-description-input").value,
        rules: document.getElementById("group-rules-input").value,
        memberListVisibility: document.getElementById("group-member-list-visibility").value,
        approvalRequired: document.getElementById("group-approval-required").checked
      })
    });
    groupGovernanceStatus.textContent = result.message || "Group settings saved.";
  } catch (error) { groupGovernanceStatus.textContent = error.message; }
  finally { button.disabled = false; }
});

document.getElementById("group-requests-button").addEventListener("click", async () => {
  if (!activeGroupId || !activeGroupCanManage) return;
  showGroupGovernanceView("requests");
  groupRequestsList.replaceChildren();
  groupGovernanceStatus.textContent = "Loading pending requests…";
  try {
    const data = await api("/api/groups/" + activeGroupId + "/join-requests");
    if (!data.requests.length) {
      groupRequestsList.textContent = "There are no pending join requests.";
    } else {
      data.requests.forEach(request => {
        const row = document.createElement("div");
        row.className = "social-card";
        const name = document.createElement("strong");
        name.textContent = request.username + " · requested " + new Date(request.createdAt).toLocaleString();
        const approve = document.createElement("button");
        approve.type = "button";
        approve.textContent = "Approve";
        const reject = document.createElement("button");
        reject.type = "button";
        reject.textContent = "Reject";
        const review = async decision => {
          approve.disabled = true; reject.disabled = true;
          try {
            const result = await api("/api/groups/" + activeGroupId + "/join-requests/" + request.id + "/review", {
              method: "POST", body: JSON.stringify({ decision })
            });
            groupGovernanceStatus.textContent = result.message;
            await loadGroupMembers(activeGroupId);
            await renderPendingGroupRequests(activeGroupId);
          } catch (error) {
            groupGovernanceStatus.textContent = error.message;
            approve.disabled = false; reject.disabled = false;
          }
        };
        approve.addEventListener("click", () => review("approve"));
        reject.addEventListener("click", () => review("reject"));
        row.append(name, document.createElement("br"), approve, reject);
        groupRequestsList.appendChild(row);
      });
    }
    groupGovernanceStatus.textContent = "Pending requests: " + data.requests.length;
  } catch (error) { groupGovernanceStatus.textContent = error.message; }
});

async function renderPendingGroupRequests(groupId) {
  const data = await api("/api/groups/" + groupId + "/join-requests");
  groupRequestsList.replaceChildren();
  if (!data.requests.length) {
    groupRequestsList.textContent = "There are no pending join requests.";
    return;
  }
  data.requests.forEach(request => {
    const row = document.createElement("div");
    row.className = "social-card";
    const name = document.createElement("strong");
    name.textContent = request.username + " · requested " + new Date(request.createdAt).toLocaleString();
    const approve = document.createElement("button");
    approve.type = "button"; approve.textContent = "Approve";
    const reject = document.createElement("button");
    reject.type = "button"; reject.textContent = "Reject";
    const review = async decision => {
      approve.disabled = true; reject.disabled = true;
      try {
        const result = await api("/api/groups/" + groupId + "/join-requests/" + request.id + "/review", {
          method: "POST", body: JSON.stringify({ decision })
        });
        groupGovernanceStatus.textContent = result.message;
        await loadGroupMembers(groupId);
        await renderPendingGroupRequests(groupId);
      } catch (error) { groupGovernanceStatus.textContent = error.message; approve.disabled = false; reject.disabled = false; }
    };
    approve.addEventListener("click", () => review("approve"));
    reject.addEventListener("click", () => review("reject"));
    row.append(name, document.createElement("br"), approve, reject);
    groupRequestsList.appendChild(row);
  });
}

document.getElementById("group-activity-button").addEventListener("click", async () => {
  if (!activeGroupId) { groupStatus.textContent = "Open a group first."; return; }
  showGroupGovernanceView("activity");
  groupActivityList.textContent = "Loading group activity…";
  try {
    const data = await api("/api/groups/" + activeGroupId + "/activity?limit=30");
    groupActivityList.replaceChildren();
    const labels = {
      group_created: "created the group", member_added: "added a member", member_joined: "joined the group",
      member_left: "left the group", member_removed: "removed a member", role_changed: "changed a member role",
      invitation_created: "created an invitation", invitation_revoked: "revoked an invitation",
      join_requested: "requested to join", join_approved: "approved a join request",
      join_rejected: "rejected a join request", group_settings_updated: "updated group settings"
    };
    if (!data.events.length) groupActivityList.textContent = "No group activity recorded yet.";
    data.events.forEach(event => {
      const row = document.createElement("p");
      const actor = event.actorUsername || "A former member";
      const subject = event.subjectUsername && event.subjectUsername !== event.actorUsername ? " · " + event.subjectUsername : "";
      row.textContent = actor + " " + (labels[event.eventType] || event.eventType.replaceAll("_", " ")) + subject +
        (event.details ? " (" + event.details + ")" : "") + " · " + new Date(event.createdAt).toLocaleString();
      groupActivityList.appendChild(row);
    });
    groupGovernanceStatus.textContent = "Showing the latest " + data.events.length + " events.";
  } catch (error) { groupGovernanceStatus.textContent = error.message; }
});


/* Phase 26: group polls and voting interface. */
const groupPollsStatus = document.getElementById("group-polls-status");
const groupPollsList = document.getElementById("group-polls-list");

function renderGroupPolls(polls) {
  groupPollsList.replaceChildren();
  if (!polls.length) {
    groupPollsList.textContent = "No polls yet. Create the first poll for this group.";
    return;
  }
  polls.forEach(poll => {
    const card = document.createElement("article");
    card.className = "message";
    const title = document.createElement("h4");
    title.textContent = poll.question;
    card.appendChild(title);
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = "By " + poll.creatorUsername + " · " +
      (poll.multipleChoice ? "Select multiple options" : "Select one option") +
      " · " + poll.voterCount + " voter(s) · " + (poll.status === "open" ? "Open" : "Closed");
    card.appendChild(meta);
    const form = document.createElement("form");
    form.dataset.pollId = String(poll.id);
    poll.options.forEach(option => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.margin = "10px 0";
      const input = document.createElement("input");
      input.type = poll.multipleChoice ? "checkbox" : "radio";
      input.name = "group-poll-" + poll.id;
      input.value = String(option.id);
      input.checked = option.selected;
      input.disabled = poll.status !== "open";
      input.style.marginRight = "8px";
      label.appendChild(input);
      const text = document.createElement("span");
      text.textContent = option.text + " — " + option.votes + " vote(s)";
      label.appendChild(text);
      const bar = document.createElement("div");
      bar.style.height = "6px";
      bar.style.background = "#dce7e3";
      bar.style.borderRadius = "6px";
      bar.style.marginTop = "5px";
      const fill = document.createElement("div");
      fill.style.height = "6px";
      fill.style.width = (poll.voterCount ? Math.min(100, option.votes / poll.voterCount * 100) : 0) + "%";
      fill.style.background = "#087f78";
      fill.style.borderRadius = "6px";
      bar.appendChild(fill);
      label.appendChild(bar);
      form.appendChild(label);
    });
    if (poll.status === "open") {
      const voteButton = document.createElement("button");
      voteButton.type = "submit";
      voteButton.textContent = "Submit vote";
      form.appendChild(voteButton);
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const selected = [...form.querySelectorAll('input:checked')].map(input => Number(input.value));
      if (!selected.length) {
        groupPollsStatus.textContent = "Select at least one option before voting.";
        return;
      }
      try {
        await api("/api/groups/" + activeGroupId + "/polls/" + poll.id + "/vote", {
          method: "PUT", body: JSON.stringify({ optionIds: selected })
        });
        groupPollsStatus.textContent = "Your vote has been recorded.";
        await loadGroupPolls();
      } catch (error) { groupPollsStatus.textContent = error.message; }
    });
    card.appendChild(form);
    if (poll.status === "open" && (poll.creatorUsername === currentUsername || activeGroupCanManage)) {
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close poll";
      close.style.marginTop = "8px";
      close.addEventListener("click", async () => {
        if (!confirm("Close this poll? Members will no longer be able to vote.")) return;
        try {
          await api("/api/groups/" + activeGroupId + "/polls/" + poll.id + "/close", { method: "POST" });
          groupPollsStatus.textContent = "Poll closed. Results remain visible.";
          await loadGroupPolls();
        } catch (error) { groupPollsStatus.textContent = error.message; }
      });
      card.appendChild(close);
    }
    groupPollsList.appendChild(card);
  });
}

async function loadGroupPolls() {
  if (!activeGroupId || !groupPollsList) return;
  groupPollsStatus.textContent = "Loading group polls…";
  try {
    const data = await api("/api/groups/" + activeGroupId + "/polls");
    renderGroupPolls(data.polls || []);
    groupPollsStatus.textContent = (data.polls || []).length + " poll(s). Results are visible to group members.";
    if (callSocket && !callSocket.__groupPollsBound) {
      callSocket.on("group:polls:updated", data => {
        if (data && String(data.groupId) === String(activeGroupId)) loadGroupPolls();
      });
      callSocket.__groupPollsBound = true;
    }
  } catch (error) { groupPollsStatus.textContent = error.message; }
}

document.getElementById("load-group-button").addEventListener("click", () => {
  if (activeGroupId) loadGroupPolls();
});

document.getElementById("create-group-poll-button").addEventListener("click", async () => {
  if (!activeGroupId) {
    groupPollsStatus.textContent = "Open a group before creating a poll.";
    return;
  }
  const question = prompt("Enter the poll question (maximum 300 characters):");
  if (question === null) return;
  const optionsText = prompt("Enter 2–10 answer options, separated by commas:");
  if (optionsText === null) return;
  const options = optionsText.split(",").map(value => value.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 10) {
    groupPollsStatus.textContent = "Please provide 2–10 options separated by commas.";
    return;
  }
  const multipleChoice = confirm("Allow members to select multiple answers? Choose Cancel for single-choice voting.");
  try {
    await api("/api/groups/" + activeGroupId + "/polls", {
      method: "POST",
      body: JSON.stringify({ question: question.trim(), options, multipleChoice })
    });
    groupPollsStatus.textContent = "Poll created successfully.";
    await loadGroupPolls();
  } catch (error) { groupPollsStatus.textContent = error.message; }
});


/* Phase 27: group event creation, RSVP and cancellation UI. */
const groupEventsStatus = document.getElementById("group-events-status");
const groupEventsList = document.getElementById("group-events-list");
function renderGroupEvents(events) {
  groupEventsList.replaceChildren();
  if (!events.length) { groupEventsList.textContent = "No events scheduled yet. Create the first group event above."; return; }
  events.forEach(event => {
    const card = document.createElement("article");
    card.className = "social-card";
    const title = document.createElement("h4"); title.textContent = event.title; card.appendChild(title);
    const meta = document.createElement("p"); meta.className = "muted";
    meta.textContent = "Organized by " + event.creatorUsername + " · " + new Date(event.startsAt).toLocaleString() + " · " + (event.status === "cancelled" ? "Cancelled" : "Scheduled");
    card.appendChild(meta);
    if (event.description) { const desc = document.createElement("p"); desc.textContent = event.description; card.appendChild(desc); }
    if (event.location) { const place = document.createElement("p"); place.textContent = "Location: " + event.location; card.appendChild(place); }
    const counts = document.createElement("p"); counts.className = "muted";
    counts.textContent = "Going: " + event.goingCount + " · Maybe: " + event.maybeCount + " · Not going: " + event.notGoingCount;
    card.appendChild(counts);
    const actions = document.createElement("div"); actions.className = "social-actions";
    [["going","Going"],["maybe","Maybe"],["not_going","Not going"]].forEach(([value,label]) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label + (event.myResponse === value ? " ✓" : "");
      button.disabled = event.status !== "scheduled";
      button.addEventListener("click", async () => {
        try { await api("/api/groups/" + activeGroupId + "/events/" + event.id + "/rsvp", { method: "PUT", body: JSON.stringify({ response: value }) }); groupEventsStatus.textContent = "Your RSVP has been saved."; await loadGroupEvents(); }
        catch (error) { groupEventsStatus.textContent = error.message; }
      });
      actions.appendChild(button);
    });
    card.appendChild(actions);
    const attendees = event.attendees || { going: [], maybe: [], notGoing: [] };
    const people = document.createElement("p"); people.className = "muted";
    people.textContent = "Going: " + (attendees.going || []).join(", ") + " · Maybe: " + (attendees.maybe || []).join(", ") + " · Not going: " + (attendees.notGoing || []).join(", ");
    card.appendChild(people);
    if (event.status === "scheduled" && (event.creatorUsername === currentUsername || activeGroupCanManage)) {
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel event"; cancel.style.marginTop = "8px";
      cancel.addEventListener("click", async () => {
        if (!confirm("Cancel this group event? Members will still be able to see its details.")) return;
        try { await api("/api/groups/" + activeGroupId + "/events/" + event.id + "/cancel", { method: "POST" }); groupEventsStatus.textContent = "Event cancelled."; await loadGroupEvents(); }
        catch (error) { groupEventsStatus.textContent = error.message; }
      });
      card.appendChild(cancel);
    }
    groupEventsList.appendChild(card);
  });
}
async function loadGroupEvents() {
  if (!activeGroupId || !groupEventsList) return;
  groupEventsStatus.textContent = "Loading group events…";
  try {
    const data = await api("/api/groups/" + activeGroupId + "/events");
    renderGroupEvents(data.events || []);
    groupEventsStatus.textContent = (data.events || []).length + " event(s). Members can update their RSVP while an event is scheduled.";
    if (callSocket && !callSocket.__groupEventsBound) {
      callSocket.on("group:events:updated", payload => {
        if (payload && String(payload.groupId) === String(activeGroupId)) loadGroupEvents();
      });
      callSocket.__groupEventsBound = true;
    }
  } catch (error) { groupEventsStatus.textContent = error.message; }
}
document.getElementById("load-group-button").addEventListener("click", () => { if (activeGroupId) loadGroupEvents(); });
document.getElementById("group-event-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!activeGroupId) { groupEventsStatus.textContent = "Open a group before creating an event."; return; }
  const button = document.getElementById("create-group-event-button"); button.disabled = true;
  try {
    const localStart = document.getElementById("group-event-start").value;
    if (!localStart) throw new Error("Choose the event date and time.");
    const startsAt = new Date(localStart).toISOString();
    const result = await api("/api/groups/" + activeGroupId + "/events", { method: "POST", body: JSON.stringify({
      title: document.getElementById("group-event-title").value.trim(),
      description: document.getElementById("group-event-description").value.trim(),
      startsAt,
      location: document.getElementById("group-event-location").value.trim(),
      reminderMinutes: Number(document.getElementById("group-event-reminder").value)
    }) });
    groupEventsStatus.textContent = result.message || "Event created.";
    document.getElementById("group-event-form").reset();
    await loadGroupEvents();
  } catch (error) { groupEventsStatus.textContent = error.message || "The event could not be created."; }
  finally { button.disabled = false; }
});


// Phase 32: Waltajjii Language Bridge — translation preview before sending.
(function initWaltajjiiLanguageBridge() {
  const toggle = document.getElementById("wt-language-bridge-toggle");
  const tools = document.getElementById("wt-language-bridge-tools");
  const source = document.getElementById("wt-translation-source");
  const from = document.getElementById("wt-translation-from");
  const to = document.getElementById("wt-translation-to");
  const translateButton = document.getElementById("wt-translate-button");
  const status = document.getElementById("wt-translation-status");
  const resultWrap = document.getElementById("wt-translation-result-wrap");
  const result = document.getElementById("wt-translation-result");
  const useButton = document.getElementById("wt-use-translation");
  const copyButton = document.getElementById("wt-copy-translation");
  if (!toggle || !tools || !source || !translateButton) return;

  toggle.addEventListener("click", () => {
    const opening = tools.hidden;
    tools.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.textContent = opening ? "Close translator" : "Open translator";
    if (opening && !source.value.trim() && messageInput?.value.trim()) source.value = messageInput.value.trim();
  });

  translateButton.addEventListener("click", async () => {
    const textToTranslate = source.value.trim();
    if (!textToTranslate) { status.textContent = "Enter a message to translate."; return; }
    translateButton.disabled = true;
    resultWrap.hidden = true;
    status.textContent = "Translating securely…";
    try {
      const data = await api("/api/translation/translate", {
        method: "POST",
        body: JSON.stringify({ text: textToTranslate, sourceLanguage: from.value, targetLanguage: to.value })
      });
      result.value = data.translation || "";
      if (!result.value) throw new Error("The translation service returned an empty result.");
      resultWrap.hidden = false;
      status.textContent = "Translation ready. Review it before using or sending.";
    } catch (error) {
      status.textContent = error.message || "Translation is temporarily unavailable.";
    } finally {
      translateButton.disabled = false;
    }
  });

  useButton?.addEventListener("click", () => {
    if (!result.value.trim()) return;
    messageInput.value = result.value.trim();
    messageInput.focus();
    status.textContent = "Translation copied into the message composer. Press Send when ready.";
  });

  copyButton?.addEventListener("click", async () => {
    if (!result.value.trim()) return;
    try {
      await navigator.clipboard.writeText(result.value);
      status.textContent = "Translation copied.";
    } catch {
      result.focus(); result.select();
      status.textContent = "Select the translation and copy it.";
    }
  });
})();
