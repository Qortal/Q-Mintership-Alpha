const isEncryptedTestMode = false
const encryptedCardIdentifierPrefix = "card-MAC"
const adminBoardPublishEditorKey = "admin-card-content"
let isUpdateCard = false
let existingDecryptedCardData = {}
let existingEncryptedCardIdentifier = {}
let cardMinterName = {}
let existingCardMinterNames = []
let isTopic = false
let attemptLoadAdminDataCount = 0
let adminMemberCount = 0
let adminPublicKeys = []
let adminBoardPublishInProgress = false
// Kakashi Note: Batch size keeps encrypted-board rendering progressive without flooding decrypt and poll calls.
const ADMIN_SCROLL_BATCH_SIZE = 10
const adminBoardInfiniteState = {
  loadToken: 0,
  cards: [],
  cursor: 0,
  inFlight: false,
  complete: false,
  displayedCount: 0,
  totalCount: 0,
  isBackgroundLoading: false,
  container: null,
  progressEl: null,
  sharedBoardData: null,
  scrollHandler: null,
  backgroundRunnerToken: 0,
}
const adminBoardSearchCache = {
  resourcesByKey: new Map(),
  maxDaysCovered: 0,
  hasAllRange: false,
}
const adminBoardDecryptedCardCache = new Map()
const adminBoardDecryptedCardByIdentifier = new Map()
const optimisticEncryptedCommentCache = new Map()
// let kickTransactions = []
// let banTransactions = []
let adminBoardState = {
  kickedCards: new Set(), // store identifiers
  bannedCards: new Set(), // likewise
  hiddenList: new Set(), // user-hidden
  // ... we can add other things to state if needed...
}

const loadAdminBoardState = () => {
  // Load from localStorage if available
  const rawState = localStorage.getItem("adminBoardState")
  if (rawState) {
    try {
      const parsed = JSON.parse(rawState)
      // Make sure bannedCards and kickedCards are sets
      return {
        bannedCards: new Set(parsed.bannedCards ?? []),
        kickedCards: new Set(parsed.kickedCards ?? []),
        hiddenList: new Set(parsed.hiddenList ?? []),
        // ... any other fields
      }
    } catch (e) {
      console.warn("Failed to parse adminBoardState from storage:", e)
    }
  }
  // If nothing found or parse error, return a default
  return {
    bannedCards: new Set(),
    kickedCards: new Set(),
    hiddenList: new Set(),
  }
}

// Saving the state back into localStorage as needed:
const saveAdminBoardState = () => {
  const stateToSave = {
    bannedCards: Array.from(adminBoardState.bannedCards),
    kickedCards: Array.from(adminBoardState.kickedCards),
    hiddenList: Array.from(adminBoardState.hiddenList),
  }
  localStorage.setItem("adminBoardState", JSON.stringify(stateToSave))
}

console.log("Attempting to load AdminBoard.js")

const loadAdminBoardPage = async () => {
  // Kakashi Note: Remove other board scroll listeners before loading this board to avoid stale lazy-load callbacks.
  if (typeof detachMinterBoardInfiniteScroll === "function") {
    detachMinterBoardInfiniteScroll()
  }
  if (typeof detachAdminBoardInfiniteScroll === "function") {
    detachAdminBoardInfiniteScroll()
  }

  // Clear existing content on the page
  const bodyChildren = document.body.children

  for (let i = bodyChildren.length - 1; i >= 0; i--) {
    const child = bodyChildren[i]
    if (!child.classList.contains("menu")) {
      child.remove()
    }
  }

  // Add the "Minter Board" content
  const mainContent = document.createElement("div")
  mainContent.innerHTML = `
    <div class="minter-board-main" style="text-align: center;">
    <h1 style="color: lightblue;">AdminBoard</h1>
    <p style="font-size: 0.95rem; color:rgba(255, 255, 255, 0.53)"> The Admin Board was meant to be utilized for DECISIONS regarding Minters or would-be Minters, and is encrypted to the Admins so that the data for the DECISIONS remains private. However, it later became the location to REMOVE minters as well. This, not being the original intended purpose has become problematic, as the removal data SHOULD be public. In the future, this data WILL be made public. The Admin Board will continue to be utilized for decision-making, but will NOT be a place for hidden removal data only. </p>
    <button id="publish-card-button" class="publish-card-button" style="margin: 20px; padding: 10px;">Publish Encrypted Card</button>
    <button id="refresh-cards-button" class="refresh-cards-button" style="padding: 10px;">Refresh Cards</button>
    <select id="sort-select" style="margin-left: 10px; padding: 5px; font-size: 1.25rem; color:rgb(70, 106, 105); background-color: black;">
      <option value="newest" selected>Sort by Date</option>
      <option value="name">Sort by Name</option>
      <option value="recent-comments">Newest Comments</option>
      <option value="least-votes">Least Votes</option>
      <option value="most-votes">Most Votes</option>
    </select>
    <select id="time-range-select" style="margin-left: 10px; padding: 5px; font-size: 1.25rem; color: white; background-color: black;">
      <option value="0">All Creation Dates</option>
      <option value="1">Last 1 Day</option>
      <option value="7">Last 7 Days</option>
      <option value="30">...Within 30 Days</option>
      <option value="45" selected>...Within 45 Days</option>
      <option value="60">...Within 60 Days</option>
      <option value="90">...Within 90 Days</option>
    </select>
    <div class="show-card-checkbox" style="margin-top: 1em;">
      <input type="checkbox" id="admin-show-hidden-checkbox" name="adminHidden" />
      <label for="admin-show-hidden-checkbox">Show User-Hidden Cards?</label>
      <input type="checkbox" id="admin-show-kicked-banned-checkbox" name="kickedBanned" />
      <label for="admin-show-kicked-banned-checkbox">Show Kicked / Banned Cards?</label>
    </div>
    <div id="admin-board-progress" style="margin-top: 0.75em; min-height: 1.5em;"></div>
    <div id="encrypted-cards-container" class="cards-container" style="margin-top: 20px;"></div>
    <div id="publish-card-view" class="publish-card-view" style="display: none; text-align: left;">
        <form id="publish-card-form" class="publish-card-form">
        <h3>Create or Update an Admin Card</h3>
        <div class="publish-card-checkbox" style="margin-top: 1em;">
          <input type="checkbox" id="topic-checkbox" name="topicMode" />
          <label for="topic-checkbox">Is this a Topic instead of a Minter?</label>
        </div>
        <label for="minter-name-input">Input TOPIC or NAME:</label>
        <input type="text" id="minter-name-input" maxlength="100" placeholder="input NAME or TOPIC" required>
        <label for="card-header">Header:</label>
        <input type="text" id="card-header" maxlength="100" placeholder="Explain main point/issue" required>
        <label>Content:</label>
        ${
          typeof getBoardRichTextComposerHtml === "function"
            ? getBoardRichTextComposerHtml(
                adminBoardPublishEditorKey,
                "richtext-compose publish-compose"
              )
            : `<textarea id="card-content" placeholder="Enter any information you like... CHECK THE TOPIC CHECKBOX if you do not want to publish a NAME card. NAME cards are verified and can only be one per name. Links are displayed in in-app pop-up." required></textarea>`
        }
        <label for="card-links">Links (qortal://...):</label>
        <div id="links-container">
            <input type="text" class="card-link" placeholder="Enter QDN link">
        </div>
        <button type="button" id="add-link-button">Add Another Link</button>
        <button type="submit" id="submit-publish-button">Publish Card</button>
        <button type="button" id="cancel-publish-button">Cancel</button>
        </form>
    </div>
    </div>
  `

  document.body.appendChild(mainContent)
  if (typeof clearBoardCommentEditState === "function") {
    clearBoardCommentEditState()
  }
  if (typeof boardCommentContentCache !== "undefined") {
    boardCommentContentCache.clear()
  }
  if (typeof boardCommentDataCache !== "undefined") {
    boardCommentDataCache.clear()
  }
  const publishCardButton = document.getElementById("publish-card-button")

  if (publishCardButton) {
    publishCardButton.addEventListener("click", async () => {
      isUpdateCard = false
      existingDecryptedCardData = {}
      existingEncryptedCardIdentifier = {}
      const publishForm = document.getElementById("publish-card-form")
      if (publishForm) {
        publishForm.reset()
      }
      const linksContainer = document.getElementById("links-container")
      if (linksContainer) {
        linksContainer.innerHTML = `<input type="text" class="card-link" placeholder="Enter QDN link">`
      }
      const publishCardView = document.getElementById("publish-card-view")
      publishCardView.style.display = "flex"
      document.getElementById("encrypted-cards-container").style.display =
        "none"
      if (typeof ensureBoardRichTextEditor === "function") {
        ensureBoardRichTextEditor(
          adminBoardPublishEditorKey,
          "Enter any information you like."
        )
        clearBoardRichTextEditor(adminBoardPublishEditorKey)
      }
      const submitButton = document.getElementById("submit-publish-button")
      if (submitButton) {
        submitButton.textContent = "Publish Card"
      }
    })
  }
  const refreshCardsButton = document.getElementById("refresh-cards-button")

  if (refreshCardsButton) {
    refreshCardsButton.addEventListener("click", async () => {
      const encryptedCardsContainer = document.getElementById(
        "encrypted-cards-container"
      )
      encryptedCardsContainer.innerHTML = getBoardLoadingHTML(
        "Refreshing cards..."
      )
      await fetchAllEncryptedCards(true)
    })
  }
  const cancelPublishButton = document.getElementById("cancel-publish-button")

  if (cancelPublishButton) {
    cancelPublishButton.addEventListener("click", async () => {
      const publishForm = document.getElementById("publish-card-form")
      if (publishForm) {
        publishForm.reset()
      }
      if (typeof clearBoardRichTextEditor === "function") {
        clearBoardRichTextEditor(adminBoardPublishEditorKey)
      }
      const encryptedCardsContainer = document.getElementById(
        "encrypted-cards-container"
      )
      encryptedCardsContainer.style.display = "flex" // Restore visibility
      const publishCardView = document.getElementById("publish-card-view")
      publishCardView.style.display = "none" // Hide the publish form
      isUpdateCard = false
      existingDecryptedCardData = {}
      existingEncryptedCardIdentifier = {}
      const submitButton = document.getElementById("submit-publish-button")
      if (submitButton) {
        submitButton.textContent = "Publish Card"
      }
    })
  }
  const addLinkButton = document.getElementById("add-link-button")

  if (addLinkButton) {
    addLinkButton.addEventListener("click", async () => {
      const linksContainer = document.getElementById("links-container")
      const newLinkInput = document.createElement("input")
      newLinkInput.type = "text"
      newLinkInput.className = "card-link"
      newLinkInput.placeholder = "Enter QDN link"
      linksContainer.appendChild(newLinkInput)
    })
  }

  const showKickedBannedCheckbox = document.getElementById(
    "admin-show-kicked-banned-checkbox"
  )

  if (showKickedBannedCheckbox) {
    showKickedBannedCheckbox.addEventListener("change", async (event) => {
      await fetchAllEncryptedCards()
    })
  }

  const showHiddenCardsCheckbox = document.getElementById(
    "admin-show-hidden-checkbox"
  )
  if (showHiddenCardsCheckbox) {
    showHiddenCardsCheckbox.addEventListener("change", async (event) => {
      await fetchAllEncryptedCards()
    })
  }

  document
    .getElementById("publish-card-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault()
      const isTopicChecked = document.getElementById("topic-checkbox").checked
      // Pass that boolean to publishEncryptedCard
      await publishEncryptedCard(isTopicChecked)
    })

  document
    .getElementById("sort-select")
    .addEventListener("change", async () => {
      // Re-load the cards whenever user chooses a new sort option.
      await fetchAllEncryptedCards()
    })

  document
    .getElementById("time-range-select")
    .addEventListener("change", async () => {
      await fetchAllEncryptedCards()
    })

  createScrollToTopButton()
  // await fetchAndValidateAllAdminCards()
  await updateOrSaveAdminGroupsDataLocally()
  await fetchAllEncryptedCards()
}

