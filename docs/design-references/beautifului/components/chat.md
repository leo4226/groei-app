# Chat

- **Stable ID:** `bui.chat`
- **Source:** [Beautiful UI — Chat](https://www.beautifului.dev/#chat-composer)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** combines tabbed conversations, response stages, and a message composer in one compact panel.

## Anatomy and states

- **Observed upstream:** conversation tabs, action icons, user prompt, response blocks with stage/time labels, and disabled/enabled send control.
- **Observed upstream:** tab switching changes context; composer availability changes with input state.
- **Inferred:** a conversation needs clear pending, complete, error, and retry states per response.

## Accessibility and motion

- **Observed upstream:** tabs and a text input are visible controls.
- **Inferred:** implement the tab pattern semantically, label icon actions, and preserve focus when new messages arrive.
- **Not verified:** message announcements, scroll-follow behaviour, and mobile composer handling.

## Possible Floreren use

- **Inferred:** the planned Stekkie assistant may benefit from a compact conversational history, if its issue defines that surface.

## Adaptation and cautions

- **Floreren decision:** do not implement chat from this note alone. Use Floreren’s typed proposal and confirmation rules for every write.
- **Caution:** do not expose model reasoning labels as proof, nor create tabs if a single conversation is sufficient.
