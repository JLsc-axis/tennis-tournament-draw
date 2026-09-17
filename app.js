const drawForm =
  document.querySelector("#drawForm");

const nameInput =
  document.querySelector("#nameInput");

const statusElement =
  document.querySelector("#status");

const myResultElement =
  document.querySelector("#myResult");

const mensDoubleDrawnListElement =
  document.querySelector(
    "#mensDoubleDrawnList"
  );

const mensDrawnListElement =
  document.querySelector(
    "#mensDrawnList"
  );

const mixedDrawnListElement =
  document.querySelector(
    "#mixedDrawnList"
  );


const db =
  firebase
    .initializeApp(firebaseConfig)
    .firestore();


const groups = [
  "Group A",
  "Group B"
];

const slots = [
  1,
  2,
  3,
  4
];



function sleep(milliseconds) {
  return new Promise(
    (resolve) =>
      window.setTimeout(
        resolve,
        milliseconds
      )
  );
}



function setLoading(isLoading) {
  drawForm
    .querySelector("button")
    .disabled =
      isLoading;

  nameInput.disabled =
    isLoading;
}



function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}



function randomItem(items) {
  return items[
    Math.floor(
      Math.random() *
      items.length
    )
  ];
}



function startRandomAnimation() {

  myResultElement.innerHTML = `
    <article class="result-card random-card">
      <p class="result-label">
        Randomizing...
      </p>

      <h2 id="randomGroup">
        Group A
      </h2>

      <p
        id="randomPosition"
        class="random-position"
      >
        Position 1
      </p>
    </article>
  `;


  const groupElement =
    document.querySelector(
      "#randomGroup"
    );

  const positionElement =
    document.querySelector(
      "#randomPosition"
    );


  const intervalId =
    window.setInterval(() => {

      groupElement.textContent =
        randomItem(groups);

      positionElement.textContent =
        `Position ${randomItem(slots)}`;

    }, 90);


  return () =>
    window.clearInterval(
      intervalId
    );
}



function renderMyResult(player) {

  myResultElement.innerHTML = `
    <article class="result-card">

      <p class="result-label">
        Your Men's Doubles Result
      </p>

      <h2>
        ${player.group}
        -
        Position ${player.slot}
      </h2>

      <p class="result-name"></p>

    </article>
  `;


  myResultElement
    .querySelector(
      ".result-name"
    )
    .textContent =
      player.registeredName;
}



function renderError(message) {

  myResultElement.innerHTML = "";

  const error =
    document.createElement("p");

  error.className =
    "error";

  error.textContent =
    message;

  myResultElement.append(
    error
  );
}



function renderPlayerList(
  container,
  players,
  emptyMessage
) {

  container.innerHTML = "";


  if (
    players.length === 0
  ) {

    const empty =
      document.createElement("p");

    empty.className =
      "empty";

    empty.textContent =
      emptyMessage;

    container.append(
      empty
    );

    return;
  }


  for (
    const player of players
  ) {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "drawn-player";


    const name =
      document.createElement(
        "span"
      );

    name.textContent =
      player.registeredName;


    const result =
      document.createElement(
        "strong"
      );

    result.textContent =
      `${player.group} · Position ${player.slot}`;


    item.append(
      name,
      result
    );

    container.append(
      item
    );

  }
}



function sortByDrawTime(
  players
) {

  return players.sort(
    (
      first,
      second
    ) => {

      const firstTime =
        first
          .drawnAt
          ?.toMillis?.() || 0;

      const secondTime =
        second
          .drawnAt
          ?.toMillis?.() || 0;

      return (
        firstTime -
        secondTime
      );

    }
  );
}