// Example: fetch and save admin public keys and count
const updateOrSaveAdminGroupsDataLocally = async () => {
  try {
    // Fetch the array of admin public keys
    const verifiedAdminPublicKeys = await fetchAdminGroupsMembersPublicKeys()

    // Build an object containing the count and the array
    const adminData = {
      keysCount: verifiedAdminPublicKeys.length,
      publicKeys: verifiedAdminPublicKeys,
    }

    adminPublicKeys = verifiedAdminPublicKeys

    // Stringify and save to localStorage
    localStorage.setItem("savedAdminData", JSON.stringify(adminData))

    console.log("Admin public keys saved locally:", adminData)
  } catch (error) {
    console.error("Error fetching/storing admin public keys:", error)
    attemptLoadAdminDataCount++
  }
}

const loadOrFetchAdminGroupsData = async () => {
  try {
    // Pull the JSON from localStorage
    const storedData = localStorage.getItem("savedAdminData")

    if (!storedData && attemptLoadAdminDataCount <= 3) {
      console.log(
        "No saved admin public keys found in local storage. Fetching..."
      )
      await updateOrSaveAdminGroupsDataLocally()
      attemptLoadAdminDataCount++
      return null
    }
    // Parse the JSON, then store the global variables.
    const parsedData = JSON.parse(storedData)

    adminMemberCount = parsedData.keysCount
    adminPublicKeys = parsedData.publicKeys

    console.log(typeof adminPublicKeys) // Should be "object"
    console.log(Array.isArray(adminPublicKeys))

    console.log(
      `Loaded admins 'keysCount'=${adminMemberCount}, publicKeys=`,
      adminPublicKeys
    )
    attemptLoadAdminDataCount = 0

    return parsedData // and return { adminMemberCount, adminKeys } to the caller
  } catch (error) {
    console.error("Error loading/parsing saved admin public keys:", error)
    return null
  }
}

const adminRunWithConcurrency = async (tasks, concurrency = 8) => {
  const results = new Array(tasks.length)
  let index = 0

  const workers = new Array(concurrency).fill(null).map(async () => {
    while (index < tasks.length) {
      const currentIndex = index++
      const task = tasks[currentIndex]
      results[currentIndex] = await task()
    }
  })

  await Promise.all(workers)
  return results
}

const getAdminBoardResourceTimestamp = (resource) =>
  resource?.updated || resource?.created || 0
const getAdminBoardResourceCacheKey = (resource) =>
  `${resource?.name || ""}::${
    resource?.identifier || ""
  }::${getAdminBoardResourceTimestamp(resource)}`
const getAdminBoardResourceIdentityKey = (resource) =>
  `${resource?.name || ""}::${resource?.identifier || ""}`
const getOptimisticEncryptedCommentCacheKey = (
  publisherName,
  commentIdentifier
) => `${publisherName || ""}::${commentIdentifier || ""}`

const fetchCachedAdminSearchResources = async (
  dayRange,
  afterTime,
  forceSearch = false
) => {
  if (forceSearch) {
    adminBoardSearchCache.resourcesByKey.clear()
    adminBoardSearchCache.maxDaysCovered = 0
    adminBoardSearchCache.hasAllRange = false
  }

  const cacheCoversRange =
    dayRange === 0
      ? adminBoardSearchCache.hasAllRange
      : adminBoardSearchCache.hasAllRange ||
        adminBoardSearchCache.maxDaysCovered >= dayRange

  if (!cacheCoversRange) {
    const fetched = await searchSimple(
      "MAIL_PRIVATE",
      `${encryptedCardIdentifierPrefix}`,
      "",
      0,
      0,
      "",
      false,
      true,
      afterTime
    )
    const fetchedArray = Array.isArray(fetched) ? fetched : []
    for (const resource of fetchedArray) {
      adminBoardSearchCache.resourcesByKey.set(
        getAdminBoardResourceCacheKey(resource),
        resource
      )
    }
    if (dayRange === 0) {
      adminBoardSearchCache.hasAllRange = true
    } else {
      adminBoardSearchCache.maxDaysCovered = Math.max(
        adminBoardSearchCache.maxDaysCovered,
        dayRange
      )
    }
  }

  const allCached = Array.from(adminBoardSearchCache.resourcesByKey.values())
  if (afterTime > 0) {
    return allCached.filter(
      (resource) => getAdminBoardResourceTimestamp(resource) >= afterTime
    )
  }
  return allCached
}

const getDecryptedAdminCardCached = async (cardResource) => {
  const cacheKey = getAdminBoardResourceCacheKey(cardResource)
  if (adminBoardDecryptedCardCache.has(cacheKey)) {
    return adminBoardDecryptedCardCache.get(cacheKey)
  }
  const cardDataResponse = await qortalRequest({
    action: "FETCH_QDN_RESOURCE",
    name: cardResource.name,
    service: "MAIL_PRIVATE",
    identifier: cardResource.identifier,
    encoding: "base64",
  })
  if (!cardDataResponse) {
    return null
  }
  const decryptedCardData = await decryptAndParseObject(cardDataResponse)
  adminBoardDecryptedCardCache.set(cacheKey, decryptedCardData)
  return decryptedCardData
}

const rememberOptimisticEncryptedComment = (
  cardIdentifier,
  publisherName,
  commentIdentifier,
  commentData,
  timestamp = Date.now()
) => {
  if (!cardIdentifier || !publisherName || !commentIdentifier || !commentData)
    return

  const resource = {
    name: publisherName,
    service: "MAIL_PRIVATE",
    identifier: commentIdentifier,
    created: timestamp,
    updated: timestamp,
    _optimisticComment: true,
    _cardIdentifier: cardIdentifier,
  }
  optimisticEncryptedCommentCache.set(
    getOptimisticEncryptedCommentCacheKey(publisherName, commentIdentifier),
    {
      cardIdentifier,
      resource,
      commentData: {
        ...commentData,
        _optimisticPending: true,
      },
    }
  )
  if (typeof rememberBoardCommentContent === "function") {
    rememberBoardCommentContent(commentIdentifier, commentData?.content || "")
  }
  if (typeof rememberBoardCommentData === "function") {
    rememberBoardCommentData(commentIdentifier, commentData)
  }
}

const getOptimisticEncryptedComments = (
  cardIdentifier,
  existingResourcesByIdentity = new Map()
) => {
  const comments = []
  for (const [cacheKey, entry] of optimisticEncryptedCommentCache.entries()) {
    if (!entry || entry.cardIdentifier !== cardIdentifier || !entry.resource)
      continue

    const identityKey = getAdminBoardResourceIdentityKey(entry.resource)
    const existingResource = existingResourcesByIdentity.get(identityKey)
    const existingTimestamp = getAdminBoardResourceTimestamp(existingResource)
    const optimisticTimestamp = getAdminBoardResourceTimestamp(entry.resource)
    if (existingResource && existingTimestamp >= optimisticTimestamp) {
      optimisticEncryptedCommentCache.delete(cacheKey)
      continue
    }

    comments.push(entry.resource)
  }
  return comments
}

const fetchEncryptedCommentData = async (commentResource) => {
  const optimisticEntry = optimisticEncryptedCommentCache.get(
    getOptimisticEncryptedCommentCacheKey(
      commentResource?.name,
      commentResource?.identifier
    )
  )
  if (optimisticEntry?.commentData) {
    return optimisticEntry.commentData
  }

  const commentDataResponse = await qortalRequest({
    action: "FETCH_QDN_RESOURCE",
    name: commentResource.name,
    service: "MAIL_PRIVATE",
    identifier: commentResource.identifier,
    encoding: "base64",
  })
  return await decryptAndParseObject(commentDataResponse)
}

const detachAdminBoardInfiniteScroll = () => {
  if (adminBoardInfiniteState.scrollHandler) {
    window.removeEventListener("scroll", adminBoardInfiniteState.scrollHandler)
    adminBoardInfiniteState.scrollHandler = null
  }
}

const removeAdminBoardSkeleton = (cardIdentifier) => {
  const skeletonCard = document.getElementById(`skeleton-${cardIdentifier}`)
  if (skeletonCard) {
    skeletonCard.remove()
  }
}

const replaceAdminBoardSkeleton = (cardIdentifier, htmlContent) => {
  const skeletonCard = document.getElementById(`skeleton-${cardIdentifier}`)
  if (skeletonCard) {
    skeletonCard.outerHTML = htmlContent
  }
}

const maybeRenderMoreAdminBoardCards = async (loadToken) => {
  if (loadToken !== adminBoardInfiniteState.loadToken) return
  if (adminBoardInfiniteState.inFlight || adminBoardInfiniteState.complete)
    return
  await renderAdminBoardCardBatch(loadToken)
}

