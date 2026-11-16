---
name: ReMarket Admin Workspace
colors:
  surface: '#f1fcf2'
  surface-dim: '#d1ddd3'
  surface-bright: '#f1fcf2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ebf7ed'
  surface-container: '#e5f1e7'
  surface-container-high: '#e0ebe1'
  surface-container-highest: '#dae5dc'
  on-surface: '#141e18'
  on-surface-variant: '#3e4a3e'
  inverse-surface: '#28332c'
  inverse-on-surface: '#e8f4ea'
  outline: '#6e7a6d'
  outline-variant: '#bdcabb'
  surface-tint: '#006d30'
  primary: '#006c2f'
  on-primary: '#ffffff'
  primary-container: '#07883e'
  on-primary-container: '#fefffa'
  inverse-primary: '#70dd87'
  secondary: '#066d33'
  on-secondary: '#ffffff'
  secondary-container: '#9af4aa'
  on-secondary-container: '#107237'
  tertiary: '#54605a'
  on-tertiary: '#ffffff'
  tertiary-container: '#6c7972'
  on-tertiary-container: '#ffffff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#8cfaa1'
  primary-fixed-dim: '#70dd87'
  on-primary-fixed: '#00210a'
  on-primary-fixed-variant: '#005322'
  secondary-fixed: '#9cf6ad'
  secondary-fixed-dim: '#81da93'
  on-secondary-fixed: '#00210b'
  on-secondary-fixed-variant: '#005224'
  tertiary-fixed: '#d9e6de'
  tertiary-fixed-dim: '#bdcac2'
  on-tertiary-fixed: '#131e19'
  on-tertiary-fixed-variant: '#3e4944'
  background: '#f1fcf2'
  on-background: '#141e18'
  surface-variant: '#dae5dc'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  stat-kpi:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  margin: 1.75rem
  space-2xs: 0.25rem
  space-xs: 0.375rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style
The design system reflects a modern, utilitarian marketplace administration console. Designed for marketplace operators, moderators, and support personnel, it emphasizes clarity, calm productivity, and structural discipline.

The aesthetic is Modern Minimalist Corporate with soft tactile influences. Dense operational data is structured using quiet, off-white background canvases, crisp card containment, low-contrast hairline borders, and emerald green brand focal points. The interface evokes trust, deliberate focus, and efficiency, stripping away superfluous ornamentation in favor of purposeful spacing, legible tabular records, and direct interactive affordances.

## Colors
The color palette pairs a clinical deep forest dark navigation environment with an ultra-light canvas for dense day-to-day operations.

- **Primary Emerald (`#07883E`)**: Deployed strategically for high-priority interactive touchpoints, primary push buttons, active navigation states, checked states, and positive resolution badges.
- **Surface & Hierarchy**: The application canvas utilizes `#F8FAF9` to prevent visual glare while ensuring pure `#FFFFFF` data cards pop with crisp delineation. The primary sidebar uses `#11261D` to create solid structural grounding.
- **Borders & Dividers**: Hairline separations use `#E5EBE7`, providing structural clarity without dominating the visual plane.
- **Status Accents**: Clear, purposeful functional signals using `#E5484D` for rejections or critical tickets, and `#F4A340` for pending approvals and items awaiting attention.

## Typography
Typographic rhythm relies exclusively on Inter to deliver rigorous tabular alignment and reliable legibility across dense data tables, parameter labels, and status dashboards.

- **KPI Metric Numbers**: Rendered at `stat-kpi` (26px Bold) to immediately surface critical marketplace operational metrics.
- **Hierarchy & Tracking**: Negative letter-spacing is applied to larger headlines and numbers (`-0.01em` to `-0.02em`) to keep text tight and authoritative. Small tags, badge labels, and sidebar headers use neutral or slightly open tracking (`0.01em` to `0.02em`) with medium-to-bold weights for rapid scanning.
- **Numbers & Data Fields**: Use tabular figures (`font-variant-numeric: tabular-nums`) across all table cells, timestamps, ID codes, and currency amounts to guarantee clean vertical column alignment.

## Layout & Spacing
The layout follows a persistent multi-tier admin scaffold: a fixed-width dark sidebar (`260px`), an upper contextual utility header (`64px`), and a fluid content canvas wrapped with consistent `margin` spacing (`1.75rem`).

