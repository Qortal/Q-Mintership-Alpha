// // NOTE - Change isTestMode to false prior to actual release ---- !important - You may also change identifier if you want to not show older cards.
const testMode = false
const minterCardIdentifierPrefix = "Minter-board-card"
const minterBoardPublishEditorKey = "minter-card-content"
let isExistingCard = false
let existingCardData = {}
let existingCardIdentifier = ""
const MINTER_GROUP_ID = 694
const MIN_ADMIN_YES_VOTES = 9
const GROUP_APPROVAL_FEATURE_TRIGGER_HEIGHT = 2012800 //TODO update this to correct featureTrigger height when known, either that, or pull from core.
let featureTriggerPassed = false
let isApproved = false

let cachedMinterAdmins
let cachedMinterGroup
let minterBoardPublishInProgress = false
// Kakashi Note: Batch size tuned for progressive rendering so cards appear quickly without overloading QDN requests.
const MINTER_SCROLL_BATCH_SIZE = 12
const minterBoardInfiniteState = {
  loadToken: 0,
  cards: [],
  cursor: 0,
  inFlight: false,
  complete: false,
  isARBoard: false,
  showExisting: false,
  displayedCount: 0,
  mintedCount: 0,
  totalCount: 0,
  isBackgroundLoading: false,
  counterSpan: null,
  container: null,
  scrollHandler: null,
  backgroundRunnerToken: 0,
}
const minterBoardSearchCacheByPrefix = new Map()
const minterBoardCardDataCache = new Map()
const minterBoardCardDataByIdentifier = new Map()
const optimisticMinterBoardCardCache = new Map()
const optimisticMinterBoardCommentCache = new Map()
const minterAvatarMarkupCache = new Map()
const MINTER_BOARD_UPDATE_CHECK_INTERVAL_MS = 60000
const MINTER_NOTIFICATION_SETTINGS_IDENTIFIER_PREFIX =
  "Mintership-notification-settings-v1"
const MINTER_NOTIFICATION_STATE_IDENTIFIER_PREFIX =
  "Mintership-notification-state-v1"
const MINTER_NOTIFICATION_EVENT_IDENTIFIER_PREFIX =
  "Mintership-notification-event-v1"
