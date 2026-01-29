# Contributing to Stax

## Stack overview

- **Runtime**: React Native with Expo (SDK 54+)
- **Language**: TypeScript
- **Navigation**: React Navigation (native-stack, bottom-tabs)
- **Storage**: SQLite via Expo SQLite, with a thin repository layer
- **Validation**: Zod for all DTOs and input schemas
- **Charts**: react-native-chart-kit + react-native-svg
- **Payments**: RevenueCat (react-native-purchases)
- **Notifications**: expo-notifications

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Ensure Node 18+ and npm 9+.
3. Start the dev server:
   ```bash
   npm start
   ```
4. Run on iOS simulator: `npm run ios` (or press `i` in the terminal).
5. Run on Android emulator: `npm run android` (or press `a`).

## Folder structure

- `src/app` – Navigation and root layout (tabs, stack).
- `src/components` – Reusable UI primitives (buttons, cards, badges, inputs).
- `src/features/portfolio` – Overview and holdings list screens and logic.
- `src/features/asset` – Add/edit asset flows and holding detail.
- `src/features/analysis` – Pro analysis (exposure, concentration, Stax Score).
- `src/data` – SQLite schema, migrations, and repositories (Portfolio, Holding, PricePoint, Event).
- `src/services` – Pricing provider, RevenueCat, notifications, analytics.
- `src/utils` – Money math, formatting, enums, constants.

Conventions:

- Keep files under ~200 lines; split into sub-components or hooks when larger.
- Put shared UI in `src/components`; feature-specific UI can live in the feature folder.
- Define all DTOs and domain types with Zod; infer TypeScript types from schemas.

## Linting and formatting

```bash
npm run lint      # ESLint
npm run format    # Prettier (if script added)
npx prettier --write "src/**/*.{ts,tsx}"  # Format all
```

## Testing

```bash
npm test          # Run unit and component tests (when configured)
```

- Unit tests for hooks, utilities, and repository helpers.
- Component tests for critical flows (add holding, paywall) with React Native Testing Library or Vitest.
- Target ≥80% coverage on core modules.

## Commits

Use conventional commits (e.g. `feat:`, `fix:`, `chore:`) and keep the CHANGELOG updated for user-facing changes.
