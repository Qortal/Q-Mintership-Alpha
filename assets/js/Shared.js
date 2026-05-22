// This is a Helper Script that will contain the functions that are accessed from multiple different scripts in the app. Allowing this script to be loaded first, will ensure they all have awareness of them and will allow future development to be simpler.

let blockedNamesIdentifier = "Q-Mintership-blockedNames"

// Kakashi Note: Core escaping helper used across boards to keep untrusted text from executing as markup.
// Basic output-encoding helper for untrusted text that will be inserted into HTML strings.
const qEscapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Attribute-safe variant. Also escapes backticks to avoid template literal edge cases.
const qEscapeAttr = (value) => {
  return qEscapeHtml(value).replace(/`/g, "&#96;")
}

const qIsSafeUrl = (url) => {
  const raw = String(url ?? "").trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return false
  }
  if (lower.startsWith("qortal://")) return true
  if (lower.startsWith("/")) return true
  if (lower.startsWith("./") || lower.startsWith("../")) return true
  if (lower.startsWith("#")) return true
  if (lower.startsWith("http://") || lower.startsWith("https://")) return true
  if (lower.startsWith("mailto:")) return true
  return false
}

const qSanitizeUrl = (url, fallback = "#") => {
  const safe = String(url ?? "").trim()
  return qIsSafeUrl(safe) ? safe : fallback
}

const Q_RICH_TEXT_ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRONG",
  "U",
  "UL",
])

const Q_RICH_TEXT_ALLOWED_ATTRS = new Map([
  ["*", new Set(["class", "dir"])],
  ["A", new Set(["href", "target", "rel"])],
])

const qSanitizeRichHtml = (inputHtml) => {
  // Kakashi Note: Rich-text sanitizer strips dangerous tags/attrs while preserving safe formatting needed for forum content.
  const template = document.createElement("template")
  template.innerHTML = String(inputHtml ?? "")

  const dangerousTags = new Set([
    "BASE",
    "FORM",
    "IFRAME",
    "INPUT",
    "LINK",
    "META",
    "OBJECT",
    "EMBED",
    "SCRIPT",
    "STYLE",
    "SVG",
    "MATH",
    "TEXTAREA",
    "SELECT",
    "BUTTON",
    "OPTION",
  ])

  const sanitizeNode = (rootNode) => {
    const children = Array.from(rootNode.childNodes)

    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove()
        continue
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue
      }

      const tag = child.tagName.toUpperCase()

      if (dangerousTags.has(tag)) {
        child.remove()
        continue
      }

      if (!Q_RICH_TEXT_ALLOWED_TAGS.has(tag)) {
        const fragment = document.createDocumentFragment()
        while (child.firstChild) {
          fragment.appendChild(child.firstChild)
        }
        child.replaceWith(fragment)
        sanitizeNode(fragment)
        continue
      }

      const allowedForTag = Q_RICH_TEXT_ALLOWED_ATTRS.get(tag) || new Set()
      const allowedGlobal = Q_RICH_TEXT_ALLOWED_ATTRS.get("*") || new Set()

      for (const attr of Array.from(child.attributes)) {
        const attrName = attr.name.toLowerCase()

        if (attrName.startsWith("on") || attrName === "style") {
          child.removeAttribute(attr.name)
          continue
        }

        const attrAllowed =
          attrName.startsWith("data-") ||
          allowedForTag.has(attrName) ||
          allowedGlobal.has(attrName)
        if (!attrAllowed) {
          child.removeAttribute(attr.name)
          continue
        }

        if (attrName === "href" || attrName === "src") {
          const safeUrl = qSanitizeUrl(attr.value, "")
          if (!safeUrl) {
            child.removeAttribute(attr.name)
          } else {
            child.setAttribute(attr.name, safeUrl)
          }
        }
      }

      if (tag === "A") {
        const href = child.getAttribute("href")
        if (!href) {
          child.removeAttribute("target")
          child.removeAttribute("rel")
        } else {
          const target = child.getAttribute("target")
          if (target && target !== "_blank") {
            child.removeAttribute("target")
          }
          child.setAttribute("rel", "noopener noreferrer")
        }
      }

      sanitizeNode(child)
    }
  }

  sanitizeNode(template.content)
  return template.innerHTML
}

const qRenderBoardCommentHtml = (inputHtml) => {
  const raw = String(inputHtml ?? "")
  if (!raw.trim()) {
    return ""
  }

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw)
  if (looksLikeHtml) {
    return qSanitizeRichHtml(raw)
  }

  return qEscapeHtml(raw)
}

const qRenderRichContentHtml = (inputHtml) => qRenderBoardCommentHtml(inputHtml)

const boardRichTextEditorInstances = new Map()
const boardIdentityLevelCache = new Map()
const boardAccountNamesCache = new Map()
const boardAccountSponsorshipCache = new Map()
const boardAccountTransactionPageCache = new Map()
const boardAccountInspectorState = {
  requestId: 0,
  address: "",
  displayName: "",
  resolvedName: "",
  txOffset: 0,
  txLimit: 200,
  txHasMore: false,
  txLoadingMore: false,
  transactions: [],
  names: [],
  sponsorship: null,
  addressInfo: null,
}
const BOARD_RICH_TEXT_TOOLBAR_OPTIONS = [
  [{ header: [2, 3, false] }],
  ["bold", "italic"],
  [{ list: "bullet" }],
  ["clean"],
]
const BOARD_RICH_TEXT_EDITOR_FORMATS = ["header", "bold", "italic", "list"]

const getBoardRichTextEditorId = (editorKey) =>
  `board-richtext-${editorKey}`

const getBoardRichTextComposerHtml = (editorKey, composerClass = "richtext-compose") => `
  <div class="${composerClass}">
    <div
      id="${qEscapeAttr(getBoardRichTextEditorId(editorKey))}"
      class="richtext-editor"
    ></div>
  </div>
`

const ensureBoardRichTextEditor = (
  editorKey,
  placeholder = "Write a comment..."
) => {
  if (typeof Quill !== "function") {
    return null
  }

  const editorId = getBoardRichTextEditorId(editorKey)
  if (boardRichTextEditorInstances.has(editorId)) {
    return boardRichTextEditorInstances.get(editorId)
  }

  const editorEl = document.getElementById(editorId)
  if (!editorEl) {
    return null
  }

  const quill = new Quill(editorEl, {
    theme: "snow",
    placeholder,
    formats: BOARD_RICH_TEXT_EDITOR_FORMATS,
    modules: {
      toolbar: BOARD_RICH_TEXT_TOOLBAR_OPTIONS,
    },
  })

  boardRichTextEditorInstances.set(editorId, quill)
  return quill
}

const getBoardRichTextEditorInstance = (editorKey) => {
  const editorId = getBoardRichTextEditorId(editorKey)
  return boardRichTextEditorInstances.get(editorId) || null
}

const getBoardRichTextEditorText = (editorKey) => {
  const quill = getBoardRichTextEditorInstance(editorKey)
  if (quill) {
    return quill.getText().trim()
  }

  const editorEl = document.getElementById(getBoardRichTextEditorId(editorKey))
  if (!editorEl) {
    return ""
  }

  return String(editorEl.textContent || "").trim()
}

const getBoardRichTextEditorHtml = (editorKey) => {
  const quill = getBoardRichTextEditorInstance(editorKey)
  if (quill) {
    const rawHtml = quill.root.innerHTML.trim()
    return quill.getText().trim() ? qSanitizeRichHtml(rawHtml) : ""
  }

  const editorEl = document.getElementById(getBoardRichTextEditorId(editorKey))
  if (!editorEl) {
    return ""
  }

  return qSanitizeRichHtml(editorEl.innerHTML.trim())
}

const setBoardRichTextEditorHtml = (editorKey, inputHtml) => {
  const rawHtml = String(inputHtml ?? "")
  const quill = getBoardRichTextEditorInstance(editorKey)
  if (quill) {
    if (!rawHtml.trim()) {
      quill.setText("")
      quill.setSelection(0, 0)
      return
    }

    const sanitizedHtml = qSanitizeRichHtml(rawHtml)
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(rawHtml)

    if (looksLikeHtml) {
      quill.clipboard.dangerouslyPasteHTML(sanitizedHtml, "silent")
    } else {
      quill.setText(rawHtml)
    }
    quill.setSelection(0, 0)
    return
  }

  const editorEl = document.getElementById(getBoardRichTextEditorId(editorKey))
  if (editorEl) {
    editorEl.innerHTML = /<\/?[a-z][\s\S]*>/i.test(rawHtml)
      ? qSanitizeRichHtml(rawHtml)
      : qEscapeHtml(rawHtml)
  }
}

const clearBoardRichTextEditor = (editorKey) => {
  const quill = getBoardRichTextEditorInstance(editorKey)
  if (quill) {
    quill.setText("")
    quill.setSelection(0, 0)
    return
  }

  const editorEl = document.getElementById(getBoardRichTextEditorId(editorKey))
  if (editorEl) {
    editorEl.innerHTML = ""
  }
}

const getBoardCommentEditorId = (cardIdentifier) =>
  getBoardRichTextEditorId(`comment-${cardIdentifier}`)

const getBoardCommentComposerHtml = (cardIdentifier) =>
  getBoardRichTextComposerHtml(
    `comment-${cardIdentifier}`,
    "richtext-compose comment-compose"
  )

const ensureBoardCommentEditor = (
  cardIdentifier,
  placeholder = "Write a comment..."
) => ensureBoardRichTextEditor(`comment-${cardIdentifier}`, placeholder)

const getBoardCommentEditorInstance = (cardIdentifier) =>
  getBoardRichTextEditorInstance(`comment-${cardIdentifier}`)

const getBoardCommentEditorText = (cardIdentifier) =>
  getBoardRichTextEditorText(`comment-${cardIdentifier}`)

const getBoardCommentEditorHtml = (cardIdentifier) =>
  getBoardRichTextEditorHtml(`comment-${cardIdentifier}`)

const clearBoardCommentEditor = (cardIdentifier) =>
  clearBoardRichTextEditor(`comment-${cardIdentifier}`)

const boardCommentContentCache = new Map()
const boardCommentEditState = {
  cardIdentifier: "",
  commentIdentifier: "",
  publisherName: "",
  isEditing: false,
}

const rememberBoardCommentContent = (commentIdentifier, contentHtml = "") => {
  const normalizedIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedIdentifier) {
    return
  }

  boardCommentContentCache.set(normalizedIdentifier, String(contentHtml ?? ""))
}

const getBoardCommentContent = (commentIdentifier) => {
  const normalizedIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedIdentifier) {
    return ""
  }

  return boardCommentContentCache.get(normalizedIdentifier) || ""
}

const canCurrentUserEditPublishedComment = async (publishedName = "") => {
  const currentName = String(userState?.accountName || "").trim()
  const currentAddress = String(userState?.accountAddress || "").trim()
  const normalizedPublishedName = String(publishedName || "").trim()

  if (!normalizedPublishedName) {
    return false
  }

  if (
    currentName &&
    currentName.toLowerCase() === normalizedPublishedName.toLowerCase()
  ) {
    return true
  }

  if (
    currentAddress &&
    typeof fetchOwnerAddressFromNameCached === "function"
  ) {
    const resolvedAddress = await fetchOwnerAddressFromNameCached(
      normalizedPublishedName
    )
    return Boolean(resolvedAddress && resolvedAddress === currentAddress)
  }

  return false
}

const updateBoardCommentActionBar = (cardIdentifier) => {
  const normalizedCardIdentifier = String(cardIdentifier || "").trim()
  if (!normalizedCardIdentifier) {
    return
  }

  const submitButton = document.getElementById(
    `comment-submit-button-${normalizedCardIdentifier}`
  )
  const cancelButton = document.getElementById(
    `comment-cancel-button-${normalizedCardIdentifier}`
  )
  const statusEl = document.getElementById(
    `comment-editor-status-${normalizedCardIdentifier}`
  )
  const isEditing =
    boardCommentEditState.isEditing &&
    boardCommentEditState.cardIdentifier === normalizedCardIdentifier

  if (submitButton) {
    submitButton.textContent = isEditing ? "Update Comment" : "Post Comment"
  }
  if (cancelButton) {
    cancelButton.hidden = !isEditing
  }
  if (statusEl) {
    statusEl.textContent = isEditing
      ? `Editing comment by ${boardCommentEditState.publisherName || "you"}.`
      : ""
  }
}

const clearBoardCommentEditState = async (cardIdentifier = "") => {
  const normalizedCardIdentifier = String(cardIdentifier || "").trim()
  const activeCardIdentifier =
    normalizedCardIdentifier || boardCommentEditState.cardIdentifier
  boardCommentEditState.cardIdentifier = ""
  boardCommentEditState.commentIdentifier = ""
  boardCommentEditState.publisherName = ""
  boardCommentEditState.isEditing = false

  if (activeCardIdentifier && typeof clearBoardCommentEditor === "function") {
    clearBoardCommentEditor(activeCardIdentifier)
  }

  if (activeCardIdentifier) {
    updateBoardCommentActionBar(activeCardIdentifier)
  }
}

const getBoardCommentActionBarHtml = (
  cardIdentifier,
  submitHandlerName = "postComment"
) => `
  <div class="comment-editor-actions">
    <div
      id="comment-editor-status-${qEscapeAttr(cardIdentifier)}"
      class="comment-editor-status"
      aria-live="polite"
    ></div>
    <div class="comment-editor-buttons">
      <button
        type="button"
        id="comment-submit-button-${qEscapeAttr(cardIdentifier)}"
        class="comment-editor-submit"
        onclick="${submitHandlerName}('${qEscapeAttr(cardIdentifier)}')"
      >
        Post Comment
      </button>
      <button
        type="button"
        id="comment-cancel-button-${qEscapeAttr(cardIdentifier)}"
        class="comment-cancel-button"
        onclick="clearBoardCommentEditState('${qEscapeAttr(cardIdentifier)}')"
        hidden
      >
        Cancel Edit
      </button>
    </div>
  </div>
`

const buildBoardCommentEditButtonHtml = ({
  cardIdentifier = "",
  commentIdentifier = "",
  publisherName = "",
} = {}) => {
  const normalizedCardIdentifier = String(cardIdentifier || "").trim()
  const normalizedCommentIdentifier = String(commentIdentifier || "").trim()
  const normalizedPublisherName = String(publisherName || "").trim()

  if (
    !normalizedCardIdentifier ||
    !normalizedCommentIdentifier ||
    !normalizedPublisherName
  ) {
    return ""
  }

  return `
    <button
      type="button"
      class="comment-edit-button"
      title="Edit comment"
      aria-label="Edit comment"
      data-card-identifier="${qEscapeAttr(normalizedCardIdentifier)}"
      data-comment-identifier="${qEscapeAttr(normalizedCommentIdentifier)}"
      data-comment-publisher="${qEscapeAttr(normalizedPublisherName)}"
      onclick="openBoardCommentEditorFromElement(this, event)"
    >
      <span class="mobi-mbri-edit-2" aria-hidden="true"></span>
    </button>
  `
}

const openBoardCommentEditorFromElement = async (buttonEl, event) => {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  const cardIdentifier = String(buttonEl?.dataset?.cardIdentifier || "").trim()
  const commentIdentifier = String(
    buttonEl?.dataset?.commentIdentifier || ""
  ).trim()
  const publisherName = String(buttonEl?.dataset?.commentPublisher || "").trim()

  if (!cardIdentifier || !commentIdentifier || !publisherName) {
    return false
  }

  const canEdit = await canCurrentUserEditPublishedComment(publisherName)
  if (!canEdit) {
    return false
  }

  boardCommentEditState.cardIdentifier = cardIdentifier
  boardCommentEditState.commentIdentifier = commentIdentifier
  boardCommentEditState.publisherName = publisherName
  boardCommentEditState.isEditing = true

  if (typeof ensureBoardCommentEditor === "function") {
    ensureBoardCommentEditor(cardIdentifier, "Write a comment...")
  }

  if (typeof setBoardRichTextEditorHtml === "function") {
    setBoardRichTextEditorHtml(
      `comment-${cardIdentifier}`,
      getBoardCommentContent(commentIdentifier)
    )
  }

  updateBoardCommentActionBar(cardIdentifier)

  const commentsSection = document.getElementById(
    `comments-section-${cardIdentifier}`
  )
  if (commentsSection) {
    commentsSection.style.display = "block"
    commentsSection.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    })
  }

  const editorInstance =
    typeof getBoardCommentEditorInstance === "function"
      ? getBoardCommentEditorInstance(cardIdentifier)
      : null
  if (editorInstance?.focus) {
    editorInstance.focus()
    if (typeof editorInstance.getLength === "function") {
      const selectionIndex = Math.max(0, editorInstance.getLength() - 1)
      editorInstance.setSelection(selectionIndex, 0, "silent")
    }
  }

  return true
}

const qFetchBoardJson = async (path) => {
  const trimmedBase = String(typeof baseUrl === "string" ? baseUrl : "").replace(
    /\/$/,
    ""
  )
  const normalizedPath = String(path ?? "").startsWith("/")
    ? String(path ?? "")
    : `/${String(path ?? "")}`
  const response = await fetch(`${trimmedBase}${normalizedPath}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(
      `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`
    )
  }

  return response.json()
}

