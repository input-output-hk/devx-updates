# Community Bounty Program: How It Works (DRAFT)

Status: draft for internal review. Items marked [TBD] still need a decision.

## 1. Summary

As part of the DevX treasury proposal (milestone DX.06, due 30 November 2026), IO will pay bounties to open-source maintainers and contributors who fix the biggest pain points in Cardano developer tools and libraries.

The total pool is 50,000 USD. Bounties run on GitHoney (githoney.io), a GitHub app backed by an open-source on-chain escrow contract. Each bounty is attached to a GitHub issue, the reward is locked on-chain when the bounty is created, and the contributor is paid after the project's maintainer merges their pull request.

IO pays the bounties first, from its own funds. IO then claims the amount back from Intersect as part of the DX.06 milestone, using the list of paid bounties as evidence.

## 2. How the money flows

1. IO moves funds into a dedicated Bounty Pool wallet.
2. For each approved bounty, IO locks the reward in GitHoney's on-chain escrow.
3. When the pull request is merged, the contributor claims the reward (95% of it). GitHoney keeps a 5% fee plus a 2 ADA creation fee.
4. If a bounty is cancelled or expires, the full deposit returns to the Bounty Pool wallet, minus the 2 ADA creation fee.
5. At the DX.06 milestone, IO submits the bounty list with on-chain transaction links to Intersect and the third-party assurer. After sign-off, Intersect releases the milestone payment to IO through its treasury contracts.

Budget notes:

