const drawForm = document.querySelector("#drawForm");
const nameInput = document.querySelector("#nameInput");
const statusElement = document.querySelector("#status");
const myResultElement = document.querySelector("#myResult");
const drawnListElement = document.querySelector("#drawnList");
const db = firebase.initializeApp(firebaseConfig).firestore();

const slots = [1, 2, 3, 4];
const fakeGroups = ["Group A", "Group B"];

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function setLoading(isLoading) {
  drawForm.querySelector("button").disabled = isLoading;
  nameInput.disabled = isLoading;
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function pickAvailableSlot(usedSlots) {
  const availableSlots = slots.filter((slot) => !usedSlots.includes(slot));

  if (availableSlots.length === 0) {
    throw new Error("No available slots");
  }

  return availableSlots[Math.floor(Math.random() * availableSlots.length)];
}

function startRandomAnimation() {
  myResultElement.innerHTML = `
    <article class="random-card">
      <p class="result-label">Randomizing...</p>
      <div class="random-display">
        <span id="fakeGroup">Group A</span>
        <span id="fakeSlot">Position 1</span>
      </div>
    </article>
  `;

  const fakeGroup = document.querySelector("#fakeGroup");
  const fakeSlot = document.querySelector("#fakeSlot");

  const timer = window.setInterval(() => {
    fakeGroup.textContent = fakeGroups[Math.floor(Math.random() * fakeGroups.length)];
    fakeSlot.textContent = `Position ${slots[Math.floor(Math.random() * slots.length)]}`;
  }, 90);

  return () => {
    window.clearInterval(timer);
  };
}

function renderMyResult(player) {
  myResultElement.innerHTML = "";

  const card = document.createElement("article");
  card.className = "result-card";

  const title = document.createElement("p");
  title.className = "result-label";
  title.textContent = "Your Result";

  const result = document.createElement("h2");
  result.textContent = `${player.group} - Position ${player.slot}`;

  const name = document.createElement("p");
  name.className = "result-name";
  name.textContent = player.registeredName;

  card.append(title, result, name);
  myResultElement.append(card);
}

function renderNameError() {
  myResultElement.innerHTML = "";

  const error = document.createElement("p");
  error.className = "error";
  error.textContent = "This name is not on the registered player list. Please check the spelling and try again.";

  myResultElement.append(error);
}

function renderDrawnPlayers(players) {
  drawnListElement.innerHTML = "";

  if (players.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "暂无";
    drawnListElement.append(empty);
    return;
  }

  for (const player of players) {
    const item = document.createElement("div");
    item.className = "drawn-player";

    const name = document.createElement("span");
    name.className = "drawn-name";
    name.textContent = player.registeredName;

    const result = document.createElement("span");
    result.className = "drawn-result";
    result.textContent = `${player.group} - Position ${player.slot}`;

    item.append(name, result);
    drawnListElement.append(item);
  }
}

async function loadDrawnPlayers() {
  const snapshot = await db.collection("drawnPlayers").get();

  const players = snapshot.docs
    .map((doc) => doc.data())
    .sort((first, second) => {
      const firstTime = first.drawnAt?.toMillis?.() || 0;
      const secondTime = second.drawnAt?.toMillis?.() || 0;
      return firstTime - secondTime;
    });

  renderDrawnPlayers(players);
}

async function getPlayer(registeredName) {
  const playerId = normalizeName(registeredName);
  const playerDoc = await db.collection("players").doc(playerId).get();

  if (!playerDoc.exists) {
    return null;
  }

  return {
    id: playerId,
    ...playerDoc.data()
  };
}

async function drawPlayer(registeredName) {
  const playerId = normalizeName(registeredName);
  const playerRef = db.collection("players").doc(playerId);

  return db.runTransaction(async (transaction) => {
    const playerDoc = await transaction.get(playerRef);

    if (!playerDoc.exists) {
      return { status: "not-found" };
    }

    const player = playerDoc.data();

    if (player.drawn) {
      return {
        status: "already-drawn",
        player
      };
    }

    const groupRef = db.collection("groups").doc(player.group);
    const groupDoc = await transaction.get(groupRef);
    const group = groupDoc.exists ? groupDoc.data() : { usedSlots: [] };
    const slot = pickAvailableSlot(group.usedSlots || []);
    const drawnAt = firebase.firestore.FieldValue.serverTimestamp();

    transaction.update(playerRef, {
      drawn: true,
      slot,
      drawnAt
    });

    transaction.set(
      groupRef,
      {
        usedSlots: firebase.firestore.FieldValue.arrayUnion(slot)
      },
      { merge: true }
    );

    transaction.set(db.collection("drawnPlayers").doc(playerId), {
      registeredName: player.registeredName,
      group: player.group,
      slot,
      drawnAt
    });

    return {
      status: "drawn",
      player: {
        ...player,
        drawn: true,
        slot
      }
    };
  });
}

async function startDraw(event) {
  event.preventDefault();

  const registeredName = nameInput.value.trim();

  if (!registeredName) {
    return;
  }

  setLoading(true);
  statusElement.textContent = "";
  myResultElement.innerHTML = "";

  try {
    const existingPlayer = await getPlayer(registeredName);

    if (!existingPlayer) {
      renderNameError();
      return;
    }

    if (existingPlayer.drawn) {
      statusElement.textContent = "You have already drawn. Showing your result.";
      renderMyResult(existingPlayer);
      return;
    }

    const stopAnimation = startRandomAnimation();

    const [result] = await Promise.all([
      drawPlayer(registeredName),
      sleep(2000)
    ]);

    stopAnimation();

    if (result.status === "not-found") {
      renderNameError();
      return;
    }

    statusElement.textContent =
      result.status === "already-drawn"
        ? "You have already drawn. Showing your result."
        : "Draw complete";

    renderMyResult(result.player);
    await loadDrawnPlayers();
  } catch (error) {
    myResultElement.innerHTML = "";

    const message = document.createElement("p");
    message.className = "error";
    message.textContent = "Something went wrong. Please refresh and try again.";

    myResultElement.append(message);
  } finally {
    setLoading(false);
  }
}

drawForm.addEventListener("submit", startDraw);
loadDrawnPlayers();