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

const getEffectiveMinterAdminMembers = (admins = []) => {
  if (!Array.isArray(admins)) {
    return []
  }

  const reservedNullAddress =
    typeof nullAddress !== "undefined" ? nullAddress : ""

  return admins.filter((admin) => {
    const member = String(admin?.member || "").trim()
    return Boolean(member) && member !== reservedNullAddress
  })
}

const getEffectiveMinterAdminCount = (admins = []) =>
  getEffectiveMinterAdminMembers(admins).length

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
const boardAccountGroupCache = new Map()
const boardAccountAtCache = new Map()
const BOARD_GROUP_TRANSACTION_TYPES = new Set([
  "GROUP_INVITE",
  "JOIN_GROUP",
  "GROUP_BAN",
  "GROUP_KICK",
  "LEAVE_GROUP",
])
const boardAccountInspectorState = {
  requestId: 0,
  address: "",
  displayName: "",
  resolvedName: "",
  txOffset: 0,
  txLimit: 200,
  txHasMore: false,
  txLoadingMore: false,
  txLoadingAll: false,
  transactions: [],
  names: [],
  sponsorship: null,
  balance: null,
  addressInfo: null,
}
const BOARD_RICH_TEXT_TOOLBAR_OPTIONS = [
  [{ header: [2, 3, false] }],
  ["bold", "italic"],
  [{ list: "bullet" }],
  ["clean"],
]
const BOARD_RICH_TEXT_EDITOR_FORMATS = ["header", "bold", "italic", "list"]

const getBoardRichTextEditorId = (editorKey) => `board-richtext-${editorKey}`

const getBoardRichTextComposerHtml = (
  editorKey,
  composerClass = "richtext-compose"
) => `
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
const boardCommentDataCache = new Map()
const boardCommentEditState = {
  cardIdentifier: "",
  commentIdentifier: "",
  publisherName: "",
  isEditing: false,
}
const boardCommentReplyState = {
  cardIdentifier: "",
  commentIdentifier: "",
  publisherName: "",
  timestamp: "",
  timestampText: "",
  contentHtml: "",
  isReplying: false,
}

const rememberBoardCommentContent = (commentIdentifier, contentHtml = "") => {
  const normalizedIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedIdentifier) {
    return
  }

  const normalizedContent = String(contentHtml ?? "")
  boardCommentContentCache.set(normalizedIdentifier, normalizedContent)

  const existingData = boardCommentDataCache.get(normalizedIdentifier) || {}
  boardCommentDataCache.set(normalizedIdentifier, {
    ...existingData,
    content: normalizedContent,
  })
}

const rememberBoardCommentData = (commentIdentifier, commentData = {}) => {
  const normalizedIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedIdentifier) {
    return
  }

  const existingData = boardCommentDataCache.get(normalizedIdentifier) || {}
  const normalizedContent = String(
    commentData?.content ??
      commentData?.contentHtml ??
      existingData.content ??
      ""
  )
  const normalizedData = {
    ...existingData,
    ...commentData,
    content: normalizedContent,
  }

  boardCommentDataCache.set(normalizedIdentifier, normalizedData)
  boardCommentContentCache.set(normalizedIdentifier, normalizedContent)
}

const getBoardCommentData = (commentIdentifier) => {
  const normalizedIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedIdentifier) {
    return null
  }

  return boardCommentDataCache.get(normalizedIdentifier) || null
}

const getBoardCommentContent = (commentIdentifier) => {
  const normalizedIdentifier = String(commentIdentifier || "").trim()
  if (!normalizedIdentifier) {
    return ""
  }

  return (
    boardCommentDataCache.get(normalizedIdentifier)?.content ||
    boardCommentContentCache.get(normalizedIdentifier) ||
    ""
  )
}

const formatBoardCommentTimestampLabel = (
  timestampValue,
  fallbackText = ""
) => {
  const normalizedFallback = String(fallbackText ?? "").trim()
  if (normalizedFallback) {
    return normalizedFallback
  }

  const rawTimestamp = String(timestampValue ?? "").trim()
  if (!rawTimestamp) {
    return ""
  }

  const numericTimestamp = Number(rawTimestamp)
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return new Date(numericTimestamp).toLocaleString()
  }

  return rawTimestamp
}

const normalizeBoardCommentReplyTarget = (replyTarget = {}) => {
  if (!replyTarget) {
    return {
      commentIdentifier: "",
      publisherName: "",
      timestamp: "",
      timestampText: "",
      contentHtml: "",
    }
  }

  if (typeof replyTarget === "string") {
    return {
      commentIdentifier: String(replyTarget || "").trim(),
      publisherName: "",
      timestamp: "",
      timestampText: "",
      contentHtml: "",
    }
  }

  const commentIdentifier = String(
    replyTarget.commentIdentifier || replyTarget.identifier || ""
  ).trim()
  const publisherName = String(
    replyTarget.publisherName || replyTarget.creator || replyTarget.name || ""
  ).trim()
  const timestamp = replyTarget.timestamp ?? replyTarget.created ?? ""
  const timestampText = String(
    replyTarget.timestampText ||
      replyTarget.date ||
      replyTarget.timestampLabel ||
      ""
  ).trim()
  const contentHtml = String(
    replyTarget.contentHtml ||
      replyTarget.content ||
      replyTarget.messageHtml ||
      ""
  )

  return {
    commentIdentifier,
    publisherName,
    timestamp,
    timestampText,
    contentHtml,
  }
}

const buildBoardCommentReplyPreviewHtml = (
  replyTarget = {},
  { variant = "embedded" } = {}
) => {
  const normalizedReplyTarget = normalizeBoardCommentReplyTarget(replyTarget)
  const commentIdentifier = normalizedReplyTarget.commentIdentifier
  const publisherName = normalizedReplyTarget.publisherName
  const contentFromCache = commentIdentifier
    ? getBoardCommentContent(commentIdentifier)
    : ""
  const contentHtml =
    normalizedReplyTarget.contentHtml || contentFromCache || ""
  const timestampLabel = formatBoardCommentTimestampLabel(
    normalizedReplyTarget.timestamp,
    normalizedReplyTarget.timestampText
  )

  if (!publisherName && !contentHtml && !timestampLabel) {
    return ""
  }

  const authorHtml =
    publisherName && typeof buildBoardAccountTriggerHtml === "function"
      ? buildBoardAccountTriggerHtml({
          name: publisherName,
          label: publisherName,
          className: "comment-author-name-link comment-reply-author-link",
          tagName: "button",
          titlePrefix: "Open account details for",
        })
      : `<span class="comment-reply-author">${qEscapeHtml(
          publisherName || "Unknown"
        )}</span>`
  const renderedReplyContent = contentHtml
    ? qRenderBoardCommentHtml(contentHtml)
    : `<div class="comment-reply-preview-empty">Original comment unavailable.</div>`
  const hasExpandableContent = Boolean(contentHtml)

  return `
    <div class="comment-reply-preview comment-reply-preview--${qEscapeAttr(
      variant
    )} comment-reply-preview--collapsed"${
    commentIdentifier
      ? ` data-reply-comment-identifier="${qEscapeAttr(commentIdentifier)}"`
      : ""
  } data-comment-reply-expanded="0">
      <div class="comment-reply-preview-header">
        <span class="comment-reply-preview-kicker">Replying to</span>
        ${authorHtml}
        ${
          timestampLabel
            ? `<span class="comment-reply-preview-timestamp">${qEscapeHtml(
                timestampLabel
              )}</span>`
            : ""
        }
        ${
          hasExpandableContent
            ? `
              <button
                type="button"
                class="comment-reply-preview-toggle"
                title="Expand reply preview"
                aria-label="Expand reply preview"
                aria-expanded="false"
                onclick="toggleBoardCommentReplyPreviewFromElement(this, event)"
              >
                <span class="mobi-mbri-arrow-down" aria-hidden="true"></span>
              </button>
            `
            : ""
        }
      </div>
      <div class="comment-reply-preview-content board-rich-content ql-editor">
        ${renderedReplyContent}
      </div>
    </div>
  `
}

const toggleBoardCommentReplyPreviewFromElement = (buttonEl, event) => {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  const previewEl = buttonEl?.closest(".comment-reply-preview")
  if (!previewEl) {
    return false
  }

  const isExpanded = previewEl.classList.contains(
    "comment-reply-preview--expanded"
  )
  const nextExpanded = !isExpanded

  previewEl.classList.toggle("comment-reply-preview--expanded", nextExpanded)
  previewEl.classList.toggle("comment-reply-preview--collapsed", !nextExpanded)
  previewEl.dataset.commentReplyExpanded = nextExpanded ? "1" : "0"

  buttonEl.setAttribute("aria-expanded", nextExpanded ? "true" : "false")
  buttonEl.title = nextExpanded
    ? "Collapse reply preview"
    : "Expand reply preview"
  buttonEl.setAttribute(
    "aria-label",
    nextExpanded ? "Collapse reply preview" : "Expand reply preview"
  )
  buttonEl.innerHTML = nextExpanded
    ? '<span class="mobi-mbri-arrow-up" aria-hidden="true"></span>'
    : '<span class="mobi-mbri-arrow-down" aria-hidden="true"></span>'

  return false
}

const clearBoardCommentComposerState = async (cardIdentifier = "") => {
  const normalizedCardIdentifier = String(cardIdentifier || "").trim()
  const activeCardIdentifier =
    normalizedCardIdentifier ||
    boardCommentEditState.cardIdentifier ||
    boardCommentReplyState.cardIdentifier

  boardCommentEditState.cardIdentifier = ""
  boardCommentEditState.commentIdentifier = ""
  boardCommentEditState.publisherName = ""
  boardCommentEditState.isEditing = false

  boardCommentReplyState.cardIdentifier = ""
  boardCommentReplyState.commentIdentifier = ""
  boardCommentReplyState.publisherName = ""
  boardCommentReplyState.timestamp = ""
  boardCommentReplyState.timestampText = ""
  boardCommentReplyState.contentHtml = ""
  boardCommentReplyState.isReplying = false

  if (activeCardIdentifier && typeof clearBoardCommentEditor === "function") {
    clearBoardCommentEditor(activeCardIdentifier)
  }

  if (activeCardIdentifier) {
    updateBoardCommentActionBar(activeCardIdentifier)
  }
}

const clearBoardCommentEditState = async (cardIdentifier = "") => {
  await clearBoardCommentComposerState(cardIdentifier)
}

const clearBoardCommentReplyState = async (cardIdentifier = "") => {
  await clearBoardCommentComposerState(cardIdentifier)
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

  if (currentAddress && typeof fetchOwnerAddressFromNameCached === "function") {
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
  const replyPreviewEl = document.getElementById(
    `comment-editor-reply-preview-${normalizedCardIdentifier}`
  )
  const isEditing =
    boardCommentEditState.isEditing &&
    boardCommentEditState.cardIdentifier === normalizedCardIdentifier
  const isReplying =
    boardCommentReplyState.isReplying &&
    boardCommentReplyState.cardIdentifier === normalizedCardIdentifier

  if (submitButton) {
    submitButton.textContent = isEditing
      ? "Update Comment"
      : isReplying
      ? "Post Reply"
      : "Post Comment"
  }
  if (cancelButton) {
    cancelButton.hidden = !(isEditing || isReplying)
    cancelButton.textContent = isEditing ? "Cancel Edit" : "Cancel Reply"
  }
  if (statusEl) {
    statusEl.textContent = isEditing
      ? `Editing comment by ${boardCommentEditState.publisherName || "you"}.`
      : isReplying
      ? `Replying to ${boardCommentReplyState.publisherName || "this comment"}.`
      : ""
  }
  if (replyPreviewEl) {
    const replyPreviewHtml = isReplying
      ? buildBoardCommentReplyPreviewHtml(boardCommentReplyState, {
          variant: "composer",
        })
      : ""
    replyPreviewEl.hidden = !isReplying
    replyPreviewEl.innerHTML = replyPreviewHtml
  }
}

const getBoardCommentActionBarHtml = (
  cardIdentifier,
  submitHandlerName = "postComment"
) => `
  <div class="comment-editor-actions">
    <div class="comment-editor-context">
      <div
        id="comment-editor-status-${qEscapeAttr(cardIdentifier)}"
        class="comment-editor-status"
        aria-live="polite"
      ></div>
      <div
        id="comment-editor-reply-preview-${qEscapeAttr(cardIdentifier)}"
        class="comment-editor-reply-preview"
        hidden
      ></div>
    </div>
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

