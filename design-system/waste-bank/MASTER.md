# Waste Bank Design System

This file describes the implemented school recycling application. Keep it aligned with `src/style.css`; product requirements and tested usability take precedence over generic skill suggestions.

## Audience and purpose

Students submit recycling evidence, check Coins, and redeem rewards. Staff review evidence and manage pickup. Support personal mobile devices and shared school computers. Use clear Thai labels and practical instructions beside the relevant action.

## Colors and typography

| Role           | Value     | Token           |
| -------------- | --------- | --------------- |
| Primary        | `#185c3b` | `--green`       |
| Accent         | `#def69b` | `--lime`        |
| Background     | `#f6f8f4` | root background |
| Text           | `#253c31` | root color      |
| Secondary text | `#536456` | `--muted`       |
| Borders        | `#e0e7de` | `--line`        |

Fonts: Outfit for Latin text, Noto Sans Thai for Thai text, sans-serif fallback. Base size 16px. Mobile content and secondary information should be at least 14px; form inputs use 16px. Compact navigation may use 12px. Check contrast against each actual background; normal text should reach 4.5:1. Use tabular numerals for balances and comparisons.

## Layout and components

- Preserve the green school recycling identity and softly rounded cards.
- On mobile, keep the hero compact and place wallet/reward actions in readable horizontal cards. Avoid decorative English labels that crowd the tasks.
- Staff evidence review uses one column on mobile, with large evidence images and readable metadata.
- Use Lucide icons consistently. Decorative icons should be hidden from assistive technology.
- Touch actions should have at least 44px targets. Provide visible keyboard focus and meaningful button labels.
- Show labels for inputs, useful errors and progress feedback. Keep success/status announcements accessible without announcing a countdown every second.
- Show preparation instructions above evidence upload and explain approval before submission. Do not invent pickup locations or school procedures.
- Identification by student number selects an account; it does not verify the student's identity. Use neutral account-selection wording.

## Shared-device privacy and success screens

Idle logout remains 90 seconds, with a warning and a continue action. After a completed submission or redemption, log out immediately and retain only the success details needed by the student. Clear the result after 60 seconds. Show the countdown and provide an explicit continue action that starts another 60 seconds. Allow copying the pickup code; show a manual fallback if clipboard access fails. Users may return to the home screen immediately.

## Motion and verification

Use short transitions on explicit properties, with `prefers-reduced-motion` support. Do not require animation for immediate feedback.

Check mobile widths 375/390px, tablet 768px, and desktop 1280px or wider. Verify no page overflow, readable Thai wrapping, keyboard access, evidence upload, redemption, countdown renewal, and automatic clearing. Run the existing unit/API tests, production build, and browser regression suite after changes affecting these flows.