const MINTER_NOTIFICATION_QMAIL_IDENTIFIER_PREFIX = "_mail_qortal_qmail_"
const MINTER_NOTIFICATION_GROUP_NAME = "Q-Mintership-NOTIFICATIONS"
const MINTER_NOTIFICATION_GROUP_ID = 1099
const MINTER_NOTIFICATION_SCHEMA_VERSION = 1
const minterBoardUpdateState = {
  timer: null,
  inFlight: false,
  cardSnapshot: new Map(),
  commentSnapshot: new Map(),
  pollSnapshot: new Map(),
  pending: null,
}
const minterBoardNotificationSettingsCache = {
  timestamp: 0,
  data: [],
}
const MINTER_NOTIFICATION_SETTINGS_CACHE_TTL_MS = 60000
const MINTER_NOTIFICATION_STATE_CACHE_TTL_MS = 60000
const DEFAULT_MINTER_NOTIFICATION_EVENTS = {
  comment: true,
  reply: true,
  admin_vote: true,
  minter_vote: true,
  user_vote: true,
  invite_created: true,
  group_approval: true,
  joined: true,
}
const normalizeMinterNotificationGroupId = (value) => {
  const parsed = Number(String(value ?? "").trim())
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
const resolveMinterNotificationBroadcastGroupId = () =>
  MINTER_NOTIFICATION_GROUP_ID
const minterBoardNotificationDeliveryState = {
  batch: null,
  isPublishing: false,
}
const minterBoardNotificationStateCache = {
  timestamp: 0,
  data: [],
}
const minterBoardNotificationGroupMembershipState = {
  timestamp: 0,
  accountAddress: "",
  isMember: false,
  inFlight: false,
}
const MINTER_NOTIFICATION_GROUP_MEMBERSHIP_CACHE_TTL_MS = 60000

const getMinterBoardDisplayMode = () => {
  const displayModeSelect = document.getElementById("display-mode-select")
  return displayModeSelect?.value === "list" ? "list" : "cards"
}

const loadMinterBoardPage = async () => {
  // Kakashi Note: Remove existing board scroll listeners before loading this page to prevent duplicate lazy-load triggers.
  if (typeof detachAdminBoardInfiniteScroll === "function") {
    detachAdminBoardInfiniteScroll()
  }
  if (typeof detachMinterBoardInfiniteScroll === "function") {
    detachMinterBoardInfiniteScroll()
  }
  stopMinterBoardBackgroundUpdateChecks()

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
  const publishButtonColor = "#527c9d"
  const minterBoardNameColor = "#527c9d"
  // Kakashi Note: Nomination flow captures nominee identity separately from the publishing minter.
  mainContent.innerHTML = `
    <div class="minter-board-main" style="text-align: center;">
  
      <!-- Board Title + Intro -->
      <h1 style="color:rgb(194, 221, 241);">The Minter Board</h1>
      <div class="minter-steps">
        <article class="minter-step-card">
          <span class="minter-step-card-index">1</span>
          <div class="minter-step-card-copy">
            <h4>Your Nominator Creates a Minter Card for You that Goes up for Discussion + Vote. Note - ONE Minting Account Per Person.</h4>
          </div>
        </article>
        <article class="minter-step-card">
          <span class="minter-step-card-index">2</span>
          <div class="minter-step-card-copy">
            <h4>Community + Minter Admins Comment & Vote. A GROUP_APPROVAL invite from Minter Admins to MINTER Group is Created if Successful.</h4>
          </div>
        </article>
        <article class="minter-step-card">
          <span class="minter-step-card-index">3</span>
          <div class="minter-step-card-copy">
            <h4>Check Back Frequently and See the Current Status, and Accept Your Invite Upon Success.</h4>
          </div>
        </article>
      </div>

      <div class="card-display-options">
        <div class="options-header">
          <h4 class="options-heading">DISPLAY SETTINGS</h4>
          <p class="options-subheading">Choose how the board is sorted and filtered.</p>
        </div>
        <div class="options-grid">
          <label class="options-field" for="display-mode-select">
            <span class="options-label">Display mode</span>
            <select id="display-mode-select" class="options-select">
              <option value="cards" selected>Card Grid</option>
              <option value="list">List Mode</option>
            </select>
          </label>

          <label class="options-field" for="sort-select">
            <span class="options-label">Sort cards by</span>
            <select id="sort-select" class="options-select">
              <option value="newest" selected>Date</option>
              <option value="name">Nominee Name</option>
              <option value="publisher-name">Publisher Name</option>
              <option value="recent-comments">Newest Comments</option>
              <option value="least-votes">Least Votes</option>
              <option value="most-votes">Most Votes</option>
            </select>
          </label>

          <label class="options-field" for="time-range-select">
            <span class="options-label">Show cards from</span>
            <select id="time-range-select" class="options-select">
              <option value="0">SHOW ALL</option>
              <option value="1">...Within Last 1 Day</option>
              <option value="7">...Within Last 7 Days</option>
              <option value="30">...Within 30 Days</option>
              <option value="45" selected>...Within Last 45 Days</option>
              <option value="60">...Within 60 Days</option>
              <option value="90">...Within 90 Days</option>
            </select>
          </label>

          <label class="options-toggle">
            <input type="checkbox" id="show-existing-checkbox" />
            <span>Show Existing Minter Cards (History)</span>
          </label>

          <button type="button" id="notification-settings-button" class="notification-settings-button">
            Notification Settings
          </button>
          <button type="button" id="notification-review-button" class="notification-settings-button" hidden>
            Pending Notifications
          </button>
        </div>
        <div id="notification-group-prompt" class="notification-group-prompt" hidden></div>
      </div>
        <!-- Card counter heading centered, with actual counter below if desired -->
        <div style="margin-bottom: 1em;">
          <div style="text-align: center; margin-top: 0.5em;">
            <span id="board-card-counter" style="font-size: 1rem; color:rgb(153, 203, 204); padding: 0.5em;">
              <!-- e.g. "5 cards found" -->
            </span>
          </div>
        </div>

        <!-- Row for Publish / Refresh actions -->
        <div class="card-actions" style="margin-bottom: 1em;">
          <button id="publish-card-button" class="publish-card-button">
            CREATE NOMINATION
          </button>
          <button id="refresh-cards-button" class="refresh-cards-button"
            style="padding: 1vh;">
            REFRESH
          </button>
        </div>

        <div id="board-update-banner" class="board-update-banner" hidden></div>

        <!-- Container for displayed cards -->
        <div id="cards-container" class="cards-container" style="margin-top: 2vh;"></div>

        <!-- Hidden Publish Card Form -->
        <div id="publish-card-view" class="publish-card-view" style="display: none; text-align: left;">
          <form id="publish-card-form" class="publish-card-form">
            <h3>Create or Update a Nomination Card</h3>
            <label for="nominee-name-input">Nominee Name or Address:</label>
            <input type="text" id="nominee-name-input" maxlength="100" placeholder="Enter nominee name or address" required>
            <label for="card-header">Nomination Summary:</label>
            <input type="text" id="card-header" maxlength="100" placeholder="Summarize why you are nominating this person" required>

            <label>Nomination Statement:</label>
            ${
              typeof getBoardRichTextComposerHtml === "function"
                ? getBoardRichTextComposerHtml(
                    minterBoardPublishEditorKey,
                    "richtext-compose publish-compose"
                  )
                : `<textarea id="card-content" placeholder="Share why this nominee should be considered for minting privileges. Include relevant context, contributions, and anything voters should review." required></textarea>`
            }

            <label for="card-links">Links (qortal://...):</label>
            <div id="links-container">
              <input type="text" class="card-link" placeholder="Enter QDN link">
            </div>
            <button type="button" id="add-link-button">Add Another Link</button>
            <button type="submit" id="submit-publish-button">PUBLISH</button>
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
  createScrollToTopButton()

  document
    .getElementById("publish-card-button")
    .addEventListener("click", async () => {
      isExistingCard = false
      existingCardData = {}
      existingCardIdentifier = ""
      const publishForm = document.getElementById("publish-card-form")
      publishForm.reset()
      const linksContainer = document.getElementById("links-container")
      linksContainer.innerHTML = `<input type="text" class="card-link" placeholder="Enter QDN link">`
      const publishCardView = document.getElementById("publish-card-view")
      publishCardView.style.display = "flex"
      document.getElementById("cards-container").style.display = "none"
      if (typeof ensureBoardRichTextEditor === "function") {
        ensureBoardRichTextEditor(
          minterBoardPublishEditorKey,
          "Share why this nominee should be considered for minting privileges."
        )
        clearBoardRichTextEditor(minterBoardPublishEditorKey)
      }
      const submitButton = document.getElementById("submit-publish-button")
      if (submitButton) {
        submitButton.textContent = "PUBLISH"
      }
    })

  document
    .getElementById("refresh-cards-button")
    .addEventListener("click", async () => {
      // Update the caches to include any new changes (e.g. new minters)
      await initializeCachedGroups()

      // Optionally show a "refreshing" message
      const cardsContainer = document.getElementById("cards-container")
      cardsContainer.innerHTML = getBoardLoadingHTML("Refreshing cards...")
      hideMinterBoardUpdateBanner()

      // Then reload the cards with the updated cache data
      await loadCards(minterCardIdentifierPrefix, true)
    })

  document
    .getElementById("cancel-publish-button")
    .addEventListener("click", async () => {
      const publishForm = document.getElementById("publish-card-form")
      if (publishForm) {
        publishForm.reset()
      }
      if (typeof clearBoardRichTextEditor === "function") {
        clearBoardRichTextEditor(minterBoardPublishEditorKey)
      }
      const cardsContainer = document.getElementById("cards-container")
      cardsContainer.style.display = "flex" // Restore visibility
      const publishCardView = document.getElementById("publish-card-view")
      publishCardView.style.display = "none" // Hide the publish form
      isExistingCard = false
      existingCardData = {}
      existingCardIdentifier = ""
      const submitButton = document.getElementById("submit-publish-button")
      if (submitButton) {
        submitButton.textContent = "PUBLISH"
      }
    })

  document
    .getElementById("add-link-button")
    .addEventListener("click", async () => {
      const linksContainer = document.getElementById("links-container")
      const newLinkInput = document.createElement("input")
      newLinkInput.type = "text"
      newLinkInput.className = "card-link"
      newLinkInput.placeholder = "Enter QDN link"
      linksContainer.appendChild(newLinkInput)
    })

  document
    .getElementById("publish-card-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault()
      await publishCard(minterCardIdentifierPrefix)
    })

  document
    .getElementById("time-range-select")
    .addEventListener("change", async () => {
      // Re-load the cards whenever user chooses a new sort option.
      await loadCards(minterCardIdentifierPrefix)
    })

  document
    .getElementById("sort-select")
    .addEventListener("change", async () => {
      // Re-load the cards whenever user chooses a new sort option.
      await loadCards(minterCardIdentifierPrefix)
    })

  document
    .getElementById("display-mode-select")
    .addEventListener("change", async () => {
      await loadCards(minterCardIdentifierPrefix)
    })

  const showExistingCardsCheckbox = document.getElementById(
    "show-existing-checkbox"
  )
  if (showExistingCardsCheckbox) {
    showExistingCardsCheckbox.addEventListener("change", async (event) => {
      await loadCards(minterCardIdentifierPrefix)
    })
  }
  document
    .getElementById("notification-settings-button")
    .addEventListener("click", async () => {
      await openMinterNotificationSettingsModal()
    })
  document
    .getElementById("notification-review-button")
    .addEventListener("click", async () => {
      if (minterBoardNotificationDeliveryState.batch) {
        await openMinterNotificationDeliveryModal(
          minterBoardNotificationDeliveryState.batch
        )
      }
    })
  refreshMinterNotificationReviewButton()
  await refreshMinterNotificationGroupPrompt()
  //Initialize Minter Group and Admin Group
  await initializeCachedGroups()

  await featureTriggerCheck()
  await loadCards(minterCardIdentifierPrefix)
}

const initializeCachedGroups = async () => {
  try {
    const [minterGroup, minterAdmins] = await Promise.all([
      fetchMinterGroupMembers(),
      fetchMinterGroupAdmins(),
    ])
    cachedMinterGroup = minterGroup
    cachedMinterAdmins = minterAdmins
  } catch (error) {
    console.error("Error initializing cached groups:", error)
  }
}

const runWithConcurrency = async (tasks, concurrency = 5) => {
  const results = []
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

const resolvedMinterNameByIdentifierCache = new Map()
const getSingleSearchResource = (result) => {
  if (!result) return null
  return Array.isArray(result) ? result[0] || null : result
}

const extractMinterCardsMinterName = async (cardIdentifier) => {
  if (resolvedMinterNameByIdentifierCache.has(cardIdentifier)) {
    return resolvedMinterNameByIdentifierCache.get(cardIdentifier)
  }
  // Ensure the identifier starts with the prefix
  if (
    !cardIdentifier.startsWith(minterCardIdentifierPrefix) &&
    !cardIdentifier.startsWith(addRemoveIdentifierPrefix)
  ) {
    throw new Error("minterCard does not match identifier check")
  }
  // Split the identifier into parts
  const parts = cardIdentifier.split("-")
  // Ensure the format has at least 3 parts
  if (parts.length < 3) {
    throw new Error("Invalid identifier format")
  }
  try {
    if (cardIdentifier.startsWith(minterCardIdentifierPrefix)) {
      const searchSimpleResults = await searchSimple(
        "BLOG_POST",
        `${cardIdentifier}`,
        "",
        1,
        0,
        "",
        false,
        true
      )
      const resource = getSingleSearchResource(searchSimpleResults)
      if (!resource || !resource.name) {
        throw new Error(
          `No publisher found for minter card identifier ${cardIdentifier}`
        )
      }

      const publisherName = resource.name
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: publisherName,
        service: "BLOG_POST",
        identifier: cardIdentifier,
      })
      // Kakashi Note: Dedupe identity follows the nominee, with publisher fallback for legacy cards.
      const nomineeName = getCardNomineeName(cardDataResponse)
      const resolvedName = nomineeName || publisherName
      resolvedMinterNameByIdentifierCache.set(cardIdentifier, resolvedName)
      return resolvedName
    } else if (cardIdentifier.startsWith(addRemoveIdentifierPrefix)) {
      const searchSimpleResults = await searchSimple(
        "BLOG_POST",
        `${cardIdentifier}`,
        "",
        1,
        0,
        "",
        false,
        true
      )
      const resource = getSingleSearchResource(searchSimpleResults)
      if (!resource || !resource.name) {
        throw new Error(
          `No publisher found for AR card identifier ${cardIdentifier}`
        )
      }
      const publisherName = resource.name
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: publisherName,
        service: "BLOG_POST",
        identifier: cardIdentifier,
      })
      const minterName = cardDataResponse.minterName
      if (minterName) {
        resolvedMinterNameByIdentifierCache.set(cardIdentifier, minterName)
        return minterName
      } else {
        console.warn(
          `Identifier ${cardIdentifier} is missing minterName. Falling back to publisher name.`
        )
        resolvedMinterNameByIdentifierCache.set(cardIdentifier, publisherName)
        return publisherName
      }
    }
  } catch (error) {
    throw error
  }
}

const groupAndLabelByIdentifier = (allCards) => {
  // Group by identifier
  const mapById = new Map()
  allCards.forEach((card) => {
    if (!mapById.has(card.identifier)) {
      mapById.set(card.identifier, [])
    }
    mapById.get(card.identifier).push(card)
  })
  // For each identifier's group, sort oldest->newest so the first is "master"
  const output = []
  for (const [identifier, group] of mapById.entries()) {
    group.sort((a, b) => {
      const aTime = a.created || 0
      const bTime = b.created || 0
      return aTime - bTime // oldest first
    })
    // Mark the first as master
    group[0].isMaster = true
    // The rest are updates
    for (let i = 1; i < group.length; i++) {
      group[i].isMaster = false
    }
    // push them all to output
    output.push(...group)
  }

  return output
}

const groupByIdentifierOldestFirst = (allCards) => {
  // map of identifier => array of cards
  const mapById = new Map()

  allCards.forEach((card) => {
    if (!mapById.has(card.identifier)) {
      mapById.set(card.identifier, [])
    }
    mapById.get(card.identifier).push(card)
  })
  // sort each group oldest->newest
  for (const [identifier, group] of mapById.entries()) {
    group.sort((a, b) => {
      const aTime = a.created || 0
      const bTime = b.created || 0
      return aTime - bTime // oldest first
    })
  }

  return mapById
}

const buildMinterNameGroups = async (mapById) => {
  // We'll build an array of objects: { minterName, cards }
  // Then we can combine any that share the same minterName.
  const nameGroups = []

  for (let [identifier, group] of mapById.entries()) {
    // group[0] is the oldest => "master" card
    let masterCard = group[0]
    // Filter out any cards that are not published by the 'masterPublisher'
    const masterPublisherName = masterCard.name
    // Remove any cards in this identifier group that have a different publisherName
    const filteredGroup = group.filter((c) => c.name === masterPublisherName)
    // If filtering left zero cards, skip entire group
    if (!filteredGroup.length) {
      console.warn(
        `All cards removed for identifier=${identifier} (different publishers). Skipping.`
      )
      continue
    }
    // Reassign group to the filtered version, then re-define masterCard
    group = filteredGroup
    masterCard = group[0] // oldest after filtering
    // attempt to obtain minterName from the master card
    let masterMinterName
    try {
      masterMinterName = await extractMinterCardsMinterName(
        masterCard.identifier
      )
    } catch (err) {
      console.warn(
        `Skipping entire group ${identifier}, no valid minterName from master`,
        err
      )
      continue
    }
    // Store an object with the minterName we extracted, plus all cards in that group
    nameGroups.push({
      minterName: masterMinterName,
      cards: group, // includes the master & updates
    })
  }
  // Combine them: minterName => array of *all* cards from all matching groups
  const combinedMap = new Map()
  for (const entry of nameGroups) {
    const mName = entry.minterName
    if (!combinedMap.has(mName)) {
      combinedMap.set(mName, [])
    }
    combinedMap.get(mName).push(...entry.cards)
  }

  return combinedMap
}

const getNewestCardPerMinterName = (combinedMap) => {
  // We'll produce an array of the newest card for each minterName, this will be utilized as the 'final filter' to display cards published/updated by unique minters.
  const finalOutput = []

  for (const [mName, cardArray] of combinedMap.entries()) {
    // sort by updated or created, descending => newest first
    cardArray.sort((a, b) => {
      const aTime = a.updated || a.created || 0
      const bTime = b.updated || b.created || 0
      return bTime - aTime
    })
    // newest is [0]
    finalOutput.push(cardArray[0])
  }
  // Then maybe globally sort them newest first
  finalOutput.sort((a, b) => {
    const aTime = a.updated || a.created || 0
    const bTime = b.updated || b.created || 0
    return bTime - aTime
  })

  return finalOutput
}

const processMinterBoardCards = async (allValidCards) => {
  // group by identifier, sorted oldest->newest
  const mapById = groupByIdentifierOldestFirst(allValidCards)
  // build a map of minterName => all cards from those identifiers
  const minterNameMap = await buildMinterNameGroups(mapById)
  // from that map, keep only the single newest card per minterName
  const newestCards = getNewestCardPerMinterName(minterNameMap)
  // return final array of all newest cards
  return newestCards
}

const processARBoardCards = async (allValidCards) => {
  const mapById = groupByIdentifierOldestFirst(allValidCards)
  // build a map of minterName => all cards from those identifiers
  const mapByName = await buildMinterNameGroups(mapById)
  // For each minterName group, we might want to sort them newest->oldest
  const finalOutput = []
  for (const [minterName, group] of mapByName.entries()) {
    group.sort((a, b) => {
      const aTime = a.updated || a.created || 0
      const bTime = b.updated || b.created || 0
      return bTime - aTime
    })

    // Both resolution for the duplicate QuickMythril card, and handling of all future duplicates that may be published...
    if (group[0].identifier === "QM-AR-card-Xw3dxL") {
      console.warn(
        `This is a bug that allowed a duplicate prior to the logic displaying them based on original publisher only... displaying in reverse order...`
      )
      group[0].isDuplicate = true
      for (let i = 1; i < group.length; i++) {
        group[i].isDuplicate = false
      }
    } else {
      group[0].isDuplicate = false
      for (let i = 1; i < group.length; i++) {
        group[i].isDuplicate = true
      }
    }
    // push them all
    finalOutput.push(...group)
  }
  // Sort final by newest overall
  finalOutput.sort((a, b) => {
    const aTime = a.updated || a.created || 0
    const bTime = b.updated || b.created || 0
    return bTime - aTime
  })

  return finalOutput
}

const getCardNomineeName = (cardData = {}, fallback = "") =>
  cardData?.nominee || cardData?.creator || fallback
const getCardNomineeAddress = (cardData = {}, fallback = "") =>
  cardData?.nomineeAddress || cardData?.creatorAddress || fallback
const getCardNominatorName = (cardData = {}, fallback = "") =>
  cardData?.nominator || cardData?.publishedBy || fallback
const getCardNominatorAddress = (cardData = {}, fallback = "") =>
  cardData?.nominatorAddress || cardData?.publishedByAddress || fallback

const resolveCardNomineeAddress = async (cardResource, cardData) => {
  // Kakashi Note: Prefer the published nominee address for level and invite checks; fallback paths keep legacy payloads compatible.
  const nomineeAddress = getCardNomineeAddress(cardData)
  if (nomineeAddress) {
    return nomineeAddress
  }
  const nomineeName = getCardNomineeName(cardData)
  if (nomineeName) {
    const ownerFromNominee = await fetchOwnerAddressFromNameCached(nomineeName)
    if (ownerFromNominee) {
      return ownerFromNominee
    }
  }
  return await fetchOwnerAddressFromNameCached(cardResource.name)
}

const getBoardResourceTimestamp = (resource) =>
  resource?.updated || resource?.created || 0
const getBoardResourceCacheKey = (resource) =>
  `${resource?.name || ""}::${
    resource?.identifier || ""
  }::${getBoardResourceTimestamp(resource)}`
const getBoardResourceIdentityKey = (resource) =>
  `${resource?.name || ""}::${resource?.identifier || ""}`
const getOptimisticMinterBoardCardCacheKey = (publisherName, cardIdentifier) =>
  `${publisherName || ""}::${cardIdentifier || ""}`
const getOptimisticMinterBoardCommentCacheKey = (
  publisherName,
  commentIdentifier
) => `${publisherName || ""}::${commentIdentifier || ""}`

const rememberOptimisticMinterBoardCard = (
  cardIdentifierPrefix,
  publisherName,
  cardIdentifier,
  cardData,
  timestamp = Date.now()
) => {
  if (!cardIdentifierPrefix || !publisherName || !cardIdentifier || !cardData)
    return

  const resource = {
    name: publisherName,
    service: "BLOG_POST",
    identifier: cardIdentifier,
    created: timestamp,
    updated: timestamp,
    _optimisticCard: true,
    _cardIdentifierPrefix: cardIdentifierPrefix,
  }
  const cacheKey = getOptimisticMinterBoardCardCacheKey(
    publisherName,
    cardIdentifier
  )
  optimisticMinterBoardCardCache.set(cacheKey, {
    cardIdentifierPrefix,
    resource,
    cardData: {
      ...cardData,
      _optimisticPending: true,
    },
  })
  resolvedMinterNameByIdentifierCache.set(
    cardIdentifier,
    getCardNomineeName(cardData, publisherName)
  )
}

const getOptimisticMinterBoardResources = (
  cardIdentifierPrefix,
  afterTime = 0,
  existingResourcesByIdentity = new Map()
) => {
  const resources = []
  for (const [cacheKey, entry] of optimisticMinterBoardCardCache.entries()) {
    if (
      !entry ||
      entry.cardIdentifierPrefix !== cardIdentifierPrefix ||
      !entry.resource
    )
      continue
    const resourceTimestamp = getBoardResourceTimestamp(entry.resource)
    if (afterTime > 0 && resourceTimestamp < afterTime) continue

    const identityKey = getBoardResourceIdentityKey(entry.resource)
    const existingResource = existingResourcesByIdentity.get(identityKey)
    const existingTimestamp = getBoardResourceTimestamp(existingResource)
    if (existingResource && existingTimestamp >= resourceTimestamp) {
      optimisticMinterBoardCardCache.delete(cacheKey)
      continue
    }

    resources.push(entry.resource)
  }
  return resources
}

const getMinterBoardSearchCacheEntry = (cardIdentifierPrefix) => {
  if (!minterBoardSearchCacheByPrefix.has(cardIdentifierPrefix)) {
    minterBoardSearchCacheByPrefix.set(cardIdentifierPrefix, {
      resourcesByKey: new Map(),
      maxDaysCovered: 0,
      hasAllRange: false,
    })
  }
  return minterBoardSearchCacheByPrefix.get(cardIdentifierPrefix)
}

const fetchCachedBoardSearchResources = async (
  cardIdentifierPrefix,
  dayRange,
  afterTime,
  forceSearch = false
) => {
  const cacheEntry = getMinterBoardSearchCacheEntry(cardIdentifierPrefix)
  if (forceSearch) {
    cacheEntry.resourcesByKey.clear()
    cacheEntry.maxDaysCovered = 0
    cacheEntry.hasAllRange = false
  }

  const cacheCoversRange =
    dayRange === 0
      ? cacheEntry.hasAllRange
      : cacheEntry.hasAllRange || cacheEntry.maxDaysCovered >= dayRange

  if (!cacheCoversRange) {
    const fetched = await searchSimple(
      "BLOG_POST",
      cardIdentifierPrefix,
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
      cacheEntry.resourcesByKey.set(
        getBoardResourceCacheKey(resource),
        resource
      )
    }
    if (dayRange === 0) {
      cacheEntry.hasAllRange = true
    } else {
      cacheEntry.maxDaysCovered = Math.max(cacheEntry.maxDaysCovered, dayRange)
    }
  }

  const allCached = Array.from(cacheEntry.resourcesByKey.values())
  const existingResourcesByIdentity = new Map(
    allCached.map((resource) => [
      getBoardResourceIdentityKey(resource),
      resource,
    ])
  )
  const optimisticResources = getOptimisticMinterBoardResources(
    cardIdentifierPrefix,
    afterTime,
    existingResourcesByIdentity
  )
  const mergedCached = [...optimisticResources, ...allCached]
  if (afterTime > 0) {
    return mergedCached.filter(
      (resource) => getBoardResourceTimestamp(resource) >= afterTime
    )
  }
  return mergedCached
}

const fetchMinterBoardCardDataCached = async (cardResource) => {
  const optimisticEntry = optimisticMinterBoardCardCache.get(
    getOptimisticMinterBoardCardCacheKey(
      cardResource?.name,
      cardResource?.identifier
    )
  )
  if (optimisticEntry?.cardData) {
    return optimisticEntry.cardData
  }

  const cacheKey = getBoardResourceCacheKey(cardResource)
  if (minterBoardCardDataCache.has(cacheKey)) {
    return minterBoardCardDataCache.get(cacheKey)
  }
  const data = await qortalRequest({
    action: "FETCH_QDN_RESOURCE",
    name: cardResource.name,
    service: "BLOG_POST",
    identifier: cardResource.identifier,
  })
  minterBoardCardDataCache.set(cacheKey, data)
  return data
}

const rememberOptimisticMinterBoardComment = (
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
    service: "BLOG_POST",
    identifier: commentIdentifier,
    created: timestamp,
    updated: timestamp,
    _optimisticComment: true,
    _cardIdentifier: cardIdentifier,
  }
  optimisticMinterBoardCommentCache.set(
    getOptimisticMinterBoardCommentCacheKey(publisherName, commentIdentifier),
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

const getOptimisticMinterBoardComments = (
  cardIdentifier,
  existingResourcesByIdentity = new Map()
) => {
  const comments = []
  for (const [cacheKey, entry] of optimisticMinterBoardCommentCache.entries()) {
    if (!entry || entry.cardIdentifier !== cardIdentifier || !entry.resource)
      continue

    const identityKey = getBoardResourceIdentityKey(entry.resource)
    const existingResource = existingResourcesByIdentity.get(identityKey)
    const existingTimestamp = getBoardResourceTimestamp(existingResource)
    const optimisticTimestamp = getBoardResourceTimestamp(entry.resource)
    if (existingResource && existingTimestamp >= optimisticTimestamp) {
      optimisticMinterBoardCommentCache.delete(cacheKey)
      continue
    }

    comments.push(entry.resource)
  }
  return comments
}

const fetchMinterBoardCommentData = async (commentResource) => {
  const optimisticEntry = optimisticMinterBoardCommentCache.get(
    getOptimisticMinterBoardCommentCacheKey(
      commentResource?.name,
      commentResource?.identifier
    )
  )
  if (optimisticEntry?.commentData) {
    return optimisticEntry.commentData
  }

  return await qortalRequest({
    action: "FETCH_QDN_RESOURCE",
    name: commentResource.name,
    service: "BLOG_POST",
    identifier: commentResource.identifier,
  })
}

const detachMinterBoardInfiniteScroll = () => {
  if (minterBoardInfiniteState.scrollHandler) {
    window.removeEventListener("scroll", minterBoardInfiniteState.scrollHandler)
    minterBoardInfiniteState.scrollHandler = null
  }
  stopMinterBoardBackgroundUpdateChecks()
}

const getMinterBoardUpdateResourceSignature = (resources = []) => {
  const safeResources = Array.isArray(resources) ? resources : []
  const newestTimestamp = safeResources.reduce((newest, resource) => {
    const timestamp = getBoardResourceTimestamp(resource)
    return timestamp > newest ? timestamp : newest
  }, 0)
  return {
    count: safeResources.length,
    newestTimestamp,
  }
}

const setMinterBoardCardSnapshot = (resources = []) => {
  minterBoardUpdateState.cardSnapshot = new Map(
    (Array.isArray(resources) ? resources : []).map((resource) => [
      getBoardResourceIdentityKey(resource),
      getBoardResourceTimestamp(resource),
    ])
  )
}

const rememberMinterBoardCommentSnapshot = (cardIdentifier, resources = []) => {
  const normalizedIdentifier = String(cardIdentifier || "").trim()
  if (!normalizedIdentifier) return
  minterBoardUpdateState.commentSnapshot.set(
    normalizedIdentifier,
    getMinterBoardUpdateResourceSignature(resources)
  )
}

const getMinterBoardPollSignature = (pollResults = null) => {
  if (!pollResults || !Array.isArray(pollResults.votes)) {
    return { voteCount: 0, voteWeightKey: "" }
  }
  const voteWeightKey = Array.isArray(pollResults.voteWeights)
    ? pollResults.voteWeights
        .map(
          (weight) => `${weight?.optionName || ""}:${weight?.voteWeight || 0}`
        )
        .join("|")
    : ""
  return {
    voteCount: pollResults.votes.length,
    voteWeightKey,
  }
}

const rememberMinterBoardPollSnapshot = (pollName, pollResults = null) => {
  const normalizedPollName = String(pollName || "").trim()
  if (!normalizedPollName) return
  minterBoardUpdateState.pollSnapshot.set(
    normalizedPollName,
    getMinterBoardPollSignature(pollResults)
  )
}

const hideMinterBoardUpdateBanner = () => {
  minterBoardUpdateState.pending = null
  const banner = document.getElementById("board-update-banner")
  if (!banner) return
  banner.hidden = true
  banner.innerHTML = ""
}

const showMinterBoardUpdateBanner = (summary = {}) => {
  const banner = document.getElementById("board-update-banner")
  if (!banner) return

  const newCards = Number(summary.cards || 0)
  const updatedCards = Number(summary.updatedCards || 0)
  const commentCards = Number(summary.commentCards || 0)
  const dataTypes = []
  if (newCards > 0) {
    dataTypes.push(`${newCards} new nomination${newCards === 1 ? "" : "s"}`)
  }
  if (updatedCards > 0) {
    dataTypes.push(
      `${updatedCards} updated nomination${updatedCards === 1 ? "" : "s"}`
    )
  }
  if (commentCards > 0) {
    dataTypes.push(
      `new comments on ${commentCards} card${commentCards === 1 ? "" : "s"}`
    )
  }
  const pollCards = Number(summary.pollCards || 0)
  if (pollCards > 0) {
    dataTypes.push(
      `vote updates on ${pollCards} card${pollCards === 1 ? "" : "s"}`
    )
  }

  const dataLabel = dataTypes.length ? dataTypes.join(", ") : "new board data"
  minterBoardUpdateState.pending = summary
  banner.innerHTML = `
    <div class="board-update-banner-copy">
      <strong>New data found</strong>
      <span>${qEscapeHtml(
        dataLabel
      )} found. Load new data to update this board.</span>
    </div>
    <button type="button" class="board-update-banner-button" onclick="loadMinterBoardDetectedUpdates()">
      Load New Data
    </button>
  `
  banner.hidden = false
}

const fetchMinterBoardLiveCommentResources = async (cardIdentifier) => {
  const response = await searchSimple(
    "BLOG_POST",
    `comment-${cardIdentifier}`,
    "",
    0,
    0,
    "",
    "false"
  )
  return Array.isArray(response) ? response : []
}

const checkMinterBoardForUpdates = async () => {
  if (minterBoardUpdateState.inFlight) return
  const cardsContainer = document.getElementById("cards-container")
  if (!cardsContainer || !document.body.contains(cardsContainer)) {
    stopMinterBoardBackgroundUpdateChecks()
    return
  }

  minterBoardUpdateState.inFlight = true
  try {
    let afterTime = 0
    const timeRangeSelect = document.getElementById("time-range-select")
    const days = parseInt(timeRangeSelect?.value || "0", 10)
    if (!Number.isNaN(days) && days > 0) {
      afterTime = Date.now() - days * 24 * 60 * 60 * 1000
    }

    const liveCardResults = await searchSimple(
      "BLOG_POST",
      minterCardIdentifierPrefix,
      "",
      0,
      0,
      "",
      false,
      true,
      afterTime
    )
    const liveCardCandidates = Array.isArray(liveCardResults)
      ? liveCardResults
      : []
    const liveCards = (
      await Promise.all(
        liveCardCandidates.map(async (resource) =>
          (await validateCardStructure(resource)) ? resource : null
        )
      )
    ).filter(Boolean)
    const currentCardSnapshot = minterBoardUpdateState.cardSnapshot
    let newCards = 0
    let updatedCards = 0
    liveCards.forEach((resource) => {
      const identityKey = getBoardResourceIdentityKey(resource)
      const timestamp = getBoardResourceTimestamp(resource)
      if (!currentCardSnapshot.has(identityKey)) {
        newCards += 1
      } else if (timestamp > (currentCardSnapshot.get(identityKey) || 0)) {
        updatedCards += 1
      }
    })

    const knownCardIdentifiers = Array.from(
      new Set(
        minterBoardInfiniteState.cards
          .map((card) => String(card?.identifier || "").trim())
          .filter(Boolean)
      )
    )
    let commentCards = 0
    const commentTasks = knownCardIdentifiers.map((cardIdentifier) => {
      return async () => {
        const liveComments = await fetchMinterBoardLiveCommentResources(
          cardIdentifier
        )
        const liveSignature =
          getMinterBoardUpdateResourceSignature(liveComments)
        const previousSignature =
          minterBoardUpdateState.commentSnapshot.get(cardIdentifier)
        if (
          previousSignature &&
          (liveSignature.count > previousSignature.count ||
            liveSignature.newestTimestamp > previousSignature.newestTimestamp)
        ) {
          commentCards += 1
        }
      }
    })
    await runWithConcurrency(commentTasks, 4)

    const knownPollNames = Array.from(
      new Set(
        minterBoardInfiniteState.cards
          .map((card) => {
            const cardData = minterBoardCardDataByIdentifier.get(
              card.identifier
            )
            return String(cardData?.poll || "").trim()
          })
          .filter(Boolean)
      )
    )
    let pollCards = 0
    const pollTasks = knownPollNames.map((pollName) => {
      return async () => {
        if (typeof fetchPollResults !== "function") return
        const livePollResults = await fetchPollResults(pollName)
        const liveSignature = getMinterBoardPollSignature(livePollResults)
        const previousSignature =
          minterBoardUpdateState.pollSnapshot.get(pollName)
        if (
          previousSignature &&
          (liveSignature.voteCount > previousSignature.voteCount ||
            liveSignature.voteWeightKey !== previousSignature.voteWeightKey)
        ) {
          pollCards += 1
        }
      }
    })
    await runWithConcurrency(pollTasks, 4)

    if (newCards > 0 || updatedCards > 0 || commentCards > 0 || pollCards > 0) {
      showMinterBoardUpdateBanner({
        cards: newCards,
        updatedCards,
        commentCards,
        pollCards,
      })
    }
  } catch (error) {
    console.warn("Minter board background update check failed:", error)
  } finally {
    minterBoardUpdateState.inFlight = false
  }
}

const startMinterBoardBackgroundUpdateChecks = () => {
  stopMinterBoardBackgroundUpdateChecks()
  minterBoardUpdateState.timer = window.setInterval(
    checkMinterBoardForUpdates,
    MINTER_BOARD_UPDATE_CHECK_INTERVAL_MS
  )
}

const stopMinterBoardBackgroundUpdateChecks = () => {
  if (minterBoardUpdateState.timer) {
    window.clearInterval(minterBoardUpdateState.timer)
    minterBoardUpdateState.timer = null
  }
  minterBoardUpdateState.inFlight = false
}

const loadMinterBoardDetectedUpdates = async () => {
  hideMinterBoardUpdateBanner()
  await initializeCachedGroups()
  await loadCards(minterCardIdentifierPrefix, true)
}

const normalizeMinterNotificationSettings = (settings = {}) => {
  const cards =
    settings && typeof settings.cards === "object" && settings.cards !== null
      ? settings.cards
      : {}
  return {
    version: MINTER_NOTIFICATION_SCHEMA_VERSION,
    type: "minter-board-notification-settings",
    app: "Q-Mintership",
    publisher: settings.publisher || userState.accountName || "",
    publisherAddress:
      settings.publisherAddress || userState.accountAddress || "",
    updated: Number(settings.updated || Date.now()),
    global: {
      enabled: settings.global?.enabled !== false,
      qchat: settings.global?.qchat !== false,
      qmail: settings.global?.qmail === true,
      notificationGroupId: MINTER_NOTIFICATION_GROUP_ID,
      events: {
        ...DEFAULT_MINTER_NOTIFICATION_EVENTS,
        ...(settings.global?.events || {}),
      },
    },
    cards,
  }
}

const getCurrentUserNotificationSettingsIdentifier = () =>
  `${MINTER_NOTIFICATION_SETTINGS_IDENTIFIER_PREFIX}-${
    userState.accountName || "unknown"
  }`

const fetchMinterBoardNotificationSettings = async (force = false) => {
  const now = Date.now()
  if (
    !force &&
    minterBoardNotificationSettingsCache.data.length &&
    now - minterBoardNotificationSettingsCache.timestamp <
      MINTER_NOTIFICATION_SETTINGS_CACHE_TTL_MS
  ) {
    return minterBoardNotificationSettingsCache.data
  }

  try {
    const response = await searchSimple(
      "BLOG_POST",
      MINTER_NOTIFICATION_SETTINGS_IDENTIFIER_PREFIX,
      "",
      0,
      0,
      "",
      false,
      true
    )
    const resources = Array.isArray(response) ? response : []
    const tasks = resources.map((resource) => {
      return async () => {
        try {
          const data = await qortalRequest({
            action: "FETCH_QDN_RESOURCE",
            name: resource.name,
            service: "BLOG_POST",
            identifier: resource.identifier,
          })
          if (data?.type !== "minter-board-notification-settings") {
            return null
          }
          return normalizeMinterNotificationSettings({
            ...data,
            publisher: data.publisher || resource.name,
          })
        } catch (error) {
          console.warn("Unable to load notification settings:", error)
          return null
        }
      }
    })
    const settings = (await runWithConcurrency(tasks, 6)).filter(Boolean)
    minterBoardNotificationSettingsCache.timestamp = now
    minterBoardNotificationSettingsCache.data = settings
    return settings
  } catch (error) {
    console.warn("Unable to search notification settings:", error)
    return minterBoardNotificationSettingsCache.data || []
  }
}

const getCurrentUserMinterNotificationSettings = async (force = false) => {
  const allSettings = await fetchMinterBoardNotificationSettings(force)
  const currentName = String(userState.accountName || "").toLowerCase()
  const currentAddress = String(userState.accountAddress || "").toLowerCase()
  const existing = allSettings.find((settings) => {
    return (
      String(settings.publisher || "").toLowerCase() === currentName ||
      String(settings.publisherAddress || "").toLowerCase() === currentAddress
    )
  })
  return normalizeMinterNotificationSettings(existing || {})
}

const publishCurrentUserMinterNotificationSettings = async (settings) => {
  if (!userState.accountName) {
    alert("A registered name is required to publish notification settings.")
    return null
  }
  const normalizedSettings = normalizeMinterNotificationSettings({
    ...settings,
    publisher: userState.accountName,
    publisherAddress: userState.accountAddress || "",
    updated: Date.now(),
  })
  let data64 = await objectToBase64(normalizedSettings)
  if (!data64) {
    data64 = btoa(JSON.stringify(normalizedSettings))
  }
  await qortalRequest({
    action: "PUBLISH_QDN_RESOURCE",
    name: userState.accountName,
    service: "BLOG_POST",
    identifier: getCurrentUserNotificationSettingsIdentifier(),
    data64,
  })
  minterBoardNotificationSettingsCache.timestamp = 0
  await fetchMinterBoardNotificationSettings(true)
  return normalizedSettings
}

const getCardNotificationPreference = (settings, cardIdentifier) => {
  const cardPreference = settings?.cards?.[cardIdentifier]
  if (!cardPreference) {
    return null
  }
  return {
    enabled: cardPreference.enabled !== false,
    qchat: cardPreference.channels?.qchat ?? settings.global?.qchat ?? true,
    qmail: cardPreference.channels?.qmail ?? settings.global?.qmail === true,
    events: {
      ...DEFAULT_MINTER_NOTIFICATION_EVENTS,
      ...(settings.global?.events || {}),
      ...(cardPreference.events || {}),
    },
  }
}

const getMinterNotificationChannels = (settings, cardIdentifier) => {
  const cardChannels = settings?.cards?.[cardIdentifier]?.channels || {}
  return {
    qchat: cardChannels.qchat ?? settings?.global?.qchat !== false,
    qmail: cardChannels.qmail ?? settings?.global?.qmail === true,
  }
}

const getCurrentMinterNotificationStateIdentifier = () =>
  MINTER_NOTIFICATION_STATE_IDENTIFIER_PREFIX

const normalizeMinterNotificationState = (state = {}) => {
  const publishedActions =
    state &&
    typeof state.publishedActions === "object" &&
    state.publishedActions
      ? state.publishedActions
      : {}
  const cards =
    state && typeof state.cards === "object" && state.cards ? state.cards : {}
  return {
    version: MINTER_NOTIFICATION_SCHEMA_VERSION,
    type: "minter-board-notification-state",
    app: "Q-Mintership",
    publisher: state.publisher || userState.accountName || "",
    publisherAddress: state.publisherAddress || userState.accountAddress || "",
    updated: Number(state.updated || Date.now()),
    notificationGroupId: MINTER_NOTIFICATION_GROUP_ID,
    publishedActions,
    cards,
    summary: {
      totalActions: Number(
        state.summary?.totalActions || Object.keys(publishedActions).length
      ),
      totalCards: Number(
        state.summary?.totalCards || Object.keys(cards).length
      ),
    },
  }
}

const fetchMinterBoardNotificationState = async (force = false) => {
  const now = Date.now()
  if (
    !force &&
    minterBoardNotificationStateCache.data.length &&
    now - minterBoardNotificationStateCache.timestamp <
      MINTER_NOTIFICATION_STATE_CACHE_TTL_MS
  ) {
    return minterBoardNotificationStateCache.data[0]
  }

  try {
    const response = await searchSimple(
      "BLOG_POST",
      MINTER_NOTIFICATION_STATE_IDENTIFIER_PREFIX,
      "",
      0,
      0,
      "",
      false,
      true
    )
    const resources = Array.isArray(response) ? response : []
    const tasks = resources.map((resource) => {
      return async () => {
        try {
          const data = await qortalRequest({
            action: "FETCH_QDN_RESOURCE",
            name: resource.name,
            service: "BLOG_POST",
            identifier: resource.identifier,
          })
          if (data?.type !== "minter-board-notification-state") {
            return null
          }
          return normalizeMinterNotificationState({
            ...data,
            publisher: data.publisher || resource.name,
          })
        } catch (error) {
          console.warn("Unable to load notification state:", error)
          return null
        }
      }
    })
    const states = (await runWithConcurrency(tasks, 6))
      .filter(Boolean)
      .sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0))
    const latest = states[0] || normalizeMinterNotificationState({})
    minterBoardNotificationStateCache.timestamp = now
    minterBoardNotificationStateCache.data = states.length ? states : [latest]
    return latest
  } catch (error) {
    console.warn("Unable to search notification state:", error)
    return (
      minterBoardNotificationStateCache.data[0] ||
      normalizeMinterNotificationState({})
    )
  }
}

const getMinterNotificationRecipientKey = (recipient = {}) =>
  String(recipient.address || recipient.name || "")
    .trim()
    .toLowerCase()

const mergeMinterNotificationRecipients = (
  existingRecipients = [],
  nextRecipients = []
) => {
  const recipientMap = new Map()
  ;[
    ...(Array.isArray(existingRecipients) ? existingRecipients : []),
    ...(Array.isArray(nextRecipients) ? nextRecipients : []),
  ].forEach((recipient) => {
    const key = getMinterNotificationRecipientKey(recipient)
    if (!key) return
    const previous = recipientMap.get(key) || {}
    recipientMap.set(key, {
      ...previous,
      ...recipient,
      sources: Array.from(
        new Set([...(previous.sources || []), ...(recipient.sources || [])])
      ),
    })
  })
  return Array.from(recipientMap.values())
}

const buildMinterNotificationActionIdentifier = (event = {}) => {
  const eventType = String(event.eventType || "").trim()
  if (eventType === "comment" || eventType === "reply") {
    return (
      String(event.actionIdentifier || event.commentIdentifier || "").trim() ||
      `${event.cardIdentifier || "card"}:${eventType}:${
        event.actorAddress || userState.accountAddress || "unknown"
      }`
    )
  }
  if (
    eventType === "admin_vote" ||
    eventType === "minter_vote" ||
    eventType === "user_vote"
  ) {
    return (
      String(event.actionIdentifier || "").trim() ||
      `${event.cardIdentifier || "card"}:${eventType}:${event.vote || "vote"}:${
        event.actorAddress || userState.accountAddress || "unknown"
      }:${String(event.poll || "").slice(-32)}`
    )
  }
  if (eventType === "invite_created") {
    return (
      String(event.actionIdentifier || "").trim() ||
      String(
        event.transaction?.signature || event.transaction?.sig || ""
      ).trim() ||
      `${event.cardIdentifier || "card"}:${eventType}:${
        event.nomineeName || "nominee"
      }`
    )
  }
  if (eventType === "group_approval") {
    return (
      String(event.actionIdentifier || event.pendingSignature || "").trim() ||
      `${event.cardIdentifier || "card"}:${eventType}:${
        event.transactionType || "approval"
      }`
    )
  }
  if (eventType === "joined") {
    return (
      String(event.actionIdentifier || "").trim() ||
      `${event.cardIdentifier || "card"}:${eventType}:${
        event.actorAddress || userState.accountAddress || "unknown"
      }`
    )
  }
  return (
    String(event.actionIdentifier || "").trim() ||
    `${event.cardIdentifier || "card"}:${eventType}:${
      event.actorAddress || userState.accountAddress || "unknown"
    }:${event.created || Date.now()}`
  )
}

const buildMinterNotificationActionKey = (event = {}) => {
  const cardIdentifier = String(event.cardIdentifier || "card").trim()
  const eventType = String(event.eventType || "update").trim()
  const actionIdentifier = buildMinterNotificationActionIdentifier(event)
  return `${cardIdentifier}|${eventType}|${actionIdentifier}`
}

const buildMinterNotificationEventIdentifier = async (event = {}) => {
  const eventType =
    String(event.eventType || "update")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 16) || "update"
  return `${MINTER_NOTIFICATION_EVENT_IDENTIFIER_PREFIX}-${eventType}-${await uid()}`
}

const buildMinterNotificationStateRecord = (
  event = {},
  recipients = [],
  notificationGroupId = MINTER_NOTIFICATION_GROUP_ID,
  delivery = {}
) => {
  const actionKey = buildMinterNotificationActionKey(event)
  const qchatRecipients = mergeMinterNotificationRecipients(
    [],
    (Array.isArray(recipients) ? recipients : []).filter(
      (recipient) => recipient.channels?.qchat
    )
  )
  const qmailRecipients = mergeMinterNotificationRecipients(
    [],
    (Array.isArray(recipients) ? recipients : []).filter(
      (recipient) => recipient.channels?.qmail
    )
  )
  const broadcastGroupId =
    notificationGroupId === undefined
      ? MINTER_NOTIFICATION_GROUP_ID
      : normalizeMinterNotificationGroupId(notificationGroupId)
  const announcementGroupId = normalizeMinterNotificationGroupId(
    delivery.announcementGroupId ??
      broadcastGroupId ??
      MINTER_NOTIFICATION_GROUP_ID
  )
  return {
    actionKey,
    eventId: event.eventId || "",
    eventType: event.eventType || "",
    actionIdentifier: buildMinterNotificationActionIdentifier(event),
    cardIdentifier: event.cardIdentifier || "",
    nomineeName: event.nomineeName || "",
    nominatorName: event.nominatorName || "",
    summary: event.summary || "",
    publishedAt: Date.now(),
    publishedBy: userState.accountName || "",
    publishedByAddress: userState.accountAddress || "",
    notificationGroupId: broadcastGroupId,
    channels: {
      qchat: {
        published:
          qchatRecipients.length > 0 || Boolean(delivery.qchatBroadcastSent),
        recipientCount: qchatRecipients.length,
        recipients: qchatRecipients,
        broadcastGroupId,
      },
      qmail: {
        published: qmailRecipients.length > 0,
        recipientCount: qmailRecipients.length,
        recipients: qmailRecipients,
      },
      announcement: {
        published: Boolean(delivery.announcementPublished),
        groupId: announcementGroupId,
        identifier: delivery.announcementIdentifier || "",
      },
    },
  }
}

const mergeMinterNotificationStateRecord = (
  existingRecord = {},
  nextRecord = {}
) => {
  const mergedQchatRecipients = mergeMinterNotificationRecipients(
    existingRecord.channels?.qchat?.recipients || [],
    nextRecord.channels?.qchat?.recipients || []
  )
  const mergedQmailRecipients = mergeMinterNotificationRecipients(
    existingRecord.channels?.qmail?.recipients || [],
    nextRecord.channels?.qmail?.recipients || []
  )
  const mergedAnnouncement = {
    ...(existingRecord.channels?.announcement || {}),
    ...(nextRecord.channels?.announcement || {}),
  }
  return {
    ...existingRecord,
    ...nextRecord,
    actionKey: nextRecord.actionKey || existingRecord.actionKey || "",
    eventId: nextRecord.eventId || existingRecord.eventId || "",
    eventType: nextRecord.eventType || existingRecord.eventType || "",
    actionIdentifier:
      nextRecord.actionIdentifier ||
      existingRecord.actionIdentifier ||
      buildMinterNotificationActionIdentifier(nextRecord),
    cardIdentifier:
      nextRecord.cardIdentifier || existingRecord.cardIdentifier || "",
    nomineeName: nextRecord.nomineeName || existingRecord.nomineeName || "",
    nominatorName:
      nextRecord.nominatorName || existingRecord.nominatorName || "",
    summary: nextRecord.summary || existingRecord.summary || "",
    publishedAt:
      nextRecord.publishedAt || existingRecord.publishedAt || Date.now(),
    publishedBy: nextRecord.publishedBy || existingRecord.publishedBy || "",
    publishedByAddress:
      nextRecord.publishedByAddress || existingRecord.publishedByAddress || "",
    notificationGroupId:
      nextRecord.notificationGroupId ??
      existingRecord.notificationGroupId ??
      null,
    channels: {
      qchat: {
        ...(existingRecord.channels?.qchat || {}),
        ...(nextRecord.channels?.qchat || {}),
        published:
          mergedQchatRecipients.length > 0 ||
          Boolean(existingRecord.channels?.qchat?.published) ||
          Boolean(nextRecord.channels?.qchat?.published),
        recipientCount: mergedQchatRecipients.length,
        recipients: mergedQchatRecipients,
      },
      qmail: {
        ...(existingRecord.channels?.qmail || {}),
        ...(nextRecord.channels?.qmail || {}),
        published:
          mergedQmailRecipients.length > 0 ||
          Boolean(existingRecord.channels?.qmail?.published) ||
          Boolean(nextRecord.channels?.qmail?.published),
        recipientCount: mergedQmailRecipients.length,
        recipients: mergedQmailRecipients,
      },
      announcement: {
        ...mergedAnnouncement,
        published:
          Boolean(existingRecord.channels?.announcement?.published) ||
          Boolean(nextRecord.channels?.announcement?.published),
      },
    },
  }
}

const mergeMinterNotificationState = (currentState = {}, stateRecord = {}) => {
  const nextState = normalizeMinterNotificationState(currentState)
  const now = Date.now()
  const cardIdentifier = stateRecord.cardIdentifier || "unknown"
  const previousCardState = nextState.cards[cardIdentifier] || {
    actionKeys: [],
  }
  const nextActionKeys = Array.from(
    new Set([...(previousCardState.actionKeys || []), stateRecord.actionKey])
  ).filter(Boolean)
  nextState.publishedActions = {
    ...(nextState.publishedActions || {}),
    [stateRecord.actionKey]: {
      ...(nextState.publishedActions?.[stateRecord.actionKey] || {}),
      ...stateRecord,
    },
  }
  nextState.cards = {
    ...(nextState.cards || {}),
    [cardIdentifier]: {
      ...previousCardState,
      cardIdentifier,
      actionKeys: nextActionKeys,
      lastActionKey: stateRecord.actionKey,
      lastEventType:
        stateRecord.eventType || previousCardState.lastEventType || "",
      lastEventId: stateRecord.eventId || previousCardState.lastEventId || "",
      lastUpdated: now,
      publishedBy:
        stateRecord.publishedBy || previousCardState.publishedBy || "",
      publishedByAddress:
        stateRecord.publishedByAddress ||
        previousCardState.publishedByAddress ||
        "",
    },
  }
  nextState.updated = now
  nextState.notificationGroupId = MINTER_NOTIFICATION_GROUP_ID
  nextState.summary = {
    totalActions: Object.keys(nextState.publishedActions || {}).length,
    totalCards: Object.keys(nextState.cards || {}).length,
  }
  return nextState
}

const buildMinterNotificationEventData = async (event = {}) => {
  const actionKey = buildMinterNotificationActionKey(event)
  const normalizedEvent = {
    ...event,
  }
  return {
    ...normalizedEvent,
    version: MINTER_NOTIFICATION_SCHEMA_VERSION,
    type: "minter-board-notification-event",
    app: "Q-Mintership",
    eventId: await buildMinterNotificationEventIdentifier(normalizedEvent),
    created: Date.now(),
    actorName: normalizedEvent.actorName || userState.accountName || "",
    actorAddress:
      normalizedEvent.actorAddress || userState.accountAddress || "",
    actionKey,
    actionIdentifier: buildMinterNotificationActionIdentifier(normalizedEvent),
  }
}

const isCurrentUserDefaultNotificationRecipient = (cardIdentifier) => {
  const cardData = getMinterNotificationCardData(cardIdentifier)
  const currentName = String(userState.accountName || "").toLowerCase()
  const currentAddress = String(userState.accountAddress || "").toLowerCase()
  const nominatorName = String(
    cardData.nominator || cardData.publishedBy || ""
  ).toLowerCase()
  const nominatorAddress = String(
    cardData.nominatorAddress || cardData.publishedByAddress || ""
  ).toLowerCase()
  const nomineeName = String(
    cardData.nominee || cardData.creator || ""
  ).toLowerCase()
  const nomineeAddress = String(
    cardData.nomineeAddress || cardData.creatorAddress || ""
  ).toLowerCase()
  return (
    Boolean(userState.isAdmin || userState.isMinterAdmin) ||
    (currentName && currentName === nominatorName) ||
    (currentAddress && currentAddress === nominatorAddress) ||
    (currentName && currentName === nomineeName) ||
    (currentAddress && currentAddress === nomineeAddress)
  )
}

const updateNotificationBellState = (cardIdentifier, preference) => {
  const enabled = preference?.enabled !== false
  const buttons = Array.from(
    document.querySelectorAll(".card-notification-button")
  ).filter((button) => button.dataset.notificationCard === cardIdentifier)
  buttons.forEach((button) => {
    button.classList.toggle("card-notification-button--enabled", enabled)
    button.classList.toggle("card-notification-button--disabled", !enabled)
    button.title = enabled
      ? "Notifications enabled for this card"
      : "Notifications disabled for this card"
    button.setAttribute(
      "aria-label",
      enabled
        ? "Notifications enabled for this card"
        : "Notifications disabled for this card"
    )
  })
}

const toggleMinterCardNotifications = async (buttonEl) => {
  const cardIdentifier = String(
    buttonEl?.dataset?.notificationCard || ""
  ).trim()
  if (!cardIdentifier) return

  try {
    buttonEl.disabled = true
    const settings = await getCurrentUserMinterNotificationSettings(true)
    const currentPreference = getCardNotificationPreference(
      settings,
      cardIdentifier
    )
    const nextEnabled = currentPreference
      ? !currentPreference.enabled
      : !isCurrentUserDefaultNotificationRecipient(cardIdentifier)
    const nextCards = {
      ...(settings.cards || {}),
      [cardIdentifier]: {
        ...(settings.cards?.[cardIdentifier] || {}),
        enabled: nextEnabled,
        channels: {
          qchat: settings.global?.qchat !== false,
          qmail: settings.global?.qmail === true,
          ...(settings.cards?.[cardIdentifier]?.channels || {}),
        },
        events: {
          ...DEFAULT_MINTER_NOTIFICATION_EVENTS,
          ...(settings.cards?.[cardIdentifier]?.events || {}),
        },
        updated: Date.now(),
      },
    }
    const nextSettings = await publishCurrentUserMinterNotificationSettings({
      ...settings,
      cards: nextCards,
    })
    updateNotificationBellState(
      cardIdentifier,
      getCardNotificationPreference(nextSettings, cardIdentifier)
    )
  } catch (error) {
    console.error("Unable to update notification settings:", error)
    alert("Unable to update notification settings. Please try again.")
  } finally {
    buttonEl.disabled = false
  }
}

const openMinterNotificationSettingsModal = async () => {
  ensureMinterNotificationModal()
  const settings = await getCurrentUserMinterNotificationSettings(true)
  const isGroupMember = await getCurrentUserMinterNotificationGroupMembership(
    true
  )
  const modal = document.getElementById("notification-delivery-modal")
  const modalContent = document.getElementById(
    "notification-delivery-modalContent"
  )
  if (!modal || !modalContent) return

  modalContent.style.overflow = "hidden"
  modalContent.innerHTML = `
    <div class="notification-delivery-modal-shell">
      <div class="notification-delivery-modal-body">
        <h2>Notification Settings</h2>
        <p>Publish how you want to receive Minter Board notifications. Card-specific bell settings are kept with this same public settings object.</p>
        <div class="notification-delivery-preview-grid">
          <div class="notification-delivery-preview-card">
            <strong>Broadcast group</strong>
            <span>${qEscapeHtml(
              MINTER_NOTIFICATION_GROUP_NAME
            )} (#${qEscapeHtml(String(MINTER_NOTIFICATION_GROUP_ID))})</span>
          </div>
          <div class="notification-delivery-preview-card">
            <strong>Status</strong>
            <span>${isGroupMember ? "Joined" : "Not joined yet"}</span>
          </div>
        </div>
        ${
          isGroupMember
            ? ""
            : `<div class="notification-delivery-actions">
                <button type="button" onclick="joinMinterNotificationGroup()">Join Notifications Group</button>
              </div>`
        }
        <div class="notification-delivery-options notification-delivery-options--stacked">
          <label>
            <input type="checkbox" id="notification-settings-enabled" ${
              settings.global.enabled ? "checked" : ""
            } />
            Enable Minter Board notifications
          </label>
          <label>
            <input type="checkbox" id="notification-settings-qchat" ${
              settings.global.qchat ? "checked" : ""
            } />
            Willing to receive Q-Chat notifications
          </label>
          <label>
            <input type="checkbox" id="notification-settings-qmail" ${
              settings.global.qmail ? "checked" : ""
            } />
            Willing to receive Q-Mail notifications
          </label>
        </div>
      </div>
      <div class="notification-delivery-footer">
        <div class="notification-delivery-actions">
          <button type="button" onclick="saveMinterNotificationSettingsFromModal()">Publish Settings</button>
          <button type="button" onclick="closeModal('notification-delivery')">Cancel</button>
        </div>
        <p id="notification-delivery-status" class="board-progress-muted"></p>
      </div>
    </div>
  `
  modal.style.display = "block"
}

const saveMinterNotificationSettingsFromModal = async () => {
  const statusEl = document.getElementById("notification-delivery-status")
  try {
    if (statusEl) statusEl.textContent = "Publishing notification settings..."
    const settings = await getCurrentUserMinterNotificationSettings(true)
    const nextSettings = {
      ...settings,
      global: {
        ...settings.global,
        enabled: document.getElementById("notification-settings-enabled")
          ?.checked,
        qchat: document.getElementById("notification-settings-qchat")?.checked,
        qmail: document.getElementById("notification-settings-qmail")?.checked,
        notificationGroupId: MINTER_NOTIFICATION_GROUP_ID,
      },
    }
    await publishCurrentUserMinterNotificationSettings(nextSettings)
    if (statusEl) {
      statusEl.textContent = "Notification settings published."
    }
  } catch (error) {
    console.error("Unable to publish notification settings:", error)
    if (statusEl) {
      statusEl.textContent = "Unable to publish notification settings."
    }
  }
}

const buildMinterCardNotificationButtonHtml = (cardIdentifier) => `
  <button
    type="button"
    class="card-notification-button"
    data-notification-card="${qEscapeAttr(cardIdentifier)}"
    title="Toggle notifications for this card"
    aria-label="Toggle notifications for this card"
    onclick="toggleMinterCardNotifications(this)"
  >
    <span class="mobi-mbri-alert" aria-hidden="true"></span>
  </button>
`

const hydrateMinterCardNotificationButton = async (cardIdentifier) => {
  try {
    const settings = await getCurrentUserMinterNotificationSettings()
    const preference = getCardNotificationPreference(settings, cardIdentifier)
    updateNotificationBellState(
      cardIdentifier,
      preference || {
        enabled: isCurrentUserDefaultNotificationRecipient(cardIdentifier),
      }
    )
  } catch (error) {
    console.warn("Unable to hydrate notification button:", error)
  }
}

const getMinterNotificationCardData = (cardIdentifier) =>
  minterBoardCardDataByIdentifier.get(cardIdentifier) || {}

const resolveNotificationIdentity = async (name = "", address = "") => {
  let resolvedName = String(name || "").trim()
  let resolvedAddress = String(address || "").trim()
  if (
    !resolvedName &&
    resolvedAddress &&
    typeof getNameFromAddress === "function"
  ) {
    const nameFromAddress = await getNameFromAddress(resolvedAddress)
    if (nameFromAddress && nameFromAddress !== resolvedAddress) {
      resolvedName = nameFromAddress
    }
  }
  if (!resolvedAddress && resolvedName) {
    resolvedAddress = await fetchOwnerAddressFromNameCached(resolvedName)
  }
  if (!resolvedName && resolvedAddress) {
    resolvedName = resolvedAddress
  }
  const publicKey = resolvedAddress
    ? await getPublicKeyFromAddress(resolvedAddress)
    : resolvedName
    ? await getPublicKeyByName(resolvedName)
    : ""
  return {
    name: resolvedName,
    address: resolvedAddress,
    publicKey: publicKey || "",
  }
}

const addNotificationRecipient = (recipientMap, recipient, source) => {
  if (!recipient?.name && !recipient?.address) return
  const key = (recipient.address || recipient.name || "").toLowerCase()
  const currentName = String(userState.accountName || "").toLowerCase()
  const currentAddress = String(userState.accountAddress || "").toLowerCase()
  if (
    key &&
    (key === currentAddress ||
      String(recipient.name || "").toLowerCase() === currentName)
  ) {
    return
  }
  const existing = recipientMap.get(key)
  const existingChannels = existing?.channels || {}
  const recipientChannels = recipient.channels || {}
  recipientMap.set(key, {
    ...(existing || recipient),
    ...recipient,
    channels: {
      qchat: Boolean(existingChannels.qchat || recipientChannels.qchat),
      qmail: Boolean(existingChannels.qmail || recipientChannels.qmail),
    },
    sources: Array.from(new Set([...(existing?.sources || []), source])),
  })
}

const shouldNotifyFromSettings = (
  settings,
  cardIdentifier,
  eventType,
  defaultEnabled = false
) => {
  const cardPreference = getCardNotificationPreference(settings, cardIdentifier)
  if (cardPreference) {
    return (
      cardPreference.enabled !== false &&
      cardPreference.events?.[eventType] !== false
    )
  }
  return (
    defaultEnabled &&
    settings.global?.enabled !== false &&
    settings.global?.events?.[eventType] !== false
  )
}

const resolveMinterNotificationRecipients = async (event) => {
  const settingsList = await fetchMinterBoardNotificationSettings()
  const settingsByAddress = new Map()
  const settingsByName = new Map()
  settingsList.forEach((settings) => {
    if (settings.publisherAddress) {
      settingsByAddress.set(settings.publisherAddress.toLowerCase(), settings)
    }
    if (settings.publisher) {
      settingsByName.set(settings.publisher.toLowerCase(), settings)
    }
  })

  const recipientMap = new Map()
  const cardIdentifier = event.cardIdentifier
  const cardData = getMinterNotificationCardData(cardIdentifier)
  const eventType = event.eventType

  const adminTasks = (cachedMinterAdmins || []).map((admin) => async () => {
    const identity = await resolveNotificationIdentity("", admin.member)
    const settings =
      settingsByAddress.get(String(identity.address || "").toLowerCase()) ||
      settingsByName.get(String(identity.name || "").toLowerCase()) ||
      normalizeMinterNotificationSettings({
        publisher: identity.name,
        publisherAddress: identity.address,
      })
    if (shouldNotifyFromSettings(settings, cardIdentifier, eventType, true)) {
      addNotificationRecipient(
        recipientMap,
        {
          ...identity,
          channels: getMinterNotificationChannels(settings, cardIdentifier),
        },
        "Minter admins"
      )
    }
  })
  await runWithConcurrency(adminTasks, 5)

  const nominator = await resolveNotificationIdentity(
    cardData.nominator || cardData.publishedBy || "",
    cardData.nominatorAddress || cardData.publishedByAddress || ""
  )
  const nominatorSettings =
    settingsByAddress.get(String(nominator.address || "").toLowerCase()) ||
    settingsByName.get(String(nominator.name || "").toLowerCase()) ||
    normalizeMinterNotificationSettings({
      publisher: nominator.name,
      publisherAddress: nominator.address,
    })
  if (
    (nominator.name || nominator.address) &&
    shouldNotifyFromSettings(nominatorSettings, cardIdentifier, eventType, true)
  ) {
    addNotificationRecipient(
      recipientMap,
      {
        ...nominator,
        channels: getMinterNotificationChannels(
          nominatorSettings,
          cardIdentifier
        ),
      },
      "Nominator"
    )
  }

  const nominee = await resolveNotificationIdentity(
    cardData.nominee || cardData.creator || "",
    cardData.nomineeAddress || cardData.creatorAddress || ""
  )
  const nomineeSettings =
    settingsByAddress.get(String(nominee.address || "").toLowerCase()) ||
    settingsByName.get(String(nominee.name || "").toLowerCase()) ||
    normalizeMinterNotificationSettings({
      publisher: nominee.name,
      publisherAddress: nominee.address,
    })
  if (
    (nominee.name || nominee.address) &&
    shouldNotifyFromSettings(nomineeSettings, cardIdentifier, eventType, true)
  ) {
    addNotificationRecipient(
      recipientMap,
      {
        ...nominee,
        channels: getMinterNotificationChannels(
          nomineeSettings,
          cardIdentifier
        ),
      },
      "Nominee"
    )
  }

  if (event.replyTo?.creator) {
    const replyRecipient = await resolveNotificationIdentity(
      event.replyTo.creator
    )
    const replySettings =
      settingsByAddress.get(
        String(replyRecipient.address || "").toLowerCase()
      ) ||
      settingsByName.get(String(replyRecipient.name || "").toLowerCase()) ||
      normalizeMinterNotificationSettings({
        publisher: replyRecipient.name,
        publisherAddress: replyRecipient.address,
      })
    if (
      shouldNotifyFromSettings(replySettings, cardIdentifier, "reply", true)
    ) {
      addNotificationRecipient(
        recipientMap,
        {
          ...replyRecipient,
          channels: getMinterNotificationChannels(
            replySettings,
            cardIdentifier
          ),
        },
        "Reply author"
      )
    }
  }

  settingsList.forEach((settings) => {
    if (
      shouldNotifyFromSettings(settings, cardIdentifier, eventType, false) &&
      settings.cards?.[cardIdentifier]?.enabled === true
    ) {
      addNotificationRecipient(
        recipientMap,
        {
          name: settings.publisher,
          address: settings.publisherAddress,
          publicKey: "",
          channels: getMinterNotificationChannels(settings, cardIdentifier),
        },
        "Other tracked users"
      )
    }
  })

  const recipients = Array.from(recipientMap.values())
  const hydrateTasks = recipients.map((recipient) => async () => {
    if (!recipient.publicKey && recipient.address) {
      recipient.publicKey = await getPublicKeyFromAddress(recipient.address)
    }
    return recipient
  })
  const hydratedRecipients = await runWithConcurrency(hydrateTasks, 5)
  return hydratedRecipients.filter(
    (recipient) => recipient.channels?.qchat || recipient.channels?.qmail
  )
}

const getMinterNotificationPublishedActionRecord = (state, event) => {
  const actionKey = buildMinterNotificationActionKey(event)
  return state?.publishedActions?.[actionKey] || null
}

const isMinterNotificationRecipientPublished = (
  record,
  recipient,
  channel = "qchat"
) => {
  const publishedRecipients = record?.channels?.[channel]?.recipients || []
  const recipientKey = getMinterNotificationRecipientKey(recipient)
  return publishedRecipients.some(
    (publishedRecipient) =>
      getMinterNotificationRecipientKey(publishedRecipient) === recipientKey
  )
}

const splitMinterNotificationRecipientsByPendingState = (
  record,
  recipients = []
) => {
  const pendingRecipients = {
    qchat: [],
    qmail: [],
  }
  const handledRecipients = {
    qchat: [],
    qmail: [],
  }
  ;(Array.isArray(recipients) ? recipients : []).forEach((recipient) => {
    if (recipient.channels?.qchat) {
      if (isMinterNotificationRecipientPublished(record, recipient, "qchat")) {
        handledRecipients.qchat.push(recipient)
      } else {
        pendingRecipients.qchat.push(recipient)
      }
    }
    if (recipient.channels?.qmail) {
      if (isMinterNotificationRecipientPublished(record, recipient, "qmail")) {
        handledRecipients.qmail.push(recipient)
      } else {
        pendingRecipients.qmail.push(recipient)
      }
    }
  })
  return {
    pendingRecipients,
    handledRecipients,
  }
}

const buildMinterNotificationPublishBatch = async (event = {}) => {
  const [currentState, recipients, eventData] = await Promise.all([
    fetchMinterBoardNotificationState(),
    resolveMinterNotificationRecipients(event),
    buildMinterNotificationEventData(event),
  ])
  const existingRecord = getMinterNotificationPublishedActionRecord(
    currentState,
    eventData
  )
  const { pendingRecipients, handledRecipients } =
    splitMinterNotificationRecipientsByPendingState(existingRecord, recipients)
  const recipientSections = buildMinterNotificationRecipientSections(recipients)
  const recordRecipients = mergeMinterNotificationRecipients(
    pendingRecipients.qchat,
    pendingRecipients.qmail
  )
  const broadcastGroupId = resolveMinterNotificationBroadcastGroupId()
  const draftStateRecord = buildMinterNotificationStateRecord(
    eventData,
    recordRecipients.length ? recordRecipients : recipients,
    broadcastGroupId
  )
  const stateRecord = mergeMinterNotificationStateRecord(
    existingRecord || {},
    draftStateRecord
  )
  const nextState = mergeMinterNotificationState(currentState, stateRecord)
  nextState.notificationGroupId = normalizeMinterNotificationGroupId(
    broadcastGroupId ?? nextState.notificationGroupId ?? ""
  )
  const eventData64 =
    (await objectToBase64(eventData)) || btoa(JSON.stringify(eventData))
  const stateData64 =
    (await objectToBase64(nextState)) || btoa(JSON.stringify(nextState))
  return {
    currentState,
    event: eventData,
    eventData64,
    state: nextState,
    stateData64,
    stateRecord,
    recipients,
    pendingRecipients,
    handledRecipients,
    existingRecord,
    broadcastGroupId,
    recipientSections,
    hasPendingRecipients:
      pendingRecipients.qchat.length > 0 || pendingRecipients.qmail.length > 0,
    resources: [
      {
        name: userState.accountName,
        service: "BLOG_POST",
        identifier: eventData.eventId,
        base64: eventData64,
      },
      {
        name: userState.accountName,
        service: "BLOG_POST",
        identifier: getCurrentMinterNotificationStateIdentifier(),
        base64: stateData64,
      },
    ],
  }
}

const refreshMinterNotificationReviewButton = () => {
  const reviewButton = document.getElementById("notification-review-button")
  if (!reviewButton) return
  const batch = minterBoardNotificationDeliveryState.batch
  const qchatPendingCount = batch
    ? batch.broadcastGroupId
      ? batch.pendingRecipients?.qchat?.length
        ? 1
        : 0
      : batch.pendingRecipients?.qchat?.length || 0
    : 0
  const pendingCount = batch
    ? qchatPendingCount + (batch.pendingRecipients?.qmail?.length || 0)
    : 0
  reviewButton.hidden = !batch
  reviewButton.textContent =
    pendingCount > 0
      ? `Pending Notifications (${pendingCount})`
      : "Pending Notifications"
}

const getCurrentUserMinterNotificationGroupMembership = async (
  force = false
) => {
  if (!userState.isLoggedIn) {
    return false
  }

  let accountAddress = String(userState.accountAddress || "").trim()
  if (!accountAddress && typeof getUserAddress === "function") {
    try {
      accountAddress = String((await getUserAddress()) || "").trim()
    } catch (error) {
      console.warn(
        "Unable to resolve current user address for notifications:",
        error
      )
      accountAddress = ""
    }
  }

  if (!accountAddress) {
    return false
  }

  const now = Date.now()
  const cachedMatch =
    minterBoardNotificationGroupMembershipState.accountAddress ===
      accountAddress &&
    now - minterBoardNotificationGroupMembershipState.timestamp <
      MINTER_NOTIFICATION_GROUP_MEMBERSHIP_CACHE_TTL_MS

  if (!force && cachedMatch) {
    return Boolean(minterBoardNotificationGroupMembershipState.isMember)
  }

  try {
    const groups = await getUserGroups(accountAddress)
    const isMember = Array.isArray(groups)
      ? groups.some(
          (group) =>
            Number(group.groupId) === MINTER_NOTIFICATION_GROUP_ID ||
            String(group.groupName || "").toLowerCase() ===
              MINTER_NOTIFICATION_GROUP_NAME.toLowerCase()
        )
      : false

    minterBoardNotificationGroupMembershipState.timestamp = now
    minterBoardNotificationGroupMembershipState.accountAddress = accountAddress
    minterBoardNotificationGroupMembershipState.isMember = isMember
    return isMember
  } catch (error) {
    console.warn("Unable to load notification group membership:", error)
    minterBoardNotificationGroupMembershipState.timestamp = now
    minterBoardNotificationGroupMembershipState.accountAddress = accountAddress
    minterBoardNotificationGroupMembershipState.isMember = false
    return false
  }
}

const refreshMinterNotificationGroupPrompt = async () => {
  const prompt = document.getElementById("notification-group-prompt")
  if (!prompt) return

  if (!userState.isLoggedIn) {
    prompt.hidden = true
    prompt.innerHTML = ""
    return
  }

  const isMember = await getCurrentUserMinterNotificationGroupMembership()
  if (isMember) {
    prompt.hidden = true
    prompt.innerHTML = ""
    return
  }

  const joinDisabled = minterBoardNotificationGroupMembershipState.inFlight
    ? "disabled"
    : ""
  const joinLabel = minterBoardNotificationGroupMembershipState.inFlight
    ? "Joining..."
    : "Join Notifications Group"
  prompt.innerHTML = `
    <div class="notification-group-prompt-copy">
      <strong>Join Q-Chat notifications</strong>
      <span>${qEscapeHtml(MINTER_NOTIFICATION_GROUP_NAME)} (#${qEscapeHtml(
    String(MINTER_NOTIFICATION_GROUP_ID)
  )}) is where broadcast notifications are delivered.</span>
    </div>
    <button
      type="button"
      class="notification-group-prompt-button"
      onclick="joinMinterNotificationGroup()"
      ${joinDisabled}
    >
      ${qEscapeHtml(joinLabel)}
    </button>
  `
  prompt.hidden = false
}

const joinMinterNotificationGroup = async () => {
  if (minterBoardNotificationGroupMembershipState.inFlight) {
    return false
  }

  const alreadyMember = await getCurrentUserMinterNotificationGroupMembership()
  if (alreadyMember) {
    await refreshMinterNotificationGroupPrompt()
    return true
  }

  minterBoardNotificationGroupMembershipState.inFlight = true
  await refreshMinterNotificationGroupPrompt()

  try {
    const joinRequest = await qortalRequest({
      action: "JOIN_GROUP",
      groupId: MINTER_NOTIFICATION_GROUP_ID,
    })

    if (!joinRequest) {
      throw new Error("JOIN_GROUP returned no response.")
    }

    minterBoardNotificationGroupMembershipState.timestamp = 0
    const isMember = await getCurrentUserMinterNotificationGroupMembership(true)
    await refreshMinterNotificationGroupPrompt()
    if (
      document.getElementById("notification-delivery-modal")?.style.display ===
        "block" &&
      document
        .getElementById("notification-delivery-modalContent")
        ?.querySelector("h2")?.textContent === "Notification Settings"
    ) {
      await openMinterNotificationSettingsModal()
    }
    alert(
      isMember
        ? `Joined ${MINTER_NOTIFICATION_GROUP_NAME}.`
        : `Join request for ${MINTER_NOTIFICATION_GROUP_NAME} was submitted.`
    )
    return true
  } catch (error) {
    console.error("Unable to join notifications group:", error)
    alert("Unable to join the notifications group right now.")
    return false
  } finally {
    minterBoardNotificationGroupMembershipState.inFlight = false
    await refreshMinterNotificationGroupPrompt()
  }
}

const getMinterNotificationEventContext = (event = {}) => {
  const cardData = getMinterNotificationCardData(event.cardIdentifier)
  const nomineeName = String(
    event.nomineeName ||
      getCardNomineeName(cardData, "a nominee") ||
      "a nominee"
  ).trim()
  const nominatorName = String(
    event.nominatorName ||
      getCardNominatorName(cardData, "a nominator") ||
      "a nominator"
  ).trim()
  const actorName = String(
    event.actorName || userState.accountName || "Someone"
  ).trim()
  const replyAuthorName = String(
    event.replyTo?.creator ||
      event.replyTo?.authorName ||
      event.replyTo?.publisher ||
      ""
  ).trim()
  const nominationTimestamp = Number(
    event.nominationTimestamp ||
      cardData.timestamp ||
      cardData.created ||
      cardData.updated ||
      event.created ||
      Date.now()
  )
  const nominationPublishDate = new Date(
    Number.isFinite(nominationTimestamp) ? nominationTimestamp : Date.now()
  ).toLocaleString()
  return {
    cardData,
    nomineeName,
    nominatorName,
    actorName,
    replyAuthorName,
    nominationTimestamp,
    nominationPublishDate,
  }
}

const getMinterNotificationEventTitle = (event) => {
  const { nomineeName, actorName } = getMinterNotificationEventContext(event)
  const labels = {
    comment: `Comment on ${nomineeName}'s nomination by ${actorName}`,
    reply: `Reply on ${nomineeName}'s nomination by ${actorName}`,
    admin_vote: `${actorName} cast an admin vote on ${nomineeName}'s nomination`,
    minter_vote: `${actorName} cast a minter vote on ${nomineeName}'s nomination`,
    user_vote: `${actorName} voted on ${nomineeName}'s nomination`,
    invite_created: `${actorName} started the invite process for ${nomineeName}`,
    group_approval: `${actorName} approved a pending invite transaction for ${nomineeName}`,
    joined: `${nomineeName} joined the MINTER group`,
  }
  return (
    labels[event.eventType] ||
    `${actorName} updated ${nomineeName}'s nomination`
  )
}