const buildBoardCommentReplyButtonHtml = ({
  cardIdentifier = "",
  commentIdentifier = "",
  publisherName = "",
} = {}) => {
  const normalizedCardIdentifier = String(cardIdentifier || "").trim()
  const normalizedCommentIdentifier = String(commentIdentifier || "").trim()
  const normalizedPublisherName = String(publisherName || "").trim()

  if (!normalizedCardIdentifier || !normalizedCommentIdentifier) {
    return ""
  }

  return `
    <button
      type="button"
      class="comment-reply-button"
      title="Reply to comment"
      aria-label="Reply to comment"
      data-card-identifier="${qEscapeAttr(normalizedCardIdentifier)}"
      data-comment-identifier="${qEscapeAttr(normalizedCommentIdentifier)}"
      data-comment-publisher="${qEscapeAttr(normalizedPublisherName)}"
      onclick="openBoardCommentReplyFromElement(this, event)"
    >
      <span class="mobi-mbri-redo" aria-hidden="true"></span>
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

  await clearBoardCommentComposerState(cardIdentifier)

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

const openBoardCommentReplyFromElement = async (buttonEl, event) => {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  const cardIdentifier = String(buttonEl?.dataset?.cardIdentifier || "").trim()
  const commentIdentifier = String(
    buttonEl?.dataset?.commentIdentifier || ""
  ).trim()
  if (!cardIdentifier || !commentIdentifier) {
    return false
  }

  const commentEl = buttonEl?.closest(".comment")
  const commentData =
    typeof getBoardCommentData === "function"
      ? getBoardCommentData(commentIdentifier)
      : null
  const publisherName = String(
    commentEl?.querySelector(
      ".comment-meta .comment-author-name-link, .comment-meta .comment-author-name, .comment-meta .comment-reply-author-link"
    )?.textContent ||
      buttonEl?.dataset?.commentPublisher ||
      commentData?.creator ||
      ""
  ).trim()
  const timestampText = String(
    commentEl?.querySelector(".comment-timestamp")?.textContent ||
      commentData?.timestampText ||
      ""
  ).trim()
  const contentHtml = String(
    commentEl?.querySelector(".comment-body")?.innerHTML ||
      commentData?.content ||
      commentData?.contentHtml ||
      getBoardCommentContent(commentIdentifier) ||
      ""
  )

  await clearBoardCommentComposerState(cardIdentifier)

  boardCommentReplyState.cardIdentifier = cardIdentifier
  boardCommentReplyState.commentIdentifier = commentIdentifier
  boardCommentReplyState.publisherName = publisherName
  boardCommentReplyState.timestamp = commentData?.timestamp || ""
  boardCommentReplyState.timestampText = timestampText
  boardCommentReplyState.contentHtml = contentHtml
  boardCommentReplyState.isReplying = true

  if (typeof ensureBoardCommentEditor === "function") {
    ensureBoardCommentEditor(cardIdentifier, "Write a reply...")
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
  const trimmedBase = String(
    typeof baseUrl === "string" ? baseUrl : ""
  ).replace(/\/$/, "")
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

  if (
    !resolvedAddress &&
    addressHint &&
    !qortalAddressPattern.test(addressHint)
  ) {
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
    resolvedName ||
    (!inputLooksLikeAddress ? inputIdentity : "") ||
    registeredNames[0]

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
        `/addresses/sponsorship/${encodeURIComponent(
          normalizedAddress
        )}${suffix}`
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

  // If the address itself has no sponsorship profile, ask for the sponsor-side view instead.
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
              <span class="account-tx-type-count">${qEscapeHtml(
                String(count)
              )}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `
}

const BOARD_ACCOUNT_TX_LOAD_ALL_WARNING =
  "Load all transaction history may take a long time to complete depending on how old or active the account is. Please be patient..."