const buildBoardAccountTriggerHtml = ({
  name = "",
  address = "",
  label = "",
  className = "board-account-trigger",
  tagName = "button",
  titlePrefix = "Open account details for",
  extraTitle = "",
} = {}) => {
  const rawName = String(name || label || address || "").trim()
  const displayLabel = String(label || name || address || "Unknown").trim()
  const safeLabel = qEscapeHtml(displayLabel)
  const safeName = qEscapeAttr(rawName)
  const safeAddress = qEscapeAttr(String(address || "").trim())
  const safeTitle = qEscapeAttr(
    extraTitle || `${titlePrefix} ${displayLabel || "account"}`
  )
  const safeAria = qEscapeAttr(
    `${displayLabel || "Account"}. Open account details.`
  )
  const commonAttrs = `
      class="${className}"
      title="${safeTitle}"
      aria-label="${safeAria}"
      data-account-name="${safeName}"
      data-account-address="${safeAddress}"
      onclick="openBoardAccountInspectorFromElement(this, event)"
    `

  if (tagName === "span") {
    return `
      <span
        ${commonAttrs}
        role="button"
        tabindex="0"
        onkeydown="if (event.key === 'Enter' || event.key === ' ') { openBoardAccountInspectorFromElement(this, event) }"
      >${safeLabel}</span>
    `
  }

  return `
    <button
      type="button"
      ${commonAttrs}
    >${safeLabel}</button>
  `
}

