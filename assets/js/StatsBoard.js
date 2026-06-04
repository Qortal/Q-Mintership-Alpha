const MINTER_STATS_IDENTIFIER_PREFIX = "Mintership-stats"
const MINTER_STATS_PROGRESS_IDENTIFIER_PREFIX = "Mintership-stats-progress"
const STATS_SNAPSHOT_CACHE_TTL_MS = 120000
const STATS_BOARD_SYNC_CACHE_TTL_MS = 30000
const STATS_GROUP_CACHE_TTL_MS = 120000
const STATS_LIVE_CACHE_TTL_MS = 30000
const STATS_COMPILE_BATCH_SIZE = 30
const NOMINATOR_METHOD_START_TS = Date.parse("2026-06-01T00:00:00Z")
const STATS_LEGACY_CLASSIFICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const STATS_FOUNDER_EFFECTIVE_LEVEL = 10
const STATS_COMPILE_MODAL_TYPE = "stats-compile"

const statsBoardState = {
  snapshotResources: [],
  latestSnapshot: null,
  latestSourceResource: null,
  latestProgressCheckpoint: null,
  latestValidationReport: null,
  latestGroupData: null,
  latestLiveMintingData: null,
  lastLoadedAt: 0,
  latestSourceLoadedAt: 0,
  latestProgressLoadedAt: 0,
  latestGroupLoadedAt: 0,
  latestLiveMintingLoadedAt: 0,
  compiling: false,
  pauseRequested: false,
}

const statsCompileModalState = {
  phase: "options",
  workflow: "compile",
  hidden: false,
  timestampMode: "now",
  customTimestampInput: "",
  snapshotTimestamp: Date.now(),
  identifierPreview: "",
  message: "",
  subtitle: "",
  steps: [],
  errorMessage: "",
  validationReport: null,
}

if (typeof window !== "undefined") {
  window.getStatsCompileModalState = () => ({
    compiling: Boolean(statsBoardState.compiling),
    pauseRequested: Boolean(statsBoardState.pauseRequested),
    phase: String(statsCompileModalState.phase || "options"),
    workflow: String(statsCompileModalState.workflow || "compile"),
    hidden: Boolean(statsCompileModalState.hidden),
  })
}

const getStatsBoardTimestamp = (resource = {}) =>
  Number(resource?.updated || resource?.created || 0)

const getStatsSnapshotSourceTimestamp = (snapshot = null) =>
  Number(
    snapshot?.source?.latestCardTimestamp ||
      snapshot?.source?.latestSourceTimestamp ||
      snapshot?.compiledAt ||
      snapshot?.generatedAt ||
      0
  )

const getStatsLatestPublishedTimestamp = () => {
  const latestSnapshotTimestamp = Number(
    statsBoardState.latestSnapshot?.generatedAt || 0
  )
  if (latestSnapshotTimestamp > 0) {
    return latestSnapshotTimestamp
  }

  const latestCheckpointTimestamp = Number(
    statsBoardState.latestProgressCheckpoint?.snapshotTimestamp ||
      statsBoardState.latestProgressCheckpoint?.generatedAt ||
      0
  )
  return latestCheckpointTimestamp > 0 ? latestCheckpointTimestamp : 0
}

const getStatsCompileProgressIdentifier = (snapshotTimestamp = Date.now()) =>
  `${MINTER_STATS_PROGRESS_IDENTIFIER_PREFIX}-${snapshotTimestamp}`

const normalizeStatsSourceResource = (resource = {}) => ({
  name: String(resource?.name || "").trim(),
  identifier: String(resource?.identifier || "").trim(),
  created: Number(resource?.created || 0),
  updated: Number(resource?.updated || 0),
})

const normalizeStatsCompileStepDetail = (detail = "") =>
  String(detail || "").trim()

const formatStatsDate = (timestamp = 0) => {
  if (!timestamp) return "Unavailable"
  try {
    return new Date(timestamp).toLocaleString()
  } catch (error) {
    return "Unavailable"
  }
}

const formatStatsPercent = (value = 0) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0%"
  }
  return `${Math.round(numeric * 1000) / 10}%`
}

const getStatsResumeCheckpointSummary = (checkpoint = null) => {
  if (!checkpoint) {
    return null
  }

  const processed = Math.max(0, Number(checkpoint.nextIndex || 0))
  const total = Math.max(
    processed,
    Number(
      checkpoint?.source?.cardCount ||
        checkpoint?.source?.resources?.length ||
        0
    )
  )
  const remaining = Math.max(total - processed, 0)

  return {
    checkpointIdentifier: String(checkpoint?.progressIdentifier || "").trim(),
    processed,
    total,
    remaining,
    nextCardNumber: total > 0 ? Math.min(processed + 1, total) : processed + 1,
  }
}

const normalizeStatsSectionKey = (value = "") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "")

  if (!normalized) {
    return "live"
  }

  const sectionAliases = {
    live: "live",
    liveminting: "live",
    "live-minting": "live",
    livestats: "live",
    livelevels: "live",
    "live-levels": "live",
    historic: "historic",
    history: "historic",
    historical: "historic",
    historicdata: "historic",
    "historic-data": "historic",
    historicmintershipdata: "historic",
    "historic-mintership-data": "historic",
    publish: "publish",
    "publish-data": "publish",
    publishdata: "publish",
    publishstats: "publish",
    publisheddata: "publish",
    publishedstats: "publish",
    "published-data": "publish",
    publishedsnapshot: "publish",
    "published-snapshot": "publish",
    "publish-snapshot": "publish",
    "publish-stats": "publish",
    snapshot: "publish",
    nominator: "nominator",
    nominators: "nominator",
    nominatorsstats: "nominator",
    nominatorsleaderboard: "nominator-leaderboard",
    nominatorstats: "nominator",
    nominatorsstat: "nominator",
    nominatorleaderboard: "nominator-leaderboard",
    nominatorleaderboards: "nominator-leaderboard",
    legacy: "legacy",
    legacystats: "legacy",
    legacyleaderboard: "legacy-leaderboard",
    legacyleaderboards: "legacy-leaderboard",
    admin: "admin",
    minteradmin: "admin",
    minteradminstats: "admin",
    minteradminleaderboard: "admin-leaderboard",
    minteradminleaderboards: "admin-leaderboard",
    minterleaderboard: "nominator-leaderboard",
    minterleaderboards: "nominator-leaderboard",
    nominatorleaderboardview: "nominator-leaderboard",
  }

  return sectionAliases[normalized] || normalized
}

const getStatsSectionTargetId = (section = "") => {
  switch (normalizeStatsSectionKey(section)) {
    case "live":
      return "stats-section-live"
    case "historic":
      return "stats-section-historic"
    case "publish":
      return "stats-section-publish"
    case "legacy":
      return "stats-section-legacy"
    case "legacy-leaderboard":
      return "stats-legacy-leaderboard"
    case "admin":
      return "stats-section-admin"
    case "admin-leaderboard":
      return "stats-admin-leaderboard"
    case "nominator-leaderboard":
      return "stats-nominator-leaderboard"
    case "nominator":
      return "stats-section-nominator"
    case "live":
    default:
      return "stats-section-live"
  }
}

const getStatsSectionLinks = () =>
  Array.from(document.querySelectorAll("[data-stats-section-link]"))

const setStatsBoardSectionActiveState = (section = "") => {
  const normalizedSection = normalizeStatsSectionKey(section)
  getStatsSectionLinks().forEach((link) => {
    const linkSection = normalizeStatsSectionKey(
      link.getAttribute("data-stats-section-link") || ""
    )
    if (linkSection === normalizedSection) {
      link.classList.add("stats-section-nav-link--active")
      link.setAttribute("aria-current", "page")
    } else {
      link.classList.remove("stats-section-nav-link--active")
      link.removeAttribute("aria-current")
    }
  })
}

const focusStatsBoardSection = async (
  section = "",
  { behavior = "smooth" } = {}
) => {
  const normalizedSection = normalizeStatsSectionKey(section)
  setStatsBoardSectionActiveState(normalizedSection)

  const targetId = getStatsSectionTargetId(normalizedSection)
  const target = document.getElementById(targetId)
  if (!target) {
    return null
  }

  try {
    target.scrollIntoView({ behavior, block: "start" })
  } catch (error) {
    target.scrollIntoView()
  }

  return target
}

const hasStatsBoardNominationPublishFields = (cardData = {}) =>
  Boolean(cardData?.nominator || cardData?.nominatorAddress)

const classifyStatsBoardEra = (resource = {}, cardData = null) => {
  const createdAt = Number(resource?.created || resource?.updated || 0)
  const legacyWindowStart =
    NOMINATOR_METHOD_START_TS - STATS_LEGACY_CLASSIFICATION_WINDOW_MS
  const legacyWindowEnd =
    NOMINATOR_METHOD_START_TS + STATS_LEGACY_CLASSIFICATION_WINDOW_MS

  if (createdAt > 0 && createdAt < legacyWindowStart) {
    return {
      createdAt,
      isLegacy: true,
      classificationSource: "timestamp",
    }
  }

  if (createdAt > 0 && createdAt > legacyWindowEnd) {
    return {
      createdAt,
      isLegacy: false,
      classificationSource: "timestamp",
    }
  }

  const hasNominationPublishFields =
    hasStatsBoardNominationPublishFields(cardData)
  return {
    createdAt,
    isLegacy: !hasNominationPublishFields,
    classificationSource: hasNominationPublishFields
      ? "publish-payload"
      : "publish-payload-legacy",
  }
}

const getStatsBoardCanPublish = () =>
  Boolean(userState.isAdmin || userState.isMinterAdmin)

const getStatsBoardRoot = () => document.querySelector(".stats-board-main")

const getStatsBoardContentRoot = () =>
  document.getElementById("stats-board-content")

const getStatsSnapshotContainer = () =>
  document.getElementById("stats-snapshot-container")

const getStatsStatusEl = () => document.getElementById("stats-status")

const getStatsSummaryGrid = () => document.getElementById("stats-summary-grid")

const getStatsLeaderboardContainer = () =>
  document.getElementById("stats-leaderboard-container")

const getStatsSnapshotMetaContainer = () =>
  document.getElementById("stats-snapshot-meta")

const getStatsHistoryContainer = () =>
  document.getElementById("stats-history-container")

const getStatsSyncBannerEl = () =>
  document.getElementById("stats-sync-banner")

const getStatsCompileModalContent = () =>
  document.getElementById("stats-compile-modalContent")

const getStatsCompileTimestampModeEl = () =>
  document.getElementById("stats-compile-timestamp-mode")

const getStatsCompileCustomTimestampEl = () =>
  document.getElementById("stats-compile-custom-timestamp")

const getStatsCompileIdentifierPreviewEl = () =>
  document.getElementById("stats-compile-identifier-preview")

const getStatsCompileStatusEl = () =>
  document.getElementById("stats-compile-status")

const getStatsCompileNoteEl = () =>
  document.getElementById("stats-compile-note")

const formatStatsTimestampInputValue = (timestamp = Date.now()) => {
  try {
    const date = new Date(timestamp)
    const offsetMs = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
  } catch (error) {
    return ""
  }
}

const resolveStatsCompileTimestamp = () => {
  const mode = String(
    getStatsCompileTimestampModeEl()?.value || statsCompileModalState.timestampMode || "now"
  ).trim()
  const customValue = String(
    getStatsCompileCustomTimestampEl()?.value ||
      statsCompileModalState.customTimestampInput ||
      ""
  ).trim()

  if (mode === "custom") {
    const parsedCustomTimestamp = Date.parse(customValue)
    return Number.isFinite(parsedCustomTimestamp)
      ? parsedCustomTimestamp
      : Date.now()
  }

  if (mode === "latest") {
    return getStatsLatestPublishedTimestamp() || Date.now()
  }

  if (mode === "minus-1-day") {
    return Date.now() - 24 * 60 * 60 * 1000
  }

  if (mode === "minus-6-hours") {
    return Date.now() - 6 * 60 * 60 * 1000
  }

  if (mode === "minus-1-week") {
    return Date.now() - 7 * 24 * 60 * 60 * 1000
  }

  return Date.now()
}

const buildStatsCompileSteps = (workflow = "compile") => {
  const normalizedWorkflow = String(workflow || "compile").trim().toLowerCase()
  const isValidation = normalizedWorkflow === "validation"

  if (isValidation) {
    return [
      {
        key: "load-source",
        label: "Load source cards",
        detail: "Pulling the published MinterBoard cards and cached metadata.",
        substeps: [
          "Fetch the published card archive from QDN.",
          "Deduplicate records so each card is only counted once.",
          "Prime the validation run with cached card metadata.",
        ],
        status: "active",
      },
      {
        key: "classify-era",
        label: "Separate legacy cards",
        detail:
          "Cards before June 1, 2026 are legacy by default. Near the cutover, the publish payload decides.",
        substeps: [
          "Resolve each card's published timestamp.",
          "Treat pre-June 2026 cards as legacy without any invite lookups.",
          "Inspect only the cutover-window payloads for nominator markers.",
        ],
        status: "pending",
      },
      {
        key: "aggregate",
        label: "Audit source coverage",
        detail: "Checking for missing fields and cards that could not be compiled.",
        substeps: [
          "Verify each card has the data needed for stats classification.",
          "Track records that failed validation so they can be reviewed.",
          "Summarize the cards that can and cannot support the stats views.",
        ],
        status: "pending",
      },
      {
        key: "publish",
        label: "Verify published stats data",
        detail:
          "Confirming the latest snapshot and checkpoint were published by an admin account.",
        substeps: [
          "Load the latest stats snapshot history.",
          "Ignore non-admin published stats resources.",
          "Confirm the latest checkpoint author before reporting results.",
        ],
        status: "pending",
      },
      {
        key: "refresh",
        label: "Summarize findings",
        detail: "Presenting the validation report without publishing anything new.",
        substeps: [
          "Compile the audit summary.",
          "Surface any issue counts and ignored resources.",
          "Leave the dashboard data untouched.",
        ],
        status: "pending",
      },
    ]
  }

  return [
  {
    key: "load-source",
    label: "Load source cards",
    detail: "Pulling the published MinterBoard cards and cached metadata.",
    substeps: [
      "Fetch the published card archive from QDN.",
      "Deduplicate records so each card is only counted once.",
      "Prime the compile run with cached card metadata.",
    ],
    status: "active",
  },
  {
    key: "classify-era",
    label: "Separate legacy cards",
    detail:
      "Cards before June 1, 2026 are legacy by default. Near the cutover, the publish payload decides.",
    substeps: [
      "Resolve each card's published timestamp.",
      "Treat pre-June 2026 cards as legacy without any invite lookups.",
      "Inspect only the cutover-window payloads for nominator markers.",
    ],
    status: "pending",
  },
  {
    key: "aggregate",
    label: "Aggregate leaderboard data",
    detail: "Counting nominator-era rows and preparing legacy/admin rollups.",
    substeps: [
      "Group nominations by nominator.",
      "Track legacy, admin, and current-era publisher totals.",
      "Sort rows by submissions, conversions, and recency.",
    ],
    status: "pending",
  },
  {
    key: "publish",
    label: "Update data objects",
    detail: "Writing the final stats snapshot and resumable checkpoint to QDN.",
    substeps: [
      "Serialize the final snapshot object.",
      "Serialize the resumable checkpoint object.",
      "Publish both together with one multi-resource QDN request.",
    ],
    status: "pending",
  },
  {
    key: "refresh",
    label: "Refresh dashboard",
    detail: "Reloading the Stats page so the new snapshot is visible.",
    substeps: [
      "Clear cached snapshot state.",
      "Fetch the latest published snapshot.",
      "Rerender the dashboard panels and history.",
    ],
    status: "pending",
  },
]
}

const getStatsCompileActiveStep = (steps = []) => {
  const normalizedSteps = Array.isArray(steps) ? steps : []
  return (
    normalizedSteps.find((step) => step?.status === "active") ||
    normalizedSteps.find((step) => step?.status === "error") ||
    normalizedSteps.find((step) => step?.status === "done") ||
    normalizedSteps[0] ||
    null
  )
}

const buildStatsCompileWorkflowBannerState = () => {
  const phase = String(statsCompileModalState.phase || "options")
  const workflow = String(statsCompileModalState.workflow || "compile")
  const isValidation = workflow === "validation"
  const isRecreate = workflow === "recreate"
  const steps = Array.isArray(statsCompileModalState.steps)
    ? statsCompileModalState.steps
    : []
  const activeStep = getStatsCompileActiveStep(steps)
  const completedSteps = steps.filter(
    (step) => step?.status === "done" || step?.status === "error"
  ).length
  const totalSteps = steps.length
  const isHidden = Boolean(statsCompileModalState.hidden)
  const currentStatusLine = activeStep
    ? `${activeStep.label || "Stats workflow"}${
        activeStep.detail ? ` - ${activeStep.detail}` : ""
      }`
    : statsCompileModalState.message ||
      (isValidation
        ? "Validating stats data..."
        : isRecreate
        ? "Re-creating stats data..."
        : "Updating stats snapshot...")

  const meta = []
  if (totalSteps > 0) {
    const visibleStepIndex = Math.min(
      totalSteps,
      Math.max(
        1,
        completedSteps + (phase === "progress" && activeStep ? 1 : 0)
      )
    )
    meta.push(`Step ${visibleStepIndex}/${totalSteps}`)
  }
  if (phase === "progress") {
    meta.push(
      isValidation
        ? "Validation runs read-only"
        : "Update batches remain resumable"
    )
  }
  if (phase === "paused") {
    meta.push(
      `Checkpoint: ${statsBoardState.latestProgressCheckpoint?.progressIdentifier || "Unavailable"}`
    )
  }
  if (statsCompileModalState.subtitle) {
    meta.push(statsCompileModalState.subtitle)
  }

  let primaryAction = ""
  if (phase === "progress" && !isValidation) {
    primaryAction = `
      <button type="button" class="stats-action-button stats-action-button--primary" onclick="requestStatsCompilePause()">
        Pause after current batch
      </button>
    `
  } else if (phase === "paused") {
    primaryAction = `
      <button type="button" class="stats-action-button stats-action-button--primary" onclick="continuePreviousStatsCompilation()">
        Resume update
      </button>
    `
  } else if (phase === "complete" && !isValidation) {
    primaryAction = `
      <button type="button" class="stats-action-button stats-action-button--primary" onclick="refreshStatsBoardView({ force: true })">
        Refresh board
      </button>
    `
  } else if (phase === "complete" && isValidation) {
    primaryAction = `
      <button type="button" class="stats-action-button stats-action-button--primary" onclick="recreateStatsDataFromModal()">
        Re-create stats data
      </button>
    `
  }

  const secondaryAction = `
    <button type="button" class="stats-action-button" onclick="${isHidden ? "showStatsCompileProgressModal()" : "closeStatsCompileModal()"}">
      ${isHidden ? "Show window" : "Hide window"}
    </button>
  `

  return {
    tone:
      phase === "error"
        ? "stale"
        : phase === "paused" || phase === "progress"
        ? "progress"
        : "current",
    kicker: isValidation
      ? "Validation"
      : isRecreate
      ? "Re-create"
      : "Updating",
    title:
      phase === "complete"
        ? isValidation
          ? "Stats validation complete"
          : isRecreate
          ? "Stats data re-created"
          : "Stats snapshot updated"
        : phase === "paused"
        ? "Stats update saved"
        : phase === "error"
        ? isValidation
          ? "Stats validation stopped"
          : "Stats update stopped"
        : activeStep?.label ||
          (isValidation
            ? "Validating stats data"
            : isRecreate
            ? "Re-creating stats data"
            : "Updating stats snapshot"),
    message:
      statsCompileModalState.message ||
      activeStep?.detail ||
      (isValidation
        ? "Working through the validation checks."
        : "Working through the snapshot update and publish steps."),
    meta,
    currentStatusLine,
    primaryAction,
    secondaryAction,
  }
}

const buildStatsCompileWorkflowBannerHtml = (state = {}) => {
  const meta = Array.isArray(state.meta) ? state.meta : []

  return `
    <section class="stats-sync-banner stats-sync-banner--${qEscapeAttr(
      state.tone || "progress"
    )}">
      <div class="stats-sync-banner-copy">
        <p class="stats-sync-banner-kicker">${qEscapeHtml(
          state.kicker || "Updating"
        )}</p>
        <h3 class="stats-sync-banner-title">${qEscapeHtml(
          state.title || "Stats workflow"
        )}</h3>
        <p class="stats-sync-banner-text">${qEscapeHtml(
          state.message || ""
        )}</p>
        ${
          meta.length > 0
            ? `
              <div class="stats-sync-banner-meta">
                ${meta
                  .map((item) => `<span>${qEscapeHtml(String(item || ""))}</span>`)
                  .join("")}
              </div>
            `
            : ""
        }
      </div>
      <div class="stats-sync-banner-actions">
        ${state.primaryAction || ""}
        ${state.secondaryAction || ""}
      </div>
    </section>
  `
}

const renderStatsCompileWorkflowBanner = () => {
  const bannerEl = getStatsSyncBannerEl()
  const statusEl = getStatsStatusEl()
  if (!bannerEl || !statusEl) {
    return
  }

  const phase = String(statsCompileModalState.phase || "options")
  if (
    !statsBoardState.compiling &&
    phase !== "paused" &&
    phase !== "progress" &&
    phase !== "error"
  ) {
    return
  }

  const state = buildStatsCompileWorkflowBannerState()
  bannerEl.innerHTML = buildStatsCompileWorkflowBannerHtml(state)
  bannerEl.hidden = false
  statusEl.textContent = state.currentStatusLine || state.message || ""
}

const buildStatsMetricCardHtml = (label, value, note = "") => `
  <article class="stats-metric-card">
    <p class="stats-metric-label">${qEscapeHtml(label)}</p>
    <div class="stats-metric-value">${qEscapeHtml(String(value))}</div>
    ${
      note
        ? `<p class="stats-metric-note">${qEscapeHtml(note)}</p>`
        : ""
    }
  </article>
`