const buildMinterNotificationRichTextTextNode = (text, marks = []) => {
  const normalizedText = String(text ?? "")
  const normalizedMarks = Array.isArray(marks) ? marks.filter(Boolean) : []
  const node = {
    type: "text",
    text: normalizedText,
  }

  if (normalizedMarks.length > 0) {
    node.marks = normalizedMarks
  }

  return node
}

const buildMinterNotificationRichTextParagraphNode = (content = []) => {
  const normalizedContent = Array.isArray(content)
    ? content.filter(Boolean)
    : []
  return {
    type: "paragraph",
    content: normalizedContent,
  }
}

const buildMinterNotificationRichTextListItemNode = (label, value) => {
  return {
    type: "listItem",
    content: [
      buildMinterNotificationRichTextParagraphNode([
        buildMinterNotificationRichTextTextNode(`${label}: `, [
          { type: "bold" },
        ]),
        buildMinterNotificationRichTextTextNode(value),
      ]),
    ],
  }
}

const buildMinterNotificationRichTextBlockquoteNodes = (text) => {
  const normalizedText = String(text ?? "").trim()
  if (!normalizedText) {
    return []
  }

  const paragraphNodes = normalizedText
    .split(/\n+/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) =>
      buildMinterNotificationRichTextParagraphNode([
        buildMinterNotificationRichTextTextNode(line),
      ])
    )

  return [
    {
      type: "blockquote",
      content: paragraphNodes,
    },
  ]
}

const buildMinterNotificationRichTextDoc = (event = {}) => {
  const {
    nomineeName,
    nominatorName,
    actorName,
    replyAuthorName,
    nominationPublishDate,
  } = getMinterNotificationEventContext(event)
  const title = getMinterNotificationEventTitle(event)
  const detailItems = [
    ["Nominee", nomineeName],
    ["Nominator", nominatorName],
    ["Action by", actorName],
    ["Published", nominationPublishDate],
    event.eventType === "reply" && replyAuthorName
      ? ["In reply to", replyAuthorName]
      : null,
  ].filter(
    (item) => Array.isArray(item) && String(item[1] ?? "").trim().length > 0
  )
  const summary = String(event.summary || "").trim()

  return {
    messageText: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 3,
          },
          content: [buildMinterNotificationRichTextTextNode(title)],
        },
        {
          type: "bulletList",
          content: detailItems.map(([label, value]) =>
            buildMinterNotificationRichTextListItemNode(label, value)
          ),
        },
        ...buildMinterNotificationRichTextBlockquoteNodes(summary),
        buildMinterNotificationRichTextParagraphNode([
          buildMinterNotificationRichTextTextNode(
            "Open Q-Mintership and load the Minter Board to review the latest data."
          ),
        ]),
      ],
    },
    version: 3,
  }
}

const sendMinterNotificationChatMessage = async ({
  groupId = null,
  recipient = null,
  message,
  fullContent,
}) => {
  const requestPayload = {
    action: "SEND_CHAT_MESSAGE",
    message,
    ...(fullContent ? { fullContent } : {}),
    ...(groupId !== null && groupId !== undefined
      ? { groupId }
      : recipient !== null && recipient !== undefined
      ? { recipient }
      : {}),
  }

  try {
    return await qortalRequest(requestPayload)
  } catch (error) {
    const errorText = String(error?.message || error || "")
    if (fullContent && /fullcontent/i.test(errorText)) {
      console.warn(
        "Rich notification chat payload was rejected; retrying with plain text.",
        error
      )
      const fallbackPayload = { ...requestPayload }
      delete fallbackPayload.fullContent
      return await qortalRequest(fallbackPayload)
    }
    throw error
  }
}

const buildMinterNotificationMessage = (event) => {
  const {
    nomineeName,
    nominatorName,
    actorName,
    replyAuthorName,
    nominationPublishDate,
  } = getMinterNotificationEventContext(event)
  const title = getMinterNotificationEventTitle(event)
  const lines = [
    title,
    "",
    `Nominee: ${nomineeName}`,
    `Nominator: ${nominatorName}`,
    `Action by: ${actorName}`,
    `Published: ${nominationPublishDate}`,
    event.eventType === "reply" && replyAuthorName
      ? `In reply to: ${replyAuthorName}`
      : "",
    event.summary ? `Details: ${event.summary}` : "",
    "",
    "Open Q-Mintership and load the Minter Board to review the latest data.",
  ].filter((line) => line !== "")
  return lines.join("\n")
}

const MINTER_NOTIFICATION_RECIPIENT_SECTION_ORDER = [
  "admins",
  "nominator",
  "nominee",
  "reply",
  "watchers",
]

const MINTER_NOTIFICATION_RECIPIENT_SECTION_LABELS = {
  admins: "Minter admins",
  nominator: "Nominator",
  nominee: "Nominee",
  reply: "Reply author",
  watchers: "Other tracked users",
}

const getMinterNotificationRecipientSectionKey = (recipient = {}) => {
  const sources = Array.isArray(recipient.sources) ? recipient.sources : []
  const sourceText = sources.join(" ").toLowerCase()
  if (sourceText.includes("admin")) return "admins"
  if (sourceText.includes("nominator")) return "nominator"
  if (sourceText.includes("nominee")) return "nominee"
  if (sourceText.includes("reply")) return "reply"
  return "watchers"
}

const getMinterNotificationRecipientSectionLabel = (sectionKey = "") =>
  MINTER_NOTIFICATION_RECIPIENT_SECTION_LABELS[sectionKey] ||
  MINTER_NOTIFICATION_RECIPIENT_SECTION_LABELS.watchers

const buildMinterNotificationRecipientSections = (recipients = []) => {
  const sectionMap = new Map(
    MINTER_NOTIFICATION_RECIPIENT_SECTION_ORDER.map((sectionKey) => [
      sectionKey,
      {
        key: sectionKey,
        label: getMinterNotificationRecipientSectionLabel(sectionKey),
        recipients: [],
      },
    ])
  )

  ;(Array.isArray(recipients) ? recipients : []).forEach((recipient) => {
    const sectionKey = getMinterNotificationRecipientSectionKey(recipient)
    const section = sectionMap.get(sectionKey) || sectionMap.get("watchers")
    section.recipients.push(recipient)
  })

  return MINTER_NOTIFICATION_RECIPIENT_SECTION_ORDER.map((sectionKey) => {
    const section = sectionMap.get(sectionKey)
    section.recipients.sort((left, right) => {
      const leftName = String(left.name || left.address || "").toLowerCase()
      const rightName = String(right.name || right.address || "").toLowerCase()
      return leftName.localeCompare(rightName)
    })
    return section
  }).filter((section) => section.recipients.length > 0)
}

const resolveMinterNotificationQortalData64 = (response) => {
  if (typeof response === "string") {
    return response
  }
  if (!response || typeof response !== "object") {
    return null
  }
  const record = response
  for (const key of [
    "encryptedData",
    "decryptedData",
    "data64",
    "data",
    "base64",
  ]) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }
  return null
}

const ensureMinterNotificationBase64 = async (value) => {
  let data64 = await objectToBase64(value)
  if (!data64) {
    data64 = btoa(JSON.stringify(value))
  }
  return data64
}

const encryptMinterNotificationGroupData = async (value, groupId) => {
  const base64 =
    typeof value === "string"
      ? value
      : await ensureMinterNotificationBase64(value)
  const response = await qortalRequest({
    action: "ENCRYPT_QORTAL_GROUP_DATA",
    base64,
    groupId,
  })
  const encrypted = resolveMinterNotificationQortalData64(response)
  if (!encrypted) {
    throw new Error("Failed to encrypt notification group data")
  }
  return encrypted
}

const buildMinterNotificationAnnouncementBodyHtml = (event) => {
  const {
    nomineeName,
    nominatorName,
    actorName,
    replyAuthorName,
    nominationPublishDate,
  } = getMinterNotificationEventContext(event)
  const actorLabel =
    event.eventType === "comment"
      ? "Comment by"
      : event.eventType === "reply"
      ? "Reply by"
      : "Action by"
  const details = [
    `<p><strong>Nominee:</strong> ${qEscapeHtml(nomineeName)}</p>`,
    `<p><strong>Nominator:</strong> ${qEscapeHtml(nominatorName)}</p>`,
    `<p><strong>${qEscapeHtml(actorLabel)}:</strong> ${qEscapeHtml(
      actorName
    )}</p>`,
    `<p><strong>nominationPublishDate:</strong> ${qEscapeHtml(
      nominationPublishDate
    )}</p>`,
    event.eventType === "reply" && replyAuthorName
      ? `<p><strong>inReplyTo:</strong> ${qEscapeHtml(replyAuthorName)}</p>`
      : "",
    event.summary ? `<p>${qEscapeHtml(event.summary)}</p>` : "",
    `<p>Open Q-Mintership and load the Minter Board to review the latest data.</p>`,
  ].filter(Boolean)
  return details.join("")
}

const buildMinterNotificationAnnouncementMessage = (event) => {
  const title = getMinterNotificationEventTitle(event)
  return `<h3>${qEscapeHtml(
    title
  )}</h3>${buildMinterNotificationAnnouncementBodyHtml(event)}`
}

const buildMinterNotificationAnnouncementPayload = (event = {}) => ({
  version: MINTER_NOTIFICATION_SCHEMA_VERSION,
  extra: {},
  message: buildMinterNotificationAnnouncementMessage(event),
})

const buildMinterNotificationAnnouncementResource = async (
  event = {},
  groupId = MINTER_NOTIFICATION_GROUP_ID
) => {
  const safeGroupId =
    normalizeMinterNotificationGroupId(groupId) || MINTER_NOTIFICATION_GROUP_ID
  const identifier = `grp-${safeGroupId}-anc-${await uid()}`
  const payload = buildMinterNotificationAnnouncementPayload(event)
  const base64 = await ensureMinterNotificationBase64(payload)
  return {
    name: userState.accountName,
    service: "DOCUMENT",
    identifier,
    base64,
  }
}

const getMinterNotificationRecipientDisplayName = (recipient = {}) =>
  String(recipient.name || recipient.address || "Unknown recipient")

const setMinterNotificationRecipientChannelSelections = (checked) => {
  const checkboxes = Array.from(
    document.querySelectorAll(".notification-recipient-channel-checkbox")
  )
  checkboxes.forEach((checkbox) => {
    if (!checkbox.disabled) {
      checkbox.checked = Boolean(checked)
    }
  })
}

const setMinterNotificationRecipientChannelCheckboxState = (
  recipientKey,
  channel,
  checked,
  disabled = false
) => {
  const key = String(recipientKey || "").trim()
  const normalizedChannel = String(channel || "").trim()
  Array.from(
    document.querySelectorAll(".notification-recipient-channel-checkbox")
  )
    .filter((checkbox) => {
      return (
        String(checkbox.dataset.recipientKey || "").trim() === key &&
        String(checkbox.dataset.channel || "").trim() === normalizedChannel
      )
    })
    .forEach((checkbox) => {
      checkbox.checked = Boolean(checked)
      checkbox.disabled = Boolean(disabled)
    })
}

const setMinterNotificationGroupCheckboxState = (checked, disabled = false) => {
  const checkbox = document.getElementById("notification-send-qchat")
  if (!checkbox) return
  checkbox.checked = Boolean(checked)
  checkbox.disabled = Boolean(disabled)
}

const toggleMinterNotificationIndividualRecipientsVisibility = (checked) => {
  const section = document.getElementById(
    "notification-individual-recipient-section"
  )
  if (!section) return
  section.hidden = !Boolean(checked)
}

const ensureMinterNotificationModal = () => {
  createModal("notification-delivery")
}