const startAdminBoardBackgroundRender = (loadToken) => {
  if (adminBoardInfiniteState.backgroundRunnerToken === loadToken) return
  adminBoardInfiniteState.backgroundRunnerToken = loadToken
  const run = async () => {
    try {
      while (
        loadToken === adminBoardInfiniteState.loadToken &&
        !adminBoardInfiniteState.complete
      ) {
        await maybeRenderMoreAdminBoardCards(loadToken)
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } catch (error) {
      console.warn("Error during admin board background render:", error)
    } finally {
      if (adminBoardInfiniteState.backgroundRunnerToken === loadToken) {
        adminBoardInfiniteState.backgroundRunnerToken = 0
      }
    }
  }
  run()
}

const updateAdminBoardProgressText = () => {
  const progressEl = adminBoardInfiniteState.progressEl
  if (!progressEl) return

  const displayed = adminBoardInfiniteState.displayedCount
  const total =
    adminBoardInfiniteState.totalCount ||
    adminBoardInfiniteState.cards.length ||
    0

  if (adminBoardInfiniteState.isBackgroundLoading && total > 0) {
    const loadingHtml =
      typeof getBoardInlineLoadingHTML === "function"
        ? getBoardInlineLoadingHTML(
            `Loading cards ${Math.min(displayed, total)}/${total}`
          )
        : "Loading cards..."
    progressEl.innerHTML = `${loadingHtml}`
    return
  }

  if (total > 0) {
    progressEl.textContent = `(${displayed} of ${total} cards displayed)`
    return
  }

  progressEl.textContent = ""
}

const renderAdminBoardCardBatch = async (loadToken) => {
  // Kakashi Note: Load token gates prevent old async work from mutating the board after a refresh or sort change.
  if (loadToken !== adminBoardInfiniteState.loadToken) return
  if (adminBoardInfiniteState.inFlight || adminBoardInfiniteState.complete)
    return
  const cardsContainer = adminBoardInfiniteState.container
  if (!cardsContainer || !document.body.contains(cardsContainer)) {
    adminBoardInfiniteState.complete = true
    adminBoardInfiniteState.inFlight = false
    adminBoardInfiniteState.isBackgroundLoading = false
    detachAdminBoardInfiniteScroll()
    updateAdminBoardProgressText()
    return
  }

  const start = adminBoardInfiniteState.cursor
  const end = Math.min(
    start + ADMIN_SCROLL_BATCH_SIZE,
    adminBoardInfiniteState.cards.length
  )
  if (start >= end) {
    adminBoardInfiniteState.complete = true
    adminBoardInfiniteState.isBackgroundLoading = false
    updateAdminBoardProgressText()
    return
  }

  const batch = adminBoardInfiniteState.cards.slice(start, end)
  adminBoardInfiniteState.cursor = end
  adminBoardInfiniteState.inFlight = true

  // Kakashi Note: Insert skeletons first so users see immediate progress while encrypted payloads finalize.
  for (const { card } of batch) {
    if (loadToken !== adminBoardInfiniteState.loadToken) {
      adminBoardInfiniteState.inFlight = false
      return
    }
    const skeletonHTML = createEncryptedSkeletonCardHTML(card.identifier)
    cardsContainer.insertAdjacentHTML("beforeend", skeletonHTML)
  }

  const finalizeTasks = batch.map(({ card, decryptedCardData }) => {
    return async () => {
      if (loadToken !== adminBoardInfiniteState.loadToken) return
      try {
        const encryptedCardPollPublisherPublicKey =
          await getPollPublisherPublicKey(decryptedCardData.poll)
        const encryptedCardPublisherPublicKey = await getPublicKeyByName(
          card.name
        )
        if (
          encryptedCardPollPublisherPublicKey !==
          encryptedCardPublisherPublicKey
        ) {
          console.warn(
            `QuickMythril cardPollHijack attack detected! Skipping card: ${card.identifier}`
          )
          if (loadToken === adminBoardInfiniteState.loadToken) {
            removeAdminBoardSkeleton(card.identifier)
          }
          return
        }

        const pollResults = await fetchPollResultsCached(decryptedCardData.poll)
        if (pollResults?.error) {
          if (loadToken === adminBoardInfiniteState.loadToken) {
            removeAdminBoardSkeleton(card.identifier)
          }
          return
        }

        const encryptedCommentCount = await getEncryptedCommentCount(
          card.identifier
        )
        const finalCardHTML = await createEncryptedCardHTML(
          decryptedCardData,
          pollResults,
          card.identifier,
          encryptedCommentCount,
          adminBoardInfiniteState.sharedBoardData
        )

        if (loadToken !== adminBoardInfiniteState.loadToken) return
        if (!finalCardHTML || finalCardHTML === "") {
          removeAdminBoardSkeleton(card.identifier)
          return
        }
        adminBoardInfiniteState.displayedCount += 1
        updateAdminBoardProgressText()
        replaceAdminBoardSkeleton(card.identifier, finalCardHTML)
      } catch (error) {
        console.error(`Error finalizing card ${card.identifier}:`, error)
        if (loadToken === adminBoardInfiniteState.loadToken) {
          removeAdminBoardSkeleton(card.identifier)
        }
      }
    }
  })

  try {
    await adminRunWithConcurrency(finalizeTasks, 6)
  } finally {
    adminBoardInfiniteState.inFlight = false
  }

  if (loadToken !== adminBoardInfiniteState.loadToken) return
  if (adminBoardInfiniteState.cursor >= adminBoardInfiniteState.cards.length) {
    adminBoardInfiniteState.complete = true
    adminBoardInfiniteState.isBackgroundLoading = false
  }
  updateAdminBoardProgressText()
}

const extractEncryptedCardsMinterName = (cardIdentifier) => {
  const parts = cardIdentifier.split("-")
  // Ensure the format has at least 3 parts
  if (parts.length < 3) {
    throw new Error("Invalid identifier format")
  }

  if (parts.slice(2, -1).join("-") === "TOPIC") {
    console.log(
      `TOPIC found in identifier: ${cardIdentifier} - not including in duplicatesList`
    )
    return
  }
  // Extract minterName (everything from the second part to the second-to-last part)
  const minterName = parts.slice(2, -1).join("-")
  // Return the extracted minterName
  return minterName
}

const fetchAllEncryptedCards = async (forceSearch = false) => {
  const loadToken = adminBoardInfiniteState.loadToken + 1
  adminBoardInfiniteState.loadToken = loadToken
  detachAdminBoardInfiniteScroll()
  adminBoardInfiniteState.cards = []
  adminBoardInfiniteState.cursor = 0
  adminBoardInfiniteState.inFlight = false
  adminBoardInfiniteState.complete = false
  adminBoardInfiniteState.displayedCount = 0
  adminBoardInfiniteState.totalCount = 0
  adminBoardInfiniteState.isBackgroundLoading = false
  adminBoardInfiniteState.progressEl = null
  adminBoardInfiniteState.sharedBoardData = null
  adminBoardInfiniteState.backgroundRunnerToken = 0

  if (forceSearch) {
    adminBoardDecryptedCardCache.clear()
    if (typeof clearPollResultsCache === "function") {
      clearPollResultsCache()
    }
  }

  const encryptedCardsContainer = document.getElementById(
    "encrypted-cards-container"
  )
  encryptedCardsContainer.innerHTML = getBoardLoadingHTML("Loading cards...")
  adminBoardInfiniteState.container = encryptedCardsContainer
  adminBoardInfiniteState.progressEl = document.getElementById(
    "admin-board-progress"
  )
  updateAdminBoardProgressText()

  let afterTime = 0
  let dayRange = 0
  const timeRangeSelect = document.getElementById("time-range-select")
  if (timeRangeSelect) {
    const days = parseInt(timeRangeSelect.value, 10)
    dayRange = Number.isNaN(days) ? 0 : days
    if (dayRange > 0) {
      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      afterTime = now - dayRange * dayMs // e.g. last X days
      console.log(
        `afterTime for last ${dayRange} days = ${new Date(
          afterTime
        ).toLocaleString()}`
      )
    }
  }

  try {
    const response = await fetchCachedAdminSearchResources(
      dayRange,
      afterTime,
      forceSearch
    )
    if (loadToken !== adminBoardInfiniteState.loadToken) return

    if (!response || response.length === 0) {
      adminBoardInfiniteState.isBackgroundLoading = false
      adminBoardInfiniteState.totalCount = 0
      updateAdminBoardProgressText()
      encryptedCardsContainer.innerHTML = "<p>No cards found.</p>"
      return
    }

    // Validate/decrypt cards with bounded concurrency to reduce QDN load spikes.
    const validationTasks = response.map((card) => async () => {
      try {
        // Validate the card identifier
        const isValid = await validateEncryptedCardIdentifier(card)
        if (!isValid) return null

        const decryptedCardData = await getDecryptedAdminCardCached(card)
        if (!decryptedCardData) return null

        // Skip cards without polls
        if (!decryptedCardData.poll) return null

        return { card, decryptedCardData }
      } catch (error) {
        console.warn(`Error processing card ${card.identifier}:`, error)
        return null
      }
    })
    const validatedCards = await adminRunWithConcurrency(validationTasks, 8)
    if (loadToken !== adminBoardInfiniteState.loadToken) return

    // Filter out invalid or skipped cards
    const validCardsWithData = validatedCards.filter((entry) => entry !== null)

    if (validCardsWithData.length === 0) {
      adminBoardInfiniteState.isBackgroundLoading = false
      adminBoardInfiniteState.totalCount = 0
      updateAdminBoardProgressText()
      encryptedCardsContainer.innerHTML = "<p>No valid cards found.</p>"
      return
    }

    const getCardTimestamp = (cardObj) =>
      cardObj.updated || cardObj.created || 0
    const isTopicCard = (cardData) => {
      const topicFlag = Object.prototype.hasOwnProperty.call(
        cardData,
        "topicMode"
      )
        ? cardData.topicMode
        : cardData.isTopic
      if (typeof topicFlag === "boolean") {
        return topicFlag
      }
      if (typeof topicFlag === "string") {
        return topicFlag.trim().toLowerCase() === "true"
      }
      return false
    }

    // Kakashi Note: First pass dedupe keeps only the newest payload per exact identifier.
    const latestCardsMap = new Map()
    validCardsWithData.forEach(({ card, decryptedCardData }) => {
      const incomingTs = getCardTimestamp(card)
      const existing = latestCardsMap.get(card.identifier)
      const existingTs = existing ? getCardTimestamp(existing.card) : -1
      if (!existing || incomingTs > existingTs) {
        latestCardsMap.set(card.identifier, { card, decryptedCardData })
      }
    })
    const uniqueValidCards = Array.from(latestCardsMap.values())

    // Kakashi Note: Second pass dedupe enforces one latest card per topic or minter identity bucket.
    const mostRecentCardsMap = new Map()
    uniqueValidCards.forEach(({ card, decryptedCardData }) => {
      const topicCard = isTopicCard(decryptedCardData)
      let dedupeKey

      if (topicCard) {
        // Topic cards should not overwrite each other by name.
        dedupeKey = `topic::${card.identifier}`
      } else {
        const obtainedMinterName = decryptedCardData.minterName
        if (!obtainedMinterName) {
          console.warn(
            `Skipping non-topic card without minterName: ${card.identifier}`
          )
          return
        }
        dedupeKey = `name::${obtainedMinterName}`
      }

      const incomingTs = getCardTimestamp(card)
      const existing = mostRecentCardsMap.get(dedupeKey)
      const existingTs = existing ? getCardTimestamp(existing.card) : -1
      if (!existing || incomingTs > existingTs) {
        mostRecentCardsMap.set(dedupeKey, { card, decryptedCardData })
      }
    })

    // Convert the map into an array of final cards
    const finalCards = Array.from(mostRecentCardsMap.values())

    let selectedSort = "newest"
    const sortSelect = document.getElementById("sort-select")
    if (sortSelect) {
      selectedSort = sortSelect.value
    }
    const isVoteSort =
      selectedSort === "least-votes" || selectedSort === "most-votes"
    if (isVoteSort) {
      // Kakashi Note: Vote sorts are heavier, so show explicit status text while resorting completes.
      encryptedCardsContainer.innerHTML = getBoardLoadingHTML(
        "Loading and resorting cards by votes..."
      )
    }

    if (selectedSort === "name") {
      // Sort alphabetically by the minter's name
      finalCards.sort((a, b) => {
        const nameA = a.decryptedCardData.minterName?.toLowerCase() || ""
        const nameB = b.decryptedCardData.minterName?.toLowerCase() || ""
        return nameA.localeCompare(nameB)
      })
    } else if (selectedSort === "recent-comments") {
      // We need each card's newest comment timestamp for sorting
      for (let card of finalCards) {
        card.newestCommentTimestamp = await getNewestAdminCommentTimestamp(
          card.card.identifier
        )
      }
      // Then sort descending by newest comment
      finalCards.sort(
        (a, b) =>
          (b.newestCommentTimestamp || 0) - (a.newestCommentTimestamp || 0)
      )
    } else if (selectedSort === "least-votes") {
      // TODO: Add the logic to sort by LEAST total ADMIN votes, then totalYesWeight
      const minterGroupMembers = await fetchMinterGroupMembers()
      const minterAdmins = await fetchMinterGroupAdmins()
      for (const finalCard of finalCards) {
        try {
          const pollName = finalCard.decryptedCardData.poll
          // If card or poll is missing, default to zero
          if (!pollName) {
            finalCard._adminTotalVotes = 0
            finalCard._yesWeight = 0
            continue
          }
          const pollResults = await fetchPollResultsCached(pollName)
          if (!pollResults || pollResults.error) {
            finalCard._adminTotalVotes = 0
            finalCard._yesWeight = 0
            continue
          }
          // Pull only the adminYes/adminNo/totalYesWeight from processPollData
          const { adminYes, adminNo, totalYesWeight } = await processPollData(
            pollResults,
            minterGroupMembers,
            minterAdmins,
            finalCard.decryptedCardData.creator,
            finalCard.card.identifier
          )
          finalCard._adminTotalVotes = adminYes + adminNo
          finalCard._yesWeight = totalYesWeight
        } catch (error) {
          console.warn(
            `Error fetching or processing poll for card ${finalCard.card.identifier}:`,
            error
          )
          finalCard._adminTotalVotes = 0
          finalCard._yesWeight = 0
        }
      }
      // Sort ascending by (adminYes + adminNo), then descending by totalYesWeight
      finalCards.sort((a, b) => {
        const diffAdminTotal = a._adminTotalVotes - b._adminTotalVotes
        if (diffAdminTotal !== 0) return diffAdminTotal
        // If there's a tie, show the card with higher yesWeight first
        return b._yesWeight - a._yesWeight
      })
    } else if (selectedSort === "most-votes") {
      // TODO: Add the logic to sort by MOST total ADMIN votes, then totalYesWeight
      const minterGroupMembers = await fetchMinterGroupMembers()
      const minterAdmins = await fetchMinterGroupAdmins()
      for (const finalCard of finalCards) {
        try {
          const pollName = finalCard.decryptedCardData.poll
          if (!pollName) {
            finalCard._adminTotalVotes = 0
            finalCard._yesWeight = 0
            continue
          }
          const pollResults = await fetchPollResultsCached(pollName)
          if (!pollResults || pollResults.error) {
            finalCard._adminTotalVotes = 0
            finalCard._yesWeight = 0
            continue
          }
          const { adminYes, adminNo, totalYesWeight } = await processPollData(
            pollResults,
            minterGroupMembers,
            minterAdmins,
            finalCard.decryptedCardData.creator,
            finalCard.card.identifier
          )
          finalCard._adminTotalVotes = adminYes + adminNo
          finalCard._yesWeight = totalYesWeight
        } catch (error) {
          console.warn(
            `Error fetching or processing poll for card ${finalCard.card.identifier}:`,
            error
          )
          finalCard._adminTotalVotes = 0
          finalCard._yesWeight = 0
        }
      }
      // Sort descending by (adminYes + adminNo), then descending by totalYesWeight
      finalCards.sort((a, b) => {
        const diffAdminTotal = b._adminTotalVotes - a._adminTotalVotes
        if (diffAdminTotal !== 0) return diffAdminTotal
        return b._yesWeight - a._yesWeight
      })
    } else {
      // Sort cards by timestamp (most recent first)
      finalCards.sort((a, b) => {
        const timestampA = a.card.updated || a.card.created || 0
        const timestampB = b.card.updated || b.card.created || 0
        return timestampB - timestampA
      })
    }
    if (loadToken !== adminBoardInfiniteState.loadToken) return

    encryptedCardsContainer.innerHTML = ""

    const finalVisualFilterCards = finalCards.filter(({ card }) => {
      const showKickedBanned =
        document.getElementById("admin-show-kicked-banned-checkbox")?.checked ??
        false
      const showHiddenAdminCards =
        document.getElementById("admin-show-hidden-checkbox")?.checked ?? false

      if (!showKickedBanned) {
        if (adminBoardState.bannedCards.has(card.identifier)) {
          return false // skip
        }

        if (adminBoardState.kickedCards.has(card.identifier)) {
          return false // skip
        }
      }

      if (!showHiddenAdminCards) {
        if (adminBoardState.hiddenList.has(card.identifier)) {
          return false // skip
        }
      }

      return true
    })
    console.warn(`sharing current adminBoardState...`, adminBoardState)
    if (!finalVisualFilterCards.length) {
      adminBoardInfiniteState.isBackgroundLoading = false
      adminBoardInfiniteState.totalCount = 0
      updateAdminBoardProgressText()
      encryptedCardsContainer.innerHTML =
        "<p>No cards found for selected filters.</p>"
      return
    }

    let sharedBoardData = null
    if (finalVisualFilterCards.length > 0) {
      const [kickBanTxData, minterGroupMembers, minterAdmins] =
        await Promise.all([
          fetchAllKickBanTxData(),
          fetchMinterGroupMembers(),
          fetchMinterGroupAdmins(),
        ])
      sharedBoardData = {
        kickBanTxData,
        minterGroupMembers,
        minterAdmins,
      }
    }
    if (loadToken !== adminBoardInfiniteState.loadToken) return

    encryptedCardsContainer.innerHTML = ""
    adminBoardInfiniteState.cards = finalVisualFilterCards
    adminBoardInfiniteState.sharedBoardData = sharedBoardData
    adminBoardInfiniteState.cursor = 0
    adminBoardInfiniteState.complete = false
    adminBoardInfiniteState.displayedCount = 0
    adminBoardInfiniteState.totalCount = finalVisualFilterCards.length
    adminBoardInfiniteState.isBackgroundLoading =
      finalVisualFilterCards.length > 0
    updateAdminBoardProgressText()
    startAdminBoardBackgroundRender(loadToken)
  } catch (error) {
    if (loadToken !== adminBoardInfiniteState.loadToken) return
    adminBoardInfiniteState.isBackgroundLoading = false
    updateAdminBoardProgressText()
    console.error("Error loading cards:", error)
    encryptedCardsContainer.innerHTML = "<p>Failed to load cards.</p>"
  }
}

// Function to create a skeleton card
const createEncryptedSkeletonCardHTML = (cardIdentifier) => {
  return `
    <div id="skeleton-${cardIdentifier}" class="skeleton-card" style="padding: 10px; border: 1px solid gray; margin: 10px 0;">
      <div style="display: flex; align-items: center;">
        <div style="width: 50px; height: 50px; background-color: #ccc; border-radius: 50%;"></div>
        <div style="margin-left: 10px;">
          <div style="width: 120px; height: 20px; background-color: #ccc; margin-bottom: 5px;"></div>
          <div style="width: 80px; height: 15px; background-color: #ddd;"></div>
        </div>
      </div>
      <div style="margin-top: 10px;">
        <div style="width: 100%; height: 40px; background-color: #eee;"></div>
      </div>
    </div>
  `
}

// Function to check and fech an existing Minter Card if attempting to publish twice ----------------------------------------
const fetchExistingEncryptedCard = async (minterName, existingIdentifier) => {
  try {
    const cardDataResponse = await qortalRequest({
      action: "FETCH_QDN_RESOURCE",
      name: minterName,
      service: "MAIL_PRIVATE",
      identifier: existingIdentifier,
      encoding: "base64",
    })

    const decryptedCardData = await decryptAndParseObject(cardDataResponse)
    console.log("Full card data fetched successfully:", decryptedCardData)

    return decryptedCardData
  } catch (error) {
    console.error("Error fetching existing card:", error)
    return null
  }
}

// Validate that a card is indeed a card and not a comment. -------------------------------------
const validateEncryptedCardIdentifier = async (card) => {
  return (
    typeof card === "object" &&
    card.name &&
    card.service === "MAIL_PRIVATE" &&
    card.identifier &&
    !card.identifier.includes("comment") &&
    !card.identifier.includes(
      "card-MAC-NC-function now() { [native code] }-Y6CmuY"
    ) && // Added check for failed name card publish due to identifier issue.
    card.created
  )
}

// Load existing card data passed, into the form for editing -------------------------------------
const loadEncryptedCardIntoForm = async (decryptedCardData) => {
  if (decryptedCardData) {
    console.log("Loading existing card data:", decryptedCardData)
    document.getElementById("minter-name-input").value =
      decryptedCardData.minterName
    document.getElementById("card-header").value = decryptedCardData.header
    if (typeof ensureBoardRichTextEditor === "function") {
      ensureBoardRichTextEditor(
        adminBoardPublishEditorKey,
        "Enter any information you like."
      )
      setBoardRichTextEditorHtml(
        adminBoardPublishEditorKey,
        decryptedCardData.content
      )
    } else {
      const contentField = document.getElementById("card-content")
      if (contentField) {
        contentField.value = decryptedCardData.content
      }
    }

    const linksContainer = document.getElementById("links-container")
    linksContainer.innerHTML = "" // Clear previous links
    decryptedCardData.links.forEach((link) => {
      const linkInput = document.createElement("input")
      linkInput.type = "text"
      linkInput.className = "card-link"
      linkInput.value = link
      linksContainer.appendChild(linkInput)
    })
  }
}

const openAdminBoardCardEditor = async (cardIdentifier) => {
  const decryptedCardData =
    adminBoardDecryptedCardByIdentifier.get(cardIdentifier)
  if (!decryptedCardData) {
    alert("Unable to load this card for editing right now.")
    return
  }

  isUpdateCard = true
  existingEncryptedCardIdentifier = cardIdentifier
  existingDecryptedCardData = decryptedCardData

  const publishForm = document.getElementById("publish-card-form")
  if (publishForm) {
    publishForm.reset()
  }

  const linksContainer = document.getElementById("links-container")
  if (linksContainer) {
    linksContainer.innerHTML = ""
  }

  const publishCardView = document.getElementById("publish-card-view")
  const encryptedCardsContainer = document.getElementById(
    "encrypted-cards-container"
  )
  if (encryptedCardsContainer) {
    encryptedCardsContainer.style.display = "none"
  }
  if (publishCardView) {
    publishCardView.style.display = "flex"
  }

  await loadEncryptedCardIntoForm(decryptedCardData)

  const submitButton = document.getElementById("submit-publish-button")
  if (submitButton) {
    submitButton.textContent = "Update Card"
  }

  if (publishCardView?.scrollIntoView) {
    publishCardView.scrollIntoView({ behavior: "smooth", block: "start" })
  }
}

const validateMinterName = async (minterName) => {
  const normalizedMinterName = String(minterName || "").trim()
  if (!normalizedMinterName) {
    return null
  }

  try {
    const nameInfoGetter =
      typeof getNameInfoCached === "function" ? getNameInfoCached : getNameInfo
    const nameInfo = await nameInfoGetter(normalizedMinterName)
    const name = String(nameInfo?.name || "").trim()
    if (name) {
      console.log(`name information found, returning:`, name)
      return name
    } else {
      console.warn(
        `no name information found, this is not a registered name: '${normalizedMinterName}', Returning null`
      )
      return null
    }
  } catch (error) {
    console.error(
      `extracting name from name info: ${normalizedMinterName} failed.`,
      error
    )
    return null
  }
}

const publishEncryptedCard = async (isTopicModePassed = false) => {
  if (adminBoardPublishInProgress) {
    return
  }

  // If the user wants it to be a topic, we set global isTopic = true, else false
  isTopic = isTopicModePassed || isTopic

  const minterNameInput = document
    .getElementById("minter-name-input")
    .value.trim()
  const header = document.getElementById("card-header").value.trim()
  const contentText =
    typeof getBoardRichTextEditorText === "function"
      ? getBoardRichTextEditorText(adminBoardPublishEditorKey)
      : document.getElementById("card-content")?.value?.trim() || ""
  const content =
    typeof getBoardRichTextEditorHtml === "function"
      ? getBoardRichTextEditorHtml(adminBoardPublishEditorKey)
      : qRenderRichContentHtml(contentText)
  const links = Array.from(document.querySelectorAll(".card-link"))
    .map((input) => input.value.trim())
    .filter((link) => link.startsWith("qortal://"))

  // Basic validation
  if (!header || !content) {
    alert("Header and Content are required!")
    return
  }

  const submitButton = document.getElementById("submit-publish-button")
  const setPublishButtonBusy = (busy) => {
    if (!submitButton) return
    submitButton.disabled = busy
    submitButton.textContent = busy
      ? isUpdateCard
        ? "UPDATING..."
        : "PUBLISHING..."
      : isUpdateCard
      ? "Update Card"
      : "Publish Card"
  }

  const publishSteps = [
    {
      key: "validate",
      label: "Validating publish details",
      detail: "Checking the card fields and resolving the target name.",
      status: "active",
    },
    {
      key: "duplicate",
      label: "Checking for duplicates",
      detail: "Confirming whether this is a new card or an update.",
      status: "pending",
    },
    {
      key: "package",
      label: "Preparing the payload",
      detail: "Resolving the card fields and loading admin keys.",
      status: "pending",
    },
    {
      key: "publish",
      label: "Publishing encrypted card",
      detail: "Sending the private card payload to QDN.",
      status: "pending",
    },
    {
      key: "poll",
      label: "Creating or updating the poll",
      detail: "Making sure the admin poll state matches the card.",
      status: "pending",
    },
    {
      key: "refresh",
      label: "Refreshing the board",
      detail: "Reloading encrypted cards so the latest state appears.",
      status: "pending",
    },
  ]

  let publishProgress = {
    title: isUpdateCard ? "Preparing admin update" : "Preparing admin card",
    subtitle:
      "Please keep this window open while the encrypted card is prepared and published.",
    message:
      "This path can take a little while because the card must be resolved, encrypted, and published to the admin group.",
    steps: publishSteps,
  }

  let publishedMinterName = minterNameInput
  let minterAddress = ""

  const syncPublishProgress = () => {
    if (
      typeof updateBoardPublishProgressModal === "function" &&
      publishProgress
    ) {
      updateBoardPublishProgressModal(publishProgress)
    }
  }

  const setPublishStep = (stepKey, status, detail = null) => {
    publishProgress.steps = setBoardPublishProgressStepStatus(
      publishProgress.steps,
      stepKey,
      status,
      detail
    )
    syncPublishProgress()
  }

  const closePublishProgress = () => {
    if (typeof closeBoardPublishProgressModal === "function") {
      closeBoardPublishProgressModal()
    }
  }

  try {
    if (typeof showBoardPublishProgressModal === "function") {
      showBoardPublishProgressModal(publishProgress)
    }

    // If not topic mode, validate the user actually entered a valid Minter name
    if (!isTopic) {
      publishedMinterName = await validateMinterName(minterNameInput)
      if (!publishedMinterName) {
        try {
          const addressInfo = await getAddressInfo(minterNameInput)
          if (
            addressInfo &&
            typeof addressInfo === "object" &&
            addressInfo.address
          ) {
            console.warn(
              `checked minterNameInput and found it to be an address... proceeding accordingly.`
            )
            minterAddress = addressInfo.address
            publishedMinterName = addressInfo.address
          } else {
            alert(
              `"${minterNameInput}" doesn't seem to be a valid name or address. Please check or use topic mode.`
            )
            closePublishProgress()
            return
          }
        } catch (error) {
          console.warn(`error checking for address...?`, error)
          alert(
            `Failed to verify name/address. Please try again, or change to topicMode to publish anything else.`
          )
          closePublishProgress()
          return
        }
      }

      // Also check for existing card if not topic
      if (
        !isUpdateCard &&
        existingCardMinterNames.some(
          (item) => item.minterName === publishedMinterName
        )
      ) {
        const duplicateCardData = existingCardMinterNames.find(
          (item) => item.minterName === publishedMinterName
        )
        const updateCard = confirm(
          `Minter Name: ${publishedMinterName} already has a card. (NOTE this update functionality is no longer functional, it may or may not come back. Even if you update the card you won't see it. It is suggested to CANCEL and use topic mode.`
        )
        if (updateCard) {
          existingEncryptedCardIdentifier = duplicateCardData.identifier
          isUpdateCard = true
        } else {
          closePublishProgress()
          return
        }
      }
    }
    if (!publishedMinterName && minterAddress) {
      console.log(
        `No name was found, but an address was, publishing address in cardData, and using address as name for card.`
      )
    }

    publishProgress.title = isUpdateCard
      ? "Updating admin card"
      : "Publishing admin card"
    syncPublishProgress()

    adminBoardPublishInProgress = true
    setPublishButtonBusy(true)

    setPublishStep("package", "active")

    // Determine final card identifier
    const currentTimestamp = Date.now()
    const newCardIdentifier = isTopic
      ? `${encryptedCardIdentifierPrefix}-TOPIC-${await uid()}`
      : `${encryptedCardIdentifierPrefix}-NC-${currentTimestamp}-${await uid()}`

    const cardIdentifier = isUpdateCard
      ? existingEncryptedCardIdentifier
      : newCardIdentifier

    // Build cardData
    const pollName = `${cardIdentifier}-poll`
    const cardData = {
      minterName: publishedMinterName,
      header,
      content,
      links,
      creator: userState.accountName,
      timestamp: Date.now(),
      poll: pollName,
      topicMode: isTopic,
    }

    // Convert to base64 or fallback
    let base64CardData = await objectToBase64(cardData)
    if (!base64CardData) {
      base64CardData = btoa(JSON.stringify(cardData))
    }

    let verifiedAdminPublicKeys = adminPublicKeys

    if (
      !verifiedAdminPublicKeys ||
      verifiedAdminPublicKeys.length <= 5 ||
      !Array.isArray(verifiedAdminPublicKeys)
    ) {
      console.log(
        `adminPublicKeys variable failed check, attempting to load from localStorage`,
        adminPublicKeys
      )
      const savedAdminData = localStorage.getItem("savedAdminData")
      let parsedAdminData = null
      try {
        parsedAdminData = savedAdminData ? JSON.parse(savedAdminData) : null
      } catch (error) {
        console.warn(
          "Unable to parse saved admin data from localStorage:",
          error
        )
      }
      const loadedAdminKeys = Array.isArray(parsedAdminData?.publicKeys)
        ? parsedAdminData.publicKeys
        : []

      if (loadedAdminKeys.length === 0) {
        console.log(
          "loaded admin keys from localStorage failed, falling back to API call..."
        )
        verifiedAdminPublicKeys = await fetchAdminGroupsMembersPublicKeys()
      } else {
        verifiedAdminPublicKeys = loadedAdminKeys
      }
    }

    setPublishStep("package", "done")
    setPublishStep("publish", "active")

    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userState.accountName,
      service: "MAIL_PRIVATE",
      identifier: cardIdentifier,
      data64: base64CardData,
      encrypt: true,
      publicKeys: verifiedAdminPublicKeys,
    })

    setPublishStep("publish", "done")

    const wasUpdateCard = isUpdateCard
    if (!isUpdateCard) {
      setPublishStep(
        "poll",
        "active",
        "Creating a new poll for the encrypted admin card."
      )
      await qortalRequest({
        action: "CREATE_POLL",
        pollName,
        pollDescription: `Admin Board Poll Published By ${userState.accountName}`,
        pollOptions: ["Yes, No"],
        pollOwnerAddress: userState.accountAddress,
      })
      setPublishStep("poll", "done")
    } else {
      setPublishStep("poll", "done", "Existing poll retained.")
    }

    document.getElementById("publish-card-form").reset()
    if (typeof clearBoardRichTextEditor === "function") {
      clearBoardRichTextEditor(adminBoardPublishEditorKey)
    }
    document.getElementById("publish-card-view").style.display = "none"
    document.getElementById("encrypted-cards-container").style.display = "flex"

    setPublishStep("refresh", "active")
    await fetchAllEncryptedCards(true)
    setPublishStep("refresh", "done")

    isUpdateCard = false
    existingDecryptedCardData = {}
    existingEncryptedCardIdentifier = {}
    isTopic = false // reset global

    await qBoardDelay(250)
    closePublishProgress()

    if (!wasUpdateCard) {
      alert("Card and poll published successfully!")
    } else {
      alert(
        "Card updated successfully! (No poll updates possible currently...)"
      )
    }
  } catch (error) {
    console.error("Error publishing card or poll:", error)
    if (publishProgress) {
      publishProgress.message =
        "The encrypted publish failed before completion. Please try again."
      publishProgress.steps = setBoardPublishProgressStepStatus(
        publishProgress.steps,
        "publish",
        "error",
        error?.message || "Publish failed."
      )
      syncPublishProgress()
      await qBoardDelay(1400)
    }
    closePublishProgress()
    alert("Failed to publish card and poll.")
  } finally {
    adminBoardPublishInProgress = false
    setPublishButtonBusy(false)
    isTopic = false
    if (submitButton) {
      submitButton.textContent = isUpdateCard ? "Update Card" : "Publish Card"
    }
  }
}

