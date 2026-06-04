/*
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
    const [
      [avatarHtml, nominatorAvatarHtml],
      [nomineeAddressInfo, nominatorAddressInfo],
      canEditCard,
    ] = await Promise.all([
      avatarPromise,
      addressInfoPromise,
      canEditCardPromise,
    ])
    const linksArray = Array.isArray(links) ? links : []
    minterBoardCardDataByIdentifier.set(cardIdentifier, {
      ...cardData,
      nominee: nomineeName,
      nomineeAddress: nomineeAddressValue,
      nominator: nominatorName,
      nominatorAddress: nominatorAddressValue,
      _inviteDisplayStatus: quickInviteDisplayStatus,
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
    const safeCardIdentifier = qEscapeAttr(cardIdentifier)
    const optimisticNotice = cardData._optimisticPending
      ? `<div class="board-progress-muted" style="margin: 0.75em 0; color: #ffd27d;">Published locally. Waiting for QDN indexing.</div>`
      : ""
    const inviteStateSlotHtml = `
      <div
        id="invite-state-slot-${safeCardIdentifier}"
        class="minter-card-invite-state-slot"
        ${invitedText ? "" : 'style="display:none;"'}
      >
        ${invitedText}
      </div>
    `
    const inviteJoinSlotHtml = `
      <div
        id="invite-join-slot-${safeCardIdentifier}"
        class="minter-card-join-slot"
      ></div>
    `
    const groupApprovalSlotHtml = `
      <div
        id="group-approval-slot-${safeCardIdentifier}"
        class="minter-card-approval-slot"
        ${quickGroupApprovalHtml ? "" : 'style="display: none;"'}
      >${quickGroupApprovalHtml}</div>
    `
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
    createModal("group-approval-details")

    const inviteButtonSlotHtml = `
      <div
        id="invite-button-slot-${qEscapeAttr(cardIdentifier)}"
        class="minter-card-invite-slot"
      ></div>
    `
    let inviteHtmlAdd = inviteButtonSlotHtml

    let finalBgColor = bgColor
    const userVoteStateClass = ""
    let invitedText = quickInviteDisplayStatus
      ? buildMinterInviteStatusHtml(quickInviteDisplayStatus, {
          variant: "card",
          cardIdentifier,
          nomineeName: quickNomineeName,
          nomineeAddress: quickNomineeAddressValue || "",
        })
      : "" // for invite status label if found
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

    if (quickInviteDisplayStatus === "invited") {
      finalBgColor = "black"
      inviteHtmlAdd = buildMinterInviteStatusHtml("invited", {
        variant: "card",
        cardIdentifier,
        nomineeName: quickNomineeName,
        nomineeAddress: quickNomineeAddressValue || "",
      })
    } else if (quickInviteDisplayStatus === "kicked") {
      finalBgColor = "rgb(29, 7, 4)"
      inviteHtmlAdd = buildMinterInviteStatusHtml("kicked", {
        variant: "card",
        cardIdentifier,
        nomineeName: quickNomineeName,
        nomineeAddress: quickNomineeAddressValue || "",
      })
    } else if (quickInviteDisplayStatus === "banned") {
      finalBgColor = "rgb(24, 3, 3)"
      inviteHtmlAdd = buildMinterInviteStatusHtml("banned", {
        variant: "card",
        cardIdentifier,
        nomineeName: quickNomineeName,
        nomineeAddress: quickNomineeAddressValue || "",
      })
    } else if (quickInviteDisplayStatus === "existing" || isExistingMinter) {
      finalBgColor = "rgb(99, 99, 99)"
      invitedText = buildMinterInviteStatusHtml("existing", {
        variant: "card",
        cardIdentifier,
        nomineeName: quickNomineeName,
        nomineeAddress: quickNomineeAddressValue || "",
      })
      inviteHtmlAdd = ""
    }

    if (!inviteHtmlAdd) {
      inviteHtmlAdd = inviteButtonSlotHtml
    }

    if (isListMode) {
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
      hasApprovedInvite: false,
      hasPendingInvite: false,
      isExistingMinter,
      inviteStatus: quickInviteDisplayStatus,
      groupApprovalHtml: quickGroupApprovalHtml,
      shareButtonHtml: buildMinterBoardShareLinkButtonHtml({
        cardIdentifier,
        variant: "list",
      }),
      editButtonHtml,
      notificationButtonHtml,
    })
  }

  return `
  <div class="minter-card ${userVoteStateClass}" style="background-color: ${finalBgColor}">
    ${notificationButtonHtml}
    ${quickActionButtonsHtml}
    <div class="minter-card-header">
      ${avatarHtml}
      <h3>${nomineeLinkHtml} - Level ${nomineeLevel}</h3>
      ${identityBoxesHtml}
      ${inviteStateSlotHtml}
      <div class="card-title-box">${safeHeader}</div>
      ${penaltyText}${adjustmentText}${inviteJoinSlotHtml}${groupApprovalSlotHtml}
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
      <button onclick="togglePollDetails('${safeCardIdentifier}')">Display Poll Details</button>
      <div id="poll-details-${safeCardIdentifier}" style="display: none;"
        data-poll-name="${qEscapeAttr(poll || "")}"
        data-nominee-name="${qEscapeAttr(nomineeName || "")}"
        data-card-identifier="${safeCardIdentifier}"
        data-details-loaded="false">
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
  */
}