const openMinterNotificationDeliveryModal = async (batch) => {
  if (!batch) {
    return
  }
  ensureMinterNotificationModal()
  minterBoardNotificationDeliveryState.batch = batch
  refreshMinterNotificationReviewButton()

  const modal = document.getElementById("notification-delivery-modal")
  const modalContent = document.getElementById(
    "notification-delivery-modalContent"
  )
  if (!modal || !modalContent) return

  const pendingRecipients = batch.pendingRecipients || { qchat: [], qmail: [] }
  const handledRecipients = batch.handledRecipients || { qchat: [], qmail: [] }
  const allRecipients = Array.isArray(batch.recipients) ? batch.recipients : []
  const recipientSections =
    Array.isArray(batch.recipientSections) && batch.recipientSections.length > 0
      ? batch.recipientSections
      : buildMinterNotificationRecipientSections(allRecipients)
  const currentDeliveryState = batch.deliveryState || {}
  const isGroupMember = await getCurrentUserMinterNotificationGroupMembership()
  const broadcastGroupId = normalizeMinterNotificationGroupId(
    batch.broadcastGroupId ?? ""
  )
  const broadcastGroupLabel = `${MINTER_NOTIFICATION_GROUP_NAME} (#${
    broadcastGroupId || MINTER_NOTIFICATION_GROUP_ID
  })`
  const qchatPendingCount = pendingRecipients.qchat.length
  const qmailPendingCount = pendingRecipients.qmail.length
  const qchatHandledCount = handledRecipients.qchat.length
  const qmailHandledCount = handledRecipients.qmail.length
  const hasDirectRecipients = recipientSections.length > 0
  const qchatGroupAlreadySent = Boolean(currentDeliveryState.qchatBroadcastSent)
  const announcementAlreadyPublished = Boolean(
    currentDeliveryState.announcementPublished
  )
  const qchatGroupDisabled = !isGroupMember || qchatGroupAlreadySent
  const announcementDisabled = !isGroupMember
  const alreadySentQchatRecipients = new Set(
    Array.isArray(currentDeliveryState.directQchatRecipientKeysSent)
      ? currentDeliveryState.directQchatRecipientKeysSent
      : []
  )
  const alreadyPublishedQmailRecipients = new Set(
    Array.isArray(currentDeliveryState.directQmailRecipientKeysPublished)
      ? currentDeliveryState.directQmailRecipientKeysPublished
      : []
  )
  modalContent.style.overflow = "hidden"
  modalContent.innerHTML = `
    <div class="notification-delivery-modal-shell">
      <div class="notification-delivery-modal-body">
        <h2>Review Notification Publish</h2>
        <p>${qEscapeHtml(getMinterNotificationEventTitle(batch.event))}</p>
        <div class="notification-delivery-preview-grid">
          <div class="notification-delivery-preview-card">
            <strong>Direct recipients</strong>
            <span>${qEscapeHtml(String(allRecipients.length))} tracked user${
    allRecipients.length === 1 ? "" : "s"
  }</span>
          </div>
          <div class="notification-delivery-preview-card">
            <strong>Pending Q-Chat</strong>
            <span>${qEscapeHtml(
              String(qchatPendingCount)
            )} pending, ${qEscapeHtml(
    String(qchatHandledCount)
  )} already published</span>
          </div>
          <div class="notification-delivery-preview-card">
            <strong>Pending Q-Mail</strong>
            <span>${qEscapeHtml(
              String(qmailPendingCount)
            )} pending, ${qEscapeHtml(
    String(qmailHandledCount)
  )} already published</span>
          </div>
          <div class="notification-delivery-preview-card">
            <strong>Broadcast group</strong>
            <span>${qEscapeHtml(broadcastGroupLabel)}</span>
          </div>
          <div class="notification-delivery-preview-card">
            <strong>State</strong>
            <span>${qEscapeHtml(
              getCurrentMinterNotificationStateIdentifier()
            )}</span>
          </div>
          <div class="notification-delivery-preview-card">
            <strong>Hub announcement</strong>
            <span>${
              announcementAlreadyPublished
                ? "Already published in this session"
                : "Optional off by Default unless Enabled"
            }</span>
          </div>
        </div>
        <div class="notification-delivery-group-note">
          <strong>Group delivery</strong>
          <span>The group Q-Chat is the default path. The Hub announcement publishes one encrypted QDN resource with the Hub-compatible announcement payload.</span>
        </div>
        <div class="notification-delivery-options notification-delivery-options--stacked notification-delivery-options--group">
          <label>
            <input type="checkbox" id="notification-send-qchat" ${
              isGroupMember || qchatGroupAlreadySent ? "checked" : ""
            } ${qchatGroupDisabled ? "disabled" : ""} />
            Publish Q-Chat to ${qEscapeHtml(broadcastGroupLabel)}
          </label>
          <label>
            <input type="checkbox" id="notification-send-announcement" ${
              announcementDisabled ? "disabled" : ""
            } />
            Publish Hub-compatible group announcement for ${qEscapeHtml(
              broadcastGroupLabel
            )}
          </label>
        </div>
        ${
          !isGroupMember
            ? `<div class="notification-delivery-group-note notification-delivery-group-note--warning">
                <strong>Join required for group delivery</strong>
                <span>You can still send direct Q-Chat and Q-Mail notifications now, but the group broadcast and Hub announcement need you to join ${qEscapeHtml(
                  MINTER_NOTIFICATION_GROUP_NAME
                )} first.</span>
                <button type="button" class="notification-group-prompt-button" onclick="joinMinterNotificationGroup()">Join Notifications Group</button>
              </div>`
            : ""
        }
        ${
          hasDirectRecipients
            ? `
              <label class="notification-delivery-individual-toggle">
                <input
                  type="checkbox"
                  id="notification-send-individual"
                  onchange="toggleMinterNotificationIndividualRecipientsVisibility(this.checked)"
                />
                Show individual Q-Chat / Q-Mail recipients
              </label>
              <div id="notification-individual-recipient-section" class="notification-delivery-individual-section" hidden>
                <div class="notification-delivery-group-note">
                  <strong>Individual notifications</strong>
                  <span>Use these checkboxes when you want to send direct Q-Chat and/or Q-Mail messages to the nominator, nominee, minter admins, reply author, and any other tracked users.</span>
                </div>
                <div class="notification-delivery-actions notification-delivery-actions--utility">
                  <button type="button" onclick="setMinterNotificationRecipientChannelSelections(true)">Check All Direct</button>
                  <button type="button" onclick="setMinterNotificationRecipientChannelSelections(false)">Clear All Direct</button>
                </div>
                <div class="notification-delivery-recipient-list">
                  ${recipientSections
                    .map(
                      (section) => `
                        <section class="notification-delivery-recipient-section">
                          <header class="notification-delivery-recipient-section-header">
                            <div>
                              <strong>${qEscapeHtml(section.label)}</strong>
                              <span>${qEscapeHtml(
                                String(section.recipients.length)
                              )} recipient${
                        section.recipients.length === 1 ? "" : "s"
                      }</span>
                            </div>
                          </header>
                          <div class="notification-delivery-recipient-section-body">
                            ${section.recipients
                              .map((recipient) => {
                                const recipientKey =
                                  getMinterNotificationRecipientKey(recipient)
                                const qchatPublished =
                                  isMinterNotificationRecipientPublished(
                                    batch.existingRecord,
                                    recipient,
                                    "qchat"
                                  ) ||
                                  alreadySentQchatRecipients.has(recipientKey)
                                const qmailPublished =
                                  isMinterNotificationRecipientPublished(
                                    batch.existingRecord,
                                    recipient,
                                    "qmail"
                                  ) ||
                                  alreadyPublishedQmailRecipients.has(
                                    recipientKey
                                  )
                                const sourceTags = Array.isArray(
                                  recipient.sources
                                )
                                  ? recipient.sources
                                      .map(
                                        (source) =>
                                          `<em>${qEscapeHtml(source)}</em>`
                                      )
                                      .join("")
                                  : ""
                                const addressLine =
                                  recipient.address &&
                                  recipient.address !== recipient.name
                                    ? `<span class="notification-delivery-recipient-address">${qEscapeHtml(
                                        recipient.address
                                      )}</span>`
                                    : ""
                                const qchatLabel = qchatPublished
                                  ? "Q-Chat sent"
                                  : "Q-Chat"
                                const qmailLabel = qmailPublished
                                  ? "Q-Mail sent"
                                  : "Q-Mail"
                                return `
                                  <div class="notification-delivery-recipient">
                                    <div class="notification-delivery-recipient-copy">
                                      <strong>${qEscapeHtml(
                                        getMinterNotificationRecipientDisplayName(
                                          recipient
                                        )
                                      )}</strong>
                                      ${addressLine}
                                      <span class="notification-delivery-recipient-tags">
                                        ${sourceTags}
                                        ${
                                          recipient.channels?.qchat
                                            ? `<em>${qEscapeHtml(
                                                qchatPublished
                                                  ? "already published"
                                                  : "pending Q-Chat"
                                              )}</em>`
                                            : ""
                                        }
                                        ${
                                          recipient.channels?.qmail
                                            ? `<em>${qEscapeHtml(
                                                qmailPublished
                                                  ? "already published"
                                                  : "pending Q-Mail"
                                              )}</em>`
                                            : ""
                                        }
                                      </span>
                                    </div>
                                    <div class="notification-delivery-recipient-controls">
                                      ${
                                        recipient.channels?.qchat
                                          ? `<label class="notification-delivery-recipient-channel">
                                              <input
                                                type="checkbox"
                                                class="notification-recipient-channel-checkbox"
                                                data-recipient-key="${qEscapeAttr(
                                                  recipientKey
                                                )}"
                                                data-channel="qchat"
                                                ${
                                                  qchatPublished
                                                    ? "checked disabled"
                                                    : ""
                                                }
                                              />
                                              ${qEscapeHtml(qchatLabel)}
                                            </label>`
                                          : ""
                                      }
                                      ${
                                        recipient.channels?.qmail
                                          ? `<label class="notification-delivery-recipient-channel">
                                              <input
                                                type="checkbox"
                                                class="notification-recipient-channel-checkbox"
                                                data-recipient-key="${qEscapeAttr(
                                                  recipientKey
                                                )}"
                                                data-channel="qmail"
                                                ${
                                                  qmailPublished
                                                    ? "checked disabled"
                                                    : ""
                                                }
                                              />
                                              ${qEscapeHtml(qmailLabel)}
                                            </label>`
                                          : ""
                                      }
                                    </div>
                                  </div>
                                `
                              })
                              .join("")}
                          </div>
                        </section>
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
            : `<div class="notification-delivery-empty-state">
                <strong>No direct recipients are pending for this event.</strong>
                <span>You can still publish the group broadcast and Hub announcement.</span>
              </div>`
        }
        <div class="notification-delivery-state-summary">
          <strong>Published state preview</strong>
          <span>Card ${qEscapeHtml(
            batch.event.cardIdentifier || "unknown"
          )}</span>
          <span>Action ${qEscapeHtml(
            batch.stateRecord?.actionKey || "pending"
          )}</span>
          <span>Stored actions ${qEscapeHtml(
            String(batch.state?.summary?.totalActions || 0)
          )}</span>
          <span>Broadcast group ${qEscapeHtml(broadcastGroupLabel)}</span>
          <span>Announcement ${
            announcementAlreadyPublished ? "published" : "not selected"
          }</span>
        </div>
      </div>
      <div class="notification-delivery-footer">
        <div class="notification-delivery-actions">
          <button type="button" onclick="sendMinterBoardNotificationDeliveries()">Publish Notifications</button>
          <button type="button" onclick="closeModal('notification-delivery')">Review Later</button>
        </div>
        <p id="notification-delivery-status" class="board-progress-muted"></p>
      </div>
    </div>
  `
  modal.style.display = "block"
}

const notifyMinterBoardEvent = async (event) => {
  try {
    if (!userState.accountName) return
    const eventContext = getMinterNotificationEventContext(event)
    const normalizedEvent = {
      ...event,
      nomineeName: event.nomineeName || eventContext.nomineeName,
      nominatorName: event.nominatorName || eventContext.nominatorName,
      nominationTimestamp:
        event.nominationTimestamp || eventContext.nominationTimestamp,
      nominationPublishDate:
        event.nominationPublishDate || eventContext.nominationPublishDate,
      replyAuthorName:
        event.replyAuthorName ||
        event.replyTo?.creator ||
        eventContext.replyAuthorName,
    }
    const batch = await buildMinterNotificationPublishBatch(normalizedEvent)
    await openMinterNotificationDeliveryModal(batch)
  } catch (error) {
    console.warn("Unable to prepare notification event:", error)
  }
}

const buildQmailIdentifier = async (recipient, event = {}) => {
  const safeName = String(recipient.name || "recipient")
    .slice(0, 12)
    .replace(/\s+/g, "")
  const suffix = String(recipient.address || "").slice(-6) || "000000"
  const randomPart = await uid()
  const safeAction = String(event.eventType || "notification")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 12)
  return `${MINTER_NOTIFICATION_QMAIL_IDENTIFIER_PREFIX}${safeName}_${suffix}_mail_${
    safeAction || "notification"
  }_${randomPart}`
}

const buildMinterNotificationQmailResource = async (
  recipient,
  event,
  message
) => {
  if (!recipient.name || !recipient.address || !recipient.publicKey) return null
  const payload = {
    subject: getMinterNotificationEventTitle(event),
    createdAt: Date.now(),
    version: 1,
    attachments: [],
    textContentV2: message,
    generalData: { thread: [], threadV2: [] },
    recipient: recipient.name,
  }
  const base64 = await ensureMinterNotificationBase64(payload)
  const encrypted = await qortalRequest({
    action: "ENCRYPT_DATA",
    base64,
    publicKeys: [recipient.publicKey],
  })
  const encryptedData = resolveMinterNotificationQortalData64(encrypted)
  if (!encryptedData) return null
  return {
    name: userState.accountName,
    service: "MAIL_PRIVATE",
    identifier: await buildQmailIdentifier(recipient, event),
    base64: encryptedData,
  }
}

const sendMinterBoardNotificationDeliveries = async () => {
  const statusEl = document.getElementById("notification-delivery-status")
  const batch = minterBoardNotificationDeliveryState.batch
  if (!batch || minterBoardNotificationDeliveryState.isPublishing) {
    return
  }

  const sendGroupQchat = Boolean(
    document.getElementById("notification-send-qchat")?.checked
  )
  const sendAnnouncement = Boolean(
    document.getElementById("notification-send-announcement")?.checked
  )
  const sendIndividualNotifications = Boolean(
    document.getElementById("notification-send-individual")?.checked
  )
  const broadcastGroupId =
    resolveMinterNotificationBroadcastGroupId() || MINTER_NOTIFICATION_GROUP_ID
  const deliveryState = batch.deliveryState || (batch.deliveryState = {})
  const recipientMap = new Map(
    (Array.isArray(batch.recipients) ? batch.recipients : []).map(
      (recipient) => [getMinterNotificationRecipientKey(recipient), recipient]
    )
  )
  const selectedRecipientMap = new Map()
  const previouslySentQchatKeys = new Set(
    Array.isArray(deliveryState.directQchatRecipientKeysSent)
      ? deliveryState.directQchatRecipientKeysSent
      : []
  )
  const previouslyPublishedQmailKeys = new Set(
    Array.isArray(deliveryState.directQmailRecipientKeysPublished)
      ? deliveryState.directQmailRecipientKeysPublished
      : []
  )

  if (sendIndividualNotifications) {
    document
      .querySelectorAll(".notification-recipient-channel-checkbox")
      .forEach((checkbox) => {
        if (!checkbox.checked || checkbox.disabled) return
        const recipientKey = String(checkbox.dataset.recipientKey || "").trim()
        const channel = String(checkbox.dataset.channel || "").trim()
        const recipient = recipientMap.get(recipientKey)
        if (!recipient || !channel) return
        const existing = selectedRecipientMap.get(recipientKey) || {
          ...recipient,
          channels: {
            qchat: false,
            qmail: false,
          },
        }
        existing.channels = {
          qchat: Boolean(existing.channels?.qchat || channel === "qchat"),
          qmail: Boolean(existing.channels?.qmail || channel === "qmail"),
        }
        selectedRecipientMap.set(recipientKey, existing)
      })
  }

  const selectedDirectRecipients = sendIndividualNotifications
    ? Array.from(selectedRecipientMap.values())
    : []
  const selectedDirectQchatRecipients = selectedDirectRecipients.filter(
    (recipient) =>
      recipient.channels?.qchat &&
      !previouslySentQchatKeys.has(getMinterNotificationRecipientKey(recipient))
  )
  const selectedDirectQmailRecipients = selectedDirectRecipients.filter(
    (recipient) =>
      recipient.channels?.qmail &&
      !previouslyPublishedQmailKeys.has(
        getMinterNotificationRecipientKey(recipient)
      )
  )

  if (
    !sendGroupQchat &&
    !sendAnnouncement &&
    selectedDirectQchatRecipients.length === 0 &&
    selectedDirectQmailRecipients.length === 0
  ) {
    alert("Select at least one notification delivery to publish.")
    return
  }

  minterBoardNotificationDeliveryState.isPublishing = true
  try {
    if (statusEl) statusEl.textContent = "Preparing notification deliveries..."

    const message = buildMinterNotificationMessage(batch.event)
    const fullContent = buildMinterNotificationRichTextDoc(batch.event)
    const markDeliveryChannel = (recipient, channel) => ({
      ...recipient,
      channels: {
        qchat: channel === "qchat",
        qmail: channel === "qmail",
      },
    })

    let qchatGroupSent = false
    let qchatDirectCount = 0
    let announcementResource = null
    const successfulQchatRecipients = []
    const qmailResources = []
    const preparedQmailRecipients = []
    const qmailRecipientKeys = []

    if (sendGroupQchat && !deliveryState.qchatBroadcastSent) {
      try {
        await sendMinterNotificationChatMessage({
          groupId: broadcastGroupId,
          message,
          fullContent,
        })
        qchatGroupSent = true
        deliveryState.qchatBroadcastSent = true
        setMinterNotificationGroupCheckboxState(true, true)
      } catch (error) {
        console.warn("Notification Q-Chat group delivery failed:", error)
      }
    }

    for (const recipient of selectedDirectQchatRecipients) {
      try {
        await sendMinterNotificationChatMessage({
          recipient: recipient.address || recipient.name,
          message,
          fullContent,
        })
        qchatDirectCount += 1
        const recipientKey = getMinterNotificationRecipientKey(recipient)
        if (recipientKey) {
          previouslySentQchatKeys.add(recipientKey)
          setMinterNotificationRecipientChannelCheckboxState(
            recipientKey,
            "qchat",
            true,
            true
          )
        }
        successfulQchatRecipients.push(markDeliveryChannel(recipient, "qchat"))
      } catch (error) {
        console.warn(
          "Notification direct Q-Chat delivery failed for recipient:",
          recipient,
          error
        )
      }
    }

    for (const recipient of selectedDirectQmailRecipients) {
      try {
        const resource = await buildMinterNotificationQmailResource(
          recipient,
          batch.event,
          message
        )
        if (resource) {
          qmailResources.push(resource)
          preparedQmailRecipients.push(recipient)
          qmailRecipientKeys.push(getMinterNotificationRecipientKey(recipient))
        }
      } catch (error) {
        console.warn(
          "Notification Q-Mail preparation failed for recipient:",
          recipient,
          error
        )
      }
    }

    if (sendAnnouncement) {
      try {
        announcementResource =
          await buildMinterNotificationAnnouncementResource(
            batch.event,
            broadcastGroupId
          )
      } catch (error) {
        console.warn(
          "Notification group announcement preparation failed:",
          error
        )
        announcementResource = null
      }
    }

    const qdnRecipientsForState = mergeMinterNotificationRecipients(
      successfulQchatRecipients,
      preparedQmailRecipients.map((recipient) =>
        markDeliveryChannel(recipient, "qmail")
      )
    )
    const deliveryMeta = {
      qchatBroadcastSent: qchatGroupSent,
      announcementPublished: Boolean(announcementResource),
      announcementGroupId: announcementResource ? broadcastGroupId : null,
      announcementIdentifier: announcementResource?.identifier || "",
    }
    const stateRecord = mergeMinterNotificationStateRecord(
      batch.existingRecord || {},
      buildMinterNotificationStateRecord(
        batch.event,
        qdnRecipientsForState,
        broadcastGroupId,
        deliveryMeta
      )
    )
    const nextState = mergeMinterNotificationState(
      batch.currentState || {},
      stateRecord
    )
    nextState.notificationGroupId = normalizeMinterNotificationGroupId(
      broadcastGroupId ?? nextState.notificationGroupId ?? ""
    )

    const eventData64 =
      batch.eventData64 || (await ensureMinterNotificationBase64(batch.event))
    const stateData64 =
      (await ensureMinterNotificationBase64(nextState)) ||
      btoa(JSON.stringify(nextState))

    const resources = [
      {
        name: userState.accountName,
        service: "BLOG_POST",
        identifier: batch.event.eventId,
        base64: eventData64,
      },
      {
        name: userState.accountName,
        service: "BLOG_POST",
        identifier: getCurrentMinterNotificationStateIdentifier(),
        base64: stateData64,
      },
      ...qmailResources,
      ...(announcementResource ? [announcementResource] : []),
    ]

    if (statusEl) {
      const qchatSelectionText = qchatGroupSent
        ? "group broadcast"
        : "group broadcast skipped"
      statusEl.textContent = `Publishing ${qchatSelectionText}, ${qchatDirectCount} direct Q-Chat message${
        qchatDirectCount === 1 ? "" : "s"
      }, ${qmailResources.length} Q-Mail notification${
        qmailResources.length === 1 ? "" : "s"
      }${announcementResource ? ", and 1 Hub announcement" : ""}...`
    }

    await qortalRequest({
      action: "PUBLISH_MULTIPLE_QDN_RESOURCES",
      resources,
    })

    deliveryState.statePublished = true
    deliveryState.directQchatRecipientKeysSent = Array.from(
      new Set([...previouslySentQchatKeys])
    )
    if (qmailRecipientKeys.length > 0) {
      deliveryState.directQmailRecipientKeysPublished = Array.from(
        new Set([
          ...previouslyPublishedQmailKeys,
          ...qmailRecipientKeys.filter(Boolean),
        ])
      )
    }
    if (announcementResource) {
      deliveryState.announcementPublished = true
      deliveryState.announcementIdentifier = announcementResource.identifier
    }

    minterBoardNotificationStateCache.timestamp = 0
    minterBoardNotificationStateCache.data = [nextState]
    minterBoardNotificationDeliveryState.batch = null
    refreshMinterNotificationReviewButton()

    if (statusEl) {
      if (
        qchatGroupSent ||
        qchatDirectCount > 0 ||
        qmailResources.length > 0 ||
        announcementResource
      ) {
        statusEl.textContent = `Published shared state plus ${
          qchatGroupSent ? "1 Q-Chat group broadcast, " : ""
        }${qchatDirectCount} direct Q-Chat notification${
          qchatDirectCount === 1 ? "" : "s"
        }, ${qmailResources.length} Q-Mail notification${
          qmailResources.length === 1 ? "" : "s"
        }${
          announcementResource
            ? ", and 1 Hub-compatible group announcement"
            : ""
        }.`
      } else {
        statusEl.textContent =
          "Published shared state, but none of the selected deliveries succeeded."
      }
    }
    window.setTimeout(() => {
      closeModal("notification-delivery")
    }, 900)
  } catch (error) {
    console.error("Unable to publish notifications:", error)
    if (statusEl) {
      if (deliveryState.qchatBroadcastSent) {
        statusEl.textContent =
          "The Q-Chat group broadcast succeeded, but the combined notification publish did not complete. You can retry the remaining QDN resources without resending the group chat."
      } else if (
        Array.isArray(deliveryState.directQchatRecipientKeysSent) &&
        deliveryState.directQchatRecipientKeysSent.length > 0
      ) {
        statusEl.textContent =
          "Some direct Q-Chat messages were sent, but the combined notification publish did not complete. You can retry the remaining QDN resources without resending those direct messages."
      } else {
        statusEl.textContent =
          "Unable to publish notifications. Review the selections and try again."
      }
    }
  } finally {
    minterBoardNotificationDeliveryState.isPublishing = false
  }
}

const updateMinterBoardCounterText = () => {
  const counterSpan = minterBoardInfiniteState.counterSpan
  if (!counterSpan) return
  const displayed = minterBoardInfiniteState.displayedCount
  const minted = minterBoardInfiniteState.mintedCount
  const total =
    minterBoardInfiniteState.totalCount ||
    minterBoardInfiniteState.cards.length ||
    0

  if (minterBoardInfiniteState.isBackgroundLoading && total > 0) {
    const loadingHtml =
      typeof getBoardInlineLoadingHTML === "function"
        ? getBoardInlineLoadingHTML(
            `Loading cards ${Math.min(displayed, total)}/${total}`
          )
        : "Loading cards..."
    counterSpan.innerHTML = `${loadingHtml} <span class="board-progress-muted">(${minted} minters)</span>`
    return
  }

  counterSpan.textContent = `(${displayed} displayed, ${minted} minters)`
}

const maybeRenderMoreMinterBoardCards = async (loadToken) => {
  if (loadToken !== minterBoardInfiniteState.loadToken) return
  if (minterBoardInfiniteState.inFlight || minterBoardInfiniteState.complete)
    return
  await renderMinterBoardCardBatch(loadToken)
}

const startMinterBoardBackgroundRender = (loadToken) => {
  if (minterBoardInfiniteState.backgroundRunnerToken === loadToken) return
  minterBoardInfiniteState.backgroundRunnerToken = loadToken
  const run = async () => {
    try {
      while (
        loadToken === minterBoardInfiniteState.loadToken &&
        !minterBoardInfiniteState.complete
      ) {
        await maybeRenderMoreMinterBoardCards(loadToken)
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } catch (error) {
      console.warn("Error during minter board background render:", error)
    } finally {
      if (minterBoardInfiniteState.backgroundRunnerToken === loadToken) {
        minterBoardInfiniteState.backgroundRunnerToken = 0
      }
    }
  }
  run()
}

const renderMinterBoardCardBatch = async (loadToken) => {
  // Kakashi Note: Load token checks cancel stale render work when filters or sorts change mid-load.
  if (loadToken !== minterBoardInfiniteState.loadToken) return
  if (minterBoardInfiniteState.inFlight || minterBoardInfiniteState.complete)
    return
  const cardsContainer = minterBoardInfiniteState.container
  if (!cardsContainer || !document.body.contains(cardsContainer)) {
    minterBoardInfiniteState.complete = true
    minterBoardInfiniteState.inFlight = false
    minterBoardInfiniteState.isBackgroundLoading = false
    detachMinterBoardInfiniteScroll()
    updateMinterBoardCounterText()
    return
  }

  const start = minterBoardInfiniteState.cursor
  const end = Math.min(
    start + MINTER_SCROLL_BATCH_SIZE,
    minterBoardInfiniteState.cards.length
  )
  if (start >= end) {
    minterBoardInfiniteState.complete = true
    minterBoardInfiniteState.isBackgroundLoading = false
    updateMinterBoardCounterText()
    return
  }

  const batch = minterBoardInfiniteState.cards.slice(start, end)
  minterBoardInfiniteState.cursor = end
  minterBoardInfiniteState.inFlight = true

  // Kakashi Note: Insert skeletons first so users see progress immediately while details finalize concurrently.
  for (const card of batch) {
    if (loadToken !== minterBoardInfiniteState.loadToken) {
      minterBoardInfiniteState.inFlight = false
      return
    }
    cardsContainer.insertAdjacentHTML(
      "beforeend",
      createSkeletonCardHTML(card.identifier)
    )
  }

  const finalizeTasks = batch.map((card) => {
    return async () => {
      if (loadToken !== minterBoardInfiniteState.loadToken) return

      try {
        const data = await fetchMinterBoardCardDataCached(card)

        if (!data || !data.poll) {
          if (loadToken === minterBoardInfiniteState.loadToken) {
            removeSkeleton(card.identifier)
          }
          return
        }

        if (!card._optimisticCard) {
          const pollPublisherAddress = await getPollOwnerAddressCached(
            data.poll
          )
          const cardPublisherAddress = await fetchOwnerAddressFromNameCached(
            card.name
          )
          if (pollPublisherAddress !== cardPublisherAddress) {
            if (loadToken === minterBoardInfiniteState.loadToken) {
              removeSkeleton(card.identifier)
            }
            return
          }
        }

        if (minterBoardInfiniteState.isARBoard) {
          const ok = await verifyMinterCached(data.minterName)
          if (!ok) {
            if (loadToken === minterBoardInfiniteState.loadToken) {
              removeSkeleton(card.identifier)
            }
            return
          }
        } else {
          const isAlready = await verifyMinterCached(
            getCardNomineeName(data, getCardNomineeAddress(data))
          )
          if (isAlready) {
            minterBoardInfiniteState.mintedCount += 1
            updateMinterBoardCounterText()

            if (!minterBoardInfiniteState.showExisting) {
              if (loadToken === minterBoardInfiniteState.loadToken) {
                removeSkeleton(card.identifier)
              }
              return
            }

            const cardUpdatedTime = card.updated || card.created || null
            const bgColor = generateDarkPastelBackgroundBy(card.name)
            const commentCount = await countCommentsCached(
              card.identifier,
              loadToken
            ).catch(() => 0)
            const finalCardHTML = await createCardHTML(
              data,
              null,
              card.identifier,
              commentCount,
              cardUpdatedTime,
              bgColor,
              getCardNomineeAddress(data, card.name || ""),
              /* isExistingMinter= */ true
            )

            if (loadToken === minterBoardInfiniteState.loadToken) {
              minterBoardInfiniteState.displayedCount += 1
              updateMinterBoardCounterText()
              replaceSkeleton(card.identifier, finalCardHTML)
              void hydrateMinterCardNotificationButton(card.identifier)
              void hydrateMinterBoardCommentCount(card.identifier, loadToken)
              void hydrateMinterBoardCardDisplay({
                cardResource: card,
                cardData: data,
                cardIdentifier: card.identifier,
                isExistingMinter: true,
                loadToken,
              })
            }
            return
          }
        }

        const cardUpdatedTime = card.updated || card.created || null
        const bgColor = generateDarkPastelBackgroundBy(card.name)
        const commentCount = await countCommentsCached(
          card.identifier,
          loadToken
        ).catch(() => 0)
        const pollResults = minterBoardInfiniteState.isARBoard
          ? await fetchPollResultsCached(data.poll)
          : null
        const finalCardHTML = minterBoardInfiniteState.isARBoard
          ? await createARCardHTML(
              data,
              pollResults,
              card.identifier,
              commentCount,
              cardUpdatedTime,
              bgColor,
              await fetchOwnerAddressFromNameCached(card.name),
              card.isDuplicate
            )
          : await createCardHTML(
              data,
              null,
              card.identifier,
              commentCount,
              cardUpdatedTime,
              bgColor,
              getCardNomineeAddress(data, card.name || "")
            )

        if (loadToken === minterBoardInfiniteState.loadToken) {
          minterBoardInfiniteState.displayedCount += 1
          updateMinterBoardCounterText()
          replaceSkeleton(card.identifier, finalCardHTML)
          void hydrateMinterCardNotificationButton(card.identifier)
          void hydrateMinterBoardCommentCount(card.identifier, loadToken)
          if (!minterBoardInfiniteState.isARBoard) {
            void hydrateMinterBoardCardDisplay({
              cardResource: card,
              cardData: data,
              cardIdentifier: card.identifier,
              isExistingMinter: false,
              loadToken,
            })
          }
        }
      } catch (error) {
        console.error(`Error finalizing card ${card.identifier}:`, error)
        if (loadToken === minterBoardInfiniteState.loadToken) {
          removeSkeleton(card.identifier)
        }
      }
    }
  })

  try {
    await runWithConcurrency(finalizeTasks, 8)
  } finally {
    minterBoardInfiniteState.inFlight = false
  }

  if (loadToken !== minterBoardInfiniteState.loadToken) return

  if (
    minterBoardInfiniteState.cursor >= minterBoardInfiniteState.cards.length
  ) {
    minterBoardInfiniteState.complete = true
    minterBoardInfiniteState.isBackgroundLoading = false
  }
  updateMinterBoardCounterText()
}

//Main function to load the Minter Cards ----------------------------------------
const loadCards = async (cardIdentifierPrefix, forceSearch = false) => {
  const loadToken = minterBoardInfiniteState.loadToken + 1
  minterBoardInfiniteState.loadToken = loadToken
  detachMinterBoardInfiniteScroll()
  minterBoardInfiniteState.cards = []
  minterBoardInfiniteState.cursor = 0
  minterBoardInfiniteState.inFlight = false
  minterBoardInfiniteState.complete = false
  minterBoardInfiniteState.isARBoard = false
  minterBoardInfiniteState.showExisting = false
  minterBoardInfiniteState.displayedCount = 0
  minterBoardInfiniteState.mintedCount = 0
  minterBoardInfiniteState.totalCount = 0
  minterBoardInfiniteState.isBackgroundLoading = false
  minterBoardInfiniteState.counterSpan = null
  minterBoardInfiniteState.container = null
  minterBoardInfiniteState.backgroundRunnerToken = 0
  minterBoardUpdateState.cardSnapshot.clear()
  minterBoardUpdateState.commentSnapshot.clear()
  minterBoardUpdateState.pollSnapshot.clear()
  hideMinterBoardUpdateBanner()
  minterBoardCardDataByIdentifier.clear()
  commentCountCache.clear()

  if (forceSearch) {
    minterBoardCardDataCache.clear()
    resolvedMinterNameByIdentifierCache.clear()
    verifyMinterCache.clear()
    if (typeof clearPollResultsCache === "function") {
      clearPollResultsCache()
    }
  }

  if (
    !cachedMinterGroup ||
    cachedMinterGroup.length === 0 ||
    !cachedMinterAdmins ||
    getEffectiveMinterAdminCount(cachedMinterAdmins) === 0
  ) {
    await initializeCachedGroups()
  }
  const cardsContainer = document.getElementById("cards-container")
  const displayMode = getMinterBoardDisplayMode()
  cardsContainer.classList.toggle(
    "cards-container--list",
    displayMode === "list"
  )
  cardsContainer.classList.toggle(
    "cards-container--grid",
    displayMode !== "list"
  )
  cardsContainer.innerHTML = getBoardLoadingHTML("Loading cards...")

  const counterSpan = document.getElementById("board-card-counter")
  if (counterSpan) counterSpan.textContent = "(loading...)"

  const isARBoard = cardIdentifierPrefix.startsWith("QM-AR-card")
  const showExistingCheckbox = document.getElementById("show-existing-checkbox")
  const showExisting = showExistingCheckbox && showExistingCheckbox.checked
  minterBoardInfiniteState.isARBoard = isARBoard
  minterBoardInfiniteState.showExisting = !!showExisting
  minterBoardInfiniteState.counterSpan = counterSpan
  minterBoardInfiniteState.container = cardsContainer

  let afterTime = 0
  let dayRange = 0
  const timeRangeSelect = document.getElementById("time-range-select")
  if (timeRangeSelect) {
    const days = parseInt(timeRangeSelect.value, 10)
    dayRange = Number.isNaN(days) ? 0 : days
    if (dayRange > 0) {
      const now = Date.now()
      afterTime = now - dayRange * 24 * 60 * 60 * 1000
    }
  }

  try {
    const rawResults = await fetchCachedBoardSearchResources(
      cardIdentifierPrefix,
      dayRange,
      afterTime,
      forceSearch
    )
    if (loadToken !== minterBoardInfiniteState.loadToken) return

    if (!rawResults || rawResults.length === 0) {
      minterBoardInfiniteState.totalCount = 0
      minterBoardInfiniteState.isBackgroundLoading = false
      cardsContainer.innerHTML = "<p>No cards found.</p>"
      if (counterSpan) counterSpan.textContent = "(0 displayed, 0 minters)"
      return
    }

    const validated = (
      await Promise.all(
        rawResults.map(async (r) =>
          (await validateCardStructure(r)) ? r : null
        )
      )
    ).filter(Boolean)
    if (loadToken !== minterBoardInfiniteState.loadToken) return

    if (validated.length === 0) {
      minterBoardInfiniteState.totalCount = 0
      minterBoardInfiniteState.isBackgroundLoading = false
      cardsContainer.innerHTML = "<p>No valid cards found.</p>"
      if (counterSpan) counterSpan.textContent = "(0 displayed, 0 minters)"
      return
    }

    let processedCards
    if (isARBoard) {
      processedCards = await processARBoardCards(validated)
    } else {
      processedCards = await processMinterBoardCards(validated)
    }

    let selectedSort = "newest"
    const sortSelect = document.getElementById("sort-select")
    if (sortSelect) {
      selectedSort = sortSelect.value
    }
    const isVoteSort =
      selectedSort === "least-votes" || selectedSort === "most-votes"
    if (isVoteSort) {
      // Kakashi Note: Vote sorting needs extra poll fetches, so we show explicit status instead of a silent delay.
      cardsContainer.innerHTML = getBoardLoadingHTML(
        "Loading and resorting cards by votes..."
      )
      if (counterSpan)
        counterSpan.textContent = "(loading and resorting by votes...)"
    }

    const getCardTimestamp = (card) => card.updated || card.created || 0
    const compareNames = (nameA, nameB) => {
      const safeA = (nameA || "").trim()
      const safeB = (nameB || "").trim()
      return safeA.localeCompare(safeB, undefined, { sensitivity: "base" })
    }

    if (selectedSort === "name" || selectedSort === "nominee-name") {
      const nomineeNameByCard = new WeakMap()
      await Promise.all(
        processedCards.map(async (card) => {
          const cachedNominee = resolvedMinterNameByIdentifierCache.get(
            card.identifier
          )
          if (cachedNominee) {
            nomineeNameByCard.set(card, cachedNominee)
            return
          }
          try {
            const nomineeName = await extractMinterCardsMinterName(
              card.identifier
            )
            nomineeNameByCard.set(card, nomineeName || "")
          } catch (error) {
            nomineeNameByCard.set(card, card.name || "")
          }
        })
      )

      processedCards.sort((a, b) => {
        const nomineeA = nomineeNameByCard.get(a) || ""
        const nomineeB = nomineeNameByCard.get(b) || ""
        const byNominee = compareNames(nomineeA, nomineeB)
        if (byNominee !== 0) return byNominee
        return getCardTimestamp(b) - getCardTimestamp(a)
      })
    } else if (selectedSort === "publisher-name") {
      processedCards.sort((a, b) => {
        const byPublisher = compareNames(a.name, b.name)
        if (byPublisher !== 0) return byPublisher
        return getCardTimestamp(b) - getCardTimestamp(a)
      })
    } else if (selectedSort === "recent-comments") {
      // Compute comment timestamps only when this sort is selected.
      for (const card of processedCards) {
        card.newestCommentTimestamp = await getNewestCommentTimestamp(
          card.identifier
        )
      }
      processedCards.sort(
        (a, b) =>
          (b.newestCommentTimestamp || 0) - (a.newestCommentTimestamp || 0)
      )
    } else if (selectedSort === "least-votes") {
      await applyVoteSortingData(processedCards, /* ascending= */ true)
    } else if (selectedSort === "most-votes") {
      await applyVoteSortingData(processedCards, /* ascending= */ false)
    }

    if (loadToken !== minterBoardInfiniteState.loadToken) return
    cardsContainer.innerHTML = ""
    if (displayMode === "list") {
      cardsContainer.insertAdjacentHTML(
        "beforeend",
        getMinterBoardListHeaderHTML()
      )
    }
    setMinterBoardCardSnapshot(validated)
    minterBoardInfiniteState.cards = processedCards
    minterBoardInfiniteState.cursor = 0
    minterBoardInfiniteState.complete = false
    minterBoardInfiniteState.displayedCount = 0
    minterBoardInfiniteState.mintedCount = 0
    minterBoardInfiniteState.totalCount = processedCards.length
    minterBoardInfiniteState.isBackgroundLoading = processedCards.length > 0
    updateMinterBoardCounterText()

    startMinterBoardBackgroundRender(loadToken)
    startMinterBoardBackgroundUpdateChecks()
  } catch (error) {
    if (loadToken !== minterBoardInfiniteState.loadToken) return
    minterBoardInfiniteState.isBackgroundLoading = false
    console.error("Error loading cards:", error)
    cardsContainer.innerHTML = "<p>Failed to load cards.</p>"
    if (counterSpan) {
      counterSpan.textContent = "(error loading)"
    }
  }
}

const verifyMinterCache = new Map()
const verifyMinterCached = async (nameOrAddress) => {
  if (verifyMinterCache.has(nameOrAddress)) {
    return verifyMinterCache.get(nameOrAddress)
  }
  const result = await verifyMinter(nameOrAddress)
  verifyMinterCache.set(nameOrAddress, result)
  return result
}

const verifyMinter = async (minterName) => {
  try {
    const nameInfo = await getNameInfoCached(minterName)

    if (!nameInfo) return false
    const minterAddress = nameInfo.owner
    const isValid = await getAddressInfo(minterAddress)

    if (!isValid) return false
    // Then check if they're in the minter group
    // const minterGroup = await fetchMinterGroupMembers()
    const minterGroup = cachedMinterGroup
    // const adminGroup = await fetchMinterGroupAdmins()
    const adminGroup = cachedMinterAdmins
    const minterGroupAddresses = minterGroup.map((m) => m.member)
    const adminGroupAddresses = adminGroup.map((m) => m.member)

    return (
      minterGroupAddresses.includes(minterAddress) ||
      adminGroupAddresses.includes(minterAddress)
    )
  } catch (err) {
    console.warn("verifyMinter error:", err)
    return false
  }
}

const applyVoteSortingData = async (cards, ascending = true) => {
  // const minterGroupMembers = await fetchMinterGroupMembers()
  const minterGroupMembers = cachedMinterGroup
  // const minterAdmins = await fetchMinterGroupAdmins()
  const minterAdmins = cachedMinterAdmins

  for (const card of cards) {
    try {
      const cardDataResponse = await fetchMinterBoardCardDataCached(card)
      if (!cardDataResponse || !cardDataResponse.poll) {
        card._adminVotes = 0
        card._adminYes = 0
        card._minterVotes = 0
        card._minterYes = 0
        continue
      }
      const pollResults = await fetchPollResultsCached(cardDataResponse.poll)
      const { adminYes, adminNo, minterYes, minterNo } = await processPollData(
        pollResults,
        minterGroupMembers,
        minterAdmins,
        getCardNomineeName(cardDataResponse),
        card.identifier
      )
      card._adminVotes = adminYes + adminNo
      card._adminYes = adminYes
      card._minterVotes = minterYes + minterNo
      card._minterYes = minterYes
    } catch (error) {
      console.warn(
        `Error fetching or processing poll for card ${card.identifier}:`,
        error
      )
      card._adminVotes = 0
      card._adminYes = 0
      card._minterVotes = 0
      card._minterYes = 0
    }
  }

  if (ascending) {
    // least votes first
    cards.sort((a, b) => {
      const diffAdminTotal = a._adminVotes - b._adminVotes
      if (diffAdminTotal !== 0) return diffAdminTotal
      const diffAdminYes = a._adminYes - b._adminYes
      if (diffAdminYes !== 0) return diffAdminYes
      const diffMinterTotal = a._minterVotes - b._minterVotes
      if (diffMinterTotal !== 0) return diffMinterTotal
      return a._minterYes - b._minterYes
    })
  } else {
    // most votes first
    cards.sort((a, b) => {
      const diffAdminTotal = b._adminVotes - a._adminVotes
      if (diffAdminTotal !== 0) return diffAdminTotal
      const diffAdminYes = b._adminYes - a._adminYes
      if (diffAdminYes !== 0) return diffAdminYes
      const diffMinterTotal = b._minterVotes - a._minterVotes
      if (diffMinterTotal !== 0) return diffMinterTotal
      return b._minterYes - a._minterYes
    })
  }
}

const removeSkeleton = (cardIdentifier) => {
  const skeletonCard = document.getElementById(`skeleton-${cardIdentifier}`)
  if (skeletonCard) {
    skeletonCard.remove()
  }
}

const replaceSkeleton = (cardIdentifier, htmlContent) => {
  const skeletonCard = document.getElementById(`skeleton-${cardIdentifier}`)
  if (skeletonCard) {
    skeletonCard.outerHTML = htmlContent
  }
}

const createSkeletonCardHTML = (cardIdentifier) => {
  if (getMinterBoardDisplayMode() === "list") {
    return `
      <div id="skeleton-${cardIdentifier}" class="minter-list-card minter-list-card--skeleton">
        <div class="minter-list-row">
          <div class="minter-list-person">
            <div class="minter-list-skeleton-avatar"></div>
            <div class="minter-list-skeleton-copy">
              <span></span>
              <span></span>
            </div>
          </div>
          <div class="minter-list-skeleton-line"></div>
          <div class="minter-list-skeleton-line minter-list-skeleton-line--wide"></div>
          <div class="minter-list-skeleton-line"></div>
          <div class="minter-list-skeleton-button"></div>
        </div>
      </div>
    `
  }

  return `
    <div id="skeleton-${cardIdentifier}" class="skeleton-card" style="padding: 10px; border: 1px solid gray; margin: 10px 0;">
      <div style="display: flex; align-items: center;">
        <div><p style="color:rgb(174, 174, 174)">LOADING CARD...</p></div>
        <div style="width: 50px; height: 50px; background-color: #ccc; border-radius: 50%;"></div>
        <div style="margin-left: 10px;">
          <div style="width: 120px; height: 20px; background-color: #ccc; margin-bottom: 5px;"></div>
          <div style="width: 80px; height: 15px; background-color: #ddd;"></div>
        </div>
      </div>
      <div style="margin-top: 10px;">
        <div style="width: 100%; height: 80px; background-color: #eee; color:rgb(17, 24, 28); padding: 0.22vh"><p>PLEASE BE PATIENT</p><p style="color: #11121c"> While data loads from QDN...</div>
      </div>
    </div>
  `
}

const getMinterBoardListHeaderHTML = () => `
  <div class="minter-list-header" aria-hidden="true">
    <span>Name</span>
    <span>Created</span>
    <span>Application Status</span>
    <span>Comments</span>
    <span>Actions</span>
  </div>
`

const resolveNomineeIdentity = async (rawNomineeInput) => {
  // Kakashi Note: Nominee must resolve to a registered name so duplicate checks and moderation stay identity-safe.
  const nomineeInput = (rawNomineeInput || "").trim()
  if (!nomineeInput) {
    return { error: "Nominee name or address is required." }
  }

  const directNameInfo = await getNameInfoCached(nomineeInput)
  if (directNameInfo && directNameInfo.owner) {
    return {
      nomineeName: directNameInfo.name || nomineeInput,
      nomineeAddress: directNameInfo.owner,
    }
  }

  const nameFromAddress = await getNameFromAddress(nomineeInput)
  if (nameFromAddress && nameFromAddress !== nomineeInput) {
    const resolvedNameInfo = await getNameInfoCached(nameFromAddress)
    if (resolvedNameInfo && resolvedNameInfo.owner) {
      return {
        nomineeName: resolvedNameInfo.name || nameFromAddress,
        nomineeAddress: resolvedNameInfo.owner,
      }
    }
  }

  return {
    error:
      "Nominee must have a registered Qortal name. Enter a valid name, or an address that has a registered name.",
  }
}

// Function to find existing nomination cards for a nominee ----------------------------------------
const fetchExistingCardsByNominee = async (
  cardIdentifierPrefix,
  nomineeName
) => {
  try {
    const response = await searchSimple(
      "BLOG_POST",
      `${cardIdentifierPrefix}`,
      "",
      0,
      0,
      "",
      true
    )

    if (!response || !Array.isArray(response) || response.length === 0) {
      return []
    }

    const validatedCards = await Promise.all(
      response.map(async (card) => {
        const isValid = await validateCardStructure(card)
        return isValid ? card : null
      })
    )

    const validCards = validatedCards.filter((card) => card !== null)

    if (!validCards.length) {
      return []
    }

    // Kakashi Note: Duplicate nomination checks are keyed by nominee identity, not by the publishing account.
    const normalizedNominee = nomineeName.toLowerCase()
    const tasks = validCards.map((card) => {
      return async () => {
        try {
          const cardDataResponse = await qortalRequest({
            action: "FETCH_QDN_RESOURCE",
            name: card.name,
            service: "BLOG_POST",
            identifier: card.identifier,
          })
          const candidateName =
            getCardNomineeName(cardDataResponse).toLowerCase()
          if (candidateName !== normalizedNominee) {
            return null
          }

          return {
            resource: card,
            cardDataResponse,
          }
        } catch (error) {
          console.warn(
            `Failed to read card ${card.identifier} for nominee matching`,
            error
          )
          return null
        }
      }
    })

    const matches = (await runWithConcurrency(tasks, 10))
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a.resource.updated || a.resource.created || 0
        const bTime = b.resource.updated || b.resource.created || 0
        return bTime - aTime
      })

    return matches
  } catch (error) {
    console.error("Error fetching existing nominee cards:", error)
    return []
  }
}

