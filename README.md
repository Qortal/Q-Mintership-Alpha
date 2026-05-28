# Q-Mintership-Alpha

Q-Mintership-Alpha is the current version of the Q-Mintership app published on `qortal://APP/Q-Mintership`.

The 'Nominations' branch reflects the nominations-era workflow. The old 'direct request by would-be minter'approach has been replaced by peer nomination.

## Nomination Flow

1. A level 5+ minter publishes a nomination card on the Minter Board.
2. Community members, minters, and Minter Admins can comment and vote on the card.
3. Once the required admin support is reached, a Minter Admin creates a `GROUP_INVITE` for the nominee.
4. Other Minter Admins approve that invite with `GROUP_APPROVAL` transactions.
5. After the invite is approved and no longer pending, the nominee sees the `Join MINTER Group` action.
6. The nominee joins MINTER group `694`, creates a minting key, assigns it to their node, and begins minting.

### Q-Mintership MinterBoard

- Public nomination board for minting candidates.
- Supports comments, voting, invite progress, list mode, and clearer loading/status feedback.
- Cards show both the vote results and the current invite state without losing the underlying nomination data.

### Q-Mintership AdminBoard

- Private, encrypted board for Minter Admin decision-making.
- Used for admin-only discussion and the admin-side actions that support the nomination flow.
- Also supports private removal-related workflows for Minter group members.

### Q-Mintership MAM Board

- The MAM Board, called `ARBoard` in the code, handles proposals that add or remove Minter Admins from the `MINTER` group.
- This keeps admin membership changes separate from the public nomination flow so they can be reviewed on their own track.
- The card styling keeps type coding so the proposal type is easy to scan at a glance.

### Q-Mintership Forum

- Public and private forum for long-form discussion, replies, and attachments.
- The public rooms cover general discussion and minter-focused discussion, while the admin room remains private.
- The forum continues to evolve alongside the board workflows.

#### What Changed Since The Pre-Nominations Version

- Sponsorship and self-sponsorship were replaced by peer nomination.
- The Minter Board now shows a full lifecycle for a nomination, including admin support and invite approval.
- The admin workflow is split between the public nomination board, the private AdminBoard, and the MAM/AR board for admin membership changes.
- The UI has been tightened up for faster loading, clearer list/card views, better invite status feedback, and more useful account details and explorer tools.
- The app now ships with fully local font assets instead of relying on remote font hosting.
- There is now a fully functional 'User Account Details Explorer' showing past transactions, account overview, older 'sponsorship statistics' and more. Allowing for a simpler review by the community and Minter Admins.

#### Additional

Many additional features and functions are planned for Q-Mintership, including some additional near-term changes to include Nominator Statistics and gamification therein to create a 'best nominator' award potential, and more.

Longer-term the plan is to rewrite the app into React + TypeScript, which will make it much faster, easier to work on, and ability to leverage the qapp-core framework, with a component-based development style similar to the other React-based applications on Qortal (`Q-Tube`, `Q-Blog`, `Q-Mail`, and so on).