const buildBoardAccountTransactionControlsHtml = (position = "top") => {
  const state = boardAccountInspectorState
  const shouldShowControls =
    state.txHasMore || state.txLoadingMore || state.txLoadingAll

  if (!shouldShowControls) {
    return ""
  }

  const isBusy = Boolean(state.txLoadingMore || state.txLoadingAll)
  const loadMoreLabel = state.txLoadingAll
    ? "Loading all..."
    : state.txLoadingMore
    ? "Loading more..."
    : "Load more"
  const loadAllLabel = state.txLoadingAll ? "Loading all..." : "Load all TX"

  return `
    <div class="account-tx-controls account-tx-controls--${qEscapeAttr(
      position
    )}">
      ${
        position === "top"
          ? `<p class="account-section-subtitle account-tx-warning">${qEscapeHtml(
              BOARD_ACCOUNT_TX_LOAD_ALL_WARNING
            )}</p>`
          : ""
      }
      <div class="account-tx-load-row">
        <button
          type="button"
          data-board-account-tx-action="load-more"
          class="account-load-more-button"
          onclick="loadMoreBoardAccountTransactions()"
          ${state.txHasMore && !isBusy ? "" : "disabled"}
        >
          ${qEscapeHtml(loadMoreLabel)}
        </button>
        <button
          type="button"
          data-board-account-tx-action="load-all"
          class="account-load-all-button"
          title="${qEscapeAttr(BOARD_ACCOUNT_TX_LOAD_ALL_WARNING)}"
          onclick="loadAllBoardAccountTransactions()"
          ${state.txHasMore && !isBusy ? "" : "disabled"}
        >
          ${qEscapeHtml(loadAllLabel)}
        </button>
      </div>
    </div>
  `
}

const BOARD_TRANSACTION_AMOUNT_SCALE = 100000000n

const normalizeBoardTransactionAddress = (value) => String(value ?? "").trim()

const parseBoardTransactionAmountAtomic = (value) => {
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, "")
  if (!raw) {
    return null
  }

  const normalized = raw.replace(/^[-+]/, "")
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null
  }

  const negative = raw.startsWith("-")
  const [wholePart = "0", fractionPart = ""] = normalized.split(".")
  const wholeAtomic = BigInt(wholePart || "0") * BOARD_TRANSACTION_AMOUNT_SCALE
  const fractionAtomic = BigInt(`${(fractionPart + "00000000").slice(0, 8)}`)

  let atomic = wholeAtomic + fractionAtomic
  if (negative) {
    atomic *= -1n
  }

  return atomic
}