// Validate that a card is indeed a card and not a comment. -------------------------------------
const validateCardStructure = async (card) => {
  return (
    typeof card === "object" &&
    card.name &&
    card.service === "BLOG_POST" &&
    card.identifier &&
    !card.identifier.includes("comment") &&
    card.created
  )
}

// Load existing card data passed, into the form for editing -------------------------------------
const loadCardIntoForm = async (cardData) => {
  console.log("Loading existing card data:", cardData)
  document.getElementById("nominee-name-input").value = getCardNomineeName(
    cardData,
    getCardNomineeAddress(cardData)
  )
  document.getElementById("card-header").value = cardData.header
  if (typeof ensureBoardRichTextEditor === "function") {
    ensureBoardRichTextEditor(
      minterBoardPublishEditorKey,
      "Share why this nominee should be considered for minting privileges."
    )
    setBoardRichTextEditorHtml(minterBoardPublishEditorKey, cardData.content)
  } else {
    const contentField = document.getElementById("card-content")
    if (contentField) {
      contentField.value = cardData.content
    }
  }

  const linksContainer = document.getElementById("links-container")
  linksContainer.innerHTML = ""
  ;(cardData.links || []).forEach((link) => {
    const linkInput = document.createElement("input")
    linkInput.type = "text"
    linkInput.className = "card-link"
    linkInput.value = link
    linksContainer.appendChild(linkInput)
  })

  if ((cardData.links || []).length === 0) {
    const linkInput = document.createElement("input")
    linkInput.type = "text"
    linkInput.className = "card-link"
    linkInput.placeholder = "Enter QDN link"
    linksContainer.appendChild(linkInput)
  }
}

const openMinterBoardCardEditor = async (cardIdentifier) => {
  const cardData = minterBoardCardDataByIdentifier.get(cardIdentifier)
  if (!cardData) {
    alert("Unable to load this card for editing right now.")
    return
  }

  isExistingCard = true
  existingCardIdentifier = cardIdentifier
  existingCardData = cardData

  const publishForm = document.getElementById("publish-card-form")
  if (publishForm) {
    publishForm.reset()
  }

  const linksContainer = document.getElementById("links-container")
  if (linksContainer) {
    linksContainer.innerHTML = ""
  }

  const publishCardView = document.getElementById("publish-card-view")
  const cardsContainer = document.getElementById("cards-container")
  if (cardsContainer) {
    cardsContainer.style.display = "none"
  }
  if (publishCardView) {
    publishCardView.style.display = "flex"
  }

  await loadCardIntoForm(cardData)

  const submitButton = document.getElementById("submit-publish-button")
  if (submitButton) {
    submitButton.textContent = "UPDATE NOMINATION"
  }

  if (publishCardView?.scrollIntoView) {
    publishCardView.scrollIntoView({ behavior: "smooth", block: "start" })
  }
}

// Main function to publish a new Minter Card -----------------------------------------------
const publishCard = async (cardIdentifierPrefix) => {
  if (minterBoardPublishInProgress) {
    return
  }

  if (!Array.isArray(cachedMinterGroup) || !Array.isArray(cachedMinterAdmins)) {
    await initializeCachedGroups()
  }

  const minterGroupData = cachedMinterGroup
  const minterAdminData = cachedMinterAdmins
  const minterGroupAddresses = minterGroupData.map((m) => m.member)
  const minterAdminAddresses = minterAdminData.map((m) => m.member)
  const userAddress = userState.accountAddress
  const userName = userState.accountName

  const canPublishNomination =
    minterGroupAddresses.includes(userAddress) ||
    minterAdminAddresses.includes(userAddress)
  // Kakashi Note: Nomination-only policy requires MINTER membership/admin role plus level 5+ before publishing.
  if (!canPublishNomination) {
    alert("You have to be a level 5 or above Minter to nominate a user")
    return
  }

  const nomineeInput = document
    .getElementById("nominee-name-input")
    .value.trim()
  const header = document.getElementById("card-header").value.trim()
  const contentText =
    typeof getBoardRichTextEditorText === "function"
      ? getBoardRichTextEditorText(minterBoardPublishEditorKey)
      : document.getElementById("card-content")?.value?.trim() || ""
  const content =
    typeof getBoardRichTextEditorHtml === "function"
      ? getBoardRichTextEditorHtml(minterBoardPublishEditorKey)
      : qRenderRichContentHtml(contentText)
  const links = Array.from(document.querySelectorAll(".card-link"))
    .map((input) => input.value.trim())
    .filter((link) => link.startsWith("qortal://"))
  const submitButton = document.getElementById("submit-publish-button")

  if (!header || !content) {
    alert("Header and content are required!")
    return
  }

  const publishSteps = [
    {
      key: "access",
      label: "Checking publishing access",
      detail: "Verifying Minter/Admin membership and level 5+.",
      status: "active",
    },
    {
      key: "identity",
      label: "Resolving nominee identity",
      detail: "Looking up the nominee name or address.",
      status: "pending",
    },
    {
      key: "duplicate",
      label: "Checking for duplicates",
      detail: "Confirming whether this is a new nomination or an update.",
      status: "pending",
    },
    {
      key: "package",
      label: "Preparing the payload",
      detail: "Serializing the nomination data for QDN.",
      status: "pending",
    },
    {
      key: "publish",
      label: "Publishing to QDN",
      detail: "Submitting the card and waiting for the network response.",
      status: "pending",
    },
    {
      key: "poll",
      label: "Creating or reusing the poll",
      detail: "Making sure the nomination poll is in place.",
      status: "pending",
    },
    {
      key: "refresh",
      label: "Refreshing the board",
      detail: "Reloading cards so the latest state appears.",
      status: "pending",
    },
  ]
  let publishProgress = {
    title: "Preparing nomination",
    subtitle:
      "Please keep this window open while the nomination is validated and published.",
    message:
      "The publish path can take a little while because we verify identity, check for duplicates, and wait for QDN to accept the card.",
    steps: publishSteps,
  }

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

    minterBoardPublishInProgress = true
    if (submitButton) {
      submitButton.disabled = true
      submitButton.textContent = "PUBLISHING..."
    }

    setPublishStep("access", "active")

    let userAddressInfo
    try {
      userAddressInfo = await getAddressInfo(userAddress)
    } catch (error) {
      console.error(
        "Unable to fetch current user address info for level check:",
        error
      )
      setPublishStep(
        "access",
        "error",
        "Unable to verify the current account level right now."
      )
      await qBoardDelay(1400)
      closePublishProgress()
      alert("Unable to verify your minter level right now. Please try again.")
      return
    }

    const userLevel = Number(userAddressInfo?.level || 0)
    if (userLevel < 5) {
      setPublishStep(
        "access",
        "error",
        "Publishing requires a level 5 or above Minter account."
      )
      await qBoardDelay(1400)
      closePublishProgress()
      // Kakashi Note: Reuse the same denial copy for non-level-5 users so policy messaging stays consistent.
      alert("You have to be a level 5 or above Minter to nominate a user")
      return
    }
    setPublishStep("access", "done")

    setPublishStep("identity", "active")
    const nomineeResolution = await resolveNomineeIdentity(nomineeInput)
    if (nomineeResolution.error) {
      setPublishStep("identity", "error", nomineeResolution.error)
      await qBoardDelay(1400)
      closePublishProgress()
      alert(nomineeResolution.error)
      return
    }
    const { nomineeName, nomineeAddress } = nomineeResolution

    const normalizedNomineeName = (nomineeName || "").toLowerCase()
    const normalizedUserName = (userName || "").toLowerCase()
    // Kakashi Note: Self-nominations are blocked to enforce peer nomination and reduce self-published spam.
    if (
      normalizedNomineeName === normalizedUserName ||
      nomineeAddress === userAddress
    ) {
      setPublishStep(
        "identity",
        "error",
        "Self-nominations are disabled. Please nominate another user."
      )
      await qBoardDelay(1400)
      closePublishProgress()
      alert("Self-nominations are disabled. Please nominate another user.")
      return
    }

    const nomineeAlreadyMinter = await verifyMinterCached(nomineeName)
    if (nomineeAlreadyMinter) {
      setPublishStep(
        "identity",
        "error",
        `${nomineeName} is already a minter/admin. Nomination card not needed.`
      )
      await qBoardDelay(1400)
      closePublishProgress()
      alert(
        `${nomineeName} is already a minter/admin. Nomination card not needed.`
      )
      return
    }
    setPublishStep("identity", "done")

    setPublishStep("duplicate", "active")
    const nomineeMatches = await fetchExistingCardsByNominee(
      cardIdentifierPrefix,
      nomineeName
    )
    const samePublisherMatches = nomineeMatches.filter(
      (m) => m.resource.name === userName
    )
    const otherPublisherMatches = nomineeMatches.filter(
      (m) => m.resource.name !== userName
    )

    // Kakashi Note: Same publisher can update their nomination; different publisher for same nominee is blocked as duplicate.
    if (otherPublisherMatches.length > 0) {
      const existingPublisher = otherPublisherMatches[0].resource.name
      setPublishStep(
        "duplicate",
        "error",
        `A nomination card for ${nomineeName} already exists (published by ${existingPublisher}).`
      )
      await qBoardDelay(1400)
      closePublishProgress()
      alert(
        `A nomination card for ${nomineeName} already exists (published by ${existingPublisher}). Duplicate nominations are blocked.`
      )
      return
    }

    if (samePublisherMatches.length > 0) {
      const latestMatch = samePublisherMatches[0]
      isExistingCard = true
      existingCardIdentifier = latestMatch.resource.identifier
      existingCardData = latestMatch.cardDataResponse || {}
    } else {
      isExistingCard = false
      existingCardIdentifier = ""
      existingCardData = {}
    }

    if (
      isExistingCard &&
      (!existingCardData || Object.keys(existingCardData).length === 0)
    ) {
      setPublishStep(
        "duplicate",
        "error",
        "Unable to load your existing nomination card for update."
      )
      await qBoardDelay(1400)
      closePublishProgress()
      alert(
        "Unable to load your existing nomination card for update. Please refresh and try again."
      )
      return
    }

    publishProgress.title = isExistingCard
      ? "Updating nomination"
      : "Publishing nomination"
    syncPublishProgress()
    setPublishStep("duplicate", "done")

    setPublishStep("package", "active")
    const cardIdentifier =
      isExistingCard && existingCardIdentifier
        ? existingCardIdentifier
        : `${cardIdentifierPrefix}-${await uid()}`

    let existingPollName
    if (existingCardData && existingCardData.poll) {
      existingPollName = existingCardData.poll
    }

    const pollName = existingPollName || `${cardIdentifier}-poll`
    const pollDescription = `Mintership Board Poll for ${nomineeName} (published by ${userName})`

    // Kakashi Note: Keep nominee and publisher fields separate for accountability and correct downstream display logic.
    const cardData = {
      header,
      content,
      links,
      nominee: nomineeName,
      nomineeAddress,
      nominator: userName,
      nominatorAddress: userAddress,
      creator: nomineeName,
      creatorAddress: nomineeAddress,
      publishedBy: userName,
      publishedByAddress: userAddress,
      timestamp: Date.now(),
      poll: pollName, // either the existing poll or a new one
    }

    let base64CardData = await objectToBase64(cardData)
    if (!base64CardData) {
      console.log(
        `initial base64 object creation with objectToBase64 failed, using btoa...`
      )
      base64CardData = btoa(JSON.stringify(cardData))
    }
    setPublishStep("package", "done")

    setPublishStep("publish", "active")
    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userName,
      service: "BLOG_POST",
      identifier: cardIdentifier,
      data64: base64CardData,
    })
    setPublishStep("publish", "done")

    if (!isExistingCard || !existingPollName) {
      setPublishStep(
        "poll",
        "active",
        isExistingCard
          ? "The existing poll was missing, so a new one is being created."
          : "Creating the nomination poll for the new card."
      )
      await qortalRequest({
        action: "CREATE_POLL",
        pollName,
        pollDescription,
        pollOptions: ["Yes, No"],
        pollOwnerAddress: userAddress,
      })
      setPublishStep("poll", "done")
    } else {
      setPublishStep("poll", "done", "Existing poll retained.")
    }

    const wasExistingCard = isExistingCard
    const hadExistingPollName = Boolean(existingPollName)

    rememberOptimisticMinterBoardCard(
      cardIdentifierPrefix,
      userName,
      cardIdentifier,
      cardData,
      cardData.timestamp
    )

    isExistingCard = false
    existingCardData = {}
    existingCardIdentifier = ""

    document.getElementById("publish-card-form").reset()
    if (typeof clearBoardRichTextEditor === "function") {
      clearBoardRichTextEditor(minterBoardPublishEditorKey)
    }
    document.getElementById("publish-card-view").style.display = "none"
    document.getElementById("cards-container").style.display = "flex"

    setPublishStep("refresh", "active")
    await loadCards(minterCardIdentifierPrefix, true)
    setPublishStep("refresh", "done")

    await qBoardDelay(250)
    closePublishProgress()

    if (!hadExistingPollName && !wasExistingCard) {
      alert(`Nomination card for ${nomineeName} published successfully!`)
    } else if (!hadExistingPollName) {
      alert(
        `Nomination card for ${nomineeName} updated, and a new poll was created (existing poll missing).`
      )
    } else {
      alert(`Nomination card for ${nomineeName} updated successfully!`)
    }
  } catch (error) {
    console.error("Error publishing card or poll:", error)
    if (publishProgress) {
      publishProgress.message =
        "The publish request failed before completion. Please try again."
      publishProgress.steps = setBoardPublishProgressStepStatus(
        publishProgress.steps,
        "publish",
        "error",
        error?.message || "Publish failed."
      )
      syncPublishProgress()
      await qBoardDelay(1400)
    }
    if (typeof closeBoardPublishProgressModal === "function") {
      closeBoardPublishProgressModal()
    }
    alert("Failed to publish card and poll.")
  } finally {
    minterBoardPublishInProgress = false
    if (submitButton) {
      submitButton.disabled = false
      submitButton.textContent = isExistingCard
        ? "UPDATE NOMINATION"
        : "PUBLISH"
    }
  }
}

let globalVoterMap = new Map()

const processPollData = async (
  pollData,
  minterGroupMembers,
  minterAdmins,
  nomineeName,
  cardIdentifier
) => {
  if (
    !pollData ||
    !Array.isArray(pollData.voteWeights) ||
    !Array.isArray(pollData.votes)
  ) {
    console.warn("Poll data is missing or invalid. pollData:", pollData)
    return {
      adminYes: 0,
      adminNo: 0,
      minterYes: 0,
      minterNo: 0,
      totalYes: 0,
      totalNo: 0,
      totalYesWeight: 0,
      totalNoWeight: 0,
      detailsHtml: `<p>Poll data is invalid or missing.</p>`,
      userVote: null,
    }
  }

  const memberAddresses = minterGroupMembers.map((m) => m.member)
  const minterAdminAddresses = minterAdmins.map((m) => m.member)
  const [adminGroupsMembers, featureTriggerPassed] = await Promise.all([
    fetchAllAdminGroupsMembers(),
    featureTriggerCheck(),
  ])
  const groupAdminAddresses = adminGroupsMembers.map((m) => m.member)
  let adminAddresses = [...minterAdminAddresses]

  if (!featureTriggerPassed) {
    console.log(
      `featureTrigger is NOT passed, only showing admin results from Minter Admins and Group Admins`
    )
    adminAddresses = [...minterAdminAddresses, ...groupAdminAddresses]
  }

  let adminYes = 0,
    adminNo = 0
  let minterYes = 0,
    minterNo = 0
  let yesWeight = 0,
    noWeight = 0
  let userVote = null

  for (const w of pollData.voteWeights) {
    if (w.optionName.toLowerCase() === "yes") {
      yesWeight = w.voteWeight
    } else if (w.optionName.toLowerCase() === "no") {
      noWeight = w.voteWeight
    }
  }

  const voterPromises = pollData.votes.map(async (vote) => {
    const optionIndex = vote.optionIndex // 0 => yes, 1 => no
    const voterPublicKey = vote.voterPublicKey
    const voterAddress = await getAddressFromPublicKey(voterPublicKey)

    if (voterAddress === userState.accountAddress) {
      userVote = optionIndex
    }

    if (optionIndex === 0) {
      if (adminAddresses.includes(voterAddress)) {
        adminYes++
      } else if (memberAddresses.includes(voterAddress)) {
        minterYes++
      } else {
        console.log(
          `voter ${voterAddress} is not a minter nor an admin... Not included in aggregates.`
        )
      }
    } else if (optionIndex === 1) {
      if (adminAddresses.includes(voterAddress)) {
        adminNo++
      } else if (memberAddresses.includes(voterAddress)) {
        minterNo++
      } else {
        console.log(
          `voter ${voterAddress} is not a minter nor an admin... Not included in aggregates.`
        )
      }
    }

    const [nameInfo, addressInfo] = await Promise.all([
      getNameFromAddress(voterAddress).catch((err) => {
        console.warn(`No name for address ${voterAddress}`, err)
        return ""
      }),
      getAddressInfo(voterAddress).catch((e) => {
        console.warn(`Failed to get addressInfo for ${voterAddress}`, e)
        return null
      }),
    ])
    const voterName = nameInfo && nameInfo !== voterAddress ? nameInfo : ""
    const blocksMinted = addressInfo?.blocksMinted || 0
    const isAdmin = adminAddresses.includes(voterAddress)
    const isMinter = memberAddresses.includes(voterAddress)

    return {
      optionIndex,
      voterPublicKey,
      voterAddress,
      voterName,
      isAdmin,
      isMinter,
      blocksMinted,
    }
  })

  const allVoters = await Promise.all(voterPromises)
  const yesVoters = []
  const noVoters = []
  let totalMinterAndAdminYesWeight = 0
  let totalMinterAndAdminNoWeight = 0

  for (const v of allVoters) {
    if (v.optionIndex === 0) {
      yesVoters.push(v)
      totalMinterAndAdminYesWeight += v.blocksMinted
    } else if (v.optionIndex === 1) {
      noVoters.push(v)
      totalMinterAndAdminNoWeight += v.blocksMinted
    }
  }

  yesVoters.sort((a, b) => b.blocksMinted - a.blocksMinted)
  noVoters.sort((a, b) => b.blocksMinted - a.blocksMinted)
  const sortedAllVoters = allVoters.sort(
    (a, b) => b.blocksMinted - a.blocksMinted
  )
  await createVoterMap(sortedAllVoters, cardIdentifier)

  const yesTableHtml = buildVotersTableHtml(
    yesVoters,
    /* tableColor= */ "green"
  )
  const noTableHtml = buildVotersTableHtml(noVoters, /* tableColor= */ "red")
  const safeNominee = qEscapeHtml(nomineeName)
  const detailsHtml = `
    <div class="poll-details-container" id="${qEscapeAttr(
      nomineeName
    )}-poll-details">
      <h1 style ="color:rgb(123, 123, 85); text-align: center; font-size: 2.0rem">${safeNominee}'s</h1><h3 style="color: white; text-align: center; font-size: 1.8rem"> Support Poll Result Details</h3>
      <h4 style="color: green; text-align: center;">Yes Vote Details</h4>
      ${yesTableHtml}
      <h4 style="color: red; text-align: center; margin-top: 2em;">No Vote Details</h4>
      ${noTableHtml}
    </div>
  `
  const totalYes = adminYes + minterYes
  const totalNo = adminNo + minterNo

  return {
    adminYes,
    adminNo,
    minterYes,
    minterNo,
    totalYes,
    totalNo,
    totalYesWeight: totalMinterAndAdminYesWeight,
    totalNoWeight: totalMinterAndAdminNoWeight,
    detailsHtml,
    userVote,
  }
}

const createVoterMap = async (voters, cardIdentifier) => {
  const voterMap = new Map()
  voters.forEach((voter) => {
    const voterNameOrAddress = voter.voterName || voter.voterAddress
    voterMap.set(voterNameOrAddress, {
      vote: voter.optionIndex === 0 ? "yes" : "no", // Use optionIndex directly
      voterType: voter.isAdmin ? "Admin" : voter.isMinter ? "Minter" : "User",
      blocksMinted: voter.blocksMinted,
    })
  })
  globalVoterMap.set(cardIdentifier, voterMap)
}

const buildVotersTableHtml = (voters, tableColor) => {
  if (!voters.length) {
    return `<p>No voters here.</p>`
  }

  // Decide extremely dark background for the <tbody>
  let bodyBackground
  if (tableColor === "green") {
    bodyBackground = "rgba(0, 18, 0, 0.8)" // near-black green
  } else if (tableColor === "red") {
    bodyBackground = "rgba(30, 0, 0, 0.8)" // near-black red
  } else {
    // fallback color if needed
    bodyBackground = "rgba(40, 20, 10, 0.8)"
  }

  // tableColor is used for the <thead>, bodyBackground for the <tbody>
  const minterColor = "rgb(98, 122, 167)"
  const adminColor = "rgb(44, 209, 151)"
  const userColor = "rgb(102, 102, 102)"
  return `
    <table style="
      width: 100%;
      border-style: dotted;
      border-width: 0.15rem;
      border-color: #576b6f;
      margin-bottom: 1em;
      border-collapse: collapse;
    ">
      <thead style="background: ${tableColor}; color:rgb(238, 238, 238) ;">
        <tr style="font-size: 1.5rem;">
          <th style="padding: 0.1rem; text-align: center;">Voter Name/Address</th>
          <th style="padding: 0.1rem; text-align: center;">Voter Type</th>
          <th style="padding: 0.1rem; text-align: center;">Voter Weight(=BlocksMinted)</th>
        </tr>
      </thead>

      <!-- Tbody with extremely dark green or red -->
      <tbody style="background-color: ${bodyBackground}; color: #c6c6c6;">
        ${voters
          .map((v) => {
            const userType = v.isAdmin
              ? "Admin"
              : v.isMinter
              ? "Minter"
              : "User"
            const pollName = v.pollName
            const displayName = v.voterName ? v.voterName : v.voterAddress
            const safeDisplayName = qEscapeHtml(displayName)
            return `
              <tr style="font-size: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; font-weight: bold;">
                <td style="padding: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; text-align: center; 
                color:${
                  userType === "Admin"
                    ? adminColor
                    : v.isMinter
                    ? minterColor
                    : userColor
                };">${safeDisplayName}</td>
                <td style="padding: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; text-align: center; 
                color:${
                  userType === "Admin"
                    ? adminColor
                    : v.isMinter
                    ? minterColor
                    : userColor
                };">${userType}</td>
                <td style="padding: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; text-align: center; 
                color:${
                  userType === "Admin"
                    ? adminColor
                    : v.isMinter
                    ? minterColor
                    : userColor
                };">${v.blocksMinted}</td>
              </tr>
            `
          })
          .join("")}
      </tbody>
    </table>
  `
}