const getEncryptedCommentCount = async (cardIdentifier) => {
  try {
    const response = await searchSimple(
      "MAIL_PRIVATE",
      `comment-${cardIdentifier}`,
      "",
      0
    )
    const fetchedComments = Array.isArray(response) ? response : []
    const existingResourcesByIdentity = new Map(
      fetchedComments.map((comment) => [
        getAdminBoardResourceIdentityKey(comment),
        comment,
      ])
    )
    return (
      fetchedComments.length +
      getOptimisticEncryptedComments(
        cardIdentifier,
        existingResourcesByIdentity
      ).length
    )
  } catch (error) {
    console.error(`Error fetching comment count for ${cardIdentifier}:`, error)
    return getOptimisticEncryptedComments(cardIdentifier).length
  }
}

// Post a comment on a card. ---------------------------------
const postEncryptedComment = async (cardIdentifier) => {
  const editingState =
    typeof boardCommentEditState !== "undefined"
      ? boardCommentEditState
      : { cardIdentifier: "", commentIdentifier: "", isEditing: false }
  const replyState =
    typeof boardCommentReplyState !== "undefined"
      ? boardCommentReplyState
      : {
          cardIdentifier: "",
          commentIdentifier: "",
          publisherName: "",
          timestamp: "",
          timestampText: "",
          contentHtml: "",
          isReplying: false,
        }
  const commentText =
    typeof getBoardCommentEditorText === "function"
      ? getBoardCommentEditorText(cardIdentifier)
      : ""
  const fallbackCommentInput = document.getElementById(
    `new-comment-${cardIdentifier}`
  )
  const combinedCommentText =
    commentText || fallbackCommentInput?.value?.trim() || ""

  if (!combinedCommentText) {
    alert("Comment cannot be empty!")
    return
  }
  const postTimestamp = Date.now()
  const commentHtml =
    (typeof getBoardCommentEditorHtml === "function"
      ? getBoardCommentEditorHtml(cardIdentifier)
      : "") || qRenderBoardCommentHtml(combinedCommentText)
  const existingCommentData =
    editingState.isEditing &&
    editingState.cardIdentifier === cardIdentifier &&
    editingState.commentIdentifier &&
    typeof getBoardCommentData === "function"
      ? getBoardCommentData(editingState.commentIdentifier)
      : null
  const isReplyingToThisComment =
    !editingState.isEditing &&
    replyState.isReplying &&
    replyState.cardIdentifier === cardIdentifier &&
    replyState.commentIdentifier
  const replyTo = isReplyingToThisComment
    ? {
        identifier: replyState.commentIdentifier,
        creator: replyState.publisherName || "",
        timestamp: replyState.timestamp || Date.now(),
        timestampText: replyState.timestampText || "",
        content: replyState.contentHtml || "",
      }
    : null
  const commentData = {
    content: commentHtml,
    creator: userState.accountName,
    timestamp: postTimestamp,
    ...(existingCommentData?.replyTo
      ? { replyTo: existingCommentData.replyTo }
      : {}),
    ...(!editingState.isEditing && replyTo ? { replyTo } : {}),
  }
  const isEditingThisComment =
    editingState.isEditing &&
    editingState.cardIdentifier === cardIdentifier &&
    editingState.commentIdentifier
  const commentIdentifier = isEditingThisComment
    ? editingState.commentIdentifier
    : `comment-${cardIdentifier}-${await uid()}`

  if (
    !Array.isArray(adminPublicKeys) ||
    adminPublicKeys.length === 0 ||
    !adminPublicKeys
  ) {
    const verifiedAdminPublicKeys = await fetchAdminGroupsMembersPublicKeys()
    adminPublicKeys = verifiedAdminPublicKeys
  }

  try {
    let base64CommentData = await objectToBase64(commentData)
    if (!base64CommentData) {
      base64CommentData = btoa(JSON.stringify(commentData))
    }

    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userState.accountName,
      service: "MAIL_PRIVATE",
      identifier: commentIdentifier,
      data64: base64CommentData,
      encrypt: true,
      publicKeys: adminPublicKeys,
    })
    // alert('Comment posted successfully!')
    rememberOptimisticEncryptedComment(
      cardIdentifier,
      userState.accountName,
      commentIdentifier,
      commentData,
      commentData.timestamp
    )
    if (typeof clearBoardCommentEditState === "function") {
      await clearBoardCommentEditState(cardIdentifier)
    } else if (typeof clearBoardCommentEditor === "function") {
      clearBoardCommentEditor(cardIdentifier)
    }
    if (fallbackCommentInput) {
      fallbackCommentInput.value = ""
    }
    if (!isEditingThisComment) {
      updateDisplayedEncryptedCommentCount(cardIdentifier, 1)
    }
    const commentsSection = document.getElementById(
      `comments-section-${cardIdentifier}`
    )
    if (commentsSection && commentsSection.style.display === "block") {
      await displayEncryptedComments(cardIdentifier)
      if (
        isEditingThisComment &&
        typeof scrollBoardCommentIntoView === "function"
      ) {
        await scrollBoardCommentIntoView(cardIdentifier, commentIdentifier)
      } else if (typeof scrollBoardCommentsToBottom === "function") {
        await scrollBoardCommentsToBottom(cardIdentifier)
      }
      const commentButton = document.getElementById(
        `comment-button-${cardIdentifier}`
      )
      if (commentButton) {
        commentButton.textContent = "HIDE COMMENTS"
      }
    }
  } catch (error) {
    console.error("Error posting comment:", error)
    alert("Failed to post comment.")
  }
}