/*
  Load result history.

  mensDoubleDrawnPlayers
  = Men's Doubles

  mensDrawnPlayers
  = Men's Singles

  drawnPlayers
  = Mixed Doubles
*/
async function loadResults() {

  const [
    mensDoubleSnapshot,
    mensSnapshot,
    mixedSnapshot
  ] =
    await Promise.all([

      db
        .collection(
          "mensDoubleDrawnPlayers"
        )
        .get(),

      db
        .collection(
          "mensDrawnPlayers"
        )
        .get(),

      db
        .collection(
          "drawnPlayers"
        )
        .get()

    ]);


  renderPlayerList(

    mensDoubleDrawnListElement,

    sortByDrawTime(
      mensDoubleSnapshot
        .docs
        .map(
          (doc) =>
            doc.data()
        )
    ),

    "No men's doubles teams have drawn yet."

  );


  renderPlayerList(

    mensDrawnListElement,

    sortByDrawTime(
      mensSnapshot
        .docs
        .map(
          (doc) =>
            doc.data()
        )
    ),

    "No men's singles players have drawn yet."

  );


  renderPlayerList(

    mixedDrawnListElement,

    sortByDrawTime(
      mixedSnapshot
        .docs
        .map(
          (doc) =>
            doc.data()
        )
    ),

    "No mixed doubles results yet."

  );
}



/*
  Read current Men's Doubles team.
*/
async function getPlayer(
  playerId
) {

  const document =
    await db
      .collection("players")
      .doc(playerId)
      .get();


  return document.exists
    ? document.data()
    : null;
}



/*
  Find the other team that shares
  the same separation rule.
*/
async function getOtherSeparatedPlayer(
  currentPlayerId,
  separationKey
) {

  if (!separationKey) {
    return null;
  }


  const snapshot =
    await db
      .collection("players")
      .where(
        "separationKey",
        "==",
        separationKey
      )
      .get();


  for (
    const document
    of snapshot.docs
  ) {

    if (
      document.id !==
      currentPlayerId
    ) {

      return {
        id:
          document.id,

        ...document.data()
      };

    }

  }


  return null;
}



/*
  Draw current Men's Doubles team.
*/
async function drawPlayer(
  playerId
) {

  const playerRef =
    db
      .collection("players")
      .doc(playerId);


  const groupRefs =
    groups.map(
      (group) =>
        db
          .collection("groups")
          .doc(group)
    );


  /*
    Read player before transaction
    so we can check separation rule.
  */

  const playerOutsideTransaction =
    await getPlayer(playerId);


  if (
    !playerOutsideTransaction
  ) {

    return {
      status:
        "not-found"
    };

  }


  let blockedGroup =
    null;


  /*
    If this team is one of
    the two protected teams,
    check where the other one went.
  */

  if (
    playerOutsideTransaction
      .separationKey
  ) {

    const otherSeparatedPlayer =
      await getOtherSeparatedPlayer(
        playerId,
        playerOutsideTransaction
          .separationKey
      );


    if (
      otherSeparatedPlayer &&
      otherSeparatedPlayer.drawn &&
      otherSeparatedPlayer.group
    ) {

      blockedGroup =
        otherSeparatedPlayer.group;

    }

  }



  return db.runTransaction(
    async (
      transaction
    ) => {


      const playerDoc =
        await transaction.get(
          playerRef
        );


      if (
        !playerDoc.exists
      ) {

        return {
          status:
            "not-found"
        };

      }


      const player =
        playerDoc.data();


      if (
        player.drawn
      ) {

        return {
          status:
            "already-drawn",
          player
        };

      }



      const groupDocs = [];


      for (
        const groupRef
        of groupRefs
      ) {

        groupDocs.push(
          await transaction.get(
            groupRef
          )
        );

      }



      if (
        groupDocs.some(
          (document) =>
            !document.exists
        )
      ) {

        throw new Error(
          "groups-not-ready"
        );

      }



      const availableSpots =
        [];


      groupDocs.forEach(
        (
          document,
          groupIndex
        ) => {


          const group =
            groups[groupIndex];


          /*
            If this group is blocked
            by the separation rule,
            skip the whole group.
          */

          if (
            blockedGroup &&
            group === blockedGroup
          ) {

            return;

          }


          const usedSlots =
            document
              .data()
              .usedSlots || [];


          slots
            .filter(
              (slot) =>
                !usedSlots.includes(
                  slot
                )
            )
            .forEach(
              (slot) => {

                availableSpots.push({
                  group,
                  groupRef:
                    groupRefs[
                      groupIndex
                    ],
                  slot
                });

              }
            );

        }
      );



      if (
        availableSpots.length === 0
      ) {

        throw new Error(
          "no-available-spots"
        );

      }



      /*
        Actual random selection.
      */

      const selected =
        randomItem(
          availableSpots
        );


      const drawnAt =
        firebase.firestore
          .FieldValue
          .serverTimestamp();


      /*
        Update active player.
      */

      transaction.update(
        playerRef,
        {
          drawn: true,
          group:
            selected.group,
          slot:
            selected.slot,
          drawnAt
        }
      );


      /*
        Mark selected slot
        as occupied.
      */

      transaction.update(
        selected.groupRef,
        {
          usedSlots:
            firebase.firestore
              .FieldValue
              .arrayUnion(
                selected.slot
              )
        }
      );


      /*
        Save Men's Doubles result
        into its own collection.
      */

      const resultRef =
        db
          .collection(
            "mensDoubleDrawnPlayers"
          )
          .doc(playerId);


      transaction.set(
        resultRef,
        {
          registeredName:
            player.registeredName,

          group:
            selected.group,

          slot:
            selected.slot,

          drawnAt
        }
      );


      return {

        status:
          "drawn",

        player: {
          ...player,
          drawn: true,
          group:
            selected.group,
          slot:
            selected.slot
        }

      };

    }
  );
}



