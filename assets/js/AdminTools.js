let currentMinterToolPage = "overview" // Track the current page

const loadMinterAdminToolsPage = async () => {
  // Remove all body content except for menu elements
  const bodyChildren = document.body.children
  for (let i = bodyChildren.length - 1; i >= 0; i--) {
    const child = bodyChildren[i]
    if (!child.classList.contains("menu")) {
      child.remove()
    }
  }

  const avatarUrl = `/arbitrary/THUMBNAIL/${userState.accountName}/qortal_avatar`

  // Set the background image directly from a file
  const mainContent = document.createElement("div")
  // In your 'AdminTools' code
  mainContent.innerHTML = `
    <div class="tools-main mbr-parallax-background cid-ttRnlSkg2R">
      <div class="tools-header" style="color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px;">
        
        <div class="user-info" style="border: 1px solid lightblue; padding: 5px; color: lightblue; display: flex; align-items: center; justify-content: center;">
          <img src="${avatarUrl}" alt="User Avatar" class="user-avatar" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 10px;">
          <span>${userState.accountName || "Guest"}'s Admin Tools</span>
        </div>
        
        <div>
          <p style="color:rgba(80, 9, 9, 0.63)"></p>
          <p style="color:rgb(82, 114, 145)"> The approve feature allows invite by name, and shows ALL existing approvals ongoing, whether initiated on this page manually or not. Allowing for easy displaying and approving without loading the MinterBoard and scrolling through cards. </p>
          <p style="font-size: 0.85rem"> This is NOT a substitute for the AdminBoard, as obviously no data regarding the account is published here. However, if you have already read the data there, and wish to see it easily in one place, here, that is fine. It can also obviously be utilized to manually invite users that require such actions to be taken, however, this action as well should be extremely limited in usage, and not leveraged without extensive provided rationale.</p>
        </div>
      </div>
      
      <div id="tools-submenu" class="tools-submenu">
        <div class="tools-buttons" style="display: flex; gap: 1em; justify-content: center;">
          <button id="toggle-blocklist-button" style="background-color:rgba(80, 9, 9, 0.63)"  class="publish-card-button">Add/Remove blockedUsers</button>
          <button id="create-group-invite" class="publish-card-button" style="background-color:rgb(82, 114, 145)">Create and Display Pending Group Invites</button>
        </div>
        
        <div id="tools-window" class="tools-window" style="margin-top: 2em;">
          
          <div id="blocklist-container" class="blocklist-form" style="display: none;">
            <h3 style="margin-top: 0;">Comment Block List</h3>
            <div id="blocklist-display" class="blocklist-display" style="margin-bottom: 1em;"></div>
            
            <input
              type="text"
              id="blocklist-input"
              class="blocklist-input"
              placeholder="Enter name to block/unblock"
              style="margin-bottom: 1em;"
            />
            
            <div class="blocklist-button-container publish-card-form">
              <button id="blocklist-add-button" class="publish-card-button">Add</button>
              <button id="blocklist-remove-button" class="publish-card-button">Remove</button>
            </div>
          </div>

          <div id="invite-container" class="invite-form" style="display: none; flex-direction: column; padding: 0.75em; align-items: center; justify-content: center;">
            
            <!-- Existing pending invites display -->
            <div id="pending-invites-display" class="pending-invites-display" style="margin-bottom: 1em;">
              <!-- We will fill this dynamically with a list/table of pending invites -->
            </div>

            <!-- Input for name/address -->
            <h3 style="margin-top: 0;">Manual Group Invite</h3>
            <input
              type="text"
              id="invite-input"
              class="invite-input"
              placeholder="Enter name or address to invite"
              style="margin-bottom: 1em;"
            />

            <!-- Button to create the invite transaction -->
            <div class="invite-button-container publish-card-form">
              <button id="invite-user-button" class="publish-card-button">Invite User</button>
            </div>
          </div>

          
        </div>
      </div>
    </div>
    `

  document.body.appendChild(mainContent)

  await addToolsPageEventListeners()
}