const getBoardNamesForAddress = async (address) => {
  const normalizedAddress = String(address ?? "").trim()
  if (!normalizedAddress) {
    return []
  }

  if (boardAccountNamesCache.has(normalizedAddress)) {
    return boardAccountNamesCache.get(normalizedAddress)
  }

  try {
    const fetchNames = async (limit) =>
      qFetchBoardJson(
        `/names/address/${encodeURIComponent(normalizedAddress)}?limit=${limit}`
      )

    let data = null
    try {
      data = await fetchNames(0)
    } catch (error) {
      data = await fetchNames(20).catch(() => [])
    }

    const names = Array.isArray(data)
      ? data
          .map((entry) => entry?.name)
          .filter((name) => Boolean(String(name || "").trim()))
      : []
    boardAccountNamesCache.set(normalizedAddress, names)
    return names
  } catch (error) {
    console.warn("Unable to fetch names for address:", normalizedAddress, error)
    boardAccountNamesCache.set(normalizedAddress, [])
    return []
  }
}

const resolveBoardAccountIdentity = async (rawIdentity, rawAddress = "") => {
  const qortalAddressPattern = /^Q[a-zA-Z0-9]{33}$/
  const inputIdentity = String(rawIdentity ?? "").trim()
  const addressHint = String(rawAddress ?? "").trim()
  let resolvedAddress = ""
  let resolvedName = ""

  if (qortalAddressPattern.test(addressHint)) {
    resolvedAddress = addressHint
  }

  if (!resolvedAddress && qortalAddressPattern.test(inputIdentity)) {
    resolvedAddress = inputIdentity
  }

  if (!resolvedAddress && inputIdentity) {
    const nameInfo =
      typeof getNameInfoCached === "function"
        ? await getNameInfoCached(inputIdentity)
        : typeof getNameInfo === "function"
        ? await getNameInfo(inputIdentity)
        : null
    if (nameInfo?.owner) {
      resolvedAddress = nameInfo.owner
      resolvedName = nameInfo.name || inputIdentity
    }
  }

  if (!resolvedAddress && addressHint && !qortalAddressPattern.test(addressHint)) {
    const maybeNameInfo =
      typeof getNameInfoCached === "function"
        ? await getNameInfoCached(addressHint)
        : typeof getNameInfo === "function"
        ? await getNameInfo(addressHint)
        : null
    if (maybeNameInfo?.owner) {
      resolvedAddress = maybeNameInfo.owner
      resolvedName = maybeNameInfo.name || addressHint
    }
  }

  if (!resolvedAddress) {
    return {
      address: "",
      displayName: inputIdentity || "Unknown",
      resolvedName: "",
      registeredNames: [],
      inputIdentity,
    }
  }

  const registeredNames = await getBoardNamesForAddress(resolvedAddress)
  const inputLooksLikeAddress = qortalAddressPattern.test(inputIdentity)
  const primaryName =
    resolvedName || (!inputLooksLikeAddress ? inputIdentity : "") || registeredNames[0]

  return {
    address: resolvedAddress,
    displayName: primaryName || resolvedAddress,
    resolvedName: resolvedName || primaryName || "",
    registeredNames,
    inputIdentity,
  }
}

