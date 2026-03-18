# OpenCalendly FAQ

## What is OpenCalendly?

OpenCalendly is a scheduling app for creating booking pages, sharing available time, and writing confirmed bookings back to connected calendars.

## Do I need to sign in to use OpenCalendly?

If you are the organizer, yes. Signing in gives you access to your workspace, event types, availability settings, calendar integrations, teams, and analytics.

If you are only booking time on someone else's public page, usually no. Public booking pages are meant to work without requiring an account.

## Why does signing in matter?

Signing in lets OpenCalendly keep your scheduling setup private and tied to your account. It also allows the app to securely connect to your calendar providers and manage your bookings.

## Can I sign in with a normal Gmail account?

Yes. A normal Google account can be used for Google sign-in when the app owner has enabled that option.

## Can I sign in with a normal Outlook or Hotmail account?

Yes. A normal Microsoft personal account can be used for Microsoft sign-in when the app owner has enabled that option.

## Do I need my own Google Cloud Console account to use "Sign in with Google"?

No. End users do not need a Google Cloud Console account. Google Cloud configuration is handled by the app owner, not by the person signing in.

## Do I need my own Azure Portal account or credit card to use "Sign in with Microsoft"?

No. End users do not need an Azure Portal account or a credit card. Microsoft app configuration is handled by the app owner, not by the person signing in.

## Is app sign-in the same thing as connecting a calendar?

No. These are separate steps.

- Sign-in creates or restores your OpenCalendly account.
- Calendar connection lets OpenCalendly read busy time from your calendar and write booking events back to it.

You can sign in with email and still connect Google Calendar or Microsoft Calendar later.

## Why connect a calendar?

Connecting a calendar helps OpenCalendly avoid double-booking you. It reads your busy time and treats those periods as unavailable when someone tries to book you.

## How does OpenCalendly decide which slots are bookable?

OpenCalendly combines:

- your availability rules
- availability overrides
- time off
- existing OpenCalendly bookings
- busy time synced from connected calendars

When someone books a slot, OpenCalendly checks availability again before confirming the booking.

## Can I connect more than one calendar?

Today, an organizer can connect:

- one Google account
- one Microsoft account

OpenCalendly does not currently support connecting multiple Google accounts or multiple Microsoft accounts for the same organizer.

## Does OpenCalendly use every calendar inside my Google or Microsoft account?

OpenCalendly currently works with the primary or default calendar for each connected provider account.

## What happens if I connect both Google and Microsoft?

OpenCalendly will:

- use both connected providers as conflict sources for availability
- write the confirmed booking to both connected providers

## Does OpenCalendly sync Google Calendar and Outlook with each other?

No. OpenCalendly does not act as a general calendar-to-calendar sync tool.

Instead, OpenCalendly acts as the scheduling layer:

- it reads busy time from connected calendars
- it creates or updates booking events in connected calendars

If you connect both providers, OpenCalendly writes separate booking events to each one.

## Where does the booked meeting get created?

The booking is first created inside OpenCalendly. After that, OpenCalendly writes the booking out to each connected calendar provider.

## If I disconnect a calendar, what changes?

After disconnecting, OpenCalendly stops using that provider for busy-time sync and future booking writeback. Existing events already written to that provider are not used for ongoing sync once the connection is removed.

## Do invitees need an OpenCalendly account to book me?

Usually no. Invitees can normally open your public booking page, choose a time, and submit their details without creating an OpenCalendly account.

## What is the typical organizer setup flow?

1. Sign in or create an account.
2. Create an event type.
3. Set your availability.
4. Connect Google Calendar, Microsoft Calendar, or both.
5. Sync your calendars.
6. Share your public booking link.
7. Let invitees book available time.

## What is the typical invitee flow?

1. Open the organizer's public booking page.
2. Choose an available slot.
3. Enter booking details.
4. Confirm the booking.
5. Receive confirmation and follow-up details.