- The pool is set in USD (50,000 USD). Bounties will be paid in either ADA or a USD stablecoin; this is not decided yet [TBD]. If we pay in ADA, we convert at the ADA price on the day each bounty is funded (at the proposal's reference rate of 0.24 USD per ADA, the pool equals about ₳208,000). If we pay in a stablecoin, no conversion is needed and contributors are protected from ADA price changes.
- The 50,000 USD covers GitHoney fees. To pay a contributor a net amount, we post that amount divided by 0.95.
- IO only claims back what it actually spent. Any unused budget is not claimed and stays in the Treasury, in line with the proposal's refund conditions.

## 3. Bounty lifecycle

Step 1: Choose the work. The program lead picks issues from the ecosystem tooling map built during Community Alignment. We focus on the biggest pain points, such as on-chain/off-chain interaction, hard-fork readiness, and serialization. The project's maintainer must confirm on the issue that they want the change and will review it. Without that confirmation, we don't post a bounty.

Step 2: Prepare the issue. The issue must state the problem, the acceptance criteria, and a clear definition of done. We set the reward using the sizing guide in section 6.

Step 3: Install GitHoney. The project's GitHub organization installs the GitHoney app on the repository. We can't do this for them.

Step 4: Approve the spend. The bounty is approved according to section 7 and recorded in the bounty register before anything is posted.

Step 5: Create and fund the bounty. The IO program GitHub account posts the create-bounty command on the issue. GitHoney requires a minimum reward of 10 ADA and a minimum duration of 5 days. An authorized signer then signs the deposit transaction from the Bounty Pool wallet, which locks the reward in escrow.

Step 6: A contributor accepts. The first contributor to post the accept-bounty command gets the bounty. They give the Cardano address the reward will be paid to. This is when our recipient check starts (section 5).

Step 7: The contributor delivers. The contributor opens a pull request and links it to the bounty.

Step 8: The maintainer accepts the work. The project's maintainer reviews the pull request as usual. Merging it is the acceptance. Maintainers agree to wait for our "check cleared" label before merging a bounty pull request.

Step 9: Payment. After the merge, GitHoney marks the bounty as complete and the contributor claims the reward from the address they gave in step 6.

Step 10: Cancellation. If the deadline passes, the contributor fails the recipient check, or the work stalls, we ask GitHoney to close the bounty. The deposit returns to the Bounty Pool wallet, and we can post the bounty again.

Points to keep in mind:

- GitHoney's admin key triggers both payment and cancellation. The contract guarantees the funds can only go to us or to the assigned contributor, but we rely on GitHoney to act quickly when we ask them to cancel a bounty. We should agree a response time with them [TBD].
- The payout address is fixed when the contributor accepts the bounty. A merge is only possible before the deadline, so durations must leave time for review and the recipient check.
- GitHoney currently supports ADA rewards only. Its contract is designed to hold other Cardano tokens, so stablecoin rewards may be possible, but we need to confirm this with GitHoney. If they can't support a stablecoin in time, we would either pay in ADA or pay stablecoin bounties directly from the Bounty Pool wallet, following the same steps and approvals.
- Every bounty also locks a small amount of ADA alongside the reward, as the Cardano network requires. This applies even when the reward is a stablecoin and is returned when the bounty closes.

## 4. Who can receive a bounty

Anyone can receive a bounty if they pass the recipient check in section 5 and accept the bounty terms in section 9.

The following people are excluded:

- IO employees and contractors paid through this proposal.
- People or entities on a sanctions list or located in a sanctioned country.

A maintainer may receive a bounty for work on their own project, but a different maintainer must review and merge the work. If there is no other maintainer, IO reviews it before the merge.

## 5. Recipient checks

IO is paying out its own funds, which come from the Cardano Treasury, so we have to make sure we don't pay sanctioned people or addresses. That is a legal requirement for IO and can't be waived. However, it does not have to mean full KYC with ID documents. We propose the lightest process that still meets IO's obligations, and IO Legal must confirm it [TBD].

Proposed approach:

- Basic check for every recipient. The recipient gives their name (or company name) and country, and proves they control the payout address by signing a short message with their wallet that includes their GitHub username and the bounty ID. We screen the name against sanctions lists and the address with a wallet-screening tool. This takes the recipient a few minutes and needs no ID documents.
- Full check above a threshold. Only recipients whose total bounties exceed [TBD] USD go through full identity verification with documents.
- Reuse existing checks. Teams that are already IO vendors, or that have already passed KYC with Intersect or Catalyst, don't need to repeat it, if Legal agrees.

Timing: wherever possible, we check known maintainers and teams before we post the bounty. For open bounties, the contributor completes the check after accepting, and the maintainer only merges once we mark the pull request as cleared. If someone doesn't pass or doesn't complete the check within [TBD] days, we cancel the bounty and post it again.

Privacy: IO Compliance keeps check results privately. We never publish personal data. The public register only shows GitHub username, amount, status, and transaction links.

## 6. Sizing guide

Small (bug fix or documentation fix with tests): [TBD] USD.

Medium (contained feature or non-trivial fix): [TBD] USD.

Large (multi-PR or cross-library work): [TBD] USD. Large work should be split into several smaller bounties where possible.

Within each size, we adjust the amount for impact (how many developers are affected), the maintainer's priority, and the expertise needed.

## 7. Who can authorize and sign

On the Intersect side, the treasury contracts are controlled by Intersect's multisig rules described in the proposal, with checks by an independent Oversight Committee. Intersect releases the milestone payment to IO after the third-party assurer signs off DX.06 [assurer TBD, Dquadrant proposed].

On the IO side, we propose the following (to be confirmed by IO Finance):

- Funding the Bounty Pool wallet: proposed by the program lead, approved by the budget owner [TBD], signed by IO Finance [TBD].
- Creating and funding a bounty up to [TBD] USD: approved by the program lead and signed by a Bounty Pool signer.
- Creating and funding a bounty above [TBD] USD: also needs budget owner approval.
- Clearing a recipient check: IO Compliance [TBD].
- Cancelling a bounty: requested by the program lead and executed by GitHoney.
- Accepting the work: the project's maintainer, by merging the pull request.

Bounty Pool wallet: GitHoney's deposit page needs a standard browser wallet to sign, so it probably won't work with a multisig wallet. We propose a single-signer Bounty Pool wallet that only holds a small amount at a time (for example one month of planned bounties), topped up from an IO multisig wallet. This limits the loss if the key is ever compromised. We will confirm with GitHoney whether multisig funding is possible.

## 8. Tracking and reporting

We keep a bounty register with one row per bounty. Each row has the issue link, project, size, amount, approval reference, funding transaction, contributor's GitHub username, check status, pull request link, payment or cancellation transaction, and current status.

A public version of the register, without check details, is published on the DevX progress site. It serves as DX.06 evidence: a list of created bounties and their current state, showing that funded bounties are locked and either paid or available to participants.

Each month, and at the end of the program, we reconcile the Bounty Pool wallet. The final reconciliation is the basis for IO's claim to Intersect.

## 9. Bounty terms

We will publish short terms with the program, reviewed by IO Legal [TBD]. They cover:

- Eligibility and the recipient check.
- Payment only on merge, and only to the address that passed the check.
- One contributor per bounty, on a first come, first served basis.
- IO's right to cancel a bounty before the merge.
- The contributor's responsibility for their own taxes.
- Licensing of contributions under the project's license.
- No employment relationship.

## 10. Open questions

1. Reward amounts for each size.
2. IO Legal confirmation of the light recipient check, the threshold for a full check, and the screening tools to use.
3. Names of the approvers and signers, and the approval threshold.
4. Payment currency: ADA or a USD stablecoin, and which stablecoin.
5. Questions for GitHoney: whether they support stablecoin rewards, how fast they cancel bounties on request, whether they support multisig funding, and whether we can limit who may accept a bounty.
6. Confirmation from Intersect that IO can pay bounties first and claim the amount back at the DX.06 milestone.
