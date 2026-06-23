# Responsive H5 Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the H5 frontend adapt to desktop browser widths while preserving the existing mobile and mini-program experience.

**Architecture:** Replace the current fixed 375px desktop H5 phone frame with a centered responsive web shell. Add a reusable page container and apply it to the core pages first, using Tailwind breakpoint classes for desktop two-column layouts.

**Tech Stack:** Taro, React, Tailwind CSS 4, pnpm, node:test.

---

### Task 1: H5 desktop shell contract

**Files:**
- Modify: `src/presets/h5-styles.ts`
- Test: `src/presets/h5-styles.test.ts`

- [ ] Write a failing test asserting H5 desktop styles no longer force a 375px phone frame and instead expose a max-width responsive shell.
- [ ] Run the focused test and confirm it fails.
- [ ] Export a style builder from `src/presets/h5-styles.ts` and update PC media CSS.
- [ ] Run the focused test and confirm it passes.

### Task 2: Reusable responsive page container

**Files:**
- Create: `src/components/layout/responsive-page.tsx`
- Create: `src/components/layout/responsive-page.test.ts`

- [ ] Write a failing test for the default and narrow variants.
- [ ] Run the focused test and confirm it fails.
- [ ] Add the component with Tailwind-only sizing classes.
- [ ] Run the focused test and confirm it passes.

### Task 3: Core page adoption

**Files:**
- Modify: `src/pages/index/index.tsx`
- Modify: `src/pages/stock/index.tsx`
- Modify: `src/pages/library/index.tsx`
- Modify: `src/pages/analysis/index.tsx`

- [ ] Wrap page bodies in `ResponsivePage`.
- [ ] Convert desktop-capable sections to breakpoint grids.
- [ ] Keep mobile rendering single-column.

### Task 4: Verification

**Commands:**
- `pnpm exec tsx --test src/presets/h5-styles.test.ts`
- `pnpm exec tsx --test src/components/layout/responsive-page.test.ts`
- `pnpm test:prelaunch`
- `pnpm validate`
- `pnpm build:web`
- `pnpm build:weapp`