// Post a comment on a card. ---------------------------------
const postComment = async (cardIdentifier) => {
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

  try {
    //Ensure the user is not on the blockList prior to allowing them to publish a comment.
    const blockedNames = await fetchBlockList()

    if (blockedNames.includes(userState.accountName)) {
      alert("You are on the block list and cannot publish comments.")
      return
    }
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
      timestamp: Date.now(),
      ...(existingCommentData?.replyTo
        ? { replyTo: existingCommentData.replyTo }
        : {}),
      ...(!editingState.isEditing && replyTo ? { replyTo } : {}),
    }
    const isEditingThisComment =
      editingState.isEditing &&
      editingState.cardIdentifier === cardIdentifier &&
      editingState.commentIdentifier
    const uniqueCommentIdentifier = isEditingThisComment
      ? editingState.commentIdentifier
      : `comment-${cardIdentifier}-${await uid()}`
    let base64CommentData = await objectToBase64(commentData)
    if (!base64CommentData) {
      base64CommentData = btoa(JSON.stringify(commentData))
    }

    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userState.accountName,
      service: "BLOG_POST",
      identifier: uniqueCommentIdentifier,
      data64: base64CommentData,
    })

    rememberOptimisticMinterBoardComment(
      cardIdentifier,
      userState.accountName,
      uniqueCommentIdentifier,
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
      updateDisplayedCommentCount(cardIdentifier, 1)
      void notifyMinterBoardEvent({
        eventType: replyTo ? "reply" : "comment",
        cardIdentifier,
        commentIdentifier: uniqueCommentIdentifier,
        actionIdentifier: uniqueCommentIdentifier,
        actorAddress: userState.accountAddress || "",
        replyTo,
        summary: replyTo
          ? `${userState.accountName || "A user"} replied to a comment.`
          : `${userState.accountName || "A user"} posted a comment.`,
      })
    }
    const commentsSection = document.getElementById(
      `comments-section-${cardIdentifier}`
    )
    if (commentsSection && commentsSection.style.display === "block") {
      await displayComments(cardIdentifier)
      if (
        isEditingThisComment &&
        typeof scrollBoardCommentIntoView === "function"
      ) {
        await scrollBoardCommentIntoView(
          cardIdentifier,
          uniqueCommentIdentifier
        )
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
    alert("Failed to post comment. Error: " + error)
  }
}

const updateDisplayedCommentCount = (cardIdentifier, delta = 0) => {
  const commentButton = document.getElementById(
    `comment-button-${cardIdentifier}`
  )
  const listCommentCount = document.getElementById(
    `list-comment-count-${cardIdentifier}`
  )
  const currentCount = Number(
    commentButton?.dataset?.commentCount ||
      listCommentCount?.dataset?.commentCount ||
      commentCountCache.get(cardIdentifier) ||
      0
  )
  const nextCount = Math.max(0, currentCount + delta)
  commentCountCache.set(cardIdentifier, nextCount)
  if (commentButton) {
    commentButton.dataset.commentCount = String(nextCount)
    if (
      commentButton.textContent !== "HIDE COMMENTS" &&
      commentButton.textContent !== "LOADING..."
    ) {
      commentButton.textContent = `COMMENTS (${nextCount})`
    }
  }
  if (listCommentCount) {
    listCommentCount.dataset.commentCount = String(nextCount)
    listCommentCount.textContent = `${nextCount} comment${
      nextCount === 1 ? "" : "s"
    }`
  }
}
//Fetch the comments for a card with passed card identifier ----------------------------
const fetchCommentsForCard = async (cardIdentifier) => {
  try {
    const response = await searchSimple(
      "BLOG_POST",
      `comment-${cardIdentifier}`,
      "",
      0,
      0,
      "",
      "false"
    )
    const fetchedComments = Array.isArray(response) ? response : []
    const existingResourcesByIdentity = new Map(
      fetchedComments.map((comment) => [
        getBoardResourceIdentityKey(comment),
        comment,
      ])
    )
    const optimisticComments = getOptimisticMinterBoardComments(
      cardIdentifier,
      existingResourcesByIdentity
    )
    const mergedComments = [...optimisticComments, ...fetchedComments].sort(
      (a, b) => getBoardResourceTimestamp(a) - getBoardResourceTimestamp(b)
    )
    rememberMinterBoardCommentSnapshot(cardIdentifier, mergedComments)
    return mergedComments
  } catch (error) {
    console.error(`Error fetching comments for ${cardIdentifier}:`, error)
    const optimisticComments = getOptimisticMinterBoardComments(cardIdentifier)
    rememberMinterBoardCommentSnapshot(cardIdentifier, optimisticComments)
    return optimisticComments
  }
}

const displayComments = async (cardIdentifier) => {
  try {
    const comments = await fetchCommentsForCard(cardIdentifier)
    const commentsContainer = document.getElementById(
      `comments-container-${cardIdentifier}`
    )
    commentsContainer.innerHTML = ""
    const blockedNames = await fetchBlockList()
    console.log("Loaded block list:", blockedNames)
    const voterMap = globalVoterMap.get(cardIdentifier) || new Map()

    const commentHTMLArray = await Promise.all(
      comments.map(async (comment) => {
        try {
          const commentDataResponse = await fetchMinterBoardCommentData(comment)

          if (!commentDataResponse || !commentDataResponse.creator) {
            return null
          }
          const commenterName = commentDataResponse.creator
          if (blockedNames.includes(commenterName)) {
            console.warn(`Skipping blocked commenter: ${commenterName}`)
            return null
          }
          const commenterLevel =
            typeof getBoardAccountLevel === "function"
              ? await getBoardAccountLevel(commenterName)
              : null
          const voterInfo = voterMap.get(commenterName)
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
          const timestamp = new Date(
            commentDataResponse.timestamp
          ).toLocaleString()
          const safeCommenterName = qEscapeHtml(commenterName)
          const commenterNameHtml =
            typeof buildBoardAccountTriggerHtml === "function"
              ? buildBoardAccountTriggerHtml({
                  name: commenterName,
                  label: commenterName,
                  className: "comment-author-name-link",
                  tagName: "button",
                })
              : `<span class="comment-author-name">${safeCommenterName}</span>`
          if (typeof rememberBoardCommentData === "function") {
            rememberBoardCommentData(comment.identifier, commentDataResponse)
          } else if (typeof rememberBoardCommentContent === "function") {
            rememberBoardCommentContent(
              comment.identifier,
              commentDataResponse.content || ""
            )
          }
          const canEditComment =
            typeof canCurrentUserEditPublishedComment === "function"
              ? await canCurrentUserEditPublishedComment(commenterName)
              : false
          const replyButtonHtml =
            typeof buildBoardCommentReplyButtonHtml === "function"
              ? buildBoardCommentReplyButtonHtml({
                  cardIdentifier,
                  commentIdentifier: comment.identifier,
                  publisherName: commenterName,
                })
              : ""
          const editButtonHtml =
            canEditComment &&
            typeof buildBoardCommentEditButtonHtml === "function"
              ? buildBoardCommentEditButtonHtml({
                  cardIdentifier,
                  commentIdentifier: comment.identifier,
                  publisherName: commenterName,
                })
              : ""
          const renderedCommentContent = qRenderBoardCommentHtml(
            commentDataResponse.content
          )
          const replyPreviewHtml =
            commentDataResponse.replyTo &&
            typeof buildBoardCommentReplyPreviewHtml === "function"
              ? buildBoardCommentReplyPreviewHtml(commentDataResponse.replyTo, {
                  variant: "embedded",
                })
              : ""
          const safeTimestamp = qEscapeHtml(timestamp)
          const optimisticNotice = commentDataResponse._optimisticPending
            ? `<p class="board-progress-muted" style="color: #ffd27d;"><i>Published locally. Waiting for QDN indexing.</i></p>`
            : ""
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
          console.error(`Error with comment ${comment.identifier}:`, err)
          return null
        }
      })
    )
    commentHTMLArray
      .filter((html) => html !== null)
      .forEach((commentHTML) => {
        commentsContainer.insertAdjacentHTML("beforeend", commentHTML)
      })
  } catch (err) {
    console.error(`Error displaying comments for ${cardIdentifier}:`, err)
  }
}

// Toggle comments from being shown or not, with passed cardIdentifier for comments being toggled --------------------
const toggleComments = async (cardIdentifier) => {
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
    await displayComments(cardIdentifier)
    // Change the button text to 'HIDE COMMENTS'
    commentButton.textContent = "HIDE COMMENTS"
  } else {
    // Hide comments
    commentsSection.style.display = "none"
    commentButton.textContent = `COMMENTS (${count})`
  }
}

const setMinterListCommentsVisibility = async (
  cardIdentifier,
  shouldShowComments
) => {
  const commentsSection = document.getElementById(
    `comments-section-${cardIdentifier}`
  )
  const commentButton = document.getElementById(
    `comment-button-${cardIdentifier}`
  )

  if (!commentsSection || !commentButton) return

  const isHidden =
    commentsSection.style.display === "none" || !commentsSection.style.display

  if (shouldShowComments) {
    if (isHidden) {
      await toggleComments(cardIdentifier)
    }
    return
  }

  if (!isHidden) {
    commentsSection.style.display = "none"
    const count = commentButton.dataset.commentCount || "0"
    if (
      commentButton.textContent !== "HIDE COMMENTS" &&
      commentButton.textContent !== "LOADING..."
    ) {
      commentButton.textContent = `COMMENTS (${count})`
    }
  }
}

const commentCountCache = new Map()
const countCommentsCached = async (
  cardIdentifier,
  loadToken = minterBoardInfiniteState.loadToken
) => {
  if (commentCountCache.has(cardIdentifier)) {
    return commentCountCache.get(cardIdentifier)
  }
  const count = await countComments(cardIdentifier, loadToken)
  if (loadToken === minterBoardInfiniteState.loadToken) {
    commentCountCache.set(cardIdentifier, count)
  }
  return count
}

const hydrateMinterBoardCommentCount = async (
  cardIdentifier,
  loadToken = minterBoardInfiniteState.loadToken
) => {
  if (loadToken !== minterBoardInfiniteState.loadToken) return 0
  const count = await countCommentsCached(cardIdentifier, loadToken).catch(
    () => 0
  )
  if (
    loadToken !== minterBoardInfiniteState.loadToken ||
    (!document.body.contains(
      document.getElementById(`card-shell-${cardIdentifier}`)
    ) &&
      !document.body.contains(
        document.getElementById(`minter-list-detail-${cardIdentifier}`)
      ))
  ) {
    return count
  }

  const commentButton = document.getElementById(
    `comment-button-${cardIdentifier}`
  )
  if (commentButton) {
    commentButton.dataset.commentCount = String(count)
    if (
      commentButton.textContent !== "HIDE COMMENTS" &&
      commentButton.textContent !== "LOADING..."
    ) {
      commentButton.textContent = `COMMENTS (${count})`
    }
  }

  const listCommentCount = document.getElementById(
    `list-comment-count-${cardIdentifier}`
  )
  if (listCommentCount) {
    listCommentCount.dataset.commentCount = String(count)
    listCommentCount.textContent = `${count} comment${count === 1 ? "" : "s"}`
  }

  return count
}

const countComments = async (
  cardIdentifier,
  loadToken = minterBoardInfiniteState.loadToken
) => {
  try {
    const response = await searchSimple(
      "BLOG_POST",
      `comment-${cardIdentifier}`,
      "",
      0,
      0,
      "",
      "false"
    )
    const fetchedComments = Array.isArray(response) ? response : []
    const existingResourcesByIdentity = new Map(
      fetchedComments.map((comment) => [
        getBoardResourceIdentityKey(comment),
        comment,
      ])
    )
    const optimisticComments = getOptimisticMinterBoardComments(
      cardIdentifier,
      existingResourcesByIdentity
    )
    const mergedComments = [...optimisticComments, ...fetchedComments]
    if (loadToken === minterBoardInfiniteState.loadToken) {
      rememberMinterBoardCommentSnapshot(cardIdentifier, mergedComments)
    }
    return mergedComments.length
  } catch (error) {
    console.error(`Error fetching comment count for ${cardIdentifier}:`, error)
    const optimisticComments = getOptimisticMinterBoardComments(cardIdentifier)
    if (loadToken === minterBoardInfiniteState.loadToken) {
      rememberMinterBoardCommentSnapshot(cardIdentifier, optimisticComments)
    }
    return optimisticComments.length
  }
}

const createModal = (modalType = "") => {
  if (document.getElementById(`${modalType}-modal`)) {
    return
  }
  const isIframe = modalType === "links"
  const isAccountModal = modalType === "account"
  const modalWidth = isIframe || isAccountModal ? "92vw" : "80%"
  const modalHeight = isIframe || isAccountModal ? "88vh" : "70%"
  const modalMargin = isIframe || isAccountModal ? "4vh auto" : "10% auto"
  const modalBackground =
    isIframe || isAccountModal ? "rgba(5, 10, 14, 0.94)" : "rgba(0, 0, 0, 0.80)"
  const modalBorder =
    isIframe || isAccountModal ? "1px solid rgba(157, 193, 196, 0.28)" : "none"
  const modalShadow =
    isIframe || isAccountModal ? "0 20px 60px rgba(0, 0, 0, 0.55)" : "none"

  const modalHTML = `
    <div id="${modalType}-modal"
         style="display: none;
                position: fixed;
                inset: 0;
                width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.50);
                z-index: 10000;">
      <div id="${modalType}-modalContainer"
           style="position: relative;
                  margin: ${modalMargin};
                  width: ${modalWidth};
                  height: ${modalHeight};
                  max-width: 92rem;
                  max-height: 92vh;
                  background: ${modalBackground};
                  border: ${modalBorder};
                  border-radius: 12px;
                  overflow: hidden;
                  box-shadow: ${modalShadow};">
        ${
          isIframe
            ? `<iframe id="${modalType}-modalContent" 
                       src=""
                       style="width: 100%; height: 100%; border: none;">
               </iframe>`
            : `<div id="${modalType}-modalContent" 
                    style="width: 100%; height: 100%; overflow: auto;">
               </div>`
        }

        <button onclick="closeModal('${modalType}')"
                style="position: absolute; top: 0.55rem; right: 0.55rem;
                       z-index: 20;
                       background:rgba(0, 0, 0, 0.66); color: white; border: none;
                       font-size: 2.2rem;
                       padding: 0.4rem 1rem; 
                       border-radius: 0.33rem; 
                       border-style: dashed; 
                       border-color:rgb(213, 224, 225); 
                       pointer-events: auto;
                       "
                onmouseover="this.style.backgroundColor='rgb(73, 7, 7) '"
                onmouseout="this.style.backgroundColor='rgba(5, 14, 11, 0.63) '">
                
          X
        </button>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML("beforeend", modalHTML)
  const modal = document.getElementById(`${modalType}-modal`)

  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modalType)
    }
  })
}

const openLinksModal = async (link) => {
  const processedLink = await processLink(link)
  const modal = document.getElementById("links-modal")
  const modalContent = document.getElementById("links-modalContent")
  modalContent.src = qSanitizeUrl(processedLink, "")
  modal.style.display = "block"
}

const closeModal = async (modalType = "links") => {
  const modal = document.getElementById(`${modalType}-modal`)
  const modalContent = document.getElementById(`${modalType}-modalContent`)
  if (modal) {
    modal.style.display = "none"
  }
  if (modalContent && "src" in modalContent) {
    modalContent.src = ""
  } else if (modalContent) {
    modalContent.innerHTML = ""
  }
}

const processLink = async (link) => {
  if (link.startsWith("qortal://")) {
    const match = link.match(/^qortal:\/\/([^/]+)(\/.*)?$/)
    if (match) {
      const firstParam = match[1].toUpperCase()
      const remainingPath = match[2] || ""
      const themeColor = window._qdnTheme || "default"

      await new Promise((resolve) => setTimeout(resolve, 10))

      return `/render/${firstParam}${remainingPath}?theme=${themeColor}`
    }
  }
  return qSanitizeUrl(link, "")
}

const togglePollDetails = (cardIdentifier) => {
  const detailsDiv = document.getElementById(`poll-details-${cardIdentifier}`)
  const modal = document.getElementById(`poll-details-modal`)
  const modalContent = document.getElementById(`poll-details-modalContent`)

  if (!detailsDiv || !modal || !modalContent) return

  modalContent.innerHTML = detailsDiv.innerHTML
  modal.style.display = "block"

  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = "none"
    }
  }
}

const generateDarkPastelBackgroundBy = (name) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  const safeHash = Math.abs(hash)
  const hueSteps = 69.69
  const hueIndex = safeHash % hueSteps
  const hueRange = 288
  const hue = 140 + hueIndex * (hueRange / hueSteps)

  const satSteps = 13.69
  const satIndex = safeHash % satSteps
  const saturation = 18 + satIndex * 1.333

  const lightSteps = 3.69
  const lightIndex = safeHash % lightSteps
  const lightness = 7 + lightIndex

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

const handleInviteMinter = async (nomineeName, cardIdentifier = "") => {
  try {
    const blockInfo = await getLatestBlockInfo()
    const blockHeight = blockInfo.height
    const minterAccountInfo = await getNameInfoCached(nomineeName)
    const minterAddress = await minterAccountInfo.owner
    let adminPublicKey
    let txGroupId
    if (blockHeight >= GROUP_APPROVAL_FEATURE_TRIGGER_HEIGHT) {
      if (userState.isMinterAdmin) {
        adminPublicKey = await getPublicKeyByName(userState.accountName)
        txGroupId = 694
      } else {
        console.warn(`user is not a minter admin, cannot create invite!`)
        return
      }
    } else {
      adminPublicKey = await getPublicKeyByName(userState.accountName)
      txGroupId = 0
    }
    const fee = 0.01
    const timeToLive = 864000

    console.log(
      `about to attempt group invite, minterAddress: ${minterAddress}, adminPublicKey: ${adminPublicKey}`
    )
    const inviteTransaction = await createGroupInviteTransaction(
      minterAddress,
      adminPublicKey,
      694,
      minterAddress,
      timeToLive,
      txGroupId,
      fee
    )

    const signedTransaction = await qortalRequest({
      action: "SIGN_TRANSACTION",
      unsignedBytes: inviteTransaction,
    })

    console.warn(`signed transaction`, signedTransaction)
    const processResponse = await processTransaction(signedTransaction)

    if (typeof processResponse === "object") {
      // The successful object might have a "signature" or "type" or "approvalStatus"
      console.log("Invite transaction success object:", processResponse)
      alert(
        `${nomineeName} has been successfully invited! Wait for confirmation...Transaction Response: ${JSON.stringify(
          processResponse
        )}`
      )
      if (cardIdentifier) {
        void notifyMinterBoardEvent({
          eventType: "invite_created",
          cardIdentifier,
          nomineeName,
          actionIdentifier:
            processResponse?.signature ||
            processResponse?.sig ||
            `${cardIdentifier}:${nomineeName}:invite`,
          actorAddress: userState.accountAddress || "",
          transaction: processResponse,
          summary: `${
            userState.accountName || "An admin"
          } started the invite process.`,
        })
      }
    } else {
      // fallback string or something
      console.log("Invite transaction raw text response:", processResponse)
      alert(`Invite transaction response: ${JSON.stringify(processResponse)}`)
    }
  } catch (error) {
    console.error("Error inviting minter:", error)
    alert("Error inviting minter. Please try again.")
  }
}

const createInviteButtonHtml = (nomineeName, cardIdentifier) => {
  const safeNomineeAttr = qEscapeAttr(nomineeName)
  return `
      <div id="invite-button-container-${cardIdentifier}" class="create-minter-invite-action">
	          <button data-nominee-name="${safeNomineeAttr}"
	                  data-minter-name="${safeNomineeAttr}"
	                  data-card-identifier="${qEscapeAttr(cardIdentifier)}"
	                  onclick="handleInviteMinterFromButton(this)"
                  class="create-minter-invite-button"
                  >
              Create Minter Invite
          </button>
      </div>
  `
}

const handleInviteMinterFromButton = (buttonEl) => {
  if (!buttonEl) return
  const nomineeName =
    buttonEl.dataset?.nomineeName || buttonEl.dataset?.minterName || ""
  const cardIdentifier = buttonEl.dataset?.cardIdentifier || ""
  handleInviteMinter(nomineeName, cardIdentifier)
}

const featureTriggerCheck = async () => {
  const latestBlockInfo = await getLatestBlockInfo()
  const isBlockPassed =
    latestBlockInfo.height >= GROUP_APPROVAL_FEATURE_TRIGGER_HEIGHT
  if (isBlockPassed) {
    console.warn(
      `featureTrigger check (verifyFeatureTrigger) determined block has PASSED:`,
      isBlockPassed
    )
    featureTriggerPassed = true
    return true
  } else {
    console.warn(
      `featureTrigger check (verifyFeatureTrigger) determined block has NOT PASSED:`,
      isBlockPassed
    )
    featureTriggerPassed = false
    return false
  }
}

const INVITE_CONTEXT_CACHE_TTL_MS = 15000
let inviteContextCache = {
  timestamp: 0,
  data: null,
}

const getInviteContextCached = async (force = false) => {
  const now = Date.now()
  const isStale =
    now - inviteContextCache.timestamp > INVITE_CONTEXT_CACHE_TTL_MS

  if (force || !inviteContextCache.data || isStale) {
    const [
      { finalKickTxs, finalBanTxs },
      { finalInviteTxs, pendingInviteTxs },
    ] = await Promise.all([
      fetchAllKickBanTxData(),
      fetchAllInviteTransactions(),
    ])

    inviteContextCache.data = {
      finalKickTxs,
      finalBanTxs,
      finalInviteTxs,
      pendingInviteTxs,
    }
    inviteContextCache.timestamp = now
  }

  return inviteContextCache.data
}

const checkAndDisplayInviteButton = async (
  adminYes,
  nomineeName,
  cardIdentifier
) => {
  const isSomeTypaAdmin = userState.isAdmin || userState.isMinterAdmin
  const isBlockPassed = await featureTriggerCheck()
  // const minterAdmins = await fetchMinterGroupAdmins()
  const minterAdmins = getEffectiveMinterAdminMembers(cachedMinterAdmins)

  // default needed admin count = 9, or 40% if block has passed
  let minAdminCount = 9
  if (isBlockPassed) {
    minAdminCount = Math.ceil(minterAdmins.length * 0.4)
    console.warn(`Using 40% => ${minAdminCount}`)
  }

  // if not enough adminYes votes, no invite button
  if (adminYes < minAdminCount) {
    console.warn(
      `Admin votes not high enough (have=${adminYes}, need=${minAdminCount}). No button.`
    )
    return null
  }
  console.log(
    `passed initial button creation checks (adminYes >= ${minAdminCount})`
  )
  // get nominee address from nominee name
  const minterNameInfo = await getNameInfoCached(nomineeName)
  if (!minterNameInfo || !minterNameInfo.owner) {
    console.warn(
      `No valid nameInfo for ${nomineeName}, skipping invite button.`
    )
    return null
  }
  const minterAddress = minterNameInfo.owner
  // Use short-lived cached tx context to avoid re-querying the same large datasets for every card.
  const { finalKickTxs, finalBanTxs, pendingInviteTxs } =
    await getInviteContextCached()
  // check if there's a KICK or BAN for this user.
  const priorKick = finalKickTxs.some((tx) => tx.member === minterAddress)
  const priorBan = finalBanTxs.some((tx) => tx.offender === minterAddress)
  const pendingInvite = pendingInviteTxs.some(
    (tx) =>
      tx.invitee === minterAddress && Number(tx.groupId) === MINTER_GROUP_ID
  )
  const priorBanOrKick = priorBan || priorKick
  console.warn(
    `PriorBanOrKick determination for ${minterAddress}:`,
    priorBanOrKick
  )

  // build the normal invite button & groupApprovalHtml
  let inviteButtonHtml = ""
  if (pendingInvite) {
    console.warn(
      `There is a pending MINTER invite for this user. No create-invite button being created.`
    )
    inviteButtonHtml = ""
  } else {
    inviteButtonHtml = isSomeTypaAdmin
      ? createInviteButtonHtml(nomineeName, cardIdentifier)
      : ""
  }

  const groupApprovalHtml = await checkGroupApprovalAndCreateButton(
    minterAddress,
    cardIdentifier,
    "GROUP_INVITE"
  )

  // if user had no prior KICK/BAN
  if (!priorBanOrKick) {
    console.log(
      `No prior kick/ban found, creating invite (or approve) button...`
    )
    console.warn(
      `Existing Numbers - adminYes/minAdminCount: ${adminYes}/${minAdminCount}`
    )

    // if there's already a pending GROUP_INVITE, return that approval button
    if (groupApprovalHtml) {
      console.warn(
        `groupApprovalCheck found existing groupApproval, returning approval button instead of invite button...`
      )
      return groupApprovalHtml
    }

    console.warn(
      `No pending approvals or prior kick/ban found, returning invite button...`
    )
    return inviteButtonHtml
  } else {
    // priorBanOrKick is true => show both
    console.warn(`Prior kick/ban found! Including BOTH buttons...`)
    return inviteButtonHtml + groupApprovalHtml
  }
}

const findPendingTxForAddress = async (
  address,
  txType,
  limit = 0,
  offset = 0
) => {
  const pendingTxs = await searchPendingTransactions(limit, offset, false)
  let relevantTypes
  if (txType) {
    relevantTypes = new Set([txType])
  } else {
    relevantTypes = new Set([
      "GROUP_INVITE",
      "GROUP_BAN",
      "GROUP_KICK",
      "ADD_GROUP_ADMIN",
      "REMOVE_GROUP_ADMIN",
    ])
  }

  // Filter pending TX for relevant types
  const relevantTxs = pendingTxs.filter((tx) => relevantTypes.has(tx.type))

  const matchedTxs = relevantTxs.filter((tx) => {
    switch (tx.type) {
      case "GROUP_INVITE":
        return tx.invitee === address
      case "GROUP_BAN":
        return tx.offender === address
      case "GROUP_KICK":
        return tx.member === address
      case "ADD_GROUP_ADMIN":
        return tx.member === address
      case "REMOVE_GROUP_ADMIN":
        return tx.admin === address
      default:
        return false
    }
  })
  console.warn(`matchedTxs:`, matchedTxs)
  //Sort oldest→newest by timestamp, so matchedTxs[0] is the oldest
  matchedTxs.sort((a, b) => a.timestamp - b.timestamp)
  return matchedTxs // Array of matching pending transactions
}

const APPROVAL_TX_CACHE_TTL_MS = 15000
let approvalTxSearchCache = {
  timestamp: 0,
  data: null,
}
const pendingTxByAddressTypeCache = new Map()

const getGroupApprovalTxsCached = async (force = false) => {
  const now = Date.now()
  const isStale =
    now - approvalTxSearchCache.timestamp > APPROVAL_TX_CACHE_TTL_MS

  if (force || !approvalTxSearchCache.data || isStale) {
    approvalTxSearchCache.data = await searchTransactions({
      txTypes: ["GROUP_APPROVAL"],
      confirmationStatus: "CONFIRMED",
      limit: 0,
      reverse: false,
      offset: 0,
      startBlock: 1990000,
      blockLimit: 0,
      txGroupId: 0,
    })
    approvalTxSearchCache.timestamp = now
  }

  return approvalTxSearchCache.data
}

const getPendingTxForAddressCached = async (
  address,
  transactionType,
  limit = 0,
  offset = 0,
  force = false
) => {
  const key = `${transactionType}::${address}`
  const now = Date.now()
  const cached = pendingTxByAddressTypeCache.get(key)
  const isStale = !cached || now - cached.timestamp > APPROVAL_TX_CACHE_TTL_MS

  if (force || isStale) {
    const data = await findPendingTxForAddress(
      address,
      transactionType,
      limit,
      offset
    )
    pendingTxByAddressTypeCache.set(key, { timestamp: now, data })
    return data
  }

  return cached.data
}

const checkGroupApprovalAndCreateButton = async (
  address,
  cardIdentifier,
  transactionType
) => {
  // We are going to be verifying that the address isn't already a minter, before showing GROUP_APPROVAL buttons potentially...
  if (transactionType === "GROUP_INVITE") {
    console.log(
      `This is a GROUP_INVITE check for group approval... Checking that user isn't already a minter...`
    )
    // const minterMembers = await fetchMinterGroupMembers()
    const minterMembers = cachedMinterGroup
    const minterGroupAddresses = minterMembers.map((m) => m.member)
    if (minterGroupAddresses.includes(address)) {
      console.warn(
        `User is already a minter, will not be creating group_approval buttons`
      )
      return null
    }
  }

  const approvalSearchResults = await getGroupApprovalTxsCached()
  let pendingTxs = await getPendingTxForAddressCached(
    address,
    transactionType,
    0,
    0
  )
  if (transactionType === "GROUP_INVITE") {
    pendingTxs = pendingTxs.filter(
      (tx) => Number(tx.groupId) === MINTER_GROUP_ID
    )
  }
  const isSomeTypaAdmin = userState.isAdmin || userState.isMinterAdmin
  // If no pending transaction found, return null
  if (!pendingTxs || pendingTxs.length === 0) {
    console.warn("no pending transactions found, returning null...")
    return null
  }
  const txSig = pendingTxs[0].signature
  const txGroupId = Number(pendingTxs[0]?.txGroupId) || MINTER_GROUP_ID
  // Find the relevant signature. (signature of the issued transaction pending.)
  const relevantApprovals = approvalSearchResults.filter(
    (approvalTx) => approvalTx.pendingSignature === txSig
  )
  const { tableHtml, uniqueApprovalCount } = await buildApprovalTableHtml(
    relevantApprovals,
    getNameFromAddress
  )

  if (transactionType === "GROUP_INVITE" && isSomeTypaAdmin) {
    const approvalButtonHtml = `
      <div style="display: flex; flex-direction: column; margin-top: 1em;">
        <p style="color: rgb(181, 214, 100);">
          Existing ${transactionType} Approvals: ${uniqueApprovalCount}
        </p>
        ${tableHtml}
        <div id="approval-button-container-${cardIdentifier}" style="margin-top: 1em;">
          <button
            style="
              padding: 8px;
              background: rgb(37, 97, 99);
              color: rgb(215, 215, 215);
              border: 1px solid #333;
              border-color: white;
              border-radius: 5px;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='rgb(25, 47, 39)'"
            onmouseout="this.style.backgroundColor='rgb(37, 96, 99)'"
            onclick="handleGroupApproval('${qEscapeAttr(
              txSig
            )}', '${qEscapeAttr(cardIdentifier)}', '${qEscapeAttr(
      transactionType
    )}')"
          >
            Approve Invite Tx
          </button>
        </div>
      </div>
    `
    return approvalButtonHtml
  }

  if (transactionType === "GROUP_KICK" && isSomeTypaAdmin) {
    const approvalButtonHtml = `
      <div style="display: flex; flex-direction: column; margin-top: 1em;">
        <p style="color: rgb(199, 100, 64);">
          Existing ${transactionType} Approvals: ${uniqueApprovalCount}
        </p>
        ${tableHtml}
        <div id="approval-button-container-${cardIdentifier}" style="margin-top: 1em;">
          <button
            style="
              padding: 8px;
              background: rgb(119, 91, 21);
              color: rgb(201, 255, 251);
              border: 1px solid #333;
              border-color: rgb(102, 69, 60);
              border-radius: 5px;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='rgb(50, 52, 51)'"
            onmouseout="this.style.backgroundColor='rgb(119, 91, 21)'"
            onclick="handleGroupApproval('${txSig}')"
          >
            Approve Kick Tx
          </button>
        </div>
      </div>
    `
    return approvalButtonHtml
  }

  if (transactionType === "GROUP_BAN" && isSomeTypaAdmin) {
    const approvalButtonHtml = `
      <div style="display: flex; flex-direction: column; margin-top: 1em;">
        <p style="color: rgb(189, 40, 40);">
          Existing ${transactionType} Approvals: ${uniqueApprovalCount}
        </p>
        ${tableHtml}
        <div id="approval-button-container-${cardIdentifier}" style="margin-top: 1em;">
          <button
            style="
              padding: 8px;
              background: rgb(54, 7, 7);
              color: rgb(201, 255, 251);
              border: 1px solid #333;
              border-color: rgb(204, 94, 94);
              border-radius: 5px;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='rgb(50, 52, 51)'"
            onmouseout="this.style.backgroundColor='rgb(54, 7, 7)'"
            onclick="handleGroupApproval('${txSig}')"
          >
            Approve Ban Tx
          </button>
        </div>
      </div>
    `
    return approvalButtonHtml
  }

  if (transactionType === "ADD_GROUP_ADMIN" && isSomeTypaAdmin) {
    const approvalButtonHtml = `
      <div style="display: flex; flex-direction: column; margin-top: 1em;">
        <p style="color: rgb(40, 144, 189);">
          Existing ${transactionType} Approvals: ${uniqueApprovalCount}
        </p>
        ${tableHtml}
        <div id="approval-button-container-${cardIdentifier}" style="margin-top: 1em;">
          <button
            style="
              padding: 8px;
              background: rgb(8, 71, 69);
              color: rgb(201, 255, 251);
              border: 1px solid #333;
              border-color: rgb(198, 252, 249);
              border-radius: 5px;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='rgb(17, 41, 29)'"
            onmouseout="this.style.backgroundColor='rgb(8, 71, 69)'"
            onclick="handleGroupApproval('${txSig}')"
          >
            Approve Add-Admin Tx
          </button>
        </div>
      </div>
    `
    return approvalButtonHtml
  }

  if (transactionType === "REMOVE_GROUP_ADMIN" && isSomeTypaAdmin) {
    const approvalButtonHtml = `
      <div style="display: flex; flex-direction: column; margin-top: 1em;">
        <p style="color: rgb(189, 40, 40);">
          Existing ${transactionType} Approvals: ${uniqueApprovalCount}
        </p>
        ${tableHtml}
        <div id="approval-button-container-${cardIdentifier}" style="margin-top: 1em;">
          <button
            style="
              padding: 8px;
              background: rgb(54, 7, 7);
              color: rgb(201, 255, 251);
              border: 1px solid #333;
              border-color: rgb(204, 94, 94);
              border-radius: 5px;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='rgb(50, 52, 51)'"
            onmouseout="this.style.backgroundColor='rgb(54, 7, 7)'"
            onclick="handleGroupApproval('${txSig}')"
          >
            Approve Remove-Admin Tx
          </button>
        </div>
      </div>
    `
    return approvalButtonHtml
  }
}

