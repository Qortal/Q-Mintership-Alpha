// // NOTE - Change isTestMode to false prior to actual release ---- !important - You may also change identifier if you want to not show older cards.
const testMode = false
const minterCardIdentifierPrefix = "Minter-board-card"
const minterBoardPublishEditorKey = "minter-card-content"
let isExistingCard = false
let existingCardData = {}
let existingCardIdentifier = ""
const MIN_ADMIN_YES_VOTES = 9
const GROUP_APPROVAL_FEATURE_TRIGGER_HEIGHT = 2012800 //TODO update this to correct featureTrigger height when known, either that, or pull from core.
let featureTriggerPassed = false
let isApproved = false

let cachedMinterAdmins
let cachedMinterGroup
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

const loadMinterBoardPage = async () => {
  // Kakashi Note: Remove existing board scroll listeners before loading this page to prevent duplicate lazy-load triggers.
  if (typeof detachAdminBoardInfiniteScroll === "function") {
    detachAdminBoardInfiniteScroll()
  }
  if (typeof detachMinterBoardInfiniteScroll === "function") {
    detachMinterBoardInfiniteScroll()
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
  const publishButtonColor = "#527c9d"
  const minterBoardNameColor = "#527c9d"
  // Kakashi Note: Nomination flow captures nominee identity separately from the publishing minter.
  mainContent.innerHTML = `
    <div class="minter-board-main" style="padding: 0.5vh; text-align: center;">
  
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
              <option value="0">Show ALL Cards Published</option>
              <option value="1">...Within Last 1 Day</option>
              <option value="7">...Within Last 7 Days</option>
              <option value="30">...Within 30 Days</option>
              <option value="45" selected>Published Within Last 45 Days</option>
              <option value="60">...Within 60 Days</option>
              <option value="90">...Within 90 Days</option>
            </select>
          </label>

          <label class="options-toggle">
            <input type="checkbox" id="show-existing-checkbox" />
            <span>Show Existing Minter Cards (History)</span>
          </label>
        </div>
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

        <!-- Container for displayed cards -->
        <div id="cards-container" class="cards-container" style="margin-top: 2vh;"></div>

        <!-- Hidden Publish Card Form -->
        <div id="publish-card-view" class="publish-card-view" style="display: none; text-align: left; padding: 2vh;">
          <form id="publish-card-form" class="publish-card-form">
            <h3>Create or Update a Nomination Card</h3>
            <label for="nominee-name-input">Nominee Name or Address:</label>
            <input type="text" id="nominee-name-input" maxlength="100" placeholder="Enter nominee name or address" required>
            <label for="card-header">Nomination Summary:</label>
            <input type="text" id="card-header" maxlength="100" placeholder="Summarize why you are nominating this person" required>

            <label>Nomination Statement:</label>
            ${typeof getBoardRichTextComposerHtml === "function"
              ? getBoardRichTextComposerHtml(
                  minterBoardPublishEditorKey,
                  "richtext-compose publish-compose"
                )
              : `<textarea id="card-content" placeholder="Share why this nominee should be considered for minting privileges. Include relevant context, contributions, and anything voters should review." required></textarea>`}

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

  const showExistingCardsCheckbox = document.getElementById(
    "show-existing-checkbox"
  )
  if (showExistingCardsCheckbox) {
    showExistingCardsCheckbox.addEventListener("change", async (event) => {
      await loadCards(minterCardIdentifierPrefix)
    })
  }
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
      // Kakashi Note: Dedupe identity follows the nominee (`creator`) for nomination cards, with publisher fallback for legacy cards.
      const nomineeName = cardDataResponse?.creator
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

const resolveCardCreatorAddress = async (cardResource, cardData) => {
  // Kakashi Note: Prefer the published nominee address for level and invite checks; fallback paths keep legacy payloads compatible.
  if (cardData?.creatorAddress) {
    return cardData.creatorAddress
  }
  if (cardData?.creator) {
    const ownerFromCreator = await fetchOwnerAddressFromNameCached(
      cardData.creator
    )
    if (ownerFromCreator) {
      return ownerFromCreator
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
    cardData.creator || publisherName
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
          const isAlready = await verifyMinterCached(data.creator)
          if (isAlready) {
            minterBoardInfiniteState.mintedCount += 1
            updateMinterBoardCounterText()

            if (!minterBoardInfiniteState.showExisting) {
              if (loadToken === minterBoardInfiniteState.loadToken) {
                removeSkeleton(card.identifier)
              }
              return
            }

            const pollResults = await fetchPollResultsCached(data.poll)
            const commentCount = await countCommentsCached(card.identifier)
            const cardUpdatedTime = card.updated || card.created || null
            const bgColor = generateDarkPastelBackgroundBy(card.name)
            const finalCardHTML = await createCardHTML(
              data,
              pollResults,
              card.identifier,
              commentCount,
              cardUpdatedTime,
              bgColor,
              await resolveCardCreatorAddress(card, data),
              /* isExistingMinter= */ true
            )

            if (loadToken === minterBoardInfiniteState.loadToken) {
              minterBoardInfiniteState.displayedCount += 1
              updateMinterBoardCounterText()
              replaceSkeleton(card.identifier, finalCardHTML)
            }
            return
          }
        }

        const pollResults = await fetchPollResultsCached(data.poll)
        const commentCount = await countCommentsCached(card.identifier)
        const cardUpdatedTime = card.updated || card.created || null
        const bgColor = generateDarkPastelBackgroundBy(card.name)
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
              pollResults,
              card.identifier,
              commentCount,
              cardUpdatedTime,
              bgColor,
              await resolveCardCreatorAddress(card, data)
            )

        if (loadToken === minterBoardInfiniteState.loadToken) {
          minterBoardInfiniteState.displayedCount += 1
          updateMinterBoardCounterText()
          replaceSkeleton(card.identifier, finalCardHTML)
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

  if (forceSearch) {
    minterBoardCardDataCache.clear()
    resolvedMinterNameByIdentifierCache.clear()
    verifyMinterCache.clear()
    commentCountCache.clear()
    if (typeof clearPollResultsCache === "function") {
      clearPollResultsCache()
    }
  }

  if (
    !cachedMinterGroup ||
    cachedMinterGroup.length === 0 ||
    !cachedMinterAdmins ||
    cachedMinterAdmins.length === 0
  ) {
    await initializeCachedGroups()
  }
  const cardsContainer = document.getElementById("cards-container")
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
    minterBoardInfiniteState.cards = processedCards
    minterBoardInfiniteState.cursor = 0
    minterBoardInfiniteState.complete = false
    minterBoardInfiniteState.displayedCount = 0
    minterBoardInfiniteState.mintedCount = 0
    minterBoardInfiniteState.totalCount = processedCards.length
    minterBoardInfiniteState.isBackgroundLoading = processedCards.length > 0
    updateMinterBoardCounterText()

    startMinterBoardBackgroundRender(loadToken)
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
        cardDataResponse.creator,
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
          const candidateName = (cardDataResponse?.creator || "").toLowerCase()
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
  document.getElementById("nominee-name-input").value =
    cardData.creator || cardData.creatorAddress || ""
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

  let userAddressInfo
  try {
    userAddressInfo = await getAddressInfo(userAddress)
  } catch (error) {
    console.error(
      "Unable to fetch current user address info for level check:",
      error
    )
    alert("Unable to verify your minter level right now. Please try again.")
    return
  }

  const userLevel = Number(userAddressInfo?.level || 0)
  if (userLevel < 5) {
    // Kakashi Note: Reuse the same denial copy for non-level-5 users so policy messaging stays consistent.
    alert("You have to be a level 5 or above Minter to nominate a user")
    return
  }

  const nomineeInput = document
    .getElementById("nominee-name-input")
    .value.trim()
  const nomineeResolution = await resolveNomineeIdentity(nomineeInput)
  if (nomineeResolution.error) {
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
    alert("Self-nominations are disabled. Please nominate another user.")
    return
  }

  const nomineeAlreadyMinter = await verifyMinterCached(nomineeName)
  if (nomineeAlreadyMinter) {
    alert(
      `${nomineeName} is already a minter/admin. Nomination card not needed.`
    )
    return
  }

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

  if (!header || !content) {
    alert("Header and content are required!")
    return
  }

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
    alert(
      "Unable to load your existing nomination card for update. Please refresh and try again."
    )
    return
  }

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
    creator: nomineeName,
    creatorAddress: nomineeAddress,
    publishedBy: userName,
    publishedByAddress: userAddress,
    timestamp: Date.now(),
    poll: pollName, // either the existing poll or a new one
  }

  try {
    let base64CardData = await objectToBase64(cardData)
    if (!base64CardData) {
      console.log(
        `initial base64 object creation with objectToBase64 failed, using btoa...`
      )
      base64CardData = btoa(JSON.stringify(cardData))
    }

    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userName,
      service: "BLOG_POST",
      identifier: cardIdentifier,
      data64: base64CardData,
    })

    if (!isExistingCard || !existingPollName) {
      await qortalRequest({
        action: "CREATE_POLL",
        pollName,
        pollDescription,
        pollOptions: ["Yes, No"],
        pollOwnerAddress: userAddress,
      })
      if (!isExistingCard) {
        alert(`Nomination card for ${nomineeName} published successfully!`)
      } else {
        alert(
          `Nomination card for ${nomineeName} updated, and a new poll was created (existing poll missing).`
        )
      }
    } else {
      alert(`Nomination card for ${nomineeName} updated successfully!`)
    }

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
    const submitButton = document.getElementById("submit-publish-button")
    if (submitButton) {
      submitButton.textContent = "PUBLISH"
    }

    await loadCards(minterCardIdentifierPrefix, true)
  } catch (error) {
    console.error("Error publishing card or poll:", error)
    alert("Failed to publish card and poll.")
  }
}

let globalVoterMap = new Map()

const processPollData = async (
  pollData,
  minterGroupMembers,
  minterAdmins,
  creator,
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
  const adminGroupsMembers = await fetchAllAdminGroupsMembers()
  const featureTriggerPassed = await featureTriggerCheck()
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

    let voterName = ""
    try {
      const nameInfo = await getNameFromAddress(voterAddress)
      if (nameInfo) {
        voterName = nameInfo
        if (nameInfo === voterAddress) voterName = ""
      }
    } catch (err) {
      console.warn(`No name for address ${voterAddress}`, err)
    }

    let blocksMinted = 0
    try {
      const addressInfo = await getAddressInfo(voterAddress)
      blocksMinted = addressInfo?.blocksMinted || 0
    } catch (e) {
      console.warn(`Failed to get addressInfo for ${voterAddress}`, e)
    }
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
  const safeCreator = qEscapeHtml(creator)
  const detailsHtml = `
    <div class="poll-details-container" id="${qEscapeAttr(
      creator
    )}-poll-details">
      <h1 style ="color:rgb(123, 123, 85); text-align: center; font-size: 2.0rem">${safeCreator}'s</h1><h3 style="color: white; text-align: center; font-size: 1.8rem"> Support Poll Result Details</h3>
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
    const commentData = {
      content: commentHtml,
      creator: userState.accountName,
      timestamp: Date.now(),
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
  const currentCount = Number(
    commentButton?.dataset?.commentCount ||
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
    return [...optimisticComments, ...fetchedComments].sort(
      (a, b) => getBoardResourceTimestamp(a) - getBoardResourceTimestamp(b)
    )
  } catch (error) {
    console.error(`Error fetching comments for ${cardIdentifier}:`, error)
    return getOptimisticMinterBoardComments(cardIdentifier)
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
          if (typeof rememberBoardCommentContent === "function") {
            rememberBoardCommentContent(
              comment.identifier,
              commentDataResponse.content || ""
            )
          }
          const canEditComment =
            typeof canCurrentUserEditPublishedComment === "function"
              ? await canCurrentUserEditPublishedComment(commenterName)
              : false
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
          const safeTimestamp = qEscapeHtml(timestamp)
          const optimisticNotice = commentDataResponse._optimisticPending
            ? `<p class="board-progress-muted" style="color: #ffd27d;"><i>Published locally. Waiting for QDN indexing.</i></p>`
            : ""
          const commentStyleAttr = commentStyles.length
            ? ` style="${commentStyles.join("; ")}"`
            : ""
          return `
            <div class="${commentClasses.join(" ")}"${commentStyleAttr} data-comment-identifier="${qEscapeAttr(comment.identifier)}">
              ${editButtonHtml}
              <p class="comment-meta">
                ${commenterNameHtml}
                ${levelBadgeHtml}
                ${adminBadge}
              </p>
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

const commentCountCache = new Map()
const countCommentsCached = async (cardIdentifier) => {
  if (commentCountCache.has(cardIdentifier)) {
    return commentCountCache.get(cardIdentifier)
  }
  const count = await countComments(cardIdentifier)
  commentCountCache.set(cardIdentifier, count)
  return count
}

const countComments = async (cardIdentifier) => {
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
    return (
      fetchedComments.length +
      getOptimisticMinterBoardComments(
        cardIdentifier,
        existingResourcesByIdentity
      ).length
    )
  } catch (error) {
    console.error(`Error fetching comment count for ${cardIdentifier}:`, error)
    return getOptimisticMinterBoardComments(cardIdentifier).length
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
    isIframe || isAccountModal
      ? "rgba(5, 10, 14, 0.94)"
      : "rgba(0, 0, 0, 0.80)"
  const modalBorder =
    isIframe || isAccountModal
      ? "1px solid rgba(157, 193, 196, 0.28)"
      : "none"
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

const handleInviteMinter = async (minterName) => {
  try {
    const blockInfo = await getLatestBlockInfo()
    const blockHeight = blockInfo.height
    const minterAccountInfo = await getNameInfoCached(minterName)
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
        `${minterName} has been successfully invited! Wait for confirmation...Transaction Response: ${JSON.stringify(
          processResponse
        )}`
      )
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

const createInviteButtonHtml = (creator, cardIdentifier) => {
  const safeCreatorAttr = qEscapeAttr(creator)
  return `
      <div id="invite-button-container-${cardIdentifier}" style="margin-top: 1em;">
          <button data-minter-name="${safeCreatorAttr}"
                  onclick="handleInviteMinterFromButton(this)"
                  style="padding: 10px; background:rgb(0, 109, 76) ; color: white; border: dotted; border-color: white; cursor: pointer; border-radius: 5px;"
                  onmouseover="this.style.backgroundColor='rgb(25, 47, 39) '"
                  onmouseout="this.style.backgroundColor='rgba(7, 122, 101, 0.63) '"
                  >
              Create Minter Invite
          </button>
      </div>
  `
}

const handleInviteMinterFromButton = (buttonEl) => {
  if (!buttonEl) return
  const minterName = buttonEl.dataset?.minterName || ""
  handleInviteMinter(minterName)
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
  creator,
  cardIdentifier
) => {
  const isSomeTypaAdmin = userState.isAdmin || userState.isMinterAdmin
  const isBlockPassed = await featureTriggerCheck()
  // const minterAdmins = await fetchMinterGroupAdmins()
  const minterAdmins = cachedMinterAdmins

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
  // get user's address from 'creator' name
  const minterNameInfo = await getNameInfoCached(creator)
  if (!minterNameInfo || !minterNameInfo.owner) {
    console.warn(`No valid nameInfo for ${creator}, skipping invite button.`)
    return null
  }
  const minterAddress = minterNameInfo.owner
  // Use short-lived cached tx context to avoid re-querying the same large datasets for every card.
  const { finalKickTxs, finalBanTxs, finalInviteTxs, pendingInviteTxs } =
    await getInviteContextCached()
  // check if there's a KICK or BAN for this user.
  const priorKick = finalKickTxs.some((tx) => tx.member === minterAddress)
  const priorBan = finalBanTxs.some((tx) => tx.offender === minterAddress)
  const existingInvite = finalInviteTxs.some(
    (tx) => tx.invitee === minterAddress
  )
  const pendingInvite = pendingInviteTxs.some(
    (tx) => tx.invitee === minterAddress
  )
  const priorBanOrKick = priorBan || priorKick
  console.warn(
    `PriorBanOrKick determination for ${minterAddress}:`,
    priorBanOrKick
  )

  // build the normal invite button & groupApprovalHtml
  let inviteButtonHtml = ""
  if (existingInvite || pendingInvite) {
    console.warn(
      `There is an EXISTING or PENDING INVITE for this user! No invite button being created... existing: (${existingInvite}, pending: ${pendingInvite})`
    )
    inviteButtonHtml = ""
  } else {
    inviteButtonHtml = isSomeTypaAdmin
      ? createInviteButtonHtml(creator, cardIdentifier)
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
  const pendingTxs = await getPendingTxForAddressCached(
    address,
    transactionType,
    0,
    0
  )
  let isSomeTypaAdmin = userState.isAdmin || userState.isMinterAdmin
  // If no pending transaction found, return null
  if (!pendingTxs || pendingTxs.length === 0) {
    console.warn("no pending transactions found, returning null...")
    return null
  }
  const txSig = pendingTxs[0].signature
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
            onclick="handleGroupApproval('${txSig}')"
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

const handleGroupApproval = async (pendingSignature) => {
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
    } else {
      alert(`creating tx failed for some reason`)
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

const handleJoinGroup = async (minterAddress) => {
  try {
    if (userState.accountAddress === minterAddress) {
      console.log(`minter user found `)

      const qRequestAttempt = await qortalRequest({
        action: "JOIN_GROUP",
        groupId: 694,
      })

      if (qRequestAttempt) {
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

  if (!minterName || minterName === "undefined" || minterName === "null") {
    return placeholderAvatarHtml
  }

  const avatarUrl = `/arbitrary/THUMBNAIL/${encodeURIComponent(
    minterName
  )}/qortal_avatar`
  try {
    const response = await fetch(avatarUrl, { method: "HEAD" })

    if (response.ok) {
      return `
        <span class="user-avatar-shell user-avatar-shell--has-avatar" aria-hidden="true">
          <img src="${avatarUrl}" alt="" class="user-avatar">
        </span>
      `
    }

    return placeholderAvatarHtml
  } catch (error) {
    console.error("Error checking avatar availability:", error)
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

function buildIdentityBoxHtml(label, displayName, address, level = null) {
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
  const {
    header,
    content,
    links,
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
  const avatarHtml = await getMinterAvatar(creator)
  const linksArray = Array.isArray(links) ? links : []
  minterBoardCardDataByIdentifier.set(cardIdentifier, cardData)
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
  const safeCreator = qEscapeHtml(creator)
  const safeHeader = qEscapeHtml(header)
  const renderedContent = qRenderRichContentHtml(content)
  const creatorLinkHtml =
    typeof buildBoardAccountTriggerHtml === "function"
      ? buildBoardAccountTriggerHtml({
          name: creator || "Unknown",
          address: creatorAddress || address || "",
          label: creator || "Unknown",
          className: "card-account-trigger card-account-trigger--heading",
          tagName: "button",
        })
      : safeCreator
  const safeFormattedDate = qEscapeHtml(formattedDate)
  const optimisticNotice = cardData._optimisticPending
    ? `<div class="board-progress-muted" style="margin: 0.75em 0; color: #ffd27d;">Published locally. Waiting for QDN indexing.</div>`
    : ""
  const [nomineeAddressInfo, nominatorAddressInfo] = await Promise.all([
    getAddressInfoCached(address),
    publishedByAddress
      ? getAddressInfoCached(publishedByAddress)
      : Promise.resolve(null),
  ])
  const nomineeLevel = nomineeAddressInfo?.level ?? 0
  const nominatorLevel = nominatorAddressInfo?.level ?? null
  const canEditCard = await canCurrentUserEditPublishedCard(
    publishedBy,
    publishedByAddress || ""
  )
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
  const identityBoxesHtml = `
    <div class="card-identity-row">
      ${buildIdentityBoxHtml(
        "Nominee",
        creator,
        creatorAddress || address || ""
      )}
      ${buildIdentityBoxHtml(
        "Nominator",
        publishedBy || "Unknown",
        publishedByAddress || "",
        nominatorLevel
      )}
    </div>
  `

  // const minterGroupMembers = await fetchMinterGroupMembers()
  const minterGroupMembers = cachedMinterGroup
  // const minterAdmins = await fetchMinterGroupAdmins()
  const minterAdmins = cachedMinterAdmins
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
    userVote,
  } = await processPollData(
    pollResults,
    minterGroupMembers,
    minterAdmins,
    creator,
    cardIdentifier
  )
  createModal("links")
  createModal("poll-details")

  const inviteButtonHtml = isExistingMinter
    ? ""
    : await checkAndDisplayInviteButton(adminYes, creator, cardIdentifier)
  let inviteHtmlAdd = inviteButtonHtml ? inviteButtonHtml : ""

  let finalBgColor = bgColor
  const userVoteStateClass =
    userVote === 0
      ? "card--user-vote-yes"
      : userVote === 1
      ? "card--user-vote-no"
      : ""
  let invitedText = "" // for "INVITED" label if found
  const penaltyText =
    (nomineeAddressInfo?.blocksMintedPenalty ?? 0) === 0
      ? ""
      : "<p>(has Blocks Penalty)<p>"
  const adjustmentText =
    (nomineeAddressInfo?.blocksMintedAdjustment ?? 0) === 0
      ? ""
      : "<p>(has Blocks Adjustment)<p>"

  try {
    const invites = await fetchGroupInvitesByAddress(address)
    const hasMinterInvite = invites.some((invite) => invite.groupId === 694)
    if (isExistingMinter) {
      finalBgColor = "rgb(99, 99, 99)"
      invitedText = `<h4 style="color:rgb(135, 55, 16); margin-bottom: 0.5em;">EXISTING MINTER</h4>`
    } else if (hasMinterInvite) {
      // If so, override background color & add an "INVITED" label
      finalBgColor = "black"
      invitedText = `<h4 style="color: gold; margin-bottom: 0.5em;">INVITED</h4>`
      if (
        userState.accountName === creator ||
        userState.accountAddress === creatorAddress
      ) {
        //Check also if the creator is the user, and display the join group button if so.
        inviteHtmlAdd = `
          <div id="join-button-container-${cardIdentifier}" style="margin-top: 1em;">
            <button 
                style="padding: 8px; background: rgb(37, 99, 44); color:rgb(240, 240, 240); border: 1px solid rgb(255, 255, 255); border-radius: 5px; cursor: pointer;"
                onmouseover="this.style.backgroundColor='rgb(25, 47, 39) '"
                onmouseout="this.style.backgroundColor='rgb(37, 99, 44) '"
                onclick="handleJoinGroup('${userState.accountAddress}')">
              Join MINTER Group
            </button>
          </div>
          `
      } else {
        console.log(`user is not the minter... NOT displaying any join button`)
        inviteHtmlAdd = ""
      }
    }
    //do not display invite button as they're already invited. Create a join button instead.
  } catch (error) {
    console.error("Error checking invites for user:", error)
  }

  return `
  <div class="minter-card ${userVoteStateClass}" style="background-color: ${finalBgColor}">
    ${editButtonHtml}
    <div class="minter-card-header">
      ${avatarHtml}
      <h3>${creatorLinkHtml} - Level ${nomineeLevel}</h3>
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
      <button onclick="togglePollDetails('${cardIdentifier}')">Display Poll Details</button>
      <div id="poll-details-${cardIdentifier}" style="display: none;">
        ${detailsHtml}
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
    <div class="support-header"><h5>SUPPORT NOMINATION FOR </h5><h5 style="color: #ffae42;">${safeCreator}</h5>
    <p style="color: #c7c7c7; font-size: .65rem; margin-top: 1vh">(click COMMENTS button to open/close card comments)</p>
    </div>
    <div class="actions">
      <div class="actions-buttons">
        <button class="yes" onclick="voteYesOnPoll('${poll}')">YES</button>
        <button class="comment" id="comment-button-${cardIdentifier}" data-comment-count="${commentCount}"  onclick="toggleComments('${cardIdentifier}')">COMMENTS (${commentCount})</button>
        <button class="no" onclick="voteNoOnPoll('${poll}')">NO</button>
      </div>
    </div>
    <div id="comments-section-${cardIdentifier}" class="comments-section" style="display: none; margin-top: 20px;">
      <div id="comments-container-${cardIdentifier}" class="comments-container"></div>
      ${typeof getBoardCommentComposerHtml === "function"
        ? getBoardCommentComposerHtml(cardIdentifier)
        : `<textarea id="new-comment-${cardIdentifier}" placeholder="Write a comment..." style="width: 100%; margin-top: 10px;"></textarea>`}
      ${typeof getBoardCommentActionBarHtml === "function"
        ? getBoardCommentActionBarHtml(cardIdentifier, "postComment")
        : `<button onclick="postComment('${cardIdentifier}')">Post Comment</button>`}
    </div>
    <p class="card-published-date">Published ${safeFormattedDate}</p>
  </div>
  `
}