const getBoardAccountSponsorshipInfo = async (address) => {
  const normalizedAddress = String(address ?? "").trim()
  if (!normalizedAddress) {
    return {
      data: null,
      usedFallback: false,
    }
  }

  if (boardAccountSponsorshipCache.has(normalizedAddress)) {
    return boardAccountSponsorshipCache.get(normalizedAddress)
  }

  const fetchSponsorship = async (suffix = "") => {
    try {
      const data = await qFetchBoardJson(
        `/addresses/sponsorship/${encodeURIComponent(normalizedAddress)}${suffix}`
      )
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.keys(data).length > 0
      ) {
        return data
      }
      return null
    } catch (error) {
      return null
    }
  }

  const primary = await fetchSponsorship("")
  if (primary) {
    const result = {
      data: primary,
      usedFallback: false,
    }
    boardAccountSponsorshipCache.set(normalizedAddress, result)
    return result
  }

  const fallback = await fetchSponsorship("/sponsor")
  const result = {
    data: fallback,
    usedFallback: Boolean(fallback),
  }
  boardAccountSponsorshipCache.set(normalizedAddress, result)
  return result
}

const getBoardAccountTransactions = async (
  address,
  offset = 0,
  limit = 200
) => {
  const normalizedAddress = String(address ?? "").trim()
  if (!normalizedAddress) {
    return []
  }

  const cacheKey = `${normalizedAddress}:${offset}:${limit}`
  if (boardAccountTransactionPageCache.has(cacheKey)) {
    return boardAccountTransactionPageCache.get(cacheKey)
  }

  if (typeof searchTransactions !== "function") {
    return []
  }

  try {
    const transactions = await searchTransactions({
      address: normalizedAddress,
      confirmationStatus: "BOTH",
      limit,
      reverse: true,
      offset,
      txTypes: [],
    })
    const page = Array.isArray(transactions) ? transactions : []
    boardAccountTransactionPageCache.set(cacheKey, page)
    return page
  } catch (error) {
    console.error("Unable to fetch account transactions:", error)
    boardAccountTransactionPageCache.set(cacheKey, [])
    return []
  }
}