const updateDisplayedEncryptedCommentCount = (cardIdentifier, delta = 0) => {
  const commentButton = document.getElementById(
    `comment-button-${cardIdentifier}`
  )
  const currentCount = Number(commentButton?.dataset?.commentCount || 0)
  const nextCount = Math.max(0, currentCount + delta)
  if (commentButton) {
    commentButton.dataset.commentCount = String(nextCount)
    if (
      commentButton.textContent !== "HIDE COMMENTS" &&
      commentButton.textContent !== "LOADING..."
    ) {
      commentButton.textContent = `COMMENTS (${nextCount})`
    }
  }
}

//Fetch the comments for a card with passed card identifier ----------------------------
const fetchEncryptedComments = async (cardIdentifier) => {
  try {
    const response = await searchSimple(
      "MAIL_PRIVATE",
      `comment-${cardIdentifier}`,
      "",
      0,
      0,
      "",
      false
    )
    const fetchedComments = Array.isArray(response) ? response : []
    const existingResourcesByIdentity = new Map(
      fetchedComments.map((comment) => [
        getAdminBoardResourceIdentityKey(comment),
        comment,
      ])
    )
    const optimisticComments = getOptimisticEncryptedComments(
      cardIdentifier,
      existingResourcesByIdentity
    )
    return [...optimisticComments, ...fetchedComments].sort(
      (a, b) =>
        getAdminBoardResourceTimestamp(a) - getAdminBoardResourceTimestamp(b)
    )
  } catch (error) {
    console.error(`Error fetching comments for ${cardIdentifier}:`, error)
    return getOptimisticEncryptedComments(cardIdentifier)
  }
}