const buildApprovalTableHtml = async (approvalTxs, getNameFunc) => {
  // Build a Map of adminAddress => one transaction (to handle multiple approvals from same admin)
  const approvalMap = new Map()
  for (const tx of approvalTxs) {
    const adminAddr = tx.creatorAddress
    if (!approvalMap.has(adminAddr)) {
      approvalMap.set(adminAddr, tx)
    }
  }
  // Turn the map into an array for iteration
  const approvalArray = Array.from(approvalMap, ([adminAddr, tx]) => ({
    adminAddr,
    tx,
  }))
  // Build table rows asynchronously, since we need getNameFromAddress
  const tableRows = await Promise.all(
    approvalArray.map(async ({ adminAddr, tx }) => {
      let adminName
      try {
        adminName = await getNameFunc(adminAddr)
      } catch (err) {
        console.warn(`Error fetching name for ${adminAddr}:`, err)
        adminName = null
      }
      const displayName =
        adminName && adminName !== adminAddr
          ? adminName
          : "(No registered name)"

      const dateStr = new Date(tx.timestamp).toLocaleString()
      return `
        <tr>
          <td style="border: 1px solid rgb(255, 255, 255); padding: 4px; color: #234565">${displayName}</td>
          <td style="border: 1px solid rgb(255, 254, 254); padding: 4px;">${dateStr}</td>
        </tr>
      `
    })
  )
  // The total unique approvals = number of entries in approvalMap
  const uniqueApprovalCount = approvalMap.size
  // Wrap the table in a container with horizontal scroll:
  //    1) max-width: 100% makes it fit the parent (card) width
  //    2) overflow-x: auto allows scrolling if the table is too wide
  const containerHtml = `
    <div style="max-width: 100%; overflow-x: auto;">
      <table style="border: 1px solid #ccc; border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background:rgba(6, 50, 59, 0.61);">
            <th style="border: 1px solid #ffffff; padding: 4px;">Admin Name</th>
            <th style="border: 1px solid #ffffff; padding: 4px;">Approval Time</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.join("")}
        </tbody>
      </table>
    </div>
  `
  // Return both the container-wrapped table and the count of unique approvals
  return {
    tableHtml: containerHtml,
    uniqueApprovalCount,
  }
}

const handleGroupApproval = async (
  pendingSignature,
  cardIdentifier = "",
  transactionType = "GROUP_APPROVAL"
) => {
  try {
    if (!userState.isMinterAdmin) {
      console.warn(`non-admin attempting to sign approval!`)
      return
    }
    const fee = 0.01
    const adminPublicKey = await getPublicKeyFromAddress(
      userState.accountAddress
    )
    const txGroupId = 0
    const rawGroupApprovalTransaction = await createGroupApprovalTransaction(
      adminPublicKey,
      pendingSignature,
      txGroupId,
      fee
    )
    const signedGroupApprovalTransaction = await qortalRequest({
      action: "SIGN_TRANSACTION",
      unsignedBytes: rawGroupApprovalTransaction,
    })

    let txToProcess = signedGroupApprovalTransaction
    const processGroupApprovalTx = await processTransaction(txToProcess)

    if (processGroupApprovalTx) {
      alert(
        `transaction processed, please wait for CONFIRMATION: ${JSON.stringify(
          processGroupApprovalTx
        )}`
      )
      if (cardIdentifier) {
        void notifyMinterBoardEvent({
          eventType: "group_approval",
          cardIdentifier,
          transactionType,
          pendingSignature,
          actionIdentifier: pendingSignature,
          actorAddress: userState.accountAddress || "",
          transaction: processGroupApprovalTx,
          summary: `${
            userState.accountName || "An admin"
          } approved a pending ${transactionType} transaction.`,
        })
      }
    } else {
      alert(`creating tx failed for some reason`)
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

const handleJoinGroup = async (minterAddress, cardIdentifier = "") => {
  try {
    if (userState.accountAddress === minterAddress) {
      console.log(`minter user found `)

      const qRequestAttempt = await qortalRequest({
        action: "JOIN_GROUP",
        groupId: 694,
      })

      if (qRequestAttempt) {
        if (cardIdentifier) {
          void notifyMinterBoardEvent({
            eventType: "joined",
            cardIdentifier,
            actionIdentifier: `${cardIdentifier}:${
              userState.accountAddress || minterAddress
            }:joined`,
            actorAddress: userState.accountAddress || minterAddress || "",
            summary: `${
              userState.accountName || "The nominee"
            } joined the MINTER group.`,
          })
        }
        return true
      }

      const joinerPublicKey = getPublicKeyFromAddress(minterAddress)
      const fee = 0.01
      const joinGroupTransactionData = await createGroupJoinTransaction(
        minterAddress,
        joinerPublicKey,
        694,
        0,
        fee
      )
      const signedJoinGroupTransaction = await qortalRequest({
        action: "SIGN_TRANSACTION",
        unsignedBytes: joinGroupTransactionData,
      })
      let txToProcess = signedJoinGroupTransaction
      const processJoinGroupTransaction = await processTransaction(txToProcess)

      if (processJoinGroupTransaction) {
        console.warn(`processed JOIN_GROUP tx`, processJoinGroupTransaction)
        alert(
          `JOIN GROUP Transaction Processed Successfully, please WAIT FOR CONFIRMATION txData: ${JSON.stringify(
            processJoinGroupTransaction
          )}`
        )
        if (cardIdentifier) {
          void notifyMinterBoardEvent({
            eventType: "joined",
            cardIdentifier,
            actionIdentifier: `${cardIdentifier}:${
              userState.accountAddress || minterAddress
            }:joined`,
            actorAddress: userState.accountAddress || minterAddress || "",
            transaction: processJoinGroupTransaction,
            summary: `${
              userState.accountName || "The nominee"
            } joined the MINTER group.`,
          })
        }
      }
    } else {
      console.warn(`user is not the minter`)
      return ""
    }
  } catch (error) {
    throw error
  }
}

const getMinterAvatar = async (minterName) => {
  const placeholderAvatarHtml = `<span class="user-avatar-shell user-avatar-shell--placeholder" aria-hidden="true"></span>`
  const normalizedName = String(minterName ?? "")
    .trim()
    .toLowerCase()

  if (minterAvatarMarkupCache.has(normalizedName)) {
    return minterAvatarMarkupCache.get(normalizedName)
  }

  if (!minterName || minterName === "undefined" || minterName === "null") {
    minterAvatarMarkupCache.set(normalizedName, placeholderAvatarHtml)
    return placeholderAvatarHtml
  }

  const avatarUrl = `/arbitrary/THUMBNAIL/${encodeURIComponent(
    minterName
  )}/qortal_avatar`
  try {
    const response = await fetch(avatarUrl, { method: "HEAD" })

    if (response.ok) {
      const avatarHtml = `
        <span class="user-avatar-shell user-avatar-shell--has-avatar" aria-hidden="true">
          <img src="${avatarUrl}" alt="" class="user-avatar">
        </span>
      `
      minterAvatarMarkupCache.set(normalizedName, avatarHtml)
      return avatarHtml
    }

    minterAvatarMarkupCache.set(normalizedName, placeholderAvatarHtml)
    return placeholderAvatarHtml
  } catch (error) {
    console.error("Error checking avatar availability:", error)
    minterAvatarMarkupCache.set(normalizedName, placeholderAvatarHtml)
    return placeholderAvatarHtml
  }
}

function copyAddressFromIdentityBox(buttonEl) {
  const address = buttonEl?.dataset?.copyAddress?.trim()
  if (!address) {
    return
  }

  const restoreTooltip = () => {
    const originalTitle = buttonEl?.dataset?.originalTitle
    if (originalTitle) {
      buttonEl.setAttribute("title", originalTitle)
    }
    buttonEl?.classList?.remove("is-copied")
  }

  const markCopied = () => {
    buttonEl?.classList?.add("is-copied")
    buttonEl.setAttribute("title", "Copied address")
    window.setTimeout(restoreTooltip, 1200)
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(address)
      .then(markCopied)
      .catch((error) => {
        console.warn(
          "Clipboard copy failed, falling back to legacy copy flow:",
          error
        )
        legacyCopyAddress()
      })
    return
  }

  legacyCopyAddress()

  function legacyCopyAddress() {
    const tempTextArea = document.createElement("textarea")
    tempTextArea.value = address
    tempTextArea.setAttribute("readonly", "")
    tempTextArea.style.position = "fixed"
    tempTextArea.style.opacity = "0"
    document.body.appendChild(tempTextArea)
    tempTextArea.select()

    try {
      document.execCommand("copy")
      markCopied()
    } catch (error) {
      console.warn("Legacy clipboard copy failed:", error)
    } finally {
      tempTextArea.remove()
    }
  }
}

function buildIdentityBoxHtml(
  label,
  displayName,
  address,
  level = null,
  avatarHtml = ""
) {
  const safeLabel = qEscapeHtml(label)
  const safeDisplayName = qEscapeHtml(displayName || "Unknown")
  const normalizedAddress = address || ""
  const safeAddress = qEscapeAttr(normalizedAddress)
  const titleText = normalizedAddress
    ? `${label} address: ${normalizedAddress}`
    : `${label} address unavailable`
  const safeTitle = qEscapeAttr(titleText)
  const safeAriaLabel = qEscapeAttr(
    normalizedAddress
      ? `${label} ${displayName || "Unknown"}. Click to copy the address.`
      : `${label} ${displayName || "Unknown"}. Address unavailable.`
  )
  const emptyClass = normalizedAddress ? "" : " is-empty"
  const hasLevelBadge = level !== null && typeof level !== "undefined"
  const safeLevel = hasLevelBadge ? qEscapeHtml(String(level)) : ""
  const levelBadgeHtml = hasLevelBadge
    ? `
      <span
        class="card-identity-box-level"
        title="${qEscapeAttr(`Account level: ${level}`)}"
        aria-label="${qEscapeAttr(`Account level: ${level}`)}"
      >
        L${safeLevel}
      </span>
    `
    : ""
  const avatarMarkup = String(avatarHtml || "").trim()
    ? avatarHtml
    : `<span class="user-avatar-shell user-avatar-shell--placeholder" aria-hidden="true"></span>`
  const nameTriggerHtml =
    typeof buildBoardAccountTriggerHtml === "function"
      ? buildBoardAccountTriggerHtml({
          name: displayName || "Unknown",
          address: normalizedAddress,
          label: displayName || "Unknown",
          className:
            "card-identity-box-name card-account-trigger card-account-trigger--inline",
          tagName: "span",
        })
      : `<span class="card-identity-box-name">${safeDisplayName}</span>`

  return `
    <button
      type="button"
      class="card-identity-box${emptyClass}"
      title="${safeTitle}"
      aria-label="${safeAriaLabel}"
      data-copy-address="${safeAddress}"
      data-original-title="${safeTitle}"
      onclick="copyAddressFromIdentityBox(this)"
    >
      <span class="card-identity-box-label">${safeLabel}</span>
      <span class="card-identity-box-name-row">
        <span class="card-identity-box-avatar" aria-hidden="true">
          ${avatarMarkup}
        </span>
        ${nameTriggerHtml}
        ${levelBadgeHtml}
      </span>
    </button>
  `
}

const getNewestCommentTimestamp = async (cardIdentifier) => {
  try {
    // fetchCommentsForCard returns resources each with at least 'created' or 'updated'
    const comments = await fetchCommentsForCard(cardIdentifier)
    if (!comments || comments.length === 0) {
      // No comments => fallback to 0 (or card's own date, if you like)
      return 0
    }
    // The newest can be determined by comparing 'updated' or 'created'
    const newestTimestamp = comments.reduce((acc, c) => {
      const cTime = c.updated || c.created || 0
      return cTime > acc ? cTime : acc
    }, 0)
    return newestTimestamp
  } catch (err) {
    console.error("Failed to get newest comment timestamp:", err)
    return 0
  }
}

const getMinterBoardAdminVoteThreshold = () => {
  const minterAdmins = getEffectiveMinterAdminMembers(cachedMinterAdmins)
  if (!featureTriggerPassed || minterAdmins.length <= 1) {
    return MIN_ADMIN_YES_VOTES
  }
  return Math.ceil(minterAdmins.length * 0.4)
}

const buildMinterListStatusHtml = ({
  totalYes = 0,
  totalNo = 0,
  adminYes = 0,
  hasApprovedInvite = false,
  hasPendingInvite = false,
  isExistingMinter = false,
}) => {
  const adminVoteThreshold = getMinterBoardAdminVoteThreshold()
  const adminSupportReached = Number(adminYes || 0) >= adminVoteThreshold
  const inviteProgressReached =
    (hasApprovedInvite && !hasPendingInvite) || isExistingMinter
  const steps = [
    {
      label: "New",
      state: "done",
    },
    {
      label: "Vote on Poll",
      state: inviteProgressReached || adminSupportReached ? "done" : "active",
    },
    {
      label: "Admin Support",
      state: isExistingMinter
        ? "done"
        : inviteProgressReached
        ? "done"
        : adminSupportReached
        ? "active"
        : "pending",
    },
    {
      label: "Invited",
      state: isExistingMinter
        ? "done"
        : inviteProgressReached
        ? "active"
        : "pending",
    },
    { label: "Joined", state: isExistingMinter ? "done" : "pending" },
  ]

  return `
    <div class="minter-list-status-track" aria-label="Application status">
      ${steps
        .map(
          (step) => `
            <div class="minter-list-status-step minter-list-status-step--${qEscapeAttr(
              step.state
            )}">
              <span class="minter-list-status-dot" aria-hidden="true"></span>
              <span class="minter-list-status-label">${qEscapeHtml(
                step.label
              )}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `
}

const buildMinterListStateHtml = ({
  isExistingMinter = false,
  hasApprovedInvite = false,
  hasPendingInvite = false,
} = {}) => {
  if (isExistingMinter) {
    return `<h4 style="color:rgb(135, 55, 16); margin-bottom: 0.5em;">EXISTING MINTER</h4>`
  }
  if (hasApprovedInvite && !hasPendingInvite) {
    return `<h4 style="color: gold; margin-bottom: 0.5em;">INVITED</h4>`
  }
  return ""
}

const getMinterBoardTxSignature = (tx = {}) =>
  String(
    tx?.signature || tx?.sig || tx?.txSignature || tx?.reference || ""
  ).trim()

const isMinterBoardQortalAddress = (value = "") =>
  /^Q[a-zA-Z0-9]{32}$/.test(String(value || "").trim())

const resolveMinterBoardListTimelineState = async (
  nomineeAddress = "",
  nomineeName = "",
  force = false
) => {
  const normalizedAddressInput = String(nomineeAddress || "").trim()
  const normalizedNameInput = String(nomineeName || "").trim()
  if (!normalizedAddressInput && !normalizedNameInput) {
    return {
      hasApprovedInvite: false,
      hasPendingInvite: false,
      hasGroupApproval: false,
    }
  }

  try {
    const [inviteContext, approvalTxs] = await Promise.all([
      getInviteContextCached(force).catch(() => ({
        finalInviteTxs: [],
        pendingInviteTxs: [],
      })),
      getGroupApprovalTxsCached(force).catch(() => []),
    ])

    const candidateAddresses = new Set()
    const candidateInputs = [normalizedAddressInput, normalizedNameInput].filter(
      Boolean
    )

    for (const candidateInput of candidateInputs) {
      if (isMinterBoardQortalAddress(candidateInput)) {
        candidateAddresses.add(candidateInput)
        continue
      }

      const resolvedAddress = await fetchOwnerAddressFromNameCached(
        candidateInput
      ).catch(() => "")
      if (isMinterBoardQortalAddress(resolvedAddress)) {
        candidateAddresses.add(String(resolvedAddress).trim())
      }
    }

    const allInviteTxs = [
      ...(Array.isArray(inviteContext?.finalInviteTxs)
        ? inviteContext.finalInviteTxs
        : []),
      ...(Array.isArray(inviteContext?.pendingInviteTxs)
        ? inviteContext.pendingInviteTxs
        : []),
    ].filter(
      (tx) =>
        Number(tx?.groupId) === MINTER_GROUP_ID &&
        candidateAddresses.has(String(tx?.invitee || "").trim())
    )

    const finalInviteTxs = Array.isArray(inviteContext?.finalInviteTxs)
      ? inviteContext.finalInviteTxs.filter(
          (tx) =>
            Number(tx?.groupId) === MINTER_GROUP_ID &&
            candidateAddresses.has(String(tx?.invitee || "").trim())
        )
      : []
    const pendingInviteTxs = Array.isArray(inviteContext?.pendingInviteTxs)
      ? inviteContext.pendingInviteTxs.filter(
          (tx) =>
            Number(tx?.groupId) === MINTER_GROUP_ID &&
            candidateAddresses.has(String(tx?.invitee || "").trim())
        )
      : []

    const inviteSignatures = new Set(
      allInviteTxs.map((tx) => getMinterBoardTxSignature(tx)).filter(Boolean)
    )

    const hasGroupApproval =
      inviteSignatures.size > 0 &&
      Array.isArray(approvalTxs) &&
      approvalTxs.some((approvalTx) =>
        inviteSignatures.has(
          String(approvalTx?.pendingSignature || "").trim()
        )
      )
    const hasApprovedInvite =
      finalInviteTxs.length > 0 || (hasGroupApproval && pendingInviteTxs.length === 0)

    return {
      hasApprovedInvite,
      hasPendingInvite: pendingInviteTxs.length > 0,
      hasGroupApproval,
    }
  } catch (error) {
    console.warn(
      `Unable to resolve list timeline state for ${
        normalizedAddressInput || normalizedNameInput || "unknown"
      }:`,
      error
    )
    return {
      hasApprovedInvite: false,
      hasPendingInvite: false,
      hasGroupApproval: false,
    }
  }
}

const buildMinterListCardHTML = ({
  cardIdentifier,
  userVoteStateClass,
  finalBgColor,
  avatarHtml,
  nomineeLinkHtml,
  nomineeName,
  nomineeLevel,
  nomineeAddressValue,
  nominatorName,
  nominatorAddressValue,
  safeHeader,
  renderedContent,
  linksHTML,
  safeFormattedDate,
  optimisticNotice,
  identityBoxesHtml,
  penaltyText,
  adjustmentText,
  invitedText,
  detailsHtml,
  inviteHtmlAdd,
  adminYes,
  adminNo,
  minterYes,
  minterNo,
  totalYes,
  totalNo,
  totalYesWeight,
  totalNoWeight,
  commentCount,
  poll,
  hasApprovedInvite,
  hasPendingInvite,
  isExistingMinter,
  editButtonHtml,
  notificationButtonHtml,
}) => {
  const safeNomineeLevel =
    nomineeLevel === null || typeof nomineeLevel === "undefined"
      ? "..."
      : qEscapeHtml(String(nomineeLevel))
  const safeNominee = qEscapeHtml(nomineeName)
  const safeCardIdentifier = qEscapeHtml(cardIdentifier)
  const safeNomineeAddress = qEscapeHtml(nomineeAddressValue || "Unavailable")
  const safeNominatorName = qEscapeHtml(nominatorName || "Unknown")
  const safeNominatorAddress = qEscapeHtml(
    nominatorAddressValue || "Unavailable"
  )
  const listStateHtml = buildMinterListStateHtml({
    isExistingMinter,
    hasApprovedInvite,
    hasPendingInvite,
  })
  const listEditButtonHtml = editButtonHtml || ""

  return `
    <div
      id="card-shell-${qEscapeAttr(cardIdentifier)}"
      class="minter-list-card ${userVoteStateClass}"
      style="--minter-list-accent: ${finalBgColor};"
    >
      <div class="minter-list-row">
        <div class="minter-list-person">
          <span
            class="minter-list-avatar"
            id="card-avatar-${qEscapeAttr(cardIdentifier)}"
          >${avatarHtml}</span>
          <div class="minter-list-primary">
            <h3>${nomineeLinkHtml} <span id="nominee-level-${qEscapeAttr(
    cardIdentifier
  )}">Level ${safeNomineeLevel}</span></h3>
            <p>${safeHeader}</p>
            <div class="minter-list-meta">
              <span>Nominee: ${safeNomineeAddress}</span>
              <span>Nominator: ${safeNominatorName}</span>
              <span>${safeCardIdentifier}</span>
            </div>
          </div>
        </div>

        <div class="minter-list-date">
          <span class="minter-list-kicker">Published</span>
          <strong>${safeFormattedDate}</strong>
          <div
            class="minter-list-state"
            id="minter-list-state-${qEscapeAttr(cardIdentifier)}"
            ${listStateHtml ? "" : 'style="display:none;"'}
          >${listStateHtml || ""}</div>
        </div>

        <div class="minter-list-status">
          ${buildMinterListStatusHtml({
          totalYes,
          totalNo,
          adminYes,
          hasApprovedInvite,
          hasPendingInvite,
          isExistingMinter,
        })}
          <div class="minter-list-votes">
            <span class="admin-yes">Admin Yes: ${qEscapeHtml(
              String(adminYes)
            )}</span>
            <span class="admin-no">Admin No: ${qEscapeHtml(
              String(adminNo)
            )}</span>
            <span class="minter-yes">Minter Yes: ${qEscapeHtml(
              String(minterYes)
            )}</span>
            <span class="minter-no">Minter No: ${qEscapeHtml(
              String(minterNo)
            )}</span>
          </div>
        </div>

        <div class="minter-list-comments">
          <button
            type="button"
            class="minter-list-action-button"
            aria-expanded="false"
            aria-controls="minter-list-detail-${qEscapeAttr(cardIdentifier)}"
            data-collapsed-label="Show All Data"
            data-expanded-label="Hide Data"
            data-show-comments="true"
            onclick="toggleMinterListDetails('${qEscapeAttr(
              cardIdentifier
            )}', this)"
          >
            Show All Data
          </button>
          <span
            id="list-comment-count-${qEscapeAttr(cardIdentifier)}"
            class="minter-list-comment-count"
            data-comment-count="${qEscapeAttr(String(commentCount))}"
          >${qEscapeHtml(String(commentCount))} comment${
    Number(commentCount) === 1 ? "" : "s"
  }</span>
        </div>

        <div class="minter-list-actions">
          ${notificationButtonHtml}
          <button
            type="button"
            id="minter-list-view-button-${qEscapeAttr(cardIdentifier)}"
            class="minter-list-action-button"
            aria-expanded="false"
            aria-controls="minter-list-detail-${qEscapeAttr(cardIdentifier)}"
            data-collapsed-label="View"
            data-expanded-label="Hide"
            data-show-comments="false"
            onclick="toggleMinterListDetails('${qEscapeAttr(
              cardIdentifier
            )}', this)"
          >
            View
          </button>
          ${listEditButtonHtml}
        </div>
      </div>

      <div
        id="minter-list-detail-${qEscapeAttr(cardIdentifier)}"
        class="minter-list-detail"
        hidden
      >
        ${identityBoxesHtml}
        ${penaltyText}${adjustmentText}${optimisticNotice}
        <div class="support-header"><h5>NOMINATION STATEMENT</h5></div>
        <div class="info board-rich-content ql-editor">
          ${renderedContent}
        </div>
        <div class="support-header"><h5>NOMINATION LINKS</h5></div>
        <div class="info-links">
          ${linksHTML}
        </div>
        <div class="results-header support-header"><h5>CURRENT SUPPORT RESULTS</h5></div>
        <div class="minter-card-results">
          <button onclick="togglePollDetails('${qEscapeAttr(
            cardIdentifier
          )}')">Display Poll Details</button>
          <div id="poll-details-${qEscapeAttr(
            cardIdentifier
          )}" style="display: none;">${detailsHtml}
          </div>
          ${inviteHtmlAdd}
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
        <div class="support-header"><h5>SUPPORT NOMINATION FOR </h5><h5 style="color: #ffae42;">${safeNominee}</h5></div>
        <div class="actions">
          <div class="actions-buttons">
            <button class="yes" onclick="voteYesOnMinterCard('${qEscapeAttr(
              cardIdentifier
            )}', '${qEscapeAttr(poll)}')">YES</button>
            <button
              class="comment"
              id="comment-button-${qEscapeAttr(cardIdentifier)}"
              data-comment-count="${qEscapeAttr(String(commentCount))}"
              onclick="toggleComments('${qEscapeAttr(cardIdentifier)}')"
            >
              COMMENTS (${qEscapeHtml(String(commentCount))})
            </button>
            <button class="no" onclick="voteNoOnMinterCard('${qEscapeAttr(
              cardIdentifier
            )}', '${qEscapeAttr(poll)}')">NO</button>
          </div>
        </div>
        <div id="comments-section-${qEscapeAttr(
          cardIdentifier
        )}" class="comments-section" style="display: none; margin-top: 20px;">
          <div id="comments-container-${qEscapeAttr(
            cardIdentifier
          )}" class="comments-container"></div>
          ${
            typeof getBoardCommentComposerHtml === "function"
              ? getBoardCommentComposerHtml(cardIdentifier)
              : `<textarea id="new-comment-${qEscapeAttr(
                  cardIdentifier
                )}" placeholder="Write a comment..." style="width: 100%; margin-top: 10px;"></textarea>`
          }
          ${
            typeof getBoardCommentActionBarHtml === "function"
              ? getBoardCommentActionBarHtml(cardIdentifier, "postComment")
              : `<button onclick="postComment('${qEscapeAttr(
                  cardIdentifier
                )}')">Post Comment</button>`
          }
        </div>
        <div class="minter-list-detail-footer">
          <span>Nominee address: ${safeNomineeAddress}</span>
          <span>Nominator address: ${safeNominatorAddress}</span>
        </div>
      </div>
  </div>
  `
}

const hydrateMinterBoardCardDisplay = async ({
  cardResource,
  cardData,
  cardIdentifier,
  isExistingMinter = false,
  loadToken = minterBoardInfiniteState.loadToken,
}) => {
  if (loadToken !== minterBoardInfiniteState.loadToken) return
  const root = document.getElementById(`card-shell-${cardIdentifier}`)
  if (!root) return

  try {
    const currentCardData = cardData || {}
    const nomineeName = getCardNomineeName(
      currentCardData,
      cardResource?.name || "Unknown"
    )
    const nominatorName = getCardNominatorName(
      currentCardData,
      currentCardData.publishedBy || "Unknown"
    )

    const resolvedNomineeAddress = await resolveCardNomineeAddress(
      cardResource || { name: currentCardData.publishedBy || "" },
      currentCardData
    )
    const resolvedNominatorAddress =
      getCardNominatorAddress(currentCardData, "") ||
      (nominatorName
        ? await fetchOwnerAddressFromNameCached(nominatorName).catch(() => "")
        : "")
    const isListModeHydration = Boolean(
      root.querySelector(".minter-list-card")
    )
    const listTimelinePromise =
      isListModeHydration && !isExistingMinter
        ? resolveMinterBoardListTimelineState(
            resolvedNomineeAddress || currentCardData.nomineeAddress || "",
            nomineeName || ""
          )
        : Promise.resolve({
            hasApprovedInvite: false,
            hasPendingInvite: false,
            hasGroupApproval: false,
          })
    let listTimelineState = {
      hasApprovedInvite: false,
      hasPendingInvite: false,
      hasGroupApproval: false,
    }

    const [
      avatarHtml,
      nominatorAvatarHtml,
      nomineeAddressInfo,
      nominatorAddressInfo,
      canEditCard,
      pollResultsFresh,
      invites,
    ] = await Promise.all([
      getMinterAvatar(nomineeName),
      getMinterAvatar(nominatorName || ""),
      getAddressInfoCached(
        resolvedNomineeAddress || cardResource?.name || ""
      ).catch(() => null),
      resolvedNominatorAddress
        ? getAddressInfoCached(resolvedNominatorAddress).catch(() => null)
        : Promise.resolve(null),
      canCurrentUserEditPublishedCard(
        nominatorName,
        resolvedNominatorAddress || ""
      ).catch(() => false),
      currentCardData.poll
        ? fetchPollResultsCached(currentCardData.poll).catch(() => null)
        : Promise.resolve(null),
      isExistingMinter
        ? Promise.resolve([])
        : fetchGroupInvitesByAddress(
            resolvedNomineeAddress || cardResource?.name || ""
          ).catch(() => []),
    ])

    if (
      loadToken !== minterBoardInfiniteState.loadToken ||
      !document.body.contains(root)
    ) {
      return
    }

    const nomineeLevel = nomineeAddressInfo?.level ?? 0
    const nominatorLevel = nominatorAddressInfo?.level ?? null
    const nomineeAddressValue =
      resolvedNomineeAddress || currentCardData.nomineeAddress || ""
    const nominatorAddressValue =
      resolvedNominatorAddress || currentCardData.nominatorAddress || ""
    let adminYesForInvite = 0
    let hasMinterInvite = false
    let inviteHtmlAdd = ""

    const identityRow = root.querySelector(`#identity-row-${cardIdentifier}`)
    if (identityRow) {
      identityRow.innerHTML = `
        ${buildIdentityBoxHtml(
          "Nominee",
          nomineeName,
          nomineeAddressValue || "",
          nomineeLevel,
          avatarHtml
        )}
        ${buildIdentityBoxHtml(
          "Nominator",
          nominatorName || "Unknown",
          nominatorAddressValue || "",
          nominatorLevel,
          nominatorAvatarHtml
        )}
      `
    }

    const avatarSlot = root.querySelector(`#card-avatar-${cardIdentifier}`)
    if (avatarSlot) {
      avatarSlot.innerHTML = avatarHtml
    }

    const levelSlot = root.querySelector(`#nominee-level-${cardIdentifier}`)
    if (levelSlot) {
      levelSlot.textContent = `Level ${nomineeLevel}`
    }

    const pollDetailsSlot = root.querySelector(
      `#poll-details-${cardIdentifier}`
    )
    if (pollDetailsSlot) {
      if (pollResultsFresh) {
        rememberMinterBoardPollSnapshot(currentCardData.poll, pollResultsFresh)
        const minterGroupMembers = cachedMinterGroup
        const minterAdmins = cachedMinterAdmins
        const pollDetails = await processPollData(
          pollResultsFresh,
          minterGroupMembers,
          minterAdmins,
          nomineeName,
          cardIdentifier
        )
        if (
          loadToken !== minterBoardInfiniteState.loadToken ||
          !document.body.contains(root)
        ) {
          return
        }
        const {
          adminYes = 0,
          adminNo = 0,
          minterYes = 0,
          minterNo = 0,
          totalYes = 0,
          totalNo = 0,
          totalYesWeight = 0,
          totalNoWeight = 0,
          detailsHtml = "",
          userVote,
        } = pollDetails || {}
        adminYesForInvite = Number(adminYes || 0)
        const userVoteStateClass =
          userVote === 0
            ? "card--user-vote-yes"
            : userVote === 1
            ? "card--user-vote-no"
            : ""
        root.classList.remove("card--user-vote-yes", "card--user-vote-no")
        if (userVoteStateClass) {
          root.classList.add(userVoteStateClass)
        }
        pollDetailsSlot.innerHTML = detailsHtml
        const adminYesSlot = root.querySelector(".admin-results .admin-yes")
        const adminNoSlot = root.querySelector(".admin-results .admin-no")
        const minterYesSlot = root.querySelector(".minter-results .minter-yes")
        const minterNoSlot = root.querySelector(".minter-results .minter-no")
        const totalYesSlot = root.querySelector(".total-results .total-yes")
        const totalNoSlot = root.querySelector(".total-results .total-no")
        const totalYesWeightSlot = root.querySelector(
          ".total-results .total-yes + .vote-total-weight"
        )
        const totalNoWeightSlot = root.querySelector(
          ".total-results .vote-total-group:last-child .vote-total-weight"
        )
        if (adminYesSlot) adminYesSlot.textContent = `Admin Yes: ${adminYes}`
        if (adminNoSlot) adminNoSlot.textContent = `Admin No: ${adminNo}`
        if (minterYesSlot)
          minterYesSlot.textContent = `Minter Yes: ${minterYes}`
        if (minterNoSlot) minterNoSlot.textContent = `Minter No: ${minterNo}`
        if (totalYesSlot) totalYesSlot.textContent = `Total Yes: ${totalYes}`
        if (totalNoSlot) totalNoSlot.textContent = `Total No: ${totalNo}`
        if (totalYesWeightSlot)
          totalYesWeightSlot.textContent = `Weight: ${totalYesWeight}`
        if (totalNoWeightSlot)
          totalNoWeightSlot.textContent = `Weight: ${totalNoWeight}`

        listTimelineState = await listTimelinePromise
        const listStatusTrack = root.querySelector(".minter-list-status-track")
        if (listStatusTrack) {
          if (
            loadToken !== minterBoardInfiniteState.loadToken ||
            !document.body.contains(root)
          ) {
            return
          }
          listStatusTrack.outerHTML = buildMinterListStatusHtml({
            totalYes,
            totalNo,
            adminYes,
            hasApprovedInvite: listTimelineState.hasApprovedInvite,
            hasPendingInvite: listTimelineState.hasPendingInvite,
            isExistingMinter,
          })
        }

        const listAdminYesSlot = root.querySelector(
          ".minter-list-votes .admin-yes"
        )
        const listAdminNoSlot = root.querySelector(".minter-list-votes .admin-no")
        const listMinterYesSlot = root.querySelector(
          ".minter-list-votes .minter-yes"
        )
        const listMinterNoSlot = root.querySelector(".minter-list-votes .minter-no")
        if (listAdminYesSlot)
          listAdminYesSlot.textContent = `Admin Yes: ${adminYes}`
        if (listAdminNoSlot) listAdminNoSlot.textContent = `Admin No: ${adminNo}`
        if (listMinterYesSlot)
          listMinterYesSlot.textContent = `Minter Yes: ${minterYes}`
        if (listMinterNoSlot)
          listMinterNoSlot.textContent = `Minter No: ${minterNo}`

        const listStateSlot = root.querySelector(
          `#minter-list-state-${cardIdentifier}`
        )
        if (listStateSlot) {
          const listStateHtml = buildMinterListStateHtml({
            isExistingMinter,
            hasApprovedInvite: listTimelineState.hasApprovedInvite,
            hasPendingInvite: listTimelineState.hasPendingInvite,
          })
          listStateSlot.innerHTML = listStateHtml
          listStateSlot.style.display = listStateHtml ? "" : "none"
        }
      } else {
        pollDetailsSlot.innerHTML = `<div class="board-progress-muted">No poll data found for this nomination yet.</div>`
      }
    }

    const inviteSlot = root.querySelector(
      `#invite-button-slot-${cardIdentifier}`
    )
    if (inviteSlot) {
      hasMinterInvite = Array.isArray(invites)
        ? invites.some((invite) => Number(invite.groupId) === MINTER_GROUP_ID)
        : false
      const inviteHasBeenApprovedForDisplay = isListModeHydration
        ? listTimelineState.hasApprovedInvite &&
          !listTimelineState.hasPendingInvite
        : hasMinterInvite
      if (isExistingMinter) {
        inviteHtmlAdd = ""
      } else if (inviteHasBeenApprovedForDisplay) {
        if (
          userState.accountName === nomineeName ||
          userState.accountAddress === nomineeAddressValue
        ) {
          inviteHtmlAdd = `
            <div id="join-button-container-${cardIdentifier}" style="margin-top: 1em;">
              <button
                style="padding: 8px; background: rgb(37, 99, 44); color:rgb(240, 240, 240); border: 1px solid rgb(255, 255, 255); border-radius: 5px; cursor: pointer;"
                onmouseover="this.style.backgroundColor='rgb(25, 47, 39) '"
                onmouseout="this.style.backgroundColor='rgb(37, 99, 44) '"
                onclick="handleJoinGroup('${qEscapeAttr(
                  userState.accountAddress
                )}', '${qEscapeAttr(cardIdentifier)}')">
              Join MINTER Group
            </button>
          </div>
          `
        } else {
          inviteHtmlAdd = ""
        }
      } else if (canEditCard) {
        inviteHtmlAdd = await checkAndDisplayInviteButton(
          adminYesForInvite,
          nomineeName,
          cardIdentifier
        ).catch(() => "")
      } else {
        inviteHtmlAdd = ""
      }
      inviteSlot.innerHTML = inviteHtmlAdd
    }

    const supportResultsLoadingSlot = root.querySelector(
      `#support-results-loading-${cardIdentifier}`
    )
    if (supportResultsLoadingSlot) {
      supportResultsLoadingSlot.style.display = "none"
    }

    const editSlot = root.querySelector(`#edit-button-slot-${cardIdentifier}`)
    if (editSlot) {
      editSlot.innerHTML = canEditCard
        ? `
          <button
            type="button"
            class="card-edit-button"
            title="Edit card"
            aria-label="Edit card"
            onclick="openMinterBoardCardEditor('${qEscapeAttr(
              cardIdentifier
            )}')"
          >
            <span class="mobi-mbri-edit-2" aria-hidden="true"></span>
          </button>
        `
        : ""
    }

    const cachedCommentCount = commentCountCache.get(cardIdentifier)
    if (typeof cachedCommentCount !== "undefined") {
      const commentCountValue = Number(cachedCommentCount)
      const commentButton = root.querySelector(
        `#comment-button-${cardIdentifier}`
      )
      if (commentButton) {
        commentButton.dataset.commentCount = String(commentCountValue)
        if (
          commentButton.textContent !== "HIDE COMMENTS" &&
          commentButton.textContent !== "LOADING..."
        ) {
          commentButton.textContent = `COMMENTS (${commentCountValue})`
        }
      }
      const listCommentCount = root.querySelector(
        `#list-comment-count-${cardIdentifier}`
      )
      if (listCommentCount) {
        listCommentCount.dataset.commentCount = String(commentCountValue)
        listCommentCount.textContent = `${commentCountValue} comment${
          commentCountValue === 1 ? "" : "s"
        }`
      }
    }

    const listFooter = root.querySelector(".minter-list-detail-footer")
    if (listFooter) {
      listFooter.innerHTML = `
        <span>Nominee address: ${qEscapeHtml(
          nomineeAddressValue || "Unavailable"
        )}</span>
        <span>Nominator address: ${qEscapeHtml(
          nominatorAddressValue || "Unavailable"
        )}</span>
      `
    }

    minterBoardCardDataByIdentifier.set(cardIdentifier, {
      ...currentCardData,
      nominee: nomineeName,
      nomineeAddress: nomineeAddressValue,
      nominator: nominatorName,
      nominatorAddress: nominatorAddressValue,
    })
  } catch (error) {
    console.warn(`Unable to hydrate nomination card ${cardIdentifier}:`, error)
  }
}