const buildBoardAccountTransactionCountsHtml = (transactions = []) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return `
      <div class="account-tx-type-empty board-progress-muted">
        No transaction history loaded yet.
      </div>
    `
  }

  const counts = new Map()
  for (const tx of transactions) {
    const type = String(tx?.type || "UNKNOWN").toUpperCase()
    counts.set(type, (counts.get(type) || 0) + 1)
  }

  const sortedEntries = Array.from(counts.entries()).sort((a, b) => {
    if (a[0] === "ARBITRARY") return -1
    if (b[0] === "ARBITRARY") return 1
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0])
  })

  return `
    <div class="account-tx-type-grid">
      ${sortedEntries
        .map(
          ([type, count]) => `
            <div class="account-tx-type-row ${
              type === "ARBITRARY" ? "account-tx-type-row--arbitrary" : ""
            }">
              <span class="account-tx-type-name">${qEscapeHtml(type)}</span>
              <span class="account-tx-type-count">${qEscapeHtml(String(count))}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `
}

const buildBoardAccountTransactionMetaHtml = (tx = {}) => {
  const metaEntries = [
    ["Type", tx.type],
    ["Timestamp", tx.timestamp ? new Date(tx.timestamp).toLocaleString() : ""],
    ["Name", tx.name],
    ["Identifier", tx.identifier],
    ["Creator", tx.creatorAddress],
    ["Service", tx.service],
    ["Method", tx.method],
    ["Approval", tx.approvalStatus],
    ["Block", tx.blockHeight],
    ["Fee", tx.fee],
    ["Size", tx.size],
    ["Group", tx.txGroupId],
    ["Compression", tx.compression],
    ["Data type", tx.dataType],
    ["Nonce", tx.nonce],
    ["Reference", tx.reference],
    ["Signature", tx.signature],
    ["Payments", Array.isArray(tx.payments) ? tx.payments.length : ""],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "")

  return `
    <dl class="account-tx-meta-grid">
      ${metaEntries
        .map(
          ([label, value]) => `
            <div class="account-tx-meta-item">
              <dt class="account-tx-meta-label">${qEscapeHtml(label)}</dt>
              <dd class="account-tx-meta-value">${qEscapeHtml(String(value))}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `
}

const buildBoardAccountTransactionEntryHtml = (tx = {}, index = 0) => {
  const type = String(tx?.type || "UNKNOWN").toUpperCase()
  const timestamp = tx?.timestamp
    ? new Date(tx.timestamp).toLocaleString()
    : "Unknown time"
  const identifier = String(
    tx?.identifier || tx?.signature || tx?.reference || `tx-${index}`
  )
  const summaryTypeClass =
    type === "ARBITRARY"
      ? "account-tx-summary-type account-tx-summary-type--arbitrary"
      : "account-tx-summary-type"

  return `
    <details class="account-tx-item ${
      type === "ARBITRARY" ? "account-tx-item--arbitrary" : ""
    }">
      <summary class="account-tx-summary">
        <span class="${summaryTypeClass}">${qEscapeHtml(type)}</span>
        <span class="account-tx-summary-time">${qEscapeHtml(timestamp)}</span>
        <span class="account-tx-summary-id" title="${qEscapeAttr(
          identifier
        )}">${qEscapeHtml(identifier)}</span>
      </summary>
      <div class="account-tx-body">
        ${buildBoardAccountTransactionMetaHtml(tx)}
        <pre class="account-tx-json">${qEscapeHtml(
          JSON.stringify(tx, null, 2)
        )}</pre>
      </div>
    </details>
  `
}

const buildBoardAccountCardSection = (title, subtitle, bodyHtml) => `
  <section class="account-modal-section">
    <div class="account-section-heading">
      <h3>${qEscapeHtml(title)}</h3>
      ${
        subtitle
          ? `<p class="account-section-subtitle">${qEscapeHtml(subtitle)}</p>`
          : ""
      }
    </div>
    ${bodyHtml}
  </section>
`

const buildBoardAccountChipListHtml = (items = [], emptyLabel = "") => {
  if (!Array.isArray(items) || items.length === 0) {
    return emptyLabel
      ? `<div class="account-chip account-chip--empty">${qEscapeHtml(
          emptyLabel
        )}</div>`
      : `<div class="account-chip account-chip--empty">No items found.</div>`
  }

  return `
    <div class="account-chip-list">
      ${items
        .map((item) =>
          buildBoardAccountTriggerHtml({
            name: item,
            label: item,
            className: "account-chip",
            tagName: "button",
            titlePrefix: "Open account details for",
          })
        )
        .join("")}
    </div>
  `
}

const buildBoardAccountInspectorLoadingHtml = (title, subtitle = "") => `
  <div class="account-modal-shell">
    <div class="account-modal-header">
      <div>
        <p class="account-modal-kicker">Account Inspector</p>
        <h2 class="account-modal-title">${qEscapeHtml(title)}</h2>
        ${
          subtitle
            ? `<p class="account-modal-address">${qEscapeHtml(subtitle)}</p>`
            : ""
        }
      </div>
    </div>
    <div class="account-modal-loading">
      ${getBoardLoadingHTML("Loading account details...")}
    </div>
  </div>
`

const buildBoardAccountInspectorHtml = () => {
  const state = boardAccountInspectorState
  const addressInfo = state.addressInfo || {}
  const sponsorship = state.sponsorship?.data || null
  const registeredNames = Array.isArray(state.names) ? state.names : []
  const sponsorNames = Array.isArray(sponsorship?.names) ? sponsorship.names : []
  const txLimit = Number(state.txLimit || 200)
  const transactionCount = Array.isArray(state.transactions)
    ? state.transactions.length
    : 0
  const txTypeSummary = buildBoardAccountTransactionCountsHtml(
    state.transactions
  )
  const txEntries = Array.isArray(state.transactions)
    ? state.transactions
        .map((tx, index) => buildBoardAccountTransactionEntryHtml(tx, index))
        .join("")
    : ""

  const identityStatsHtml = `
    <div class="account-stat-grid">
      <div class="account-stat-card">
        <span class="account-stat-label">Address</span>
        <span class="account-stat-value account-stat-value--mono">${qEscapeHtml(
          state.address || "Unknown"
        )}</span>
      </div>
      <div class="account-stat-card">
        <span class="account-stat-label">Level</span>
        <span class="account-stat-value">${qEscapeHtml(
          String(addressInfo?.level ?? "n/a")
        )}</span>
      </div>
      <div class="account-stat-card">
        <span class="account-stat-label">Blocks minted</span>
        <span class="account-stat-value">${qEscapeHtml(
          String(addressInfo?.blocksMinted ?? 0)
        )}</span>
      </div>
      <div class="account-stat-card">
        <span class="account-stat-label">Adjustments</span>
        <span class="account-stat-value">${qEscapeHtml(
          String(addressInfo?.blocksMintedAdjustment ?? 0)
        )}</span>
      </div>
      <div class="account-stat-card">
        <span class="account-stat-label">Penalties</span>
        <span class="account-stat-value">${qEscapeHtml(
          String(addressInfo?.blocksMintedPenalty ?? 0)
        )}</span>
      </div>
      <div class="account-stat-card">
        <span class="account-stat-label">Transfer</span>
        <span class="account-stat-value">${qEscapeHtml(
          String(addressInfo?.transfer ?? "n/a")
        )}</span>
      </div>
    </div>
  `

  const sponsorshipStatsHtml = sponsorship
    ? `
      <div class="account-stat-grid">
        <div class="account-stat-card">
          <span class="account-stat-label">Sponsees</span>
          <span class="account-stat-value">${qEscapeHtml(
            String(sponsorship?.sponseeCount ?? 0)
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Non-registered</span>
          <span class="account-stat-value">${qEscapeHtml(
            String(sponsorship?.nonRegisteredCount ?? 0)
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Average balance</span>
          <span class="account-stat-value">${qEscapeHtml(
            String(sponsorship?.avgBalance ?? 0)
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Arbitrary publishes</span>
          <span class="account-stat-value">${qEscapeHtml(
            String(sponsorship?.arbitraryCount ?? 0)
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Transfer assets</span>
          <span class="account-stat-value">${qEscapeHtml(
            String(sponsorship?.transferAssetCount ?? 0)
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Transfer privs</span>
          <span class="account-stat-value">${qEscapeHtml(
            String(sponsorship?.transferPrivsCount ?? 0)
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Buys</span>
          <span class="account-stat-value">${qEscapeHtml(
            `${sponsorship?.buyCount ?? 0} / ${sponsorship?.buyAmount ?? 0}`
          )}</span>
        </div>
        <div class="account-stat-card">
          <span class="account-stat-label">Sells</span>
          <span class="account-stat-value">${qEscapeHtml(
            `${sponsorship?.sellCount ?? 0} / ${sponsorship?.sellAmount ?? 0}`
          )}</span>
        </div>
      </div>
      <p class="account-note">
        NOTE - Sponsorship and Sponsee information is there for historic purposes and to help in decision-making. Qortal no longer makes use of the sponsorship method of the past, so the information is only relevant to see long-term past historic sponsor information.
      </p>
    `
    : `
      <p class="account-note">
        No sponsorship profile was returned for this account. Transaction history is still shown below when available.
      </p>
    `

  const registeredNamesHtml = buildBoardAccountChipListHtml(
    registeredNames,
    "No registered names were found for this address."
  )
  const sponsorNamesHtml = buildBoardAccountChipListHtml(
    sponsorNames,
    "No historic sponsee names were returned."
  )

  return `
    <div class="account-modal-shell">
      <div class="account-modal-header">
        <div>
          <p class="account-modal-kicker">Account Inspector</p>
          <h2 class="account-modal-title">${qEscapeHtml(
            state.displayName || state.address || "Account"
          )}</h2>
          <p class="account-modal-address">${qEscapeHtml(
            state.address || "Unknown address"
          )}</p>
        </div>
      </div>

      ${buildBoardAccountCardSection(
        "Identity",
        "Address-level details and registered names for this account.",
        `
          ${identityStatsHtml}
          <div class="account-chip-block">
            <h4 class="account-chip-block-title">Registered names on this address</h4>
            ${registeredNamesHtml}
          </div>
        `
      )}

      ${buildBoardAccountCardSection(
        "Historic sponsorship",
        state.sponsorship?.usedFallback
          ? "Fallback sponsor-side data was used because the direct sponsorship profile was empty."
          : "Historic sponsorship data and sponsee totals, useful for long-term context.",
        `
          ${sponsorshipStatsHtml}
          <div class="account-chip-block">
            <h4 class="account-chip-block-title">Historic sponsee names</h4>
            ${sponsorNamesHtml}
          </div>
        `
      )}

      ${buildBoardAccountCardSection(
        "Recent TX History",
        `Initially loaded transaction count: ${txLimit}. More can be loaded below. The ARBITRARY type is highlighted because it is the main QDN publish signal we care about here.`,
        `
          <div id="account-transaction-summary">
            ${txTypeSummary}
          </div>
          ${
            transactionCount > 0
              ? `<div id="account-transactions-list" class="account-tx-list">${txEntries}</div>`
              : `<div id="account-transactions-list" class="account-tx-empty">No transactions have been loaded for this account yet.</div>`
          }
          ${
            state.txHasMore
              ? `
                <div class="account-tx-load-row">
                  <button
                    type="button"
                    id="account-load-more-button"
                    class="account-load-more-button"
                    onclick="loadMoreBoardAccountTransactions()"
                    ${state.txLoadingMore ? "disabled" : ""}
                  >
                    ${state.txLoadingMore ? "Loading more..." : "Fetch more"}
                  </button>
                </div>
              `
              : ""
          }
        `
      )}
    </div>
  `
}

const ensureBoardAccountInspectorModal = () => {
  if (typeof createModal === "function") {
    createModal("account")
  }
}

const openBoardAccountInspectorFromElement = async (buttonEl, event) => {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  const identity =
    buttonEl?.dataset?.accountName ||
    buttonEl?.dataset?.accountIdentity ||
    ""
  const address = buttonEl?.dataset?.accountAddress || ""
  await openBoardAccountInspector(identity, address)
}

const openBoardAccountInspector = async (rawIdentity, rawAddress = "") => {
  ensureBoardAccountInspectorModal()

  const modal = document.getElementById("account-modal")
  const modalContent = document.getElementById("account-modalContent")
  if (!modal || !modalContent) {
    return
  }

  const requestId = ++boardAccountInspectorState.requestId
  const initialLabel = String(rawIdentity || rawAddress || "Account").trim()
  modal.style.display = "block"
  modalContent.innerHTML = buildBoardAccountInspectorLoadingHtml(
    initialLabel,
    "Loading account data..."
  )

  const resolvedIdentity = await resolveBoardAccountIdentity(
    rawIdentity,
    rawAddress
  )
  if (requestId !== boardAccountInspectorState.requestId) {
    return
  }

  if (!resolvedIdentity.address) {
    modalContent.innerHTML = `
      <div class="account-modal-shell">
        <div class="account-modal-header">
          <div>
            <p class="account-modal-kicker">Account Inspector</p>
            <h2 class="account-modal-title">${qEscapeHtml(
              resolvedIdentity.displayName || initialLabel || "Account"
            )}</h2>
          </div>
        </div>
        <div class="account-note">
          This label does not resolve to a Qortal account address, so there is nothing to inspect yet.
        </div>
      </div>
    `
    return
  }

  const txLimit = boardAccountInspectorState.txLimit || 200
  const [addressInfo, names, sponsorship, transactions] = await Promise.all([
    (typeof getAddressInfoCached === "function"
      ? getAddressInfoCached(resolvedIdentity.address)
      : getAddressInfo(resolvedIdentity.address)
    ).catch(() => null),
    getBoardNamesForAddress(resolvedIdentity.address).catch(() => []),
    getBoardAccountSponsorshipInfo(resolvedIdentity.address).catch(() => ({
      data: null,
      usedFallback: false,
    })),
    getBoardAccountTransactions(resolvedIdentity.address, 0, txLimit).catch(
      () => []
    ),
  ])

  if (requestId !== boardAccountInspectorState.requestId) {
    return
  }

  boardAccountInspectorState.address = resolvedIdentity.address
  boardAccountInspectorState.displayName =
    resolvedIdentity.displayName || resolvedIdentity.address
  boardAccountInspectorState.resolvedName = resolvedIdentity.resolvedName || ""
  boardAccountInspectorState.addressInfo = addressInfo || null
  boardAccountInspectorState.names = names || []
  boardAccountInspectorState.sponsorship = sponsorship || {
    data: null,
    usedFallback: false,
  }
  boardAccountInspectorState.transactions = Array.isArray(transactions)
    ? transactions
    : []
  boardAccountInspectorState.txOffset = 0
  boardAccountInspectorState.txHasMore =
    Array.isArray(transactions) && transactions.length === txLimit
  boardAccountInspectorState.txLoadingMore = false

  modalContent.innerHTML = buildBoardAccountInspectorHtml()
  modalContent.scrollTop = 0
}

const updateBoardAccountInspectorTransactionSection = () => {
  const summaryEl = document.getElementById("account-transaction-summary")
  const loadButton = document.getElementById("account-load-more-button")

  if (summaryEl) {
    summaryEl.innerHTML = buildBoardAccountTransactionCountsHtml(
      boardAccountInspectorState.transactions
    )
  }

  if (loadButton) {
    const loadRow = loadButton.closest(".account-tx-load-row")
    if (!boardAccountInspectorState.txHasMore) {
      if (loadRow) {
        loadRow.remove()
      } else {
        loadButton.remove()
      }
      return
    }

    loadButton.textContent = boardAccountInspectorState.txLoadingMore
      ? "Loading more..."
      : "Fetch more"
    loadButton.disabled = Boolean(boardAccountInspectorState.txLoadingMore)
  }
}

const loadMoreBoardAccountTransactions = async () => {
  if (
    boardAccountInspectorState.txLoadingMore ||
    !boardAccountInspectorState.txHasMore ||
    !boardAccountInspectorState.address
  ) {
    return
  }

  const requestId = boardAccountInspectorState.requestId
  const loadButton = document.getElementById("account-load-more-button")
  boardAccountInspectorState.txLoadingMore = true
  if (loadButton) {
    loadButton.disabled = true
    loadButton.textContent = "Loading more..."
  }

  const nextOffset = boardAccountInspectorState.transactions.length
  const nextPage = await getBoardAccountTransactions(
    boardAccountInspectorState.address,
    nextOffset,
    boardAccountInspectorState.txLimit
  )

  if (requestId !== boardAccountInspectorState.requestId) {
    return
  }

  boardAccountInspectorState.txLoadingMore = false
  if (Array.isArray(nextPage) && nextPage.length > 0) {
    boardAccountInspectorState.transactions = [
      ...boardAccountInspectorState.transactions,
      ...nextPage,
    ]
    const listEl = document.getElementById("account-transactions-list")
    if (listEl) {
      listEl.insertAdjacentHTML(
        "beforeend",
        nextPage
          .map((tx, index) =>
            buildBoardAccountTransactionEntryHtml(tx, nextOffset + index)
          )
          .join("")
      )
    }
  }
  boardAccountInspectorState.txOffset =
    boardAccountInspectorState.transactions.length
  boardAccountInspectorState.txHasMore =
    Array.isArray(nextPage) &&
    nextPage.length === boardAccountInspectorState.txLimit

  updateBoardAccountInspectorTransactionSection()
}

const canCurrentUserEditPublishedCard = async (
  publishedName,
  publishedAddress = ""
) => {
  const currentName = String(userState?.accountName || "").trim()
  const currentAddress = String(userState?.accountAddress || "").trim()
  const normalizedPublishedName = String(publishedName || "").trim()
  const normalizedPublishedAddress = String(publishedAddress || "").trim()

  if (
    currentAddress &&
    normalizedPublishedAddress &&
    currentAddress === normalizedPublishedAddress
  ) {
    return true
  }

  if (
    currentName &&
    normalizedPublishedName &&
    currentName.toLowerCase() === normalizedPublishedName.toLowerCase()
  ) {
    return true
  }

  if (
    normalizedPublishedName &&
    typeof fetchOwnerAddressFromNameCached === "function" &&
    currentAddress
  ) {
    const resolvedAddress = await fetchOwnerAddressFromNameCached(
      normalizedPublishedName
    )
    return Boolean(resolvedAddress && resolvedAddress === currentAddress)
  }

  return false
}

const scrollBoardCommentsToBottom = async (cardIdentifier) => {
  const commentsContainer = document.getElementById(
    `comments-container-${cardIdentifier}`
  )
  if (!commentsContainer) {
    return false
  }

  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
      return
    }

    setTimeout(resolve, 0)
  })

  commentsContainer.scrollTop = commentsContainer.scrollHeight
  return true
}