const formatBoardTransactionAmount = (value) => {
  const atomic =
    typeof value === "bigint" ? value : parseBoardTransactionAmountAtomic(value)
  if (atomic === null || atomic === undefined) {
    return ""
  }

  const negative = atomic < 0n
  const absolute = negative ? -atomic : atomic
  const whole = absolute / BOARD_TRANSACTION_AMOUNT_SCALE
  const fraction = (absolute % BOARD_TRANSACTION_AMOUNT_SCALE)
    .toString()
    .padStart(8, "0")

  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`
}

const sumBoardTransactionPaymentAmounts = (payments = []) => {
  let total = 0n
  let hasValue = false

  for (const payment of payments) {
    const atomic = parseBoardTransactionAmountAtomic(payment?.amount)
    if (atomic === null) {
      continue
    }
    hasValue = true
    total += atomic
  }

  return hasValue ? total : null
}

const getBoardTransactionFlowContext = (tx = {}) => {
  const fromAddress = normalizeBoardTransactionAddress(
    tx?.creatorAddress ||
      tx?.senderAddress ||
      tx?.fromAddress ||
      tx?.ownerAddress ||
      ""
  )
  const directRecipient = normalizeBoardTransactionAddress(
    tx?.recipient || tx?.toAddress || tx?.destinationAddress || ""
  )
  const payments = Array.isArray(tx?.payments)
    ? tx.payments
        .map((payment) => ({
          recipient: normalizeBoardTransactionAddress(
            payment?.recipient || payment?.address || ""
          ),
          amount: payment?.amount,
        }))
        .filter((payment) => payment.recipient)
    : []

  let toAddress = directRecipient
  let amount = formatBoardTransactionAmount(tx?.amount)

  if (!toAddress && payments.length === 1) {
    toAddress = payments[0].recipient
  }

  if (!amount && payments.length === 1) {
    amount = formatBoardTransactionAmount(payments[0].amount)
  }

  if (!amount && payments.length > 1) {
    const uniqueRecipients = new Set(
      payments.map((payment) => payment.recipient)
    )
    if (uniqueRecipients.size === 1) {
      toAddress = toAddress || payments[0].recipient
      amount = formatBoardTransactionAmount(
        sumBoardTransactionPaymentAmounts(payments)
      )
    }
  }

  if (!fromAddress || !toAddress) {
    return null
  }

  return {
    fromAddress,
    toAddress,
    amount: amount || "",
    paymentCount: payments.length,
    txType: String(tx?.type || "").toUpperCase(),
  }
}

const normalizeBoardTransactionGroupId = (value) => {
  const normalizedValue = String(value ?? "").trim()
  if (!normalizedValue) {
    return ""
  }

  return normalizedValue
}

const getBoardTransactionGroupContext = (tx = {}) => {
  const txType = String(tx?.type || "").toUpperCase()
  if (!BOARD_GROUP_TRANSACTION_TYPES.has(txType)) {
    return null
  }

  const groupId = normalizeBoardTransactionGroupId(
    tx?.groupId ||
      tx?.groupID ||
      tx?.targetGroupId ||
      tx?.recipientGroupId ||
      ""
  )

  if (!groupId) {
    return null
  }

  return {
    groupId,
    txType,
    actionLabel: txType
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  }
}

const getBoardGroupInfo = async (groupId) => {
  const normalizedGroupId = normalizeBoardTransactionGroupId(groupId)
  if (!normalizedGroupId) {
    return null
  }

  if (boardAccountGroupCache.has(normalizedGroupId)) {
    return boardAccountGroupCache.get(normalizedGroupId)
  }

  try {
    const data = await qFetchBoardJson(
      `/groups/${encodeURIComponent(normalizedGroupId)}`
    )
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Object.keys(data).length > 0
    ) {
      boardAccountGroupCache.set(normalizedGroupId, data)
      return data
    }
  } catch (error) {
    // Fall through to cache null so we do not hammer the endpoint on repeated opens.
  }

  boardAccountGroupCache.set(normalizedGroupId, null)
  return null
}

const normalizeBoardTransactionAtAddress = (value) => String(value ?? "").trim()

const getBoardTransactionAtAddressValue = (tx = {}) => {
  if (!tx || typeof tx !== "object") {
    return ""
  }

  const candidateKeys = [
    "atAddress",
    "ATAddress",
    "aTAddress",
    "ataddress",
    "ATADDRESS",
    "at",
  ]

  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(tx, key)) {
      const value = normalizeBoardTransactionAtAddress(tx[key])
      if (value) {
        return value
      }
    }
  }

  const normalizedTarget = "ataddress"
  const fallbackKey = Object.keys(tx).find(
    (key) =>
      String(key || "")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase() === normalizedTarget
  )

  return normalizeBoardTransactionAtAddress(fallbackKey ? tx[fallbackKey] : "")
}

const getBoardTransactionAtContext = (tx = {}) => {
  const txType = String(tx?.type || "").toUpperCase()
  if (txType !== "DEPLOY_AT") {
    return null
  }

  const rawName = String(tx?.name || tx?.atName || tx?.identifier || "").trim()
  if (!/\bACCT\b/i.test(rawName)) {
    return null
  }

  const atAddress = getBoardTransactionAtAddressValue(tx)
  const marketName = rawName.replace(/\s*ACCT\b/i, "").trim() || rawName
  const amount = formatBoardTransactionAmount(
    tx?.amount ?? tx?.saleAmount ?? tx?.price ?? ""
  )

  return {
    txType,
    atAddress,
    rawName,
    marketName: marketName || "Unknown market",
    amount: amount || "",
  }
}

const getBoardAtInfo = async (atAddress) => {
  const normalizedAtAddress = normalizeBoardTransactionAtAddress(atAddress)
  if (!normalizedAtAddress) {
    return null
  }

  if (boardAccountAtCache.has(normalizedAtAddress)) {
    const cached = boardAccountAtCache.get(normalizedAtAddress)
    return cached && typeof cached.then === "function" ? cached : cached
  }

  const fetchPromise = (async () => {
    try {
      const data = await qFetchBoardJson(
        `/at/${encodeURIComponent(normalizedAtAddress)}`
      )
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.keys(data).length > 0
      ) {
        boardAccountAtCache.set(normalizedAtAddress, data)
        return data
      }
    } catch (error) {
      // Fall through to cache null so repeated opens stay quiet and cheap.
    }

    boardAccountAtCache.set(normalizedAtAddress, null)
    return null
  })()

  boardAccountAtCache.set(normalizedAtAddress, fetchPromise)
  return fetchPromise
}

const getBoardTransactionAtStatusLabel = (atInfo) => {
  if (!atInfo) {
    return "Unavailable"
  }

  if (atInfo.hadFatalError) {
    return "Failed"
  }

  if (atInfo.isFinished) {
    return "Completed"
  }

  if (atInfo.isFrozen) {
    return "Frozen"
  }

  if (atInfo.isSleeping) {
    return "Sleeping"
  }

  return "Running"
}

const getBoardTransactionAtStatusClass = (atInfo) => {
  if (!atInfo) {
    return "account-tx-at-chip--status-unavailable"
  }

  if (atInfo.hadFatalError) {
    return "account-tx-at-chip--status-error"
  }

  if (atInfo.isFinished) {
    return "account-tx-at-chip--status-complete"
  }

  if (atInfo.isFrozen) {
    return "account-tx-at-chip--status-frozen"
  }

  if (atInfo.isSleeping) {
    return "account-tx-at-chip--status-sleeping"
  }

  return "account-tx-at-chip--status-active"
}

const buildBoardTransactionAtSummaryHtml = ({
  marketName = "",
  amount = "",
  statusLabel = "Loading details...",
  statusClass = "account-tx-at-chip--status-loading",
} = {}) => {
  const safeMarket = qEscapeHtml(marketName || "Unknown market")
  const safeAmount = qEscapeHtml(amount || "n/a")
  const safeStatus = qEscapeHtml(statusLabel || "Loading details...")

  return `
    <div class="account-tx-summary-extra account-tx-summary-extra--sell" data-board-tx-at-summary="1">
      <span class="account-tx-at-chip account-tx-at-chip--action">SELL</span>
      <span class="account-tx-at-chip account-tx-at-chip--amount">Amount: ${safeAmount}</span>
      <span class="account-tx-at-chip account-tx-at-chip--market">Market: ${safeMarket}</span>
      <span
        class="account-tx-at-chip account-tx-at-chip--status ${qEscapeAttr(
          statusClass
        )}"
        data-board-tx-at-status="1"
      >${safeStatus}</span>
    </div>
  `
}

const buildBoardTransactionAtHtml = ({
  atAddress = "",
  marketName = "",
  amount = "",
  atInfo = null,
} = {}) => {
  const safeAtAddress = qEscapeHtml(
    atAddress || atInfo?.ATAddress || "Unknown AT address"
  )
  const safeMarket = qEscapeHtml(marketName || "Unknown market")
  const safeAmount = qEscapeHtml(amount || "n/a")
  const statusLabel = getBoardTransactionAtStatusLabel(atInfo)
  const statusClass = getBoardTransactionAtStatusClass(atInfo)

  if (!atInfo) {
    return `
      <div class="account-tx-flow-empty">
        Unable to load AT details for this sell order.
      </div>
    `
  }

  const creationText = atInfo.creation
    ? new Date(atInfo.creation).toLocaleString()
    : "n/a"

  return `
    <div class="account-tx-at-banner">
      <span class="account-tx-at-banner-action">SELL</span>
      <span class="account-tx-at-banner-amount">Amount: ${safeAmount}</span>
      <span class="account-tx-at-banner-market">Market: ${safeMarket}</span>
      <span class="account-tx-at-banner-status ${qEscapeAttr(statusClass)}">
        ${qEscapeHtml(statusLabel)}
      </span>
    </div>
    <dl class="account-tx-meta-grid">
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">AT Address</dt>
        <dd class="account-tx-meta-value">${safeAtAddress}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Creation</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(creationText)}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Version</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(atInfo?.version ?? "n/a")
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Asset ID</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(atInfo?.assetId ?? "n/a")
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Creator public key</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(atInfo?.creatorPublicKey ?? "n/a")
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Code hash</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(atInfo?.codeHash ?? "n/a")
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Finished</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(Boolean(atInfo?.isFinished))
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Sleeping</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(Boolean(atInfo?.isSleeping))
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Frozen</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(Boolean(atInfo?.isFrozen))
        )}</dd>
      </div>
      <div class="account-tx-meta-item">
        <dt class="account-tx-meta-label">Fatal error</dt>
        <dd class="account-tx-meta-value">${qEscapeHtml(
          String(Boolean(atInfo?.hadFatalError))
        )}</dd>
      </div>
    </dl>
    <p class="account-tx-at-note">
      isFinished: true means the sell order has completed.
    </p>
  `
}

const buildBoardTransactionPartyNameListHtml = (names = []) => {
  const normalizedNames = Array.isArray(names)
    ? names
        .map((name) => String(name || "").trim())
        .filter((name) => Boolean(name))
    : []

  if (normalizedNames.length === 0) {
    return `
      <div class="account-tx-party-empty">No registered names found.</div>
    `
  }

  const visibleNames = normalizedNames.slice(0, 3)
  const extraCount = normalizedNames.length - visibleNames.length

  return `
    <div class="account-tx-party-name-list">
      ${visibleNames
        .map((name) =>
          buildBoardAccountTriggerHtml({
            name,
            label: name,
            className: "account-chip account-chip--tx-name",
            tagName: "button",
            titlePrefix: "Open account details for",
          })
        )
        .join("")}
      ${
        extraCount > 0
          ? `<span class="account-chip account-chip--tx-name account-chip--tx-more">+${qEscapeHtml(
              String(extraCount)
            )} more</span>`
          : ""
      }
    </div>
  `
}

const buildBoardTransactionPartyHtml = ({
  roleLabel = "",
  address = "",
  names = [],
  accentClass = "",
} = {}) => {
  const normalizedAddress = String(address || "").trim()
  const safeRoleLabel = qEscapeHtml(roleLabel || "Account")
  const addressButtonHtml = normalizedAddress
    ? buildBoardAccountTriggerHtml({
        name: normalizedAddress,
        address: normalizedAddress,
        label: normalizedAddress,
        className: "account-chip account-chip--tx-address",
        tagName: "button",
        titlePrefix: "Open account details for",
      })
    : `<div class="account-tx-party-empty">Unknown address.</div>`

  return `
    <div class="account-tx-party ${accentClass}">
      <span class="account-tx-party-label">${safeRoleLabel}</span>
      ${buildBoardTransactionPartyNameListHtml(names)}
      ${addressButtonHtml}
    </div>
  `
}

const buildBoardTransactionGroupHtml = ({
  groupId = "",
  groupName = "",
  ownerPrimaryName = "",
  actionLabel = "Group",
} = {}) => {
  const normalizedGroupId = normalizeBoardTransactionGroupId(groupId)
  const safeGroupName = qEscapeHtml(
    groupName ||
      (normalizedGroupId ? `Group ${normalizedGroupId}` : "Unknown group")
  )
  const ownerName = String(ownerPrimaryName || "").trim()
  const ownerHtml = ownerName
    ? typeof buildBoardAccountTriggerHtml === "function"
      ? buildBoardAccountTriggerHtml({
          name: ownerName,
          label: ownerName,
          className:
            "account-chip account-chip--tx-name account-chip--tx-owner",
          tagName: "button",
          titlePrefix: "Open account details for",
        })
      : `<span class="account-chip account-chip--tx-name account-chip--tx-owner">${qEscapeHtml(
          ownerName
        )}</span>`
    : `<div class="account-tx-party-empty">Unknown owner.</div>`

  return `
    <div class="account-tx-group">
      <span class="account-tx-group-label">${qEscapeHtml(
        actionLabel || "Group"
      )}</span>
      <div class="account-tx-group-name">${safeGroupName}</div>
      <div class="account-tx-group-owner-row">
        <span class="account-tx-group-owner-label">Owner</span>
        ${ownerHtml}
      </div>
      ${
        normalizedGroupId
          ? `<span class="account-tx-group-id">Group ID: ${qEscapeHtml(
              normalizedGroupId
            )}</span>`
          : ""
      }
    </div>
  `
}

const buildBoardTransactionFlowHtml = ({
  fromAddress = "",
  toAddress = "",
  amount = "",
  fromNames = [],
  toNames = [],
  paymentCount = 0,
} = {}) => {
  const safeAmount = qEscapeHtml(amount || "n/a")
  return `
    <div class="account-tx-flow">
      ${buildBoardTransactionPartyHtml({
        roleLabel: "From",
        address: fromAddress,
        names: fromNames,
        accentClass: "account-tx-party--from",
      })}
      <div class="account-tx-amount-panel">
        <span class="account-tx-amount-label">Amount</span>
        <span class="account-tx-amount-value">${safeAmount}</span>
        ${
          paymentCount > 1
            ? `<span class="account-tx-amount-note">${qEscapeHtml(
                `${paymentCount} payments`
              )}</span>`
            : ""
        }
        <span class="account-tx-amount-arrow" aria-hidden="true">→</span>
      </div>
      ${buildBoardTransactionPartyHtml({
        roleLabel: "To",
        address: toAddress,
        names: toNames,
        accentClass: "account-tx-party--to",
      })}
    </div>
  `
}

const hydrateBoardAccountTransactionFlow = async (detailsEl) => {
  const flowEl = detailsEl?.querySelector(
    ".account-tx-flow[data-board-tx-flow='1']"
  )
  if (
    !flowEl ||
    flowEl.dataset.flowLoaded === "true" ||
    flowEl.dataset.flowLoading === "true"
  ) {
    return
  }

  flowEl.dataset.flowLoading = "true"

  try {
    const fromAddress = normalizeBoardTransactionAddress(
      flowEl.dataset.fromAddress
    )
    const toAddress = normalizeBoardTransactionAddress(flowEl.dataset.toAddress)
    const amount = String(flowEl.dataset.amount || "").trim()
    const paymentCount = Number(flowEl.dataset.paymentCount || 0)

    if (!fromAddress || !toAddress) {
      flowEl.innerHTML = `
        <div class="account-tx-flow-empty">
          No transfer-style summary is available for this transaction.
        </div>
      `
      flowEl.classList.remove("account-tx-flow--loading")
      flowEl.dataset.flowLoaded = "true"
      return
    }

    flowEl.innerHTML = getBoardInlineLoadingHTML("Loading linked names...")

    const [fromNames, toNames] = await Promise.all([
      getBoardNamesForAddress(fromAddress).catch(() => []),
      getBoardNamesForAddress(toAddress).catch(() => []),
    ])

    if (!detailsEl.isConnected) {
      return
    }

    flowEl.innerHTML = buildBoardTransactionFlowHtml({
      fromAddress,
      toAddress,
      amount,
      fromNames,
      toNames,
      paymentCount,
    })
    flowEl.classList.remove("account-tx-flow--loading")
    flowEl.classList.add("account-tx-flow--loaded")
    flowEl.dataset.flowLoaded = "true"
  } catch (error) {
    console.error("Unable to hydrate account transaction flow:", error)
    if (detailsEl.isConnected) {
      flowEl.innerHTML = `
        <div class="account-tx-flow-empty">
          Unable to load linked names for this transaction.
        </div>
      `
      flowEl.classList.remove("account-tx-flow--loading")
      flowEl.dataset.flowLoaded = "true"
    }
  } finally {
    delete flowEl.dataset.flowLoading
  }
}

const hydrateBoardAccountTransactionGroup = async (detailsEl) => {
  const groupEl = detailsEl?.querySelector(
    ".account-tx-group[data-board-tx-group='1']"
  )
  if (
    !groupEl ||
    groupEl.dataset.groupLoaded === "true" ||
    groupEl.dataset.groupLoading === "true"
  ) {
    return
  }

  groupEl.dataset.groupLoading = "true"

  try {
    const groupId = normalizeBoardTransactionGroupId(groupEl.dataset.groupId)
    if (!groupId) {
      groupEl.innerHTML = `
        <div class="account-tx-flow-empty">
          No group information is available for this transaction.
        </div>
      `
      groupEl.classList.remove("account-tx-group--loading")
      groupEl.dataset.groupLoaded = "true"
      return
    }

    groupEl.innerHTML = getBoardInlineLoadingHTML("Loading group details...")

    const groupInfo = await getBoardGroupInfo(groupId)

    if (!detailsEl.isConnected) {
      return
    }

    if (!groupInfo) {
      groupEl.innerHTML = `
        <div class="account-tx-flow-empty">
          Unable to load group details for group #${qEscapeHtml(groupId)}.
        </div>
      `
      groupEl.classList.remove("account-tx-group--loading")
      groupEl.dataset.groupLoaded = "true"
      return
    }

    groupEl.innerHTML = buildBoardTransactionGroupHtml({
      groupId,
      groupName: groupInfo.groupName || "",
      ownerPrimaryName: groupInfo.ownerPrimaryName || "",
      actionLabel: groupEl.dataset.actionLabel || "Group",
    })
    groupEl.classList.remove("account-tx-group--loading")
    groupEl.classList.add("account-tx-group--loaded")
    groupEl.dataset.groupLoaded = "true"
  } catch (error) {
    console.error("Unable to hydrate group invite transaction:", error)
    if (detailsEl.isConnected) {
      groupEl.innerHTML = `
        <div class="account-tx-flow-empty">
          Unable to load group details for group #${qEscapeHtml(groupId)}.
        </div>
      `
      groupEl.classList.remove("account-tx-group--loading")
      groupEl.dataset.groupLoaded = "true"
    }
  } finally {
    delete groupEl.dataset.groupLoading
  }
}

const hydrateBoardAccountTransactionAt = async (detailsEl) => {
  const atEl = detailsEl?.querySelector(".account-tx-at[data-board-tx-at='1']")
  if (
    !atEl ||
    atEl.dataset.atLoaded === "true" ||
    atEl.dataset.atLoading === "true"
  ) {
    return
  }

  atEl.dataset.atLoading = "true"

  try {
    const atAddress = normalizeBoardTransactionAtAddress(atEl.dataset.atAddress)
    const marketName = String(atEl.dataset.marketName || "").trim()
    const amount = String(atEl.dataset.amount || "").trim()

    if (!atAddress) {
      atEl.innerHTML = `
        <div class="account-tx-flow-empty">
          No AT address was included for this sell order.
        </div>
      `
      atEl.classList.remove("account-tx-at--loading")
      atEl.dataset.atLoaded = "true"

      const summaryStatusNodes = detailsEl.querySelectorAll(
        "[data-board-tx-at-summary='1'] [data-board-tx-at-status='1']"
      )
      summaryStatusNodes.forEach((statusNode) => {
        statusNode.textContent = "Unavailable"
        statusNode.classList.remove(
          "account-tx-at-chip--status-loading",
          "account-tx-at-chip--status-active",
          "account-tx-at-chip--status-complete",
          "account-tx-at-chip--status-frozen",
          "account-tx-at-chip--status-sleeping",
          "account-tx-at-chip--status-error"
        )
        statusNode.classList.add("account-tx-at-chip--status-unavailable")
      })
      return
    }

    atEl.innerHTML = getBoardInlineLoadingHTML("Loading AT details...")

    const atInfo = await getBoardAtInfo(atAddress)

    if (!detailsEl.isConnected) {
      return
    }

    atEl.innerHTML = buildBoardTransactionAtHtml({
      atAddress,
      marketName,
      amount,
      atInfo,
    })
    atEl.classList.remove("account-tx-at--loading")
    atEl.classList.add("account-tx-at--loaded")
    atEl.dataset.atLoaded = "true"

    const atStatusLabel = getBoardTransactionAtStatusLabel(atInfo)
    const summaryStatusNodes = detailsEl.querySelectorAll(
      "[data-board-tx-at-summary='1'] [data-board-tx-at-status='1']"
    )
    summaryStatusNodes.forEach((statusNode) => {
      statusNode.textContent = atStatusLabel
      statusNode.classList.remove(
        "account-tx-at-chip--status-loading",
        "account-tx-at-chip--status-active",
        "account-tx-at-chip--status-complete",
        "account-tx-at-chip--status-frozen",
        "account-tx-at-chip--status-sleeping",
        "account-tx-at-chip--status-error",
        "account-tx-at-chip--status-unavailable"
      )
      statusNode.classList.add(getBoardTransactionAtStatusClass(atInfo))
    })

    detailsEl.classList.add("account-tx-item--sell-order")
    detailsEl.classList.toggle(
      "account-tx-item--sell-order-complete",
      Boolean(atInfo?.isFinished)
    )
    detailsEl.classList.toggle(
      "account-tx-item--sell-order-error",
      Boolean(atInfo?.hadFatalError)
    )
  } catch (error) {
    if (detailsEl.isConnected) {
      atEl.innerHTML = `
        <div class="account-tx-flow-empty">
          Unable to load AT details for this sell order.
        </div>
      `
      atEl.classList.remove("account-tx-at--loading")
      atEl.dataset.atLoaded = "true"

      const summaryStatusNodes = detailsEl.querySelectorAll(
        "[data-board-tx-at-summary='1'] [data-board-tx-at-status='1']"
      )
      summaryStatusNodes.forEach((statusNode) => {
        statusNode.textContent = "Unavailable"
        statusNode.classList.remove(
          "account-tx-at-chip--status-loading",
          "account-tx-at-chip--status-active",
          "account-tx-at-chip--status-complete",
          "account-tx-at-chip--status-frozen",
          "account-tx-at-chip--status-sleeping",
          "account-tx-at-chip--status-error"
        )
        statusNode.classList.add("account-tx-at-chip--status-unavailable")
      })
    }
  } finally {
    delete atEl.dataset.atLoading
  }
}

const attachBoardAccountTransactionFlowHandlers = (container = document) => {
  const txItems = container.querySelectorAll(".account-tx-item")

  txItems.forEach((detailsEl, index) => {
    const flowProbe = detailsEl.querySelector(
      ".account-tx-flow[data-board-tx-flow='1']"
    )
    const groupProbe = detailsEl.querySelector(
      ".account-tx-group[data-board-tx-group='1']"
    )
    const atProbe = detailsEl.querySelector(
      ".account-tx-at[data-board-tx-at='1']"
    )
    if (!flowProbe && !groupProbe && !atProbe) {
      return
    }

    if (detailsEl.dataset.boardTxFlowBound === "true") {
      if (detailsEl.open) {
        void hydrateBoardAccountTransactionFlow(detailsEl)
        void hydrateBoardAccountTransactionGroup(detailsEl)
        void hydrateBoardAccountTransactionAt(detailsEl)
      }
      return
    }

    detailsEl.dataset.boardTxFlowBound = "true"
    detailsEl.addEventListener("toggle", () => {
      if (!detailsEl.open) {
        return
      }
      void hydrateBoardAccountTransactionFlow(detailsEl)
      void hydrateBoardAccountTransactionGroup(detailsEl)
      void hydrateBoardAccountTransactionAt(detailsEl)
    })

    if (detailsEl.open) {
      void hydrateBoardAccountTransactionFlow(detailsEl)
      void hydrateBoardAccountTransactionGroup(detailsEl)
      void hydrateBoardAccountTransactionAt(detailsEl)
    } else if (atProbe && atProbe.dataset.atScheduled !== "true") {
      atProbe.dataset.atScheduled = "true"
      window.setTimeout(() => {
        if (detailsEl.isConnected) {
          void hydrateBoardAccountTransactionAt(detailsEl)
        }
      }, Math.min(index * 80, 1200))
    }
  })
}

const buildBoardAccountTransactionMetaHtml = (tx = {}) => {
  const atAddressValue =
    String(tx?.type || "").toUpperCase() === "DEPLOY_AT"
      ? getBoardTransactionAtAddressValue(tx)
      : ""
  const metaEntries = [
    ["Type", tx.type],
    ["Timestamp", tx.timestamp ? new Date(tx.timestamp).toLocaleString() : ""],
    ["Name", tx.name],
    ["Identifier", tx.identifier],
    ...(atAddressValue ? [["AT Address", atAddressValue]] : []),
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
              <dd class="account-tx-meta-value">${qEscapeHtml(
                String(value)
              )}</dd>
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
  const atContext = getBoardTransactionAtContext(tx)
  const flowContext = getBoardTransactionFlowContext(tx)
  const flowHtml = flowContext
    ? `
      <div
        class="account-tx-flow account-tx-flow--loading"
        data-board-tx-flow="1"
        data-from-address="${qEscapeAttr(flowContext.fromAddress)}"
        data-to-address="${qEscapeAttr(flowContext.toAddress)}"
        data-amount="${qEscapeAttr(flowContext.amount || "")}"
        data-payment-count="${qEscapeAttr(
          String(flowContext.paymentCount || 0)
        )}"
        data-tx-type="${qEscapeAttr(flowContext.txType || type)}"
      >
        ${getBoardInlineLoadingHTML("Loading linked names...")}
      </div>
    `
    : ""
  const groupContext = getBoardTransactionGroupContext(tx)
  const groupHtml = groupContext
    ? `
      <div
        class="account-tx-group account-tx-group--loading"
        data-board-tx-group="1"
        data-group-id="${qEscapeAttr(groupContext.groupId)}"
        data-action-label="${qEscapeAttr(groupContext.actionLabel || "Group")}"
      >
        ${getBoardInlineLoadingHTML("Loading group details...")}
      </div>
    `
    : ""
  const atHtml = atContext
    ? `
      <div
        class="account-tx-at account-tx-at--loading"
        data-board-tx-at="1"
        data-at-address="${qEscapeAttr(atContext.atAddress || "")}"
        data-market-name="${qEscapeAttr(atContext.marketName || "")}"
        data-amount="${qEscapeAttr(atContext.amount || "")}"
      >
        ${getBoardInlineLoadingHTML("Loading AT details...")}
      </div>
    `
    : ""
  const summaryExtraHtml = atContext
    ? buildBoardTransactionAtSummaryHtml({
        marketName: atContext.marketName,
        amount: atContext.amount,
      })
    : ""

  return `
    <details class="account-tx-item ${
      type === "ARBITRARY" ? "account-tx-item--arbitrary" : ""
    } ${atContext ? "account-tx-item--sell-order" : ""}">
      <summary class="account-tx-summary">
        <div class="account-tx-summary-main">
          <span class="${summaryTypeClass}">${qEscapeHtml(type)}</span>
          <span class="account-tx-summary-time">${qEscapeHtml(timestamp)}</span>
          <span class="account-tx-summary-id" title="${qEscapeAttr(
            identifier
          )}">${qEscapeHtml(identifier)}</span>
        </div>
        ${summaryExtraHtml}
      </summary>
      <div class="account-tx-body">
        ${atHtml}
        ${flowHtml}
        ${groupHtml}
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

