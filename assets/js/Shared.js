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
  ["*", new Set(["class"])],
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
          allowedForTag.has(attrName) || allowedGlobal.has(attrName)
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