const scrollBoardCommentIntoView = async (cardIdentifier, commentIdentifier) => {
  const normalizedCardIdentifier = String(cardIdentifier || "").trim()
  const normalizedCommentIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedCardIdentifier || !normalizedCommentIdentifier) {
    return false
  }

  const commentsContainer = document.getElementById(
    `comments-container-${normalizedCardIdentifier}`
  )
  if (!commentsContainer) {
    return false
  }

  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
      return
    }

    setTimeout(resolve, 0)
  })

  const safeSelector = normalizedCommentIdentifier.replace(/"/g, '\\"')
  const commentEl = commentsContainer.querySelector(
    `[data-comment-identifier="${safeSelector}"]`
  )
  if (commentEl?.scrollIntoView) {
    commentEl.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
    return true
  }

  return false
}

const getBoardAccountLevel = async (nameOrAddress) => {
  const rawIdentity = String(nameOrAddress ?? "").trim()
  if (!rawIdentity) {
    return null
  }

  if (boardIdentityLevelCache.has(rawIdentity)) {
    return boardIdentityLevelCache.get(rawIdentity)
  }

  const qortalAddressPattern = /^Q[A-Za-z0-9]{33}$/
  const resolvedAddress = qortalAddressPattern.test(rawIdentity)
    ? rawIdentity
    : typeof fetchOwnerAddressFromNameCached === "function"
    ? await fetchOwnerAddressFromNameCached(rawIdentity)
    : null

  if (!resolvedAddress) {
    boardIdentityLevelCache.set(rawIdentity, null)
    return null
  }

  try {
    const addressInfo =
      typeof getAddressInfoCached === "function"
        ? await getAddressInfoCached(resolvedAddress)
        : await getAddressInfo(resolvedAddress)
    const level = Number(addressInfo?.level)
    const nextLevel = Number.isFinite(level) ? level : null
    boardIdentityLevelCache.set(rawIdentity, nextLevel)
    return nextLevel
  } catch (error) {
    console.warn("Unable to resolve account level:", rawIdentity, error)
    boardIdentityLevelCache.set(rawIdentity, null)
    return null
  }
}