const displayEncryptedComments = async (cardIdentifier) => {
  try {
    const comments = await fetchEncryptedComments(cardIdentifier)
    const commentsContainer = document.getElementById(
      `comments-container-${cardIdentifier}`
    )

    commentsContainer.innerHTML = ""

    const voterMap = globalVoterMap.get(cardIdentifier) || new Map()

    const commentHTMLArray = await Promise.all(
      comments.map(async (comment) => {
        try {
          const decryptedCommentData = await fetchEncryptedCommentData(comment)
          const timestampCheck = comment.updated || comment.created || 0
          const timestamp = await timestampToHumanReadableDate(timestampCheck)
          const safeCommenter = qEscapeHtml(decryptedCommentData.creator)
          const commenterLevel =
            typeof getBoardAccountLevel === "function"
              ? await getBoardAccountLevel(decryptedCommentData.creator)
              : null
          const renderedCommentContent = qRenderBoardCommentHtml(
            decryptedCommentData.content
          )
          const safeTimestamp = qEscapeHtml(timestamp)
          const commenterNameHtml =
            typeof buildBoardAccountTriggerHtml === "function"
              ? buildBoardAccountTriggerHtml({
                  name: decryptedCommentData.creator,
                  label: decryptedCommentData.creator,
                  className: "comment-author-name-link",
                  tagName: "button",
                })
              : `<span class="comment-author-name">${safeCommenter}</span>`
          if (typeof rememberBoardCommentData === "function") {
            rememberBoardCommentData(comment.identifier, decryptedCommentData)
          } else if (typeof rememberBoardCommentContent === "function") {
            rememberBoardCommentContent(
              comment.identifier,
              decryptedCommentData.content || ""
            )
          }
          const canEditComment =
            typeof canCurrentUserEditPublishedComment === "function"
              ? await canCurrentUserEditPublishedComment(
                  decryptedCommentData.creator
                )
              : false
          const replyButtonHtml =
            typeof buildBoardCommentReplyButtonHtml === "function"
              ? buildBoardCommentReplyButtonHtml({
                  cardIdentifier,
                  commentIdentifier: comment.identifier,
                  publisherName: decryptedCommentData.creator,
                })
              : ""
          const editButtonHtml =
            canEditComment &&
            typeof buildBoardCommentEditButtonHtml === "function"
              ? buildBoardCommentEditButtonHtml({
                  cardIdentifier,
                  commentIdentifier: comment.identifier,
                  publisherName: decryptedCommentData.creator,
                })
              : ""
          const optimisticNotice = decryptedCommentData._optimisticPending
            ? `<p class="board-progress-muted" style="color: #ffd27d;"><i>Published locally. Waiting for QDN indexing.</i></p>`
            : ""
          const replyPreviewHtml =
            decryptedCommentData.replyTo &&
            typeof buildBoardCommentReplyPreviewHtml === "function"
              ? buildBoardCommentReplyPreviewHtml(
                  decryptedCommentData.replyTo,
                  {
                    variant: "embedded",
                  }
                )
              : ""

          const commenter = decryptedCommentData.creator
          const voterInfo = voterMap.get(commenter)

          const commentClasses = ["comment"]
          const commentStyles = []
          let adminBadge = ""
          const levelBadgeHtml =
            commenterLevel !== null && typeof commenterLevel !== "undefined"
              ? `<span class="comment-level-badge" title="${qEscapeAttr(
                  `Account level: ${commenterLevel}`
                )}" aria-label="${qEscapeAttr(
                  `Account level: ${commenterLevel}`
                )}">L${qEscapeHtml(String(commenterLevel))}</span>`
              : ""

          if (voterInfo) {
            commentClasses.push("comment--voted")
            if (voterInfo.voterType === "Admin") {
              commentClasses.push("comment--vote-admin")
              const accentColor =
                voterInfo.vote === "yes"
                  ? "rgba(92, 196, 130, 0.95)"
                  : "rgba(221, 107, 107, 0.95)"
              const accentSoft =
                voterInfo.vote === "yes"
                  ? "rgba(92, 196, 130, 0.2)"
                  : "rgba(221, 107, 107, 0.2)"
              commentClasses.push(
                voterInfo.vote === "yes"
                  ? "comment--vote-yes"
                  : "comment--vote-no"
              )
              commentStyles.push(`--comment-accent: ${accentColor}`)
              commentStyles.push(`--comment-accent-soft: ${accentSoft}`)
              adminBadge = `<span class="comment-role-badge comment-role-badge--admin">Admin</span>`
            } else {
              commentClasses.push("comment--vote-minter")
              const accentColor =
                voterInfo.vote === "yes"
                  ? "rgba(92, 196, 130, 0.55)"
                  : "rgba(221, 107, 107, 0.55)"
              const accentSoft =
                voterInfo.vote === "yes"
                  ? "rgba(92, 196, 130, 0.12)"
                  : "rgba(221, 107, 107, 0.12)"
              commentClasses.push(
                voterInfo.vote === "yes"
                  ? "comment--vote-yes"
                  : "comment--vote-no"
              )
              commentStyles.push(`--comment-accent: ${accentColor}`)
              commentStyles.push(`--comment-accent-soft: ${accentSoft}`)
            }
          }

          const commentStyleAttr = commentStyles.length
            ? ` style="${commentStyles.join("; ")}"`
            : ""
          return `
            <div class="${commentClasses.join(
              " "
            )}"${commentStyleAttr} data-comment-identifier="${qEscapeAttr(
            comment.identifier
          )}">
              <div class="comment-header-row">
                <p class="comment-meta">
                  ${commenterNameHtml}
                  ${levelBadgeHtml}
                  ${adminBadge}
                </p>
                <div class="comment-actions">
                  ${replyButtonHtml}
                  ${editButtonHtml}
                </div>
              </div>
              ${replyPreviewHtml}
              <div class="comment-body ql-editor">${renderedCommentContent}</div>
              <p class="comment-timestamp"><i>${safeTimestamp}</i></p>
              ${optimisticNotice}
            </div>
          `
        } catch (err) {
          console.error(`Error processing comment ${comment.identifier}:`, err)
          return null // Skip this comment if it fails
        }
      })
    )

    // Add all comments to the container
    commentHTMLArray
      .filter((html) => html !== null) // Filter out failed comments
      .forEach((commentHTML) => {
        commentsContainer.insertAdjacentHTML("beforeend", commentHTML)
      })
  } catch (error) {
    console.error(
      `Error displaying comments (or no comments) for ${cardIdentifier}:`,
      error
    )
  }
}

const toggleEncryptedComments = async (cardIdentifier) => {
  const commentsSection = document.getElementById(
    `comments-section-${cardIdentifier}`
  )
  const commentButton = document.getElementById(
    `comment-button-${cardIdentifier}`
  )

  if (!commentsSection || !commentButton) return

  const count = commentButton.dataset.commentCount
  const isHidden =
    commentsSection.style.display === "none" || !commentsSection.style.display

  if (isHidden) {
    // Show comments
    commentButton.textContent = "LOADING..."
    commentsSection.style.display = "block"
    if (typeof ensureBoardCommentEditor === "function") {
      ensureBoardCommentEditor(cardIdentifier, "Write a comment...")
    }
    await displayEncryptedComments(cardIdentifier)
    // Change the button text to 'HIDE COMMENTS'
    commentButton.textContent = "HIDE COMMENTS"
  } else {
    // Hide comments
    commentsSection.style.display = "none"
    commentButton.textContent = `COMMENTS (${count})`
  }
}

const createLinkDisplayModal = async () => {
  const modalHTML = `
    <div id="links-modal" style="display: none; position: fixed; inset: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.72); z-index: 1000;">
      <div style="position: relative; margin: 4vh auto; width: 90vw; max-width: 92rem; height: 88vh; max-height: 92vh; background: rgba(5, 10, 14, 0.94); border: 1px solid rgba(157, 193, 196, 0.28); border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);">
        <iframe id="links-modalContent" src="" style="width: 100%; height: 100%; border: none;"></iframe>
        <button onclick="closeLinkDisplayModal()" style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(8, 14, 18, 0.86); color: white; border: 1px solid rgba(157, 193, 196, 0.38); padding: 0.35rem 0.75rem; border-radius: 8px;">Close</button>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

// Function to open the modal
const openLinkDisplayModal = async (link) => {
  const processedLink = await processQortalLinkForRendering(link) // Process the link to replace `qortal://` for rendering in modal
  const modal = document.getElementById("links-modal")
  const modalContent = document.getElementById("links-modalContent")
  modalContent.src = qSanitizeUrl(processedLink, "") // Set the iframe source to the link
  modal.style.display = "block" // Show the modal
}