const formatBoardAccountBalance = (balance) => {
  const rawBalance = String(balance ?? "").trim()
  if (!rawBalance) {
    return null
  }

  const numericBalance = Number(rawBalance)
  if (!Number.isFinite(numericBalance)) {
    return null
  }

  return numericBalance.toLocaleString(undefined, {
    maximumFractionDigits: 8,
  })
}

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
  const sponsorNames = Array.isArray(sponsorship?.names)
    ? sponsorship.names
    : []
  const txLimit = Number(state.txLimit || 200)
  const transactionCount = Array.isArray(state.transactions)
    ? state.transactions.length
    : 0
  const txTypeSummary = buildBoardAccountTransactionCountsHtml(
    state.transactions
  )
  const txControlsTopHtml = buildBoardAccountTransactionControlsHtml("top")
  const txControlsBottomHtml = buildBoardAccountTransactionControlsHtml("bottom")
  const txEntries = Array.isArray(state.transactions)
    ? state.transactions
        .map((tx, index) => buildBoardAccountTransactionEntryHtml(tx, index))
        .join("")
    : ""
  const formattedBalance = formatBoardAccountBalance(state.balance)
  const balanceDisplayHtml = formattedBalance
    ? `${qEscapeHtml(formattedBalance)} QORT`
    : qEscapeHtml("n/a")

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
        <span class="account-stat-label">Balance</span>
        <span class="account-stat-value">${balanceDisplayHtml}</span>
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
        `Initially loaded transaction count: ${txLimit}. More can be loaded above or below in 200-transaction chunks. Load all history may take a long time depending on how old or active the account is. Please be patient... The ARBITRARY type is highlighted because it is the main QDN publish signal we care about here.`,
        `
          <div id="account-transaction-summary">
            ${txTypeSummary}
          </div>
          ${txControlsTopHtml}
          ${
            transactionCount > 0
              ? `<div id="account-transactions-list" class="account-tx-list">${txEntries}</div>`
              : `<div id="account-transactions-list" class="account-tx-empty">No transactions have been loaded for this account yet.</div>`
          }
          ${txControlsBottomHtml}
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
    buttonEl?.dataset?.accountName || buttonEl?.dataset?.accountIdentity || ""
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
  boardAccountInspectorState.balance = null

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
  const [addressInfo, balance, names, sponsorship, transactions] =
    await Promise.all([
      (typeof getAddressInfoCached === "function"
        ? getAddressInfoCached(resolvedIdentity.address)
        : getAddressInfo(resolvedIdentity.address)
      ).catch(() => null),
      typeof getAddressBalance === "function"
        ? getAddressBalance(resolvedIdentity.address).catch(() => null)
        : Promise.resolve(null),
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
  boardAccountInspectorState.balance = balance || null
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
  boardAccountInspectorState.txLoadingAll = false

  modalContent.innerHTML = buildBoardAccountInspectorHtml()
  attachBoardAccountTransactionFlowHandlers(modalContent)
  modalContent.scrollTop = 0
}

const updateBoardAccountInspectorTransactionSection = () => {
  const summaryEl = document.getElementById("account-transaction-summary")
  const controlRows = document.querySelectorAll(".account-tx-controls")

  if (summaryEl) {
    summaryEl.innerHTML = buildBoardAccountTransactionCountsHtml(
      boardAccountInspectorState.transactions
    )
  }

  const shouldShowControls =
    boardAccountInspectorState.txHasMore ||
    boardAccountInspectorState.txLoadingMore ||
    boardAccountInspectorState.txLoadingAll

  if (!shouldShowControls) {
    controlRows.forEach((row) => row.remove())
    return
  }

  controlRows.forEach((row) => {
    const loadMoreButton = row.querySelector(
      "[data-board-account-tx-action='load-more']"
    )
    const loadAllButton = row.querySelector(
      "[data-board-account-tx-action='load-all']"
    )

    if (loadMoreButton) {
      loadMoreButton.textContent = boardAccountInspectorState.txLoadingAll
        ? "Loading all..."
        : boardAccountInspectorState.txLoadingMore
        ? "Loading more..."
        : "Load more"
      loadMoreButton.disabled = Boolean(
        boardAccountInspectorState.txLoadingMore ||
          boardAccountInspectorState.txLoadingAll ||
          !boardAccountInspectorState.txHasMore
      )
    }

    if (loadAllButton) {
      loadAllButton.textContent = boardAccountInspectorState.txLoadingAll
        ? "Loading all..."
        : "Load all TX"
      loadAllButton.disabled = Boolean(
        boardAccountInspectorState.txLoadingMore ||
          boardAccountInspectorState.txLoadingAll ||
          !boardAccountInspectorState.txHasMore
      )
    }
  })
}

const appendBoardAccountTransactionsPage = (nextPage = []) => {
  const page = Array.isArray(nextPage) ? nextPage : []
  const startIndex = boardAccountInspectorState.transactions.length

  if (page.length > 0) {
    boardAccountInspectorState.transactions = [
      ...boardAccountInspectorState.transactions,
      ...page,
    ]
    const listEl = document.getElementById("account-transactions-list")
    if (listEl) {
      listEl.insertAdjacentHTML(
        "beforeend",
        page
          .map((tx, index) =>
            buildBoardAccountTransactionEntryHtml(tx, startIndex + index)
          )
          .join("")
      )
      attachBoardAccountTransactionFlowHandlers(listEl)
    }
  }

  boardAccountInspectorState.txOffset =
    boardAccountInspectorState.transactions.length
  boardAccountInspectorState.txHasMore =
    page.length === boardAccountInspectorState.txLimit

  updateBoardAccountInspectorTransactionSection()
  return boardAccountInspectorState.txHasMore
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
  boardAccountInspectorState.txLoadingMore = true
  updateBoardAccountInspectorTransactionSection()

  const nextOffset = boardAccountInspectorState.transactions.length
  try {
    const nextPage = await getBoardAccountTransactions(
      boardAccountInspectorState.address,
      nextOffset,
      boardAccountInspectorState.txLimit
    )

    if (requestId !== boardAccountInspectorState.requestId) {
      return
    }

    appendBoardAccountTransactionsPage(nextPage)
  } finally {
    if (requestId === boardAccountInspectorState.requestId) {
      boardAccountInspectorState.txLoadingMore = false
      updateBoardAccountInspectorTransactionSection()
    }
  }
}

const loadAllBoardAccountTransactions = async () => {
  if (
    boardAccountInspectorState.txLoadingMore ||
    boardAccountInspectorState.txLoadingAll ||
    !boardAccountInspectorState.txHasMore ||
    !boardAccountInspectorState.address
  ) {
    return
  }

  const shouldContinue =
    typeof window === "undefined" || typeof window.confirm !== "function"
      ? true
      : window.confirm(BOARD_ACCOUNT_TX_LOAD_ALL_WARNING)
  if (!shouldContinue) {
    return
  }

  const requestId = boardAccountInspectorState.requestId
  boardAccountInspectorState.txLoadingAll = true
  updateBoardAccountInspectorTransactionSection()

  try {
    while (
      boardAccountInspectorState.txHasMore &&
      requestId === boardAccountInspectorState.requestId
    ) {
      const nextOffset = boardAccountInspectorState.transactions.length
      const nextPage = await getBoardAccountTransactions(
        boardAccountInspectorState.address,
        nextOffset,
        boardAccountInspectorState.txLimit
      )

      if (requestId !== boardAccountInspectorState.requestId) {
        return
      }

      const moreToLoad = appendBoardAccountTransactionsPage(nextPage)
      if (!moreToLoad) {
        break
      }
    }
  } finally {
    if (requestId === boardAccountInspectorState.requestId) {
      boardAccountInspectorState.txLoadingAll = false
      updateBoardAccountInspectorTransactionSection()
    }
  }
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

const scrollBoardCommentIntoView = async (
  cardIdentifier,
  commentIdentifier
) => {
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

const BOARD_PUBLISH_PROGRESS_MODAL_ID = "publish-progress-modal"
const boardPublishProgressState = {
  title: "",
  subtitle: "",
  message: "",
  steps: [],
}

const normalizeBoardPublishProgressSteps = (steps = []) =>
  Array.isArray(steps)
    ? steps.map((step, index) => {
        const normalizedStatus = String(step?.status || "pending").toLowerCase()
        const status = ["pending", "active", "done", "error"].includes(
          normalizedStatus
        )
          ? normalizedStatus
          : "pending"

        return {
          key: String(step?.key || `step-${index}`),
          label: String(step?.label || `Step ${index + 1}`),
          detail: String(step?.detail || ""),
          status,
        }
      })
    : []

const setBoardPublishProgressStepStatus = (
  steps = [],
  stepKey = "",
  status = "pending",
  detail = null
) => {
  const normalizedStatus = ["pending", "active", "done", "error"].includes(
    String(status || "").toLowerCase()
  )
    ? String(status || "").toLowerCase()
    : "pending"
  const normalizedKey = String(stepKey || "").trim()

  return normalizeBoardPublishProgressSteps(steps).map((step) => {
    if (step.key !== normalizedKey) {
      return step
    }

    const nextStep = {
      ...step,
      status: normalizedStatus,
    }

    if (detail !== null && typeof detail !== "undefined") {
      nextStep.detail = String(detail)
    }

    return nextStep
  })
}

const buildBoardPublishProgressStepHtml = (step = {}, index = 0) => {
  const status = ["pending", "active", "done", "error"].includes(step.status)
    ? step.status
    : "pending"
  const indicator =
    status === "done" ? "✓" : status === "error" ? "!" : String(index + 1)
  const statusLabel =
    status === "done"
      ? "Complete"
      : status === "active"
      ? "Working"
      : status === "error"
      ? "Stopped"
      : "Waiting"
  const spinnerHtml =
    status === "active"
      ? `<span class="board-loading-inline publish-progress-step-spinner" role="status" aria-live="polite" aria-busy="true"><span class="board-loading-spinner board-loading-spinner-inline" aria-hidden="true"></span><span>Working...</span></span>`
      : ""

  return `
    <div class="publish-progress-step publish-progress-step--${qEscapeAttr(
      status
    )}" data-step-key="${qEscapeAttr(step.key || `step-${index}`)}">
      <span class="publish-progress-step-indicator" aria-hidden="true">${qEscapeHtml(
        indicator
      )}</span>
      <div class="publish-progress-step-copy">
        <span class="publish-progress-step-label">${qEscapeHtml(
          step.label || `Step ${index + 1}`
        )}</span>
        ${
          step.detail
            ? `<span class="publish-progress-step-detail">${qEscapeHtml(
                step.detail
              )}</span>`
            : ""
        }
      </div>
      <div class="publish-progress-step-status-wrap">
        <span class="publish-progress-step-status">${qEscapeHtml(
          statusLabel
        )}</span>
        ${spinnerHtml}
      </div>
    </div>
  `
}

const ensureBoardPublishProgressModal = () => {
  if (document.getElementById(BOARD_PUBLISH_PROGRESS_MODAL_ID)) {
    return
  }

  const modalHTML = `
    <div id="${BOARD_PUBLISH_PROGRESS_MODAL_ID}" class="publish-progress-modal" style="display: none;">
      <div class="publish-progress-modal-container">
        <div id="publish-progress-modalContent"></div>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML("beforeend", modalHTML)
}