// Kakashi Note: Shared button handlers read escaped data-* values to avoid passing untrusted strings through inline JS.
// Use data-link on buttons and pass only element refs to handlers to prevent inline JS injection.
const openLinksModalFromButton = (buttonEl) => {
  if (!buttonEl) return
  const rawLink = buttonEl.dataset?.link || ""
  if (typeof openLinksModal === "function") {
    openLinksModal(rawLink)
  }
}

const openLinkDisplayModalFromButton = (buttonEl) => {
  if (!buttonEl) return
  const rawLink = buttonEl.dataset?.link || ""
  if (typeof openLinkDisplayModal === "function") {
    openLinkDisplayModal(rawLink)
  }
}

const getBoardLoadingHTML = (message = "Loading cards...") => {
  const safeMessage = qEscapeHtml(message)
  return `
    <div class="board-loading" role="status" aria-live="polite" aria-busy="true">
      <div class="board-loading-spinner" aria-hidden="true"></div>
      <p>${safeMessage}</p>
    </div>
  `
}

const getBoardInlineLoadingHTML = (message = "Loading cards...") => {
  const safeMessage = qEscapeHtml(message)
  return `
    <span class="board-loading-inline" role="status" aria-live="polite" aria-busy="true">
      <span class="board-loading-spinner board-loading-spinner-inline" aria-hidden="true"></span>
      <span>${safeMessage}</span>
    </span>
  `
}