async function startDraw(
  event
) {

  event.preventDefault();


  const registeredName =
    nameInput
      .value
      .trim();


  if (
    !registeredName
  ) {
    return;
  }


  setLoading(true);

  statusElement.textContent =
    "";

  myResultElement.innerHTML =
    "";


  try {

    const playerId =
      normalizeName(
        registeredName
      );


    const existingPlayer =
      await getPlayer(
        playerId
      );


    if (
      !existingPlayer
    ) {

      renderError(
        "This name is not on the men's doubles list. Please check the spelling."
      );

      return;
    }


    if (
      existingPlayer.drawn
    ) {

      statusElement.textContent =
        "You have already drawn. Showing your result.";

      renderMyResult(
        existingPlayer
      );

      return;
    }


    statusElement.textContent =
      "Randomizing...";


    const stopAnimation =
      startRandomAnimation();


    let result;


    try {

      [result] =
        await Promise.all([

          drawPlayer(
            playerId
          ),

          sleep(2000)

        ]);

    }

    finally {

      stopAnimation();

    }



    if (
      result.status ===
      "not-found"
    ) {

      statusElement.textContent =
        "";

      renderError(
        "This name is not on the men's doubles list."
      );

      return;
    }



    statusElement.textContent =
      result.status ===
        "already-drawn"

        ? "You have already drawn. Showing your result."

        : "Draw complete";


    renderMyResult(
      result.player
    );


    await loadResults();

  }

  catch (error) {

    console.error(error);

    statusElement.textContent =
      "";


    if (
      error.message ===
      "no-available-spots"
    ) {

      renderError(
        "All men's doubles positions have already been drawn."
      );

    }

    else if (
      error.message ===
      "groups-not-ready"
    ) {

      renderError(
        "The men's doubles draw has not been set up yet."
      );

    }

    else {

      renderError(
        "Something went wrong. Please refresh and try again."
      );

    }

  }

  finally {

    setLoading(false);

  }

}



drawForm.addEventListener(
  "submit",
  startDraw
);



loadResults().catch(
  (error) => {

    console.error(error);


    renderPlayerList(
      mensDoubleDrawnListElement,
      [],
      "Unable to load men's doubles results."
    );


    renderPlayerList(
      mensDrawnListElement,
      [],
      "Unable to load men's singles results."
    );


    renderPlayerList(
      mixedDrawnListElement,
      [],
      "Unable to load mixed doubles results."
    );

  }
);