const buildBoardPublishProgressModalHtml = () => {
  const title = boardPublishProgressState.title || "Publishing..."
  const subtitle = boardPublishProgressState.subtitle || ""
  const message = boardPublishProgressState.message || ""
  const steps = normalizeBoardPublishProgressSteps(
    boardPublishProgressState.steps
  )

  return `
    <div class="publish-progress-modal-shell">
      <div class="publish-progress-modal-header">
        <div>
          <p class="publish-progress-modal-kicker">Publishing</p>
          <h2 class="publish-progress-modal-title">${qEscapeHtml(title)}</h2>
          ${
            subtitle
              ? `<p class="publish-progress-modal-subtitle">${qEscapeHtml(
                  subtitle
                )}</p>`
              : ""
          }
        </div>
        <span class="publish-progress-modal-badge">Please wait</span>
      </div>
      ${
        message
          ? `<p class="publish-progress-modal-message">${qEscapeHtml(
              message
            )}</p>`
          : ""
      }
      <div class="publish-progress-step-list" role="list">
        ${steps
          .map((step, index) => buildBoardPublishProgressStepHtml(step, index))
          .join("")}
      </div>
      <div class="publish-progress-modal-footer">
        ${getBoardInlineLoadingHTML("Working through the publish checks...")}
        <p class="publish-progress-modal-footer-note">
          Please do not click Publish again while this is running.
        </p>
      </div>
    </div>
  `
}