// Function to close the modal
const closeLinkDisplayModal = async () => {
  const modal = document.getElementById("links-modal")
  const modalContent = document.getElementById("links-modalContent")
  modal.style.display = "none" // Hide the modal
  modalContent.src = "" // Clear the iframe source
}

const processQortalLinkForRendering = async (link) => {
  if (link.startsWith("qortal://")) {
    const match = link.match(/^qortal:\/\/([^/]+)(\/.*)?$/)
    if (match) {
      const firstParam = match[1].toUpperCase()
      const remainingPath = match[2] || ""
      const themeColor = window._qdnTheme || "default" // Fallback to 'default' if undefined
      // Simulating async operation if needed
      await new Promise((resolve) => setTimeout(resolve, 10))

      return `/render/${firstParam}${remainingPath}?theme=${themeColor}`
    }
  }
  return qSanitizeUrl(link, "")
}

const checkAndDisplayRemoveActions = async (
  adminYes,
  name,
  cardIdentifier,
  nameIsActuallyAddress = false
) => {
  const latestBlockInfo = await getLatestBlockInfo()
  const isBlockPassed =
    latestBlockInfo.height >= GROUP_APPROVAL_FEATURE_TRIGGER_HEIGHT
  let minAdminCount
  const minterAdmins = await fetchMinterGroupAdmins()
  const effectiveMinterAdmins = getEffectiveMinterAdminMembers(minterAdmins)

  if (effectiveMinterAdmins && effectiveMinterAdmins.length === 1) {
    console.warn(
      `simply a double-check that there is only one MINTER group admin, in which case the group hasn't been transferred to null...keeping default minAdminCount of: ${minAdminCount}`
    )
    minAdminCount = 9
  } else if (
    effectiveMinterAdmins &&
    effectiveMinterAdmins.length > 1 &&
    isBlockPassed
  ) {
    const totalAdmins = effectiveMinterAdmins.length
    const fortyPercent = totalAdmins * 0.4
    minAdminCount = Math.ceil(fortyPercent)
    console.warn(
      `this is another check to ensure minterAdmin group has more than 1 admin. IF so we will calculate the 40% needed for GROUP_APPROVAL, that number is: ${minAdminCount}`
    )
  }
  if (isBlockPassed && (userState.isMinterAdmin || userState.isAdmin)) {
    console.warn(
      `feature trigger has passed, checking for approval requirements`
    )
    let address
    if (!nameIsActuallyAddress) {
      const nameInfo = await getNameInfo(name)
      address = nameInfo?.owner || ""
    } else {
      address = name
    }
    if (!address) {
      console.warn(
        `No owner address could be resolved for "${name}", skipping approval buttons.`
      )
      return ""
    }
    const kickApprovalHtml = await checkGroupApprovalAndCreateButton(
      address,
      cardIdentifier,
      "GROUP_KICK"
    )
    const banApprovalHtml = await checkGroupApprovalAndCreateButton(
      address,
      cardIdentifier,
      "GROUP_BAN"
    )

    if (kickApprovalHtml) {
      return kickApprovalHtml
    }

    if (banApprovalHtml) {
      return banApprovalHtml
    }
  }

  if (
    adminYes >= minAdminCount &&
    (userState.isMinterAdmin || userState.isAdmin)
  ) {
    const removeButtonHtml = createRemoveButtonHtml(name, cardIdentifier)
    return removeButtonHtml
  } else {
    return ""
  }
}

const createRemoveButtonHtml = (name, cardIdentifier) => {
  return `
    <div id="remove-button-container-${cardIdentifier}" style="margin-top: 1em;">
      <button onclick="handleKickMinter('${name}')"
              style="padding: 10px; background: rgb(134, 80, 4); color: white; border: none; cursor: pointer; border-radius: 5px;"
              onmouseover="this.style.backgroundColor='rgb(47, 28, 11) '"
                  onmouseout="this.style.backgroundColor='rgb(134, 80, 4) '">
        Create KICK Tx
      </button>
      <button onclick="handleBanMinter('${name}')"
              style="padding: 10px; background:rgb(93, 7, 7); color: white; border: none; cursor: pointer; border-radius: 5px;"
              onmouseover="this.style.backgroundColor='rgb(39, 9, 9) '"
                  onmouseout="this.style.backgroundColor='rgb(93, 7, 7) '">
        Create BAN Tx
      </button>
    </div>
  `
}

const handleKickMinter = async (minterName) => {
  try {
    let isAddress = await getAddressInfo(minterName)

    // Optional block check
    let txGroupId = 0
    // const { height: currentHeight } = await getLatestBlockInfo()
    const isBlockPassed = await featureTriggerCheck()
    if (isBlockPassed) {
      console.log(
        `block height above featureTrigger Height, using group approval method...txGroupId 694`
      )
      txGroupId = 694
    }

    // Get the minter address from name info
    let minterAddress
    if (!isAddress.address || isAddress.address !== minterName) {
      const minterNameInfo = await getNameInfo(minterName)
      minterAddress = minterNameInfo?.owner
    } else {
      minterAddress = minterName
    }

    if (!minterAddress) {
      alert(
        `No valid address found for minter name: ${minterName}, this should NOT have happened, please report to developers...`
      )
      return
    }

    const adminPublicKey = await getPublicKeyFromAddress(
      userState.accountAddress
    )
    const reason = "Kicked by Minter Admins"
    const fee = 0.01

    const rawKickTransaction = await createGroupKickTransaction(
      adminPublicKey,
      694,
      minterAddress,
      reason,
      txGroupId,
      fee
    )

    const signedKickTransaction = await qortalRequest({
      action: "SIGN_TRANSACTION",
      unsignedBytes: rawKickTransaction,
    })
    if (!signedKickTransaction) {
      console.warn(
        `this only happens if the SIGN_TRANSACTION qortalRequest failed... are you using the legacy UI prior to this qortalRequest being added?`
      )
      alert(
        `this only happens if the SIGN_TRANSACTION qortalRequest failed... are you using the legacy UI prior to this qortalRequest being added? Please talk to developers.`
      )
      return
    }

    let txToProcess = signedKickTransaction

    const processKickTx = await processTransaction(txToProcess)

    if (typeof processKickTx === "object") {
      console.log("transaction success object:", processKickTx)
      alert(
        `${minterName} kick successfully issued! Wait for confirmation...Transaction Response: ${JSON.stringify(
          processKickTx
        )}`
      )
    } else {
      console.log("transaction raw text response:", processKickTx)
      alert(`TxResponse: ${JSON.stringify(processKickTx)}`)
    }
  } catch (error) {
    console.error("Error removing minter:", error)
    alert(`Error:${error}. Please try again.`)
  }
}

const handleBanMinter = async (minterName) => {
  let isAddress = await getAddressInfo(minterName)
  try {
    let txGroupId = 0
    // const { height: currentHeight } = await getLatestBlockInfo()
    const isBlockPassed = await featureTriggerCheck()
    if (!isBlockPassed) {
      console.log(
        `block height is under the removal featureTrigger height, using txGroupId 0`
      )
      txGroupId = 0
    } else {
      console.log(`featureTrigger block is passed, using txGroupId 694`)
      txGroupId = 694
    }
    let minterAddress
    if (!isAddress.address || isAddress.address !== minterName) {
      const minterNameInfo = await getNameInfo(minterName)
      minterAddress = minterNameInfo?.owner
    } else {
      minterAddress = minterName
    }

    if (!minterAddress) {
      alert(
        `No valid address found for minter name: ${minterName}, this should NOT have happened, please report to developers...`
      )
      return
    }
    const adminPublicKey = await getPublicKeyFromAddress(
      userState.accountAddress
    )
    const reason = "Banned by Minter Admins"
    const fee = 0.01

    const rawBanTransaction = await createGroupBanTransaction(
      minterAddress,
      adminPublicKey,
      694,
      minterAddress,
      reason,
      txGroupId,
      fee
    )

    const signedBanTransaction = await qortalRequest({
      action: "SIGN_TRANSACTION",
      unsignedBytes: rawBanTransaction,
    })

    if (!signedBanTransaction) {
      console.warn(
        `this only happens if the SIGN_TRANSACTION qortalRequest failed... are you using the legacy UI prior to this qortalRequest being added?`
      )
      alert(
        `this only happens if the SIGN_TRANSACTION qortalRequest failed... are you using the legacy UI prior to this qortalRequest being added? Please talk to developers.`
      )
      return
    }
    let txToProcess = signedBanTransaction
    const processedTx = await processTransaction(txToProcess)

    if (typeof processedTx === "object") {
      console.log("transaction success object:", processedTx)
      alert(
        `${minterName} BAN successfully issued! Wait for confirmation...Transaction Response: ${JSON.stringify(
          processedTx
        )}`
      )
    } else {
      // fallback string or something
      console.log("transaction raw text response:", processedTx)
      alert(`transaction response:${JSON.stringify(processedTx)}`)
    }
  } catch (error) {
    console.error("Error removing minter:", error)
    alert(`Error ${error}. Please try again.`)
  }
}

const getNewestAdminCommentTimestamp = async (cardIdentifier) => {
  try {
    const comments = await fetchEncryptedComments(cardIdentifier)
    if (!comments || comments.length === 0) {
      return 0
    }
    const newestTimestamp = comments.reduce((acc, comment) => {
      const cTime = comment.updated || comment.created || 0
      return cTime > acc ? cTime : acc
    }, 0)
    return newestTimestamp
  } catch (err) {
    console.error("Failed to get newest comment timestamp:", err)
    return 0
  }
}

