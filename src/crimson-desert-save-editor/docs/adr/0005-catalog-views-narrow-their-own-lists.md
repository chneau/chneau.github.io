# Each catalog view narrows its own list

Five views browse the same catalogs — the inventory table, the add-item picker,
the equipment catalog panel, the Abyss Gear picker in the equipment workshop and
the shared browser both pickers render — and an architecture review proposed
collapsing their five filter-and-sort pipelines into one picking module. Read
against the code, most of what such a module would own is already shared: the
predicates are `isAddableItem` and `catalogStackSize` (`lib/item-catalog.ts`),
`abyssGearOptions` and `canSocketGear` (`lib/abyss-gear.ts`), and
`groupRecords`, `stackDonor`, `itemType` and `storageName` (`lib/inventory.ts`);
whether an item is character equipment is a catalog field; and the row shape,
the windowing, the search box and the category counts live once in
`components/catalog-browser.tsx`.

What each view still does for itself is a `filter`, a `sort` by name, and its
own row text: the equipment panel describes a row as its category and compatible
characters and matches the internal name, the picker describes an item as its
item type and key, the workshop matches a gear name, effect and key. That is
five to eight lines of presentation per view, and deleting a module built over
it would hand those lines back to the same components rather than concentrate
anything — so the five lists stay separate, and this decision exists to stop the
next survey from re-proposing them.

Where the duplication was a _decision_ rather than a presentation it did earn a
module: the picker and the mod's cheat set each decided which of the three
shapes adding an item takes, and they answered it differently, so that rule and
the membership question under it live in `lib/add-plan.ts`. The test for the
next candidate is the deletion test, asked of the decision and not of the code:
if what disappears is the same rule stated twice, extract the rule; if it is the
same words written twice, leave it.

Consequences: the row text, the extra field a search box matches and the name
order are each view's own, so a change to one is not a change to all five.
Should an ordering ever have to agree between views — a list order the user can
see and the tests assert — that becomes a rule and moves into one place. Nothing
here is permanent: the module this ADR rejects is a guess about a seam, and two
real callers for a shared narrowing would change the answer.