const showBoardPublishProgressModal = (options = {}) => {
  ensureBoardPublishProgressModal()

  const modal = document.getElementById(BOARD_PUBLISH_PROGRESS_MODAL_ID)
  const modalContent = document.getElementById("publish-progress-modalContent")
  if (!modal || !modalContent) {
    return
  }

  boardPublishProgressState.title = String(options.title || "")
  boardPublishProgressState.subtitle = String(options.subtitle || "")
  boardPublishProgressState.message = String(options.message || "")
  boardPublishProgressState.steps = normalizeBoardPublishProgressSteps(
    options.steps || []
  )

  modalContent.innerHTML = buildBoardPublishProgressModalHtml()
  modal.style.display = "block"
}

const updateBoardPublishProgressModal = (options = {}) => {
  if (typeof options.title !== "undefined") {
    boardPublishProgressState.title = String(options.title || "")
  }
  if (typeof options.subtitle !== "undefined") {
    boardPublishProgressState.subtitle = String(options.subtitle || "")
  }
  if (typeof options.message !== "undefined") {
    boardPublishProgressState.message = String(options.message || "")
  }
  if (typeof options.steps !== "undefined") {
    boardPublishProgressState.steps = normalizeBoardPublishProgressSteps(
      options.steps || []
    )
  }

  const modal = document.getElementById(BOARD_PUBLISH_PROGRESS_MODAL_ID)
  const modalContent = document.getElementById("publish-progress-modalContent")
  if (!modal || !modalContent) {
    return
  }

  modalContent.innerHTML = buildBoardPublishProgressModalHtml()
  modal.style.display = "block"
}