const toggleMinterListDetails = async (cardIdentifier, buttonEl) => {
  const detail = document.getElementById(`minter-list-detail-${cardIdentifier}`)
  if (!detail) return
  const isHidden = detail.hidden
  const shouldShowComments = String(
    buttonEl?.dataset?.showComments || "false"
  ).toLowerCase() === "true"
  if (isHidden && !shouldShowComments) {
    await setMinterListCommentsVisibility(cardIdentifier, false)
  }

  detail.hidden = !isHidden

  const controls = document.querySelectorAll(`[aria-controls="${detail.id}"]`)
  controls.forEach((control) => {
    control.setAttribute("aria-expanded", isHidden ? "true" : "false")
    control.textContent = isHidden
      ? control.dataset.expandedLabel || "Hide"
      : control.dataset.collapsedLabel || "View"
  })
  if (isHidden && shouldShowComments) {
    await setMinterListCommentsVisibility(cardIdentifier, true)
  } else {
    await setMinterListCommentsVisibility(cardIdentifier, false)
  }
}

const getCurrentMinterNotificationVoteType = () => {
  if (userState.isMinterAdmin || userState.isAdmin) {
    return "admin_vote"
  }
  const minterAddresses = (cachedMinterGroup || []).map(
    (member) => member.member
  )
  if (minterAddresses.includes(userState.accountAddress)) {
    return "minter_vote"
  }
  return "user_vote"
}

const voteOnMinterCardPoll = async (cardIdentifier, poll, optionIndex) => {
  if (optionIndex === 0) {
    await voteYesOnPoll(poll)
  } else {
    await voteNoOnPoll(poll)
  }
  const eventType = getCurrentMinterNotificationVoteType()
  await notifyMinterBoardEvent({
    eventType,
    cardIdentifier,
    poll,
    vote: optionIndex === 0 ? "yes" : "no",
    actionIdentifier: `${cardIdentifier}:${poll}:${optionIndex}:${
      userState.accountAddress || "unknown"
    }`,
    actorAddress: userState.accountAddress || "",
    summary: `${userState.accountName || "A user"} voted ${
      optionIndex === 0 ? "YES" : "NO"
    }.`,
  })
}

const voteYesOnMinterCard = async (cardIdentifier, poll) => {
  await voteOnMinterCardPoll(cardIdentifier, poll, 0)
}

const voteNoOnMinterCard = async (cardIdentifier, poll) => {
  await voteOnMinterCardPoll(cardIdentifier, poll, 1)
}

// Create the overall Minter Card HTML -----------------------------------------------
const createCardHTML = async (
  cardData,
  pollResults,
  cardIdentifier,
  commentCount,
  cardUpdatedTime,
  bgColor,
  address,
  isExistingMinter = false
) => {
  const quickCardData = cardData || {}
  const quickNomineeName = getCardNomineeName(
    quickCardData,
    quickCardData.creator || "Unknown"
  )
  const quickNomineeAddressValue = getCardNomineeAddress(
    quickCardData,
    address ||
      quickCardData.creatorAddress ||
      quickCardData.nomineeAddress ||
      ""
  )
  const quickNominatorName = getCardNominatorName(
    quickCardData,
    quickCardData.publishedBy || "Unknown"
  )
  const quickNominatorAddressValue = getCardNominatorAddress(
    quickCardData,
    quickCardData.publishedByAddress || quickCardData.nominatorAddress || ""
  )
  const formattedDate = cardUpdatedTime
    ? new Date(cardUpdatedTime).toLocaleString()
    : new Date(quickCardData.timestamp || Date.now()).toLocaleString()
  const placeholderAvatarHtml = `<span class="user-avatar-shell user-avatar-shell--placeholder" aria-hidden="true"></span>`
  const safeQuickHeader = qEscapeHtml(String(quickCardData.header || ""))
  const safeQuickFormattedDate = qEscapeHtml(formattedDate)
  const safeQuickNominee = qEscapeHtml(quickNomineeName)
  const quickNomineeLinkHtml =
    typeof buildBoardAccountTriggerHtml === "function"
      ? buildBoardAccountTriggerHtml({
          name: quickNomineeName || "Unknown",
          address: quickNomineeAddressValue || "",
          label: quickNomineeName || "Unknown",
          className: "card-account-trigger card-account-trigger--heading",
          tagName: "button",
        })
      : safeQuickNominee
  const quickIdentityBoxesHtml = `
    <div class="card-identity-row" id="identity-row-${qEscapeAttr(
      cardIdentifier
    )}">
      ${buildIdentityBoxHtml(
        "Nominee",
        quickNomineeName,
        quickNomineeAddressValue || "",
        null,
        placeholderAvatarHtml
      )}
      ${buildIdentityBoxHtml(
        "Nominator",
        quickNominatorName || "Unknown",
        quickNominatorAddressValue || "",
        null,
        placeholderAvatarHtml
      )}
    </div>
  `
  const quickNotificationButtonHtml =
    buildMinterCardNotificationButtonHtml(cardIdentifier)
  const quickEditButtonHtml = `<div id="edit-button-slot-${qEscapeAttr(
    cardIdentifier
  )}"></div>`
  const quickInviteHtmlAdd = `<div id="invite-button-slot-${qEscapeAttr(
    cardIdentifier
  )}" class="minter-card-invite-slot"></div>`
  const quickDetailsHtml = `
    <div class="board-progress-muted" style="margin: 0.5em 0; color: #c7c7c7;">
      Loading current approval results...
    </div>
  `
  const quickSupportResultsLoadingHtml = `
    <div class="minter-card-results-loading" id="support-results-loading-${qEscapeAttr(
      cardIdentifier
    )}" style="margin: 0.5em 0;">
      ${getBoardInlineLoadingHTML("Loading current approval results...")}
    </div>
  `
  const quickOptimisticNotice = quickCardData._optimisticPending
    ? `<div class="board-progress-muted" style="margin: 0.75em 0; color: #ffd27d;">Published locally. Waiting for QDN indexing.</div>`
    : ""
  const quickInvitedText = isExistingMinter
    ? `<h4 style="color:rgb(135, 55, 16); margin-bottom: 0.5em;">EXISTING MINTER</h4>`
    : ""
  const quickUserVoteStateClass = ""
  const quickFinalBgColor = bgColor
  const quickNomineeLevelLabel = "..."
  const quickCommentCount = Number(commentCount || 0)
  const isListMode = getMinterBoardDisplayMode() === "list"
  minterBoardCardDataByIdentifier.set(cardIdentifier, {
    ...quickCardData,
    nominee: quickNomineeName,
    nomineeAddress: quickNomineeAddressValue,
    nominator: quickNominatorName,
    nominatorAddress: quickNominatorAddressValue,
  })
  createModal("links")
  createModal("poll-details")
  if (quickCardData.poll) {
    void fetchPollResultsCached(quickCardData.poll).catch(() => null)
  }
  if (isListMode) {
    return buildMinterListCardHTML({
      cardIdentifier,
      userVoteStateClass: quickUserVoteStateClass,
      finalBgColor: quickFinalBgColor,
      avatarHtml: placeholderAvatarHtml,
      nomineeLinkHtml: quickNomineeLinkHtml,
      nomineeName: quickNomineeName,
      nomineeLevel: null,
      nomineeAddressValue: quickNomineeAddressValue,
      nominatorName: quickNominatorName,
      nominatorAddressValue: quickNominatorAddressValue,
      safeHeader: safeQuickHeader,
      renderedContent: qRenderRichContentHtml(quickCardData.content || ""),
      linksHTML: (Array.isArray(quickCardData.links) ? quickCardData.links : [])
        .map(
          (link, index) => `
      <button data-link="${qEscapeAttr(
        link
      )}" onclick="openLinksModalFromButton(this)">
        ${qEscapeHtml(`Link ${index + 1} - ${link}`)}
      </button>
    `
        )
        .join(""),
      safeFormattedDate: safeQuickFormattedDate,
      optimisticNotice: quickOptimisticNotice,
      identityBoxesHtml: quickIdentityBoxesHtml,
      penaltyText: "",
      adjustmentText: "",
      invitedText: quickInvitedText,
      detailsHtml: quickDetailsHtml,
      inviteHtmlAdd: quickInviteHtmlAdd,
      adminYes: "...",
      adminNo: "...",
      minterYes: "...",
      minterNo: "...",
      totalYes: "...",
      totalNo: "...",
      totalYesWeight: "...",
      totalNoWeight: "...",
      commentCount: quickCommentCount,
      poll: quickCardData.poll || "",
      hasApprovedInvite: false,
      hasPendingInvite: false,
      isExistingMinter,
      editButtonHtml: quickEditButtonHtml,
      notificationButtonHtml: quickNotificationButtonHtml,
    })
  }

  const quickLinksArray = Array.isArray(quickCardData.links)
    ? quickCardData.links
    : []
  const quickLinksHTML = quickLinksArray
    .map(
      (link, index) => `
    <button data-link="${qEscapeAttr(
      link
    )}" onclick="openLinksModalFromButton(this)">
      ${qEscapeHtml(`Link ${index + 1} - ${link}`)}
    </button>
  `
    )
    .join("")

  return `
  <div
    id="card-shell-${qEscapeAttr(cardIdentifier)}"
    class="minter-card ${quickUserVoteStateClass}"
    style="background-color: ${quickFinalBgColor}"
  >
    ${quickNotificationButtonHtml}
    ${quickEditButtonHtml}
    <div class="minter-card-header">
      <span class="minter-card-avatar" id="card-avatar-${qEscapeAttr(
        cardIdentifier
      )}">${placeholderAvatarHtml}</span>
      <h3>${quickNomineeLinkHtml} - <span id="nominee-level-${qEscapeAttr(
    cardIdentifier
  )}">Level ${quickNomineeLevelLabel}</span></h3>
      ${quickIdentityBoxesHtml}
      <div class="card-title-box">${safeQuickHeader}</div>
      ${quickOptimisticNotice}
      ${quickInvitedText}
    </div>
    <div class="support-header"><h5>NOMINATION STATEMENT</h5></div>
    <div class="info board-rich-content ql-editor">
      ${qRenderRichContentHtml(quickCardData.content || "")}
    </div>
    <div class="support-header"><h5>NOMINATION LINKS</h5></div>
    <div class="info-links">
      ${quickLinksHTML}
    </div>
    <div class="results-header support-header"><h5>CURRENT SUPPORT RESULTS</h5></div>
    <div class="minter-card-results">
      ${quickSupportResultsLoadingHtml}
      <button onclick="togglePollDetails('${qEscapeAttr(
        cardIdentifier
      )}')">Display Poll Details</button>
      <div id="poll-details-${qEscapeAttr(
        cardIdentifier
      )}" style="display: none;">${quickDetailsHtml}</div>
      ${quickInviteHtmlAdd}
      <div class="admin-results vote-results vote-results--admin">
        <span class="admin-yes">Admin Yes: ...</span>
        <span class="admin-no">Admin No: ...</span>
      </div>
      <div class="minter-results vote-results vote-results--outlined">
        <span class="minter-yes">Minter Yes: ...</span>
        <span class="minter-no">Minter No: ...</span>
      </div>
      <div class="total-results vote-results vote-results--outlined vote-results--totals">
        <div class="vote-total-group">
          <span class="total-yes">Total Yes: ...</span>
          <span class="vote-total-weight">Weight: ...</span>
        </div>
        <div class="vote-total-group">
          <span class="total-no">Total No: ...</span>
          <span class="vote-total-weight">Weight: ...</span>
        </div>
      </div>
    </div>
    <div class="support-header"><h5>SUPPORT NOMINATION FOR </h5><h5 style="color: #ffae42;">${safeQuickNominee}</h5>
    <p style="color: #c7c7c7; font-size: .65rem; margin-top: 1vh">(click COMMENTS button to open/close card comments)</p>
    </div>
    <div class="actions">
      <div class="actions-buttons">
        <button class="yes" onclick="voteYesOnMinterCard('${qEscapeAttr(
          cardIdentifier
        )}', '${qEscapeAttr(quickCardData.poll || "")}')">YES</button>
        <button class="comment" id="comment-button-${qEscapeAttr(
          cardIdentifier
        )}" data-comment-count="${qEscapeAttr(
    String(quickCommentCount)
  )}" onclick="toggleComments('${qEscapeAttr(
    cardIdentifier
  )}')">COMMENTS (${qEscapeHtml(String(quickCommentCount))})</button>
        <button class="no" onclick="voteNoOnMinterCard('${qEscapeAttr(
          cardIdentifier
        )}', '${qEscapeAttr(quickCardData.poll || "")}')">NO</button>
      </div>
    </div>
    <div id="comments-section-${qEscapeAttr(
      cardIdentifier
    )}" class="comments-section" style="display: none; margin-top: 20px;">
      <div id="comments-container-${qEscapeAttr(
        cardIdentifier
      )}" class="comments-container"></div>
      ${
        typeof getBoardCommentComposerHtml === "function"
          ? getBoardCommentComposerHtml(cardIdentifier)
          : `<textarea id="new-comment-${qEscapeAttr(
              cardIdentifier
            )}" placeholder="Write a comment..." style="width: 100%; margin-top: 10px;"></textarea>`
      }
      ${
        typeof getBoardCommentActionBarHtml === "function"
          ? getBoardCommentActionBarHtml(cardIdentifier, "postComment")
          : `<button onclick="postComment('${qEscapeAttr(
              cardIdentifier
            )}')">Post Comment</button>`
      }
    </div>
    <p class="card-published-date">Published ${safeQuickFormattedDate}</p>
  </div>
  `
  {
    const {
      header,
      content,
      links,
      nominee,
      nomineeAddress,
      nominator,
      nominatorAddress,
      creator,
      creatorAddress,
      publishedBy,
      publishedByAddress,
      timestamp,
      poll,
    } = cardData
    const formattedDate = cardUpdatedTime
      ? new Date(cardUpdatedTime).toLocaleString()
      : new Date(timestamp).toLocaleString()
    const nomineeName = getCardNomineeName(cardData, creator || "Unknown")
    const nomineeAddressValue = getCardNomineeAddress(
      cardData,
      address || creatorAddress || nomineeAddress || ""
    )
    const nominatorName = getCardNominatorName(
      cardData,
      publishedBy || "Unknown"
    )
    const nominatorAddressValue = getCardNominatorAddress(
      cardData,
      publishedByAddress || nominatorAddress || ""
    )
    const avatarPromise = Promise.all([
      getMinterAvatar(nomineeName),
      getMinterAvatar(nominatorName || ""),
    ]).catch(() => [
      `<span class="user-avatar-shell user-avatar-shell--placeholder" aria-hidden="true"></span>`,
      `<span class="user-avatar-shell user-avatar-shell--placeholder" aria-hidden="true"></span>`,
    ])
    const addressInfoPromise = Promise.all([
      getAddressInfoCached(nomineeAddressValue || address),
      nominatorAddressValue
        ? getAddressInfoCached(nominatorAddressValue)
        : Promise.resolve(null),
    ]).catch(() => [null, null])
    const canEditCardPromise = canCurrentUserEditPublishedCard(
      nominatorName,
      nominatorAddressValue || ""
    ).catch(() => false)
    const inviteLookupPromise = isExistingMinter
      ? Promise.resolve([])
      : fetchGroupInvitesByAddress(nomineeAddressValue || address).catch(
          () => []
        )
    const [
      [avatarHtml, nominatorAvatarHtml],
      [nomineeAddressInfo, nominatorAddressInfo],
      canEditCard,
      invites,
    ] = await Promise.all([
      avatarPromise,
      addressInfoPromise,
      canEditCardPromise,
      inviteLookupPromise,
    ])
    const linksArray = Array.isArray(links) ? links : []
    minterBoardCardDataByIdentifier.set(cardIdentifier, {
      ...cardData,
      nominee: nomineeName,
      nomineeAddress: nomineeAddressValue,
      nominator: nominatorName,
      nominatorAddress: nominatorAddressValue,
    })
    const linksHTML = linksArray
      .map(
        (link, index) => `
    <button data-link="${qEscapeAttr(
      link
    )}" onclick="openLinksModalFromButton(this)">
      ${qEscapeHtml(`Link ${index + 1} - ${link}`)}
    </button>
  `
      )
      .join("")
    const safeNominee = qEscapeHtml(nomineeName)
    const safeHeader = qEscapeHtml(header)
    const renderedContent = qRenderRichContentHtml(content)
    const nomineeLinkHtml =
      typeof buildBoardAccountTriggerHtml === "function"
        ? buildBoardAccountTriggerHtml({
            name: nomineeName || "Unknown",
            address: nomineeAddressValue || "",
            label: nomineeName || "Unknown",
            className: "card-account-trigger card-account-trigger--heading",
            tagName: "button",
          })
        : safeNominee
    const safeFormattedDate = qEscapeHtml(formattedDate)
    const optimisticNotice = cardData._optimisticPending
      ? `<div class="board-progress-muted" style="margin: 0.75em 0; color: #ffd27d;">Published locally. Waiting for QDN indexing.</div>`
      : ""
    const nomineeLevel = nomineeAddressInfo?.level ?? 0
    const nominatorLevel = nominatorAddressInfo?.level ?? null
    const editButtonHtml = canEditCard
      ? `
      <button
        type="button"
        class="card-edit-button"
        title="Edit card"
        aria-label="Edit card"
        onclick="openMinterBoardCardEditor('${qEscapeAttr(cardIdentifier)}')"
      >
        <span class="mobi-mbri-edit-2" aria-hidden="true"></span>
      </button>
    `
      : ""
    const notificationButtonHtml =
      buildMinterCardNotificationButtonHtml(cardIdentifier)
    const identityBoxesHtml = `
    <div class="card-identity-row">
      ${buildIdentityBoxHtml(
        "Nominee",
        nomineeName,
        nomineeAddressValue || "",
        nomineeLevel,
        avatarHtml
      )}
      ${buildIdentityBoxHtml(
        "Nominator",
        nominatorName || "Unknown",
        nominatorAddressValue || "",
        nominatorLevel,
        nominatorAvatarHtml
      )}
    </div>
  `
    const supportResultsLoadingHtml = `
      <div class="minter-card-results-loading" id="support-results-loading-${qEscapeAttr(
        cardIdentifier
      )}" style="margin: 0.5em 0;">
        ${getBoardInlineLoadingHTML("Loading current approval results...")}
      </div>
    `
    if (poll) {
      void fetchPollResultsCached(poll).catch(() => null)
    }
    createModal("links")
    createModal("poll-details")

    let hasMinterInvite = false
    try {
      hasMinterInvite = invites.some(
        (invite) => Number(invite.groupId) === MINTER_GROUP_ID
      )
    } catch (error) {
      console.error("Error checking invites for user:", error)
    }

    const inviteButtonSlotHtml = `
      <div
        id="invite-button-slot-${qEscapeAttr(cardIdentifier)}"
        class="minter-card-invite-slot"
      ></div>
    `
    let inviteHtmlAdd = inviteButtonSlotHtml

    let finalBgColor = bgColor
    const userVoteStateClass = ""
    let invitedText = "" // for "INVITED" label if found
    let adminYes = 0
    let adminNo = 0
    let minterYes = 0
    let minterNo = 0
    let totalYes = 0
    let totalNo = 0
    let totalYesWeight = 0
    let totalNoWeight = 0
    let detailsHtml = supportResultsLoadingHtml
    let userVote = null
    const penaltyText =
      (nomineeAddressInfo?.blocksMintedPenalty ?? 0) === 0
        ? ""
        : "<p>(has Blocks Penalty)<p>"
    const adjustmentText =
      (nomineeAddressInfo?.blocksMintedAdjustment ?? 0) === 0
        ? ""
        : "<p>(has Blocks Adjustment)<p>"

    if (isExistingMinter) {
      finalBgColor = "rgb(99, 99, 99)"
      invitedText = `<h4 style="color:rgb(135, 55, 16); margin-bottom: 0.5em;">EXISTING MINTER</h4>`
      inviteHtmlAdd = ""
    } else if (hasMinterInvite) {
      // Issued invites no longer need admin controls; only the nominee gets the join action.
      finalBgColor = "black"
      invitedText = `<h4 style="color: gold; margin-bottom: 0.5em;">INVITED</h4>`
      if (
        userState.accountName === nomineeName ||
        userState.accountAddress === nomineeAddressValue
      ) {
        inviteHtmlAdd = `
          <div id="join-button-container-${cardIdentifier}" style="margin-top: 1em;">
              <button
                style="padding: 8px; background: rgb(37, 99, 44); color:rgb(240, 240, 240); border: 1px solid rgb(255, 255, 255); border-radius: 5px; cursor: pointer;"
                onmouseover="this.style.backgroundColor='rgb(25, 47, 39) '"
                onmouseout="this.style.backgroundColor='rgb(37, 99, 44) '"
                onclick="handleJoinGroup('${qEscapeAttr(
                  userState.accountAddress
                )}', '${qEscapeAttr(cardIdentifier)}')">
              Join MINTER Group
            </button>
          </div>
          `
      } else {
        console.log(`user is not the nominee... NOT displaying join button`)
        inviteHtmlAdd = ""
      }
    } else if (!canEditCard) {
      inviteHtmlAdd = ""
    }

    if (isListMode) {
      const listTimelineState = await resolveMinterBoardListTimelineState(
        nomineeAddressValue || "",
        nomineeName || ""
      )
      return buildMinterListCardHTML({
        cardIdentifier,
        userVoteStateClass,
        finalBgColor,
        avatarHtml,
        nomineeLinkHtml,
        nomineeName,
        nomineeLevel,
        nomineeAddressValue,
        nominatorName,
        nominatorAddressValue,
        safeHeader,
        renderedContent,
        linksHTML,
        safeFormattedDate,
        optimisticNotice,
        identityBoxesHtml,
        penaltyText,
        adjustmentText,
        invitedText,
        detailsHtml,
        inviteHtmlAdd,
        adminYes,
        adminNo,
        minterYes,
        minterNo,
        totalYes,
        totalNo,
        totalYesWeight,
        totalNoWeight,
        commentCount,
        poll,
        hasApprovedInvite: listTimelineState.hasApprovedInvite,
        hasPendingInvite: listTimelineState.hasPendingInvite,
        isExistingMinter,
        editButtonHtml,
        notificationButtonHtml,
      })
    }

    return `
  <div class="minter-card ${userVoteStateClass}" style="background-color: ${finalBgColor}">
    ${notificationButtonHtml}
    ${editButtonHtml}
    <div class="minter-card-header">
      ${avatarHtml}
      <h3>${nomineeLinkHtml} - Level ${nomineeLevel}</h3>
      ${identityBoxesHtml}
      <div class="card-title-box">${safeHeader}</div>
      ${penaltyText}${adjustmentText}${invitedText}
      ${optimisticNotice}
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
    <div class="minter-card-results">
      ${supportResultsLoadingHtml}
      <button onclick="togglePollDetails('${cardIdentifier}')">Display Poll Details</button>
      <div id="poll-details-${cardIdentifier}" style="display: none;">
        ${supportResultsLoadingHtml}
      </div>
      ${inviteHtmlAdd}
      <div class="admin-results vote-results vote-results--admin">
        <span class="admin-yes">Admin Yes: ...</span>
        <span class="admin-no">Admin No: ...</span>
      </div>
      <div class="minter-results vote-results vote-results--outlined">
        <span class="minter-yes">Minter Yes: ...</span>
        <span class="minter-no">Minter No: ...</span>
      </div>
      <div class="total-results vote-results vote-results--outlined vote-results--totals">
        <div class="vote-total-group">
          <span class="total-yes">Total Yes: ...</span>
          <span class="vote-total-weight">Weight: ...</span>
        </div>
        <div class="vote-total-group">
          <span class="total-no">Total No: ...</span>
          <span class="vote-total-weight">Weight: ...</span>
        </div>
      </div>
    </div>
    <div class="support-header"><h5>SUPPORT NOMINATION FOR </h5><h5 style="color: #ffae42;">${safeNominee}</h5>
    <p style="color: #c7c7c7; font-size: .65rem; margin-top: 1vh">(click COMMENTS button to open/close card comments)</p>
    </div>
    <div class="actions">
      <div class="actions-buttons">
        <button class="yes" onclick="voteYesOnMinterCard('${qEscapeAttr(
          cardIdentifier
        )}', '${qEscapeAttr(poll)}')">YES</button>
        <button class="comment" id="comment-button-${cardIdentifier}" data-comment-count="${commentCount}"  onclick="toggleComments('${cardIdentifier}')">COMMENTS (${commentCount})</button>
        <button class="no" onclick="voteNoOnMinterCard('${qEscapeAttr(
          cardIdentifier
        )}', '${qEscapeAttr(poll)}')">NO</button>
      </div>
    </div>
    <div id="comments-section-${cardIdentifier}" class="comments-section" style="display: none; margin-top: 20px;">
      <div id="comments-container-${cardIdentifier}" class="comments-container"></div>
      ${
        typeof getBoardCommentComposerHtml === "function"
          ? getBoardCommentComposerHtml(cardIdentifier)
          : `<textarea id="new-comment-${cardIdentifier}" placeholder="Write a comment..." style="width: 100%; margin-top: 10px;"></textarea>`
      }
      ${
        typeof getBoardCommentActionBarHtml === "function"
          ? getBoardCommentActionBarHtml(cardIdentifier, "postComment")
          : `<button onclick="postComment('${cardIdentifier}')">Post Comment</button>`
      }
    </div>
    <p class="card-published-date">Published ${safeFormattedDate}</p>
  </div>
  `
  }
}
