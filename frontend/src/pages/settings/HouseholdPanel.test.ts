// @vitest-environment jsdom
//
// HouseholdPanel capability rendering (#935, surface 14): the member list
// always shows role badges; household administration (rename, invite + role
// choice, role picker, remove, edit-other) is owner-only; an editor edits only
// their own profile; a viewer edits nothing.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { household, type HouseholdMember } from '../../api/client'
import HouseholdPanel from './HouseholdPanel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const load = vi.fn()

vi.mock('../../store/useFloreren', () => ({
  useFloreren: Object.assign(
    (selector?: (store: Record<string, unknown>) => unknown) => {
      const store: Record<string, unknown> = { users: [], activeUserId: 1, locations: [] }
      return selector ? selector(store) : store
    },
    { getState: () => ({ load }) },
  ),
}))

vi.mock('../../api/client', () => ({
  household: {
    members: vi.fn(),
    rename: vi.fn(),
    invite: vi.fn(),
    changeRole: vi.fn(),
    removeMember: vi.fn(),
    updateMember: vi.fn(),
  },
  icons: { catalog: vi.fn().mockResolvedValue([]) },
}))

const ownerMember: HouseholdMember = {
  id: 1, name: 'Leon', email: 'owner@example.com', avatar: null,
  created_at: '2026-01-01T00:00:00Z', role: 'owner',
  capabilities: { can_edit: true, can_manage_household: true },
  user_id: 11, is_self: true,
}

const editorMember: HouseholdMember = {
  id: 2, name: 'Lisbeth', email: 'editor@example.com', avatar: null,
  created_at: '2026-01-01T00:00:00Z', role: 'editor',
  capabilities: { can_edit: true, can_manage_household: false },
  user_id: 12, is_self: false,
}

const viewerMember: HouseholdMember = {
  id: 3, name: 'Piet', email: 'viewer@example.com', avatar: null,
  created_at: '2026-01-01T00:00:00Z', role: 'viewer',
  capabilities: { can_edit: false, can_manage_household: false },
  user_id: 13, is_self: false,
}

async function flush() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

describe('HouseholdPanel — capability rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    vi.mocked(household.members).mockResolvedValue([
      structuredClone(ownerMember),
      structuredClone(editorMember),
      structuredClone(viewerMember),
    ])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function render(props: {
    canEdit?: boolean
    canManageHousehold?: boolean
  } = {}) {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(HouseholdPanel, {
        initialName: 'Het huis',
        canEdit: true,
        canManageHousehold: true,
        ...props,
      })))
      await flush()
    })
  }

  function text(): string {
    return container.textContent ?? ''
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('button'))
  }

  it('owner sees role badges plus rename, invite-role choice, role picker, remove and edit on every row', async () => {
    await render()

    expect(text()).toContain('Owner')
    expect(text()).toContain('Editor')
    expect(text()).toContain('Viewer')

    // Rename field + save
    expect(container.querySelector('#household-name')).not.toBeNull()

    // Invite section with role choice
    expect(text()).toContain('Invite as')

    // Role pickers on the non-self, non-owner rows (editor + viewer members)
    const pickers = container.querySelectorAll('[role="group"][title="Change role"]')
    expect(pickers).toHaveLength(2)

    // Edit buttons on every row (owner can edit anyone, including self)
    expect(buttons().filter((b) => b.title?.startsWith('Edit'))).toHaveLength(3)

    // Remove on non-self rows
    expect(buttons().filter((b) => b.title === 'Remove')).toHaveLength(2)
  })

  it('editor sees role badges but no household administration; edit only on own row', async () => {
    // Signed in as the editor: the editor member becomes is_self.
    vi.mocked(household.members).mockResolvedValue([
      structuredClone({ ...ownerMember, is_self: false }),
      structuredClone({ ...editorMember, is_self: true }),
      structuredClone(viewerMember),
    ])
    await render({ canEdit: true, canManageHousehold: false })

    expect(text()).toContain('Owner')
    expect(text()).toContain('Editor')
    expect(text()).toContain('Viewer')

    // No rename input (static read-only name instead)
    expect(container.querySelector('#household-name')).toBeNull()
    // No invite
    expect(text()).not.toContain('Invite as')
    expect(text()).not.toContain('Generate invite code')
    // No role pickers, no remove
    expect(container.querySelector('[title="Change role"]')).toBeNull()
    expect(buttons().filter((b) => b.title === 'Remove')).toHaveLength(0)

    // Exactly one edit button — on the editor's own row
    const editButtons = buttons().filter((b) => b.title?.startsWith('Edit'))
    expect(editButtons).toHaveLength(1)
    expect(editButtons[0].getAttribute('aria-label')).toContain('Lisbeth')
  })

  it('viewer sees role badges and no editable controls at all', async () => {
    // Signed in as the viewer: the viewer member becomes is_self.
    vi.mocked(household.members).mockResolvedValue([
      structuredClone({ ...ownerMember, is_self: false }),
      structuredClone(editorMember),
      structuredClone({ ...viewerMember, is_self: true }),
    ])
    await render({ canEdit: false, canManageHousehold: false })

    expect(text()).toContain('Owner')
    expect(text()).toContain('Editor')
    expect(text()).toContain('Viewer')

    expect(container.querySelector('#household-name')).toBeNull()
    expect(buttons().filter((b) => b.title?.startsWith('Edit'))).toHaveLength(0)
    expect(buttons().filter((b) => b.title === 'Remove')).toHaveLength(0)
    expect(container.querySelector('[title="Change role"]')).toBeNull()
    expect(text()).not.toContain('Invite as')
    expect(text()).not.toContain('Generate invite code')
  })

  it('owner can change a member role through the picker', async () => {
    vi.mocked(household.changeRole).mockResolvedValue({ ...viewerMember, role: 'editor' })
    await render()

    // First picker in DOM order belongs to the editor member (owner row has none).
    const picker = container.querySelector('[title="Change role"]')
    expect(picker).not.toBeNull()
    const viewerButton = Array.from(picker!.querySelectorAll('button'))
      .find((b) => b.textContent === 'Viewer')
    expect(viewerButton).toBeDefined()

    await act(async () => {
      ;(viewerButton as HTMLButtonElement).click()
      await flush()
    })

    expect(household.changeRole).toHaveBeenCalledWith(2, 'viewer')
  })

  it('owner invite sends the chosen role', async () => {
    vi.mocked(household.invite).mockResolvedValue({
      code: 'ABCDEF', expires_at: '2026-02-01T00:00:00Z', role: 'editor',
    })
    await render()

    const editorChoice = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Editor' && b.closest('[role="group"]')?.getAttribute('aria-label') === 'Invite as')
    expect(editorChoice).toBeDefined()

    await act(async () => {
      ;(editorChoice as HTMLButtonElement).click()
    })

    await act(async () => {
      buttons().find((b) => b.textContent === 'Generate invite code')?.click()
      await flush()
    })

    expect(household.invite).toHaveBeenCalledWith('editor')
  })
})