const closeBoardPublishProgressModal = () => {
  const modal = document.getElementById(BOARD_PUBLISH_PROGRESS_MODAL_ID)
  const modalContent = document.getElementById("publish-progress-modalContent")
  if (modal) {
    modal.style.display = "none"
  }
  if (modalContent) {
    modalContent.innerHTML = ""
  }
  boardPublishProgressState.title = ""
  boardPublishProgressState.subtitle = ""
  boardPublishProgressState.message = ""
  boardPublishProgressState.steps = []
}

const qBoardDelay = (ms = 0) =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

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

const KICK_BAN_TX_CACHE_TTL_MS = 60000
const kickBanTxCache = {
  timestamp: 0,
  data: null,
}

const getEmptyKickBanTxData = () => ({
  finalKickTxs: [],
  pendingKickTxs: [],
  finalBanTxs: [],
  pendingBanTxs: [],
})

// Function for obtaining all kick/ban transaction data, and separating it into PENDING and NON.
const fetchAllKickBanTxData = async (force = false) => {
  const now = Date.now()
  const isStale = now - kickBanTxCache.timestamp > KICK_BAN_TX_CACHE_TTL_MS
  if (!force && kickBanTxCache.data && !isStale) {
    return kickBanTxCache.data
  }

  const kickTxType = "GROUP_KICK"
  const banTxType = "GROUP_BAN"

  let allKickTx = []
  let allBanTx = []

  try {
    allKickTx = await searchTransactions({
      txTypes: [kickTxType],
      confirmationStatus: "CONFIRMED",
      limit: 0,
      reverse: true,
      offset: 0,
      startBlock: 1990000,
      blockLimit: 0,
      txGroupId: 0,
      silent: true,
    })
  } catch (error) {
    console.warn("Unable to fetch kick transactions:", error)
  }

  try {
    allBanTx = await searchTransactions({
      txTypes: [banTxType],
      confirmationStatus: "CONFIRMED",
      limit: 0,
      reverse: true,
      offset: 0,
      startBlock: 1990000,
      blockLimit: 0,
      txGroupId: 0,
      silent: true,
    })
  } catch (error) {
    console.warn("Unable to fetch ban transactions:", error)
  }

  const { finalTx: finalKickTxs, pendingTx: pendingKickTxs } =
    partitionTransactions(Array.isArray(allKickTx) ? allKickTx : [])
  const { finalTx: finalBanTxs, pendingTx: pendingBanTxs } =
    partitionTransactions(Array.isArray(allBanTx) ? allBanTx : [])

  // We are going to keep all transactions in order to filter more accurately for display purposes.
  console.log("Final kickTxs:", finalKickTxs)
  console.log("Pending kickTxs:", pendingKickTxs)
  console.log("Final banTxs:", finalBanTxs)
  console.log("Pending banTxs:", pendingBanTxs)

  const kickBanTxData = {
    finalKickTxs,
    pendingKickTxs,
    finalBanTxs,
    pendingBanTxs,
  }

  kickBanTxCache.timestamp = now
  kickBanTxCache.data = kickBanTxData
  return kickBanTxData
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

const INVITE_TX_CACHE_TTL_MS = 60000
const inviteTxCache = {
  timestamp: 0,
  data: null,
}

const getEmptyInviteTxData = () => ({
  finalInviteTxs: [],
  pendingInviteTxs: [],
})

const fetchAllInviteTransactions = async (force = false) => {
  const now = Date.now()
  const isStale = now - inviteTxCache.timestamp > INVITE_TX_CACHE_TTL_MS
  if (!force && inviteTxCache.data && !isStale) {
    return inviteTxCache.data
  }

  const inviteTxType = "GROUP_INVITE"

  let allInviteTx = []
  try {
    allInviteTx = await searchTransactions({
      txTypes: [inviteTxType],
      confirmationStatus: "CONFIRMED",
      limit: 0,
      reverse: true,
      offset: 0,
      startBlock: 1990000,
      blockLimit: 0,
      txGroupId: 0,
      silent: true,
    })
  } catch (error) {
    console.warn("Unable to fetch invite transactions:", error)
  }

  const { finalTx: finalInviteTxs, pendingTx: pendingInviteTxs } =
    partitionTransactions(Array.isArray(allInviteTx) ? allInviteTx : [])

  console.log("Final InviteTxs:", finalInviteTxs)
  console.log("Pending InviteTxs:", pendingInviteTxs)

  const inviteTxData = {
    finalInviteTxs,
    pendingInviteTxs,
  }

  inviteTxCache.timestamp = now
  inviteTxCache.data = inviteTxData
  return inviteTxData
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