const fetchBlockList = async () => {
  try {
    // searchSimple to find all resources for that identifier
    const results = await searchSimple(
      "BLOG_POST",
      blockedNamesIdentifier, // identifier
      "", // name
      0, // limit=0 => no limit
      0, // offset
      "", // room
      true, // reverse => newest first or oldest first?
      true // prefixOnly => depends on whether you want partial matches
    )

    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn("No blockList resources found via searchSimple.")
      return []
    }
    // We must filter out resources not published by an admin
    const adminGroupMembers = await fetchAllAdminGroupsMembers()
    const adminAddresses = adminGroupMembers.map((m) => m.member)
    // The result objects from searchSimple have shape: { name, identifier, service, created, updated, ... }
    // We want only those where 'name' is an admin address's name, or the 'address' is in adminAddresses
    // But searchSimple doesn't give you the publisher address directly, only the name.
    // So we must check if the name belongs to an admin address
    const validAdminResults = []
    for (const r of results) {
      try {
        // fetchOwnerAddressFromName or getNameInfo to see if r.name resolves to one of the admin addresses
        const nameInfo = await getNameInfo(r.name)
        if (!nameInfo || !nameInfo.owner) {
          continue
        }
        if (adminAddresses.includes(nameInfo.owner)) {
          validAdminResults.push(r)
        }
      } catch (err) {
        console.warn(
          `Skipping result from ${r.name} - cannot confirm admin address`,
          err
        )
      }
    }

    if (validAdminResults.length === 0) {
      console.warn("No valid admin-published blockList resource found.")
      return []
    }
    // pick the newest result among validAdminResults
    // Usually you check r.updated or r.created
    validAdminResults.sort((a, b) => {
      const tA = a.updated || a.created || 0
      const tB = b.updated || b.created || 0
      return tB - tA // newest first
    })
    const newestValid = validAdminResults[0]

    // fetch the actual data
    const resourceData = await qortalRequest({
      action: "FETCH_QDN_RESOURCE",
      name: newestValid.name,
      service: newestValid.service, // "BLOG_POST"
      identifier: newestValid.identifier,
    })
    if (!resourceData) {
      console.warn("Fetched resource data is null/empty.")
      return []
    }

    // parse resourceData
    // If it's a string containing base64 JSON
    let blockedList
    if (typeof resourceData === "string") {
      // decode base64 => parse JSON
      const decoded = atob(resourceData)
      blockedList = JSON.parse(decoded)
    } else if (Array.isArray(resourceData)) {
      // the resource is already an array
      blockedList = resourceData
    } else {
      // maybe resourceData has data64 property or something else
      // adapt if needed
      console.warn("Unexpected blockList format. Could not parse.")
      return []
    }

    if (!Array.isArray(blockedList)) {
      console.warn("Block list is not an array:", blockedList)
      return []
    }
    console.log("Newest block list loaded:", blockedList)
    return blockedList
  } catch (err) {
    console.error("Failed to load block list:", err)
    return []
  }
}

const publishBlockList = async (blockedNames) => {
  if (!Array.isArray(blockedNames)) {
    console.warn("publishBlockList requires an array")
    return
  }
  try {
    const jsonStr = JSON.stringify(blockedNames)
    const data64 = btoa(jsonStr)
    // Publish
    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: `${userState.accountName}`, // The name under which your admin can publish
      service: "BLOG_POST",
      identifier: `${blockedNamesIdentifier}`,
      data64,
    })
    alert("Block list published successfully!")
  } catch (err) {
    console.error("Failed to publish block list:", err)
    alert("Error publishing block list.")
  }
}

// Function for obtaining all kick/ban transaction data, and separating it into PENDING and NON.
const fetchAllKickBanTxData = async () => {
  const kickTxType = "GROUP_KICK"
  const banTxType = "GROUP_BAN"

  const allKickTx = await searchTransactions({
    txTypes: [kickTxType],
    confirmationStatus: "CONFIRMED",
    limit: 0,
    reverse: true,
    offset: 0,
    startBlock: 1990000,
    blockLimit: 0,
    txGroupId: 0,
  })

  const allBanTx = await searchTransactions({
    txTypes: [banTxType],
    confirmationStatus: "CONFIRMED",
    limit: 0,
    reverse: true,
    offset: 0,
    startBlock: 1990000,
    blockLimit: 0,
    txGroupId: 0,
  })

  const { finalTx: finalKickTxs, pendingTx: pendingKickTxs } =
    partitionTransactions(allKickTx)
  const { finalTx: finalBanTxs, pendingTx: pendingBanTxs } =
    partitionTransactions(allBanTx)

  // We are going to keep all transactions in order to filter more accurately for display purposes.
  console.log("Final kickTxs:", finalKickTxs)
  console.log("Pending kickTxs:", pendingKickTxs)
  console.log("Final banTxs:", finalBanTxs)
  console.log("Pending banTxs:", pendingBanTxs)

  return {
    finalKickTxs,
    pendingKickTxs,
    finalBanTxs,
    pendingBanTxs,
  }
}

const partitionTransactions = (txSearchResults) => {
  const finalTx = []
  const pendingTx = []

  for (const tx of txSearchResults) {
    if (tx.approvalStatus === "PENDING") {
      pendingTx.push(tx)
    } else {
      finalTx.push(tx)
    }
  }

  return { finalTx, pendingTx }
}

const fetchAllInviteTransactions = async () => {
  const inviteTxType = "GROUP_INVITE"

  const allInviteTx = await searchTransactions({
    txTypes: [inviteTxType],
    confirmationStatus: "CONFIRMED",
    limit: 0,
    reverse: true,
    offset: 0,
    startBlock: 1990000,
    blockLimit: 0,
    txGroupId: 0,
  })

  const { finalTx: finalInviteTxs, pendingTx: pendingInviteTxs } =
    partitionTransactions(allInviteTx)

  console.log("Final InviteTxs:", finalInviteTxs)
  console.log("Pending InviteTxs:", pendingInviteTxs)

  return {
    finalInviteTxs,
    pendingInviteTxs,
  }
}

const findPendingApprovalsForTxSignature = async (
  txSignature,
  txType = "GROUP_APPROVAL",
  limit = 0,
  offset = 0
) => {
  const pendingTxs = await searchPendingTransactions(limit, offset)

  // Filter only the relevant GROUP_APPROVAL TX referencing txSignature
  const approvals = pendingTxs.filter(
    (tx) => tx.type === txType && tx.pendingSignature === txSignature
  )
  console.log(`approvals found:`, approvals)
  return approvals
}