// Create the overall Minter Card HTML -----------------------------------------------
const createEncryptedCardHTML = async (
  cardData,
  pollResults,
  cardIdentifier,
  commentCount,
  sharedBoardData = null
) => {
  const {
    minterName,
    minterAddress = "",
    creatorAddress = "",
    header,
    content,
    links,
    creator,
    timestamp,
    poll,
    topicMode,
  } = cardData
  const formattedDate = new Date(timestamp).toLocaleString()
  const minterAvatar = !topicMode ? await getMinterAvatar(minterName) : null
  const creatorAvatar = await getMinterAvatar(creator)
  // Kakashi Note: Render links through escaped data attributes and shared handlers to prevent untrusted inline injection.
  const linksHTML = links
    .map(
      (link, index) => `
    <button data-link="${qEscapeAttr(
      link
    )}" onclick="openLinkDisplayModalFromButton(this)">
      ${qEscapeHtml(`Link ${index + 1} - ${link}`)}
    </button>
  `
    )
    .join("")
  const safeMinterName = qEscapeHtml(minterName)
  const safeHeader = qEscapeHtml(header)
  const renderedContent = qRenderRichContentHtml(content)
  const safeFormattedDate = qEscapeHtml(formattedDate)
  adminBoardDecryptedCardByIdentifier.set(cardIdentifier, cardData)
  const showKickedBanned =
    document.getElementById("admin-show-kicked-banned-checkbox")?.checked ??
    false
  const showHiddenAdminCards =
    document.getElementById("admin-show-hidden-checkbox")?.checked ?? false
  const canEditCard =
    String(creator || "")
      .trim()
      .toLowerCase() ===
    String(userState?.accountName || "")
      .trim()
      .toLowerCase()
  const editButtonHtml = canEditCard
    ? `
      <button
        type="button"
        class="card-edit-button"
        title="Edit card"
        aria-label="Edit card"
        onclick="openAdminBoardCardEditor('${qEscapeAttr(cardIdentifier)}')"
      >
        <span class="mobi-mbri-edit-2" aria-hidden="true"></span>
      </button>
    `
    : ""

  const isUndefinedUser = minterName === "undefined" || minterName === "null"

  const hasTopicMode = Object.prototype.hasOwnProperty.call(
    cardData,
    "topicMode"
  )

  let showTopic = false

  const kickBanTxData =
    sharedBoardData?.kickBanTxData || (await fetchAllKickBanTxData())
  const { finalKickTxs, pendingKickTxs, finalBanTxs, pendingBanTxs } =
    kickBanTxData

  if (hasTopicMode) {
    const modeVal = cardData.topicMode
    showTopic = modeVal === true || modeVal === "true"
  } else {
    if (!isUndefinedUser) {
      showTopic = false
    }
  }
  let publishedMinterAddress = minterAddress

  if (
    publishedMinterAddress === "notYetAdded" ||
    publishedMinterAddress === "undefined" ||
    publishedMinterAddress === null ||
    !publishedMinterAddress
  ) {
    console.warn(
      `minterAddress is not published in the card data... will have to extract from minterName...`
    )
    publishedMinterAddress = null
  } else {
    const publishedMinterAddressInfo = await getAddressInfo(
      publishedMinterAddress
    )
    if (
      publishedMinterAddressInfo &&
      typeof publishedMinterAddressInfo === "object" &&
      publishedMinterAddressInfo.address
    ) {
      console.log(
        `minterAddress found in published data, and verified. Using published address for further checks.`
      )
      publishedMinterAddress = publishedMinterAddressInfo.address
    } else {
      console.warn(
        `Published minter address could not be verified for card "${cardIdentifier}", falling back to name lookup.`
      )
      publishedMinterAddress = null
    }
  }

  const minterGroupMembers =
    sharedBoardData?.minterGroupMembers || (await fetchMinterGroupMembers())
  const minterAdmins =
    sharedBoardData?.minterAdmins || (await fetchMinterGroupAdmins())
  const {
    adminYes = 0,
    adminNo = 0,
    minterYes = 0,
    minterNo = 0,
    totalYes = 0,
    totalNo = 0,
    totalYesWeight = 0,
    totalNoWeight = 0,
    detailsHtml,
    userVote = null,
  } = await processPollData(
    pollResults,
    minterGroupMembers,
    minterAdmins,
    minterName || creator,
    cardIdentifier
  )

  createModal("links")
  createModal("poll-details")

  let cardColorCode = showTopic ? "#0e1b15" : "#151f28"
  const userVoteStateClass =
    userVote === 0
      ? "card--user-vote-yes"
      : userVote === 1
      ? "card--user-vote-no"
      : ""
  const proposedIdentityLabel = showTopic ? "Topic" : "Proposed Minter Admin"

  let showRemoveHtml
  let altText = ""
  let penaltyText = ""
  let adjustmentText = ""
  let identityBoxesHtml = ""
  const creatorAddressValue =
    creatorAddress ||
    (await fetchOwnerAddressFromNameCached(creator).catch(() => ""))
  const creatorAddressInfo = creatorAddressValue
    ? await getAddressInfoCached(creatorAddressValue).catch(() => null)
    : null
  const creatorLevel = creatorAddressInfo?.level ?? null
  const shouldResolveIdentity = !showTopic && !isUndefinedUser
  const verifiedName = shouldResolveIdentity
    ? await validateMinterName(minterName)
    : null
  const addressVerification = shouldResolveIdentity
    ? await getAddressInfo(minterName)
    : null
  const verifiedAddress =
    publishedMinterAddress ||
    (addressVerification &&
    typeof addressVerification === "object" &&
    addressVerification.address
      ? addressVerification.address
      : "")

  if (verifiedName || verifiedAddress) {
    let accountInfo
    if (!verifiedAddress) {
      accountInfo = verifiedName ? await getNameInfo(verifiedName) : null
    }

    const accountAddress = verifiedAddress || accountInfo?.owner || ""
    const addressInfo = verifiedAddress
      ? addressVerification &&
        typeof addressVerification === "object" &&
        addressVerification.address
        ? addressVerification
        : null
      : accountAddress
      ? await getAddressInfo(accountAddress)
      : null
    const safeAddressInfo =
      addressInfo && typeof addressInfo === "object"
        ? addressInfo
        : {
            address: accountAddress || verifiedAddress || "",
            level: 0,
            blocksMintedPenalty: 0,
            blocksMintedAdjustment: 0,
          }
    const proposedAddressValue =
      safeAddressInfo.address || accountAddress || verifiedAddress || ""
    const proposedLevel = safeAddressInfo.level ?? null
    const minterGroupAddresses = minterGroupMembers.map((m) => m.member)
    const adminAddresses = minterAdmins.map((m) => m.member)
    const existingAdmin = adminAddresses.includes(accountAddress)
    const existingMinter = minterGroupAddresses.includes(accountAddress)

    console.log(
      `name is validated, utilizing for removal features...${verifiedName}`
    )
    penaltyText =
      safeAddressInfo.blocksMintedPenalty == 0
        ? ""
        : "<p>(has Blocks Penalty)<p>"
    adjustmentText =
      safeAddressInfo.blocksMintedAdjustment == 0
        ? ""
        : "<p>(has Blocks Adjustment)<p>"
    const removeActionsHtml = verifiedAddress
      ? await checkAndDisplayRemoveActions(
          adminYes,
          verifiedAddress,
          cardIdentifier,
          true
        )
      : await checkAndDisplayRemoveActions(
          adminYes,
          verifiedName,
          cardIdentifier
        )
    showRemoveHtml = removeActionsHtml
    identityBoxesHtml = `
      <div class="card-identity-row">
        ${buildIdentityBoxHtml(
          "Proposer",
          creator || "Unknown",
          creatorAddressValue || "",
          creatorLevel,
          creatorAvatar
        )}
        ${buildIdentityBoxHtml(
          proposedIdentityLabel,
          minterName || "Unknown",
          proposedAddressValue || "",
          proposedLevel,
          minterAvatar
        )}
      </div>
    `

    const confirmedKick = finalKickTxs.some(
      (tx) => tx.groupId === 694 && tx.member === accountAddress
    )
    const pendingKick = pendingKickTxs.some(
      (tx) => tx.groupId === 694 && tx.member === accountAddress
    )
    const confirmedBan = finalBanTxs.some(
      (tx) => tx.groupId === 694 && tx.offender === accountAddress
    )
    const pendingBan = pendingBanTxs.some(
      (tx) => tx.groupId === 694 && tx.offender === accountAddress
    )

    // If user is definitely admin (finalAdd) and not pending removal
    if (confirmedKick && !pendingKick && !existingMinter) {
      console.warn(`account was already kicked, displaying as such...`)
      cardColorCode = "rgb(29, 7, 4)"
      altText = `<h4 style="color:rgb(143, 117, 21); margin-bottom: 0.5em;">KICKED From MINTER Group</h4>`
      showRemoveHtml = ""
      if (!adminBoardState.kickedCards.has(cardIdentifier)) {
        adminBoardState.kickedCards.add(cardIdentifier)
      }
      if (!showKickedBanned) {
        console.warn(
          `kick/ban checkbox is unchecked, card is kicked, not displaying...`
        )
        return ""
      }
    }

    if (confirmedBan && !pendingBan && !pendingKick && !existingMinter) {
      console.warn(`account was already banned, displaying as such...`)
      cardColorCode = "rgb(24, 3, 3)"
      altText = `<h4 style="color:rgb(106, 2, 2); margin-bottom: 0.5em;">BANNED From MINTER Group</h4>`
      showRemoveHtml = ""
      if (!adminBoardState.bannedCards.has(cardIdentifier)) {
        adminBoardState.bannedCards.add(cardIdentifier)
      }
      if (!showKickedBanned) {
        console.warn(
          `kick/bank checkbox is unchecked, and card is banned, not displaying...`
        )
        return ""
      }
    }
  } else {
    console.log(
      `name could not be validated, assuming topic card (or some other issue with name validation) for removalActions`
    )
    showRemoveHtml = ""
    identityBoxesHtml = `
      <div class="card-identity-row">
        ${buildIdentityBoxHtml(
          "Proposer",
          creator || "Unknown",
          creatorAddressValue || "",
          creatorLevel,
          creatorAvatar
        )}
        ${buildIdentityBoxHtml(
          proposedIdentityLabel,
          minterName || "Unknown",
          publishedMinterAddress || "",
          null,
          minterAvatar
        )}
      </div>
    `
  }

  return `
    <div class="admin-card ${userVoteStateClass}" style="background-color: ${cardColorCode}">
      ${editButtonHtml}
      <div class="admin-card-header minter-card-header">
        ${identityBoxesHtml}
        <div class="card-title-box">${safeHeader}</div>
        ${penaltyText}${adjustmentText}${altText}
      </div>
    <div class="support-header"><h5>NOMINATION STATEMENT</h5></div>
    <div class="info board-rich-content ql-editor">
      ${renderedContent}
    </div>
    <div class="support-header"><h5>NOMINATION LINKS</h5></div>
    <div class="info-links">
      ${linksHTML}
    </div>
    <div class="results-header support-header"><h5>CURRENT SUPPORT RESULTS</h5></div>
    <div class="admin-card-results minter-card-results">
      <button onclick="togglePollDetails('${cardIdentifier}')">Display Poll Details</button>
      <div id="poll-details-${cardIdentifier}" style="display: none;">
        ${detailsHtml}
      </div>
      ${showRemoveHtml}
      <div class="admin-results vote-results vote-results--admin">
        <span class="admin-yes">Admin Yes: ${adminYes}</span>
        <span class="admin-no">Admin No: ${adminNo}</span>
      </div>
      <div class="minter-results vote-results vote-results--outlined">
        <span class="minter-yes">Minter Yes: ${minterYes}</span>
        <span class="minter-no">Minter No: ${minterNo}</span>
      </div>
      <div class="total-results vote-results vote-results--outlined vote-results--totals">
        <div class="vote-total-group">
          <span class="total-yes">Total Yes: ${totalYes}</span>
          <span class="vote-total-weight">Weight: ${totalYesWeight}</span>
        </div>
        <div class="vote-total-group">
          <span class="total-no">Total No: ${totalNo}</span>
          <span class="vote-total-weight">Weight: ${totalNoWeight}</span>
        </div>
      </div>
    </div>
    <div class="support-header"><h5>SUPPORT NOMINATION FOR</h5><h5 style="color: #ffae42;">${safeMinterName}</h5>
    <p style="color: #c7c7c7; font-size: .65rem; margin-top: 1vh">(click COMMENTS button to open/close card comments)</p>
    </div>
    <div class="actions">
      <div class="actions-buttons">
        <button class="yes" onclick="voteYesOnPoll('${poll}')">YES</button>
        <button id="comment-button-${cardIdentifier}" data-comment-count="${commentCount}" class="comment" onclick="toggleEncryptedComments('${cardIdentifier}')">COMMENTS (${commentCount})</button>
        <button class="no" onclick="voteNoOnPoll('${poll}')">NO</button>
      </div>
    </div>
    <div id="comments-section-${cardIdentifier}" class="comments-section" style="display: none; margin-top: 20px;">
      <div id="comments-container-${cardIdentifier}" class="comments-container"></div>
      ${
        typeof getBoardCommentComposerHtml === "function"
          ? getBoardCommentComposerHtml(cardIdentifier)
          : `<textarea id="new-comment-${cardIdentifier}" placeholder="Input your comment..." style="width: 100%; margin-top: 10px;"></textarea>`
      }
      ${
        typeof getBoardCommentActionBarHtml === "function"
          ? getBoardCommentActionBarHtml(cardIdentifier, "postEncryptedComment")
          : `<button onclick="postEncryptedComment('${cardIdentifier}')">Post Comment</button>`
      }
    </div>
    <p class="card-published-date">Published ${safeFormattedDate}</p>
  </div>
  `
}
