# Study Quest Cloud

Study Quest Cloud is a React + Tailwind + Supabase study gamification dashboard.

## Features

- Email/password sign up and login with Supabase Auth
- User-scoped data with RLS (profiles, habits, study logs, rewards)
- Exam countdown and weekly progress bar
- Daily-reset habit checklist behavior
- Reward vault with priority 1-10 rarity model
- Framer Motion spinner with weighted randomization
- Consolation fact fallback when reward roll misses

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill in your Supabase project values:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

3. Open Supabase SQL Editor and run the SQL in `supabase-schema.sql`.

4. Start the app:

```bash
npm run dev
```

## Schema File

- `supabase-schema.sql`: all table DDL + RLS policies to enforce user-level security.

## Weighted Randomizer

For each reward $i$ with priority $p_i$, the weight is:

$$
Weight_i = \frac{1}{p_i}
$$

Reward probability is:

$$
P(i) = \frac{Weight_i}{\sum_j Weight_j}
$$

If the reward roll misses (based on the hit-rate slider), the spinner returns a consolation fact.