const buildStatsLeaderboardTableHtml = (rows = [], { legacyCardCount = 0 } = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `
      <div class="stats-empty-state">
        ${
          Number(legacyCardCount || 0) > 0
            ? "No nominator-era records were found in the latest snapshot. Legacy cards are summarized separately below."
            : "No nominators were found in the latest snapshot."
        }
      </div>
    `
  }

  return `
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th>Nominator</th>
            <th>Nominations</th>
            <th>Converted</th>
            <th>Approved</th>
            <th>Pending</th>
            <th>Kicked</th>
            <th>Banned</th>
            <th>Conversion</th>
            <th>Last Nomination</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>
                    <div class="stats-table-primary">${qEscapeHtml(
                      row.displayName || "Unknown"
                    )}</div>
                    <div class="stats-table-secondary">${qEscapeHtml(
                      row.address || "Address unavailable"
                    )}</div>
                  </td>
                  <td>${qEscapeHtml(String(row.nominationCount || 0))}</td>
                  <td>${qEscapeHtml(String(row.convertedCount || 0))}</td>
                  <td>${qEscapeHtml(String(row.approvedCount || 0))}</td>
                  <td>${qEscapeHtml(String(row.pendingCount || 0))}</td>
                  <td>${qEscapeHtml(String(row.kickedCount || 0))}</td>
                  <td>${qEscapeHtml(String(row.bannedCount || 0))}</td>
                  <td>${qEscapeHtml(String(row.conversionLabel || "0%"))}</td>
                  <td>${qEscapeHtml(formatStatsDate(row.lastNominationAt || 0))}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
}

const buildStatsFlexibleTableHtml = ({
  rows = [],
  emptyText = "No data found.",
  headers = [],
  rowRenderer = null,
} = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `
      <div class="stats-empty-state">${qEscapeHtml(emptyText)}</div>
    `
  }

  return `
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            ${headers
              .map((header) => `<th>${qEscapeHtml(String(header || ""))}</th>`)
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row, index) =>
              typeof rowRenderer === "function"
                ? rowRenderer(row, index)
                : ""
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
}

const buildStatsPublisherRows = (
  records = [],
  { adminAddressSet = new Set() } = {}
) => {
  const rowsByKey = new Map()
  const summary = {
    totalCards: 0,
    legacyCards: 0,
    currentCards: 0,
    invitedCount: 0,
    pendingCount: 0,
    currentMinterCount: 0,
    kickedCount: 0,
    bannedCount: 0,
    legacyInvitedCount: 0,
    legacyPendingCount: 0,
    legacyCurrentMinterCount: 0,
    legacyKickedCount: 0,
    legacyBannedCount: 0,
    adminCards: 0,
  }

  for (const record of Array.isArray(records) ? records : []) {
    const isLegacy = Boolean(record?.isLegacy)
    const isApprovedInvite = Boolean(record?.isApprovedInvite)
    const isPendingInvite = Boolean(record?.isPendingInvite)
    const isConverted = Boolean(record?.isConverted)
    const isKicked = Boolean(record?.isKicked)
    const isBanned = Boolean(record?.isBanned)
    const publisherName = String(record?.nominatorName || "Unknown").trim()
    const publisherAddress = String(record?.nominatorAddress || "").trim()
    const publisherKey =
      publisherAddress.toLowerCase() || publisherName.toLowerCase()
    if (!publisherKey) {
      continue
    }

    summary.totalCards += 1
    if (isLegacy) {
      summary.legacyCards += 1
    } else {
      summary.currentCards += 1
    }
    if (isApprovedInvite) {
      summary.invitedCount += 1
      if (isLegacy) {
        summary.legacyInvitedCount += 1
      }
    }
    if (isPendingInvite) {
      summary.pendingCount += 1
      if (isLegacy) {
        summary.legacyPendingCount += 1
      }
    }
    if (isConverted) {
      summary.currentMinterCount += 1
      if (isLegacy) {
        summary.legacyCurrentMinterCount += 1
      }
    }
    if (isKicked) {
      summary.kickedCount += 1
      if (isLegacy) {
        summary.legacyKickedCount += 1
      }
    }
    if (isBanned) {
      summary.bannedCount += 1
      if (isLegacy) {
        summary.legacyBannedCount += 1
      }
    }
    if (adminAddressSet.has(publisherAddress.toLowerCase())) {
      summary.adminCards += 1
    }

    let row = rowsByKey.get(publisherKey)
    if (!row) {
      row = {
        key: publisherKey,
        displayName: publisherName || "Unknown",
        address: publisherAddress || "",
        cardCount: 0,
        legacyCardCount: 0,
        currentCardCount: 0,
        invitedCount: 0,
        pendingCount: 0,
        currentMinterCount: 0,
        kickedCount: 0,
        bannedCount: 0,
        legacyInvitedCount: 0,
        legacyPendingCount: 0,
        legacyCurrentMinterCount: 0,
        legacyKickedCount: 0,
        legacyBannedCount: 0,
        adminCardCount: 0,
        lastPublishedAt: 0,
        lastLegacyPublishedAt: 0,
        isAdminPublisher: adminAddressSet.has(publisherAddress.toLowerCase()),
      }
      rowsByKey.set(publisherKey, row)
    }

    row.cardCount += 1
    if (isLegacy) {
      row.legacyCardCount += 1
      if (isApprovedInvite) {
        row.legacyInvitedCount += 1
      }
      if (isPendingInvite) {
        row.legacyPendingCount += 1
      }
      if (isConverted) {
        row.legacyCurrentMinterCount += 1
      }
      if (isKicked) {
        row.legacyKickedCount += 1
      }
      if (isBanned) {
        row.legacyBannedCount += 1
      }
    } else {
      row.currentCardCount += 1
    }
    if (isApprovedInvite) {
      row.invitedCount += 1
    }
    if (isPendingInvite) {
      row.pendingCount += 1
    }
    if (isConverted) {
      row.currentMinterCount += 1
    }
    if (isKicked) {
      row.kickedCount += 1
    }
    if (isBanned) {
      row.bannedCount += 1
    }
    if (row.isAdminPublisher) {
      row.adminCardCount += 1
    }
    row.lastPublishedAt = Math.max(row.lastPublishedAt || 0, record.createdAt || 0)
    if (isLegacy) {
      row.lastLegacyPublishedAt = Math.max(
        row.lastLegacyPublishedAt || 0,
        record.createdAt || 0
      )
    }
  }

  const rows = Array.from(rowsByKey.values()).sort((a, b) => {
    if (b.cardCount !== a.cardCount) {
      return b.cardCount - a.cardCount
    }
    if (b.currentMinterCount !== a.currentMinterCount) {
      return b.currentMinterCount - a.currentMinterCount
    }
    return b.lastPublishedAt - a.lastPublishedAt
  })

  return {
    rows,
    summary,
  }
}

const buildStatsSnapshotRollups = (session = null) => {
  const records = Array.isArray(session?.records) ? session.records : []
  const referenceData = session?.referenceData || {}
  const adminAddressSet = buildStatsGroupAddressSet(
    referenceData.minterAdminAddresses || []
  )

  const allPublisherAggregation = buildStatsPublisherRows(records, {
    adminAddressSet,
  })
  const publisherRows = Array.isArray(allPublisherAggregation.rows)
    ? allPublisherAggregation.rows
    : []
  const publisherSummary = allPublisherAggregation.summary || {}
  const legacyPublisherRows = publisherRows
    .filter((row) => row.legacyCardCount > 0)
    .sort((a, b) => {
      const legacyPublishDiff =
        Number(b.lastLegacyPublishedAt || 0) - Number(a.lastLegacyPublishedAt || 0)
      if (legacyPublishDiff !== 0) {
        return legacyPublishDiff
      }
      if (b.legacyCardCount !== a.legacyCardCount) {
        return b.legacyCardCount - a.legacyCardCount
      }
      if (b.cardCount !== a.cardCount) {
        return b.cardCount - a.cardCount
      }
      return String(a.displayName || "").localeCompare(String(b.displayName || ""))
    })
  const adminPublisherRows = publisherRows.filter((row) => row.isAdminPublisher)

  const adminCardCount = adminPublisherRows.reduce(
    (total, row) => total + Number(row.cardCount || 0),
    0
  )
  const adminLegacyCardCount = adminPublisherRows.reduce(
    (total, row) => total + Number(row.legacyCardCount || 0),
    0
  )
  const adminCurrentCardCount = adminPublisherRows.reduce(
    (total, row) => total + Number(row.currentCardCount || 0),
    0
  )
  const adminCurrentMinterCount = adminPublisherRows.reduce(
    (total, row) => total + Number(row.currentMinterCount || 0),
    0
  )
  const legacyPublisherSummary = {
    totalCards: Number(publisherSummary.legacyCards || 0),
    publisherCount: legacyPublisherRows.length,
    invitedCount: Number(publisherSummary.legacyInvitedCount || 0),
    pendingCount: Number(publisherSummary.legacyPendingCount || 0),
    currentMinterCount: Number(publisherSummary.legacyCurrentMinterCount || 0),
    kickedCount: Number(publisherSummary.legacyKickedCount || 0),
    bannedCount: Number(publisherSummary.legacyBannedCount || 0),
  }

  return {
    adminAddressSet,
    publisherRows,
    publisherSummary: {
      ...publisherSummary,
      publisherCount: publisherRows.length,
    },
    legacyPublisherRows,
    legacyPublisherSummary,
    adminPublisherRows,
    adminSummary: {
      cardCount: adminCardCount,
      publisherCount: adminPublisherRows.length,
      legacyCardCount: adminLegacyCardCount,
      currentCardCount: adminCurrentCardCount,
      currentMinterCount: adminCurrentMinterCount,
    },
  }
}

const buildStatsSnapshotMetaHtml = (snapshot = null) => {
  if (!snapshot) {
    return `
      <div class="stats-empty-state">
        Publish a snapshot to see the latest nominator intelligence here.
      </div>
    `
  }

  const source = snapshot.source || {}
  const summary = snapshot.summary || {}
  const generatedBy = snapshot.generatedBy || {}

  return `
    <div class="stats-meta-stack">
      <div class="stats-meta-row">
        <span class="stats-meta-label">Published</span>
        <strong>${qEscapeHtml(formatStatsDate(snapshot.generatedAt || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Publisher</span>
        <strong>${qEscapeHtml(generatedBy.name || "Unknown")}</strong>
      </div>
      ${
        snapshot.compiledAt
          ? `
            <div class="stats-meta-row">
              <span class="stats-meta-label">Compiled</span>
              <strong>${qEscapeHtml(formatStatsDate(snapshot.compiledAt || 0))}</strong>
            </div>
          `
          : ""
      }
      ${
        source.latestCardTimestamp
          ? `
            <div class="stats-meta-row">
              <span class="stats-meta-label">Source updated</span>
              <strong>${qEscapeHtml(
                formatStatsDate(source.latestCardTimestamp || 0)
              )}</strong>
            </div>
          `
          : ""
      }
      <div class="stats-meta-row">
        <span class="stats-meta-label">Source cards</span>
        <strong>${qEscapeHtml(String(source.cardCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Legacy cutoff</span>
        <strong>${qEscapeHtml(
          formatStatsDate(source.legacyCutoff || NOMINATOR_METHOD_START_TS)
        )}</strong>
      </div>
      ${
        source.progressIdentifier
          ? `
            <div class="stats-meta-row">
              <span class="stats-meta-label">Checkpoint</span>
              <strong>${qEscapeHtml(source.progressIdentifier || "Unavailable")}</strong>
            </div>
          `
          : ""
      }
      <div class="stats-meta-row">
        <span class="stats-meta-label">Nominators</span>
        <strong>${qEscapeHtml(String(summary.uniqueNominators || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Converted</span>
        <strong>${qEscapeHtml(String(summary.totalConvertedToMinter || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Approved</span>
        <strong>${qEscapeHtml(String(summary.totalApprovedInvites || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Pending</span>
        <strong>${qEscapeHtml(String(summary.totalPendingInvites || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Disciplinary</span>
        <strong>${qEscapeHtml(String(summary.totalKickedAndBanned || 0))}</strong>
      </div>
      ${buildStatsLegacyCalloutHtml(snapshot)}
    </div>
  `
}

const buildStatsHistoryHtml = (resources = []) => {
  if (!Array.isArray(resources) || resources.length === 0) {
    return `
      <div class="stats-empty-state">
        No published stats snapshots were found yet.
      </div>
    `
  }

  return `
    <div class="stats-history-list">
      ${resources
        .slice(0, 6)
        .map(
          (resource) => `
            <article class="stats-history-item">
              <div>
                <h3>${qEscapeHtml(resource.identifier || "Snapshot")}</h3>
                <p>${qEscapeHtml(formatStatsDate(getStatsBoardTimestamp(resource)))}</p>
              </div>
              <span class="stats-history-badge">Snapshot</span>
            </article>
          `
        )
      .join("")}
    </div>
  `
}

const buildStatsSyncBannerState = ({
  snapshot = null,
  sourceResource = null,
  progressCheckpoint = null,
  canPublish = false,
} = {}) => {
  const latestSourceTimestamp = getStatsBoardTimestamp(sourceResource)
  const snapshotSourceTimestamp = getStatsSnapshotSourceTimestamp(snapshot)
  const progressSourceTimestamp = Number(
    progressCheckpoint?.source?.latestCardTimestamp || 0
  )
  const snapshotIsMissing = !snapshot
  const snapshotIsStale = Boolean(
    snapshot && latestSourceTimestamp > snapshotSourceTimestamp
  )
  const hasIncompleteProgress = Boolean(
    progressCheckpoint && !progressCheckpoint.completed
  )
  const progressTotal = Number(
    progressCheckpoint?.source?.cardCount ||
      progressCheckpoint?.source?.resources?.length ||
      0
  )
  const progressProcessed = Number(progressCheckpoint?.nextIndex || 0)
  const progressRemaining = Math.max(progressTotal - progressProcessed, 0)
  const progressCheckpointIdentifier = String(
    progressCheckpoint?.progressIdentifier || ""
  )
  const resumeSummary = getStatsResumeCheckpointSummary(progressCheckpoint)

  let tone = "current"
  let kicker = "Data status"
  let title = "Stats are current"
  let message = "The current stats snapshot matches the latest known board data."
  let primaryAction = ""

  if (hasIncompleteProgress) {
    tone = "progress"
    kicker = "Update saved"
    title = "A previous stats update is ready to resume"
    message = resumeSummary
      ? `Checkpoint ${resumeSummary.checkpointIdentifier || "Unavailable"} has processed ${resumeSummary.processed} of ${resumeSummary.total} cards. Resuming will continue at card ${resumeSummary.nextCardNumber} with ${resumeSummary.remaining} remaining.`
      : `A resumable checkpoint is saved for ${
          progressProcessed || 0
        } of ${progressTotal || 0} cards. Any admin can continue from where it left off.`
    primaryAction = canPublish
      ? `<button type="button" class="stats-action-button stats-action-button--primary" onclick="continuePreviousStatsCompilation()">
          Resume update
        </button>`
      : ""
  } else if (snapshotIsMissing) {
    tone = "stale"
    kicker = "No snapshot yet"
    title = "Stats have not been updated yet"
    message =
      "A snapshot has not been updated yet, so the Stats dashboard is still showing placeholder values."
    primaryAction = canPublish
      ? `<button type="button" class="stats-action-button stats-action-button--primary" onclick="openStatsCompileModal()">
          Update stats
        </button>`
      : ""
  } else if (snapshotIsStale) {
    tone = "stale"
    kicker = "Update needed"
    title = "Stats are out of date"
    message = `Latest board activity is newer than the published snapshot from ${formatStatsDate(
      snapshotSourceTimestamp
    )}.`
    primaryAction = canPublish
      ? `<button type="button" class="stats-action-button stats-action-button--primary" onclick="openStatsCompileModal()">
          Update stats
        </button>`
      : ""
  }

  const secondaryAction = `<button type="button" class="stats-action-button" onclick="refreshStatsBoardView({ force: true })">
    Refresh latest snapshot
  </button>`

  return {
    tone,
    kicker,
    title,
    message,
    progressTotal,
    progressProcessed,
    progressRemaining,
    latestSourceTimestamp,
    snapshotSourceTimestamp,
    progressSourceTimestamp,
    progressCheckpointIdentifier,
    hasIncompleteProgress,
    snapshotIsMissing,
    snapshotIsStale,
    primaryAction,
    secondaryAction,
    progressLabel: hasIncompleteProgress
      ? resumeSummary
        ? `Saved checkpoint: ${resumeSummary.processed}/${resumeSummary.total} cards, ${resumeSummary.remaining} remaining`
        : `Saved checkpoint: ${progressProcessed}/${progressTotal || 0}`
      : snapshotIsStale
      ? `Snapshot captured: ${formatStatsDate(snapshotSourceTimestamp)}`
      : `Snapshot captured: ${formatStatsDate(snapshotSourceTimestamp)}`,
  }
}

const buildStatsSyncBannerHtml = (state = {}) => {
  const tone = String(state.tone || "current")
  const progressInfo =
    state.hasIncompleteProgress && state.progressCheckpointIdentifier
      ? `
        <div class="stats-sync-banner-meta">
          <span>Checkpoint: ${qEscapeHtml(state.progressCheckpointIdentifier)}</span>
          <span>Progress: ${qEscapeHtml(
            `${state.progressProcessed || 0}/${state.progressTotal || 0}`
          )}</span>
          <span>Remaining: ${qEscapeHtml(String(state.progressRemaining || 0))}</span>
        </div>
      `
      : `
        <div class="stats-sync-banner-meta">
          <span>Snapshot: ${qEscapeHtml(
            formatStatsDate(state.snapshotSourceTimestamp || 0)
          )}</span>
          <span>Source: ${qEscapeHtml(
            formatStatsDate(state.latestSourceTimestamp || 0)
          )}</span>
        </div>
      `

  return `
    <section class="stats-sync-banner stats-sync-banner--${qEscapeAttr(tone)}">
      <div class="stats-sync-banner-copy">
        <p class="stats-sync-banner-kicker">${qEscapeHtml(state.kicker || "Data status")}</p>
        <h3 class="stats-sync-banner-title">${qEscapeHtml(state.title || "Stats status")}</h3>
        <p class="stats-sync-banner-text">${qEscapeHtml(state.message || "")}</p>
        ${progressInfo}
      </div>
      <div class="stats-sync-banner-actions">
        ${
          state.primaryAction || ""
        }
        ${state.secondaryAction || ""}
      </div>
    </section>
  `
}

const renderStatsBoardSyncBanner = (
  snapshot = null,
  sourceResource = null,
  progressCheckpoint = null,
  canPublish = false
) => {
  const bannerEl = getStatsSyncBannerEl()
  if (!bannerEl) {
    return
  }

  const state = buildStatsSyncBannerState({
    snapshot,
    sourceResource,
    progressCheckpoint,
    canPublish,
  })

  bannerEl.innerHTML = buildStatsSyncBannerHtml(state)
  bannerEl.hidden = false
}

const buildStatsLegacyCalloutHtml = (snapshot = null) => {
  const legacyStats = snapshot?.legacyStats || {}
  const legacyCardCount = Number(legacyStats.cardCount || 0)
  if (legacyCardCount <= 0) {
    return ""
  }

  return `
    <div class="stats-legacy-callout">
      <div class="stats-legacy-callout-header">
        <span class="stats-meta-label">Legacy era</span>
        <strong>
          Cards published before June 2026 are excluded from the nominator leaderboard.
        </strong>
        <span class="stats-legacy-callout-note">
          Legacy current-in-group rate: ${qEscapeHtml(legacyStats.currentLabel || "0%")}
        </span>
      </div>
      <div class="stats-legacy-chip-grid">
        ${buildStatsMetricCardHtml(
          "Legacy cards",
          legacyStats.cardCount || 0,
          "Published before the new nominator method"
        )}
        ${buildStatsMetricCardHtml(
          "Legacy publishers",
          legacyStats.publisherCount || 0
        )}
        ${buildStatsMetricCardHtml(
          "Legacy approved",
          legacyStats.invitedCount || 0
        )}
        ${buildStatsMetricCardHtml(
          "Legacy pending",
          legacyStats.pendingCount || 0
        )}
        ${buildStatsMetricCardHtml(
          "Legacy kicked / banned",
          (legacyStats.kickedCount || 0) + (legacyStats.bannedCount || 0)
        )}
        ${buildStatsMetricCardHtml(
          "Still in group",
          legacyStats.currentMinterCount || 0
        )}
      </div>
    </div>
  `
}

const buildStatsLegacySectionSummaryHtml = (snapshot = null) => {
  const legacyStats = snapshot?.legacyStats || {}
  return `
    ${buildStatsMetricCardHtml(
      "Legacy cards",
      legacyStats.cardCount || 0,
      "Published before the nominator method cutover"
    )}
    ${buildStatsMetricCardHtml(
      "Legacy publishers",
      legacyStats.publisherCount || 0
    )}
    ${buildStatsMetricCardHtml(
      "Invited",
      legacyStats.invitedCount || 0
    )}
    ${buildStatsMetricCardHtml(
      "Still in group",
      legacyStats.currentMinterCount || 0,
      "Publisher remains in the Minter group"
    )}
    ${buildStatsMetricCardHtml(
      "Kicked / banned",
      (legacyStats.kickedCount || 0) + (legacyStats.bannedCount || 0)
    )}
    ${buildStatsMetricCardHtml(
      "Pending",
      legacyStats.pendingCount || 0
    )}
  `
}

const buildStatsAdminSectionSummaryHtml = (snapshot = null) => {
  const adminStats = snapshot?.adminStats || {}
  const referenceData = snapshot?.referenceData || {}
  return `
    ${buildStatsMetricCardHtml(
      "Admin-published cards",
      adminStats.cardCount || 0,
      "Cards published by current minter admins"
    )}
    ${buildStatsMetricCardHtml(
      "Admin publishers",
      adminStats.publisherCount || 0
    )}
    ${buildStatsMetricCardHtml(
      "Legacy published",
      adminStats.legacyCardCount || 0
    )}
    ${buildStatsMetricCardHtml(
      "Current-era published",
      adminStats.currentCardCount || 0
    )}
    ${buildStatsMetricCardHtml(
      "Admin publishers still in roster",
      adminStats.currentMinterCount || 0,
      "Based on the current Minter Admin roster"
    )}
    ${buildStatsMetricCardHtml(
      "Known admins",
      Array.isArray(referenceData.minterAdminAddresses)
        ? referenceData.minterAdminAddresses.length
        : 0
    )}
  `
}