- **Grid Systems**: Metric cards and filter panels adhere to a dynamic 12-column responsive grid with a standard `1.25rem` (`gutter`) column separation.
- **Component Density**: Card interiors deploy `space-xl` (`1.5rem`) for perimeter breathing room, reducing to `space-md` (`0.75rem`) within table cells to preserve dense vertical scannability.
- **Responsive Adaptations**: On screen widths below `1024px`, the primary navigation collapses into a slide-over drawer, and metric card grids reflow from a 4-column arrangement to a 2-column or stacked layout.

## Elevation & Depth
The system employs low-contrast outlines coupled with soft, ultra-diffused ambient drop shadows to deliver a calm, distraction-free environment.

- **Flat Baseline Cards**: Data panels, search groups, and content modules sit directly on the `#F8FAF9` workspace canvas, framed by a single 1px hairline border (`#E5EBE7`). Default drop shadows are extremely subtle: `0 1px 3px rgba(23, 33, 27, 0.04)`.
- **Active & Interactive Elevation**: On hover or active state changes, interactive card blocks transition smoothly to a lifted elevation: `0 4px 12px rgba(7, 136, 62, 0.06), 0 1px 3px rgba(23, 33, 27, 0.04)`.
- **Flyouts & Dropdowns**: Modals, filter sheets, and select menus leverage elevated containment: `0 8px 24px rgba(17, 38, 29, 0.12)` paired with `#FFFFFF` backgrounds and hairline `#E5EBE7` containment boundaries.

## Shapes
A roundedness level of `2` provides balanced visual comfort:

- **Cards & Data Containers**: Formed with 12px to 16px corner radii (`rounded-lg` / `rounded-xl`), creating friendly yet disciplined frames around content groupings.
- **Controls & Form Inputs**: Search fields, select dropdowns, and button containers standardize on an 8px to 10px corner radius (`rounded-md` / `rounded-lg`).
- **Pill Badges & Counters**: Status badges, counter tags, and avatar placeholders use fully rounded geometry (`rounded-full`) to immediately signal category metadata and count indicators.

## Components

### Buttons
- **Primary**: Background `#07883E`, text `#FFFFFF`, border none, 8px border-radius, font size 14px (medium weight). Hover: `#066D33`. Focus: ring 3px `#07883E` with 20% opacity.
- **Secondary / Action**: Background `#FFFFFF`, text `#07883E`, border 1px solid `#E5EBE7`, 8px border-radius. Hover: background `#EAF7EF`, border-color `#07883E`.
- **Outlined Utility**: Background `#FFFFFF`, text `#17211B`, border 1px solid `#E5EBE7`. Hover: background `#F8FAF9`.

### Chips & Badges
- **Status Badges**: Pill-shaped (`rounded-full`), padding 4px 10px, typography `label-sm`.
  - *Pending / Chờ duyệt*: Background `#FEF7EC`, text `#B26A00`.
  - *Active / Hoạt động*: Background `#EAF7EF`, text `#07883E`.
  - *Rejected / Đã ẩn*: Background `#FDF2F2`, text `#E5484D`.
- **Notification Counter**: Background `#F4A340` or `#EAF7EF`, typography `label-sm`, circular or rounded pill, high-contrast text.

### Form Inputs & Search Bars
- Standard height 40px, background `#FFFFFF`, border 1px solid `#E5EBE7`, 8px border-radius, font size 14px.
- Integrated search bars feature an attached primary square search button (`#07883E`) with a centered icon, or an internal muted search icon (`#68746D`).
- Focus state: border-color `#07883E` with `box-shadow: 0 0 0 3px rgba(7, 136, 62, 0.15)`.

### Data Tables
- Headers: Background `#FAFCFB`, uppercase or sentence case text in `#68746D`, font size 12px, weight 600, padding 12px 16px, bottom border 1px solid `#E5EBE7`.
- Rows: Background `#FFFFFF`, text `#17211B`, padding 14px 16px, border-bottom 1px solid `#F0F4F2`. Hover state: `#F8FAF9`.
- Row Actions: Right-aligned outline button ("Xem", "Xem xét") with 8px radius and subtle emerald hover.

### Metric Stat Cards
- Container: Background `#FFFFFF`, 14px border radius, 1px solid `#E5EBE7`, padding 20px.
- Layout: Top header displaying metric name (`#68746D`) alongside a tinted square or circular icon badge (`#EAF7EF` surface, `#07883E` icon). Large stat KPI value below, accompanied by secondary contextual change notes.