const addToolsPageEventListeners = async () => {
  document
    .getElementById("toggle-blocklist-button")
    .addEventListener("click", async () => {
      const container = document.getElementById("blocklist-container")
      // toggle show/hide
      container.style.display =
        container.style.display === "none" ? "flex" : "none"

      // if showing, load the block list
      if (container.style.display === "flex") {
        const currentBlockList = await fetchBlockList()
        displayBlockList(currentBlockList)
      }
    })

  document
    .getElementById("blocklist-add-button")
    .addEventListener("click", async () => {
      const blocklistInput = document.getElementById("blocklist-input")
      const nameToAdd = blocklistInput.value.trim()
      if (!nameToAdd) return

      // fetch existing
      const currentBlockList = await fetchBlockList()
      // add if not already in list
      if (!currentBlockList.includes(nameToAdd)) {
        currentBlockList.push(nameToAdd)
      }

      // publish updated
      await publishBlockList(currentBlockList)
      displayBlockList(currentBlockList)
      blocklistInput.value = ""
      alert(`"${nameToAdd}" added to the block list!`)
    })

  // Remove
  document
    .getElementById("blocklist-remove-button")
    .addEventListener("click", async () => {
      const blocklistInput = document.getElementById("blocklist-input")
      const nameToRemove = blocklistInput.value.trim()
      if (!nameToRemove) return

      // fetch existing
      let currentBlockList = await fetchBlockList()
      // remove if present
      currentBlockList = currentBlockList.filter(
        (name) => name !== nameToRemove
      )

      // publish updated
      await publishBlockList(currentBlockList)
      displayBlockList(currentBlockList)
      blocklistInput.value = ""
      alert(
        `"${nameToRemove}" removed from the block list (if it was present).`
      )
    })

  document
    .getElementById("invite-user-button")
    .addEventListener("click", async () => {
      const inviteInput = document.getElementById("invite-input")
      const nameOrAddress = inviteInput.value.trim()
      if (!nameOrAddress) return

      try {
        // We'll call some function handleManualInvite(nameOrAddress)
        await handleManualInvite(nameOrAddress)
        inviteInput.value = ""
      } catch (err) {
        console.error("Error inviting user:", err)
        alert("Failed to invite user.")
      }
    })

  document
    .getElementById("create-group-invite")
    .addEventListener("click", async () => {
      const inviteContainer = document.getElementById("invite-container")
      // Toggle display
      inviteContainer.style.display =
        inviteContainer.style.display === "none" ? "flex" : "none"
      // If showing, load the pending invites
      if (inviteContainer.style.display === "flex") {
        const pendingInvites = await fetchPendingInvites()
        await displayPendingInviteDetails(pendingInvites)
      }
    })
}

const displayBlockList = (blockedNames) => {
  const blocklistDisplay = document.getElementById("blocklist-display")
  if (!blockedNames || blockedNames.length === 0) {
    blocklistDisplay.innerHTML = "<p>No blocked users currently.</p>"
    return
  }
  // Kakashi Note: Block-list entries are escaped before rendering so stored names cannot inject markup into admin tools.
  blocklistDisplay.innerHTML = `
    <ul>
      ${blockedNames.map((name) => `<li>${qEscapeHtml(name)}</li>`).join("")}
    </ul>
  `
}

const fetchPendingInvites = async () => {
  try {
    const { finalInviteTxs, pendingInviteTxs } =
      await fetchAllInviteTransactions()
    return pendingInviteTxs
  } catch (err) {
    console.error("Error fetching pending invites:", err)
    return []
  }
}

const handleManualInvite = async (nameOrAddress) => {
  const addressInfo = await getAddressInfo(nameOrAddress)
  let address = addressInfo.address
  if (addressInfo && address) {
    console.log(`address is ${address}`)
  } else {
    // it might be a Qortal name => getNameInfo
    const nameData = await getNameInfo(nameOrAddress)
    if (!nameData || !nameData.owner) {
      throw new Error(`Cannot find valid address for ${nameOrAddress}`)
    }
    address = nameData.owner
  }

  const adminPublicKey = await getPublicKeyByName(userState.accountName)
  const timeToLive = 864000 // e.g. 10 days in seconds
  const fee = 0.01
  let txGroupId = 694

  // build the raw invite transaction
  const rawInviteTransaction = await createGroupInviteTransaction(
    address,
    adminPublicKey,
    694,
    address,
    timeToLive,
    txGroupId,
    fee
  )

  // sign
  const signedTransaction = await qortalRequest({
    action: "SIGN_TRANSACTION",
    unsignedBytes: rawInviteTransaction,
  })
  if (!signedTransaction) {
    throw new Error(
      "SIGN_TRANSACTION returned null. Possibly user canceled or an older UI?"
    )
  }

  // process
  const processResponse = await processTransaction(signedTransaction)
  if (!processResponse) {
    throw new Error(
      "Failed to process transaction. Possibly canceled or error from Qortal Core."
    )
  }

  alert(
    `Invite transaction submitted for ${nameOrAddress}. Wait for confirmation.`
  )
}