const buildStatsLegacyLeaderboardHtml = (snapshot = null) => {
  const legacyStats = snapshot?.legacyStats || {}
  return buildStatsFlexibleTableHtml({
    rows: Array.isArray(legacyStats.leaderboard) ? legacyStats.leaderboard : [],
    emptyText:
      legacyStats.cardCount > 0
        ? "No legacy publishers were grouped yet."
        : "No legacy cards were found in the latest snapshot.",
    headers: [
      "Publisher",
      "Cards",
      "Invited",
      "Still in group",
      "Kicked",
      "Banned",
      "Last Legacy Publish",
    ],
    rowRenderer: (row) => `
      <tr>
        <td>
          <div class="stats-table-primary">${qEscapeHtml(row.displayName || "Unknown")}</div>
          <div class="stats-table-secondary">${qEscapeHtml(row.address || "Address unavailable")}</div>
        </td>
        <td>${qEscapeHtml(String(row.cardCount || 0))}</td>
        <td>${qEscapeHtml(String(row.legacyInvitedCount || 0))}</td>
        <td>${qEscapeHtml(String(row.legacyCurrentMinterCount || 0))}</td>
        <td>${qEscapeHtml(String(row.legacyKickedCount || 0))}</td>
        <td>${qEscapeHtml(String(row.legacyBannedCount || 0))}</td>
        <td>${qEscapeHtml(formatStatsDate(row.lastLegacyPublishedAt || row.lastPublishedAt || 0))}</td>
      </tr>
    `,
  })
}

const buildStatsAdminLeaderboardHtml = (snapshot = null) => {
  const adminStats = snapshot?.adminStats || {}
  return buildStatsFlexibleTableHtml({
    rows: Array.isArray(adminStats.leaderboard) ? adminStats.leaderboard : [],
    emptyText:
      "No current admin publishers were found in the latest snapshot.",
    headers: [
      "Admin publisher",
      "Cards",
      "Legacy",
      "Current-era",
      "Still in group",
      "Last Published",
    ],
    rowRenderer: (row) => `
      <tr>
        <td>
          <div class="stats-table-primary">${qEscapeHtml(row.displayName || "Unknown")}</div>
          <div class="stats-table-secondary">${qEscapeHtml(row.address || "Address unavailable")}</div>
        </td>
        <td>${qEscapeHtml(String(row.cardCount || 0))}</td>
        <td>${qEscapeHtml(String(row.legacyCardCount || 0))}</td>
        <td>${qEscapeHtml(String(row.currentCardCount || 0))}</td>
        <td>${qEscapeHtml(String(row.currentMinterCount || 0))}</td>
        <td>${qEscapeHtml(formatStatsDate(row.lastPublishedAt || 0))}</td>
      </tr>
    `,
  })
}

const buildStatsLegacySectionNoteHtml = (snapshot = null) => {
  const legacyStats = snapshot?.legacyStats || {}
  if (!legacyStats.cardCount) {
    return `
      <div class="stats-empty-state">
        Legacy activity will appear here once snapshot data is compiled.
      </div>
    `
  }

  return `
    <div class="stats-meta-stack">
      <div class="stats-meta-row">
        <span class="stats-meta-label">Legacy cards</span>
        <strong>${qEscapeHtml(String(legacyStats.cardCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Invited</span>
        <strong>${qEscapeHtml(String(legacyStats.invitedCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Current in group</span>
        <strong>${qEscapeHtml(String(legacyStats.currentMinterCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Kicked / banned</span>
        <strong>${qEscapeHtml(
          String((legacyStats.kickedCount || 0) + (legacyStats.bannedCount || 0))
        )}</strong>
      </div>
      <div class="stats-empty-state">
        Legacy cards are published by the minter themselves. This section tracks
        the publisher's group lifecycle so we can compare it against the new
        nominator method.
      </div>
    </div>
  `
}

const buildStatsAdminSectionNoteHtml = (snapshot = null) => {
  const adminStats = snapshot?.adminStats || {}
  const referenceData = snapshot?.referenceData || {}
  if (!adminStats.cardCount) {
    return `
      <div class="stats-empty-state">
        Admin-published cards will appear here once current roster data is available.
      </div>
    `
  }

  return `
    <div class="stats-meta-stack">
      <div class="stats-meta-row">
        <span class="stats-meta-label">Admin-published cards</span>
        <strong>${qEscapeHtml(String(adminStats.cardCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Legacy published</span>
        <strong>${qEscapeHtml(String(adminStats.legacyCardCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Current-era published</span>
        <strong>${qEscapeHtml(String(adminStats.currentCardCount || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Known admins</span>
        <strong>${qEscapeHtml(
          String(
            Array.isArray(referenceData.minterAdminAddresses)
              ? referenceData.minterAdminAddresses.length
              : 0
          )
        )}</strong>
      </div>
      <div class="stats-empty-state">
        This section is organized around current Minter Admin membership and the
        cards published by those accounts. It gives us a foundation for future
        scoring and admin-specific leaderboards.
      </div>
    </div>
  `
}

const buildStatsSourceResourceList = (resources = []) => {
  const deduped = new Map()
  for (const resource of Array.isArray(resources) ? resources : []) {
    const normalized = normalizeStatsSourceResource(resource)
    if (!normalized.name || !normalized.identifier) {
      continue
    }

    const key = `${normalized.name}::${normalized.identifier}`
    const current = deduped.get(key)
    if (!current || getStatsBoardTimestamp(normalized) >= getStatsBoardTimestamp(current)) {
      deduped.set(key, normalized)
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const timeDiff = getStatsBoardTimestamp(a) - getStatsBoardTimestamp(b)
    if (timeDiff !== 0) {
      return timeDiff
    }
    const identifierDiff = String(a.identifier || "").localeCompare(
      String(b.identifier || "")
    )
    if (identifierDiff !== 0) {
      return identifierDiff
    }
    return String(a.name || "").localeCompare(String(b.name || ""))
  })
}

const isStatsProgressIdentifier = (identifier = "") =>
  String(identifier || "")
    .trim()
    .startsWith(MINTER_STATS_PROGRESS_IDENTIFIER_PREFIX)

const fetchStatsBoardQdnJsonResource = async (resourceMeta = null) => {
  if (!resourceMeta || !resourceMeta.name || !resourceMeta.identifier) {
    return null
  }

  try {
    const response = await qortalRequest({
      action: "FETCH_QDN_RESOURCE",
      name: resourceMeta.name,
      service: "BLOG_POST",
      identifier: resourceMeta.identifier,
    })

    if (typeof response === "string") {
      try {
        return JSON.parse(response)
      } catch (parseError) {
        return response
      }
    }

    return response || null
  } catch (error) {
    console.warn("Unable to load stats board QDN resource:", resourceMeta, error)
    return null
  }
}

const fetchLatestStatsSourceResource = async (force = false) => {
  const now = Date.now()
  if (
    !force &&
    statsBoardState.latestSourceResource &&
    now - statsBoardState.latestSourceLoadedAt < STATS_BOARD_SYNC_CACHE_TTL_MS
  ) {
    return statsBoardState.latestSourceResource
  }

  const resource = await searchSimple(
    "BLOG_POST",
    minterCardIdentifierPrefix,
    "",
    1,
    0,
    "",
    true,
    true,
    0
  ).catch(() => null)

  statsBoardState.latestSourceResource = resource || null
  statsBoardState.latestSourceLoadedAt = now
  return resource || null
}

const fetchLatestStatsProgressCheckpoint = async (
  force = false,
  adminAddressSet = null
) => {
  const now = Date.now()
  if (
    !force &&
    statsBoardState.latestProgressCheckpoint &&
    now - statsBoardState.latestProgressLoadedAt < STATS_BOARD_SYNC_CACHE_TTL_MS
  ) {
    return statsBoardState.latestProgressCheckpoint
  }

  const resource = await searchSimple(
    "BLOG_POST",
    MINTER_STATS_PROGRESS_IDENTIFIER_PREFIX,
    "",
    100,
    0,
    "",
    true,
    true,
    0
  ).catch(() => null)

  const verifiedAdminAddressSet =
    adminAddressSet instanceof Set
      ? adminAddressSet
      : (await fetchStatsBoardGroupData(force).catch(() => null))
          ?.allAdminAddressSet || new Set()
  const progressResources = await filterAdminPublishedStatsResources(
    buildStatsSourceResourceList(Array.isArray(resource) ? resource : resource ? [resource] : []),
    verifiedAdminAddressSet
  )

  const checkpoint = await fetchStatsBoardQdnJsonResource(
    progressResources[0] || null
  )
  statsBoardState.latestProgressCheckpoint = checkpoint || null
  statsBoardState.latestProgressLoadedAt = now
  return checkpoint || null
}

const normalizeStatsGroupMemberAddress = (member = {}) =>
  String(member?.member || member?.address || "").trim()

const buildStatsGroupAddressSet = (members = []) =>
  new Set(
    (Array.isArray(members) ? members : [])
      .map((member) => normalizeStatsGroupMemberAddress(member).toLowerCase())
      .filter(Boolean)
  )

const fetchStatsBoardGroupData = async (force = false) => {
  const now = Date.now()
  if (
    !force &&
    statsBoardState.latestGroupData &&
    now - statsBoardState.latestGroupLoadedAt < STATS_GROUP_CACHE_TTL_MS
  ) {
    return statsBoardState.latestGroupData
  }

  const [minterGroupMembers, minterAdmins, adminGroupMembers] = await Promise.all([
    typeof fetchMinterGroupMembers === "function"
      ? fetchMinterGroupMembers().catch(() => [])
      : Promise.resolve([]),
    typeof fetchMinterGroupAdmins === "function"
      ? fetchMinterGroupAdmins().catch(() => [])
      : Promise.resolve([]),
    typeof fetchAllAdminGroupsMembers === "function"
      ? fetchAllAdminGroupsMembers().catch(() => [])
      : Promise.resolve([]),
  ])

  const allAdminMembers = [
    ...(Array.isArray(adminGroupMembers) ? adminGroupMembers : []),
    ...(Array.isArray(minterAdmins) ? minterAdmins : []),
  ]

  const groupData = {
    minterGroupMembers: Array.isArray(minterGroupMembers)
      ? minterGroupMembers
      : [],
    minterAdmins: Array.isArray(minterAdmins) ? minterAdmins : [],
    adminGroupMembers: Array.isArray(adminGroupMembers) ? adminGroupMembers : [],
    minterGroupAddressSet: buildStatsGroupAddressSet(minterGroupMembers),
    minterAdminAddressSet: buildStatsGroupAddressSet(minterAdmins),
    allAdminAddressSet: buildStatsGroupAddressSet(allAdminMembers),
    loadedAt: now,
  }

  statsBoardState.latestGroupData = groupData
  statsBoardState.latestGroupLoadedAt = now
  return groupData
}

