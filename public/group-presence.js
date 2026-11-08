(function initWaltajjiiGroupPresence() {
  if (typeof registerMessagingSocketHandlers !== "function" ||
      typeof loadGroupMembers !== "function" ||
      !groupMembersBox || !groupMessageInput) return;

  const typingByGroup = new Map();
  let typingGroupId = null;
  let typingTimer = null;
  let isSendingGroupTyping = false;
  let memberCache = [];

  function groupTypingMap(groupId) {
    const key = String(groupId);
    if (!typingByGroup.has(key)) typingByGroup.set(key, new Map());
    return typingByGroup.get(key);
  }

  function renderGroupActivity() {
    if (!groupMembersBox) return;
    const list = groupMembersBox.querySelector(".group-member-list");
    if (list) {
      list.replaceChildren();
      memberCache.forEach(member => {
        const chip = document.createElement("span");
        chip.className = "group-member-chip";
        const name = document.createElement("span");
        name.textContent = member.username + (member.role === "admin" ? " · Admin" : "");
        const state = document.createElement("small");
        const online = onlineUserIds.has(String(member.id));
        state.className = "group-member-state" + (online ? " online" : "");
        state.textContent = online ? "Online" : "Offline";
        chip.append(name, state);
        list.appendChild(chip);
      });
    }

    let line = document.getElementById("group-typing-line");
    if (!line) {
      line = document.createElement("small");
      line.id = "group-typing-line";
      line.className = "group-typing-line";
      line.setAttribute("aria-live", "polite");
      groupMembersBox.appendChild(line);
    }
    const active = activeGroupId == null ? [] :
      Array.from(groupTypingMap(activeGroupId).values());
    if (active.length === 1) line.textContent = active[0] + " is typing…";
    else if (active.length === 2) line.textContent = active[0] + " and " + active[1] + " are typing…";
    else if (active.length > 2) line.textContent = "Several members are typing…";
    else line.textContent = "";
  }

  const originalLoadGroupMembers = loadGroupMembers;
  loadGroupMembers = async function(groupId) {
    await originalLoadGroupMembers(groupId);
    if (!groupId) return;
    try {
      const data = await api(`/api/groups/${groupId}/members`);
      memberCache = data.members || [];
      memberCache.forEach(member => userIdsByUsername.set(member.username, String(member.id)));
      renderGroupActivity();
    } catch (error) {
      console.warn("Could not refresh group member presence:", error.message);
    }
  };

  const originalRegisterMessagingSocketHandlers = registerMessagingSocketHandlers;
  registerMessagingSocketHandlers = function(socket) {
    originalRegisterMessagingSocketHandlers(socket);
    if (!socket) return;

    socket.on("group:typing:update", data => {
      if (!data || data.groupId == null || data.userId == null) return;
      const members = groupTypingMap(data.groupId);
      if (data.isTyping) members.set(String(data.userId), data.username || "A member");
      else members.delete(String(data.userId));
      if (String(data.groupId) === String(activeGroupId)) renderGroupActivity();
    });

    socket.on("presence:snapshot", () => renderGroupActivity());
    socket.on("presence:update", () => renderGroupActivity());
  };

  function stopGroupTyping() {
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    if (isSendingGroupTyping && callSocket && typingGroupId != null) {
      callSocket.emit("group:typing:stop", { groupId: typingGroupId });
    }
    isSendingGroupTyping = false;
    typingGroupId = null;
  }

  function startOrRefreshGroupTyping() {
    const groupId = activeGroupId;
    if (!groupId || !callSocket || !groupMessageInput.value.trim()) {
      stopGroupTyping();
      return;
    }
    if (typingGroupId != null && String(typingGroupId) !== String(groupId)) stopGroupTyping();
    typingGroupId = groupId;
    if (!isSendingGroupTyping) {
      isSendingGroupTyping = true;
      callSocket.emit("group:typing:start", { groupId });
    }
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(stopGroupTyping, 2500);
  }

  groupMessageInput.addEventListener("input", startOrRefreshGroupTyping);
  groupMessageInput.addEventListener("blur", stopGroupTyping);
  groupMessageForm.addEventListener("submit", stopGroupTyping);
  groupSelect.addEventListener("change", stopGroupTyping);

  const originalOpenSelectedGroup = openSelectedGroup;
  openSelectedGroup = async function() {
    const nextGroupId = Number(groupSelect.value) || null;
    if (typingGroupId != null && String(typingGroupId) !== String(nextGroupId)) stopGroupTyping();
    await originalOpenSelectedGroup();
    renderGroupActivity();
  };

  const originalShowChat = showChat;
  showChat = function(username) {
    memberCache = [];
    typingByGroup.clear();
    originalShowChat(username);
  };
})();