const displayPendingInviteDetails = async (pendingInvites) => {
  const invitesContainer = document.getElementById("pending-invites-display")
  if (!pendingInvites || pendingInvites.length === 0) {
    invitesContainer.innerHTML = "<p>No pending invites found.</p>"
    return
  }

  let approvalSearchResults = []
  // Kakashi Note: Defensive handling avoids Admin Tools crashes when approval history fetch fails.
  try {
    approvalSearchResults = await searchTransactions({
      txTypes: ["GROUP_APPROVAL"],
      confirmationStatus: "CONFIRMED",
      limit: 0,
      reverse: false,
      offset: 0,
      startBlock: 1990000,
      blockLimit: 0,
      txGroupId: 0,
    })
  } catch (err) {
    console.warn(
      "Failed to load approval transactions for pending invites:",
      err
    )
    approvalSearchResults = []
  }

  const approvalsByPendingSignature = new Map()
  for (const approvalTx of approvalSearchResults) {
    const pendingSig = approvalTx.pendingSignature
    if (!pendingSig) continue
    if (!approvalsByPendingSignature.has(pendingSig)) {
      approvalsByPendingSignature.set(pendingSig, [])
    }
    approvalsByPendingSignature.get(pendingSig).push(approvalTx)
  }

  let html = `<h4>Current Pending Invites:</h4><div class="pending-invites-list">`

  for (const inviteTx of pendingInvites) {
    const inviteeAddress = inviteTx.invitee
    const dateStr = new Date(inviteTx.timestamp).toLocaleString()
    let inviteeName = ""
    const txSig = inviteTx.signature
    let creatorName = await getNameFromAddress(inviteTx.creatorAddress)
    if (!creatorName) {
      creatorName = inviteTx.creatorAddress
    }

    try {
      // fetch the name from address, if it fails we keep it blank or fallback to the address
      inviteeName = await getNameFromAddress(inviteeAddress)
      if (!inviteeName || inviteeName === inviteeAddress) {
        inviteeName = inviteeAddress // fallback
      }
    } catch (err) {
      inviteeName = inviteeAddress // fallback if getName fails
    }

    const approvals = approvalsByPendingSignature.get(txSig) || []

    const { tableHtml, approvalCount = approvals.length } =
      await buildApprovalTableHtml(approvals, getNameFromAddress)
    const finalTable =
      approvals.length > 0 ? tableHtml : "<p>No Approvals Found</p>"

    // Kakashi Note: Invite values are escaped before insertion to prevent UI injection from transaction fields.
    html += `
      <div class="invite-item">
        <div class="invite-top-row">
          <span><strong>Invite Tx</strong>:<p style="color:lightblue"> ${qEscapeHtml(
            inviteTx.signature.slice(0, 8)
          )}...</p></span>
          <span> <strong>Invitee</strong>:<p style="color:lightblue"> ${qEscapeHtml(
            inviteeName
          )}</p></span>
          <span> <strong>Date</strong>:<p style="color:lightblue"> ${qEscapeHtml(
            dateStr
          )}</p></span>
          <span> <strong>CreatorName</strong>:<p style="color:lightblue"> ${qEscapeHtml(
            creatorName
          )}</p></span>
          <span> <strong>Total Approvals</strong>:<p style="color:lightblue"> ${approvalCount}</p></span>
          
        </div>
        <!-- Next line for approvals -->
        <div class="invite-approvals">
          <strong>Existing Approvals:</strong>
          ${finalTable}
        </div>
        <button
            class="approve-invite-list-button"
            onclick="handleGroupApproval('${inviteTx.signature}')"
          >
            Approve Invite
          </button>
      </div>
    `
  }

  html += "</div>"
  invitesContainer.innerHTML = html
}