const fetchMinterGroupDetails = async () => {
  try {
    const response = await fetch(`${baseUrl}/groups/694`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const groupDetails = await response.json()
    return groupDetails && typeof groupDetails === "object" ? groupDetails : null
  } catch (error) {
    console.error("Error fetching MINTER group details:", error)
    return null
  }
}

const fetchMinterOnlineLevels = async () => {
  try {
    const response = await fetch(`${baseUrl}/addresses/online/levels`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const levelData = await response.json()
    if (!Array.isArray(levelData)) {
      return []
    }

    return levelData
      .map((row) => ({
        level: Number(row?.level ?? 0),
        count: Number(row?.count ?? 0),
      }))
      .filter((row) => Number.isFinite(row.level) && row.level >= 0)
      .sort((a, b) => a.level - b.level)
  } catch (error) {
    console.error("Error fetching online minter levels:", error)
    return []
  }
}

const splitStatsLiveLevelRows = (onlineLevels = []) => {
  const rowsByLevel = new Map()
  let founderAccountCount = 0

  for (const row of Array.isArray(onlineLevels) ? onlineLevels : []) {
    const level = Number(row?.level ?? 0)
    const count = Number(row?.count ?? 0)
    if (!Number.isFinite(level) || level < 0) {
      continue
    }
    if (level === STATS_FOUNDER_EFFECTIVE_LEVEL) {
      founderAccountCount += count
      continue
    }
    rowsByLevel.set(level, Number(rowsByLevel.get(level) || 0) + count)
  }

  const actualLevelRows = []
  for (let level = 0; level < STATS_FOUNDER_EFFECTIVE_LEVEL; level += 1) {
    actualLevelRows.push({
      level,
      count: Number(rowsByLevel.get(level) || 0),
    })
  }

  return {
    actualLevelRows,
    founderAccountCount,
  }
}

const fetchStatsBoardLiveMintingData = async (
  force = false,
  groupData = null
) => {
  const now = Date.now()
  if (
    !force &&
    statsBoardState.latestLiveMintingData &&
    now - statsBoardState.latestLiveMintingLoadedAt < STATS_LIVE_CACHE_TTL_MS
  ) {
    return statsBoardState.latestLiveMintingData
  }

  const resolvedGroupData =
    groupData || (await fetchStatsBoardGroupData(force).catch(() => null))

  const [groupDetails, onlineLevels] = await Promise.all([
    fetchMinterGroupDetails().catch(() => null),
    fetchMinterOnlineLevels().catch(() => []),
  ])

  const hasOnlineLevelData = Array.isArray(onlineLevels) && onlineLevels.length > 0
  const { actualLevelRows, founderAccountCount } = splitStatsLiveLevelRows(
    onlineLevels
  )
  const totalOnlineMinters = actualLevelRows.reduce(
    (total, row) => total + Number(row.count || 0),
    0
  ) + Number(founderAccountCount || 0)
  const actualLevelCount = actualLevelRows.filter(
    (row) => Number(row.count || 0) > 0
  ).length
  const highestActualLevel = actualLevelRows.reduce(
    (highest, row) =>
      Number(row.count || 0) > 0 ? Math.max(highest, Number(row.level || 0)) : highest,
    -1
  )
  const founderAccountShare =
    totalOnlineMinters > 0 ? founderAccountCount / totalOnlineMinters : 0

  const liveMintingData = {
    groupDetails: groupDetails || null,
    memberCount: Number(
      groupDetails?.memberCount ||
        resolvedGroupData?.minterGroupMembers?.length ||
        0
    ),
    totalOnlineMinters,
    actualLevelCount,
    highestActualLevel,
    activeLevelCount: actualLevelCount,
    highestActiveLevel: highestActualLevel,
    founderEffectiveLevel: STATS_FOUNDER_EFFECTIVE_LEVEL,
    founderAccountCount,
    founderAccountShare,
    onlineLevelSourceCount: hasOnlineLevelData ? onlineLevels.length : 0,
    actualLevelRows,
    onlineLevels: actualLevelRows,
    loadedAt: now,
  }

  statsBoardState.latestLiveMintingData = liveMintingData
  statsBoardState.latestLiveMintingLoadedAt = now
  return liveMintingData
}

const getStatsLiveMintingSummaryGrid = () =>
  document.getElementById("stats-live-summary-grid")

const getStatsLiveMintingLevelsContainer = () =>
  document.getElementById("stats-live-levels-container")

const getStatsLiveFounderAccountsContainer = () =>
  document.getElementById("stats-live-founder-container")

const getStatsLiveMintingMetaContainer = () =>
  document.getElementById("stats-live-group-meta-container")

const buildStatsLiveGroupMetaHtml = (liveMintingData = null) => {
  const groupDetails = liveMintingData?.groupDetails || {}
  const memberCount = Number(liveMintingData?.memberCount || 0)
  if (!groupDetails || Object.keys(groupDetails).length === 0) {
    return `
      <div class="stats-empty-state">
        Live MINTER group details are unavailable right now.
      </div>
    `
  }

  return `
    <div class="stats-meta-stack">
      <div class="stats-meta-row">
        <span class="stats-meta-label">Group ID</span>
        <strong>${qEscapeHtml(String(groupDetails.groupId ?? "694"))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Group name</span>
        <strong>${qEscapeHtml(groupDetails.groupName || "MINTER")}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Owner</span>
        <strong>${qEscapeHtml(groupDetails.owner || "Unavailable")}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Member count</span>
        <strong>${qEscapeHtml(String(memberCount))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Approval threshold</span>
        <strong>${qEscapeHtml(groupDetails.approvalThreshold || "Unavailable")}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Minimum block delay</span>
        <strong>${qEscapeHtml(String(groupDetails.minimumBlockDelay ?? "Unavailable"))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Maximum block delay</span>
        <strong>${qEscapeHtml(String(groupDetails.maximumBlockDelay ?? "Unavailable"))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Open</span>
        <strong>${qEscapeHtml(groupDetails.isOpen ? "Yes" : "No")}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Created</span>
        <strong>${qEscapeHtml(formatStatsDate(groupDetails.created || 0))}</strong>
      </div>
      <div class="stats-meta-row">
        <span class="stats-meta-label">Updated</span>
        <strong>${qEscapeHtml(formatStatsDate(groupDetails.updated || 0))}</strong>
      </div>
      ${
        groupDetails.description
          ? `
            <div class="stats-empty-state">
              ${qEscapeHtml(groupDetails.description)}
            </div>
          `
          : ""
      }
    </div>
  `
}

const buildStatsLiveMintingLevelsHtml = (liveMintingData = null) => {
  if (Number(liveMintingData?.onlineLevelSourceCount || 0) <= 0) {
    return `
      <div class="stats-empty-state">
        No online level data was returned yet.
      </div>
    `
  }

  const rows = Array.isArray(liveMintingData?.actualLevelRows)
    ? liveMintingData.actualLevelRows
    : []

  const totalOnlineMinters = Number(liveMintingData?.totalOnlineMinters || 0)
  return buildStatsFlexibleTableHtml({
    rows,
    emptyText: "No online level data was returned yet.",
    headers: ["Actual level", "Online minters", "% of Total"],
    rowRenderer: (row) => {
      const count = Number(row.count || 0)
      const percentOfTotal = totalOnlineMinters > 0 ? count / totalOnlineMinters : 0
      return `
        <tr>
          <td>
            <div class="stats-table-primary">Level ${qEscapeHtml(String(row.level || 0))}</div>
            <div class="stats-table-secondary">Actual level from /addresses/online/levels</div>
          </td>
          <td>${qEscapeHtml(String(count))}</td>
          <td>${qEscapeHtml(formatStatsPercent(percentOfTotal))}</td>
        </tr>
      `
    },
  })
}

const buildStatsLiveFounderAccountsHtml = (liveMintingData = null) => {
  const founderAccountCount = Number(liveMintingData?.founderAccountCount || 0)
  const totalOnlineMinters = Number(liveMintingData?.totalOnlineMinters || 0)
  const founderAccountShare =
    Number.isFinite(Number(liveMintingData?.founderAccountShare))
      ? Number(liveMintingData?.founderAccountShare || 0)
      : totalOnlineMinters > 0
      ? founderAccountCount / totalOnlineMinters
      : 0
  const effectiveLevel = Number(
    liveMintingData?.founderEffectiveLevel ?? STATS_FOUNDER_EFFECTIVE_LEVEL
  )

  return `
    <div class="stats-legacy-chip-grid stats-live-founder-grid">
      ${buildStatsMetricCardHtml(
        "Founder accounts",
        founderAccountCount,
        `Effective level ${effectiveLevel}`
      )}
      ${buildStatsMetricCardHtml(
        "% of total online",
        formatStatsPercent(founderAccountShare),
        "Count divided by all online minters"
      )}
    </div>
    <div class="stats-empty-state">
      Founder accounts are shown separately from the actual level table because
      the level 10 value is an effective level, not a true minter level. That
      keeps the actual level distribution honest until the lower levels are
      fully represented. They are not given higher rewards, but they are given
      a higher likelihood of being the block signer as an underlying added
      security measure. Founder accounts are rewarded exactly the same way as
      any other account.
    </div>
  `
}

const renderStatsLiveMintingSection = (liveMintingData = null) => {
  const summaryGrid = getStatsLiveMintingSummaryGrid()
  const levelsContainer = getStatsLiveMintingLevelsContainer()
  const founderContainer = getStatsLiveFounderAccountsContainer()
  const metaContainer = getStatsLiveMintingMetaContainer()

  if (summaryGrid) {
    summaryGrid.innerHTML = `
      ${buildStatsMetricCardHtml(
        "MINTER Group Members",
        Number(liveMintingData?.memberCount || 0),
        "From /groups/694"
      )}
      ${buildStatsMetricCardHtml(
        "Currently active minters",
        Number(liveMintingData?.totalOnlineMinters || 0),
        "Summed from /addresses/online/levels, including founder accounts"
      )}
      ${buildStatsMetricCardHtml(
        "Actual levels reported",
        Number(liveMintingData?.actualLevelCount || 0),
        "Levels 0-9 with at least one online address"
      )}
      ${buildStatsMetricCardHtml(
        "Highest actual level",
        Number(liveMintingData?.highestActualLevel ?? -1) >= 0
          ? `Level ${Number(liveMintingData?.highestActualLevel || 0)}`
          : "None",
        "Highest non-founder level with online activity"
      )}
    `
  }

  if (levelsContainer) {
    levelsContainer.innerHTML = buildStatsLiveMintingLevelsHtml(liveMintingData)
  }

  if (founderContainer) {
    founderContainer.innerHTML = buildStatsLiveFounderAccountsHtml(
      liveMintingData
    )
  }

  if (metaContainer) {
    metaContainer.innerHTML = buildStatsLiveGroupMetaHtml(liveMintingData)
  }
}

const createStatsCompileSession = ({
  snapshotTimestamp = Date.now(),
  sourceResources = [],
  referenceData = {},
} = {}) => {
  const normalizedSourceResources = buildStatsSourceResourceList(sourceResources)
  const latestCardTimestamp = normalizedSourceResources.reduce(
    (latestTimestamp, resource) =>
      Math.max(latestTimestamp, getStatsBoardTimestamp(resource)),
    0
  )

  return {
    schemaVersion: 2,
    compileType: "stats-progress",
    progressIdentifier: getStatsCompileProgressIdentifier(snapshotTimestamp),
    snapshotTimestamp,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completed: false,
    resumedFromProgress: false,
    batchSize: STATS_COMPILE_BATCH_SIZE,
    nextIndex: 0,
    batchesProcessed: 0,
    generatedBy: {
      name: userState.accountName || "",
      address: userState.accountAddress || "",
    },
    source: {
      prefix: MINTER_STATS_IDENTIFIER_PREFIX,
      cardCount: normalizedSourceResources.length,
      legacyCutoff: NOMINATOR_METHOD_START_TS,
      latestCardTimestamp,
      resources: normalizedSourceResources,
    },
    referenceData: {
      minterGroupAddresses: Array.isArray(referenceData.minterGroupAddresses)
        ? referenceData.minterGroupAddresses.map((value) =>
            String(value || "").trim()
          )
        : [],
      minterAdminAddresses: Array.isArray(referenceData.minterAdminAddresses)
        ? referenceData.minterAdminAddresses.map((value) =>
            String(value || "").trim()
          )
        : [],
    },
    summary: {
      totalNominations: 0,
      uniqueNominators: 0,
      uniqueNominees: 0,
      totalConvertedToMinter: 0,
      totalApprovedInvites: 0,
      totalPendingInvites: 0,
      totalKickedAndBanned: 0,
      legacyCardCount: 0,
      legacyConvertedToMinter: 0,
      legacyApprovedInvites: 0,
      legacyPendingInvites: 0,
      legacyKickedAndBanned: 0,
    },
    uniqueNomineeKeys: {},
    nominatorRowsByKey: {},
    records: [],
    validationIssueCount: 0,
    validationIssues: [],
    finalSnapshotIdentifier: "",
    finalPublishedAt: 0,
  }
}

const normalizeStatsCompileRecord = (record = {}) => ({
  cardIdentifier: String(record.cardIdentifier || "").trim(),
  createdAt: Number(record.createdAt || 0),
  isLegacy: Boolean(record.isLegacy),
  nomineeName: String(record.nomineeName || ""),
  nomineeAddress: String(record.nomineeAddress || ""),
  nominatorName: String(record.nominatorName || ""),
  nominatorAddress: String(record.nominatorAddress || ""),
  inviteDisplayStatus: String(record.inviteDisplayStatus || ""),
  isConverted: Boolean(record.isConverted),
  isApprovedInvite: Boolean(record.isApprovedInvite),
  isPendingInvite: Boolean(record.isPendingInvite),
  isKicked: Boolean(record.isKicked),
  isBanned: Boolean(record.isBanned),
})

const normalizeStatsResourcePublisherAddress = (payload = null) =>
  String(
    payload?.generatedBy?.address ||
      payload?.generatedByAddress ||
      payload?.publishedByAddress ||
      payload?.publishedBy?.address ||
      ""
  ).trim()

const isStatsResourcePublishedByAdmin = (
  payload = null,
  adminAddressSet = new Set()
) => {
  const normalizedAddress = normalizeStatsResourcePublisherAddress(payload).toLowerCase()
  return Boolean(normalizedAddress) && adminAddressSet instanceof Set && adminAddressSet.has(normalizedAddress)
}

const hydrateStatsCompileSession = (checkpoint = null) => {
  if (!checkpoint) {
    return null
  }

  const sourceResources = buildStatsSourceResourceList(
    checkpoint?.source?.resources || []
  )
  const session = createStatsCompileSession({
    snapshotTimestamp:
      Number(checkpoint.snapshotTimestamp || checkpoint.generatedAt || Date.now()) ||
      Date.now(),
    sourceResources,
  })

  session.createdAt = Number(checkpoint.createdAt || checkpoint.generatedAt || Date.now())
  session.updatedAt = Number(checkpoint.updatedAt || checkpoint.compiledAt || Date.now())
  session.completed = Boolean(checkpoint.completed)
  session.resumedFromProgress = true
  session.batchSize = Number(checkpoint.batchSize || session.batchSize) || STATS_COMPILE_BATCH_SIZE
  session.nextIndex = Math.max(0, Number(checkpoint.nextIndex || 0))
  session.batchesProcessed = Math.max(0, Number(checkpoint.batchesProcessed || 0))
  session.generatedBy = {
    name: String(checkpoint.generatedBy?.name || "").trim(),
    address: String(checkpoint.generatedBy?.address || "").trim(),
  }
  session.finalSnapshotIdentifier = String(checkpoint.finalSnapshotIdentifier || "")
  session.finalPublishedAt = Number(checkpoint.finalPublishedAt || 0)
  session.validationIssueCount = Math.max(
    0,
    Number(checkpoint.validationIssueCount || 0)
  )
  session.validationIssues = Array.isArray(checkpoint.validationIssues)
    ? checkpoint.validationIssues.map((issue) => ({
        identifier: String(issue?.identifier || "").trim(),
        reason: String(issue?.reason || "").trim(),
        detail: String(issue?.detail || "").trim(),
      }))
    : []
  session.records = Array.isArray(checkpoint.records)
    ? checkpoint.records.map((record) => normalizeStatsCompileRecord(record))
    : []
  session.referenceData = {
    minterGroupAddresses: Array.isArray(checkpoint.referenceData?.minterGroupAddresses)
      ? checkpoint.referenceData.minterGroupAddresses.map((value) =>
          String(value || "").trim()
        )
      : [],
    minterAdminAddresses: Array.isArray(checkpoint.referenceData?.minterAdminAddresses)
      ? checkpoint.referenceData.minterAdminAddresses.map((value) =>
          String(value || "").trim()
        )
      : [],
  }

  const normalizedSummary = checkpoint.summary || {}
  session.summary = {
    ...session.summary,
    totalNominations: Number(normalizedSummary.totalNominations || 0),
    uniqueNominators: Number(normalizedSummary.uniqueNominators || 0),
    uniqueNominees: Number(normalizedSummary.uniqueNominees || 0),
    totalConvertedToMinter: Number(normalizedSummary.totalConvertedToMinter || 0),
    totalApprovedInvites: Number(normalizedSummary.totalApprovedInvites || 0),
    totalPendingInvites: Number(normalizedSummary.totalPendingInvites || 0),
    totalKickedAndBanned: Number(normalizedSummary.totalKickedAndBanned || 0),
    legacyCardCount: Number(normalizedSummary.legacyCardCount || 0),
    legacyConvertedToMinter: Number(normalizedSummary.legacyConvertedToMinter || 0),
    legacyApprovedInvites: Number(normalizedSummary.legacyApprovedInvites || 0),
    legacyPendingInvites: Number(normalizedSummary.legacyPendingInvites || 0),
    legacyKickedAndBanned: Number(normalizedSummary.legacyKickedAndBanned || 0),
  }
  session.uniqueNomineeKeys = Array.isArray(checkpoint.uniqueNomineeKeys)
    ? checkpoint.uniqueNomineeKeys.reduce((acc, key) => {
        const normalizedKey = String(key || "").trim()
        if (normalizedKey) {
          acc[normalizedKey] = true
        }
        return acc
      }, {})
    : {
        ...(checkpoint.uniqueNomineeKeys || {}),
      }
  session.nominatorRowsByKey = {
    ...(checkpoint.nominatorRowsByKey || {}),
  }

  return session
}

const serializeStatsCompileSession = (session = null) => {
  if (!session) {
    return null
  }

  return {
    schemaVersion: Number(session.schemaVersion || 2),
    compileType: "stats-progress",
    progressIdentifier: String(session.progressIdentifier || ""),
    snapshotTimestamp: Number(session.snapshotTimestamp || Date.now()),
    createdAt: Number(session.createdAt || Date.now()),
    updatedAt: Number(session.updatedAt || Date.now()),
    completed: Boolean(session.completed),
    resumedFromProgress: Boolean(session.resumedFromProgress),
    batchSize: Number(session.batchSize || STATS_COMPILE_BATCH_SIZE),
    nextIndex: Number(session.nextIndex || 0),
    batchesProcessed: Number(session.batchesProcessed || 0),
    generatedBy: {
      name: String(session.generatedBy?.name || userState.accountName || "").trim(),
      address: String(
        session.generatedBy?.address || userState.accountAddress || ""
      ).trim(),
    },
    source: {
      prefix: String(session.source?.prefix || MINTER_STATS_IDENTIFIER_PREFIX),
      cardCount: Number(session.source?.cardCount || 0),
      legacyCutoff: Number(
        session.source?.legacyCutoff || NOMINATOR_METHOD_START_TS
      ),
      latestCardTimestamp: Number(session.source?.latestCardTimestamp || 0),
      resources: Array.isArray(session.source?.resources)
        ? session.source.resources.map((resource) => normalizeStatsSourceResource(resource))
        : [],
    },
    referenceData: {
      minterGroupAddresses: Array.isArray(
        session.referenceData?.minterGroupAddresses
      )
        ? session.referenceData.minterGroupAddresses.map((value) =>
            String(value || "").trim()
          )
        : [],
      minterAdminAddresses: Array.isArray(
        session.referenceData?.minterAdminAddresses
      )
        ? session.referenceData.minterAdminAddresses.map((value) =>
            String(value || "").trim()
          )
        : [],
    },
    summary: {
      totalNominations: Number(session.summary?.totalNominations || 0),
      uniqueNominators: Number(session.summary?.uniqueNominators || 0),
      uniqueNominees: Number(session.summary?.uniqueNominees || 0),
      totalConvertedToMinter: Number(session.summary?.totalConvertedToMinter || 0),
      totalApprovedInvites: Number(session.summary?.totalApprovedInvites || 0),
      totalPendingInvites: Number(session.summary?.totalPendingInvites || 0),
      totalKickedAndBanned: Number(session.summary?.totalKickedAndBanned || 0),
      legacyCardCount: Number(session.summary?.legacyCardCount || 0),
      legacyConvertedToMinter: Number(session.summary?.legacyConvertedToMinter || 0),
      legacyApprovedInvites: Number(session.summary?.legacyApprovedInvites || 0),
      legacyPendingInvites: Number(session.summary?.legacyPendingInvites || 0),
      legacyKickedAndBanned: Number(session.summary?.legacyKickedAndBanned || 0),
    },
    uniqueNomineeKeys: {
      ...(session.uniqueNomineeKeys || {}),
    },
    nominatorRowsByKey: {
      ...(session.nominatorRowsByKey || {}),
    },
    records: Array.isArray(session.records)
      ? session.records.map((record) => normalizeStatsCompileRecord(record))
      : [],
    validationIssueCount: Number(session.validationIssueCount || 0),
    validationIssues: Array.isArray(session.validationIssues)
      ? session.validationIssues.map((issue) => ({
          identifier: String(issue?.identifier || "").trim(),
          reason: String(issue?.reason || "").trim(),
          detail: String(issue?.detail || "").trim(),
        }))
      : [],
    finalSnapshotIdentifier: String(session.finalSnapshotIdentifier || ""),
    finalPublishedAt: Number(session.finalPublishedAt || 0),
  }
}

const buildStatsPublishResourceFromPayload = async (
  identifier = "",
  payload = null
) => {
  if (!identifier || !payload || !userState.accountName) {
    return null
  }

  const data64 = (await objectToBase64(payload)) || btoa(JSON.stringify(payload))
  return {
    name: userState.accountName,
    service: "BLOG_POST",
    identifier,
    data64,
  }
}

const publishStatsResources = async (resources = []) => {
  const publishList = Array.isArray(resources) ? resources.filter(Boolean) : []
  if (publishList.length === 0) {
    return []
  }

  if (typeof publishMultipleResources === "function") {
    await publishMultipleResources(publishList)
  } else {
    for (const resource of publishList) {
      await qortalRequest({
        action: "PUBLISH_QDN_RESOURCE",
        name: resource.name,
        service: resource.service,
        identifier: resource.identifier,
        data64: resource.data64,
      })
    }
  }

  return publishList.map((resource) => resource.identifier)
}

const filterAdminPublishedStatsResources = async (
  resources = [],
  adminAddressSet = new Set()
) => {
  const normalizedResources = buildStatsSourceResourceList(resources)
  const normalizedAdminAddressSet =
    adminAddressSet instanceof Set ? adminAddressSet : new Set()

  if (normalizedResources.length === 0 || normalizedAdminAddressSet.size === 0) {
    return []
  }

  const tasks = normalizedResources.map((resource) => async () => {
    const payload = await fetchStatsBoardQdnJsonResource(resource)
    return isStatsResourcePublishedByAdmin(payload, normalizedAdminAddressSet)
      ? resource
      : null
  })

  const verifiedResources =
    typeof runWithConcurrency === "function"
      ? await runWithConcurrency(tasks, 5)
      : await Promise.all(tasks.map((task) => task()))

  return buildStatsSourceResourceList(verifiedResources.filter(Boolean))
}

const buildStatsSnapshotPublishResource = async (
  snapshot = null,
  publishTimestamp = snapshot?.generatedAt || Date.now()
) => {
  if (!snapshot) {
    return null
  }

  const identifier = `${MINTER_STATS_IDENTIFIER_PREFIX}-${publishTimestamp}`
  return buildStatsPublishResourceFromPayload(identifier, snapshot)
}

const buildStatsCompileCheckpointPublishResource = async (session = null) => {
  if (!session) {
    return null
  }

  const payload = serializeStatsCompileSession(session)
  if (!payload) {
    return null
  }

  const identifier = String(
    payload.progressIdentifier || session.progressIdentifier || ""
  ).trim()
  return buildStatsPublishResourceFromPayload(identifier, payload)
}

const publishStatsSnapshotBundle = async (
  snapshot = null,
  session = null,
  { publishTimestamp = snapshot?.generatedAt || Date.now() } = {}
) => {
  if (!snapshot) {
    return {
      snapshotIdentifier: "",
      checkpointIdentifier: "",
    }
  }

  if (session) {
    session.generatedBy = {
      name: userState.accountName || "",
      address: userState.accountAddress || "",
    }
  }

  const checkpointPayload = session ? serializeStatsCompileSession(session) : null
  const [snapshotResource, checkpointResource] = await Promise.all([
    buildStatsSnapshotPublishResource(snapshot, publishTimestamp),
    checkpointPayload
      ? buildStatsPublishResourceFromPayload(
          String(checkpointPayload.progressIdentifier || session?.progressIdentifier || "").trim(),
          checkpointPayload
        )
      : null,
  ])

  const identifiers = await publishStatsResources([snapshotResource, checkpointResource])
  statsBoardState.snapshotResources = []
  statsBoardState.lastLoadedAt = 0
  if (checkpointPayload) {
    statsBoardState.latestProgressCheckpoint = checkpointPayload
    statsBoardState.latestProgressLoadedAt = Date.now()
  }
  await fetchLatestPublishedStatsSnapshot(true)
  return {
    snapshotIdentifier:
      identifiers[0] || snapshotResource?.identifier || "",
    checkpointIdentifier:
      identifiers[1] || checkpointResource?.identifier || "",
  }
}

const addStatsCompileRecordToSession = (session = null, record = null) => {
  if (!session || !record) {
    return
  }

  const normalizedRecord = normalizeStatsCompileRecord(record)
  session.records.push(normalizedRecord)

  if (normalizedRecord.isLegacy) {
    session.summary.legacyCardCount += 1
    if (normalizedRecord.isConverted) {
      session.summary.legacyConvertedToMinter += 1
    }
    if (normalizedRecord.isApprovedInvite) {
      session.summary.legacyApprovedInvites += 1
    }
    if (normalizedRecord.isPendingInvite) {
      session.summary.legacyPendingInvites += 1
    }
    if (normalizedRecord.isKicked || normalizedRecord.isBanned) {
      session.summary.legacyKickedAndBanned += 1
    }
    return
  }

  session.summary.totalNominations += 1
  if (normalizedRecord.isConverted) {
    session.summary.totalConvertedToMinter += 1
  }
  if (normalizedRecord.isApprovedInvite) {
    session.summary.totalApprovedInvites += 1
  }
  if (normalizedRecord.isPendingInvite) {
    session.summary.totalPendingInvites += 1
  }
  if (normalizedRecord.isKicked || normalizedRecord.isBanned) {
    session.summary.totalKickedAndBanned += 1
  }

  const nomineeKey = normalizedRecord.nomineeAddress || normalizedRecord.nomineeName.toLowerCase()
  if (nomineeKey && !session.uniqueNomineeKeys[nomineeKey]) {
    session.uniqueNomineeKeys[nomineeKey] = true
    session.summary.uniqueNominees += 1
  }

  const nominatorKey =
    normalizedRecord.nominatorAddress || normalizedRecord.nominatorName.toLowerCase()
  if (!nominatorKey) {
    return
  }

  let row = session.nominatorRowsByKey[nominatorKey]
  if (!row) {
    row = {
      key: nominatorKey,
      displayName: normalizedRecord.nominatorName || "Unknown",
      address: normalizedRecord.nominatorAddress || "",
      nominationCount: 0,
      convertedCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      kickedCount: 0,
      bannedCount: 0,
      lastNominationAt: 0,
    }
    session.nominatorRowsByKey[nominatorKey] = row
    session.summary.uniqueNominators += 1
  }

  row.nominationCount += 1
  if (normalizedRecord.isConverted) {
    row.convertedCount += 1
  }
  if (normalizedRecord.isApprovedInvite) {
    row.approvedCount += 1
  }
  if (normalizedRecord.isPendingInvite) {
    row.pendingCount += 1
  }
  if (normalizedRecord.isKicked) {
    row.kickedCount += 1
  }
  if (normalizedRecord.isBanned) {
    row.bannedCount += 1
  }
  row.lastNominationAt = Math.max(row.lastNominationAt || 0, normalizedRecord.createdAt || 0)
}

const buildStatsSnapshotFromSession = (session = null) => {
  if (!session) {
    return null
  }

  const rollups = buildStatsSnapshotRollups(session)
  const nominators = Object.values(session.nominatorRowsByKey || {})
    .map((row) => ({
      ...row,
      conversionLabel: formatStatsPercent(
        row.nominationCount > 0 ? row.convertedCount / row.nominationCount : 0
      ),
    }))
    .sort((a, b) => {
      if (b.nominationCount !== a.nominationCount) {
        return b.nominationCount - a.nominationCount
      }
      if (b.convertedCount !== a.convertedCount) {
        return b.convertedCount - a.convertedCount
      }
      return b.lastNominationAt - a.lastNominationAt
    })

  const currentCards = Array.isArray(session.records)
    ? session.records.filter((record) => !record.isLegacy)
    : []
  const legacyCards = Array.isArray(session.records)
    ? session.records.filter((record) => record.isLegacy)
    : []

  const uniqueNominators = Object.keys(session.nominatorRowsByKey || {}).length
  const uniqueNominees = Object.keys(session.uniqueNomineeKeys || {}).length
  const legacyPublisherSummary = rollups.legacyPublisherSummary || {}
  const legacyPublisherRows = Array.isArray(rollups.legacyPublisherRows)
    ? rollups.legacyPublisherRows
    : []
  const adminSummary = rollups.adminSummary || {}
  const adminPublisherRows = Array.isArray(rollups.adminPublisherRows)
    ? rollups.adminPublisherRows
    : []
  const referenceData = {
    minterGroupAddresses: Array.isArray(session.referenceData?.minterGroupAddresses)
      ? session.referenceData.minterGroupAddresses.map((value) =>
          String(value || "").trim()
        )
      : [],
    minterAdminAddresses: Array.isArray(
      session.referenceData?.minterAdminAddresses
    )
      ? session.referenceData.minterAdminAddresses.map((value) =>
          String(value || "").trim()
        )
      : [],
  }

  return {
    schemaVersion: 2,
    generatedAt: Number(session.snapshotTimestamp || Date.now()),
    compiledAt: Date.now(),
    generatedBy: {
      name: userState.accountName || "",
      address: userState.accountAddress || "",
    },
    compile: {
      completed: Boolean(session.completed),
      resumedFromProgress: Boolean(session.resumedFromProgress),
      checkpointIdentifier: String(session.progressIdentifier || ""),
      batchesProcessed: Number(session.batchesProcessed || 0),
      batchSize: Number(session.batchSize || STATS_COMPILE_BATCH_SIZE),
      finishedAt: session.completed ? Date.now() : 0,
    },
    source: {
      prefix: MINTER_STATS_IDENTIFIER_PREFIX,
      cardCount: Number(session.source?.cardCount || 0),
      legacyCutoff: Number(
        session.source?.legacyCutoff || NOMINATOR_METHOD_START_TS
      ),
      latestCardTimestamp: Number(session.source?.latestCardTimestamp || 0),
      progressIdentifier: String(session.progressIdentifier || ""),
    },
    referenceData,
    summary: {
      totalNominations: Number(session.summary?.totalNominations || 0),
      uniqueNominators,
      uniqueNominees,
      totalConvertedToMinter: Number(session.summary?.totalConvertedToMinter || 0),
      totalApprovedInvites: Number(session.summary?.totalApprovedInvites || 0),
      totalPendingInvites: Number(session.summary?.totalPendingInvites || 0),
      totalKickedAndBanned: Number(session.summary?.totalKickedAndBanned || 0),
      legacyCardCount: Number(session.summary?.legacyCardCount || 0),
      legacyConvertedToMinter: Number(session.summary?.legacyConvertedToMinter || 0),
      legacyApprovedInvites: Number(session.summary?.legacyApprovedInvites || 0),
      legacyPendingInvites: Number(session.summary?.legacyPendingInvites || 0),
      legacyKickedAndBanned: Number(session.summary?.legacyKickedAndBanned || 0),
      conversionLabel: formatStatsPercent(
        currentCards.length > 0
          ? Number(session.summary?.totalConvertedToMinter || 0) / currentCards.length
          : 0
      ),
      legacyConversionLabel: formatStatsPercent(
        legacyCards.length > 0
          ? Number(session.summary?.legacyConvertedToMinter || 0) / legacyCards.length
          : 0
      ),
    },
    nominators,
    legacyCards,
    cards: currentCards,
    legacyStats: {
      cardCount: Number(legacyPublisherSummary.totalCards || legacyCards.length || 0),
      publisherCount: Number(legacyPublisherRows.length || 0),
      invitedCount: Number(legacyPublisherSummary.invitedCount || 0),
      pendingCount: Number(legacyPublisherSummary.pendingCount || 0),
      currentMinterCount: Number(legacyPublisherSummary.currentMinterCount || 0),
      kickedCount: Number(legacyPublisherSummary.kickedCount || 0),
      bannedCount: Number(legacyPublisherSummary.bannedCount || 0),
      leaderboard: legacyPublisherRows,
      invitedLabel: formatStatsPercent(
        legacyCards.length > 0
          ? Number(legacyPublisherSummary.invitedCount || 0) / legacyCards.length
          : 0
      ),
      currentLabel: formatStatsPercent(
        legacyCards.length > 0
          ? Number(legacyPublisherSummary.currentMinterCount || 0) / legacyCards.length
          : 0
      ),
    },
    adminStats: {
      cardCount: Number(adminSummary.cardCount || 0),
      publisherCount: Number(adminSummary.publisherCount || 0),
      legacyCardCount: Number(adminSummary.legacyCardCount || 0),
      currentCardCount: Number(adminSummary.currentCardCount || 0),
      currentMinterCount: Number(adminSummary.currentMinterCount || 0),
      leaderboard: adminPublisherRows,
      currentLabel: formatStatsPercent(
        Number(adminSummary.cardCount || 0) > 0
          ? Number(adminSummary.currentMinterCount || 0) /
              Number(adminSummary.cardCount || 0)
          : 0
      ),
    },
  }
}

const publishStatsCompileCheckpoint = async (session = null) => {
  if (!session) {
    return null
  }
  if (!getStatsBoardCanPublish()) {
    alert("Only Minter Admins and App Admins can publish stats snapshots.")
    return null
  }
  if (!userState.accountName) {
    alert("A registered name is required to publish stats snapshots.")
    return null
  }

  session.generatedBy = {
    name: userState.accountName || "",
    address: userState.accountAddress || "",
  }

  const resource = await buildStatsCompileCheckpointPublishResource(session)
  if (!resource) {
    return null
  }

  await publishStatsResources([resource])
  const payload = serializeStatsCompileSession(session)
  statsBoardState.latestProgressCheckpoint = payload
  statsBoardState.latestProgressLoadedAt = Date.now()
  return resource.identifier
}

const compileStatsBoardRecord = async (resource = {}, { onIssue = null } = {}) => {
  const emitIssue = (reason = "", detail = "") => {
    if (typeof onIssue === "function") {
      onIssue({
        identifier: String(resource?.identifier || "").trim(),
        reason: String(reason || "").trim(),
        detail: String(detail || "").trim(),
      })
    }
  }

  try {
    const cardData = await fetchMinterBoardCardDataCached(resource)
    if (!cardData || !cardData.poll) {
      emitIssue("missing-poll", "Unable to load poll data for this card.")
      return null
    }

    const eraClassification = classifyStatsBoardEra(resource, cardData)
    const createdAt = Number(eraClassification.createdAt || 0)
    const isLegacy = Boolean(eraClassification.isLegacy)
    const publisherName = getStatsBoardNominatorName(
      cardData,
      cardData.publishedBy || resource.name || ""
    )
    const publisherAddress = getStatsBoardNominatorAddress(
      cardData,
      cardData.publishedByAddress || ""
    )
    const nomineeName = getStatsBoardNomineeName(cardData)
    const nominatorName = getStatsBoardNominatorName(
      cardData,
      cardData.publishedBy || resource.name || ""
    )
    const nominatorAddress = publisherAddress
    const nomineeAddress = isLegacy
      ? publisherAddress || getStatsBoardNomineeAddress(cardData, "")
      : typeof resolveCardNomineeAddress === "function"
        ? await resolveCardNomineeAddress(resource, cardData).catch(() => "")
        : getStatsBoardNomineeAddress(cardData, "")

    const targetName = isLegacy ? publisherName : nomineeName
    const targetAddress = isLegacy ? publisherAddress : nomineeAddress

    if (!targetName && !targetAddress) {
      emitIssue(
        "missing-target",
        "Unable to resolve a target publisher or nominee address for stats classification."
      )
    }

    let inviteDisplayStatus = ""
    let isApprovedInvite = false
    let isPendingInvite = false
    let isKicked = false
    let isBanned = false

    if (targetName || targetAddress) {
      const inviteState = await resolveMinterBoardListTimelineState(
        targetAddress || "",
        targetName || "",
        true
      ).catch(() => ({
        displayStatus: "",
        hasApprovedInvite: false,
        hasPendingInvite: false,
        hasKicked: false,
        hasBanned: false,
      }))
      inviteDisplayStatus =
        inviteState.displayStatus ||
        getMinterBoardInviteDisplayStatus(inviteState) ||
        ""
      isApprovedInvite = inviteDisplayStatus === "invited"
      isPendingInvite = inviteDisplayStatus === "pending"
      isKicked = inviteDisplayStatus === "kicked"
      isBanned = inviteDisplayStatus === "banned"
    }

    const convertedLookupKey = targetAddress || targetName || resource.name || ""
    const isConverted = convertedLookupKey
      ? await verifyMinterCached(convertedLookupKey).catch(() => false)
      : false

    return {
      cardIdentifier: resource.identifier || "",
      createdAt,
      isLegacy,
      publisherName,
      publisherAddress,
      nomineeName,
      nomineeAddress,
      nominatorName,
      nominatorAddress,
      inviteDisplayStatus,
      isConverted,
      isApprovedInvite,
      isPendingInvite,
      isKicked,
      isBanned,
    }
  } catch (error) {
    emitIssue(
      "compile-error",
      String(error?.message || error || "Unable to compile this card.")
    )
    console.warn("Unable to compile stats record:", resource?.identifier, error)
    return null
  }
}

const processStatsCompileBatch = async (
  session = null,
  { onProgress = null, onIssue = null } = {}
) => {
  if (!session) {
    return null
  }

  const emitProgress = (update = {}) => {
    if (typeof onProgress === "function") {
      onProgress(update)
    }
  }

  const totalResources = Array.isArray(session.source?.resources)
    ? session.source.resources.length
    : 0
  if (totalResources <= 0) {
    session.completed = true
    session.summary.uniqueNominators = Object.keys(session.nominatorRowsByKey || {}).length
    session.summary.uniqueNominees = Object.keys(session.uniqueNomineeKeys || {}).length
    emitProgress({
      key: "load-source",
      status: "done",
      detail: "No cards were found for compilation.",
    })
    emitProgress({
      key: "classify-era",
      status: "done",
      detail: "No records needed classification.",
    })
    emitProgress({
      key: "aggregate",
      status: "done",
      detail: "No leaderboard rows were built.",
    })
    return session
  }

  if (session.nextIndex >= totalResources) {
    session.completed = true
    session.summary.uniqueNominators = Object.keys(session.nominatorRowsByKey || {}).length
    session.summary.uniqueNominees = Object.keys(session.uniqueNomineeKeys || {}).length
    return session
  }

  const batchStartIndex = Math.max(0, Number(session.nextIndex || 0))
  const batchEndIndex = Math.min(
    totalResources,
    batchStartIndex + Math.max(1, Number(session.batchSize || STATS_COMPILE_BATCH_SIZE))
  )
  const batchResources = session.source.resources.slice(batchStartIndex, batchEndIndex)

  emitProgress({
    key: "classify-era",
    status: "active",
    detail:
      batchResources.length > 0
        ? `Classifying card data by publish date and payload markers (${batchStartIndex + 1}-${batchEndIndex} of ${totalResources}).`
        : "No cards left to classify.",
  })

  const tasks = batchResources.map(
    (resource) => async () =>
      compileStatsBoardRecord(resource, {
        onIssue,
      })
  )
  const batchRecords = (await runWithConcurrency(tasks, 5)).filter(Boolean)

  batchRecords.forEach((record) => addStatsCompileRecordToSession(session, record))
  const failedRecords = Math.max(batchResources.length - batchRecords.length, 0)
  if (failedRecords > 0) {
    session.validationIssueCount = Number(session.validationIssueCount || 0) + failedRecords
  }
  session.nextIndex = batchEndIndex
  session.batchesProcessed = Number(session.batchesProcessed || 0) + 1
  session.updatedAt = Date.now()
  session.completed = session.nextIndex >= totalResources
  session.summary.uniqueNominators = Object.keys(session.nominatorRowsByKey || {}).length
  session.summary.uniqueNominees = Object.keys(session.uniqueNomineeKeys || {}).length

  emitProgress({
    key: "classify-era",
    status: "done",
    detail: `Processed ${session.nextIndex}/${totalResources} cards.`,
  })
  emitProgress({
    key: "aggregate",
    status: session.completed ? "done" : "active",
    detail:
      session.summary.totalNominations > 0
        ? session.completed
          ? `Built ${session.summary.uniqueNominators || 0} nominator rows and ${session.summary.legacyCardCount || 0} legacy cards.`
          : `Built ${session.summary.uniqueNominators || 0} nominator rows and ${session.summary.legacyCardCount || 0} legacy cards so far.`
        : "No nominator-era rows were built yet.",
  })

  return session
}

const ensureStatsCompileModal = () => {
  if (document.getElementById(`${STATS_COMPILE_MODAL_TYPE}-modal`)) {
    return
  }
  if (typeof createModal === "function") {
    createModal(STATS_COMPILE_MODAL_TYPE)
  }
}

const closeStatsCompileModal = () => {
  if (typeof closeModal === "function") {
    closeModal(STATS_COMPILE_MODAL_TYPE)
  }
  if (
    statsBoardState.compiling ||
    statsCompileModalState.phase === "progress" ||
    statsCompileModalState.phase === "paused"
  ) {
    statsCompileModalState.hidden = true
    renderStatsCompileWorkflowBanner()
    return
  }
  statsCompileModalState.hidden = false
  statsCompileModalState.phase = "options"
  statsCompileModalState.workflow = "compile"
  statsCompileModalState.timestampMode = "now"
  statsCompileModalState.customTimestampInput = formatStatsTimestampInputValue()
  statsCompileModalState.snapshotTimestamp = Date.now()
  statsCompileModalState.identifierPreview = ""
  statsCompileModalState.message = ""
  statsCompileModalState.subtitle = ""
  statsCompileModalState.steps = []
  statsCompileModalState.errorMessage = ""
  statsCompileModalState.validationReport = null
}

const updateStatsCompileModalPreview = () => {
  const modeEl = getStatsCompileTimestampModeEl()
  const customEl = getStatsCompileCustomTimestampEl()
  const customWrap = document.getElementById("stats-compile-custom-wrap")
  const previewEl = getStatsCompileIdentifierPreviewEl()
  const statusEl = getStatsCompileStatusEl()
  const noteEl = getStatsCompileNoteEl()

  if (modeEl) {
    statsCompileModalState.timestampMode = String(modeEl.value || "now")
  }

  if (customEl) {
    statsCompileModalState.customTimestampInput = String(customEl.value || "")
  }

  const resolvedTimestamp = resolveStatsCompileTimestamp()
  statsCompileModalState.snapshotTimestamp = resolvedTimestamp
  statsCompileModalState.identifierPreview = `${MINTER_STATS_IDENTIFIER_PREFIX}-${resolvedTimestamp}`

  if (customWrap) {
    customWrap.style.display =
      statsCompileModalState.timestampMode === "custom" ? "flex" : "none"
  }

  if (previewEl) {
    previewEl.textContent = statsCompileModalState.identifierPreview
  }

  if (statusEl) {
    statusEl.textContent =
      statsCompileModalState.timestampMode === "custom"
        ? "Custom timestamps backdate the snapshot label only; they do not schedule a future publish."
        : statsCompileModalState.timestampMode === "latest"
        ? "The latest snapshot timestamp will be reused when available."
        : "The selected timestamp will be baked into the snapshot identifier."
  }

  if (noteEl) {
    noteEl.textContent =
      "Cards published before June 2026 are counted as legacy activity and excluded from the nominator leaderboard."
  }
}

const buildStatsValidationReportHtml = (report = null) => {
  if (!report) {
    return ""
  }

  const issueSamples = Array.isArray(report.issueSamples) ? report.issueSamples : []
  const verifiedCheckpointValue = report.verifiedProgressCheckpoint ? "Yes" : "No"

  return `
    <div class="stats-validation-report">
      <div class="stats-validation-report-grid">
        ${buildStatsMetricCardHtml(
          "Source cards",
          report.sourceCount || 0,
          "Cards scanned during validation"
        )}
        ${buildStatsMetricCardHtml(
          "Compiled cards",
          report.compiledCount || 0,
          "Cards that passed the audit"
        )}
        ${buildStatsMetricCardHtml(
          "Issues found",
          report.validationIssueCount || 0,
          report.validationIssueCount > 0
            ? "Review the sample issues below"
            : "No missing data was detected"
        )}
        ${buildStatsMetricCardHtml(
          "Verified snapshots",
          report.verifiedSnapshotCount || 0,
          "Admin-published snapshot history"
        )}
        ${buildStatsMetricCardHtml(
          "Verified checkpoint",
          verifiedCheckpointValue,
          report.verifiedProgressIdentifier
            ? `Checkpoint ${report.verifiedProgressIdentifier}`
            : "No active admin checkpoint"
        )}
      </div>
      ${
        issueSamples.length > 0
          ? `
            <div class="stats-validation-issues">
              <div class="stats-validation-issues-header">
                <strong>Sample issues</strong>
                <span>${qEscapeHtml(String(issueSamples.length))} shown</span>
              </div>
              <div class="stats-validation-issues-list">
                ${issueSamples
                  .map(
                    (issue) => `
                      <article class="stats-validation-issue">
                        <p class="stats-validation-issue-id">${qEscapeHtml(
                          issue.identifier || "Unknown card"
                        )}</p>
                        <p class="stats-validation-issue-reason">${qEscapeHtml(
                          issue.reason || "validation-issue"
                        )}</p>
                        ${
                          issue.detail
                            ? `<p class="stats-validation-issue-detail">${qEscapeHtml(
                                issue.detail
                              )}</p>`
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : `
            <div class="stats-empty-state">
              No blocking source issues were found during validation.
            </div>
          `
      }
    </div>
  `
}

const buildStatsCompileOptionsHtml = () => {
  const customTimestampValue =
    statsCompileModalState.customTimestampInput ||
    formatStatsTimestampInputValue(statsCompileModalState.snapshotTimestamp)
  const selectedMode = String(statsCompileModalState.timestampMode || "latest")
  const identifierPreview = statsCompileModalState.identifierPreview ||
    `${MINTER_STATS_IDENTIFIER_PREFIX}-${statsCompileModalState.snapshotTimestamp}`
  const customWrapStyle = selectedMode === "custom" ? "" : "display: none;"
  const latestProgressCheckpoint = statsBoardState.latestProgressCheckpoint
  const hasResumableProgress = Boolean(
    latestProgressCheckpoint && !latestProgressCheckpoint.completed
  )
  const resumableProgressSummary = getStatsResumeCheckpointSummary(
    latestProgressCheckpoint
  )
  const resumableProgressMarkup = hasResumableProgress
    ? `
      <div class="stats-compile-resume-card">
        <div>
          <p class="stats-compile-resume-kicker">Resume previous update</p>
          <h3>Continue a saved stats checkpoint</h3>
          <p>
            ${qEscapeHtml(
              resumableProgressSummary
                ? `Checkpoint ${resumableProgressSummary.checkpointIdentifier || "Unavailable"} has processed ${resumableProgressSummary.processed} of ${resumableProgressSummary.total} cards.`
                : `Checkpoint ${latestProgressCheckpoint.progressIdentifier || "Unavailable"} has processed ${Number(
                    latestProgressCheckpoint.nextIndex || 0
                  )} of ${Number(
                    latestProgressCheckpoint.source?.cardCount ||
                      latestProgressCheckpoint.source?.resources?.length ||
                      0
                  )} cards.`
            )}
          </p>
          <p class="stats-compile-resume-note">
            ${
              resumableProgressSummary
                ? `Resuming will continue at card ${resumableProgressSummary.nextCardNumber} with ${resumableProgressSummary.remaining} remaining. Any admin can resume from where the previous batch stopped.`
                : "Any admin can resume from where the previous batch stopped."
            }
          </p>
        </div>
        <button
          type="button"
          class="stats-action-button stats-action-button--primary"
          onclick="continuePreviousStatsCompilation()"
        >
          Resume update
        </button>
      </div>
    `
    : ""

  return `
    <div class="stats-compile-modal-shell">
      <div class="stats-compile-modal-header">
        <div>
          <p class="stats-compile-modal-kicker">Update stats</p>
          <h2 class="stats-compile-modal-title">Prepare a stats update</h2>
          <p class="stats-compile-modal-subtitle">
            Cards published before June 2026 are treated as legacy activity and are not counted as nominator submissions. Choose the latest snapshot mode to update the current resource in place, validate the existing data, or re-create the stats from scratch.
          </p>
        </div>
        <span class="stats-compile-modal-badge">Admins only</span>
      </div>

      <div class="stats-compile-modal-note">
        Pick the timestamp that will be baked into the snapshot identifier. Choosing <strong>Update latest snapshot</strong> keeps the newest stats identifier in place when one already exists, rather than creating a brand-new entry. Validation is read-only and re-create starts over from the beginning.
        When the most recent checkpoint is already finished, Update stats will try to reuse it as a baseline if the source list still matches; otherwise it falls back to a full rebuild.
      </div>

      <div class="stats-compile-field">
        <label class="stats-compile-label" for="stats-compile-timestamp-mode">
          Snapshot timestamp
        </label>
        <select
          id="stats-compile-timestamp-mode"
          class="stats-compile-select"
          onchange="updateStatsCompileModalPreview()"
        >
          <option value="latest" ${selectedMode === "latest" ? "selected" : ""}>
            Update latest snapshot
          </option>
          <option value="now" ${selectedMode === "now" ? "selected" : ""}>
            Use current time
          </option>
          <option value="minus-6-hours" ${selectedMode === "minus-6-hours" ? "selected" : ""}>
            Backdate 6 hours
          </option>
          <option value="minus-1-day" ${selectedMode === "minus-1-day" ? "selected" : ""}>
            Backdate 1 day
          </option>
          <option value="minus-1-week" ${selectedMode === "minus-1-week" ? "selected" : ""}>
            Backdate 1 week
          </option>
          <option value="custom" ${selectedMode === "custom" ? "selected" : ""}>
            Custom date and time
          </option>
        </select>
      </div>

      <div
        id="stats-compile-custom-wrap"
        class="stats-compile-field stats-compile-field--custom"
        style="${customWrapStyle}"
      >
        <label class="stats-compile-label" for="stats-compile-custom-timestamp">
          Custom date and time
        </label>
        <input
          id="stats-compile-custom-timestamp"
          class="stats-compile-input"
          type="datetime-local"
          value="${qEscapeAttr(customTimestampValue)}"
          onchange="updateStatsCompileModalPreview()"
        />
      </div>

      <div class="stats-compile-preview">
        <span class="stats-compile-preview-label">Identifier preview</span>
        <code id="stats-compile-identifier-preview" class="stats-compile-preview-code">${qEscapeHtml(
          identifierPreview
        )}</code>
      </div>

      ${resumableProgressMarkup}

      <div id="stats-compile-status" class="stats-compile-status">
        ${
          hasResumableProgress && resumableProgressSummary
            ? `Resuming will continue at card ${resumableProgressSummary.nextCardNumber} of ${resumableProgressSummary.total} (${resumableProgressSummary.remaining} remaining).`
            : "Each update batch saves a resumable checkpoint, so another admin can continue later if needed."
        }
      </div>

      <p id="stats-compile-note" class="stats-compile-note">
        Legacy cards are excluded from the nominator leaderboard but remain available in the snapshot summary.
        You can hide the workflow window while it runs and keep following the live status banner.
      </p>

      <div class="stats-compile-actions">
        <button type="button" class="stats-action-button" onclick="closeStatsCompileModal()">
          Cancel
        </button>
        <button
          type="button"
          class="stats-action-button"
          title="Audit the source data and admin-published stats resources without publishing anything."
          onclick="startStatsValidationFromModal()"
        >
          Validate data
        </button>
        <button
          type="button"
          class="stats-action-button stats-action-button--warning"
          title="Restart the stats update from the beginning."
          onclick="recreateStatsDataFromModal()"
        >
          Re-create stats data
        </button>
        <button
          type="button"
          class="stats-action-button stats-action-button--primary"
          onclick="startStatsCompileFromModal()"
        >
          Update stats
        </button>
      </div>
    </div>
  `
}

const buildStatsCompileProgressHtml = () => {
  const steps = Array.isArray(statsCompileModalState.steps)
    ? statsCompileModalState.steps
    : []
  const phase = String(statsCompileModalState.phase || "progress")
  const workflow = String(statsCompileModalState.workflow || "compile")
  const isValidation = workflow === "validation"
  const isRecreate = workflow === "recreate"
  const isPaused = phase === "paused"
  const title =
    phase === "complete"
      ? isValidation
        ? "Stats data validated"
        : isRecreate
        ? "Stats data re-created"
        : "Stats snapshot updated"
      : isPaused
      ? "Stats update saved"
      : phase === "error"
      ? isValidation
        ? "Stats validation failed"
        : "Stats update failed"
      : isValidation
      ? "Validating stats data"
      : isRecreate
      ? "Re-creating stats data"
      : "Updating stats snapshot"
  const badgeLabel =
    phase === "complete"
      ? isValidation
        ? "Validated"
        : isRecreate
        ? "Re-created"
        : "Updated"
      : isPaused
      ? "Saved"
      : phase === "error"
      ? "Error"
      : "Working"
  const kickerLabel = isValidation
    ? "Validation"
    : isRecreate
    ? "Re-create"
    : "Updating"
  const statusMessage =
    phase === "complete"
      ? statsCompileModalState.message ||
        (isValidation
          ? "The validation run finished."
          : "The snapshot is live and the dashboard is ready to refresh.")
      : isPaused
      ? statsCompileModalState.message ||
        "A resumable checkpoint was saved and can be continued later."
      : phase === "error"
      ? statsCompileModalState.errorMessage ||
        (isValidation
          ? "Something interrupted the validation."
          : "Something interrupted the update.")
      : statsCompileModalState.message ||
        (isValidation
          ? "Working through the validation checks."
          : "Working through the snapshot update and publish steps.")
  const footerNote =
    phase === "complete"
      ? isValidation
        ? "Validation does not publish anything. Use the results to decide whether to re-create the stats data."
        : "You can refresh the Stats board to see the updated snapshot history."
      : isPaused
      ? "Any admin can continue this saved checkpoint from the Stats page."
      : phase === "error"
      ? "You can close this modal and try again once the underlying issue is resolved."
      : isValidation
      ? "Validation runs batch-by-batch through the data without publishing."
      : "This run keeps going batch-by-batch until it finishes. You can hide this window and keep following the live status banner, or use Pause after current batch to save a checkpoint."

  return `
    <div class="publish-progress-modal-shell stats-compile-progress-shell">
      <div class="publish-progress-modal-header">
        <div>
          <p class="publish-progress-modal-kicker">${qEscapeHtml(kickerLabel)}</p>
          <h2 class="publish-progress-modal-title">${qEscapeHtml(title)}</h2>
          ${
            statsCompileModalState.subtitle
              ? `<p class="publish-progress-modal-subtitle">${qEscapeHtml(
                  statsCompileModalState.subtitle
                )}</p>`
              : `<p class="publish-progress-modal-subtitle">
                  Cards published before June 2026 are summarized as legacy activity and not treated as nominators.
                </p>`
          }
        </div>
        <span class="publish-progress-modal-badge">${qEscapeHtml(badgeLabel)}</span>
      </div>

      <p class="publish-progress-modal-message">${qEscapeHtml(statusMessage)}</p>

      <div class="publish-progress-step-list" role="list">
        ${steps
          .map((step, index) => buildBoardPublishProgressStepHtml(step, index))
          .join("")}
      </div>

      ${isValidation ? buildStatsValidationReportHtml(statsCompileModalState.validationReport) : ""}

      <div class="publish-progress-modal-footer">
        ${getBoardInlineLoadingHTML(
          phase === "complete"
            ? isValidation
              ? "Validation completed successfully."
              : isRecreate
              ? "Stats data re-created successfully."
              : "Snapshot updated successfully."
            : isPaused
            ? "Checkpoint saved successfully."
            : phase === "error"
            ? isValidation
              ? "Validation stopped."
              : "Updating stopped."
            : isValidation
            ? "Working through the validation checks..."
            : "Working through the stats update..."
        )}
        <div class="stats-compile-footer-actions">
          ${
            phase === "complete"
              ? isValidation
                ? `<button type="button" class="stats-action-button stats-action-button--primary" onclick="recreateStatsDataFromModal()">
                    Re-create stats data
                  </button>`
                : `<button type="button" class="stats-action-button stats-action-button--primary" onclick="refreshStatsBoardView({ force: true }); closeStatsCompileModal();">
                    Refresh board
                  </button>`
              : isPaused
              ? `<button type="button" class="stats-action-button stats-action-button--primary" onclick="continuePreviousStatsCompilation()">
                  Resume update
                </button>`
              : phase === "progress" && !isValidation
              ? `<button type="button" class="stats-action-button stats-action-button--primary" onclick="requestStatsCompilePause()" ${
                  statsBoardState.pauseRequested ? "disabled" : ""
                }>
                  ${
                    statsBoardState.pauseRequested
                      ? "Pausing..."
                      : "Pause after current batch"
                  }
                </button>`
              : ""
          }
          <button type="button" class="stats-action-button" onclick="closeStatsCompileModal()">
            Close
          </button>
        </div>
      </div>

      <p class="publish-progress-modal-footer-note">${qEscapeHtml(footerNote)}</p>
    </div>
  `
}

const renderStatsCompileModal = () => {
  ensureStatsCompileModal()
  const modal = document.getElementById(`${STATS_COMPILE_MODAL_TYPE}-modal`)
  const modalContent = getStatsCompileModalContent()
  if (!modal || !modalContent) {
    return
  }

  if (statsCompileModalState.hidden) {
    modal.style.display = "none"
    return
  }

  modalContent.innerHTML =
    statsCompileModalState.phase === "options"
      ? buildStatsCompileOptionsHtml()
      : buildStatsCompileProgressHtml()
  modal.style.display = "block"

  if (statsCompileModalState.phase === "options") {
    updateStatsCompileModalPreview()
  }
}

const buildStatsSectionNavLinkHtml = (
  sectionKey = "",
  label = "",
  note = "",
  isActive = false
) => {
  const routeHash =
    typeof buildBoardRouteHash === "function"
      ? buildBoardRouteHash({ board: "stats", section: sectionKey })
      : `#/${["stats", sectionKey].filter(Boolean).join("/")}`
  return `
    <a
      href="${qEscapeAttr(routeHash)}"
      class="stats-section-nav-link${isActive ? " stats-section-nav-link--active" : ""}"
      data-stats-section-link="${qEscapeAttr(sectionKey)}"
      ${isActive ? 'aria-current="page"' : ""}
    >
      <span class="stats-section-nav-link-label">${qEscapeHtml(label)}</span>
      ${
        note
          ? `<span class="stats-section-nav-link-note">${qEscapeHtml(note)}</span>`
          : ""
      }
    </a>
  `
}

const buildStatsSectionNavHtml = (activeSection = "live") => {
  const normalizedSection = normalizeStatsSectionKey(activeSection)
  return `
    <nav class="stats-section-nav" aria-label="Stats sections">
      ${buildStatsSectionNavLinkHtml(
        "live",
        "Live Minting Stats",
        "Current MINTER group and online level counts",
        normalizedSection === "live"
      )}
      ${buildStatsSectionNavLinkHtml(
        "historic",
        "Historic Mintership Data",
        "Published long-term stats and leaderboards",
        normalizedSection === "historic"
      )}
      ${buildStatsSectionNavLinkHtml(
        "publish",
        "Publish Data",
        "Snapshot metrics, metadata, and recent history",
        normalizedSection === "publish"
      )}
      ${buildStatsSectionNavLinkHtml(
        "nominator",
        "Nominator Stats",
        "The current publish-era leaderboard",
        normalizedSection === "nominator"
      )}
      ${buildStatsSectionNavLinkHtml(
        "legacy",
        "Legacy Stats",
        "Pre-June 2026 publisher lifecycle data",
        normalizedSection === "legacy"
      )}
      ${buildStatsSectionNavLinkHtml(
        "admin",
        "Minter Admin Stats",
        "Current admin-publisher overview",
        normalizedSection === "admin"
      )}
      ${buildStatsSectionNavLinkHtml(
        "nominator-leaderboard",
        "Minter Leaderboards",
        "Jump to the nominator leaderboard",
        normalizedSection === "nominator-leaderboard"
      )}
      ${buildStatsSectionNavLinkHtml(
        "legacy-leaderboard",
        "Legacy Leaderboards",
        "Jump to legacy publisher ranking",
        normalizedSection === "legacy-leaderboard"
      )}
      ${buildStatsSectionNavLinkHtml(
        "admin-leaderboard",
        "MinterAdmin Leaderboards",
        "Jump to admin publisher ranking",
        normalizedSection === "admin-leaderboard"
      )}
    </nav>
  `
}

const renderStatsSectionNavState = (activeSection = "live") => {
  setStatsBoardSectionActiveState(activeSection)
}

const renderStatsLegacySection = (snapshot = null) => {
  const summaryGrid = document.getElementById("stats-legacy-summary-grid")
  const leaderboardContainer = document.getElementById(
    "stats-legacy-leaderboard-container"
  )
  const metaContainer = document.getElementById("stats-legacy-meta-container")

  if (summaryGrid) {
    summaryGrid.innerHTML = buildStatsLegacySectionSummaryHtml(snapshot)
  }
  if (leaderboardContainer) {
    leaderboardContainer.innerHTML = buildStatsLegacyLeaderboardHtml(snapshot)
  }
  if (metaContainer) {
    metaContainer.innerHTML = buildStatsLegacySectionNoteHtml(snapshot)
  }
}

const renderStatsAdminSection = (snapshot = null) => {
  const summaryGrid = document.getElementById("stats-admin-summary-grid")
  const leaderboardContainer = document.getElementById(
    "stats-admin-leaderboard-container"
  )
  const metaContainer = document.getElementById("stats-admin-meta-container")

  if (summaryGrid) {
    summaryGrid.innerHTML = buildStatsAdminSectionSummaryHtml(snapshot)
  }
  if (leaderboardContainer) {
    leaderboardContainer.innerHTML = buildStatsAdminLeaderboardHtml(snapshot)
  }
  if (metaContainer) {
    metaContainer.innerHTML = buildStatsAdminSectionNoteHtml(snapshot)
  }
}

const openStatsCompileModal = () => {
  const latestSnapshotTimestamp = getStatsLatestPublishedTimestamp()
  statsCompileModalState.hidden = false
  statsCompileModalState.phase = "options"
  statsCompileModalState.workflow = "compile"
  statsCompileModalState.timestampMode = latestSnapshotTimestamp ? "latest" : "now"
  statsCompileModalState.customTimestampInput = formatStatsTimestampInputValue()
  statsCompileModalState.snapshotTimestamp = latestSnapshotTimestamp || Date.now()
  statsCompileModalState.identifierPreview =
    `${MINTER_STATS_IDENTIFIER_PREFIX}-${statsCompileModalState.snapshotTimestamp}`
  statsCompileModalState.message = ""
  statsCompileModalState.subtitle = ""
  statsCompileModalState.steps = buildStatsCompileSteps("compile")
  statsCompileModalState.errorMessage = ""
  statsCompileModalState.validationReport = null
  renderStatsCompileModal()
}

const showStatsCompileProgressModal = () => {
  statsCompileModalState.hidden = false
  renderStatsCompileModal()
  renderStatsCompileWorkflowBanner()
}

const updateStatsCompileProgressModal = (updates = {}) => {
  if (typeof updates.phase !== "undefined") {
    statsCompileModalState.phase = String(updates.phase || "progress")
  }
  if (typeof updates.message !== "undefined") {
    statsCompileModalState.message = String(updates.message || "")
  }
  if (typeof updates.subtitle !== "undefined") {
    statsCompileModalState.subtitle = String(updates.subtitle || "")
  }
  if (typeof updates.errorMessage !== "undefined") {
    statsCompileModalState.errorMessage = String(updates.errorMessage || "")
  }
  if (Array.isArray(updates.steps)) {
    statsCompileModalState.steps = updates.steps
  }
  renderStatsCompileWorkflowBanner()
  if (!statsCompileModalState.hidden) {
    renderStatsCompileModal()
  }
}

const areStatsSourceResourcesPrefixCompatible = (
  previousResources = [],
  currentResources = []
) => {
  const normalizedPrevious = buildStatsSourceResourceList(previousResources)
  const normalizedCurrent = buildStatsSourceResourceList(currentResources)

  if (
    normalizedPrevious.length === 0 ||
    normalizedCurrent.length < normalizedPrevious.length
  ) {
    return false
  }

  for (let index = 0; index < normalizedPrevious.length; index += 1) {
    const previous = normalizedPrevious[index]
    const current = normalizedCurrent[index]
    if (
      !current ||
      previous.name !== current.name ||
      previous.identifier !== current.identifier ||
      Number(previous.created || 0) !== Number(current.created || 0) ||
      Number(previous.updated || 0) !== Number(current.updated || 0)
    ) {
      return false
    }
  }

  return true
}

const buildStatsResumeCheckpointFromCompletedRun = async (checkpoint = null) => {
  if (!checkpoint || !checkpoint.completed) {
    return null
  }

  const previousResources = buildStatsSourceResourceList(
    checkpoint?.source?.resources || []
  )
  if (previousResources.length === 0) {
    return null
  }

  const currentResources = await fetchStatsBoardSourceResources(true)
  if (
    !areStatsSourceResourcesPrefixCompatible(previousResources, currentResources)
  ) {
    return null
  }

  return {
    ...checkpoint,
    completed: false,
    resumedFromProgress: true,
    nextIndex: previousResources.length,
    updatedAt: Date.now(),
    finalSnapshotIdentifier: "",
    finalPublishedAt: 0,
    referenceData: {
      minterGroupAddresses: [],
      minterAdminAddresses: [],
    },
    source: {
      ...(checkpoint.source || {}),
      cardCount: currentResources.length,
      latestCardTimestamp: currentResources.reduce(
        (latestTimestamp, resource) =>
          Math.max(latestTimestamp, getStatsBoardTimestamp(resource)),
        0
      ),
      resources: currentResources,
    },
  }
}

const startStatsWorkflowFromModal = async ({
  workflow = "compile",
  publishTimestamp = resolveStatsCompileTimestamp(),
  resumeCheckpoint = null,
} = {}) => {
  const normalizedWorkflow =
    workflow === "validation"
      ? "validation"
      : workflow === "recreate"
      ? "recreate"
      : "compile"
  const resumeSummary = getStatsResumeCheckpointSummary(resumeCheckpoint)
  const isResumeRun = Boolean(resumeSummary) && normalizedWorkflow !== "validation"
  const effectivePublishTimestamp = isResumeRun
    ? Number(
        resumeCheckpoint?.snapshotTimestamp ||
          resumeCheckpoint?.generatedAt ||
          publishTimestamp ||
          Date.now()
      ) || Date.now()
    : publishTimestamp

  statsCompileModalState.workflow = normalizedWorkflow
  statsCompileModalState.hidden = false
  statsCompileModalState.snapshotTimestamp = effectivePublishTimestamp
  statsCompileModalState.identifierPreview =
    `${MINTER_STATS_IDENTIFIER_PREFIX}-${effectivePublishTimestamp}`
  statsCompileModalState.phase = "progress"
  statsCompileModalState.message = isResumeRun
    ? `Resuming stats update for ${formatStatsDate(effectivePublishTimestamp)}${
        resumeSummary?.checkpointIdentifier
          ? ` from checkpoint ${resumeSummary.checkpointIdentifier}`
          : ""
      }.`
    : normalizedWorkflow === "validation"
    ? `Starting stats data validation for ${formatStatsDate(effectivePublishTimestamp)}.`
    : normalizedWorkflow === "recreate"
    ? `Re-creating stats data from scratch for ${formatStatsDate(effectivePublishTimestamp)}.`
    : "Starting stats update..."
  statsCompileModalState.subtitle = isResumeRun
    ? `Continuing checkpoint ${resumeSummary?.checkpointIdentifier || "Unavailable"} at card ${resumeSummary?.nextCardNumber || 1} of ${resumeSummary?.total || 0} (${resumeSummary?.remaining || 0} remaining).`
    : normalizedWorkflow === "validation"
    ? "This audits source data and admin-published stats resources without publishing anything."
    : `Snapshot identifier will be ${statsCompileModalState.identifierPreview}.`
  statsCompileModalState.steps = buildStatsCompileSteps(normalizedWorkflow)
  statsCompileModalState.errorMessage = ""
  statsCompileModalState.validationReport = null
  renderStatsCompileModal()
  await compileStatsProgressRun({
    publishTimestamp: effectivePublishTimestamp,
    resumeCheckpoint,
    workflow: normalizedWorkflow,
  })
}

const startStatsCompileFromModal = async () => {
  const latestCheckpoint =
    statsBoardState.latestProgressCheckpoint ||
    (await fetchLatestStatsProgressCheckpoint(true))

  if (latestCheckpoint && !latestCheckpoint.completed) {
    await continuePreviousStatsCompilation()
    return
  }

  if (latestCheckpoint && latestCheckpoint.completed) {
    const resumableCheckpoint =
      await buildStatsResumeCheckpointFromCompletedRun(latestCheckpoint)
    if (resumableCheckpoint) {
      await startStatsWorkflowFromModal({
        workflow: "compile",
        publishTimestamp: resolveStatsCompileTimestamp(),
        resumeCheckpoint: resumableCheckpoint,
      })
      return
    }
  }

  await startStatsWorkflowFromModal({
    workflow: "compile",
    publishTimestamp: resolveStatsCompileTimestamp(),
  })
}

const startStatsValidationFromModal = async () => {
  await startStatsWorkflowFromModal({ workflow: "validation" })
}

const recreateStatsDataFromModal = async () => {
  await startStatsWorkflowFromModal({ workflow: "recreate" })
}

const renderStatsBoardSnapshot = (snapshot = null, resources = []) => {
  const summaryGrid = getStatsSummaryGrid()
  const leaderboardContainer = getStatsLeaderboardContainer()
  const snapshotMetaContainer = getStatsSnapshotMetaContainer()
  const historyContainer = getStatsHistoryContainer()
  const snapshotContainer = getStatsSnapshotContainer()
  const statusEl = getStatsStatusEl()

  if (snapshotContainer) {
    snapshotContainer.style.display = "block"
  }

  if (!snapshot) {
    if (summaryGrid) {
      summaryGrid.innerHTML = `
        ${buildStatsMetricCardHtml("Total nominations", "0", "Waiting for a published snapshot")}
        ${buildStatsMetricCardHtml("Unique nominators", "0")}
        ${buildStatsMetricCardHtml("Converted to minters", "0")}
        ${buildStatsMetricCardHtml("Approved invites", "0")}
        ${buildStatsMetricCardHtml("Pending invites", "0")}
        ${buildStatsMetricCardHtml("Kicked / banned", "0")}
        ${buildStatsMetricCardHtml("Legacy cards", "0", "Cards published before June 2026")}
      `
    }
    if (leaderboardContainer) {
      leaderboardContainer.innerHTML = `
        <div class="stats-empty-state">
          No stats snapshot is loaded yet.
        </div>
      `
    }
    if (snapshotMetaContainer) {
      snapshotMetaContainer.innerHTML = buildStatsSnapshotMetaHtml(null)
    }
    if (historyContainer) {
      historyContainer.innerHTML = buildStatsHistoryHtml(resources)
    }
    if (statusEl) {
      statusEl.textContent = "No published stats snapshot found yet."
    }
    renderStatsLegacySection(null)
    renderStatsAdminSection(null)
    return
  }

  const summary = snapshot.summary || {}
  if (summaryGrid) {
    summaryGrid.innerHTML = `
      ${buildStatsMetricCardHtml(
        "Total nominations",
        summary.totalNominations || 0,
        `${snapshot.source?.cardCount || 0} cards compiled`
      )}
      ${buildStatsMetricCardHtml(
        "Unique nominators",
        summary.uniqueNominators || 0
      )}
      ${buildStatsMetricCardHtml(
        "Converted to minters",
        summary.totalConvertedToMinter || 0,
        `Conversion rate ${summary.conversionLabel || "0%"}`
      )}
      ${buildStatsMetricCardHtml(
        "Approved invites",
        summary.totalApprovedInvites || 0
      )}
      ${buildStatsMetricCardHtml(
        "Pending invites",
        summary.totalPendingInvites || 0
      )}
      ${buildStatsMetricCardHtml(
        "Kicked / banned",
        summary.totalKickedAndBanned || 0
      )}
      ${buildStatsMetricCardHtml(
        "Legacy cards",
        summary.legacyCardCount || 0,
        "Cards published before June 2026"
      )}
    `
  }

  if (leaderboardContainer) {
    leaderboardContainer.innerHTML = buildStatsLeaderboardTableHtml(
      Array.isArray(snapshot.nominators) ? snapshot.nominators : [],
      { legacyCardCount: summary.legacyCardCount || 0 }
    )
  }

  if (snapshotMetaContainer) {
    snapshotMetaContainer.innerHTML = buildStatsSnapshotMetaHtml(snapshot)
  }

  if (historyContainer) {
    historyContainer.innerHTML = buildStatsHistoryHtml(resources)
  }

  if (statusEl) {
    statusEl.textContent = `Loaded stats snapshot published ${formatStatsDate(
      snapshot.generatedAt || 0
    )}.${
      Number(summary.legacyCardCount || 0) > 0
        ? ` Legacy cards before June 2026 were summarized separately.`
        : ""
    }`
  }

  renderStatsLegacySection(snapshot)
  renderStatsAdminSection(snapshot)
}

const fetchStatsSnapshotResources = async (
  force = false,
  adminAddressSet = null
) => {
  const now = Date.now()
  if (
    !force &&
    statsBoardState.snapshotResources.length > 0 &&
    now - statsBoardState.lastLoadedAt < STATS_SNAPSHOT_CACHE_TTL_MS
  ) {
    return statsBoardState.snapshotResources
  }

  const resources = await searchSimple(
    "BLOG_POST",
    MINTER_STATS_IDENTIFIER_PREFIX,
    "",
    100,
    0,
    "",
    false
  ).catch(() => [])

  const deduped = new Map()
  for (const resource of Array.isArray(resources) ? resources : []) {
    const identifier = String(resource?.identifier || "").trim()
    const name = String(resource?.name || "").trim()
    if (!identifier || !name) continue
    if (isStatsProgressIdentifier(identifier)) continue
    const key = `${name}::${identifier}`
    const current = deduped.get(key)
    if (!current || getStatsBoardTimestamp(resource) >= getStatsBoardTimestamp(current)) {
      deduped.set(key, resource)
    }
  }

  const sorted = Array.from(deduped.values()).sort(
    (a, b) => getStatsBoardTimestamp(b) - getStatsBoardTimestamp(a)
  )
  const verifiedResources = await filterAdminPublishedStatsResources(
    sorted,
    adminAddressSet instanceof Set
      ? adminAddressSet
      : (await fetchStatsBoardGroupData(force).catch(() => null))
          ?.allAdminAddressSet || new Set()
  )
  statsBoardState.snapshotResources = verifiedResources
  statsBoardState.lastLoadedAt = now
  return verifiedResources
}

const fetchLatestPublishedStatsSnapshot = async (
  force = false,
  adminAddressSet = null,
  resources = null
) => {
  const verifiedAdminAddressSet =
    adminAddressSet instanceof Set
      ? adminAddressSet
      : (await fetchStatsBoardGroupData(force).catch(() => null))
          ?.allAdminAddressSet || new Set()
  const verifiedResources = Array.isArray(resources)
    ? resources
    : await fetchStatsSnapshotResources(force, verifiedAdminAddressSet)
  const resourcesToUse = Array.isArray(resources)
    ? verifiedResources
    : await filterAdminPublishedStatsResources(
        verifiedResources,
        verifiedAdminAddressSet
      )
  const latestResource = resourcesToUse[0]
  if (!latestResource) {
    statsBoardState.latestSnapshot = null
    return null
  }

  const snapshot = await fetchStatsBoardQdnJsonResource(latestResource)
  if (!isStatsResourcePublishedByAdmin(snapshot, verifiedAdminAddressSet)) {
    statsBoardState.latestSnapshot = null
    return null
  }
  statsBoardState.latestSnapshot = snapshot || null
  return snapshot || null
}

const getStatsBoardNomineeName = (cardData = {}) =>
  getCardNomineeName(cardData) || "Unknown"

const getStatsBoardNomineeAddress = (cardData = {}, fallbackAddress = "") =>
  getCardNomineeAddress(cardData, fallbackAddress || "")

const getStatsBoardNominatorName = (cardData = {}, resourceName = "") =>
  getCardNominatorName(cardData, resourceName || "Unknown")

const getStatsBoardNominatorAddress = (cardData = {}, fallbackAddress = "") =>
  getCardNominatorAddress(cardData, fallbackAddress || "")

const fetchStatsBoardSourceResources = async (force = false) => {
  const cardResources = await fetchCachedBoardSearchResources(
    minterCardIdentifierPrefix,
    0,
    0,
    force
  ).catch(() => [])

  return buildStatsSourceResourceList(cardResources)
}

const buildStatsLiveSnapshot = async ({
  snapshotTimestamp = Date.now(),
  onProgress = null,
} = {}) => {
  const emitProgress = (update = {}) => {
    if (typeof onProgress === "function") {
      onProgress(update)
    }
  }

  emitProgress({
    key: "load-source",
    status: "active",
    detail: "Pulling published MinterBoard cards and cached metadata.",
  })

  const uniqueResources = await fetchStatsBoardSourceResources(true)
  emitProgress({
    key: "load-source",
    status: "done",
    detail: `Loaded ${uniqueResources.length} unique card records.`,
  })
  emitProgress({
    key: "classify-era",
    status: "active",
    detail:
      uniqueResources.length > 0
        ? `Classifying card data by publish date and payload markers (0/${uniqueResources.length}).`
        : "No cards found for classification.",
  })

  const totalResources = uniqueResources.length
  let classifiedCount = 0
  const classifyProgressStride = Math.max(1, Math.ceil(totalResources / 12))
  const emitClassifyProgress = () => {
    classifiedCount += 1
    if (
      classifiedCount === totalResources ||
      classifiedCount % classifyProgressStride === 0
    ) {
      emitProgress({
        key: "classify-era",
        status: "active",
        detail: `Classifying card data by publish date and payload markers (${classifiedCount}/${totalResources}).`,
      })
    }
  }

  const tasks = uniqueResources.map((resource) => async () => {
    const record = await compileStatsBoardRecord(resource)
    emitClassifyProgress()
    return record
  })

  const records = (await runWithConcurrency(tasks, 5)).filter(Boolean)
  emitProgress({
    key: "classify-era",
    status: "done",
    detail: `Classified ${records.length} cards for analysis using timestamp and payload checks.`,
  })
  emitProgress({
    key: "aggregate",
    status: "active",
    detail: "Building the nominator-era leaderboard and legacy totals.",
  })

  const nominatorMap = new Map()
  const uniqueNominees = new Set()
  const currentRecords = []
  const legacyRecords = []
  let totalConvertedToMinter = 0
  let totalApprovedInvites = 0
  let totalPendingInvites = 0
  let totalKickedAndBanned = 0
  let legacyConvertedToMinter = 0
  let legacyApprovedInvites = 0
  let legacyPendingInvites = 0
  let legacyKickedAndBanned = 0

  for (const record of records) {
    if (record.isLegacy) {
      legacyRecords.push(record)
      if (record.isConverted) {
        legacyConvertedToMinter += 1
      }
      if (record.isApprovedInvite) {
        legacyApprovedInvites += 1
      }
      if (record.isPendingInvite) {
        legacyPendingInvites += 1
      }
      if (record.isKicked || record.isBanned) {
        legacyKickedAndBanned += 1
      }
      continue
    }

    currentRecords.push(record)

    const nomineeKey = record.nomineeAddress || record.nomineeName.toLowerCase()
    if (nomineeKey) {
      uniqueNominees.add(nomineeKey)
    }

    if (record.isConverted) {
      totalConvertedToMinter += 1
    }
    if (record.isApprovedInvite) {
      totalApprovedInvites += 1
    }
    if (record.isPendingInvite) {
      totalPendingInvites += 1
    }
    if (record.isKicked || record.isBanned) {
      totalKickedAndBanned += 1
    }

    const nominatorKey =
      record.nominatorAddress || record.nominatorName.toLowerCase()
    const row =
      nominatorMap.get(nominatorKey) || {
        key: nominatorKey,
        displayName: record.nominatorName || "Unknown",
        address: record.nominatorAddress || "",
        nominationCount: 0,
        convertedCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        kickedCount: 0,
        bannedCount: 0,
        lastNominationAt: 0,
      }

    row.nominationCount += 1
    if (record.isConverted) row.convertedCount += 1
    if (record.isApprovedInvite) row.approvedCount += 1
    if (record.isPendingInvite) row.pendingCount += 1
    if (record.isKicked) row.kickedCount += 1
    if (record.isBanned) row.bannedCount += 1
    row.lastNominationAt = Math.max(row.lastNominationAt, record.createdAt || 0)
    nominatorMap.set(nominatorKey, row)
  }

  const nominators = Array.from(nominatorMap.values())
    .map((row) => ({
      ...row,
      conversionLabel: formatStatsPercent(
        row.nominationCount > 0 ? row.convertedCount / row.nominationCount : 0
      ),
    }))
    .sort((a, b) => {
      if (b.nominationCount !== a.nominationCount) {
        return b.nominationCount - a.nominationCount
      }
      if (b.convertedCount !== a.convertedCount) {
        return b.convertedCount - a.convertedCount
      }
      return b.lastNominationAt - a.lastNominationAt
    })

  emitProgress({
    key: "aggregate",
    status: "done",
    detail: `Built ${nominators.length} nominator rows and ${legacyRecords.length} legacy cards.`,
  })

  return {
    schemaVersion: 1,
    generatedAt: snapshotTimestamp,
    compiledAt: Date.now(),
    generatedBy: {
      name: userState.accountName || "",
      address: userState.accountAddress || "",
    },
    source: {
      prefix: MINTER_STATS_IDENTIFIER_PREFIX,
      cardCount: uniqueResources.length,
      legacyCutoff: NOMINATOR_METHOD_START_TS,
      latestCardTimestamp: uniqueResources.reduce(
        (latestTimestamp, resource) =>
          Math.max(latestTimestamp, getStatsBoardTimestamp(resource)),
        0
      ),
    },
    summary: {
      totalNominations: currentRecords.length,
      uniqueNominators: nominatorMap.size,
      uniqueNominees: uniqueNominees.size,
      totalConvertedToMinter,
      totalApprovedInvites,
      totalPendingInvites,
      totalKickedAndBanned,
      legacyCardCount: legacyRecords.length,
      legacyConvertedToMinter,
      legacyApprovedInvites,
      legacyPendingInvites,
      legacyKickedAndBanned,
      conversionLabel: formatStatsPercent(
        currentRecords.length > 0
          ? totalConvertedToMinter / currentRecords.length
          : 0
      ),
      legacyConversionLabel: formatStatsPercent(
        legacyRecords.length > 0
          ? legacyConvertedToMinter / legacyRecords.length
          : 0
      ),
    },
    nominators,
    legacyCards: legacyRecords,
    cards: currentRecords,
  }
}

const publishStatsSnapshot = async (
  snapshot,
  { publishTimestamp = snapshot?.generatedAt || Date.now() } = {}
) => {
  if (!snapshot) return null
  if (!getStatsBoardCanPublish()) {
    alert("Only Minter Admins and App Admins can publish stats snapshots.")
    return null
  }
  if (!userState.accountName) {
    alert("A registered name is required to publish stats snapshots.")
    return null
  }

  const resource = await buildStatsSnapshotPublishResource(
    snapshot,
    publishTimestamp
  )
  if (!resource) {
    return null
  }

  await publishStatsResources([resource])

  statsBoardState.snapshotResources = []
  statsBoardState.lastLoadedAt = 0
  await fetchLatestPublishedStatsSnapshot(true)
  return resource.identifier
}

const refreshStatsBoardView = async ({ force = false } = {}) => {
  const statusEl = getStatsStatusEl()
  if (statusEl) {
    statusEl.textContent = force
      ? "Refreshing live minting stats, published snapshot, and checkpoint state..."
      : "Loading live minting stats, published snapshot, and checkpoint state..."
  }

  const groupData = await fetchStatsBoardGroupData(force)
  const adminAddressSet =
    groupData?.allAdminAddressSet || groupData?.minterAdminAddressSet || new Set()
  const liveMintingDataPromise = fetchStatsBoardLiveMintingData(force, groupData)
  const resources = await fetchStatsSnapshotResources(force, adminAddressSet)
  const [liveMintingData, snapshot, sourceResource, progressCheckpoint] =
    await Promise.all([
      liveMintingDataPromise,
      fetchLatestPublishedStatsSnapshot(force, adminAddressSet, resources),
      fetchLatestStatsSourceResource(force),
      fetchLatestStatsProgressCheckpoint(force, adminAddressSet),
    ])
  renderStatsLiveMintingSection(liveMintingData)
  renderStatsBoardSnapshot(snapshot, resources)
  renderStatsBoardSyncBanner(
    snapshot,
    sourceResource,
    progressCheckpoint,
    getStatsBoardCanPublish()
  )
  if (
    statsBoardState.compiling ||
    statsCompileModalState.phase === "progress" ||
    statsCompileModalState.phase === "paused" ||
    statsCompileModalState.phase === "error"
  ) {
    renderStatsCompileWorkflowBanner()
  }
}

const setStatsCompileButtonBusy = (busy = false) => {
  const button = document.getElementById("compile-stats-button")
  if (!button) return
  button.disabled = busy
  button.textContent = busy ? "Updating..." : "Update stats"
}

const requestStatsCompilePause = () => {
  if (!statsBoardState.compiling) {
    return
  }
  statsBoardState.pauseRequested = true
  const statusEl = getStatsStatusEl()
  if (statusEl) {
    statusEl.textContent = "Pause requested. The current batch will finish, then a checkpoint will be saved."
  }

  statsCompileModalState.message =
    "Pause requested. The current batch will finish, then a checkpoint will be saved."
  statsCompileModalState.subtitle =
    statsCompileModalState.subtitle ||
    "The compile run will stop at the next safe checkpoint."
  updateStatsCompileProgressModal({
    phase: "progress",
    message: statsCompileModalState.message,
    subtitle: statsCompileModalState.subtitle,
    steps: statsCompileModalState.steps,
  })
}

const compileAndPublishStats = async ({ publishTimestamp = Date.now() } = {}) => {
  if (!getStatsBoardCanPublish()) {
    return
  }

  if (statsBoardState.compiling) {
    return
  }

  statsBoardState.compiling = true
  statsBoardState.pauseRequested = false
  setStatsCompileButtonBusy(true)
  statsCompileModalState.hidden = false

  const statusEl = getStatsStatusEl()
  const modalSteps = buildStatsCompileSteps()
  const applyStepUpdate = (update = {}) => {
    if (!update || !update.key) {
      return
    }

    statsCompileModalState.steps = Array.isArray(statsCompileModalState.steps)
      ? statsCompileModalState.steps
      : modalSteps

    if (typeof setBoardPublishProgressStepStatus === "function") {
      statsCompileModalState.steps = setBoardPublishProgressStepStatus(
        statsCompileModalState.steps,
        update.key,
        update.status || "pending",
        update.detail || null
      )
    }

    if (update.message) {
      statsCompileModalState.message = String(update.message)
    }
    if (update.subtitle) {
      statsCompileModalState.subtitle = String(update.subtitle)
    }
    updateStatsCompileProgressModal({
      phase: statsCompileModalState.phase,
      message: statsCompileModalState.message,
      subtitle: statsCompileModalState.subtitle,
      steps: statsCompileModalState.steps,
    })
  }

  statsCompileModalState.phase = "progress"
  statsCompileModalState.snapshotTimestamp = publishTimestamp
  statsCompileModalState.identifierPreview =
    `${MINTER_STATS_IDENTIFIER_PREFIX}-${publishTimestamp}`
  statsCompileModalState.message = `Updating stats snapshot for ${formatStatsDate(
    publishTimestamp
  )}.`
  statsCompileModalState.subtitle = `Snapshot identifier: ${statsCompileModalState.identifierPreview}.`
  statsCompileModalState.steps = modalSteps
  updateStatsCompileProgressModal({
    phase: "progress",
    message: statsCompileModalState.message,
    subtitle: statsCompileModalState.subtitle,
    steps: statsCompileModalState.steps,
  })
  if (statusEl) {
    statusEl.textContent = "Updating live nomination stats..."
  }

  try {
    applyStepUpdate({
      key: "load-source",
      status: "active",
      detail: "Loading the published card archive.",
    })

    const compiledSnapshot = await buildStatsLiveSnapshot({
      snapshotTimestamp: publishTimestamp,
      onProgress: applyStepUpdate,
    })

    applyStepUpdate({
      key: "publish",
      status: "active",
      detail: `Updating ${compiledSnapshot.summary.totalNominations || 0} nominator-era cards and ${
        compiledSnapshot.summary.legacyCardCount || 0
      } legacy cards.`,
    })

    const publishedIdentifier = await publishStatsSnapshot(compiledSnapshot, {
      publishTimestamp,
    })
    applyStepUpdate({
      key: "publish",
      status: "done",
      detail: `Updated ${publishedIdentifier || "stats snapshot"}.`,
    })
    if (statusEl) {
      statusEl.textContent = "Stats snapshot updated. Refreshing view..."
    }
    applyStepUpdate({
      key: "refresh",
      status: "active",
      detail: "Refreshing the Stats board with the new snapshot.",
    })
    await refreshStatsBoardView({ force: true })
    applyStepUpdate({
      key: "refresh",
      status: "done",
      detail: "Stats board refreshed.",
    })
    statsCompileModalState.phase = "complete"
    statsCompileModalState.message = `Updated ${publishedIdentifier || "the stats snapshot"} at ${formatStatsDate(
      publishTimestamp
    )}.`
    statsCompileModalState.subtitle = `Legacy cards before June 2026 were summarized separately.`
    updateStatsCompileProgressModal({
      phase: "complete",
      message: statsCompileModalState.message,
      subtitle: statsCompileModalState.subtitle,
      steps: statsCompileModalState.steps,
    })
    if (statusEl) {
      statusEl.textContent = `Updated stats snapshot at ${formatStatsDate(publishTimestamp)}.`
    }
  } catch (error) {
    console.error("Unable to update stats:", error)
    statsCompileModalState.phase = "error"
    statsCompileModalState.errorMessage =
      "Unable to update stats right now."
    statsCompileModalState.message =
      "The update workflow hit a problem before the snapshot could be published."
    statsCompileModalState.subtitle = ""
    if (statsCompileModalState.steps.length > 0 && typeof setBoardPublishProgressStepStatus === "function") {
      statsCompileModalState.steps = setBoardPublishProgressStepStatus(
        statsCompileModalState.steps,
        "publish",
        "error",
        "Updating failed."
      )
    }
    updateStatsCompileProgressModal({
      phase: "error",
      message: statsCompileModalState.message,
      subtitle: statsCompileModalState.subtitle,
      errorMessage: statsCompileModalState.errorMessage,
      steps: statsCompileModalState.steps,
    })
    if (statusEl) {
      statusEl.textContent = "Unable to update stats right now."
    }
    alert("Unable to update stats right now. Please try again.")
  } finally {
    statsBoardState.compiling = false
    setStatsCompileButtonBusy(false)
  }
}

const compileStatsProgressRun = async ({
  publishTimestamp = Date.now(),
  resumeCheckpoint = null,
  workflow = "compile",
} = {}) => {
  if (!getStatsBoardCanPublish()) {
    return
  }

  if (statsBoardState.compiling) {
    return
  }

  statsBoardState.compiling = true
  statsBoardState.pauseRequested = false
  setStatsCompileButtonBusy(true)
  const normalizedWorkflow =
    workflow === "validation"
      ? "validation"
      : workflow === "recreate"
      ? "recreate"
      : "compile"

  const statusEl = getStatsStatusEl()
  const modalSteps = buildStatsCompileSteps(normalizedWorkflow)
  const isResumeRun = Boolean(resumeCheckpoint) && normalizedWorkflow !== "validation"
  const resumeSummary = getStatsResumeCheckpointSummary(resumeCheckpoint)
  let session = null

  const applyStepUpdate = (update = {}) => {
    if (!update || !update.key) {
      return
    }

    statsCompileModalState.steps = Array.isArray(statsCompileModalState.steps)
      ? statsCompileModalState.steps
      : modalSteps

    if (typeof setBoardPublishProgressStepStatus === "function") {
      statsCompileModalState.steps = setBoardPublishProgressStepStatus(
        statsCompileModalState.steps,
        update.key,
        update.status || "pending",
        update.detail || null
      )
    }

    if (update.message) {
      statsCompileModalState.message = String(update.message)
    }
    if (update.subtitle) {
      statsCompileModalState.subtitle = String(update.subtitle)
    }
    updateStatsCompileProgressModal({
      phase: statsCompileModalState.phase,
      message: statsCompileModalState.message,
      subtitle: statsCompileModalState.subtitle,
      steps: statsCompileModalState.steps,
    })
  }

  try {
    statsCompileModalState.phase = "progress"
    statsCompileModalState.steps = modalSteps
    statsCompileModalState.errorMessage = ""
    statsCompileModalState.workflow = normalizedWorkflow

    if (isResumeRun) {
      session = hydrateStatsCompileSession(resumeCheckpoint)
      if (!session) {
        throw new Error("Unable to restore the previous compilation checkpoint.")
      }
    } else {
      applyStepUpdate({
        key: "load-source",
        status: "active",
        detail: "Loading the published card archive.",
      })

      const [sourceResources, referenceData] = await Promise.all([
        fetchStatsBoardSourceResources(true),
        fetchStatsBoardGroupData(true),
      ])
      session = createStatsCompileSession({
        snapshotTimestamp: publishTimestamp,
        sourceResources,
        referenceData: {
          minterGroupAddresses: Array.from(
            referenceData?.minterGroupAddressSet || []
          ),
          minterAdminAddresses: Array.from(
            referenceData?.minterAdminAddressSet || []
          ),
        },
      })

      applyStepUpdate({
        key: "load-source",
        status: "done",
        detail: `Loaded ${session.source.cardCount || 0} unique card records.`,
      })
    }

    if (
      !session.referenceData ||
      !Array.isArray(session.referenceData.minterAdminAddresses) ||
      session.referenceData.minterAdminAddresses.length === 0
    ) {
      const referenceData = await fetchStatsBoardGroupData(true)
      session.referenceData = {
        minterGroupAddresses: Array.from(
          referenceData?.minterGroupAddressSet || []
        ),
        minterAdminAddresses: Array.from(
          referenceData?.minterAdminAddressSet || []
        ),
      }
    }

    if (normalizedWorkflow === "validation") {
      session.validationIssueCount = 0
      session.validationIssues = []
    }

    publishTimestamp = Number(session.snapshotTimestamp || publishTimestamp || Date.now())
    statsCompileModalState.snapshotTimestamp = publishTimestamp
    statsCompileModalState.identifierPreview =
      `${MINTER_STATS_IDENTIFIER_PREFIX}-${publishTimestamp}`
    statsCompileModalState.message = isResumeRun
      ? `Resuming stats update for ${formatStatsDate(publishTimestamp)}${
          resumeSummary?.checkpointIdentifier
            ? ` from checkpoint ${resumeSummary.checkpointIdentifier}`
            : ""
        }.`
      : normalizedWorkflow === "validation"
      ? `Validating stats data for ${formatStatsDate(publishTimestamp)}.`
      : normalizedWorkflow === "recreate"
      ? `Re-creating stats data from scratch for ${formatStatsDate(publishTimestamp)}.`
      : `Updating stats snapshot for ${formatStatsDate(publishTimestamp)}.`
    statsCompileModalState.subtitle = isResumeRun
      ? resumeSummary
        ? `Continuing checkpoint ${resumeSummary.checkpointIdentifier || session.progressIdentifier || "Unavailable"} at card ${resumeSummary.nextCardNumber} of ${resumeSummary.total} (${resumeSummary.remaining} remaining).`
        : `Continuing checkpoint ${session.progressIdentifier || "Unavailable"}.`
      : normalizedWorkflow === "validation"
      ? "This audit will not publish any data."
      : `Checkpoint identifier: ${session.progressIdentifier || getStatsCompileProgressIdentifier(publishTimestamp)}.`
    updateStatsCompileProgressModal({
      phase: "progress",
      message: statsCompileModalState.message,
      subtitle: statsCompileModalState.subtitle,
      steps: statsCompileModalState.steps,
    })
    if (statusEl) {
      statusEl.textContent = isResumeRun
        ? resumeSummary
          ? `Resuming checkpoint ${resumeSummary.checkpointIdentifier || session.progressIdentifier || "Unavailable"} at card ${resumeSummary.nextCardNumber} of ${resumeSummary.total} (${resumeSummary.remaining} remaining).`
          : "Continuing a saved stats checkpoint..."
        : normalizedWorkflow === "validation"
        ? "Validating stats data..."
        : normalizedWorkflow === "recreate"
        ? "Re-creating stats data from scratch..."
        : "Updating stats snapshot..."
    }

    if (isResumeRun) {
      applyStepUpdate({
        key: "load-source",
        status: "done",
        detail: `Loaded saved checkpoint for ${session.source.cardCount || 0} cards.`,
      })
      applyStepUpdate({
        key: "classify-era",
        status: "active",
        detail: `Resuming at card ${Math.min(
          (session.nextIndex || 0) + 1,
          session.source.cardCount || 0
        )} of ${session.source.cardCount || 0}.`,
      })
    }

    while (
      !session.completed &&
      !statsBoardState.pauseRequested &&
      (session.nextIndex || 0) < (session.source?.cardCount || 0)
    ) {
      await processStatsCompileBatch(session, {
        onProgress: applyStepUpdate,
        onIssue:
          normalizedWorkflow === "validation"
            ? (issue) => {
                if (!issue) {
                  return
                }
                session.validationIssues = Array.isArray(session.validationIssues)
                  ? session.validationIssues
                  : []
                session.validationIssues.push(issue)
              }
            : null,
      })
      if (!session.completed && !statsBoardState.pauseRequested) {
        await qBoardDelay(0)
      }
    }

    const totalResources = Number(session.source?.cardCount || 0)
    if (normalizedWorkflow === "validation") {
      applyStepUpdate({
        key: "publish",
        status: "active",
        detail: "Loading the latest published stats resources and checkpoint.",
      })
      const validationGroupData = await fetchStatsBoardGroupData(true)
      const verifiedAdminAddressSet =
        validationGroupData?.allAdminAddressSet ||
        validationGroupData?.minterAdminAddressSet ||
        new Set()
      const [verifiedSnapshotResources, verifiedCheckpoint] = await Promise.all([
        fetchStatsSnapshotResources(true, verifiedAdminAddressSet),
        fetchLatestStatsProgressCheckpoint(true, verifiedAdminAddressSet),
      ])
      const validationIssueCount = Math.max(
        Number(session.validationIssueCount || 0),
        Array.isArray(session.validationIssues)
          ? session.validationIssues.length
          : 0
      )
      const validationReport = {
        sourceCount: totalResources,
        compiledCount: Number(session.records?.length || 0),
        currentCount: Number(session.summary?.totalNominations || 0),
        legacyCount: Number(session.summary?.legacyCardCount || 0),
        validationIssueCount,
        verifiedSnapshotCount: Number(verifiedSnapshotResources.length || 0),
        verifiedProgressCheckpoint: Boolean(verifiedCheckpoint && !verifiedCheckpoint.completed),
        verifiedProgressIdentifier: String(
          verifiedCheckpoint?.progressIdentifier || ""
        ).trim(),
        verifiedProgressPublisher: String(
          verifiedCheckpoint?.generatedBy?.name ||
            verifiedCheckpoint?.generatedBy?.address ||
            ""
        ).trim(),
        issueSamples: Array.isArray(session.validationIssues)
          ? session.validationIssues.slice(0, 6)
          : [],
      }

      statsBoardState.latestValidationReport = validationReport
      statsCompileModalState.validationReport = validationReport
      const validationStatusText = validationIssueCount
        ? `Validation finished with ${validationIssueCount} issue(s) to review.`
        : "Validation completed successfully."
      applyStepUpdate({
        key: "publish",
        status: "done",
        detail: validationReport.verifiedProgressCheckpoint
          ? `Verified ${validationReport.verifiedSnapshotCount || 0} admin-published snapshots and a resumable checkpoint.`
          : `Verified ${validationReport.verifiedSnapshotCount || 0} admin-published snapshots.`,
      })
      applyStepUpdate({
        key: "refresh",
        status: "active",
        detail: "Summarizing the validation findings.",
      })
      if (statusEl) {
        statusEl.textContent = validationIssueCount
          ? `Validation finished with ${validationIssueCount} issue(s) to review.`
          : "Validation completed successfully."
      }
      statsCompileModalState.phase = "complete"
      statsCompileModalState.message = validationIssueCount
        ? `Validated ${validationReport.sourceCount} cards with ${validationIssueCount} issue(s) to review.`
        : `Validated ${validationReport.sourceCount} cards successfully.`
      statsCompileModalState.subtitle = validationReport.verifiedProgressCheckpoint
        ? `Verified checkpoint ${validationReport.verifiedProgressIdentifier || "Unavailable"} was published by ${validationReport.verifiedProgressPublisher || "an admin"}.`
        : "No verified resumable checkpoint is currently available."
      updateStatsCompileProgressModal({
        phase: "complete",
        message: statsCompileModalState.message,
        subtitle: statsCompileModalState.subtitle,
        steps: statsCompileModalState.steps,
      })
      applyStepUpdate({
        key: "refresh",
        status: "done",
        detail: validationStatusText,
      })
      await refreshStatsBoardView({ force: true })
      if (statusEl) {
        statusEl.textContent = validationStatusText
      }
      return
    }

    if (session.completed) {
      applyStepUpdate({
        key: "publish",
        status: "active",
        detail:
          normalizedWorkflow === "recreate"
            ? `Re-creating the completed snapshot and checkpoint for ${session.summary.totalNominations || 0} nominator-era cards and ${
                session.summary.legacyCardCount || 0
              } legacy cards.`
            : `Updating the completed snapshot and checkpoint for ${session.summary.totalNominations || 0} nominator-era cards and ${
                session.summary.legacyCardCount || 0
              } legacy cards.`,
      })

      const compiledSnapshot = buildStatsSnapshotFromSession(session)
      session.finalSnapshotIdentifier =
        `${MINTER_STATS_IDENTIFIER_PREFIX}-${publishTimestamp}`
      session.finalPublishedAt = Date.now()
      session.completed = true
      const publishedResources = await publishStatsSnapshotBundle(
        compiledSnapshot,
        session,
        {
          publishTimestamp,
        }
      )

      applyStepUpdate({
        key: "publish",
        status: "done",
        detail:
          normalizedWorkflow === "recreate"
            ? `Re-created ${publishedResources.snapshotIdentifier || "stats snapshot"} and ${
                publishedResources.checkpointIdentifier || "checkpoint"
              }.`
            : `Updated ${publishedResources.snapshotIdentifier || "stats snapshot"} and ${
                publishedResources.checkpointIdentifier || "checkpoint"
              }.`,
      })
      if (statusEl) {
        statusEl.textContent =
          normalizedWorkflow === "recreate"
            ? "Stats data re-created. Refreshing view..."
            : "Stats snapshot and checkpoint updated. Refreshing view..."
      }
      applyStepUpdate({
        key: "refresh",
        status: "active",
        detail: "Refreshing the Stats board with the new snapshot.",
      })
      await refreshStatsBoardView({ force: true })
      applyStepUpdate({
        key: "refresh",
        status: "done",
        detail:
          normalizedWorkflow === "recreate"
            ? "Stats board refreshed after re-creating the data."
            : "Stats board refreshed.",
      })
      statsCompileModalState.phase = "complete"
      statsCompileModalState.message =
        normalizedWorkflow === "recreate"
          ? `Re-created ${publishedResources.snapshotIdentifier || "the stats snapshot"} and ${publishedResources.checkpointIdentifier || "the checkpoint"} at ${formatStatsDate(
              publishTimestamp
            )}.`
          : `Updated ${
              publishedResources.snapshotIdentifier || "the stats snapshot"
            } and ${
              publishedResources.checkpointIdentifier || "the checkpoint"
            } at ${formatStatsDate(publishTimestamp)}.`
      statsCompileModalState.subtitle = `Legacy cards before June 2026 were summarized separately.`
      updateStatsCompileProgressModal({
        phase: "complete",
        message: statsCompileModalState.message,
        subtitle: statsCompileModalState.subtitle,
        steps: statsCompileModalState.steps,
      })
      if (statusEl) {
        statusEl.textContent =
          normalizedWorkflow === "recreate"
            ? `Re-created stats data at ${formatStatsDate(publishTimestamp)}.`
            : `Updated stats snapshot and checkpoint at ${formatStatsDate(
                publishTimestamp
              )}.`
      }
    } else {
      applyStepUpdate({
        key: "publish",
        status: "active",
        detail: `Saving a resumable checkpoint after ${session.nextIndex || 0} of ${totalResources} cards.`,
      })

      session.finalSnapshotIdentifier = ""
      session.finalPublishedAt = 0
      session.completed = false
      await publishStatsCompileCheckpoint(session)

      applyStepUpdate({
        key: "publish",
        status: "done",
        detail: `Saved a resumable checkpoint after ${session.nextIndex || 0} of ${totalResources} cards.`,
      })
      statsCompileModalState.phase = "paused"
      statsCompileModalState.message = `Saved a resumable checkpoint after ${session.nextIndex || 0} of ${totalResources} cards.`
      statsCompileModalState.subtitle = `Checkpoint identifier: ${session.progressIdentifier || "Unavailable"}.`
      updateStatsCompileProgressModal({
        phase: "paused",
        message: statsCompileModalState.message,
        subtitle: statsCompileModalState.subtitle,
        steps: statsCompileModalState.steps,
      })
      if (statusEl) {
        statusEl.textContent = `Saved a resumable checkpoint after ${session.nextIndex || 0} of ${totalResources} cards.`
      }
      await refreshStatsBoardView({ force: true })
      if (statusEl) {
        statusEl.textContent = `Saved a resumable checkpoint after ${session.nextIndex || 0} of ${totalResources} cards.`
      }
    }
  } catch (error) {
    console.error("Unable to update stats:", error)
    statsCompileModalState.phase = "error"
    statsCompileModalState.errorMessage =
      "Unable to update stats right now."
    statsCompileModalState.message =
      "The update workflow hit a problem before the snapshot could be published."
    statsCompileModalState.subtitle = ""
    if (
      statsCompileModalState.steps.length > 0 &&
      typeof setBoardPublishProgressStepStatus === "function"
    ) {
      statsCompileModalState.steps = setBoardPublishProgressStepStatus(
        statsCompileModalState.steps,
        "publish",
        "error",
        "Updating failed."
      )
    }
    updateStatsCompileProgressModal({
      phase: "error",
      message: statsCompileModalState.message,
      subtitle: statsCompileModalState.subtitle,
      errorMessage: statsCompileModalState.errorMessage,
      steps: statsCompileModalState.steps,
    })
    if (statusEl) {
      statusEl.textContent = "Unable to update stats right now."
    }
    alert("Unable to update stats right now. Please try again.")
  } finally {
    statsBoardState.compiling = false
    statsBoardState.pauseRequested = false
    setStatsCompileButtonBusy(false)
  }
}

const continuePreviousStatsCompilation = async () => {
  if (statsBoardState.compiling) {
    return
  }

  const checkpoint =
    statsBoardState.latestProgressCheckpoint ||
    (await fetchLatestStatsProgressCheckpoint(true))

  if (!checkpoint || checkpoint.completed) {
    openStatsCompileModal()
    return
  }

  statsCompileModalState.workflow = "compile"
  statsCompileModalState.hidden = false
  statsCompileModalState.phase = "progress"
  const resumeSummary = getStatsResumeCheckpointSummary(checkpoint)
  statsCompileModalState.snapshotTimestamp =
    Number(checkpoint.snapshotTimestamp || checkpoint.generatedAt || Date.now()) ||
    Date.now()
  statsCompileModalState.identifierPreview =
    `${MINTER_STATS_IDENTIFIER_PREFIX}-${statsCompileModalState.snapshotTimestamp}`
  statsCompileModalState.message = `Resuming the saved stats update for ${formatStatsDate(
    statsCompileModalState.snapshotTimestamp
  )}${
    resumeSummary?.checkpointIdentifier
      ? ` from checkpoint ${resumeSummary.checkpointIdentifier}`
      : ""
  }.`
  statsCompileModalState.subtitle = resumeSummary
    ? `Checkpoint ${resumeSummary.checkpointIdentifier || "Unavailable"} will continue at card ${resumeSummary.nextCardNumber} of ${resumeSummary.total} (${resumeSummary.remaining} remaining).`
    : `Checkpoint identifier: ${checkpoint.progressIdentifier || "Unavailable"}.`
  statsCompileModalState.steps = buildStatsCompileSteps("compile")
  statsCompileModalState.errorMessage = ""
  renderStatsCompileModal()
  await compileStatsProgressRun({
    publishTimestamp: statsCompileModalState.snapshotTimestamp,
    resumeCheckpoint: checkpoint,
    workflow: "compile",
  })
}

const loadStatsPage = async () => {
  if (typeof detachAdminBoardInfiniteScroll === "function") {
    detachAdminBoardInfiniteScroll()
  }
  if (typeof detachMinterBoardInfiniteScroll === "function") {
    detachMinterBoardInfiniteScroll()
  }
  qMintershipActiveBoard = "stats"

  clearQMintershipBodyContent()

  const canPublish = getStatsBoardCanPublish()
  const avatarUrl = `/arbitrary/THUMBNAIL/${userState.accountName}/qortal_avatar`
  const requestedStatsSection = String(qMintershipRouteState.section || "").trim()
  const initialStatsSection = normalizeStatsSectionKey(
    requestedStatsSection || "live"
  )
  const heroRoleChips = []
  if (userState.isAdmin) {
    heroRoleChips.push(`
      <div class="stats-hero-chip stats-hero-chip--role stats-hero-chip--admin">
        App Admin
      </div>
    `)
  }
  if (userState.isMinterAdmin) {
    heroRoleChips.push(`
      <div class="stats-hero-chip stats-hero-chip--role stats-hero-chip--minter">
        Minter Admin
      </div>
    `)
  }

  const mainContent = document.createElement("div")
  mainContent.innerHTML = `
    <div class="stats-board-main mbr-parallax-background cid-ttRnlSkg2R">
      <div class="stats-board-shell">
        <header class="stats-hero">
          <div class="stats-hero-copy">
            <p class="stats-hero-kicker">Nominator intelligence</p>
            <h1>Stats</h1>
            <p class="stats-hero-description">
              A live, readable view of the current MINTER group, historic mintership
              data, and the latest publish snapshot. Live minting stats come first,
              the published long-term views sit in the middle, and publish data lives below.
            </p>
          </div>
          <div class="stats-hero-chip-stack">
            <div class="stats-hero-chip">
              <img src="${avatarUrl}" alt="" class="stats-hero-avatar" />
              <span>${qEscapeHtml(userState.accountName || "Guest")}</span>
            </div>
            ${heroRoleChips.join("")}
            <div class="stats-hero-chip stats-hero-chip--muted">
              Snapshot-driven and public by default
            </div>
          </div>
        </header>

        <div class="stats-actions">
          <button
            type="button"
            id="refresh-stats-button"
            class="stats-action-button"
          >
            Refresh latest snapshot
          </button>
          ${
            canPublish
              ? `<button
                  type="button"
                  id="compile-stats-button"
                  class="stats-action-button stats-action-button--primary"
                >
                  Update stats
                </button>`
              : ""
          }
        </div>

        <p id="stats-status" class="stats-status">
          Loading live minting stats, published snapshot, and checkpoint state...
        </p>

        <div id="stats-sync-banner" class="stats-sync-banner" hidden></div>

        ${buildStatsSectionNavHtml(initialStatsSection)}

        <section id="stats-section-live" class="stats-section">
          <div class="stats-section-header">
            <div>
              <p class="stats-panel-kicker">Live Minting Stats</p>
              <h2>Current MINTER group activity</h2>
            </div>
            <p class="stats-panel-copy">
              Pulled directly from the live Qortal APIs so we can see the current
              MINTER roster, online actual levels, founder accounts, and group
              status at a glance.
            </p>
          </div>
          <section class="stats-summary-grid" id="stats-live-summary-grid"></section>
          <div class="stats-panels-grid">
            <section class="stats-panel stats-panel--wide" id="stats-live-levels-panel">
              <div class="stats-panel-header">
                <div>
                  <p class="stats-panel-kicker">Online levels</p>
                  <h2>Currently online minters by actual level</h2>
                </div>
                <p class="stats-panel-copy">
                  Counts are sourced from <code>/addresses/online/levels</code> and
                  founder accounts are displayed separately below.
                </p>
              </div>
              <div id="stats-live-levels-container"></div>
            </section>

            <section class="stats-panel" id="stats-live-group-panel">
              <div class="stats-panel-header">
                <div>
                  <p class="stats-panel-kicker">MINTER group</p>
                  <h2>Live group details</h2>
                </div>
              </div>
              <div id="stats-live-group-meta-container"></div>
            </section>
          </div>

          <section class="stats-panel stats-panel--wide" id="stats-live-founder-panel">
            <div class="stats-panel-header">
              <div>
                <p class="stats-panel-kicker">Founder accounts</p>
                <h2>Effective level 10 accounts</h2>
              </div>
              <p class="stats-panel-copy">
                These accounts are weighted like level 10 for signing purposes, but
                they are shown separately from the actual level table.
              </p>
            </div>
            <div id="stats-live-founder-container"></div>
          </section>
        </section>

        <section id="stats-section-historic" class="stats-section">
          <div class="stats-section-header">
            <div>
              <p class="stats-panel-kicker">Historic Mintership Data</p>
              <h2>Published long-term stats and leaderboards</h2>
            </div>
            <p class="stats-panel-copy">
              These are the published long-term views: the nominator leaderboard,
              legacy lifecycle data, and current admin-publisher history.
            </p>
          </div>
          <section id="stats-section-nominator" class="stats-section">
            <div class="stats-section-header">
              <div>
                <p class="stats-panel-kicker">Nominator Stats</p>
                <h2>Nominator leaderboard</h2>
              </div>
              <p class="stats-panel-copy">
                The leaderboard below is ranked by nominator-era submissions, then
                conversion count, then recency.
              </p>
            </div>
            <section class="stats-panel stats-panel--wide" id="stats-nominator-leaderboard">
              <div class="stats-panel-header">
                <div>
                  <p class="stats-panel-kicker">Leaderboard</p>
                  <h2>Nominator leaderboard</h2>
                </div>
                <p class="stats-panel-copy">
                  Ranked by nominator-era submissions, then conversion count, then recency.
                </p>
              </div>
              <div id="stats-leaderboard-container"></div>
            </section>
          </section>

          <section id="stats-section-legacy" class="stats-section">
            <div class="stats-section-header">
              <div>
                <p class="stats-panel-kicker">Legacy Stats</p>
                <h2>Legacy publisher lifecycle</h2>
              </div>
              <p class="stats-panel-copy">
                Cards published before June 1, 2026 belong to the legacy flow. We track
                whether the publisher was invited, stayed in the group, or was kicked or banned.
              </p>
            </div>
            <section class="stats-summary-grid" id="stats-legacy-summary-grid"></section>
            <div class="stats-panels-grid">
              <section class="stats-panel stats-panel--wide" id="stats-legacy-leaderboard">
                <div class="stats-panel-header">
                  <div>
                    <p class="stats-panel-kicker">Legacy Leaderboards</p>
                    <h2>Legacy publisher leaderboard</h2>
                  </div>
                  <p class="stats-panel-copy">
                    Ranked by legacy card count, then current group membership, then recency.
                  </p>
                </div>
                <div id="stats-legacy-leaderboard-container"></div>
              </section>

              <section class="stats-panel">
                <div class="stats-panel-header">
                  <div>
                    <p class="stats-panel-kicker">Legacy Notes</p>
                    <h2>Legacy-era summary</h2>
                  </div>
                </div>
                <div id="stats-legacy-meta-container"></div>
              </section>
            </div>
          </section>

          <section id="stats-section-admin" class="stats-section">
            <div class="stats-section-header">
              <div>
                <p class="stats-panel-kicker">Minter Admin Stats</p>
                <h2>Current admin publisher overview</h2>
              </div>
              <p class="stats-panel-copy">
                This view focuses on cards published by the current Minter Admin roster, which gives us a base for later scoring and admin-specific leaderboards.
              </p>
            </div>
            <section class="stats-summary-grid" id="stats-admin-summary-grid"></section>
            <div class="stats-panels-grid">
              <section class="stats-panel stats-panel--wide" id="stats-admin-leaderboard">
                <div class="stats-panel-header">
                  <div>
                    <p class="stats-panel-kicker">MinterAdmin Leaderboards</p>
                    <h2>Admin publisher leaderboard</h2>
                  </div>
                  <p class="stats-panel-copy">
                    Ranked by admin-published card count, then current-era contribution, then recency.
                  </p>
                </div>
                <div id="stats-admin-leaderboard-container"></div>
              </section>

              <section class="stats-panel">
                <div class="stats-panel-header">
                  <div>
                    <p class="stats-panel-kicker">Admin Notes</p>
                    <h2>Current admin roster context</h2>
                  </div>
                </div>
                <div id="stats-admin-meta-container"></div>
              </section>
            </div>
          </section>
        </section>

        <section id="stats-section-publish" class="stats-section">
          <div class="stats-section-header">
            <div>
              <p class="stats-panel-kicker">Publish Data</p>
              <h2>Snapshot metrics, metadata, and history</h2>
            </div>
            <p class="stats-panel-copy">
              The live publish snapshot is grouped here so the headline numbers,
              publish metadata, and recent snapshot history are easy to scan together.
            </p>
          </div>
          <section class="stats-summary-grid" id="stats-summary-grid"></section>
          <div class="stats-panels-grid">
            <section class="stats-panel" id="stats-snapshot-panel">
              <div class="stats-panel-header">
                <div>
                  <p class="stats-panel-kicker">Snapshot</p>
                  <h2>Latest published snapshot</h2>
                </div>
              </div>
              <div id="stats-snapshot-meta"></div>
            </section>

            <section class="stats-panel" id="stats-history-panel">
              <div class="stats-panel-header">
                <div>
                  <p class="stats-panel-kicker">History</p>
                  <h2>Recent snapshots</h2>
                </div>
              </div>
              <div id="stats-history-container"></div>
            </section>
          </div>
        </section>

        <div id="stats-snapshot-container" style="display: none;"></div>
        <div id="stats-board-content"></div>
      </div>
    </div>
  `

  document.body.appendChild(mainContent)

  const refreshButton = document.getElementById("refresh-stats-button")
  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      await refreshStatsBoardView({ force: true })
    })
  }

  const compileButton = document.getElementById("compile-stats-button")
  if (compileButton) {
    compileButton.addEventListener("click", async () => {
      openStatsCompileModal()
    })
  }

  renderStatsSectionNavState(initialStatsSection)

  if (requestedStatsSection) {
    await focusStatsBoardSection(initialStatsSection, { behavior: "auto" })
  } else {
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  await refreshStatsBoardView({ force: true })
}
